import { describe, expect, it } from "vitest";
import {
  activeTypedWord,
  mobileVersePreview,
  mobileVerseWindow,
} from "./mobile-game";

describe("mobile gameplay helpers", () => {
  it("detecta la palabra que se esta escribiendo", () => {
    expect(activeTypedWord("")).toBe(0);
    expect(activeTypedWord("hola")).toBe(0);
    expect(activeTypedWord("hola ")).toBe(1);
    expect(activeTypedWord("hola gran mundo")).toBe(2);
  });

  it("divide versos largos sin perder el indice original", () => {
    expect(mobileVerseWindow("uno dos tres cuatro cinco seis siete", 5, 5)).toEqual({
      startWord: 5,
      endWord: 7,
      words: ["seis", "siete"],
      totalWords: 7,
    });
  });

  it("mantiene completos los versos cortos y resume la vista previa", () => {
    expect(mobileVerseWindow("uno dos tres", 2, 5).words).toEqual([
      "uno",
      "dos",
      "tres",
    ]);
    expect(mobileVersePreview("uno dos tres cuatro", 3)).toBe("uno dos tres…");
  });
});
