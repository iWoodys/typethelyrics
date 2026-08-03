import { NextResponse } from 'next/server';
import { checkSpotifyUrl, getLyrics } from '@/lib/spotify';
import { rateLimit } from '@/lib/rate-limit';
import { validateSyncedLyrics } from '@/lib/lyrics';
import { readJsonBody } from '@/lib/request';

export async function POST(request: Request) {
  const retryAfter = rateLimit(request, 'lyrics', 15);
  if (retryAfter) return NextResponse.json(
    { error: 'Demasiadas solicitudes. Probá nuevamente en unos segundos.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
  try {
    const data = await readJsonBody<{ url?: unknown }>(request, 2048);
    const url = typeof data.url === 'string' ? data.url : '';

    if (!url) {
      return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
    }

    const { type, id } = checkSpotifyUrl(url);

    if (!type || !id) {
      return NextResponse.json(
        { error: 'Invalid URL...Please check the URL and try again' },
        { status: 400 }
      );
    }

    if (type !== 'track') {
      return NextResponse.json(
        { error: 'URL must be a Spotify track URL' },
        { status: 400 }
      );
    }

    // Una sola consulta obtiene los datos de Spotify y las letras sincronizadas.
    const regularLyrics = await getLyrics(id, 'lrc');
    if (regularLyrics.syncType !== 'SYNCED' || !regularLyrics.syncedLyrics.length) {
      return NextResponse.json(
        { error: 'Esta canción todavía no tiene letras sincronizadas disponibles.' },
        { status: 422 }
      );
    }

    const syncedLyrics = validateSyncedLyrics(
      regularLyrics.syncedLyrics,
      regularLyrics.trackDetails.track_duration_ms,
    );
    return NextResponse.json({
      lyrics: regularLyrics.lyrics,
      syncType: regularLyrics.syncType,
      syncedLyrics,
      trackDetails: regularLyrics.trackDetails,
      lyricsSource: regularLyrics.lyricsSource,
    });
  } catch (error) {
    if (error instanceof Error && (error.message === 'BODY_TOO_LARGE' || error.message === 'INVALID_JSON')) {
      return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
    }
    console.error('Error getting lyrics:', error);
    return NextResponse.json(
      { error: 'Failed to get lyrics' },
      { status: 500 }
    );
  }
}
