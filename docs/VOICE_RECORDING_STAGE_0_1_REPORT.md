# Universal Voice Assistant — Recording Pipeline (Stage 0 + Stage 1)

Status: **local, reversible, uncommitted**. No deployment, no production data, no
remote push, no git commit. Stage 0 (benchmark harness) and Stage 1 (recording
fix) only. Gemini prompts, model selection/rotation, understanding, customer /
product matching, action execution, DB transactions, financial calculations and
the separate Khata Assistant were **not** modified.

## 1. Goal

Make the voice recording pipeline hold a whole natural Urdu / Roman Urdu /
English sentence without cutting the shopkeeper off, while keeping a hard safety
cap:

- continuous recording (`continuous = true`) instead of stopping after a pause,
- a configurable natural-pause grace of 3–5 s (default **4 s**), not the only
  stop method,
- a reliable manual stop,
- a configurable hard cap (default **60 s**),
- the owner can start another recording after a stop or a recoverable error
  without refreshing the page,
- audio is preserved until the owner acts on the transcript,
- upload failures are shown clearly,
- no duplicate submissions,
- cancellation releases the microphone and discards the recording,
- the existing Dukhata look, tabs, permissions and language (English / Urdu)
  are preserved.

## 2. Stage 0 — benchmark harness

There was no test framework in the project (only `tsx` scripts). Stage 0 added a
deterministic harness that drives the **real** hooks in `jsdom` with fake
`SpeechRecognition`, `MediaRecorder`, `getUserMedia`, `AudioContext` and a fake
clock:

- `scripts/test-voice-recording.tsx` (`npm run test:voice-recording`)
- `scripts/test-voice-recording-browser.mjs`
  (`npm run test:voice-recording:browser`, real headless Chrome via CDP)

Only `jsdom` + `@types/jsdom` were added, as dev dependencies. No Vitest / Jest /
Playwright was introduced.

### Baseline measured against the unmodified hooks

`35 passed, 13 failed, 48 total`.

One of the 13 failures (`audio permission denial is surfaced`) was a **harness
realm artifact** (the fake threw a `jsdom` `DOMException` while the hook checked
the global one); the harness was corrected before Stage 1, so **12 failures were
real product gaps**:

| # | Real baseline defect |
|---|----------------------|
| 1 | `continuous` was `false` |
| 2 | a browser `onend` after a short pause ended the whole session |
| 3 | a natural pause below the grace finalized early |
| 4 | no end reason (`endedReason`) for a pause |
| 5 | no end reason for a manual stop |
| 6 | `cancel` did not return to idle |
| 7 | `cancel` did not abort the recognizer |
| 8 | no 60 s maximum duration |
| 9 | no end reason for the max duration |
| 10 | audio fallback stopped at 30 s, not 60 s |
| 11 | a previous session's 30 s timer could stop the next session |
| 12 | the audio fallback stopped after a 2 s pause |

## 3. Stage 1 — changes

### New shared config

- `src/lib/voice/recording-config.ts` — `RECORDING_DEFAULTS`
  (`maxDurationMs = 60_000`, `silenceGraceMs = 4_000`,
  `noSpeechTimeoutMs = 12_000`, `restartDelayMs = 200`, `maxRestarts = 40`),
  `resolveRecordingConfig(overrides)` for tests, and
  `formatRecordingDuration()` for the `mm:ss` timer.

### `src/hooks/assistant/use-speech-recognition.ts`

- `continuous = true`, `interimResults = true`, keeps the highest-confidence
  alternative.
- Transparent restart: if a browser fires `onend` on its own (a browser that
  ignores `continuous`), a fresh recognizer is created after
  `restartDelayMs`, while all words already heard are kept. Session tokens make
  old recognizers inert.
- Natural-pause grace: finalizes only after `silenceGraceMs` of silence, and the
  grace is reset by any new speech.
- Hard `maxDurationMs` cap with a live `elapsedMs` / `remainingMs` timer.
- Reliable `stop()` (with a fallback finalize if the browser never fires
  `onend`) and `cancel()` (aborts, releases, discards, returns to idle).
- `endedReason`: `manual | silence | max-duration | error | restart-exhausted`.
- Errors classified: permission denied, no-speech, recoverable `network`
  (auto-retry with backoff), non-recoverable (`audio-capture`, etc.) — all
  user-facing messages come from the voice phrase table.
- Repeated taps cannot create a second recognizer.

### `src/hooks/smart-entry/use-audio-recorder.ts` (audio fallback)

- 4 s silence grace and the 60 s cap, both from the shared config.
- Timers are stored and cleared, so a previous session's timer can never stop
  the next session.
- `cancel()` nulls the callback first (no upload), stops the recorder and
  stops the microphone tracks.
- Duplicate start guarded; `requestData()` before `stop()` where supported so a
  very short recording is not lost; empty blobs are not uploaded.
- MediaRecorder constructor / `start()` failures are handled with a friendly
  message; final mime type comes from the recorder.

### `src/hooks/voice-assistant/use-voice-assistant.ts`

- Exposes `cancel`, `recordingElapsedMs`, `recordingRemainingMs`,
  `recordingMaxMs`, `endedReason`, `restarting`.
- `listening` now also covers the permission request; repeated taps are ignored.
- `stop` cancels a pending permission request; `cancel` clears speech + recorder
  + transcript.

### `src/components/voice-assistant/VoiceAssistant.tsx`

- Live `mm:ss / mm:ss` timer while listening (digits marked `aria-hidden` so
  screen readers are not spammed).
