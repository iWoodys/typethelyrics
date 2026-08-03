import type { SyncedLyric } from "@/components/types";

export function normalizeTimeScale(value: number) {
  return Number.isFinite(value) && value >= 0.97 && value <= 1.03 ? value : 1;
}

export function lyricClockFromPlayback(
  playbackPositionMs: number,
  offsetMs: number,
  timeScale: number,
) {
  return (
    (Math.max(0, playbackPositionMs) + offsetMs) /
    normalizeTimeScale(timeScale)
  );
}

export function scaleLyricsToPlayback(
  lyrics: SyncedLyric[],
  timeScale: number,
) {
  const normalizedScale = normalizeTimeScale(timeScale);
  return lyrics.map((line) => ({
    ...line,
    startTimeMs: Math.max(0, Math.round(line.startTimeMs * normalizedScale)),
  }));
}
