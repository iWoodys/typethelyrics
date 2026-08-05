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

export function mobileVerseWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean);
}

export function mobileVerseFontSize(wordCount: number, scale = 1) {
  const preset = wordCount >= 14
    ? { minimum: 1, preferred: 4.2, maximum: 1.4 }
    : wordCount >= 9
      ? { minimum: 1.05, preferred: 4.8, maximum: 1.6 }
      : wordCount >= 6
        ? { minimum: 1.15, preferred: 5.5, maximum: 1.85 }
        : { minimum: 1.35, preferred: 6.5, maximum: 2.1 };
  return `clamp(${preset.minimum * scale}rem, ${preset.preferred * scale}vw, ${preset.maximum * scale}rem)`;
}

export function mobileVersePreview(text: string, maximumWords = 7) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maximumWords) return words.join(" ");
  return `${words.slice(0, maximumWords).join(" ")}…`;
}
