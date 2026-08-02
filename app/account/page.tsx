"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Check, Crown, History, KeyRound, LogOut, Save, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Profile = { username: string; email: string; avatar_url: string | null; birth_date: string | null; gender: string | null; is_premium: boolean; premium_until: string | null };
type GameRow = { id: string; spotify_track_id: string; track_title: string; track_artist: string; image_url: string | null; score: number; accuracy: number; wpm: number; rank: string; mode: string; created_at: string };
type BestSong = GameRow & { attempts: number };

const genderOptions = [
  ['', 'Prefiero no indicar'], ['female', 'Mujer'], ['male', 'Hombre'], ['non_binary', 'No binario'], ['other', 'Otro'],
];

export default function AccountPage() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/auth'); return; }
      setUserId(authData.user.id);
      const [{ data: existingProfile, error: profileError }, { data: gameData }] = await Promise.all([
        supabase.rpc('get_my_profile').maybeSingle(),
        supabase.from('game_results').select('id,spotify_track_id,track_title,track_artist,image_url,score,accuracy,wpm,rank,mode,created_at').eq('user_id', authData.user.id).order('created_at', { ascending: false }),
      ]);
      let profileData = existingProfile;
      if (!profileError && !profileData) {
        const fallbackName = String(authData.user.user_metadata?.username || authData.user.email?.split('@')[0] || `jugador_${authData.user.id.slice(0, 6)}`)
          .replace(/[^a-zA-Z0-9_.-]/g, '_')
          .slice(0, 24);
        const { error: repairError } = await supabase.from('users').upsert({
          id: authData.user.id,
          username: fallbackName.length >= 3 ? fallbackName : `jugador_${authData.user.id.slice(0, 6)}`,
          email: authData.user.email || '',
        }, { onConflict: 'id' });
        const { data: repairedProfile, error: reloadError } = repairError
          ? { data: null, error: repairError }
          : await supabase.rpc('get_my_profile').single();
        if (reloadError) setError(reloadError.message); else profileData = repairedProfile;
      } else if (profileError) setError(profileError.message);
      if (profileData) setProfile(profileData as Profile);
      let resolvedGames = gameData || [];
      const missingIds = [...new Set(resolvedGames.filter(game => !game.track_title || game.track_title === 'Canción').map(game => game.spotify_track_id))];
      if (missingIds.length) {
        try {
          const response = await fetch('/api/tracks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: missingIds }) });
          const payload = await response.json() as { tracks?: { id: string; title: string; artist: string; image: string | null }[] };
          const details = new Map((payload.tracks || []).map(track => [track.id, track]));
          resolvedGames = resolvedGames.map(game => {
            const detail = details.get(game.spotify_track_id);
            return detail ? { ...game, track_title: detail.title, track_artist: detail.artist, image_url: detail.image } : game;
          });
        } catch { /* El historial conserva el resultado aunque Spotify no responda. */ }
      }
      setGames(resolvedGames);
      setLoading(false);
    };
    void load();
  }, [router]);

  const bestSongs = useMemo(() => {
    const map = new Map<string, BestSong>();
    for (const game of games) {
      const current = map.get(game.spotify_track_id);
      if (!current || game.score > current.score) map.set(game.spotify_track_id, { ...game, attempts: (current?.attempts || 0) + 1 });
      else current.attempts += 1;
    }
    return [...map.values()].sort((a, b) => b.score - a.score);
  }, [games]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault(); if (!profile || !userId) return;
    setSaving(true); setError(''); setMessage('');
    const username = profile.username.trim();
    if (username.length < 3) { setError('El nombre debe tener al menos 3 caracteres.'); setSaving(false); return; }
    const { error: updateError } = await supabase.from('users').update({ username, birth_date: profile.birth_date || null, gender: profile.gender || null }).eq('id', userId);
    if (updateError) setError(updateError.code === '23505' ? 'Ese nombre de usuario ya está ocupado.' : updateError.message);
    else setMessage('Perfil actualizado correctamente.');
    setSaving(false);
  };

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file || !userId || !profile) return;
    if (file.size > 2 * 1024 * 1024) { setError('La imagen no puede superar los 2 MB.'); return; }
    setUploading(true); setError(''); setMessage('');
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${userId}/avatar.${extension}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, cacheControl: '0' });
    if (uploadError) setError(uploadError.message);
    else {
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
      const { error: updateError } = await supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', userId);
      if (updateError) setError(updateError.message); else { setProfile({ ...profile, avatar_url: avatarUrl }); setMessage('Foto de perfil actualizada.'); }
    }
    setUploading(false); event.target.value = '';
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (password !== passwordAgain) { setError('Las contraseñas no coinciden.'); return; }
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) setError(passwordError.message); else { setPassword(''); setPasswordAgain(''); setMessage('Contraseña actualizada.'); }
  };

  const logout = async () => { await supabase.auth.signOut(); router.push('/'); router.refresh(); };

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#07080d] text-zinc-400">Cargando tu cuenta…</main>;
  if (!profile) return <main className="grid min-h-screen place-items-center bg-[#07080d] p-4 text-white"><div><p>{error || 'No pudimos cargar tu perfil.'}</p><Link href="/" className="mt-4 inline-block text-violet-300">Volver al inicio</Link></div></main>;

  return <main className="min-h-screen bg-[#07080d] text-white">
    <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_0%,rgba(124,58,237,.25),transparent_38%),radial-gradient(circle_at_85%_25%,rgba(6,182,212,.16),transparent_30%)]"/>
    <header className="relative border-b border-white/10 bg-[#07080d]/85"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4"><Link href="/" className="flex items-center gap-2 font-bold"><ArrowLeft size={18}/> Volver al juego</Link><button onClick={logout} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"><LogOut size={16}/> Cerrar sesión</button></div></header>
    <div className="relative mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center gap-5 sm:flex-row sm:items-end"><div className="flex flex-col items-center gap-2"><div className="relative">{profile.avatar_url?<img src={profile.avatar_url} alt="Foto de perfil" className="h-28 w-28 rounded-3xl border border-white/15 object-cover"/>:<div className="grid h-28 w-28 place-items-center rounded-3xl border border-white/10 bg-white/5"><UserRound size={46} className="text-zinc-500"/></div>}<label className="absolute -bottom-2 -right-2 grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-violet-500 shadow-lg"><Camera size={18}/><input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={uploading} className="hidden"/></label></div>{profile.is_premium&&(!profile.premium_until||new Date(profile.premium_until)>new Date())&&<span className="flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-300 to-yellow-500 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-black"><Crown size={11}/> Premium</span>}</div><div><p className="text-sm text-violet-300">Mi cuenta</p><h1 className="text-4xl font-black">{profile.username}</h1><p className="mt-1 text-zinc-500">{profile.email}</p></div></div>
      {(message || error) && <div className={`mb-6 flex items-center gap-2 rounded-xl border p-4 text-sm ${error?'border-red-400/20 bg-red-400/10 text-red-300':'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'}`}>{!error&&<Check size={17}/>} {error || message}</div>}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <form onSubmit={saveProfile} className="rounded-3xl border border-white/10 bg-white/[.04] p-6"><h2 className="text-xl font-bold">Datos personales</h2><div className="mt-5 space-y-4"><label className="block text-sm text-zinc-400">Nombre de usuario<input value={profile.username} onChange={e=>setProfile({...profile,username:e.target.value})} maxLength={24} className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-white outline-none focus:border-violet-400"/></label><label className="block text-sm text-zinc-400">Fecha de nacimiento<input type="date" max={new Date().toISOString().slice(0,10)} value={profile.birth_date || ''} onChange={e=>setProfile({...profile,birth_date:e.target.value})} className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-white outline-none focus:border-violet-400"/></label><label className="block text-sm text-zinc-400">Sexo<select value={profile.gender || ''} onChange={e=>setProfile({...profile,gender:e.target.value})} className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-[#0c0d13] px-4 text-white outline-none focus:border-violet-400">{genderOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div><button disabled={saving} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 py-3 font-bold disabled:opacity-50"><Save size={17}/> {saving?'Guardando…':'Guardar perfil'}</button></form>
        <form onSubmit={changePassword} className="rounded-3xl border border-white/10 bg-white/[.04] p-6"><h2 className="flex items-center gap-2 text-xl font-bold"><KeyRound className="text-cyan-300"/> Seguridad</h2><p className="mt-2 text-sm text-zinc-500">Elegí una nueva contraseña para tu cuenta.</p><div className="mt-5 space-y-4"><label className="block text-sm text-zinc-400">Nueva contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={6} autoComplete="new-password" className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-white outline-none focus:border-cyan-400"/></label><label className="block text-sm text-zinc-400">Repetir contraseña<input type="password" value={passwordAgain} onChange={e=>setPasswordAgain(e.target.value)} minLength={6} autoComplete="new-password" className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-white outline-none focus:border-cyan-400"/></label></div><button className="mt-6 w-full rounded-xl border border-cyan-400/30 bg-cyan-400/10 py-3 font-bold text-cyan-200">Cambiar contraseña</button></form>
      </div>
      <section className="mt-6 rounded-3xl border border-white/10 bg-white/[.04] p-6"><div className="flex items-center justify-between"><div><h2 className="flex items-center gap-2 text-xl font-bold"><History className="text-fuchsia-300"/> Historial de canciones</h2><p className="mt-1 text-sm text-zinc-500">Tu puntuación máxima en cada canción.</p></div><span className="rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-400">{games.length} partidas</span></div><div className="mt-5 space-y-2">{bestSongs.length?bestSongs.map(song=><Link href={`/?track=${song.spotify_track_id}`} key={song.spotify_track_id} className="grid grid-cols-[48px_1fr_auto] items-center gap-3 rounded-2xl border border-white/5 bg-black/20 p-3 hover:border-violet-400/30">{song.image_url?<img src={song.image_url} alt="" className="h-12 w-12 rounded-xl object-cover"/>:<div className="grid h-12 w-12 place-items-center rounded-xl bg-violet-500/10 text-violet-300">♪</div>}<div className="min-w-0"><b className="block truncate">{song.track_title || 'Canción de Spotify'}</b><span className="block truncate text-sm text-zinc-500">{song.track_artist || `${song.attempts} intento${song.attempts===1?'':'s'}`}</span></div><div className="text-right"><b className="block text-lg text-violet-300">{song.score.toLocaleString()}</b><span className="text-xs text-zinc-500">máxima · {song.rank}</span></div></Link>):<div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-zinc-500">Terminá una canción con la sesión iniciada y aparecerá acá.</div>}</div></section>
    </div>
  </main>;
}
