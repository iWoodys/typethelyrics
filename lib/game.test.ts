import { describe, expect, it } from "vitest";
import {
  GAME_MODES,
  multiplayerLinePolicy,
  MULTIPLAYER_GAME_MODE_DETAILS,
  normalizeGameMode,
  normalizeText,
  rankFor,
} from "./game";

describe("normalizeText",()=>{
  it("conserva signos para que el teclado pueda evaluarlos",()=>expect(normalizeText("Hola, ¿qué tal?",false,true,false)).toBe("hola, ¿qué tal?"));
  it("el modo experto distingue mayúsculas y signos",()=>expect(normalizeText("Árbol—Sí",true,true,true)).toBe("Árbol-Sí"));
  it("puede quitar puntuación en accesibilidad",()=>expect(normalizeText("Hola, (mundo)!",false,true,true)).toBe("hola mundo"));
});

describe("rankFor",()=>{
  it("entrega S solamente con precisión y puntos altos",()=>{expect(rankFor(12000,98)).toBe("S");expect(rankFor(11000,98)).toBe("A");});
});

describe("multiplayerLinePolicy", () => {
  it("ofrece únicamente Fácil, Normal y Difícil", () => {
    expect(GAME_MODES).toEqual(["relaxed", "rhythm", "expert"]);
    expect(GAME_MODES.map((mode) => MULTIPLAYER_GAME_MODE_DETAILS[mode].name)).toEqual([
      "Fácil",
      "Normal",
      "Difícil",
    ]);
  });

  it("hace avanzar Fácil con el reloj sin penalizar", () => {
    expect(multiplayerLinePolicy("relaxed")).toEqual({ advanceWithClock: true, penalizeMissed: false });
    expect(MULTIPLAYER_GAME_MODE_DETAILS.relaxed.description).not.toContain("pausa");
  });

  it("mantiene las penalizaciones de Normal y Difícil", () => {
    expect(multiplayerLinePolicy("rhythm").penalizeMissed).toBe(true);
    expect(multiplayerLinePolicy("expert").penalizeMissed).toBe(true);
  });

  it("convierte modos inválidos a Normal", () => {
    expect(normalizeGameMode("removed-mode")).toBe("rhythm");
    expect(normalizeGameMode("expert")).toBe("expert");
  });
});
