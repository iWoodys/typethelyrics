import type { SyncedLyric } from "@/components/types";

export const GAME_MODES = ["relaxed", "rhythm", "expert"] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const normalizeGameMode = (value: unknown): GameMode =>
  GAME_MODES.includes(value as GameMode) ? (value as GameMode) : "rhythm";

export const MODE_INFO: Record<
  GameMode,
  { name: string; description: string }
> = {
  relaxed: {
    name: "Fácil",
    description: "La canción espera si quedás muy atrás.",
  },
  rhythm: {
    name: "Normal",
    description: "Los versos avanzan con la música.",
  },
  expert: {
    name: "Difícil",
    description: "Mayúsculas, tildes y signos obligatorios.",
  },
};

export const GAME_MODE_DETAILS: Record<
  GameMode,
  { name: string; description: string; rules: string[] }
> = {
  relaxed: {
    name: "Fácil",
    description: "Aprendé la letra sin que la música te deje atrás.",
    rules: [
      "La canción se pausa si no terminaste el verso.",
      "Podés seguir escribiendo durante la pausa.",
      "Al completar la frase, la reproducción continúa.",
    ],
  },
  rhythm: {
    name: "Normal",
    description: "Seguí los versos en el tiempo real de la canción.",
    rules: [
      "La canción nunca espera.",
      "Las frases incompletas quedan marcadas en rojo.",
      "Los combos y las respuestas a tiempo dan más puntos.",
    ],
  },
  expert: {
    name: "Difícil",
    description: "La versión más estricta de TypeTheLyrics.",
    rules: [
      "Distingue mayúsculas y minúsculas.",
      "Exige tildes y todos los signos.",
      "Los versos avanzan al ritmo de la canción.",
    ],
  },
};

// En una sala todos comparten el mismo reloj. Pausar la canción para un solo
// jugador rompería la sincronización, por eso Fácil avanza sin penalizar.
export const MULTIPLAYER_GAME_MODE_DETAILS: typeof GAME_MODE_DETAILS = {
  ...GAME_MODE_DETAILS,
  relaxed: {
    name: "Fácil",
    description: "Seguí la canción sin penalización por versos incompletos.",
    rules: [
      "Los versos avanzan con la música para mantener sincronizada la sala.",
      "Una frase incompleta no resta puntos ni rompe el combo.",
      "La pausa para terminar versos está disponible en el modo individual.",
    ],
  },
};

export const multiplayerLinePolicy = (mode: GameMode) => ({
  advanceWithClock: true,
  penalizeMissed: mode !== "relaxed",
});

export const normalizeText = (
  value: string,
  expert: boolean,
  lowercase: boolean,
  noPunctuation: boolean,
) => {
  let text = value.normalize("NFC");
  if (!expert && lowercase) text = text.toLocaleLowerCase();
  if (!expert && noPunctuation) text = text.replace(/[^\p{L}\p{N}\s]/gu, "");
  return text
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trimStart();
};

export const rankFor = (score: number, accuracy: number) =>
  accuracy >= 98 && score >= 12000
    ? "S"
    : accuracy >= 95 && score >= 7500
      ? "A"
      : accuracy >= 88
        ? "B"
        : "C";

export const difficultyFor = (lyrics: SyncedLyric[]) => {
  if (lyrics.length < 2) return "Sin clasificar";
  const chars = lyrics.reduce((sum, line) => sum + line.words.length, 0);
  const minutes = Math.max(
    (lyrics.at(-1)!.startTimeMs - lyrics[0].startTimeMs) / 60000,
    0.5,
  );
  const cpm = chars / minutes;
  return cpm > 900
    ? "Experto"
    : cpm > 650
      ? "Difícil"
      : cpm > 420
        ? "Intermedio"
        : "Fácil";
};
