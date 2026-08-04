export function countPositionalMatches(attempt: string, target: string) {
  return [...attempt.slice(0, target.length)].filter(
    (character, index) => character === target[index],
  ).length;
}

export type WordTypingResult = {
  typed: string;
  failedWords: number[];
  lockedLength: number;
  correctDelta: number;
  mistakeDelta: number;
  wordFailed: boolean;
  completed: boolean;
};

const wordIndexAt = (target: string, position: number) => {
  const before = target.slice(0, position).trim();
  return before ? before.split(/\s+/).length : 0;
};

export function applyWordTypingKey(
  typed: string,
  target: string,
  failedWords: number[],
  key: string,
): WordTypingResult {
  const cursor = typed.length;
  if (cursor >= target.length || key.length !== 1) {
    return {
      typed,
      failedWords,
      lockedLength: 0,
      correctDelta: 0,
      mistakeDelta: 0,
      wordFailed: false,
      completed: cursor >= target.length,
    };
  }

  const expected = target[cursor];
  if (key === expected) {
    const nextTyped = typed + key;
    return {
      typed: nextTyped,
      failedWords,
      lockedLength: 0,
      correctDelta: 1,
      mistakeDelta: 0,
      wordFailed: false,
      completed: nextTyped.length >= target.length,
    };
  }

  // Si el jugador omite solamente el espacio, avanzamos al comienzo de la
  // siguiente palabra y evaluamos allí la tecla pulsada.
  if (expected === " ") {
    return applyWordTypingKey(typed + " ", target, failedWords, key);
  }

  const wordStart = target.lastIndexOf(" ", Math.max(0, cursor - 1)) + 1;
  const separator = target.indexOf(" ", cursor);
  const wordEnd = separator === -1 ? target.length : separator;
  const wordIndex = wordIndexAt(target, wordStart);
  const nextFailedWords = failedWords.includes(wordIndex)
    ? failedWords
    : [...failedWords, wordIndex];
  const nextTyped =
    typed +
    target.slice(cursor, wordEnd) +
    (wordEnd < target.length ? " " : "");

  return {
    typed: nextTyped,
    failedWords: nextFailedWords,
    lockedLength: nextTyped.length,
    correctDelta: -(cursor - wordStart),
    mistakeDelta: wordEnd - wordStart,
    wordFailed: true,
    completed: nextTyped.length >= target.length,
  };
}

export function countSuccessfulCharacters(
  target: string,
  failedWords: number[],
) {
  return countSuccessfulTypedCharacters(target, target, failedWords);
}

export function countSuccessfulTypedCharacters(
  attempt: string,
  target: string,
  failedWords: number[],
) {
  const failed = new Set(failedWords);
  let wordIndex = 0;
  let matches = 0;
  for (let index = 0; index < Math.min(attempt.length, target.length); index += 1) {
    if (
      attempt[index] === target[index] &&
      (target[index] === " " || !failed.has(wordIndex))
    )
      matches += 1;
    if (target[index] === " ") wordIndex += 1;
  }
  return matches;
}

export function formatFailedWords(target: string, failedWords: number[]) {
  const failed = new Set(failedWords);
  return target
    .split(" ")
    .map((word, index) =>
      failed.has(index) ? "×".repeat([...word].length) : word,
    )
    .join(" ");
}
