import { describe, expect, it } from "vitest";
import {
  SPOTIFY_USER_SCOPES,
  isAllowedSpotifyOrigin,
  safeSpotifyReturnTo,
} from "./spotify-oauth";

describe("Spotify OAuth origins", () => {
  it("acepta los dominios web y móvil oficiales", () => {
    expect(isAllowedSpotifyOrigin("https://typethelyrics.sbs")).toBe(true);
    expect(isAllowedSpotifyOrigin("https://m.typethelyrics.sbs")).toBe(true);
  });

  it("rechaza orígenes externos", () => {
    expect(isAllowedSpotifyOrigin("https://typethelyrics.example.com")).toBe(false);
    expect(isAllowedSpotifyOrigin("https://evil.example")).toBe(false);
  });

  it("solicita los permisos necesarios para reproducir en móvil", () => {
    expect(SPOTIFY_USER_SCOPES).toEqual(
      expect.arrayContaining([
        "streaming",
        "user-read-private",
        "user-read-playback-state",
        "user-modify-playback-state",
      ]),
    );
  });

  it("solo acepta retornos internos después de autorizar", () => {
    expect(safeSpotifyReturnTo("/multiplayer?room=ABC123")).toBe(
      "/multiplayer?room=ABC123",
    );
    expect(safeSpotifyReturnTo("https://evil.example")).toBe("/");
    expect(safeSpotifyReturnTo("//evil.example")).toBe("/");
    expect(safeSpotifyReturnTo("/\\evil.example")).toBe("/");
  });
});
