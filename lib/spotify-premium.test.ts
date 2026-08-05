import { describe, expect, it } from "vitest";
import { classifySpotifyPremiumSession } from "./spotify-premium";

describe("Spotify Premium session", () => {
  it("bloquea una sesión desconectada o que necesita autorización", () => {
    expect(classifySpotifyPremiumSession({ connected: false })).toBe(
      "disconnected",
    );
    expect(
      classifySpotifyPremiumSession({
        connected: true,
        premium: true,
        requiresReconnect: true,
      }),
    ).toBe("disconnected");
  });

  it("rechaza un plan gratuito confirmado", () => {
    expect(
      classifySpotifyPremiumSession({ connected: true, premium: false }),
    ).toBe("free");
  });

  it("delega al SDK cuando Spotify oculta el tipo de plan", () => {
    expect(
      classifySpotifyPremiumSession({ connected: true, premium: null }),
    ).toBe("premium");
    expect(classifySpotifyPremiumSession({ connected: true })).toBe("premium");
  });
});
