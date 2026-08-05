import { describe, expect, it } from "vitest";
import {
  mobileVerseFontSize,
  mobileViewportMetrics,
  mobileVersePreview,
  mobileVerseWords,
} from "./mobile-game";

describe("mobile gameplay helpers", () => {
  it("mantiene todas las palabras de los versos largos", () => {
    expect(
      mobileVerseWords("uno dos tres cuatro cinco seis siete"),
    ).toEqual(["uno", "dos", "tres", "cuatro", "cinco", "seis", "siete"]);
  });

  it("mantiene completos los versos cortos y resume la vista previa", () => {
    expect(mobileVerseWords("uno dos tres")).toEqual(["uno", "dos", "tres"]);
    expect(mobileVersePreview("uno dos tres cuatro", 3)).toBe("uno dos tres…");
  });

  it("reduce el texto sin ocultar palabras cuando el verso es largo", () => {
    expect(mobileVerseFontSize(4)).toBe("clamp(1.35rem, 6.5vw, 2.1rem)");
    expect(mobileVerseFontSize(15)).toBe("clamp(1rem, 4.2vw, 1.4rem)");
  });

  it("incluye el desplazamiento visual del teclado en el alto CSS", () => {
    expect(mobileViewportMetrics(915, 734, 101)).toEqual({
      cssHeight: 835,
      obscuredHeight: 80,
    });
    expect(mobileViewportMetrics(915, 500, 0)).toEqual({
      cssHeight: 500,
      obscuredHeight: 415,
    });
  });
});
