import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { refreshSpotifyAccessToken } from "@/lib/spotify-oauth";

type SpotifyProfile = {
  id?: string;
  product?: string;
};

const accessCookie = (accessToken: string, expiresIn: number) => ({
  name: "spotify_user_token",
  value: accessToken,
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.max(60, expiresIn - 60),
  },
});

async function readProfile(accessToken: string) {
  const response = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`SPOTIFY_PROFILE_${response.status}`);
  return response.json() as Promise<SpotifyProfile>;
}

export async function GET() {
  const cookieStore = await cookies();
  let accessToken = cookieStore.get("spotify_user_token")?.value;
  const refreshToken = cookieStore.get("spotify_refresh_token")?.value;
  let refreshed: Awaited<ReturnType<typeof refreshSpotifyAccessToken>> | null = null;

  try {
    if (!accessToken && refreshToken) {
      refreshed = await refreshSpotifyAccessToken(refreshToken);
      accessToken = refreshed.access_token;
    }
    if (!accessToken) {
      return NextResponse.json(
        { connected: false, premium: false, connectUrl: "/api/spotify/login" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    let profile: SpotifyProfile;
    try {
      profile = await readProfile(accessToken);
    } catch (error) {
      if (!refreshToken || !String(error).includes("SPOTIFY_PROFILE_401")) throw error;
      refreshed = await refreshSpotifyAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      profile = await readProfile(accessToken);
    }

    // En Development Mode Spotify puede omitir `product` de GET /me. Cuando
    // eso ocurre dejamos que Web Playback SDK valide la suscripción mediante
    // su evento `account_error`, en vez de bloquear también a usuarios Premium.
    const premium = profile.product
      ? profile.product === "premium"
      : null;
    const response = NextResponse.json(
      {
        connected: true,
        premium,
        accessToken: premium === false ? null : accessToken,
        connectUrl: "/api/spotify/login",
        requiresReconnect: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    if (refreshed) {
      const cookie = accessCookie(refreshed.access_token, refreshed.expires_in);
      response.cookies.set(cookie.name, cookie.value, cookie.options);
      if (refreshed.refresh_token) {
        response.cookies.set("spotify_refresh_token", refreshed.refresh_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 180,
        });
      }
    }
    return response;
  } catch (error) {
    console.error("Spotify session error", error);
    return NextResponse.json(
      {
        connected: false,
        premium: false,
        connectUrl: "/api/spotify/login",
        error: "No se pudo validar la cuenta de Spotify.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
}
