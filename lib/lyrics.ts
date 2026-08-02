import type { SyncedLyric } from "@/components/types";

export const MAX_LYRIC_LINES = 2_000;
export const MAX_LINE_LENGTH = 500;

export function validateSyncedLyrics(value: unknown, durationMs?: number | null): SyncedLyric[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LYRIC_LINES) {
    throw new Error("La letra sincronizada no tiene una cantidad válida de líneas.");
  }

  let previous = -1;
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`La línea ${index + 1} no es válida.`);
    const candidate = raw as Record<string, unknown>;
    const startTimeMs = Number(candidate.startTimeMs);
    const words = typeof candidate.words === "string" ? candidate.words.trim() : "";
    if (!Number.isFinite(startTimeMs) || startTimeMs < 0 || startTimeMs < previous) {
      throw new Error(`El tiempo de la línea ${index + 1} no es válido o está desordenado.`);
    }
    if (durationMs && startTimeMs > durationMs + 5_000) {
      throw new Error(`La línea ${index + 1} comienza después de terminar la canción.`);
    }
    if (!words || words.length > MAX_LINE_LENGTH) {
      throw new Error(`El texto de la línea ${index + 1} está vacío o es demasiado largo.`);
    }
    previous = startTimeMs;
    return { startTimeMs: Math.round(startTimeMs), words };
  });
}

export function lyricCapacity(lyrics: SyncedLyric[]) {
  const characters = lyrics.reduce((total, line) => total + line.words.length, 0);
  const maximumScore = characters * 130 + lyrics.length * 350;
  return { characters, maximumScore };
}
