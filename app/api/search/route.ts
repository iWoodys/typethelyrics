import { NextResponse } from 'next/server';
import { searchTracks } from '@/lib/spotify';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim();
  if (!query || query.length < 2) return NextResponse.json({ tracks: [] });
  try {
    return NextResponse.json({ tracks: await searchTracks(query) });
  } catch (error) {
    console.error('Spotify search failed:', error);
    return NextResponse.json({ error: 'No se pudo buscar en Spotify' }, { status: 500 });
  }
}
