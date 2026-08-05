export type MobileVerseWindow = {
  startWord: number;
  endWord: number;
  words: string[];
  totalWords: number;
};

export function mobileViewportMetrics(
  innerHeight: number,
  viewportHeight: number,
  viewportOffsetTop: number,
) {
  const visibleBottom = Math.max(
    0,
    Math.round(viewportHeight + Math.max(0, viewportOffsetTop)),
  );
  return {
    cssHeight: visibleBottom,
    obscuredHeight: Math.max(0, Math.round(innerHeight - visibleBottom)),
  };
}

export function activeTypedWord(value: string) {
  const normalized = value.trimStart();
  if (!normalized) return 0;
  const completedWords = (normalized.match(/\s+/g) || []).length;
  return Math.max(0, completedWords);
}

export function mobileVerseWindow(
  text: string,
  activeWord: number,
  wordsPerWindow = 5,
): MobileVerseWindow {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const totalWords = words.length;
  if (!totalWords) return { startWord: 0, endWord: 0, words: [], totalWords: 0 };

  const safeWindow = Math.max(1, Math.floor(wordsPerWindow));
  if (totalWords <= safeWindow) {
    return { startWord: 0, endWord: totalWords, words, totalWords };
  }

  const safeActiveWord = Math.max(0, Math.min(totalWords - 1, activeWord));
  const startWord = Math.floor(safeActiveWord / safeWindow) * safeWindow;
  const endWord = Math.min(totalWords, startWord + safeWindow);
  return {
    startWord,
    endWord,
    words: words.slice(startWord, endWord),
    totalWords,
  };
}

export function mobileVersePreview(text: string, maximumWords = 7) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maximumWords) return words.join(" ");
  return `${words.slice(0, maximumWords).join(" ")}…`;
}
