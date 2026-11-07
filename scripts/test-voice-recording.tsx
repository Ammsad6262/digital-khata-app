/**
 * Voice recording pipeline — Stage 0 / Stage 1 benchmark.
 *
 * Run: npx tsx scripts/test-voice-recording.tsx
 *
 * Why this exists:
 *   The existing voice tests are text-only. They cannot see the microphone
 *   lifecycle, the browser SpeechRecognition lifecycle, timers, silence
 *   handling, or MediaRecorder. This harness renders the REAL hooks in a
 *   jsdom DOM with deterministic fake browser APIs and a fake clock.
 *
 *   It is deliberately dependency-light: jsdom + the project's existing
 *   `tsx` runner. No test framework, no network, no real microphone.
 *
 * Stage 0: run this against the original hooks to record the baseline.
 * Stage 1: run the same suite against the fixed hooks; every check must pass.
 */

import { JSDOM } from "jsdom";
import React, { act } from "react";

// ────────────────────────────────────────────────────────────────────────────
// DOM setup (must happen before react-dom/client renders)
// ────────────────────────────────────────────────────────────────────────────

const dom = new JSDOM(
  "<!doctype html><html><body><div id=\"root\"></div></body></html>",
  { url: "http://localhost:3000", pretendToBeVisual: true },
);
const win = dom.window as unknown as Window & typeof globalThis;

const g = globalThis as unknown as Record<string, unknown>;
g.window = win;
g.document = win.document;
g.HTMLElement = win.HTMLElement;
g.Event = win.Event;
g.CustomEvent = win.CustomEvent;
g.MessageChannel = win.MessageChannel;
g.Blob = win.Blob;
g.FileReader = win.FileReader;
g.DOMException = win.DOMException;
g.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, "navigator", {
  value: win.navigator,
  configurable: true,
});

if (!("btoa" in globalThis)) {
  (globalThis as unknown as { btoa: (s: string) => string }).btoa = (s: string) =>
    Buffer.from(s, "binary").toString("base64");
}

// jsdom's Blob does not always implement arrayBuffer(); the assistant hook
// needs it for base64 conversion.
if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = async function arrayBuffer(this: Blob) {
    const buf = Buffer.from(await this.text(), "utf8");
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Fake clock
// ────────────────────────────────────────────────────────────────────────────

type Timer = { at: number; fn: () => void; interval: number | null };

class FakeClock {
  private time = 0;
  private nextId = 1;
  private timers = new Map<number, Timer>();

  now() {
    return this.time;
  }

  setTimeout = (fn: () => void, ms = 0): number => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + Math.max(0, ms), fn, interval: null });
    return id;
  };

  clearTimeout = (id: unknown): void => {
    if (id !== null && id !== undefined) this.timers.delete(Number(id));
  };

  setInterval = (fn: () => void, ms = 0): number => {
    const id = this.nextId++;
    const every = Math.max(1, ms);
    this.timers.set(id, { at: this.time + every, fn, interval: every });
    return id;
  };

  clearInterval = (id: unknown): void => this.clearTimeout(id);

  tick(ms: number) {
    const end = this.time + Math.max(0, ms);
    let guard = 0;
    while (guard++ < 10000) {
      let nextId: number | null = null;
      let nextTimer: Timer | null = null;
      for (const [id, timer] of this.timers) {
        if (timer.at > end) continue;
        if (!nextTimer || timer.at < nextTimer.at) {
          nextId = id;
          nextTimer = timer;
        }
      }
      if (nextId === null || !nextTimer) break;
      this.time = nextTimer.at;
      if (nextTimer.interval) nextTimer.at += nextTimer.interval;
      else this.timers.delete(nextId);
      nextTimer.fn();
    }
    this.time = end;
  }

  pending() {
    return this.timers.size;
  }
}

let clock = new FakeClock();
const realDateNow = Date.now;
const realWindowSetTimeout = win.setTimeout;
const realWindowClearTimeout = win.clearTimeout;
const realWindowSetInterval = win.setInterval;
const realWindowClearInterval = win.clearInterval;
const realGlobalSetTimeout = globalThis.setTimeout;
const realGlobalClearTimeout = globalThis.clearTimeout;
const realGlobalSetInterval = globalThis.setInterval;
const realGlobalClearInterval = globalThis.clearInterval;

