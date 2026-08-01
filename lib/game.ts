import type { SyncedLyric } from '@/components/types';

export type GameMode = 'relaxed' | 'rhythm' | 'expert' | 'practice' | 'survival';

export const MODE_INFO: Record<GameMode, { name: string; description: string }> = {
  relaxed: { name: 'Relajado', description: 'La canción se pausa si quedás muy atrás.' },
  rhythm: { name: 'Ritmo', description: 'Los versos avanzan con la música.' },
  expert: { name: 'Experto', description: 'Mayúsculas, tildes y signos obligatorios.' },
  practice: { name: 'Práctica', description: 'Repetí una sección sin perder vidas.' },
  survival: { name: 'Supervivencia', description: 'Tres errores y termina la partida.' },
};

export const normalizeText = (value: string, expert: boolean, lowercase: boolean, noPunctuation: boolean) => {
  let text = value.normalize('NFC');
  if (!expert && lowercase) text = text.toLocaleLowerCase();
  if (!expert && noPunctuation) text = text.replace(/[^\p{L}\p{N}\s]/gu, '');
  return text.replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/\s+/g, ' ').trimStart();
};

export const rankFor = (score: number, accuracy: number) =>
  accuracy >= 98 && score >= 12000 ? 'S' : accuracy >= 95 && score >= 7500 ? 'A' : accuracy >= 88 ? 'B' : 'C';

export const difficultyFor = (lyrics: SyncedLyric[]) => {
  if (lyrics.length < 2) return 'Sin clasificar';
  const chars = lyrics.reduce((sum, line) => sum + line.words.length, 0);
  const minutes = Math.max((lyrics.at(-1)!.startTimeMs - lyrics[0].startTimeMs) / 60000, 0.5);
  const cpm = chars / minutes;
  return cpm > 900 ? 'Experto' : cpm > 650 ? 'Difícil' : cpm > 420 ? 'Intermedio' : 'Fácil';
};
