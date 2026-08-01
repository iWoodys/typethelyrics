import { NextResponse } from 'next/server';
import { getTracksByIds } from '@/lib/spotify';

export async function POST(request: Request) {
  try {
    const { ids } = await request.json() as { ids?: string[] };
    if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ tracks: [] });
    const tracks = await getTracksByIds(ids);
    return NextResponse.json({ tracks });
  } catch (error) {
    console.error('Could not load Spotify track details:', error);
    return NextResponse.json({ error: 'No pudimos recuperar los datos de las canciones.' }, { status: 500 });
  }
}