function installClock() {
  clock = new FakeClock();
  Date.now = () => clock.now();
  win.setTimeout = clock.setTimeout as unknown as typeof win.setTimeout;
  win.clearTimeout = clock.clearTimeout as unknown as typeof win.clearTimeout;
  win.setInterval = clock.setInterval as unknown as typeof win.setInterval;
  win.clearInterval = clock.clearInterval as unknown as typeof win.clearInterval;
  (globalThis as unknown as Record<string, unknown>).setTimeout = clock.setTimeout;
  (globalThis as unknown as Record<string, unknown>).clearTimeout = clock.clearTimeout;
  (globalThis as unknown as Record<string, unknown>).setInterval = clock.setInterval;
  (globalThis as unknown as Record<string, unknown>).clearInterval = clock.clearInterval;
}

function restoreClock() {
  Date.now = realDateNow;
  win.setTimeout = realWindowSetTimeout;
  win.clearTimeout = realWindowClearTimeout;
  win.setInterval = realWindowSetInterval;
  win.clearInterval = realWindowClearInterval;
  (globalThis as unknown as Record<string, unknown>).setTimeout = realGlobalSetTimeout;
  (globalThis as unknown as Record<string, unknown>).clearTimeout = realGlobalClearTimeout;
  (globalThis as unknown as Record<string, unknown>).setInterval = realGlobalSetInterval;
  (globalThis as unknown as Record<string, unknown>).clearInterval = realGlobalClearInterval;
}

// ────────────────────────────────────────────────────────────────────────────
// Fake SpeechRecognition
// ────────────────────────────────────────────────────────────────────────────

type ResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: { transcript: string; confidence: number };
};

function makeResult(text: string, isFinal: boolean): ResultLike {
  const alt = { transcript: text, confidence: 0.92 };
  const result = [alt] as unknown as ResultLike;
  result.isFinal = isFinal;
  result.length = 1;
  return result;
}

type SpeechScript = {
  segments: string[];
  interim?: string;
  pauseMs?: number;
  endAfterEach?: boolean;
  startError?: string;
  noSpeech?: boolean;
  errorByIndex?: Record<number, string>;
};

class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = [];
  static script: SpeechScript = { segments: [] };

  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;

  onstart: (() => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string; message?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;

  index = 0;
  stopped = false;
  aborted = false;

  constructor() {
    this.index = FakeSpeechRecognition.instances.length;
    FakeSpeechRecognition.instances.push(this);
  }

  start() {
    const script = FakeSpeechRecognition.script;
    win.setTimeout(() => this.onstart?.(), 0);

    const scriptedError = script.errorByIndex?.[this.index];
    if (scriptedError) {
      win.setTimeout(() => {
        this.onerror?.({ error: scriptedError });
        this.onend?.();
      }, 5);
      return;
    }
    if (script.startError) {
      win.setTimeout(() => {
        this.onerror?.({ error: script.startError! });
        this.onend?.();
      }, 5);
      return;
    }
    if (script.noSpeech) {
      win.setTimeout(() => {
        this.onerror?.({ error: "no-speech" });
        this.onend?.();
      }, 10);
      return;
    }

    const text = script.segments[this.index];
    if (!text) return;

    win.setTimeout(() => {
      if (script.interim) this.onresult?.({ resultIndex: 0, results: [makeResult(script.interim, false)] });
      this.onspeechstart?.();
      this.onresult?.({ resultIndex: 0, results: [makeResult(text, true)] });
      if (script.endAfterEach) {
        win.setTimeout(() => {
          this.onspeechend?.();
          this.onend?.();
        }, script.pauseMs ?? 50);
      }
    }, 10);
  }

  stop() {
    this.stopped = true;
    this.onend?.();
  }

  abort() {
    this.aborted = true;
    this.onend?.();
  }
}

