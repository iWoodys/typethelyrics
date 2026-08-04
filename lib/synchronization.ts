import type { SyncedLyric } from "@/components/types";

export function normalizeTimeScale(value: number) {
  return Number.isFinite(value) && value >= 0.97 && value <= 1.03 ? value : 1;
}

export function normalizeDeviceOffset(value: number) {
  if (!Number.isFinite(value)) return 0;
  // Un navegador no debería necesitar varios segundos de compensación.
  // Los valores antiguos de ese tamaño solían venir de calibrar una letra
  // incorrecta y terminaban desincronizando todas las canciones.
  if (Math.abs(value) > 1_200) return 0;
  return Math.round(value);
}

export function deviceOffsetFromFirstVoice(
  firstLyricMs: number,
  playbackPositionMs: number,
  timeScale: number,
) {
  return normalizeDeviceOffset(
    firstLyricMs * normalizeTimeScale(timeScale) - playbackPositionMs,
  );
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

export type MultiplayerPlaybackPhase = "prepare" | "play" | "started";

export function multiplayerPlaybackPhase(
  remainingMs: number,
): MultiplayerPlaybackPhase {
  if (remainingMs > 150) return "prepare";
  if (remainingMs > 0) return "play";
  return "started";
}
