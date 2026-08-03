import type { SyncedLyric } from "@/components/types";

export type GameMode =
  "relaxed" | "rhythm" | "expert" | "practice" | "survival";

export const MODE_INFO: Record<
  GameMode,
  { name: string; description: string }
> = {
  relaxed: {
    name: "Relajado",
    description: "La canción se pausa si quedás muy atrás.",
  },
  rhythm: { name: "Ritmo", description: "Los versos avanzan con la música." },
  expert: {
    name: "Experto",
    description: "Mayúsculas, tildes y signos obligatorios.",
  },
  practice: {
    name: "Práctica",
    description: "Repetí una sección sin perder vidas.",
  },
  survival: {
    name: "Supervivencia",
    description: "Tres errores y termina la partida.",
  },
};

export const GAME_MODE_DETAILS: Record<
  GameMode,
  { name: string; description: string; rules: string[] }
> = {
  relaxed: {
    name: "Relajado",
    description: "Aprendé la letra sin que la música te deje atrás.",
    rules: [
      "La canción se pausa si no terminaste el verso.",
      "Podés seguir escribiendo durante la pausa.",
      "Al completar la frase, la reproducción continúa.",
    ],
  },
  rhythm: {
    name: "Ritmo",
    description: "Seguí los versos en el tiempo real de la canción.",
    rules: [
      "La canción nunca espera.",
      "Las frases incompletas quedan marcadas en rojo.",
      "Los combos y las respuestas a tiempo dan más puntos.",
    ],
  },
  expert: {
    name: "Experto",
    description: "La versión más estricta de TypeTheLyrics.",
    rules: [
      "Distingue mayúsculas y minúsculas.",
      "Exige tildes y todos los signos.",
      "Los versos avanzan al ritmo de la canción.",
    ],
  },
  practice: {
    name: "Práctica",
    description: "Entrená desde el verso actual sin presión de tiempo.",
    rules: [
      "Empieza en el verso que está sonando.",
      "El verso no se salta si tardás.",
      "No utiliza vidas.",
    ],
  },
  survival: {
    name: "Supervivencia",
    description: "Llegá tan lejos como puedas con solo tres vidas.",
    rules: [
      "Cada error consume una vida.",
      "Omitir un verso también consume una vida.",
      "La partida termina al llegar a cero vidas.",
    ],
  },
};

// En una sala todos comparten el mismo reloj. Pausar la canción para un solo
// jugador rompería la sincronización, por eso Relajado avanza sin penalizar.
export const MULTIPLAYER_GAME_MODE_DETAILS: typeof GAME_MODE_DETAILS = {
  ...GAME_MODE_DETAILS,
  relaxed: {
    name: "Relajado",
    description: "Seguí la canción sin penalización por versos incompletos.",
    rules: [
      "Los versos avanzan con la música para mantener sincronizada la sala.",
      "Una frase incompleta no resta puntos ni rompe el combo.",
      "La pausa para terminar versos está disponible en el modo individual.",
    ],
  },
};

export const multiplayerLinePolicy = (mode: GameMode) => ({
  advanceWithClock: mode !== "practice",
  penalizeMissed: mode !== "relaxed" && mode !== "practice",
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
