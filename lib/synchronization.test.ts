import { describe, expect, it } from "vitest";
import {
  deviceOffsetFromFirstVoice,
  lyricClockFromPlayback,
  normalizeDeviceOffset,
  normalizeTimeScale,
  scaleLyricsToPlayback,
} from "./synchronization";

describe("synchronization", () => {
  it("convierte el reloj de Spotify al reloj original de la letra", () => {
    expect(lyricClockFromPlayback(10_100, 0, 1.01)).toBeCloseTo(10_000);
    expect(lyricClockFromPlayback(9_500, 500, 1)).toBe(10_000);
  });

  it("rechaza escalas peligrosas", () => {
    expect(normalizeTimeScale(1.5)).toBe(1);
    expect(normalizeTimeScale(Number.NaN)).toBe(1);
  });

  it("escala todos los versos sobre la línea temporal de reproducción", () => {
    expect(
      scaleLyricsToPlayback([{ startTimeMs: 10_000, words: "Hola" }], 1.01),
    ).toEqual([{ startTimeMs: 10_100, words: "Hola" }]);
  });

  it("calibra una sola vez la latencia de este dispositivo", () => {
    expect(deviceOffsetFromFirstVoice(10_000, 10_650, 1)).toBe(-650);
    expect(deviceOffsetFromFirstVoice(10_000, 9_700, 1)).toBe(300);
    expect(normalizeDeviceOffset(50_000)).toBe(5_000);
  });
});
