import { NextResponse } from 'next/server';
import { getTracksByIds } from '@/lib/spotify';
import { rateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/request';

export async function POST(request: Request) {
  const retryAfter = rateLimit(request, 'tracks', 30);
  if (retryAfter) return NextResponse.json({ error: 'Demasiadas solicitudes.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  try {
    const { ids } = await readJsonBody<{ ids?: string[] }>(request, 8192);
    if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ tracks: [] });
    if (ids.length > 50 || ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9]{10,30}$/.test(id)))
      return NextResponse.json({ error: 'Lista de canciones inválida.' }, { status: 400 });
    const tracks = await getTracksByIds(ids);
    return NextResponse.json({ tracks });
  } catch (error) {
    if (error instanceof Error && (error.message === 'BODY_TOO_LARGE' || error.message === 'INVALID_JSON')) return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
    console.error('Could not load Spotify track details:', error);
    return NextResponse.json({ error: 'No pudimos recuperar los datos de las canciones.' }, { status: 500 });
  }
}
