"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { Accessibility, Award, BarChart3, BookOpen, ChevronRight, Clock3, Crown, Edit3, Flame, Gamepad2, Gauge, Heart, Keyboard, Medal, Merge, MessageCircle, Music2, Pause, Play, Redo2, RotateCcw, Scissors, Search, Settings2, Sparkles, Star, Target, Trophy, Undo2, UserRound, X } from 'lucide-react';
import type { LyricsResponse, SyncedLyric, TrackDetails } from '@/components/types';
import { difficultyFor, GameMode, MODE_INFO, normalizeText, rankFor } from '@/lib/game';
import { supabase } from '@/lib/supabase';

type SongCard = { id: string; title: string; artist: string; album?: string; image?: string; url: string; bestScore?: number; playedAt?: number };
type LineResult = { index: number; text: string; typed: string; status: 'perfect' | 'corrected' | 'partial' | 'missed'; points: number; errors: number };
type Result = { score: number; accuracy: number; wpm: number; maxCombo: number; rank: string; lines: LineResult[]; challengeBonus: number };
type Stats = { games: number; totalScore: number; bestWpm: number; bestAccuracy: number; streak: number; lastDay: string };
type Ranking = { username: string; score: number; wpm: number; accuracy: number; max_combo: number; rank: string; mode: GameMode };
type HeaderProfile = { username: string; avatar_url: string | null; is_premium: boolean; premium_until: string | null };

const EMPTY_STATS: Stats = { games: 0, totalScore: 0, bestWpm: 0, bestAccuracy: 0, streak: 0, lastDay: '' };
const LS = { history: 'ttl-history-v2', favorites: 'ttl-favorites-v2', stats: 'ttl-stats-v2', edits: 'ttl-edits-v2', settings: 'ttl-settings-v2' };

