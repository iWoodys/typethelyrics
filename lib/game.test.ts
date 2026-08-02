import { describe, expect, it } from "vitest";
import { normalizeText, rankFor } from "./game";

describe("normalizeText",()=>{
  it("conserva signos para que el teclado pueda evaluarlos",()=>expect(normalizeText("Hola, ¿qué tal?",false,true,false)).toBe("hola, ¿qué tal?"));
  it("el modo experto distingue mayúsculas y signos",()=>expect(normalizeText("Árbol—Sí",true,true,true)).toBe("Árbol-Sí"));
  it("puede quitar puntuación en accesibilidad",()=>expect(normalizeText("Hola, (mundo)!",false,true,true)).toBe("hola mundo"));
});

describe("rankFor",()=>{
  it("entrega S solamente con precisión y puntos altos",()=>{expect(rankFor(12000,98)).toBe("S");expect(rankFor(11000,98)).toBe("A");});
});
