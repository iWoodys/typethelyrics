import { NextResponse } from 'next/server';
import { checkSpotifyUrl, getLyrics } from '@/lib/spotify';
import { rateLimit } from '@/lib/rate-limit';
import { validateSyncedLyrics } from '@/lib/lyrics';
import { readJsonBody } from '@/lib/request';
import { supabase } from '@/lib/supabase';

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

    const originalSyncedLyrics = validateSyncedLyrics(
      regularLyrics.syncedLyrics,
      regularLyrics.trackDetails.track_duration_ms,
    );
    let syncedLyrics = originalSyncedLyrics;
    let lyricsOrigin: 'LRCLIB' | 'community' = 'LRCLIB';

    // La misma corrección aprobada se sirve a individual y multijugador.
    // Si Supabase no está disponible, LRCLIB sigue funcionando como respaldo.
    const { data: approvedRows, error: approvedError } = await supabase.rpc(
      'get_approved_lyrics',
      { target_track_id: id },
    );
    const approved = Array.isArray(approvedRows) ? approvedRows[0] : null;
    if (!approvedError && Array.isArray(approved?.lyrics) && approved.lyrics.length) {
      try {
        syncedLyrics = validateSyncedLyrics(
          approved.lyrics,
          regularLyrics.trackDetails.track_duration_ms,
        );
        lyricsOrigin = 'community';
      } catch (validationError) {
        console.warn('Ignoring invalid approved lyrics:', validationError);
      }
    }

    return NextResponse.json({
      lyrics: regularLyrics.lyrics,
      syncType: regularLyrics.syncType,
      syncedLyrics,
      originalSyncedLyrics,
      lyricsOrigin,
      trackDetails: regularLyrics.trackDetails,
      lyricsSource: regularLyrics.lyricsSource,
      syncAdjustment: regularLyrics.syncAdjustment,
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
