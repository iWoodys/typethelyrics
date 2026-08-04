import { describe, expect, it } from "vitest";
import {
  applyWordTypingKey,
  countPositionalMatches,
  countSuccessfulCharacters,
  countSuccessfulTypedCharacters,
  formatFailedWords,
} from "./typing";

describe("escritura por palabras", () => {
  it("marca la palabra completa y salta a la siguiente al primer error", () => {
    const result = applyWordTypingKey("ho", "hola mundo", [], "x");
    expect(result.typed).toBe("hola ");
    expect(result.failedWords).toEqual([0]);
    expect(result.lockedLength).toBe(5);
    expect(result.correctDelta).toBe(-2);
    expect(result.mistakeDelta).toBe(4);
    expect(result.wordFailed).toBe(true);
  });

  it("continúa normalmente con la palabra siguiente", () => {
    const result = applyWordTypingKey("hola ", "hola mundo", [0], "m");
    expect(result.typed).toBe("hola m");
    expect(result.correctDelta).toBe(1);
    expect(result.wordFailed).toBe(false);
  });

  it("calcula puntos solamente por palabras acertadas", () => {
    expect(countSuccessfulCharacters("hola mundo", [0])).toBe(6);
    expect(countSuccessfulTypedCharacters("hola mu", "hola mundo", [0])).toBe(3);
    expect(formatFailedWords("hola mundo", [0])).toBe("×××× mundo");
    expect(countPositionalMatches("hila", "hola")).toBe(3);
  });
});
