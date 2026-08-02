import { NextResponse } from 'next/server';
import { searchTracks } from '@/lib/spotify';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(request: Request) {
  const retryAfter = rateLimit(request, 'search', 40);
  if (retryAfter) return NextResponse.json({ error: 'Demasiadas búsquedas.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  const query = new URL(request.url).searchParams.get('q')?.trim();
  if (!query || query.length < 2) return NextResponse.json({ tracks: [] });
  if (query.length > 100) return NextResponse.json({ error: 'La búsqueda es demasiado larga.' }, { status: 400 });
  try {
    return NextResponse.json({ tracks: await searchTracks(query) });
  } catch (error) {
    console.error('Spotify search failed:', error);
    return NextResponse.json({ error: 'No se pudo buscar en Spotify' }, { status: 500 });
  }
}
