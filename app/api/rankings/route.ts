import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const trackId = params.get('trackId'); const mode = params.get('mode');
  if (!trackId) return NextResponse.json({ rankings: [] });
  let query = supabase.from('game_results').select('user_id,score,wpm,accuracy,max_combo,rank,mode,created_at').eq('spotify_track_id', trackId).order('score', { ascending: false }).limit(20);
  if (mode && mode !== 'all') query = query.eq('mode', mode);
  const { data: results, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = [...new Set((results || []).map(row => row.user_id))];
  const { data: users } = ids.length ? await supabase.from('users').select('id,username').in('id', ids) : { data: [] };
  const names = new Map((users || []).map(user => [user.id, user.username]));
  return NextResponse.json({ rankings: (results || []).map(row => ({ ...row, username: names.get(row.user_id) || 'Jugador' })) });
}
