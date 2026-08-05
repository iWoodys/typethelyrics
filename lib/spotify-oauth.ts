const PRODUCTION_ORIGIN = "https://typethelyrics.sbs";
const MOBILE_PRODUCTION_ORIGIN = "https://m.typethelyrics.sbs";

export const SPOTIFY_USER_SCOPES = [
  "playlist-read-private",
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
] as const;

export function isAllowedSpotifyOrigin(origin: string) {
  return origin === PRODUCTION_ORIGIN || origin === MOBILE_PRODUCTION_ORIGIN;
}

export function safeSpotifyReturnTo(value: string | null | undefined) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\r\n]/.test(value)
  )
    return "/";
  return value;
}

type RequestHeaders = Pick<Headers, "get">;

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

export function spotifyOAuthUrls(
  requestUrl: string,
  requestHeaders?: RequestHeaders,
) {
  const parsedRequest = new URL(requestUrl);
  const forwardedHost = firstForwardedValue(
    requestHeaders?.get("x-forwarded-host") || requestHeaders?.get("host") || null,
  );
  const forwardedProtocol = firstForwardedValue(
    requestHeaders?.get("x-forwarded-proto") || null,
  );
  const visibleProtocol = forwardedProtocol || parsedRequest.protocol.replace(":", "");
  const requestOrigin = forwardedHost
    ? `${visibleProtocol}://${forwardedHost}`
    : parsedRequest.origin;
  const appOrigin = process.env.NODE_ENV === "production"
    ? isAllowedSpotifyOrigin(requestOrigin) ? requestOrigin : PRODUCTION_ORIGIN
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
