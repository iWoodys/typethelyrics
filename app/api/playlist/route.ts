import { NextResponse } from 'next/server';
import { getPlaylistTracks } from '@/lib/spotify';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const retryAfter = rateLimit(request, 'playlist', 10);
  if (retryAfter) return NextResponse.json({ error: 'Demasiadas solicitudes.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  try {
    const { url } = await request.json();
    const id = String(url || '').match(/(?:spotify:playlist:|spotify\.com\/(?:intl-[a-z-]+\/)?playlist\/)([a-zA-Z0-9]+)/i)?.[1];
    if (!id) return NextResponse.json({ error: 'Enlace de playlist inválido' }, { status: 400 });
    return NextResponse.json({ tracks: await getPlaylistTracks(id) });
  } catch (error) { console.error(error); return NextResponse.json({ error: 'No se pudo importar la playlist. Debe ser pública.' }, { status: 500 }); }
}
