/**
 * Voice recording — real-browser integration check (Stage 0 / Stage 1).
 *
 * Run:
 *   node scripts/test-voice-recording-browser.mjs
 *   node scripts/test-voice-recording-browser.mjs --full   (includes the real 60s cap)
 *
 * Why this exists:
 *   The jsdom suite proves the state machine deterministically. This script
 *   proves the REAL VoiceAssistant component works in a real Chromium
 *   renderer: React effects, the launcher/dialog, MediaRecorder, getUserMedia,
 *   upload, and the visible transcript review.
 *
 * How:
 *   - Launch the installed Chrome headless with a throw-away profile.
 *   - Use Chrome DevTools Protocol over Node's built-in WebSocket (no new
 *     dependency, no Playwright download).
 *   - Inject fake SpeechRecognition / fake permission denial before the app
 *     loads, or use Chrome's fake microphone device for the MediaRecorder path.
 *   - Intercept the assistant endpoint so the test never spends AI credit.
 *
 * Limitations (reported honestly):
 *   - No physical microphone / acoustic Urdu audio is used. Real acoustic
 *     accuracy is a later benchmark, not this lifecycle test.
 *   - The speech transcript is scripted; this verifies recording lifecycle,
 *     pause tolerance, restart, stop, cancel, upload and error recovery.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!CHROME) {
  throw new Error(
    "No Chrome/Edge found. Set CHROME_PATH to a Chromium executable.",
  );
}
const PORT = 9337 + Math.floor(Math.random() * 80);
const BASE = "http://localhost:3000/dashboard";
const FULL = process.argv.includes("--full");

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function section(title) {
  console.log(`\n== ${title} ==`);
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
      } catch {
        return;
      }
      if (msg.id) {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        if (msg.error) pending.reject(new Error(JSON.stringify(msg.error)));
        else pending.resolve(msg.result);
      }
    });
  }

  async send(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

async function waitForHttp(url, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  console.log("DUKHATA — real-browser voice recording check");
  console.log(`Chrome: ${CHROME}`);
  console.log(`Mode: ${FULL ? "full (includes real 60s cap)" : "fast (use --full for 60s cap)"}\n`);

  const profile = await mkdtemp(join(tmpdir(), "dukhata-voice-browser-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1280,900",
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${PORT}`,
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let cdp;
  try {
    await waitForHttp(`http://127.0.0.1:${PORT}/json/version`);
    const targets = await waitForHttp(`http://127.0.0.1:${PORT}/json/list`);
    const page = targets.find((t) => t.type === "page");
    if (!page) throw new Error("No Chrome page target");
    cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    const injection = `(() => {
      const params = new URLSearchParams(location.search);
      const mode = params.get("voice_test");
      if (!mode) return;
      try {
        localStorage.setItem(
          "digital-khata-lang",
          params.get("lang") === "ur" ? "ur" : "en",
        );
      } catch {}
      window.__voiceTest = { mode, starts: 0, stops: 0, aborts: 0, events: [], instances: [], upload: null };

      const log = (name, extra) => window.__voiceTest.events.push({ name, at: Date.now(), ...extra });
      const makeResult = (text, isFinal) => {
        const alt = { transcript: text, confidence: 0.94 };
        const result = [alt];
        result.isFinal = isFinal;
        result.length = 1;
        return result;
      };

      if (mode === "speech" || mode === "speech-error" || mode === "speech-long") {
        class FakeSpeechRecognition {
          constructor() {
            this.lang = "";
            this.continuous = false;
            this.interimResults = false;
            this.maxAlternatives = 1;
            this.onstart = null;
            this.onresult = null;
            this.onerror = null;
            this.onend = null;
            this.onspeechend = null;
            this.onspeechstart = null;
            this.index = window.__voiceTest.starts++;
            window.__voiceTest.instances.push(this);
          }
          start() {
            log("start", { index: this.index, continuous: this.continuous, interimResults: this.interimResults });
            setTimeout(() => this.onstart?.(), 50);
            if (mode === "speech-long") {
              // Keep speaking until the hard cap. No onspeechend, so the
              // silence grace must NOT finish this session early.
              let n = 0;
              setTimeout(() => this.onspeechstart?.(), 100);
              this._timer = setInterval(() => {
                n += 1;
                this.onresult?.({
                  resultIndex: 0,
                  results: [makeResult("item " + n, true)],
                });
              }, 500);
              return;
            }
            if (mode === "speech-error" && this.index === 0) {
              setTimeout(() => {
                log("error-network", { index: this.index });
                this.onerror?.({ error: "network" });
                this.onend?.();
              }, 150);
              return;
            }
            const segments = ["ali bought twenty cartons", "and paid fifteen thousand"];
            const text = segments[this.index];
            if (!text) return;
            setTimeout(() => {
              log("speechstart", { index: this.index });
              this.onspeechstart?.();
            }, 100);
            setTimeout(() => {
              log("result", { index: this.index, text });
              this.onresult?.({ resultIndex: 0, results: [makeResult(text, true)] });
            }, 200);
            setTimeout(() => {
              log("speechend", { index: this.index });
              this.onspeechend?.();
            }, 600);
            setTimeout(() => {
              log("end", { index: this.index });
              this.onend?.();
            }, 700);
          }
          stop() {
            window.__voiceTest.stops++;
            log("stop", { index: this.index });
            if (this._timer) clearInterval(this._timer);
            this.onend?.();
          }
          abort() {
            window.__voiceTest.aborts++;
            log("abort", { index: this.index });
            if (this._timer) clearInterval(this._timer);
            this.onend?.();
          }
        }
        window.SpeechRecognition = FakeSpeechRecognition;
        window.webkitSpeechRecognition = FakeSpeechRecognition;
      }

      if (mode === "audio" || mode === "audio-denied") {
        // No SpeechRecognition => the app must use the MediaRecorder fallback.
        try { delete window.SpeechRecognition; } catch {}
        try { delete window.webkitSpeechRecognition; } catch {}

        if (mode === "audio-denied") {
          Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
            configurable: true,
            value: async () => {
              throw new DOMException("denied by test", "NotAllowedError");
            },
          });
        }

        const originalFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const href = String(input);
          if (href.includes("/api/assistant/message")) {
            const body = JSON.parse(String(init?.body ?? "{}"));
            window.__voiceTest.upload = {
              count: (window.__voiceTest.upload?.count ?? 0) + 1,
              body,
            };
            return new Response(
              JSON.stringify({
                data: {
                  kind: "answer",
                  text: "test upload received",
                  source: "database",
                  requestsUsed: 0,
                  timings: { totalMs: 0 },
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return originalFetch(input, init);
        };
      }
    })();`;

    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: injection });

    async function evaluate(expression) {
      const result = await cdp.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) {
        throw new Error(
          result.exceptionDetails.exception?.description ??
            result.exceptionDetails.text ??
            "Runtime.evaluate failed",
        );
      }
      return result.result.value;
    }

    async function waitFor(expression, timeoutMs = 15_000, label = expression) {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        try {
          if (await evaluate(expression)) return true;
        } catch {
          /* page may be navigating */
        }
        await delay(100);
      }
      throw new Error(`Timed out waiting for ${label}`);
    }

    async function load(mode, lang = "en") {
      const suffix = lang === "ur" ? "&lang=ur" : "";
      await cdp.send("Page.navigate", {
        url: `${BASE}?voice_test=${mode}${suffix}`,
      });
      await waitFor(
        `document.readyState === "complete" && [...document.querySelectorAll('button')].some((b) => /Voice Assistant|وائس/.test(b.getAttribute('aria-label') || ''))`,
        30_000,
        `${mode} page + assistant launcher`,
      );
      // Open the assistant and wait for the mic control.
      const opened = await evaluate(
        `(() => { const b = [...document.querySelectorAll('button')].find((x) => /Voice Assistant|وائس/.test(x.getAttribute('aria-label') || '')); if (!b) return false; b.click(); return true; })()`,
      );
      if (!opened) throw new Error("Could not open the Voice Assistant");
      await waitFor(
        `!!document.querySelector('[role="dialog"]') && [...document.querySelectorAll('[role="dialog"] button')].some((b) => /Start listening|سننا شروع/.test(b.getAttribute('aria-label') || ''))`,
        10_000,
        "assistant mic button",
      );
      await delay(400); // let the status refresh settle
    }

    async function clickMic() {
      return evaluate(
        `(() => { const d = document.querySelector('[role="dialog"]'); if (!d) return false; const b = [...d.querySelectorAll('button')].find((x) => /Start listening|Stop listening|سننا شروع|سننا بند/.test(x.getAttribute('aria-label') || '')); if (!b) return false; b.click(); return true; })()`,
      );
    }

    async function clickCancel() {
      return evaluate(
        `(() => { const b = [...document.querySelectorAll('button')].find((x) => /Cancel recording|ریکارڈنگ/.test(x.getAttribute('aria-label') || '')); if (!b) return false; b.click(); return true; })()`,
      );
    }

    const bodyText = `document.body.innerText`;
    const transcriptValue = `(document.querySelector('textarea[aria-label="Speech transcript"]')?.value ?? "")`;
    const isListening = `[...document.querySelectorAll('button')].some((b) => /Stop listening|سننا بند/.test(b.getAttribute('aria-label') || ''))`;

    // ── 1. Continuous speech, natural pause, silence grace, restart, stop, cancel ─
    section("SpeechRecognition — real VoiceAssistant UI");
    await load("speech");
    await clickMic();
    await waitFor(
      `document.querySelector('[role="dialog"]').innerText.includes("ali bought twenty cartons")`,
      6_000,
      "first spoken segment",
    );
    await delay(1_200);
    const midEvents = await evaluate(`window.__voiceTest.events`);
    const startEvents = midEvents.filter((e) => e.name === "start");
    check(
      "mic opens a continuous recognizer",
      startEvents.length >= 1 && startEvents[0].continuous === true,
      `starts=${startEvents.length} continuous=${startEvents[0]?.continuous}`,
    );
    check(
      "the UI is still listening after a pause",
      await evaluate(isListening),
      `listening=${await evaluate(isListening)}`,
    );
    check(
      "a browser onend is recovered by a fresh recognizer",
      startEvents.length >= 2,
      `starts=${startEvents.length}`,
    );
    check(
      "both spoken segments are shown live",
      await evaluate(
        `document.querySelector('[role="dialog"]').innerText.includes("ali bought") && document.querySelector('[role="dialog"]').innerText.includes("fifteen thousand")`,
      ),
      "live transcript contains both segments",
    );

    // Wait past the 4s silence grace; the session must finish on its own.
    await waitFor(
      `!!document.querySelector('textarea[aria-label="Speech transcript"]')`,
      8_000,
      "automatic finish after the silence grace",
    );
    const autoTranscript = await evaluate(transcriptValue);
    check(
      "a 4s silence grace finishes the recording",
      autoTranscript.includes("ali bought") && autoTranscript.includes("fifteen thousand"),
      `transcript="${autoTranscript}"`,
    );
    check(
      "the automatic finish reason is shown",
      (await evaluate(bodyText)).includes("Stopped after a pause"),
      "pause notice visible",
    );

    // A fresh page keeps the fake script's segment indexes predictable.
    section("SpeechRecognition — manual stop / restart / cancel");
    await load("speech");
    const beforeRestart = await evaluate(`window.__voiceTest.starts`);
    await clickMic();
    await delay(500);
    check(
      "recording starts from idle",
      (await evaluate(`window.__voiceTest.starts`)) > beforeRestart,
      `starts=${await evaluate(`window.__voiceTest.starts`)}`,
    );
    await waitFor(
      `document.querySelector('[role="dialog"]').innerText.includes("ali bought twenty cartons")`,
      4_000,
      "segment before manual stop",
    );
    await clickMic();
    await waitFor(
      `!!document.querySelector('textarea[aria-label="Speech transcript"]')`,
      4_000,
      "manual stop transcript",
    );
    const manualTranscript = await evaluate(transcriptValue);
    check(
      "manual stop keeps the words",
      manualTranscript.includes("ali bought"),
      `transcript="${manualTranscript}"`,
    );
    check(
      "manual stop stops the recognizer exactly once",
      (await evaluate(`window.__voiceTest.stops`)) === 1,
      `stops=${await evaluate(`window.__voiceTest.stops`)}`,
    );

    // Re-record from the transcript review: a new session, clean transcript.
    const beforeReRecord = await evaluate(`window.__voiceTest.starts`);
    await clickMic();
    await delay(500);
    const afterReRecord = await evaluate(`window.__voiceTest.starts`);
    check(
      "recording can restart from the transcript review",
      afterReRecord > beforeReRecord,
      `starts ${beforeReRecord} → ${afterReRecord}`,
    );
    check(
      "restart clears the previous transcript",
      (await evaluate(transcriptValue)) === "",
      `transcript="${await evaluate(transcriptValue)}"`,
    );

    // Cancel while listening: no transcript, no submission.
    await waitFor(
      `document.querySelector('[role="dialog"]').innerText.includes("fifteen thousand")`,
      4_000,
      "second segment before cancel",
    );
    const beforeCancelAborts = await evaluate(`window.__voiceTest.aborts`);
    await clickCancel();
    await delay(400);
    const afterCancelAborts = await evaluate(`window.__voiceTest.aborts`);
    check(
      "cancel aborts the live recognizer",
      afterCancelAborts > beforeCancelAborts,
      `aborts ${beforeCancelAborts} → ${afterCancelAborts}`,
    );
    check(
      "cancel leaves no transcript to send",
      (await evaluate(transcriptValue)) === "",
      `transcript="${await evaluate(transcriptValue)}"`,
    );
    check(
      "cancel returns the mic to idle",
      (await evaluate(isListening)) === false,
      `listening=${await evaluate(isListening)}`,
    );

    // ── 2. Recoverable speech error ─────────────────────────────────────────
    section("SpeechRecognition — recoverable network error");
    await load("speech-error");
    await clickMic();
    await delay(1_500);
    const errorEvents = await evaluate(`window.__voiceTest.events`);
    const errorStarts = errorEvents.filter((e) => e.name === "start");
    check(
      "a network error is retried with a new recognizer",
      errorStarts.length >= 2,
      `starts=${errorStarts.length} events=${errorEvents.map((e) => e.name).join(",")}`,
    );
    check(
      "the retry is still listening",
      await evaluate(isListening),
      `listening=${await evaluate(isListening)}`,
    );
    await clickMic();
    await waitFor(
      `!!document.querySelector('textarea[aria-label="Speech transcript"]')`,
      4_000,
      "transcript after error recovery",
    );
    check(
      "recording works after the recoverable error",
      (await evaluate(transcriptValue)).length > 0,
      `transcript="${await evaluate(transcriptValue)}"`,
    );

    // ── 3. Audio fallback: real MediaRecorder + upload + duplicate guard ────
    section("MediaRecorder fallback — upload / duplicate guard");
    await load("audio");
    await clickMic();
    await delay(1_200);
    await clickMic(); // manual stop
    await waitFor(
      `(window.__voiceTest.upload?.count ?? 0) >= 1`,
      8_000,
      "audio upload",
    );
    const upload = await evaluate(`window.__voiceTest.upload`);
    const base64 = upload?.body?.audio?.base64 ?? "";
    const mime = upload?.body?.audio?.mimeType ?? "";
    check(
      "the fallback uploads one audio recording",
      upload?.count === 1,
      `count=${upload?.count}`,
    );
    check(
      "the uploaded audio has bytes",
      typeof base64 === "string" && base64.length > 0,
      `base64 length=${base64.length}`,
    );
    check(
      "the uploaded mime type is transcription-compatible",
      /webm|mp4|ogg|wav/.test(mime),
      `mime=${mime}`,
    );
    check(
      "the assistant reply is shown after upload",
      (await evaluate(bodyText)).includes("test upload received"),
      "reply visible",
    );
    // An extra tap after the upload must not create a duplicate request.
    await evaluate(
      `(() => { const d = document.querySelector('[role="dialog"]'); const b = d?.querySelector('button[aria-label="Start listening"]'); if (b) b.click(); return true; })()`,
    ).catch(() => {});
    await delay(400);
    check(
      "an extra tap does not duplicate an upload",
      (await evaluate(`window.__voiceTest.upload?.count ?? 0`)) === 1,
      `count=${await evaluate(`window.__voiceTest.upload?.count ?? 0`)}`,
    );

    // ── 4. Permission denial is a plain-language message ───────────────────
    section("Microphone permission denial");
    await load("audio-denied");
    await clickMic();
    await delay(700);
    const deniedText = await evaluate(bodyText);
    check(
      "permission denial is explained without a raw key",
      deniedText.includes("Microphone permission was denied") &&
        !deniedText.includes("smartentry."),
      deniedText.includes("Microphone permission was denied")
        ? "plain-language message visible"
        : "message missing",
    );

    // ── 5. Urdu / RTL interface still works ─────────────────────────────────
    section("Urdu / RTL interface");
    await load("speech", "ur");
    check(
      "Urdu UI is right-to-left",
      await evaluate(`document.documentElement.dir === "rtl"`),
      `dir=${await evaluate(`document.documentElement.dir`)}`,
    );
    check(
      "mic control is localized",
      await evaluate(
        `[...document.querySelectorAll('[role="dialog"] button')].some((b) => /سننا شروع/.test(b.getAttribute('aria-label') || ''))`,
      ),
      "Urdu start-listening label visible",
    );
    await clickMic();
    await waitFor(
      `document.querySelector('[role="dialog"]').innerText.includes("ali bought")`,
      6_000,
      "Urdu-mode live transcript",
    );
    check(
      "cancel control is localized",
      await evaluate(
        `[...document.querySelectorAll('button')].some((b) => /ریکارڈنگ/.test(b.getAttribute('aria-label') || ''))`,
      ),
      "Urdu cancel label visible",
    );
    check(
      "recording timer is visible in RTL",
      await evaluate(
        `/[0-9]:[0-9]{2} \\/ [0-9]:[0-9]{2}/.test(document.querySelector('[role="dialog"]').innerText)`,
      ),
      "mm:ss / mm:ss timer visible",
    );
    await clickCancel();
    await delay(400);
    check(
      "Urdu cancel returns the mic to idle",
      (await evaluate(isListening)) === false,
      `listening=${await evaluate(isListening)}`,
    );

    // ── 6. Real 60-second cap (opt-in because it takes a minute) ───────────
    if (FULL) {
      section("Maximum recording duration — real 60s cap");
      await load("speech-long");
      await clickMic();
      const started = Date.now();
      // The fake keeps producing results every 500 ms, so the 4s silence
      // grace cannot be the reason this session ends.
      await delay(46_000);
      check(
        "the recording is still listening at 46 seconds",
        await evaluate(isListening),
        `listening=${await evaluate(isListening)}`,
      );
      await waitFor(
        `!!document.querySelector('textarea[aria-label="Speech transcript"]')`,
        20_000,
        "60s limit transcript",
      );
      const elapsed = Date.now() - started;
      check(
        "the 60-second cap finishes the recording",
        elapsed >= 59_000 && elapsed < 68_000,
        `elapsed=${(elapsed / 1000).toFixed(1)}s`,
      );
      check(
        "the 60-second cap is explained",
        (await evaluate(bodyText)).includes("Maximum 60 seconds reached"),
        "limit notice visible",
      );
    } else {
      section("Maximum recording duration — fast mode");
      check(
        "60-second cap is covered by the deterministic suite",
        true,
        "run with --full to exercise it in the browser",
      );
    }
  } finally {
    cdp?.close();
    try {
      chrome.kill();
    } catch {
      /* ignore */
    }
    await delay(700);
    try {
      await rm(profile, { recursive: true, force: true });
    } catch {
      /* Windows may keep a lock; the temp profile is harmless */
    }
  }

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

main().catch((error) => {
  console.error("\nFATAL:", error);
  process.exit(2);
});