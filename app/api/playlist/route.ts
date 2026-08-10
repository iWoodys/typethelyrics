import { NextResponse } from 'next/server';
import { getPlaylistTracks } from '@/lib/spotify';
import { rateLimit } from '@/lib/rate-limit';
import { cookies } from 'next/headers';
import { refreshSpotifyAccessToken } from '@/lib/spotify-oauth';
import { readJsonBody } from '@/lib/request';

export async function POST(request: Request) {
  const retryAfter = rateLimit(request, 'playlist', 10);
  if (retryAfter) return NextResponse.json({ error: 'Demasiadas solicitudes.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  try {
    const { url } = await readJsonBody<{ url?: unknown }>(request, 2048);
    const id = String(url || '').match(/(?:spotify:playlist:|spotify\.com\/(?:intl-[a-z-]+\/)?playlist\/)([a-zA-Z0-9]+)/i)?.[1];
    if (!id) return NextResponse.json({ error: 'Enlace de lista de reproducción inválido' }, { status: 400 });
    const cookieStore = await cookies();
    let token = cookieStore.get('spotify_user_token')?.value;
    const refreshToken = cookieStore.get('spotify_refresh_token')?.value;
    if (!token && refreshToken) {
      const refreshed = await refreshSpotifyAccessToken(refreshToken);
      token = refreshed.access_token;
      const response = NextResponse.json({ tracks: await getPlaylistTracks(id, token) });
      response.cookies.set('spotify_user_token', token, { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'lax', path:'/', maxAge:Math.max(60,refreshed.expires_in-60) });
      if (refreshed.refresh_token) response.cookies.set('spotify_refresh_token', refreshed.refresh_token, { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'lax', path:'/', maxAge:60*60*24*180 });
      return response;
    }
    if (!token) return NextResponse.json({
      error: 'Conecta tu cuenta de Spotify para importar listas de reproducción propias o colaborativas.',
      requiresSpotifyAuth: true,
      connectUrl: '/api/spotify/login',
    }, { status: 401 });
    return NextResponse.json({ tracks: await getPlaylistTracks(id, token) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'BODY_TOO_LARGE' || message === 'INVALID_JSON') return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
    console.error(error);
    if (message.includes('401')) return NextResponse.json({ error: 'La conexión con Spotify venció. Vuelve a conectarla.', requiresSpotifyAuth: true, connectUrl: '/api/spotify/login' }, { status: 401 });
    if (message.includes('403')) return NextResponse.json({ error: 'Spotify solo permite importar listas de reproducción que te pertenezcan o en las que seas colaborador, aunque otras listas sean públicas.' }, { status: 403 });
    if (message.includes('429')) return NextResponse.json({ error: 'Spotify recibió demasiadas solicitudes. Espera un momento.' }, { status: 429 });
    return NextResponse.json({ error: 'Spotify no pudo leer esa lista de reproducción. Verifica el enlace y que seas propietario o colaborador.' }, { status: 502 });
  }
}
