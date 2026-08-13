const PRODUCTION_ORIGIN = "https://typethelyrics.sbs";

export function spotifyOAuthUrls(requestUrl: string) {
  const requestOrigin = new URL(requestUrl).origin;
  const appOrigin = process.env.NODE_ENV === "production"
    ? PRODUCTION_ORIGIN
    : requestOrigin;

  return {
    appOrigin,
    redirectUri: `${appOrigin}/api/spotify/callback`,
  };
}

export async function refreshSpotifyAccessToken(refreshToken: string) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Spotify no está configurado.");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Spotify refresh ${response.status}`);
  return response.json() as Promise<{ access_token: string; expires_in: number; refresh_token?: string }>;
}