- A compact **Cancel recording** button next to the microphone while listening.
- Plain-language notices: "Stopped after a pause." and
  "Maximum 60 seconds reached. Check the words, then send."
- The recorder error is mapped to plain voice phrases, so raw
  `smartentry.*` keys or browser messages are never shown.

### `src/lib/assistant/phrases.ts`

Added English + Urdu phrases: `listeningTakeYourTime`, `recordingMaxHint`,
`recordingLimitReached`, `recordingStoppedPause`, `cancelRecording`.

## 4. Tests created

| Suite | Command | Scope |
|-------|---------|-------|
| Hook harness | `npm run test:voice-recording` | 51 deterministic checks in `jsdom` (observe gaps, continuous, pause, manual stop, restart, cancel, 60 s, silence, errors, audio fallback, upload, duplicates) |
| Real browser | `npm run test:voice-recording:browser` | 29 checks in real headless Chrome via CDP (UI, continuous + restart, 4 s grace, manual stop, restart, cancel, recoverable error, real MediaRecorder upload, permission denial, Urdu / RTL) |
| Real browser `--full` | `npm run test:voice-recording:browser -- --full` | 31 checks, adds the **real 60 s** cap (measured 60.1 s) |

## 5. Results

| Suite | Result |
|-------|--------|
| `npm run test:voice-recording` | **51 passed, 0 failed** |
| `npm run test:voice-recording:browser` | **29 passed, 0 failed** |
| `npm run test:voice-recording:browser -- --full` | **31 passed, 0 failed** (60 s cap = 60.1 s) |
| `npm run typecheck` | **0 errors** |
| `npm run test:voice` | **53 passed, 0 failed** |
| `npm run test:assistant` | **112 passed, 0 failed** |
| `npm run test:khata` | **223 passed, 0 failed** |
| `npm run test:acceptance` | **151 passed, 2 failed** — both pre-existing dev-bypass checks (`/api/dashboard` and Smart Entry return 200 instead of 401 because `DEV_AUTH_BYPASS` is active locally); unrelated to recording |

Baseline → after:

```
Stage 0 baseline : 35 passed, 13 failed (48)  [12 real product gaps]
Stage 1 hooks    : 51 passed,  0 failed (51)
Stage 1 browser  : 29 passed,  0 failed (29)
Stage 1 --full   : 31 passed,  0 failed (31), 60 s cap = 60.1 s
```

## 6. Browser / device limitations (honest)

- The transcript in the browser test is **scripted**; the test verifies the
  recording **lifecycle**, not acoustic Urdu/English accuracy.
- There is **no physical microphone** available in this environment. The audio
  path uses Chrome's fake device. Real acoustic accuracy still needs a device
  matrix.
- Only Chrome was exercised (Edge is a Chromium fallback in the runner).
  Firefox (audio fallback), Safari (`continuous` ignored), and real Android /
  iOS were **not** tested.
- The native permission prompt was simulated with a rejected `getUserMedia`;
  the real browser prompt was not exercised.
- The 60 s cap is a real-time test (60.1 s) and passed, but screen-lock /
  background-tab behaviour on mobile was not tested.
- `jsdom` reported 5 dev-only audit warnings after install; nothing was
  upgraded to avoid unrelated churn.

## 7. Remaining problems / not in scope

- Acoustic accuracy benchmark (Urdu / Roman Urdu) still pending.
- Mic language still follows the app UI; no compact Auto / Urdu / English mic
  control yet.
- The audio-fallback transcript is still not shown before confirmation, and
  `/api/assistant/message` still drops it — Stage 2.
- `MAX_TEXT_CHARS = 500`, the `looksLikeBusinessCommand` gate, and the
  hardcoded `Rs.` in `money()` remain — later stages.
- No STT provider was selected or added (no Groq / Deepgram / Whisper).
- Khata Assistant was neither touched nor extended.

## 8. Confirmation: AI / business logic untouched

`git status` shows the protected files **unchanged**:

```
UNCHANGED src/lib/assistant/ai.ts
UNCHANGED src/lib/assistant/router.ts
UNCHANGED src/lib/assistant/actions.ts
UNCHANGED src/lib/assistant/service.ts
UNCHANGED src/lib/khata-assistant
UNCHANGED src/app/api/assistant/message/route.ts
UNCHANGED src/lib/ai/model-registry.ts
```

No AI prompt, no model list/rotation, no customer/product matching, no action
execution, no DB transaction, and no financial calculation was changed.

## 9. Files changed

- `src/lib/voice/recording-config.ts` (new)
- `src/hooks/assistant/use-speech-recognition.ts`
- `src/hooks/smart-entry/use-audio-recorder.ts`
- `src/hooks/voice-assistant/use-voice-assistant.ts`
- `src/components/voice-assistant/VoiceAssistant.tsx`
- `src/lib/assistant/phrases.ts`
- `scripts/test-voice-recording.tsx` (new)
- `scripts/test-voice-recording-browser.mjs` (new)
- `package.json`, `package-lock.json` (scripts + `jsdom` dev deps)
- `docs/VOICE_RECORDING_STAGE_0_1_REPORT.md` (this file)

## 10. Recommended next stage

**Stage 2 — language control and transcript visibility** (no provider change
yet):

1. restore a compact mic control: Auto (default) / Urdu / English, stored as a
   speech preference that only affects the microphone locale;
2. return the transcript on the audio-fallback path and show it for review
   before the owner confirms;
3. then run the real acoustic Urdu benchmark on real devices (Android Chrome,
   iPhone Safari, desktop Firefox) before choosing any STT provider.

Keep Stage 3 (provider ladder / Whisper) separate and gated on the benchmark.
