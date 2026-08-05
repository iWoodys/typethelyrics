type SpotifyPreviewEvidence = {
  expectedDurationMs: number;
  reportedDurationMs: number;
  positionMs: number;
  isPaused: boolean;
  isBuffering: boolean;
  wasPlaying: boolean;
  nowMs: number;
  lastPauseCommandAtMs: number;
};

export function isLikelySpotifyPreview({
  expectedDurationMs,
  reportedDurationMs,
  positionMs,
  isPaused,
  isBuffering,
  wasPlaying,
  nowMs,
  lastPauseCommandAtMs,
}: SpotifyPreviewEvidence) {
  if (expectedDurationMs <= 60_000) return false;

  const shortReportedDuration =
    reportedDurationMs > 0 &&
    reportedDurationMs <= 35_000 &&
    reportedDurationMs < expectedDurationMs * 0.6;
  const stoppedAtPreviewBoundary =
    wasPlaying &&
    isPaused &&
    !isBuffering &&
    positionMs >= 27_000 &&
    positionMs <= 32_000 &&
    nowMs - lastPauseCommandAtMs > 2_000;

  return shortReportedDuration || stoppedAtPreviewBoundary;
}
