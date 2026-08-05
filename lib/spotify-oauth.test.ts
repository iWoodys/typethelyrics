import { describe, expect, it } from "vitest";
import { isAllowedSpotifyOrigin } from "./spotify-oauth";

describe("Spotify OAuth origins", () => {
  it("acepta los dominios web y móvil oficiales", () => {
    expect(isAllowedSpotifyOrigin("https://typethelyrics.sbs")).toBe(true);
    expect(isAllowedSpotifyOrigin("https://m.typethelyrics.sbs")).toBe(true);
  });

  it("rechaza orígenes externos", () => {
    expect(isAllowedSpotifyOrigin("https://typethelyrics.example.com")).toBe(false);
    expect(isAllowedSpotifyOrigin("https://evil.example")).toBe(false);
  });
});
