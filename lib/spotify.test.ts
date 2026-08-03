import { describe, expect, it } from "vitest";
import {
  selectBestLyricsCandidate,
  type LrclibCandidate,
} from "./spotify";

const track = {
  name: "Sorry Papi",
  duration_ms: 163_000,
  artists: [{ name: "Bad Bunny" }, { name: "ABRA" }],
  album: { name: "EL ÚLTIMO TOUR DEL MUNDO", images: [] },
};

const candidate = (
  overrides: Partial<LrclibCandidate>,
): LrclibCandidate => ({
  id: 1,
  trackName: "Sorry Papi",
  artistName: "Bad Bunny, ABRA",
  albumName: "EL ÚLTIMO TOUR DEL MUNDO",
  duration: 163,
  plainLyrics: "letra",
  syncedLyrics: "[00:01.00] letra",
  instrumental: false,
  ...overrides,
});

describe("selectBestLyricsCandidate", () => {
  it("prefiere la edición correcta antes que una versión en vivo", () => {
    const result = selectBestLyricsCandidate(
      [
        candidate({ id: 2, trackName: "Sorry Papi - Live", duration: 163 }),
        candidate({ id: 3 }),
      ],
      track,
    );
    expect(result?.candidate.id).toBe(3);
    expect(result?.confidence).toBe("exact");
  });

  it("prefiere la duración más cercana entre metadatos equivalentes", () => {
    const result = selectBestLyricsCandidate(
      [candidate({ id: 4, duration: 174 }), candidate({ id: 5, duration: 164 })],
      track,
    );
    expect(result?.candidate.id).toBe(5);
  });

  it("sólo propone escalas temporales dentro de un margen seguro", () => {
    expect(
      selectBestLyricsCandidate([candidate({ duration: 161 })], track)
        ?.suggestedTimeScale,
    ).toBeCloseTo(163 / 161, 5);
    expect(
      selectBestLyricsCandidate([candidate({ duration: 140 })], track)
        ?.suggestedTimeScale,
    ).toBe(1);
  });
});
