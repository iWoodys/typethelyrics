import { describe, expect, it } from "vitest";
import {
  completedLineStatus,
  countPositionalMatches,
  partialLinePoints,
  shouldCompleteLine,
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
});
