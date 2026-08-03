import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const trackId = params.get('trackId'); const mode = params.get('mode');
  if (!trackId) return NextResponse.json({ rankings: [] });
  if (!/^[A-Za-z0-9]{10,30}$/.test(trackId)) return NextResponse.json({ rankings: [] });
  const selectedMode = mode && mode !== 'all' ? mode : null;
  const { data: results, error } = await supabase.rpc('get_track_rankings', {
    target_track_id: trackId, target_mode: selectedMode,
  });
  if (error) {
    console.error('Could not load track rankings:', error);
    return NextResponse.json({ error: 'No se pudo cargar el ranking.' }, { status: 500 });
  }
  return NextResponse.json({ rankings: results || [] });
}
