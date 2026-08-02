import { NextResponse } from 'next/server';
import { getTracksByIds } from '@/lib/spotify';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const retryAfter = rateLimit(request, 'tracks', 30);
  if (retryAfter) return NextResponse.json({ error: 'Demasiadas solicitudes.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  try {
    const { ids } = await request.json() as { ids?: string[] };
    if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ tracks: [] });
    if (ids.length > 50 || ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9]{10,30}$/.test(id)))
      return NextResponse.json({ error: 'Lista de canciones inválida.' }, { status: 400 });
    const tracks = await getTracksByIds(ids);
    return NextResponse.json({ tracks });
  } catch (error) {
    console.error('Could not load Spotify track details:', error);
    return NextResponse.json({ error: 'No pudimos recuperar los datos de las canciones.' }, { status: 500 });
  }
}
