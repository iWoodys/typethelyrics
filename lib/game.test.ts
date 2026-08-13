import { describe, expect, it } from "vitest";
import {
  canTypeMultiplayerLine,
  GAME_MODES,
  multiplayerLinePolicy,
  MULTIPLAYER_GAME_MODE_DETAILS,
  normalizeGameMode,
  normalizeText,
  rankFor,
  shouldPauseEasyMode,
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

  it("solo permite que Fácil pause una partida individual", () => {
    const state = {
      started: true,
      playing: true,
      allLinesComplete: false,
      effectivePosition: 9_800,
      nextLineStart: 10_000,
      attempt: "hol",
      target: "hola",
    };
    expect(shouldPauseEasyMode({ ...state, mode: "rhythm" })).toBe(false);
    expect(shouldPauseEasyMode({ ...state, mode: "expert" })).toBe(false);
  });

  it("convierte modos inválidos a Normal", () => {
    expect(normalizeGameMode("removed-mode")).toBe("rhythm");
    expect(normalizeGameMode("expert")).toBe("expert");
  });

  it("habilita el teclado por el reloj compartido de la sala", () => {
    expect(
      canTypeMultiplayerLine({
        started: true,
        countdown: 0,
        singerStarted: true,
        finished: false,
        allLinesComplete: false,
        lineIndex: 2,
        timedIndex: 2,
      }),
    ).toBe(true);
  });

  it("mantiene bloqueado el teclado antes de que empiece la voz", () => {
    expect(
      canTypeMultiplayerLine({
        started: true,
        countdown: 0,
        singerStarted: false,
        finished: false,
        allLinesComplete: false,
        lineIndex: 0,
        timedIndex: 0,
      }),
    ).toBe(false);
  });

  it("no depende del estado local del reproductor de cada jugador", () => {
    expect(
      canTypeMultiplayerLine({
        started: true,
        countdown: 0,
        singerStarted: true,
        finished: false,
        allLinesComplete: false,
        lineIndex: 1,
        timedIndex: 3,
      }),
    ).toBe(true);
  });
});

describe("modo Fácil", () => {
  it("pausa antes del siguiente verso si la frase sigue incompleta", () => {
    expect(
      shouldPauseEasyMode({
        mode: "relaxed",
        started: true,
        playing: true,
        allLinesComplete: false,
        effectivePosition: 9_800,
        nextLineStart: 10_000,
        attempt: "hol",
        target: "hola",
      }),
    ).toBe(true);
  });

  it("no pausa después de completar el último verso", () => {
    expect(
      shouldPauseEasyMode({
        mode: "relaxed",
        started: true,
        playing: true,
        allLinesComplete: true,
        effectivePosition: 20_000,
        nextLineStart: 10_000,
        attempt: "",
        target: "hola",
      }),
    ).toBe(false);
  });
});