export default function Home() {
  const [url, setUrl] = useState('');
  const [trackId, setTrackId] = useState<string | null>(null);
  const [track, setTrack] = useState<TrackDetails | null>(null);
  const [lyrics, setLyrics] = useState<SyncedLyric[]>([]);
  const [position, setPosition] = useState(0);
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState<GameMode>('rhythm');
  const [lineIndex, setLineIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [typedLineIndex, setTypedLineIndex] = useState(0);
  const [lineFeedback, setLineFeedback] = useState<'correct' | 'missed' | null>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [currentLineErrors, setCurrentLineErrors] = useState(0);
  const [lives, setLives] = useState(3);
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lowercase, setLowercase] = useState(true);
  const [noPunctuation, setNoPunctuation] = useState(false);
  const [history, setHistory] = useState<SongCard[]>([]);
  const [favorites, setFavorites] = useState<SongCard[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [tab, setTab] = useState<'play' | 'library' | 'progress'>('play');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SongCard[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftLyrics, setDraftLyrics] = useState<SyncedLyric[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationSamples, setCalibrationSamples] = useState<number[]>([]);
  const [publicEdit, setPublicEdit] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistTracks, setPlaylistTracks] = useState<SongCard[]>([]);
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [headerProfile, setHeaderProfile] = useState<HeaderProfile | null>(null);
  const undoRef = useRef<SyncedLyric[][]>([]);
  const redoRef = useRef<SyncedLyric[][]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastTypedLength = useRef(0);
  const feedbackTimer = useRef<number | null>(null);
  const lineResultsRef = useRef<LineResult[]>([]);
  const pausedAtRef = useRef<number | null>(null);
  const pausedTotalRef = useRef(0);

  useEffect(() => {
    const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; } };
    setHistory(read(LS.history, [])); setFavorites(read(LS.favorites, [])); setStats(read(LS.stats, EMPTY_STATS));
    const saved = read(LS.settings, { fontScale: 1, highContrast: false, reducedMotion: false, offset: 0 }); setFontScale(saved.fontScale); setHighContrast(saved.highContrast); setReducedMotion(saved.reducedMotion); setOffset(saved.offset);
  }, []);
  useEffect(() => {
    const loadProfile = async (user: User | null) => {
      setAuthUser(user);
      if (!user) { setHeaderProfile(null); return; }
      const { data } = await supabase.from('users').select('username,avatar_url,is_premium,premium_until').eq('id', user.id).maybeSingle();
      setHeaderProfile(data || { username: user.user_metadata?.username || user.email?.split('@')[0] || 'Jugador', avatar_url: null, is_premium: false, premium_until: null });
    };
    void supabase.auth.getUser().then(({ data }) => loadProfile(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { void loadProfile(session?.user || null); });
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => { localStorage.setItem(LS.history, JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem(LS.favorites, JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem(LS.stats, JSON.stringify(stats)); }, [stats]);
  useEffect(() => { localStorage.setItem(LS.settings, JSON.stringify({ fontScale, highContrast, reducedMotion, offset })); }, [fontScale, highContrast, reducedMotion, offset]);
  useEffect(() => { if (!trackId) return; fetch(`/api/rankings?trackId=${trackId}&mode=${mode}`).then(response => response.json()).then(data => setRankings(data.rankings || [])).catch(() => setRankings([])); }, [trackId, mode, finished]);

  const sendPlayer = useCallback((command: string) => iframeRef.current?.contentWindow?.postMessage({ command }, '*'), []);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://open.spotify.com' || event.data?.type !== 'playback_update') return;
      setPosition(event.data.payload?.position || 0); setPlaying(!event.data.payload?.isPaused);
    };
    window.addEventListener('message', onMessage); return () => window.removeEventListener('message', onMessage);
  }, []);

  const effectivePosition = position + offset;
  const timedIndex = useMemo(() => {
    let found = 0;
    lyrics.forEach((line, index) => { if (effectivePosition >= line.startTimeMs) found = index; });
    return found;
  }, [effectivePosition, lyrics]);
  const current = lyrics[lineIndex];
  const target = useMemo(() => current ? normalizeText(current.words, mode === 'expert', lowercase, noPunctuation) : '', [current, mode, lowercase, noPunctuation]);
  const visibleTyped = typedLineIndex === lineIndex ? typed : '';
  const normalizedTyped = normalizeText(visibleTyped, mode === 'expert', lowercase, noPunctuation);
  const lineWaitMs = current ? Math.max(0, current.startTimeMs - effectivePosition) : 0;
  const singerStarted = !!current && effectivePosition >= current.startTimeMs;
  const canType = started && playing && singerStarted && !finished;
  useEffect(() => { if (canType) inputRef.current?.focus(); }, [canType, lineIndex]);
  const showLineFeedback = useCallback((type: 'correct' | 'missed') => {
    setLineFeedback(type); if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setLineFeedback(null), 700);
  }, []);
  const addLineResults = useCallback((items: LineResult[]) => {
    lineResultsRef.current = [...lineResultsRef.current, ...items];
  }, []);
  useEffect(() => {
    if (!started) return;
    if (!playing && pausedAtRef.current === null) pausedAtRef.current = Date.now();
    if (playing && pausedAtRef.current !== null) { pausedTotalRef.current += Date.now() - pausedAtRef.current; pausedAtRef.current = null; }
  }, [playing, started]);
  const progress = track?.track_duration_ms ? Math.min(100, position / track.track_duration_ms * 100) : lyrics.length ? lineIndex / lyrics.length * 100 : 0;
  const currentWord = useMemo(() => {
    if (!current) return -1;
    const next = lyrics[lineIndex + 1]?.startTimeMs || current.startTimeMs + 5000;
    const ratio = Math.max(0, Math.min(0.999, (effectivePosition - current.startTimeMs) / (next - current.startTimeMs)));
    return Math.floor(ratio * current.words.split(/\s+/).length);
  }, [current, lyrics, lineIndex, effectivePosition]);

  const finishGame = useCallback(() => {
    if (finished) return;
    const openPause = pausedAtRef.current ? Date.now() - pausedAtRef.current : 0;
    const elapsedMinutes = Math.max((Date.now() - startedAt - pausedTotalRef.current - openPause) / 60000, 1 / 60);
    const accuracy = correct + mistakes ? correct / (correct + mistakes) * 100 : 0;
    const wpm = Math.round(correct / 5 / elapsedMinutes);
    const challengeBonus = accuracy >= 95 ? 1000 : 0;
    const earnedScore = lineResultsRef.current.reduce((sum,line)=>sum+line.points,0);
    const finalScore = earnedScore + challengeBonus;
    const final = { score: finalScore, accuracy: Math.round(accuracy * 10) / 10, wpm, maxCombo, rank: rankFor(finalScore, accuracy), lines: lineResultsRef.current, challengeBonus };
    setResult(final); setFinished(true); setStarted(false); sendPlayer('pause');
    const today = new Date().toISOString().slice(0, 10);
    setStats(old => ({ games: old.games + 1, totalScore: old.totalScore + finalScore, bestWpm: Math.max(old.bestWpm, wpm), bestAccuracy: Math.max(old.bestAccuracy, final.accuracy), streak: old.lastDay === today ? old.streak : old.lastDay === new Date(Date.now() - 86400000).toISOString().slice(0, 10) ? old.streak + 1 : 1, lastDay: today }));
    if (trackId && track) setHistory(old => [{ id: trackId, title: track.track_name, artist: track.track_artist, image: track.album_image, url: `https://open.spotify.com/track/${trackId}`, bestScore: Math.max(finalScore, old.find(song => song.id === trackId)?.bestScore || 0), playedAt: Date.now() }, ...old.filter(song => song.id !== trackId)].slice(0, 20));
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user || !trackId) return;
      await supabase.from('game_results').insert({ user_id: data.user.id, spotify_track_id: trackId, track_title: track?.track_name || 'Canción', track_artist: track?.track_artist || '', image_url: track?.album_image || null, mode, score: finalScore, wpm, accuracy: final.accuracy, max_combo: maxCombo, rank: final.rank });
    });
  }, [correct, finished, maxCombo, mistakes, mode, sendPlayer, startedAt, track, trackId]);

  useEffect(() => {
    if (!started || !playing || mode === 'relaxed' || mode === 'practice' || !lyrics.length) return;
    if (timedIndex > lineIndex) {
      const missed = timedIndex - lineIndex;
      const incomplete = Array.from({length:missed},(_,offsetIndex)=>{ const index=lineIndex+offsetIndex; const expected=normalizeText(lyrics[index]?.words||'',mode==='expert',lowercase,noPunctuation); const attempt=offsetIndex===0?normalizedTyped:''; const matching=[...attempt].filter((char,charIndex)=>char===expected[charIndex]).length; return {index,text:lyrics[index]?.words||'',typed:attempt,status:(attempt?'partial':'missed') as LineResult['status'],points:matching*3,errors:offsetIndex===0?currentLineErrors:0}; });
      addLineResults(incomplete); setScore(value=>value+incomplete.reduce((sum,item)=>sum+item.points,0)); showLineFeedback('missed'); setMistakes(value => value + missed); setCombo(0); setTyped(''); setCurrentLineErrors(0); setTypedLineIndex(timedIndex); setLineIndex(timedIndex); lastTypedLength.current = 0;
      if (mode === 'survival') setLives(value => Math.max(0, value - missed));
    }
  }, [addLineResults, currentLineErrors, lowercase, lineIndex, lyrics, mode, noPunctuation, normalizedTyped, playing, showLineFeedback, started, timedIndex]);
  useEffect(() => { if (mode === 'survival' && started && lives <= 0) finishGame(); }, [finishGame, lives, mode, started]);
  useEffect(() => {
    if (!started || finished || !track?.track_duration_ms || position < track.track_duration_ms - 750) return;
    const recorded = new Set(lineResultsRef.current.map(line=>line.index));
    const remaining = lyrics.flatMap((line,index)=>{ if(recorded.has(index)) return []; const attempt=index===lineIndex?normalizedTyped:''; const expected=normalizeText(line.words,mode==='expert',lowercase,noPunctuation); const matching=[...attempt].filter((char,charIndex)=>char===expected[charIndex]).length; return [{index,text:line.words,typed:attempt,status:(attempt?'partial':'missed') as LineResult['status'],points:matching*3,errors:index===lineIndex?currentLineErrors:0}]; });
    addLineResults(remaining); finishGame();
  }, [addLineResults, currentLineErrors, finishGame, finished, lineIndex, lowercase, lyrics, mode, noPunctuation, normalizedTyped, position, started, track]);
  useEffect(() => {
    if (started && mode === 'relaxed' && current && effectivePosition > (lyrics[lineIndex + 1]?.startTimeMs || current.startTimeMs + 6000) + 1200 && normalizedTyped !== target) sendPlayer('pause');
  }, [current, effectivePosition, lineIndex, lyrics, mode, normalizedTyped, sendPlayer, started, target]);

  const resetGame = useCallback(() => { const resetIndex = mode === 'practice' ? Math.max(0, timedIndex) : 0; setLineIndex(resetIndex); setTypedLineIndex(resetIndex); setTyped(''); setLineFeedback(null); setScore(0); setCombo(0); setMaxCombo(0); setCorrect(0); setMistakes(0); setCurrentLineErrors(0); lineResultsRef.current=[]; pausedAtRef.current=null; pausedTotalRef.current=0; setLives(3); setFinished(false); setResult(null); setStarted(false); lastTypedLength.current = 0; }, [mode, timedIndex]);
  const startGame = () => { resetGame(); setStarted(true); setStartedAt(Date.now()); setTimeout(() => inputRef.current?.focus(), 50); sendPlayer('play'); };

  const handleTyping = (value: string) => {
    if (!canType || !current) return;
    const nextTyped = normalizeText(value, mode === 'expert', lowercase, noPunctuation);
    if (nextTyped.length > lastTypedLength.current) {
      const at = nextTyped.length - 1;
      if (nextTyped[at] === target[at]) setCorrect(count => count + 1);
      else { setMistakes(count => count + 1); setCurrentLineErrors(count=>count+1); setCombo(0); if (mode === 'survival') setLives(value => value - 1); }
    }
    lastTypedLength.current = nextTyped.length; setTypedLineIndex(lineIndex); setTyped(value);
    if (nextTyped === target) {
      const nextCombo = combo + 1; const multiplier = Math.min(4, 1 + Math.floor(nextCombo / 5));
      const deadline = lyrics[lineIndex + 1]?.startTimeMs || current.startTimeMs + 6000;
      const timingBonus = effectivePosition <= deadline ? 300 : 0; const status:LineResult['status']=currentLineErrors===0?'perfect':'corrected'; const base=status==='perfect'?target.length*15:target.length*10; const points=base*multiplier+timingBonus;
      addLineResults([{index:lineIndex,text:current.words,typed:nextTyped,status,points,errors:currentLineErrors}]); showLineFeedback('correct'); setScore(value => value + points); setCombo(nextCombo); setMaxCombo(value => Math.max(value, nextCombo)); setTyped(''); setCurrentLineErrors(0); lastTypedLength.current = 0;
      if (lineIndex >= lyrics.length - 1) finishGame(); else { setTypedLineIndex(lineIndex + 1); setLineIndex(index => index + 1); }
    }
  };

  const loadSong = async (songUrl = url) => {
    const match = songUrl.match(/(?:spotify:track:|spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?track\/)([a-zA-Z0-9]+)(?:[/?#]|$)/i);
    if (!match) { setError('Pegá un enlace válido de una canción de Spotify.'); return; }
    setLoading(true); setError(''); setUrl(songUrl);
    try {
      const response = await fetch('/api/lyrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: songUrl }) });
      const data = await response.json() as LyricsResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || 'No encontramos letras para esta canción.');
      const edits = JSON.parse(localStorage.getItem(LS.edits) || '{}') as Record<string, SyncedLyric[]>;
      setTrackId(match[1]); setTrack(data.trackDetails); setLyrics(edits[match[1]] || data.syncedLyrics); setDraftLyrics(edits[match[1]] || data.syncedLyrics); setTab('play'); resetGame();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo cargar la canción.'); } finally { setLoading(false); }
  };

  const doSearch = async (event: FormEvent) => {
    event.preventDefault(); if (search.trim().length < 2) return; setSearching(true);
    try { const response = await fetch(`/api/search?q=${encodeURIComponent(search)}`); const data = await response.json(); setSearchResults(data.tracks || []); } finally { setSearching(false); }
  };
  const toggleFavorite = () => {
    if (!trackId || !track) return;
    const item = { id: trackId, title: track.track_name, artist: track.track_artist, image: track.album_image, url: `https://open.spotify.com/track/${trackId}` };
    const removing = favorites.some(song => song.id === trackId);
    setFavorites(old => removing ? old.filter(song => song.id !== trackId) : [item, ...old]);
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      if (removing) await supabase.from('favorites').delete().eq('user_id', data.user.id).eq('spotify_track_id', trackId);
      else await supabase.from('favorites').upsert({ user_id: data.user.id, spotify_track_id: trackId, title: track.track_name, artist: track.track_artist, image_url: track.album_image });
    });
  };
  const saveEdits = async () => {
    if (!trackId) return; const all = JSON.parse(localStorage.getItem(LS.edits) || '{}'); all[trackId] = draftLyrics; localStorage.setItem(LS.edits, JSON.stringify(all)); setLyrics(draftLyrics); setEditorOpen(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('lyric_edits').upsert({ user_id: user.id, spotify_track_id: trackId, lyrics: draftLyrics, is_public: publicEdit, updated_at: new Date().toISOString() }, { onConflict: 'user_id,spotify_track_id' });
  };
  const changeDraft = (updater: (old: SyncedLyric[]) => SyncedLyric[]) => { undoRef.current.push(draftLyrics.map(line => ({...line}))); redoRef.current = []; setDraftLyrics(updater); };
  const undoDraft = () => { const previous = undoRef.current.pop(); if (!previous) return; redoRef.current.push(draftLyrics); setDraftLyrics(previous); };
  const redoDraft = () => { const next = redoRef.current.pop(); if (!next) return; undoRef.current.push(draftLyrics); setDraftLyrics(next); };
  const markCalibration = () => {
    if (!lyrics.length) return; const nearest = lyrics.reduce((best, line) => Math.abs(line.startTimeMs - position) < Math.abs(best.startTimeMs - position) ? line : best);
    const sample = nearest.startTimeMs - position; const samples = [...calibrationSamples, sample].slice(-5); setCalibrationSamples(samples);
    if (samples.length >= 3) setOffset(Math.round(samples.reduce((sum,value)=>sum+value,0)/samples.length/50)*50);
  };

  const resetLatency = () => {
    setOffset(0);
    setCalibrating(false);
    setCalibrationSamples([]);
  };
  const importPlaylist = async (event: FormEvent) => { event.preventDefault(); setSearching(true); try { const response = await fetch('/api/playlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:playlistUrl})}); const data=await response.json(); if(!response.ok) throw new Error(data.error); setPlaylistTracks(data.tracks||[]); } catch(reason){ setError(reason instanceof Error?reason.message:'No se pudo importar'); } finally { setSearching(false); } };
  const level = Math.floor(stats.totalScore / 10000) + 1;
  const levelProgress = stats.totalScore % 10000 / 100;

  const achievements = [
    { name: 'Primer escenario', done: stats.games >= 1, icon: Star }, { name: 'Velocista', done: stats.bestWpm >= 60, icon: Flame },
    { name: 'Precisión quirúrgica', done: stats.bestAccuracy >= 98, icon: Target }, { name: 'Habitual', done: stats.streak >= 3, icon: Award },
  ];
  const progressCards = [
    { label: 'Partidas', value: stats.games, Icon: Music2 },
    { label: 'Puntos totales', value: stats.totalScore.toLocaleString(), Icon: Trophy },
    { label: 'Mejor velocidad', value: `${stats.bestWpm} ppm`, Icon: Flame },
    { label: 'Racha', value: `${stats.streak} días`, Icon: Sparkles },
  ];
  const favorite = !!trackId && favorites.some(song => song.id === trackId);

  return <main className={`min-h-screen text-white selection:bg-fuchsia-500/40 ${highContrast ? 'bg-black' : 'bg-[#07080d]'} ${reducedMotion ? '[&_*]:!transition-none [&_*]:!animate-none' : ''}`}>
    <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_0%,rgba(124,58,237,.25),transparent_38%),radial-gradient(circle_at_85%_25%,rgba(6,182,212,.16),transparent_30%)]" />
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07080d]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        <button onClick={() => setTab('play')} className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg shadow-violet-500/20"><Keyboard /></span><span className="text-xl font-black tracking-tight">TypeTheLyrics</span></button>
        <nav className="flex gap-1 rounded-xl bg-white/5 p-1 text-sm">{([['play','Jugar',Music2],['library','Canciones',BookOpen],['progress','Progreso',BarChart3]] as const).map(([key,label,Icon]) => <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${tab === key ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}><Icon size={16}/><span className="hidden sm:inline">{label}</span></button>)}<a href="https://discord.gg/vWBs6txYZR" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 text-indigo-300 hover:bg-indigo-400/10 hover:text-indigo-200"><MessageCircle size={16}/><span className="hidden sm:inline">Discord</span></a></nav>
        <div className="flex gap-2"><Link href="/multiplayer" className="flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-400/10 px-3 py-2 text-sm text-violet-200 hover:bg-violet-400/20"><Gamepad2 size={17}/><span className="hidden sm:inline">Multijugador</span></Link><button onClick={() => setSettingsOpen(true)} aria-label="Configuración" className="rounded-xl border border-white/10 p-2 text-zinc-300 hover:bg-white/5"><Settings2 size={18}/></button><Link href={authUser ? '/account' : '/auth'} className="flex max-w-[190px] items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5">{headerProfile?.avatar_url?<img src={headerProfile.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover"/>:<UserRound size={16}/>} <span className="hidden min-w-0 sm:block"><span className="block truncate">{authUser ? headerProfile?.username || 'Mi cuenta' : 'Entrar'}</span>{headerProfile?.is_premium&&(!headerProfile.premium_until||new Date(headerProfile.premium_until)>new Date())&&<span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-300"><Crown size={9}/> Premium</span>}</span></Link></div>
      </div>
    </header>

    <div className="relative mx-auto max-w-7xl px-4 py-8">
      {tab === 'play' && <>
        {!track && <section className="mx-auto max-w-3xl py-16 text-center"><span className="mb-5 inline-flex rounded-full border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-sm text-violet-200"><Sparkles size={16} className="mr-2"/>Mecanografía al ritmo de tu música</span><h1 className="text-4xl font-black tracking-tight sm:text-6xl">Escribí la letra.<br/><span className="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text text-transparent">Sentí el ritmo.</span></h1><p className="mx-auto mt-5 max-w-xl text-zinc-400">Pegá una canción de Spotify o buscala por nombre. Las letras aparecerán exactamente cuando empiece cada verso.</p></section>}
        <section className="mx-auto mb-8 max-w-4xl rounded-2xl border border-white/10 bg-white/[.04] p-4 shadow-2xl">
          <form onSubmit={event => { event.preventDefault(); loadSong(); }} className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Music2 className="absolute left-4 top-1/2 -translate-y-1/2 text-violet-400" size={20}/><input value={url} onChange={e => setUrl(e.target.value)} placeholder="Pegá el enlace de Spotify..." className="h-14 w-full rounded-xl border border-white/10 bg-black/30 pl-12 pr-4 outline-none focus:border-violet-400"/></div><button disabled={loading} className="h-14 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-7 font-bold disabled:opacity-50">{loading ? 'Buscando letra…' : 'Cargar canción'}</button></form>{error && <p className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        </section>

        {track && trackId && <section className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <aside className="space-y-4"><div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.04] p-4">{track.album_image && <img src={track.album_image} alt="Portada" className="mb-4 aspect-square w-full rounded-xl object-cover"/>}<div className="flex items-start justify-between"><div><h2 className="text-xl font-bold">{track.track_name}</h2><p className="text-zinc-400">{track.track_artist}</p></div><button onClick={toggleFavorite} aria-label="Favorito" className={`rounded-lg p-2 ${favorite ? 'bg-pink-500 text-white' : 'bg-white/5 text-zinc-400'}`}><Heart size={19} fill={favorite ? 'currentColor' : 'none'}/></button></div><div className="mt-3 flex gap-2 text-xs"><span className="rounded-full bg-violet-500/15 px-3 py-1 text-violet-300">{difficultyFor(lyrics)}</span><span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-300">Sincronizada</span></div></div>
            <iframe ref={iframeRef} title="Reproductor Spotify" src={`https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`} width="100%" height="152" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" className="rounded-xl"/>
            <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Modo de juego</p><div className="grid grid-cols-2 gap-2">{(Object.keys(MODE_INFO) as GameMode[]).map(key => <button key={key} onClick={() => { setMode(key); resetGame(); }} title={MODE_INFO[key].description} className={`rounded-lg border px-3 py-2 text-left text-sm ${mode === key ? 'border-violet-400 bg-violet-500/20 text-white' : 'border-white/5 bg-black/20 text-zinc-400'}`}>{MODE_INFO[key].name}</button>)}</div></div>
          </aside>

          <div className="space-y-4"><div className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">{[[Trophy,score.toLocaleString(),'Puntos'],[Flame,`${combo}x`,'Combo'],[Target,`${correct + mistakes ? Math.round(correct/(correct+mistakes)*100) : 100}%`,'Precisión'],[Clock3,`${Math.round(position/1000)}s`,'Tiempo'],[Medal,`x${Math.min(4,1+Math.floor(combo/5))}`,'Multiplicador'],[mode === 'survival' ? Heart : Keyboard,mode === 'survival' ? '❤'.repeat(lives) : `${lineIndex+1}/${lyrics.length}`,mode === 'survival' ? 'Vidas':'Verso']].map(([Icon,value,label],i) => <div key={i} className="rounded-xl bg-black/25 p-3 text-center"><Icon className="mx-auto mb-1 text-violet-400" size={17}/><b className="block text-sm">{String(value)}</b><span className="text-[10px] uppercase text-zinc-500">{String(label)}</span></div>)}</div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all" style={{width:`${progress}%`}}/></div></div>

            <div onClick={() => inputRef.current?.focus()} className={`relative min-h-[330px] cursor-text overflow-hidden rounded-3xl border bg-gradient-to-b from-white/[.07] to-white/[.02] p-6 transition-all duration-200 sm:p-10 ${lineFeedback === 'correct' ? 'border-emerald-400 bg-emerald-400/10 shadow-[0_0_40px_rgba(52,211,153,.25)]' : lineFeedback === 'missed' ? 'border-red-400 bg-red-400/10 shadow-[0_0_40px_rgba(248,113,113,.2)]' : 'border-white/10'}`}>
              {lineFeedback && <div className={`absolute left-4 top-4 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider ${lineFeedback === 'correct' ? 'bg-emerald-400 text-emerald-950' : 'bg-red-400 text-red-950'}`}>{lineFeedback === 'correct' ? '✓ Frase correcta' : '✕ Frase incompleta'}</div>}
              <div className="absolute right-4 top-4 flex gap-2"><button onClick={event => { event.stopPropagation(); setOffset(value => value - 500); }} className="rounded-lg bg-black/30 px-3 py-2 text-xs">−500 ms</button><span className="rounded-lg bg-violet-500/15 px-3 py-2 text-xs text-violet-300">{offset > 0 ? '+' : ''}{offset} ms</span><button onClick={event => { event.stopPropagation(); setOffset(value => value + 500); }} className="rounded-lg bg-black/30 px-3 py-2 text-xs">+500 ms</button></div>
              <div className="mt-12 text-center"><p className={`mb-6 text-sm uppercase tracking-[.3em] ${canType ? 'text-cyan-300' : 'text-zinc-600'}`}>{!started ? 'Prepará tus dedos' : canType ? 'Escribí ahora' : `La voz entra en ${(lineWaitMs/1000).toFixed(1)} s`}</p><div className={`min-h-24 font-bold leading-relaxed transition-opacity ${started && !canType ? 'opacity-35' : 'opacity-100'}`} style={{fontSize:`clamp(1.5rem, ${fontScale*3.2}vw, ${fontScale*2.7}rem)`}}>{current?.words.split(/\s+/).map((word, wordIndex) => <span key={wordIndex} className={`mr-3 inline-block transition-all ${canType && wordIndex === currentWord ? 'text-cyan-300 [text-shadow:0_0_22px_rgba(103,232,249,.5)]' : ''}`}>{word.split('').map((char,charIndex) => { const before = current.words.split(/\s+/).slice(0,wordIndex).join(' ').length + (wordIndex ? 1 : 0) + charIndex; const actual = normalizedTyped[before]; const expected = target[before]; return <span key={charIndex} className={actual == null ? 'text-zinc-300' : actual === expected ? 'text-emerald-400' : 'rounded bg-red-500/30 text-red-300'}>{char}</span>; })}</span>)}</div><p className="mt-8 text-xl text-zinc-600">{lyrics[lineIndex+1]?.words || 'Último verso'}</p>{started && !canType && <div className="mx-auto mt-6 h-1.5 max-w-xs overflow-hidden rounded-full bg-white/10"><div className="h-full animate-pulse bg-cyan-300" style={{width:`${Math.max(8,100-Math.min(100,lineWaitMs/5000*100))}%`}}/></div>}</div>
              <input key={lineIndex} ref={inputRef} value={visibleTyped} onChange={e => handleTyping(e.target.value)} onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Escape') sendPlayer('pause'); }} disabled={!canType} className="absolute inset-0 opacity-0" autoComplete="off" spellCheck={false}/>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2"><button onClick={() => { sendPlayer(playing?'pause':'play'); setPlaying(!playing); }} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3">{playing?<Pause size={18}/>:<Play size={18}/>} {playing?'Pausar':'Reproducir'}</button><button onClick={resetGame} className="rounded-xl border border-white/10 bg-white/5 p-3" title="Reiniciar"><RotateCcw size={18}/></button></div><div className="flex gap-2"><button onClick={() => { setDraftLyrics(lyrics); setEditorOpen(true); }} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm"><Edit3 size={17}/> Editar sincronización</button>{!started && <button onClick={startGame} className="rounded-xl bg-white px-7 py-3 font-bold text-black">Comenzar partida</button>}</div></div>
            <div className="flex flex-wrap gap-2 text-xs"><button onClick={() => setLowercase(v=>!v)} className={`rounded-full px-3 py-2 ${lowercase?'bg-violet-500/20 text-violet-300':'bg-white/5 text-zinc-500'}`}>Ignorar mayúsculas</button><button onClick={() => setNoPunctuation(v=>!v)} className={`rounded-full px-3 py-2 ${noPunctuation?'bg-violet-500/20 text-violet-300':'bg-white/5 text-zinc-500'}`}>Ignorar puntuación</button><button onClick={()=>{setCalibrating(v=>!v);setCalibrationSamples([]);}} className="flex items-center gap-1 rounded-full bg-cyan-500/15 px-3 py-2 text-cyan-300"><Gauge size={14}/> Calibrar latencia</button><button onClick={resetLatency} disabled={offset === 0 && !calibrating} className="flex items-center gap-1 rounded-full bg-white/5 px-3 py-2 text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw size={14}/> Restablecer latencia</button><span className="rounded-full bg-white/5 px-3 py-2 text-zinc-500">Esc pausa · Retroceso corrige</span></div>
            {calibrating && <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-5"><h3 className="font-bold">Calibración automática</h3><p className="my-2 text-sm text-zinc-400">Reproducí la canción y presioná el botón justo cuando escuches comenzar un verso. Hacé al menos tres marcas.</p><button onClick={markCalibration} className="rounded-xl bg-cyan-300 px-5 py-3 font-bold text-black">Marcar canto ahora</button><span className="ml-3 text-sm text-cyan-200">{calibrationSamples.length}/5 marcas · ajuste {offset} ms</span></div>}
          </div>
        </section>}
      </>}

      {tab === 'library' && <section><h1 className="mb-2 text-3xl font-black">Tu música</h1><p className="mb-8 text-zinc-400">Buscá canciones sin copiar enlaces, importá una playlist y retomá tus favoritas.</p><form onSubmit={doSearch} className="mb-4 flex max-w-2xl gap-2"><div className="relative flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Canción o artista..." className="h-14 w-full rounded-xl border border-white/10 bg-white/5 pl-12 pr-4 outline-none focus:border-violet-400"/></div><button className="rounded-xl bg-violet-500 px-6 font-bold">{searching?'Buscando…':'Buscar'}</button></form><form onSubmit={importPlaylist} className="mb-8 flex max-w-2xl gap-2"><input value={playlistUrl} onChange={e=>setPlaylistUrl(e.target.value)} placeholder="Enlace de una playlist pública de Spotify" className="h-12 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 outline-none"/><button className="rounded-xl border border-white/10 px-5">Importar</button></form>{searchResults.length>0 && <SongGrid title="Resultados" songs={searchResults} onPick={song=>loadSong(song.url)}/>}<SongGrid title="Playlist importada" songs={playlistTracks} onPick={song=>loadSong(song.url)}/><SongGrid title="Favoritas" songs={favorites} onPick={song=>loadSong(song.url)}/><SongGrid title="Jugadas recientemente" songs={history} onPick={song=>loadSong(song.url)}/></section>}

      {tab === 'progress' && <section><div className="mb-8 rounded-3xl border border-violet-400/20 bg-gradient-to-r from-violet-500/15 to-cyan-500/10 p-6"><div className="flex items-center gap-4"><div className="grid h-16 w-16 place-items-center rounded-full bg-white text-2xl font-black text-black">{level}</div><div className="flex-1"><h1 className="text-2xl font-black">Nivel {level}</h1><p className="text-sm text-zinc-400">{stats.totalScore%10000}/10.000 XP para el siguiente nivel</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full bg-gradient-to-r from-violet-400 to-cyan-300" style={{width:`${levelProgress}%`}}/></div></div></div></div><div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{progressCards.map(({label,value,Icon})=><div key={label} className="rounded-2xl border border-white/10 bg-white/[.04] p-6"><Icon className="mb-6 text-violet-400"/><b className="block text-3xl">{String(value)}</b><span className="text-sm text-zinc-500">{label}</span></div>)}</div><h2 className="mb-4 text-xl font-bold">Logros</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{achievements.map(({name,done,icon:Icon})=><div key={name} className={`rounded-2xl border p-5 ${done?'border-amber-400/30 bg-amber-400/10':'border-white/5 bg-white/[.02] opacity-45'}`}><Icon className={done?'text-amber-300':'text-zinc-600'}/><b className="mt-4 block">{name}</b><span className="text-xs text-zinc-500">{done?'Desbloqueado':'Todavía bloqueado'}</span></div>)}</div><div className="mt-8 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-6"><span className="text-xs font-bold uppercase tracking-widest text-cyan-300">Desafío diario</span><h3 className="mt-2 text-xl font-bold">Completá una canción con 95% de precisión</h3><p className="mt-1 text-zinc-400">Premio: insignia diaria y 1.000 puntos extra.</p></div>{trackId && <div className="mt-8"><h2 className="mb-4 text-xl font-bold">Ranking de {track?.track_name} · {MODE_INFO[mode].name}</h2><div className="overflow-hidden rounded-2xl border border-white/10">{rankings.length?rankings.map((row,index)=><div key={`${row.username}-${index}`} className="grid grid-cols-[45px_1fr_repeat(3,80px)] items-center border-b border-white/5 p-4 text-sm last:border-0"><b className="text-violet-300">#{index+1}</b><span>{row.username}</span><span>{row.score.toLocaleString()}</span><span>{row.wpm} ppm</span><span>{row.accuracy}%</span></div>):<p className="p-5 text-zinc-500">Todavía no hay resultados en este modo.</p>}</div></div>}<Link href="/privacy" className="mt-8 inline-block text-sm text-zinc-500 underline">Privacidad y atribuciones</Link></section>}
    </div>

    {result && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 p-4 backdrop-blur-md"><div className="mx-auto my-4 w-full max-w-4xl rounded-3xl border border-white/10 bg-[#11121a] p-6 sm:p-8"><div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left"><div className="grid h-24 w-24 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 text-5xl font-black shadow-2xl shadow-violet-500/30">{result.rank}</div><div><h2 className="text-3xl font-black">¡Canción completada!</h2><p className="mt-1 text-zinc-400">{track?.track_name} · {MODE_INFO[mode].name}</p>{result.challengeBonus>0&&<span className="mt-2 inline-block rounded-full bg-amber-400/15 px-3 py-1 text-xs text-amber-300">+{result.challengeBonus} desafío diario</span>}</div></div><div className="my-7 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Puntuación',result.score.toLocaleString()],['Precisión',`${result.accuracy}%`],['Velocidad',`${result.wpm} ppm`],['Combo máximo',`${result.maxCombo}x`]].map(([label,value])=><div key={label} className="rounded-xl bg-white/5 p-4 text-center"><b className="block text-xl">{value}</b><span className="text-xs text-zinc-500">{label}</span></div>)}</div><div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{([['Perfectas','perfect','emerald'],['Corregidas','corrected','cyan'],['Parciales','partial','amber'],['Omitidas','missed','red']] as const).map(([label,status,color])=><div key={status} className={`rounded-xl border border-${color}-400/20 bg-${color}-400/10 p-3 text-center`}><b className={`text-${color}-300`}>{result.lines.filter(line=>line.status===status).length}</b><span className="ml-2 text-xs text-zinc-400">{label}</span></div>)}</div><h3 className="mb-3 font-bold">Detalle por frase</h3><div className="max-h-72 space-y-2 overflow-y-auto pr-1">{result.lines.map(line=><div key={line.index} className={`rounded-xl border p-3 ${line.status==='perfect'?'border-emerald-400/20 bg-emerald-400/5':line.status==='corrected'?'border-cyan-400/20 bg-cyan-400/5':line.status==='partial'?'border-amber-400/20 bg-amber-400/5':'border-red-400/20 bg-red-400/5'}`}><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">{line.text}</span><b className="shrink-0 text-sm">+{line.points}</b></div><p className="mt-1 text-xs text-zinc-500">{line.status==='perfect'?'Perfecta, sin errores':line.status==='corrected'?`Completada después de ${line.errors} error${line.errors===1?'':'es'}`:line.status==='partial'?`Parcial: “${line.typed}”`:'No escrita'}</p></div>)}</div><button onClick={()=>{setResult(null);resetGame();}} className="mt-6 w-full rounded-xl bg-white py-3 font-bold text-black">Jugar otra vez</button></div></div>}

    {editorOpen && <div className="fixed inset-0 z-50 bg-black/85 p-4 backdrop-blur-md"><div className="mx-auto flex h-full max-w-5xl flex-col rounded-2xl border border-white/10 bg-[#11121a]"><div className="flex items-center justify-between border-b border-white/10 p-5"><div><h2 className="text-xl font-bold">Editor de sincronización</h2><p className="text-sm text-zinc-500">Marcá tiempos mientras suena la canción, dividí o uní versos y deshacé cambios.</p></div><div className="flex gap-2"><button onClick={undoDraft} title="Deshacer" className="rounded-lg bg-white/5 p-2"><Undo2 size={18}/></button><button onClick={redoDraft} title="Rehacer" className="rounded-lg bg-white/5 p-2"><Redo2 size={18}/></button><button onClick={()=>setEditorOpen(false)} className="p-2"><X/></button></div></div><div className="border-b border-white/10 p-3 text-center text-sm text-zinc-400">Posición del reproductor: <b className="text-cyan-300">{(position/1000).toFixed(2)}s</b> · Usá “Marcar” cuando empiece el verso</div><div className="flex-1 space-y-2 overflow-y-auto p-5">{draftLyrics.map((line,index)=><div key={index} className="grid gap-2 rounded-xl bg-white/5 p-2 md:grid-cols-[125px_1fr_auto]"><div className="flex items-center"><button onClick={()=>changeDraft(old=>old.map((item,i)=>i===index?{...item,startTimeMs:Math.max(0,item.startTimeMs-250)}:item))} className="px-2 text-zinc-400">−</button><span className="w-16 text-center text-xs text-cyan-300">{(line.startTimeMs/1000).toFixed(2)}s</span><button onClick={()=>changeDraft(old=>old.map((item,i)=>i===index?{...item,startTimeMs:item.startTimeMs+250}:item))} className="px-2 text-zinc-400">+</button></div><input value={line.words} onChange={e=>changeDraft(old=>old.map((item,i)=>i===index?{...item,words:e.target.value}:item))} className="rounded-lg bg-black/30 px-3 py-2 outline-none focus:ring-1 focus:ring-violet-400"/><div className="flex gap-1"><button onClick={()=>changeDraft(old=>old.map((item,i)=>i===index?{...item,startTimeMs:position}:item))} className="rounded px-2 text-xs text-cyan-300">Marcar</button><button title="Dividir" onClick={()=>changeDraft(old=>{const words=line.words.split(' ');const middle=Math.ceil(words.length/2);return [...old.slice(0,index),{...line,words:words.slice(0,middle).join(' ')},{startTimeMs:line.startTimeMs+1000,words:words.slice(middle).join(' ')},...old.slice(index+1)]})} className="p-2 text-zinc-400"><Scissors size={15}/></button><button disabled={index===0} title="Unir con anterior" onClick={()=>changeDraft(old=>old.map((item,i)=>i===index-1?{...item,words:`${item.words} ${line.words}`}:item).filter((_,i)=>i!==index))} className="p-2 text-zinc-400 disabled:opacity-20"><Merge size={15}/></button><button onClick={()=>changeDraft(old=>old.filter((_,i)=>i!==index))} className="p-2 text-zinc-600 hover:text-red-400"><X size={16}/></button></div></div>)}</div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-5"><button onClick={()=>changeDraft(old=>[...old,{startTimeMs:(old.at(-1)?.startTimeMs||0)+3000,words:'Nuevo verso'}])} className="rounded-xl border border-white/10 px-4 py-2">Añadir verso</button><label className="flex items-center gap-2 text-sm text-zinc-400"><input type="checkbox" checked={publicEdit} onChange={e=>setPublicEdit(e.target.checked)}/> Compartir corrección con la comunidad</label><button onClick={saveEdits} className="rounded-xl bg-violet-500 px-6 py-2 font-bold">Guardar cambios</button></div></div></div>}

    {settingsOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-md"><div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#11121a] p-6"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-xl font-bold"><Accessibility/> Accesibilidad</h2><button onClick={()=>setSettingsOpen(false)}><X/></button></div><label className="mt-6 block text-sm text-zinc-400">Tamaño de letra: {Math.round(fontScale*100)}%</label><input type="range" min="0.8" max="1.5" step="0.1" value={fontScale} onChange={e=>setFontScale(Number(e.target.value))} className="mt-2 w-full"/><label className="mt-5 flex items-center justify-between rounded-xl bg-white/5 p-4"><span>Alto contraste</span><input type="checkbox" checked={highContrast} onChange={e=>setHighContrast(e.target.checked)}/></label><label className="mt-2 flex items-center justify-between rounded-xl bg-white/5 p-4"><span>Reducir animaciones</span><input type="checkbox" checked={reducedMotion} onChange={e=>setReducedMotion(e.target.checked)}/></label><button onClick={()=>{localStorage.clear();location.reload();}} className="mt-5 w-full rounded-xl border border-red-400/20 py-3 text-sm text-red-300">Borrar datos locales</button></div></div>}
  </main>;
}

function SongGrid({ title, songs, onPick }: { title: string; songs: SongCard[]; onPick: (song: SongCard) => void }) {
  if (!songs.length) return null;
  return <div className="mb-10"><h2 className="mb-4 text-xl font-bold">{title}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{songs.map(song=><button key={song.id} onClick={()=>onPick(song)} className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.04] p-3 text-left hover:border-violet-400/50">{song.image?<img src={song.image} alt="" className="h-16 w-16 rounded-xl object-cover"/>:<span className="grid h-16 w-16 place-items-center rounded-xl bg-violet-500/15"><Music2/></span>}<span className="min-w-0 flex-1"><b className="block truncate">{song.title}</b><span className="block truncate text-sm text-zinc-500">{song.artist}</span>{song.bestScore && <span className="text-xs text-violet-300">Récord {song.bestScore.toLocaleString()}</span>}</span><ChevronRight className="text-zinc-700 group-hover:text-violet-300"/></button>)}</div></div>;
}
