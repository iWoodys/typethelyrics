import { describe, expect, it } from "vitest";
import {
  completedLineStatus,
  countPositionalMatches,
  isAppendOnlyInput,
} from "./typing";

describe("escritura definitiva", () => {
  it("no permite borrar ni modificar caracteres anteriores", () => {
    expect(isAppendOnlyInput("hola", "hol")).toBe(false);
    expect(isAppendOnlyInput("hola", "hila!")).toBe(false);
    expect(isAppendOnlyInput("hola", "hola!")).toBe(true);
  });

  it("clasifica como parcial una frase completa con errores", () => {
    expect(completedLineStatus("hila", "hola")).toBe("partial");
    expect(countPositionalMatches("hila", "hola")).toBe(3);
    expect(completedLineStatus("hola", "hola")).toBe("perfect");
  });
});
