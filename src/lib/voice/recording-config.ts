/**
 * Shared recording limits for both voice paths:
 *
 *   - browser SpeechRecognition (Chrome/Edge/Safari/Android)
 *   - MediaRecorder fallback (Firefox, or browsers without recognition)
 *
 * Keeping the numbers in one place prevents the two paths from drifting
 * apart. They are intentionally conservative for a busy wholesale counter:
 * a shopkeeper often pauses to check a register or read a name, and the old
 * 2-second/30-second limits cut those sentences off.
 */

export type RecordingConfig = {
  /** Hard safety cap. The recording is never allowed to run longer. */
  maxDurationMs: number;
  /** How long a natural pause may last before the recording is finished. */
  silenceGraceMs: number;
  /** If nobody speaks at all, stop and explain instead of recording silence. */
  noSpeechTimeoutMs: number;
  /** Delay before re-creating a browser recognizer that ended on its own. */
  restartDelayMs: number;
  /** Safety valve against an endless restart loop. */
  maxRestarts: number;
};

export const RECORDING_DEFAULTS: RecordingConfig = {
  maxDurationMs: 60_000,
  silenceGraceMs: 4_000,
  noSpeechTimeoutMs: 12_000,
  restartDelayMs: 200,
  maxRestarts: 40,
};

/** Merge caller overrides (used by tests) with the product defaults. */
export function resolveRecordingConfig(
  overrides?: Partial<RecordingConfig>,
): RecordingConfig {
  return { ...RECORDING_DEFAULTS, ...overrides };
}

/** mm:ss for the live recording timer. */
export function formatRecordingDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}