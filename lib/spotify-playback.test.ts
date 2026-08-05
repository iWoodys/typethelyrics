import { describe, expect, it } from "vitest";
import { isLikelySpotifyPreview } from "./spotify-playback";

const fullTrack = {
  expectedDurationMs: 210_000,
  reportedDurationMs: 210_000,
  positionMs: 12_000,
  isPaused: false,
  isBuffering: false,
  wasPlaying: true,
  nowMs: 10_000,
  lastPauseCommandAtMs: 0,
};

describe("isLikelySpotifyPreview", () => {
  it("detects a reported 30-second duration for a full song", () => {
    expect(
      isLikelySpotifyPreview({
        ...fullTrack,
        reportedDurationMs: 30_000,
      }),
    ).toBe(true);
  });

  it("detects an unexpected stop around the preview boundary", () => {
    expect(
      isLikelySpotifyPreview({
        ...fullTrack,
        positionMs: 29_500,
        isPaused: true,
      }),
    ).toBe(true);
  });

  it("does not confuse an intentional pause with a preview", () => {
    expect(
      isLikelySpotifyPreview({
        ...fullTrack,
        positionMs: 29_500,
        isPaused: true,
        nowMs: 10_000,
        lastPauseCommandAtMs: 9_500,
      }),
    ).toBe(false);
  });

  it("does not flag a normal full-duration playback", () => {
    expect(isLikelySpotifyPreview(fullTrack)).toBe(false);
  });
});
