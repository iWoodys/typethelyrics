import { describe, expect, it } from "vitest";
import {
  completedLineStatus,
  countPositionalMatches,
  partialLinePoints,
  shouldCompleteLine,
  typingAlignment,
} from "./typing";

describe("evaluación de escritura editable", () => {
  it("clasifica una frase completa como perfecta o parcial", () => {
    expect(completedLineStatus("hola", "hola")).toBe("perfect");
    expect(completedLineStatus("hila", "hola")).toBe("partial");
    expect(countPositionalMatches("hila", "hola")).toBe(3);
  });

  it("no avanza una frase errónea aunque tenga la longitud esperada", () => {
    expect(shouldCompleteLine("hila", "hola")).toBe(false);
    expect(shouldCompleteLine("hola", "hola")).toBe(true);
  });

  it("conserva puntos parciales al vencer el tiempo", () => {
    expect(partialLinePoints("hila", "hola")).toBe(9);
  });

  it("aísla una letra insertada sin volver erróneo todo lo posterior", () => {
    const result = typingAlignment("hxola", "hola");
    expect(result.matches).toBe(4);
    expect(result.errors).toBe(1);
    expect(result.feedback.filter((status) => status === "incorrect")).toHaveLength(1);
    expect(result.feedback.at(-1)).toBe("correct");
  });

  it("deja pendiente la parte de la frase que todavía no se escribió", () => {
    expect(typingAlignment("hol", "hola").feedback).toEqual([
      "correct",
      "correct",
      "correct",
      "pending",
    ]);
  });
});
