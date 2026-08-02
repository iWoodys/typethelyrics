import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || (process.env.NODE_ENV === 'production'
    ? 'https://typethelyrics.sbs/api/spotify/callback'
    : `${origin}/api/spotify/callback`);
  const cookieStore = await cookies();
  const state = url.searchParams.get('state');
  const expectedState = cookieStore.get('spotify_oauth_state')?.value;
  const code = url.searchParams.get('code');
  if (!code || !state || state !== expectedState) return NextResponse.redirect(`${origin}/?spotify=error`);
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.redirect(`${origin}/?spotify=error`);
  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    cache: 'no-store',
  });
  if (!tokenResponse.ok) return NextResponse.redirect(`${origin}/?spotify=error`);
  const token = await tokenResponse.json() as { access_token:string; expires_in:number };
  const response = NextResponse.redirect(`${origin}/?spotify=connected`);
  response.cookies.delete('spotify_oauth_state');
  response.cookies.set('spotify_user_token', token.access_token, { httpOnly:true, secure:origin.startsWith('https:'), sameSite:'lax', path:'/', maxAge:Math.max(60,token.expires_in-60) });
  return response;
}
