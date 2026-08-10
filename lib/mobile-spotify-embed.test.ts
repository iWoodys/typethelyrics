import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const individual = readFileSync(join(process.cwd(), "app", "page.tsx"), "utf8");
const multiplayer = readFileSync(
  join(process.cwd(), "app", "multiplayer", "page.tsx"),
  "utf8",
);

describe("reproducción móvil sin allowlist", () => {
  it("utiliza Spotify Embed en individual y multijugador", () => {
    expect(individual).toContain("<SpotifyEmbed");
    expect(multiplayer).toContain("<SpotifyEmbed");
    expect(individual).not.toContain("SpotifyWebPlayer");
    expect(multiplayer).not.toContain("SpotifyWebPlayer");
    expect(individual).not.toContain("SpotifyPremiumGate");
    expect(multiplayer).not.toContain("SpotifyPremiumGate");
  });

  it("abre Spotify Web sin iniciar el OAuth de la aplicación para jugar", () => {
    expect(individual).toContain('href="https://open.spotify.com/"');
    expect(multiplayer).toContain('href="https://open.spotify.com/"');
  });

  it("bloquea una vista previa para evitar partidas sin la canción completa", () => {
    expect(individual).toContain('spotifyStatus === "preview"');
    expect(multiplayer).toContain('spotifyStatus === "preview"');
  });
});
