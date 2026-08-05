import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { SPOTIFY_USER_SCOPES, safeSpotifyReturnTo, spotifyOAuthUrls } from '@/lib/spotify-oauth';

export async function GET(request: Request) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: 'Spotify no está configurado.' }, { status: 503 });
  const { appOrigin, redirectUri } = spotifyOAuthUrls(request.url, request.headers);
  const returnTo = safeSpotifyReturnTo(new URL(request.url).searchParams.get('returnTo'));
  const state = randomBytes(24).toString('hex');
  const authorize = new URL('https://accounts.spotify.com/authorize');
  authorize.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SPOTIFY_USER_SCOPES.join(' '),
    state,
  }).toString();
  const response = NextResponse.redirect(authorize);
  response.cookies.set('spotify_oauth_state', state, { httpOnly: true, secure: appOrigin.startsWith('https:'), sameSite: 'lax', path: '/', maxAge: 600 });
  response.cookies.set('spotify_oauth_return_to', returnTo, { httpOnly: true, secure: appOrigin.startsWith('https:'), sameSite: 'lax', path: '/', maxAge: 600 });
  return response;
}
