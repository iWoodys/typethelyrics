import { describe, expect, it } from "vitest";
import { completedLineStatus, countPositionalMatches } from "./typing";

describe("evaluación de escritura editable", () => {
  it("clasifica una frase completa como perfecta o parcial", () => {
    expect(completedLineStatus("hola", "hola")).toBe("perfect");
    expect(completedLineStatus("hila", "hola")).toBe("partial");
    expect(countPositionalMatches("hila", "hola")).toBe(3);
  });
});
