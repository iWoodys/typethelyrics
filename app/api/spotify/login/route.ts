import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

export async function GET(request: Request) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: 'Spotify no está configurado.' }, { status: 503 });
  const origin = new URL(request.url).origin;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || (process.env.NODE_ENV === 'production'
    ? 'https://typethelyrics.sbs/api/spotify/callback'
    : `${origin}/api/spotify/callback`);
  const state = randomBytes(24).toString('hex');
  const authorize = new URL('https://accounts.spotify.com/authorize');
  authorize.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'playlist-read-private',
    state,
  }).toString();
  const response = NextResponse.redirect(authorize);
  response.cookies.set('spotify_oauth_state', state, { httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'lax', path: '/', maxAge: 600 });
  return response;
}