function installSpeech(script: SpeechScript) {
  FakeSpeechRecognition.instances = [];
  FakeSpeechRecognition.script = script;
  (win as unknown as Record<string, unknown>).SpeechRecognition = FakeSpeechRecognition;
  (win as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeSpeechRecognition;
}

function uninstallSpeech() {
  delete (win as unknown as Record<string, unknown>).SpeechRecognition;
  delete (win as unknown as Record<string, unknown>).webkitSpeechRecognition;
}

// ────────────────────────────────────────────────────────────────────────────
// Fake MediaRecorder + getUserMedia + AudioContext
// ────────────────────────────────────────────────────────────────────────────

let fakeLevel = 0;
let trackStopCount = 0;

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static supported = true;

  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "audio/webm";
    FakeMediaRecorder.instances.push(this);
  }

  static isTypeSupported(type: string) {
    return FakeMediaRecorder.supported && /webm|mp4|ogg|wav/.test(type);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    if (this.state !== "recording") return;
    this.state = "inactive";
    win.setTimeout(() => {
      this.ondataavailable?.({ data: new Blob(["fake-audio-bytes"], { type: this.mimeType }) });
      this.onstop?.();
    }, 0);
  }

  fail() {
    this.onerror?.();
  }
}

class FakeAudioContext {
  state = "running";
  createMediaStreamSource() {
    return { connect() {} };
  }
  createAnalyser() {
    return {
      fftSize: 256,
      frequencyBinCount: 32,
      getByteFrequencyData(data: Uint8Array) {
        data.fill(Math.round(fakeLevel * 255));
      },
    };
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

function installMedia() {
  FakeMediaRecorder.instances = [];
  FakeMediaRecorder.supported = true;
  fakeLevel = 0;
  trackStopCount = 0;
  const tracks = [{ stop: () => { trackStopCount++; } }];
  const stream = { getTracks: () => tracks };
  Object.defineProperty(win.navigator, "mediaDevices", {
    value: {
      getUserMedia: async () => stream,
    },
    configurable: true,
  });
  // The hooks use both bare globals (MediaRecorder, requestAnimationFrame)
  // and window.* APIs, so install on both.
  (win as unknown as Record<string, unknown>).MediaRecorder = FakeMediaRecorder;
  (win as unknown as Record<string, unknown>).AudioContext = FakeAudioContext;
  (win as unknown as Record<string, unknown>).webkitAudioContext = FakeAudioContext;
  (globalThis as unknown as Record<string, unknown>).MediaRecorder = FakeMediaRecorder;
  (globalThis as unknown as Record<string, unknown>).AudioContext = FakeAudioContext;
  (globalThis as unknown as Record<string, unknown>).webkitAudioContext = FakeAudioContext;
  const raf = ((cb: FrameRequestCallback) => win.setTimeout(() => cb(clock.now()), 16)) as typeof win.requestAnimationFrame;
  const caf = ((id: number) => win.clearTimeout(id)) as typeof win.cancelAnimationFrame;
  win.requestAnimationFrame = raf;
  win.cancelAnimationFrame = caf;
  (globalThis as unknown as Record<string, unknown>).requestAnimationFrame = raf;
  (globalThis as unknown as Record<string, unknown>).cancelAnimationFrame = caf;
}

function uninstallMedia() {
  delete (win as unknown as Record<string, unknown>).MediaRecorder;
  delete (win as unknown as Record<string, unknown>).AudioContext;
  delete (win as unknown as Record<string, unknown>).webkitAudioContext;
  delete (globalThis as unknown as Record<string, unknown>).MediaRecorder;
  delete (globalThis as unknown as Record<string, unknown>).AudioContext;
  delete (globalThis as unknown as Record<string, unknown>).webkitAudioContext;
  delete (globalThis as unknown as Record<string, unknown>).requestAnimationFrame;
  delete (globalThis as unknown as Record<string, unknown>).cancelAnimationFrame;
}

// ────────────────────────────────────────────────────────────────────────────
// Test plumbing
// ────────────────────────────────────────────────────────────────────────────

type Check = { name: string; pass: boolean; detail?: string };
const checks: Check[] = [];

/** Stage 0 hook has no cancel(); Stage 1 adds it. */
function cancelSpeech(api: { cancel?: () => void; reset?: () => void }) {
  if (typeof api.cancel === "function") api.cancel();
  else api.reset?.();
}

function check(name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, detail });
  const status = pass ? "PASS" : "FAIL";
  console.log(`  ${status} ${name}${detail ? ` — ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n== ${title} ==`);
}

async function withHook<T>(
  render: () => T,
  run: (get: () => T) => Promise<void>,
): Promise<void> {
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(container);
  let value: T | undefined;
  function Probe() {
    value = render();
    return null;
  }
  const { LanguageProvider } = await import("../src/providers/language-provider");
  await act(async () => {
    root.render(
      React.createElement(LanguageProvider, null, React.createElement(Probe)),
    );
  });
  try {
    await run(() => value as T);
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Speech recognition tests
// ────────────────────────────────────────────────────────────────────────────

async function speechTests() {
  const { useSpeechRecognition } = await import("../src/hooks/assistant/use-speech-recognition");

  section("SpeechRecognition — start / continuous / pauses");

  // 1. Starts listening and uses continuous mode.
  installClock();
  installSpeech({ segments: ["ali bought twenty cartons"] });
  let finalText = "";
  let finalCount = 0;
  await withHook(
    () =>
      useSpeechRecognition({
        language: "en-PK",
        onFinal: (text: string) => {
          finalText = text;
          finalCount++;
        },
      }),
    async (get) => {
      await act(async () => {
        get().start();
        clock.tick(20);
      });
      const api = get();
      check("recording starts", api.state === "listening", `state=${api.state}`);
      const rec = FakeSpeechRecognition.instances[0];
      check(
        "recognition uses continuous mode",
        rec?.continuous === true,
        `continuous=${rec?.continuous}`,
      );
      check(
        "recognition uses interim results",
        rec?.interimResults === true,
        `interimResults=${rec?.interimResults}`,
      );
      const before = FakeSpeechRecognition.instances.length;
      await act(async () => {
        get().start();
        clock.tick(20);
      });
      check(
        "repeated start does not create a second recognizer",
        FakeSpeechRecognition.instances.length === before,
        `before=${before} after=${FakeSpeechRecognition.instances.length}`,
      );
    },
  );

  // 2. A browser onend (short pause) must not lose the utterance; Stage 1
  //    restarts and keeps accumulating.
  installClock();
  installSpeech({
    segments: ["ali bought twenty cartons", "and paid fifteen thousand"],
    endAfterEach: true,
    pauseMs: 40,
  });
  finalText = "";
  finalCount = 0;
  await withHook(
    () =>
      useSpeechRecognition({
        language: "en-PK",
        onFinal: (text: string) => {
          finalText = text;
          finalCount++;
        },
      }),
    async (get) => {
      await act(async () => {
        get().start();
        clock.tick(20); // first segment
        clock.tick(60); // onspeechend + onend
        clock.tick(300); // restart + second segment + pause
        clock.tick(5_000); // pass the silence grace so the session finishes
      });
      check(
        "continuous speech survives a browser onend",
        finalText.includes("ali bought") && finalText.includes("fifteen thousand"),
        `final="${finalText}" instances=${FakeSpeechRecognition.instances.length}`,
      );
      check(
        "continuous speech is submitted once",
        finalCount === 1,
        `finalCount=${finalCount}`,
      );
    },
  );

  // 3. A natural pause shorter than the grace period must not finalize.
  installClock();
  installSpeech({
    segments: ["ali bought twenty cartons", "and paid fifteen thousand"],
    endAfterEach: true,
    pauseMs: 200,
  });
  finalText = "";
  finalCount = 0;
  await withHook(
    () =>
      useSpeechRecognition({
        language: "en-PK",
        onFinal: (text: string) => {
          finalText = text;
          finalCount++;
        },
      }),
    async (get) => {
      await act(async () => {
        get().start();
        clock.tick(20);
        clock.tick(250);
      });
      check(
        "natural pause below grace does not finalize early",
        finalCount === 0 && get().state === "listening",
        `finalCount=${finalCount} state=${get().state} final="${finalText}"`,
      );
      await act(async () => {
        clock.tick(5_000);
      });
      check(
        "speech after a natural pause is captured",
        finalCount === 1 &&
          finalText.includes("ali bought") &&
          finalText.includes("fifteen thousand"),
        `finalCount=${finalCount} final="${finalText}"`,
      );
    },
  );

  // 4. Silence longer than the grace period finalizes with a reason.
  installClock();
  installSpeech({
    segments: ["ali paid five thousand"],
    endAfterEach: true,
    pauseMs: 40,
  });
  finalText = "";
  finalCount = 0;
  await withHook(
    () =>
      useSpeechRecognition({
        language: "en-PK",
        onFinal: (text: string) => {
          finalText = text;
          finalCount++;
        },
      }),
    async (get) => {
      await act(async () => {
        get().start();
        clock.tick(20);
        clock.tick(60);
        clock.tick(5000);
      });
      check(
        "silence beyond grace finalizes",
        finalCount === 1 && finalText.includes("five thousand"),
        `finalCount=${finalCount} final="${finalText}"`,
      );
      check(
        "silence end reason is reported",
        get().endedReason === "silence",
        `endedReason=${get().endedReason}`,
      );
    },
  );

  section("SpeechRecognition — manual stop / restart / cancel / max duration");

  // 5. Manual stop finalizes immediately.
  installClock();
  installSpeech({ segments: ["ali paid five thousand"], endAfterEach: false });
  finalText = "";
  finalCount = 0;
  await withHook(
    () =>
      useSpeechRecognition({
        language: "en-PK",
        onFinal: (text: string) => {
          finalText = text;
          finalCount++;
        },
      }),
    async (get) => {
      await act(async () => {
        get().start();
        clock.tick(20);
        get().stop();
        clock.tick(20);
      });
      check(
        "manual stop finalizes the transcript",
        finalCount === 1 && finalText.includes("five thousand"),
        `finalCount=${finalCount} final="${finalText}"`,
      );
      check(
        "manual stop reports its reason",
        get().endedReason === "manual",
        `endedReason=${get().endedReason}`,
      );
    },
  );

  // 6. Restart after stop.
  installClock();
  installSpeech({ segments: ["first command", "second command"], endAfterEach: false });
  finalText = "";
  finalCount = 0;
  await withHook(
    () =>
      useSpeechRecognition({
        language: "en-PK",
        onFinal: (text: string) => {
          finalText = text;
          finalCount++;
        },
      }),
    async (get) => {
      await act(async () => {
        get().start();
        clock.tick(20);
        get().stop();
        clock.tick(20);
      });
      const firstCount = finalCount;
      await act(async () => {
        get().start();
        clock.tick(20);
      });
      check(
        "recording can restart after a stop",
        FakeSpeechRecognition.instances.length === 2 && get().state === "listening",
        `instances=${FakeSpeechRecognition.instances.length} state=${get().state}`,
      );
      check(
        "restart clears the previous transcript",
        !get().transcript.includes("first command"),
        `transcript="${get().transcript}"`,
      );
      check("restart does not duplicate the first final", finalCount === firstCount, `before=${firstCount} after=${finalCount}`);
    },
  );

  // 7. Cancel discards the recording and does not submit.
  installClock();
  installSpeech({ segments: ["cancel this"], endAfterEach: false });
  finalText = "";
  finalCount = 0;
  await withHook(
    () =>
      useSpeechRecognition({
        language: "en-PK",
        onFinal: (text: string) => {
          finalText = text;
          finalCount++;
        },
      }),
    async (get) => {
      await act(async () => {
        get().start();
        clock.tick(20);
        cancelSpeech(get());
        clock.tick(20);
      });
      check("cancel does not submit audio", finalCount === 0, `finalCount=${finalCount}`);
      check("cancel returns to idle", get().state === "idle", `state=${get().state}`);
      check(
        "cancel aborts or stops the recognizer",
        FakeSpeechRecognition.instances.every((r) => r.aborted || r.stopped),
        `instances=${FakeSpeechRecognition.instances.length}`,
      );
    },
  );

  // 8. Maximum duration.
  installClock();
  installSpeech({ segments: ["a very long wholesale instruction"], endAfterEach: false });
  finalText = "";
  finalCount = 0;
  await withHook(
    () =>
      useSpeechRecognition({
        language: "en-PK",
        onFinal: (text: string) => {
          finalText = text;
          finalCount++;
        },
      }),
    async (get) => {
      await act(async () => {
        get().start();
        clock.tick(20);
        clock.tick(60_000);
        clock.tick(50);
      });
      check(
        "60-second maximum stops the recording",
        finalCount === 1,
        `finalCount=${finalCount} state=${get().state}`,
      );
      check(
        "maximum duration reports its reason",
        get().endedReason === "max-duration",
        `endedReason=${get().endedReason}`,
      );
    },
  );

  // 9. Repeated interactions do not leak or duplicate.
  installClock();
  installSpeech({ segments: ["one", "two", "three"], endAfterEach: false });
  finalText = "";
  finalCount = 0;
  await withHook(
    () =>
      useSpeechRecognition({
        language: "en-PK",
        onFinal: (text: string) => {
          finalText = text;
          finalCount++;
        },
      }),
    async (get) => {
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          get().start();
          clock.tick(20);
          get().stop();
          clock.tick(20);
        });
      }
      check(
        "three start/stop cycles create three recognizers",
        FakeSpeechRecognition.instances.length === 3,
        `instances=${FakeSpeechRecognition.instances.length}`,
      );
      check(
        "three start/stop cycles submit three finals",
        finalCount === 3,
        `finalCount=${finalCount}`,
      );
    },
  );

  section("SpeechRecognition — errors");

  // 10. Permission denied.
  installClock();
  installSpeech({ segments: [], startError: "not-allowed" });
  finalText = "";
  finalCount = 0;
  await withHook(
    () =>
      useSpeechRecognition({
        language: "en-PK",
        onFinal: (text: string) => {
          finalText = text;
          finalCount++;
        },
      }),
    async (get) => {
      await act(async () => {
        get().start();
        clock.tick(20);
      });
      check("microphone denial is surfaced", get().state === "denied", `state=${get().state}`);
      check(
        "microphone denial does not submit",
        finalCount === 0,
        `finalCount=${finalCount}`,
      );
    },
  );

  // 11. No speech.
  installClock();
  installSpeech({ segments: [], noSpeech: true });
  finalText = "";
  finalCount = 0;
  await withHook(
    () =>
      useSpeechRecognition({
        language: "en-PK",
        onFinal: (text: string) => {
          finalText = text;
          finalCount++;
        },
      }),
    async (get) => {
      await act(async () => {
        get().start();
        clock.tick(30);
      });
      check("no-speech is surfaced", get().error?.code === "no-speech", `error=${get().error?.code}`);
      check("no-speech does not submit", finalCount === 0, `finalCount=${finalCount}`);
    },
  );

  // 12. Unsupported browser.
  installClock();
  uninstallSpeech();
  finalText = "";
  finalCount = 0;
  await withHook(
    () =>
      useSpeechRecognition({
        language: "en-PK",
        onFinal: (text: string) => {
          finalText = text;
          finalCount++;
        },
      }),
    async (get) => {
      check("unsupported browser is detected", get().supported === false, `supported=${get().supported}`);
      await act(async () => {
        const ok = get().start();
        check("unsupported start returns false", ok === false, `returned=${ok}`);
        clock.tick(20);
      });
      check("unsupported start does not submit", finalCount === 0, `finalCount=${finalCount}`);
    },
  );

  // 13. Interrupted recording is recoverable.
  installClock();
  installSpeech({
    segments: ["ali paid"],
    endAfterEach: true,
    pauseMs: 30,
    errorByIndex: { 1: "audio-capture" },
  });
  finalText = "";
  finalCount = 0;
  await withHook(
    () =>
      useSpeechRecognition({
        language: "en-PK",
        onFinal: (text: string) => {
          finalText = text;
          finalCount++;
        },
      }),
    async (get) => {
      await act(async () => {
        get().start();
        clock.tick(20);
        clock.tick(60);
        clock.tick(300);
      });
      const afterError = get().state;
      // A recoverable network error must not crash the hook; a fresh start
      // must still work afterwards. Remove the scripted error so the manual
      // retry is a clean start.
      FakeSpeechRecognition.script = { segments: ["after interruption"], endAfterEach: false };
      await act(async () => {
        get().start();
        clock.tick(20);
      });
      check(
        "interrupted recording leaves a recoverable state",
        afterError === "error" || afterError === "idle" || afterError === "processing",
        `state=${afterError}`,
      );
      check(
        "recording can start again after an interruption",
        get().state === "listening",
        `state=${get().state}`,
      );
    },
  );
}

// ────────────────────────────────────────────────────────────────────────────
// MediaRecorder / audio upload tests
// ────────────────────────────────────────────────────────────────────────────

async function audioTests() {
  const { useAudioRecorder } = await import("../src/hooks/smart-entry/use-audio-recorder");

  section("Audio recorder — start / stop / cancel / restart / limits");

  // 14. Start and manual stop produce a blob exactly once.
  installClock();
  installMedia();
  let blobs: Blob[] = [];
  await withHook(
    () => useAudioRecorder(),
    async (get) => {
      await act(async () => {
        await get().start((blob: Blob) => blobs.push(blob));
        clock.tick(20);
      });
      check("audio recording starts", get().state === "recording", `state=${get().state}`);
      const beforeRecorders = FakeMediaRecorder.instances.length;
      await act(async () => {
        await get().start(() => {});
        clock.tick(20);
      });
      check(
        "repeated audio start does not create a second recorder",
        FakeMediaRecorder.instances.length === beforeRecorders,
        `before=${beforeRecorders} after=${FakeMediaRecorder.instances.length}`,
      );
      await act(async () => {
        get().stop();
        clock.tick(20);
      });
      check("manual audio stop produces one blob", blobs.length === 1, `blobs=${blobs.length}`);
      check(
        "audio blob mime is transcription-compatible",
        /webm|mp4|ogg|wav/.test(get().audioMimeType ?? ""),
        `mime=${get().audioMimeType}`,
      );
      check("audio stop releases the microphone", trackStopCount >= 1, `tracksStopped=${trackStopCount}`);
    },
  );

  // 15. Repeated stop calls do not duplicate the callback.
  installClock();
  installMedia();
  blobs = [];
  await withHook(
    () => useAudioRecorder(),
    async (get) => {
      await act(async () => {
        await get().start((blob: Blob) => blobs.push(blob));
        clock.tick(20);
      });
      await act(async () => {
        get().stop();
        get().stop();
        clock.tick(20);
      });
      check("repeated stop does not duplicate audio", blobs.length === 1, `blobs=${blobs.length}`);
    },
  );

  // 16. Cancel discards the recording.
  installClock();
  installMedia();
  blobs = [];
  await withHook(
    () => useAudioRecorder(),
    async (get) => {
      await act(async () => {
        await get().start((blob: Blob) => blobs.push(blob));
        clock.tick(20);
        get().cancel();
        clock.tick(20);
      });
      check("audio cancel does not submit", blobs.length === 0, `blobs=${blobs.length}`);
      check("audio cancel returns to idle", get().state === "idle", `state=${get().state}`);
      check("audio cancel releases the microphone", trackStopCount >= 1, `tracksStopped=${trackStopCount}`);
    },
  );

  // 17. Restart after stop.
  installClock();
  installMedia();
  blobs = [];
  await withHook(
    () => useAudioRecorder(),
    async (get) => {
      await act(async () => {
        await get().start((blob: Blob) => blobs.push(blob));
        clock.tick(20);
        get().stop();
        clock.tick(20);
      });
      await act(async () => {
        await get().start((blob: Blob) => blobs.push(blob));
        clock.tick(20);
      });
      check("audio recording can restart", get().state === "recording", `state=${get().state}`);
    },
  );

  // 18. 60-second maximum (not the old 30-second cap).
  installClock();
  installMedia();
  fakeLevel = 0.5;
  blobs = [];
  await withHook(
    () => useAudioRecorder(),
    async (get) => {
      await act(async () => {
        await get().start((blob: Blob) => blobs.push(blob));
        clock.tick(20);
        clock.tick(45_000);
      });
      check(
        "audio recording is still active at 45 seconds",
        get().state === "recording",
        `state=${get().state}`,
      );
      await act(async () => {
        clock.tick(15_000);
        clock.tick(50);
      });
      check("audio recording stops at 60 seconds", blobs.length === 1, `blobs=${blobs.length} state=${get().state}`);
    },
  );

  // 18b. A previous session's 30s timer must not kill the next session.
  installClock();
  installMedia();
  fakeLevel = 0.5;
  blobs = [];
  await withHook(
    () => useAudioRecorder(),
    async (get) => {
      await act(async () => {
        await get().start((blob: Blob) => blobs.push(blob));
        clock.tick(100);
        get().stop();
        clock.tick(50);
      });
      await act(async () => {
        await get().start((blob: Blob) => blobs.push(blob));
        clock.tick(45_000);
      });
      check(
        "a previous session's timer cannot stop the next session",
        get().state === "recording",
        `state=${get().state}`,
      );
    },
  );

  // 19. Silence grace: a 3s pause must not stop; a long silence must.
  installClock();
  installMedia();
  fakeLevel = 0.5;
  blobs = [];
  await withHook(
    () => useAudioRecorder(),
    async (get) => {
      await act(async () => {
        await get().start((blob: Blob) => blobs.push(blob));
        clock.tick(200); // sound
      });
      fakeLevel = 0;
      await act(async () => {
        clock.tick(3_000); // natural pause, longer than the old 2s cap
      });
      check(
        "a 3-second natural pause does not stop audio recording",
        get().state === "recording",
        `state=${get().state}`,
      );
      await act(async () => {
        clock.tick(5_000); // beyond the 4s grace
      });
      check("long silence stops audio recording", blobs.length === 1, `blobs=${blobs.length} state=${get().state}`);
    },
  );

  section("Audio recorder — permission / unsupported / upload");

  // 20. Permission denied.
  installClock();
  installMedia();
  Object.defineProperty(win.navigator, "mediaDevices", {
    value: {
      getUserMedia: async () => {
        throw new win.DOMException("denied", "NotAllowedError");
      },
    },
    configurable: true,
  });
  await withHook(
    () => useAudioRecorder(),
    async (get) => {
      await act(async () => {
        await get().start(() => {});
        clock.tick(20);
      });
      check("audio permission denial is surfaced", get().state === "denied", `state=${get().state}`);
    },
  );

  // 21. Unsupported MediaRecorder.
  installClock();
  installMedia();
  delete (win as unknown as Record<string, unknown>).MediaRecorder;
  delete (globalThis as unknown as Record<string, unknown>).MediaRecorder;
  await withHook(
    () => useAudioRecorder(),
    async (get) => {
      await act(async () => {
        await get().start(() => {});
        clock.tick(20);
      });
      check("unsupported recorder is surfaced", get().state === "unsupported", `state=${get().state}`);
    },
  );

  // 22. Upload uses the existing /api/assistant/message pipeline and only once.
  installClock();
  installMedia();
  const { useAssistant } = await import("../src/hooks/assistant/use-assistant");
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const originalFetch = globalThis.fetch;
  (globalThis as unknown as Record<string, unknown>).fetch = async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const href = typeof url === "string" ? url : url.toString();
    if (href.includes("/api/assistant/status")) {
      return new Response(JSON.stringify({ data: { ready: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (href.includes("/api/assistant/message")) {
      calls.push({ url: href, body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(
        JSON.stringify({
          data: {
            kind: "answer",
            text: "recorded",
            source: "database",
            requestsUsed: 0,
            timings: { totalMs: 0 },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };

  await withHook(
    () => useAssistant(),
    async (get) => {
      const blob = new Blob(["voice-bytes"], { type: "audio/webm" });
      await act(async () => {
        const first = get().send({ audioBlob: blob, audioMimeType: "audio/webm" });
        const second = get().send({ audioBlob: blob, audioMimeType: "audio/webm" });
        await Promise.all([first, second]);
        clock.tick(20);
      });
      check("audio upload reaches the assistant endpoint", calls.length === 1, `calls=${calls.length}`);
      check(
        "audio upload carries base64 audio",
        typeof calls[0]?.body.audio === "object" &&
          typeof (calls[0]?.body.audio as { base64?: string }).base64 === "string" &&
          ((calls[0]?.body.audio as { base64: string }).base64.length ?? 0) > 0,
        `audio=${JSON.stringify(calls[0]?.body.audio).slice(0, 80)}`,
      );
      check(
        "duplicate taps do not duplicate the upload",
        calls.length === 1,
        `calls=${calls.length}`,
      );
    },
  );

  globalThis.fetch = originalFetch;
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("DUKHATA — Voice recording pipeline benchmark");
  console.log("Mode: jsdom + deterministic fake SpeechRecognition / MediaRecorder\n");

  try {
    await speechTests();
  } catch (error) {
    check("speech suite crashed", false, error instanceof Error ? error.message : String(error));
  }

  try {
    await audioTests();
  } catch (error) {
    check("audio suite crashed", false, error instanceof Error ? error.message : String(error));
  }

  restoreClock();
  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed;
  console.log(`\n== Summary ==`);
  console.log(`  ${passed} passed, ${failed} failed, ${checks.length} total`);
  if (failed > 0) {
    console.log("\n  Failed checks:");
    for (const c of checks.filter((x) => !x.pass)) {
      console.log(`   - ${c.name}${c.detail ? ` (${c.detail})` : ""}`);
    }
  }
  process.exit(failed === 0 ? 0 : 1);
}

void main();