import { NextResponse } from 'next/server';
import { getPlaylistTracks } from '@/lib/spotify';
import { rateLimit } from '@/lib/rate-limit';
import { cookies } from 'next/headers';
import { refreshSpotifyAccessToken } from '@/lib/spotify-oauth';

export async function POST(request: Request) {
  const retryAfter = rateLimit(request, 'playlist', 10);
  if (retryAfter) return NextResponse.json({ error: 'Demasiadas solicitudes.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  try {
    const { url } = await request.json();
    const id = String(url || '').match(/(?:spotify:playlist:|spotify\.com\/(?:intl-[a-z-]+\/)?playlist\/)([a-zA-Z0-9]+)/i)?.[1];
    if (!id) return NextResponse.json({ error: 'Enlace de playlist inválido' }, { status: 400 });
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
      error: 'Conectá tu cuenta de Spotify para importar playlists propias o colaborativas.',
      requiresSpotifyAuth: true,
      connectUrl: '/api/spotify/login',
    }, { status: 401 });
    return NextResponse.json({ tracks: await getPlaylistTracks(id, token) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    console.error(error);
    if (message.includes('401')) return NextResponse.json({ error: 'La conexión con Spotify venció. Volvé a conectarla.', requiresSpotifyAuth: true, connectUrl: '/api/spotify/login' }, { status: 401 });
    if (message.includes('403')) return NextResponse.json({ error: 'Spotify ahora sólo permite importar playlists que poseés o en las que sos colaborador, aunque otras playlists sean públicas.' }, { status: 403 });
    if (message.includes('429')) return NextResponse.json({ error: 'Spotify recibió demasiadas solicitudes. Esperá un momento.' }, { status: 429 });
    return NextResponse.json({ error: 'Spotify no pudo leer esa playlist. Verificá el enlace y que seas propietario o colaborador.' }, { status: 502 });
  }
}
