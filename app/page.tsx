"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import Image from "next/image";
import {
  Accessibility,
  Award,
  BarChart3,
  BookOpen,
  ChevronRight,
  Clock3,
  Crown,
  Edit3,
  Flame,
  Gamepad2,
  Gauge,
  Heart,
  HelpCircle,
  Keyboard,
  Medal,
  Merge,
  MessageCircle,
  Music2,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Scissors,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import type {
  LyricsResponse,
  SyncedLyric,
  TrackDetails,
} from "@/components/types";
import { GameModesModal } from "@/components/game-modes-modal";
import { useMobileSite } from "@/components/mobile-site";
import {
  SpotifyEmbed,
  type SpotifyEmbedCommand,
  type SpotifyEmbedHandle,
  type SpotifyControllerStatus,
} from "@/components/spotify-embed";
import {
  difficultyFor,
  GameMode,
  MODE_INFO,
  normalizeText,
  rankFor,
  shouldPauseEasyMode,
} from "@/lib/game";
import { supabase } from "@/lib/supabase";
import { validateSyncedLyrics } from "@/lib/lyrics";
import { readStoredJson, writeStoredJson } from "@/lib/safe-storage";
import {
  deviceOffsetFromFirstVoice,
  lyricClockFromPlayback,
  normalizeDeviceOffset,
  scaleLyricsToPlayback,
} from "@/lib/synchronization";
import {
  partialLinePoints,
  shouldCompleteLine,
  typingAlignment,
} from "@/lib/typing";

type SongCard = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  image?: string;
  url: string;
  bestScore?: number;
  playedAt?: number;
};
type LineResult = {
  index: number;
  text: string;
  typed: string;
  status: "perfect" | "corrected" | "partial" | "missed";
  points: number;
  errors: number;
};
type Result = {
  score: number;
  accuracy: number;
  wpm: number;
  maxCombo: number;
  rank: string;
  lines: LineResult[];
  challengeBonus: number;
};
type Stats = {
  games: number;
  totalScore: number;
  bestWpm: number;
  bestAccuracy: number;
  streak: number;
  lastDay: string;
};
type Ranking = {
  username: string;
  score: number;
  wpm: number;
  accuracy: number;
  max_combo: number;
  rank: string;
  mode: GameMode;
};
type HeaderProfile = {
  username: string;
  avatar_url: string | null;
  is_premium: boolean;
  premium_until: string | null;
};
type Announcement = {
  id: string;
  title: string;
  body: string;
};
type SyncProfile = {
  offsetMs: number;
  timeScale: number;
  sourceId?: number;
};

const EMPTY_STATS: Stats = {
  games: 0,
  totalScore: 0,
  bestWpm: 0,
  bestAccuracy: 0,
  streak: 0,
  lastDay: "",
};
const LS = {
  history: "ttl-history-v2",
  favorites: "ttl-favorites-v2",
  stats: "ttl-stats-v2",
  edits: "ttl-edits-v2",
  offsets: "ttl-song-offsets-v2",
  syncProfiles: "ttl-sync-profiles-v2",
  originals: "ttl-original-lyrics-v1",
  settings: "ttl-settings-v2",
  guide: "ttl-guide-seen-v1",
  announcements: "ttl-announcements-seen-v1",
  calibrationReload: "ttl-calibration-reload-v1",
  calibrationVersion: "ttl-device-calibration-v2",
  spotifyNotice: "ttl-spotify-notice-seen-v1",
};
const GUIDE_STEPS = [
  { title: "1. Elegí una canción", text: "Buscala por nombre o pegá un enlace de una canción de Spotify. Para playlists, conectá Spotify: desde 2026 sólo se permiten playlists propias o colaborativas." },
  { title: "2. Iniciá la reproducción", text: "Pulsá Play dentro de Spotify y después Iniciar partida. Si la canción tiene una introducción larga, la escritura permanecerá bloqueada hasta que realmente empiece la primera voz." },
  { title: "3. Escribí cuando se ilumine", text: "Cuando aparezca «Escribí ahora», usá el teclado directamente. Entre versos el juego espera; si Spotify está pausado, la pantalla te lo indicará." },
  { title: "4. Corregí la sincronización", text: "Si falla una sola canción, usá «Buscar mejor sincronización» para volver a elegir la mejor letra disponible. Si todas se escuchan adelantadas o atrasadas en tu equipo, usá «Sincronizar mi dispositivo» una vez; ese ajuste también se aplicará al multijugador." },
];

export default function Home() {
  const mobileSite = useMobileSite();
  const [url, setUrl] = useState("");
  const [trackId, setTrackId] = useState<string | null>(null);
  const [track, setTrack] = useState<TrackDetails | null>(null);
  const [lyrics, setLyrics] = useState<SyncedLyric[]>([]);
  const [position, setPosition] = useState(0);
  const [offset, setOffset] = useState(0);
  const [timeScale, setTimeScale] = useState(1);
  const [sourceTimeScale, setSourceTimeScale] = useState(1);
  const [sourceLyrics, setSourceLyrics] = useState<SyncedLyric[]>([]);
  const [lyricsSource, setLyricsSource] = useState<LyricsResponse["lyricsSource"]>(undefined);
  const [lyricsOrigin, setLyricsOrigin] = useState<"LRCLIB" | "personal" | "community">("LRCLIB");
  const [syncMessage, setSyncMessage] = useState("");
  const [syncConfidence, setSyncConfidence] = useState<
    "exact" | "high" | "medium"
  >("medium");
  const [mode, setMode] = useState<GameMode>("rhythm");
  const [lineIndex, setLineIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [typedLineIndex, setTypedLineIndex] = useState(0);
  const [lineFeedback, setLineFeedback] = useState<
    "correct" | "partial" | "missed" | null
  >(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [spotifyStatus, setSpotifyStatus] =
    useState<SpotifyControllerStatus>("loading");
  const [finished, setFinished] = useState(false);
  const [allLinesComplete, setAllLinesComplete] = useState(false);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [currentLineErrors, setCurrentLineErrors] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lowercase, setLowercase] = useState(true);
  const [noPunctuation, setNoPunctuation] = useState(false);
  const [history, setHistory] = useState<SongCard[]>([]);
  const [favorites, setFavorites] = useState<SongCard[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [tab, setTab] = useState<"play" | "library" | "progress">("play");
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SongCard[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftLyrics, setDraftLyrics] = useState<SyncedLyric[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modesOpen, setModesOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [fontScale, setFontScale] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [deviceOffsetMs, setDeviceOffsetMs] = useState(0);
  const [deviceCalibrationOpen, setDeviceCalibrationOpen] = useState(false);
  const [deviceCalibrationMessage, setDeviceCalibrationMessage] = useState("");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [publicEdit, setPublicEdit] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistTracks, setPlaylistTracks] = useState<SongCard[]>([]);
  const [playlistMessage, setPlaylistMessage] = useState("");
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [headerProfile, setHeaderProfile] = useState<HeaderProfile | null>(
    null,
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [spotifyNoticeOpen, setSpotifyNoticeOpen] = useState(false);
  const undoRef = useRef<SyncedLyric[][]>([]);
  const redoRef = useRef<SyncedLyric[][]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const spotifyRef = useRef<SpotifyEmbedHandle>(null);
  const lastTypedLength = useRef(0);
  const feedbackTimer = useRef<number | null>(null);
  const lineResultsRef = useRef<LineResult[]>([]);
  const pausedAtRef = useRef<number | null>(null);
  const pausedTotalRef = useRef(0);
  const pausedForTypingRef = useRef(false);
  const startPlaybackTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (startPlaybackTimerRef.current !== null)
        window.clearTimeout(startPlaybackTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const read = <T,>(key: string, fallback: T): T => {
      try {
        return JSON.parse(localStorage.getItem(key) || "") as T;
      } catch {
        return fallback;
      }
    };
    setHistory(read(LS.history, []));
    setFavorites(read(LS.favorites, []));
    setStats(read(LS.stats, EMPTY_STATS));
    const saved = read(LS.settings, {
      fontScale: 1,
      highContrast: false,
      reducedMotion: false,
      deviceOffsetMs: 0,
    });
    setFontScale(saved.fontScale);
    setHighContrast(saved.highContrast);
    setReducedMotion(saved.reducedMotion);
    const currentCalibration = localStorage.getItem(LS.calibrationVersion) === "1";
    setDeviceOffsetMs(
      currentCalibration ? normalizeDeviceOffset(saved.deviceOffsetMs || 0) : 0,
    );
    if (!currentCalibration) localStorage.setItem(LS.calibrationVersion, "1");
    setSettingsLoaded(true);
    if (!localStorage.getItem(LS.guide)) setGuideOpen(true);
    const calibrationReload = sessionStorage.getItem(LS.calibrationReload);
    if (calibrationReload) {
      sessionStorage.removeItem(LS.calibrationReload);
      void loadSong(calibrationReload, true);
    }
    // Esta recuperación sólo debe ejecutarse una vez después de recargar la página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const loadAnnouncement = async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id,title,body")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return;
      const seen = readStoredJson<string[]>(LS.announcements, []);
      if (!seen.includes(data.id)) setAnnouncement(data as Announcement);
    };
    void loadAnnouncement();
  }, []);

  const dismissAnnouncement = () => {
    if (!announcement) return;
    const seen = readStoredJson<string[]>(LS.announcements, []);
    writeStoredJson(LS.announcements, [...new Set([...seen, announcement.id])].slice(-50));
    setAnnouncement(null);
  };
  useEffect(() => {
    const loadProfile = async (user: User | null) => {
      setAuthUser(user);
      if (!user) {
        setHeaderProfile(null);
        setIsAdmin(false);
        return;
      }
      const [{ data }, { data: admin, error: adminError }] = await Promise.all([
        supabase.from("users").select("username,avatar_url,is_premium,premium_until").eq("id", user.id).maybeSingle(),
        supabase.rpc("is_admin"),
      ]);
      setIsAdmin(!adminError && admin === true);
      setHeaderProfile(
        data || {
          username:
            user.user_metadata?.username ||
            user.email?.split("@")[0] ||
            "Jugador",
          avatar_url: null,
          is_premium: false,
          premium_until: null,
        },
      );
    };
    void supabase.auth.getUser().then(({ data }) => loadProfile(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void loadProfile(session?.user || null);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    localStorage.setItem(LS.history, JSON.stringify(history));
  }, [history]);
  useEffect(() => {
    localStorage.setItem(LS.favorites, JSON.stringify(favorites));
  }, [favorites]);
  useEffect(() => {
    localStorage.setItem(LS.stats, JSON.stringify(stats));
  }, [stats]);
  useEffect(() => {
    if (!settingsLoaded) return;
    localStorage.setItem(
      LS.settings,
      JSON.stringify({
        fontScale,
        highContrast,
        reducedMotion,
        deviceOffsetMs,
      }),
    );
  }, [deviceOffsetMs, fontScale, highContrast, reducedMotion, settingsLoaded]);
  useEffect(() => {
    if (!trackId) return;
    const offsets = JSON.parse(localStorage.getItem(LS.offsets) || "{}") as Record<string, number>;
    offsets[trackId] = offset;
    localStorage.setItem(LS.offsets, JSON.stringify(offsets));
  }, [offset, trackId]);
  useEffect(() => {
    if (!trackId) return;
    const profiles = readStoredJson<Record<string, SyncProfile>>(LS.syncProfiles, {});
    profiles[trackId] = {
      offsetMs: offset,
      timeScale,
      sourceId: lyricsSource?.id,
    };
    writeStoredJson(LS.syncProfiles, profiles);
  }, [lyricsSource?.id, offset, timeScale, trackId]);
  useEffect(() => {
    if (!trackId) return;
    fetch(`/api/rankings?trackId=${trackId}&mode=${mode}`)
      .then((response) => response.json())
      .then((data) => setRankings(data.rankings || []))
      .catch(() => setRankings([]));
  }, [trackId, mode, finished]);

  const sendPlayer = useCallback(
    (command: SpotifyEmbedCommand) => spotifyRef.current?.command(command),
    [],
  );

  const effectivePosition = lyricClockFromPlayback(
    position,
    offset + deviceOffsetMs,
    timeScale,
  );
  const timedIndex = useMemo(() => {
    let found = 0;
    lyrics.forEach((line, index) => {
      if (effectivePosition >= line.startTimeMs) found = index;
    });
    return found;
  }, [effectivePosition, lyrics]);
  const current = lyrics[lineIndex];
  const target = useMemo(
    () =>
      current
        ? normalizeText(
            current.words,
            mode === "expert",
            lowercase,
            noPunctuation,
          )
        : "",
    [current, mode, lowercase, noPunctuation],
  );
  const visibleTyped = typedLineIndex === lineIndex ? typed : "";
  const normalizedTyped = normalizeText(
    visibleTyped,
    mode === "expert",
    lowercase,
    noPunctuation,
  );
  const characterFeedback = useMemo(
    () => typingAlignment(normalizedTyped, target).feedback,
    [normalizedTyped, target],
  );
  const lineWaitMs = current
    ? Math.max(
        0,
        current.startTimeMs * timeScale -
          (position + offset + deviceOffsetMs),
      )
    : 0;
  const singerStarted = !!current && effectivePosition >= current.startTimeMs;
  const canType =
    started &&
    singerStarted &&
    !finished &&
    !allLinesComplete &&
    (playing || mode === "relaxed");
  useEffect(() => {
    if (canType) inputRef.current?.focus();
  }, [canType, lineIndex]);
  const showLineFeedback = useCallback(
    (type: "correct" | "partial" | "missed") => {
    setLineFeedback(type);
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setLineFeedback(null), 700);
    },
    [],
  );
  const addLineResults = useCallback((items: LineResult[]) => {
    lineResultsRef.current = [...lineResultsRef.current, ...items];
  }, []);
  useEffect(() => {
    if (!started) return;
    if (!playing && pausedAtRef.current === null)
      pausedAtRef.current = Date.now();
    if (playing && pausedAtRef.current !== null) {
      pausedTotalRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
  }, [playing, started]);
  const progress = track?.track_duration_ms
    ? Math.min(100, (position / track.track_duration_ms) * 100)
    : lyrics.length
      ? (lineIndex / lyrics.length) * 100
      : 0;
  const currentWord = useMemo(() => {
    if (!current) return -1;
    const next =
      lyrics[lineIndex + 1]?.startTimeMs || current.startTimeMs + 5000;
    const ratio = Math.max(
      0,
      Math.min(
        0.999,
        (effectivePosition - current.startTimeMs) /
          (next - current.startTimeMs),
      ),
    );
    return Math.floor(ratio * current.words.split(/\s+/).length);
  }, [current, lyrics, lineIndex, effectivePosition]);

  const finishGame = useCallback((finalStats?: {
    correct?: number;
    mistakes?: number;
    maxCombo?: number;
  }, pauseAudio = true) => {
    if (finished) return;
    const finalCorrect = finalStats?.correct ?? correct;
    const finalMistakes = finalStats?.mistakes ?? mistakes;
    const finalMaxCombo = finalStats?.maxCombo ?? maxCombo;
    const openPause = pausedAtRef.current
      ? Date.now() - pausedAtRef.current
      : 0;
    const elapsedMinutes = Math.max(
      (Date.now() - startedAt - pausedTotalRef.current - openPause) / 60000,
      1 / 60,
    );
    const activeElapsedMs = Math.max(1000, Math.round(elapsedMinutes * 60000));
    const accuracy = finalCorrect + finalMistakes
      ? (finalCorrect / (finalCorrect + finalMistakes)) * 100
      : 0;
    const wpm = Math.round(finalCorrect / 5 / elapsedMinutes);
    const challengeBonus = accuracy >= 95 ? 1000 : 0;
    const earnedScore = lineResultsRef.current.reduce(
      (sum, line) => sum + line.points,
      0,
    );
    const finalScore = earnedScore + challengeBonus;
    const final = {
      score: finalScore,
      accuracy: Math.round(accuracy * 10) / 10,
      wpm,
      maxCombo: finalMaxCombo,
      rank: rankFor(finalScore, accuracy),
      lines: lineResultsRef.current,
      challengeBonus,
    };
    setResult(final);
    setFinished(true);
    setStarted(false);
    if (pauseAudio) sendPlayer("pause");
    const today = new Date().toISOString().slice(0, 10);
    setStats((old) => ({
      games: old.games + 1,
      totalScore: old.totalScore + finalScore,
      bestWpm: Math.max(old.bestWpm, wpm),
      bestAccuracy: Math.max(old.bestAccuracy, final.accuracy),
      streak:
        old.lastDay === today
          ? old.streak
          : old.lastDay ===
              new Date(Date.now() - 86400000).toISOString().slice(0, 10)
            ? old.streak + 1
            : 1,
      lastDay: today,
    }));
    if (trackId && track)
      setHistory((old) =>
        [
          {
            id: trackId,
            title: track.track_name,
            artist: track.track_artist,
            image: track.album_image,
            url: `https://open.spotify.com/track/${trackId}`,
            bestScore: Math.max(
              finalScore,
              old.find((song) => song.id === trackId)?.bestScore || 0,
            ),
            playedAt: Date.now(),
          },
          ...old.filter((song) => song.id !== trackId),
        ].slice(0, 20),
      );
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user || !trackId) return;
      const { error: saveError } = await supabase.rpc("save_game_result", {
        target_track_id: trackId,
        target_title: track?.track_name || "Canción",
        target_artist: track?.track_artist || "",
        target_image: track?.album_image || null,
        target_mode: mode,
        target_score: finalScore,
        target_wpm: wpm,
        target_accuracy: final.accuracy,
        target_combo: finalMaxCombo,
        target_duration_ms: track?.track_duration_ms || 0,
        target_characters: lyrics.reduce((sum, line) => sum + line.words.length, 0),
        target_lines: lyrics.length,
        target_elapsed_ms: activeElapsedMs,
      });
      if (saveError) setError(`La partida terminó, pero no se guardó: ${saveError.message}`);
    });
  }, [
    correct,
    finished,
    maxCombo,
    mistakes,
    mode,
    sendPlayer,
    startedAt,
    track,
    trackId,
    lyrics,
  ]);

  useEffect(() => {
    if (
      !started ||
      !playing ||
      mode === "relaxed" ||
      !lyrics.length
    )
      return;
    if (timedIndex > lineIndex) {
      const missed = timedIndex - lineIndex;
      const incomplete = Array.from({ length: missed }, (_, offsetIndex) => {
        const index = lineIndex + offsetIndex;
        const expected = normalizeText(
          lyrics[index]?.words || "",
          mode === "expert",
          lowercase,
          noPunctuation,
        );
        const attempt = offsetIndex === 0 ? normalizedTyped : "";
        return {
          index,
          text: lyrics[index]?.words || "",
          typed: attempt,
          status: (attempt ? "partial" : "missed") as LineResult["status"],
          points:
            offsetIndex === 0 ? partialLinePoints(attempt, expected) : 0,
          errors: offsetIndex === 0 ? currentLineErrors : 0,
        };
      });
      addLineResults(incomplete);
      setScore(
        (value) =>
          value + incomplete.reduce((sum, item) => sum + item.points, 0),
      );
      showLineFeedback(normalizedTyped ? "partial" : "missed");
      setMistakes((value) => value + missed);
      setCombo(0);
      setTyped("");
      setCurrentLineErrors(0);
      setTypedLineIndex(timedIndex);
      setLineIndex(timedIndex);
      lastTypedLength.current = 0;
    }
  }, [
    addLineResults,
    currentLineErrors,
    lowercase,
    lineIndex,
    lyrics,
    mode,
    noPunctuation,
    normalizedTyped,
    playing,
    showLineFeedback,
    started,
    timedIndex,
  ]);
  useEffect(() => {
    if (
      !started ||
      finished ||
      !track?.track_duration_ms ||
      position < track.track_duration_ms - 100
    )
      return;
    const recorded = new Set(lineResultsRef.current.map((line) => line.index));
    const remaining = lyrics.flatMap((line, index) => {
      if (recorded.has(index)) return [];
      const attempt = index === lineIndex ? normalizedTyped : "";
      const expected = normalizeText(
        line.words,
        mode === "expert",
        lowercase,
        noPunctuation,
      );
      return [
        {
          index,
          text: line.words,
          typed: attempt,
          status: (attempt ? "partial" : "missed") as LineResult["status"],
          points:
            index === lineIndex ? partialLinePoints(attempt, expected) : 0,
          errors: index === lineIndex ? currentLineErrors : 0,
        },
      ];
    });
    addLineResults(remaining);
    finishGame(
      mode === "relaxed"
        ? undefined
        : { mistakes: mistakes + remaining.length },
      false,
    );
  }, [
    addLineResults,
    currentLineErrors,
    finishGame,
    finished,
    lineIndex,
    lowercase,
    lyrics,
    mode,
    mistakes,
    noPunctuation,
    normalizedTyped,
    position,
    started,
    track,
  ]);
  useEffect(() => {
    if (
      current &&
      shouldPauseEasyMode({
        mode,
        started,
        playing,
        allLinesComplete,
        effectivePosition,
        nextLineStart:
          lyrics[lineIndex + 1]?.startTimeMs || current.startTimeMs + 6000,
        attempt: normalizedTyped,
        target,
      })
    ) {
      sendPlayer("pause");
      pausedForTypingRef.current = true;
      setPlaying(false);
    }
  }, [
    current,
    allLinesComplete,
    effectivePosition,
    lineIndex,
    lyrics,
    mode,
    normalizedTyped,
    playing,
    sendPlayer,
    started,
    target,
  ]);

  const resetGame = useCallback(
    () => {
      if (startPlaybackTimerRef.current !== null) {
        window.clearTimeout(startPlaybackTimerRef.current);
        startPlaybackTimerRef.current = null;
      }
      setLineIndex(0);
      setTypedLineIndex(0);
      setTyped("");
      setLineFeedback(null);
      setScore(0);
      setCombo(0);
      setMaxCombo(0);
      setCorrect(0);
      setMistakes(0);
      setCurrentLineErrors(0);
      lineResultsRef.current = [];
      pausedAtRef.current = null;
      pausedTotalRef.current = 0;
      pausedForTypingRef.current = false;
      setFinished(false);
      setAllLinesComplete(false);
      setResult(null);
      setStarted(false);
      lastTypedLength.current = 0;
    },
    [],
  );
  const resetGameAndPlayback = useCallback(() => {
    resetGame();
    sendPlayer("restart");
    setPosition(0);
    setPlaying(false);
    setBuffering(false);
    startPlaybackTimerRef.current = window.setTimeout(() => {
      startPlaybackTimerRef.current = null;
      sendPlayer("pause");
    }, 180);
  }, [resetGame, sendPlayer]);
  const beginGame = () => {
    if (mobileSite) inputRef.current?.focus();
    resetGame();
    setStarted(true);
    setPosition(0);
    setPlaying(false);
    sendPlayer("restart");
    startPlaybackTimerRef.current = window.setTimeout(() => {
      startPlaybackTimerRef.current = null;
      setStartedAt(Date.now());
      sendPlayer("play");
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }, 180);
  };
  const startGame = () => {
    if (spotifyStatus === "loading" || spotifyStatus === "unavailable") {
      setError(
        spotifyStatus === "loading"
          ? "Esperá unos segundos: Spotify todavía está preparando el reproductor."
          : "Spotify no entregó un reloj de reproducción fiable. Recargá la página y desactivá bloqueadores para poder jugar sincronizado.",
      );
      return;
    }
    if (!localStorage.getItem(LS.spotifyNotice)) {
      setSpotifyNoticeOpen(true);
      return;
    }
    beginGame();
  };
  const acceptSpotifyNotice = () => {
    localStorage.setItem(LS.spotifyNotice, "1");
    setSpotifyNoticeOpen(false);
    if (spotifyStatus === "ready" || spotifyStatus === "fallback") beginGame();
    else setError("Spotify todavía no está listo. Esperá unos segundos y volvé a comenzar.");
  };

  const handleTyping = (value: string) => {
    if (!canType || !current) return;
    const nextTyped = normalizeText(
      value,
      mode === "expert",
      lowercase,
      noPunctuation,
    );
    let addedCorrect = 0;
    let addedMistakes = 0;
    if (nextTyped.length > lastTypedLength.current) {
      const previousAlignment = typingAlignment(normalizedTyped, target);
      const nextAlignment = typingAlignment(nextTyped, target);
      addedCorrect = Math.max(0, nextAlignment.matches - previousAlignment.matches);
      addedMistakes = Math.max(0, nextAlignment.errors - previousAlignment.errors);
      if (addedCorrect) setCorrect((count) => count + addedCorrect);
      if (addedMistakes) {
        setMistakes((count) => count + addedMistakes);
        setCurrentLineErrors((count) => count + addedMistakes);
        setCombo(0);
      }
    }
    const totalLineErrors = currentLineErrors + addedMistakes;
    lastTypedLength.current = nextTyped.length;
    setTypedLineIndex(lineIndex);
    setTyped(value);
    if (shouldCompleteLine(nextTyped, target)) {
      const nextCombo = combo + 1;
      const multiplier = Math.min(4, 1 + Math.floor(nextCombo / 5));
      const deadline =
        lyrics[lineIndex + 1]?.startTimeMs || current.startTimeMs + 6000;
      const timingBonus = effectivePosition <= deadline ? 300 : 0;
      const status: LineResult["status"] =
        totalLineErrors > 0 ? "corrected" : "perfect";
      const points =
        (status === "perfect" ? target.length * 15 : target.length * 10) *
          multiplier +
        timingBonus;
      addLineResults([
        {
          index: lineIndex,
          text: current.words,
          typed: nextTyped,
          status,
          points,
          errors: totalLineErrors,
        },
      ]);
      showLineFeedback("correct");
      setScore((count) => count + points);
      setCombo(nextCombo);
      setMaxCombo((count) => Math.max(count, nextCombo));
      setTyped("");
      setCurrentLineErrors(0);
      lastTypedLength.current = 0;
      if (mode === "relaxed" && (pausedForTypingRef.current || !playing)) {
        pausedForTypingRef.current = false;
        sendPlayer("play");
        setPlaying(true);
      }
      if (lineIndex >= lyrics.length - 1) setAllLinesComplete(true);
      else {
        setTypedLineIndex(lineIndex + 1);
        setLineIndex((index) => index + 1);
      }
    }
  };

  async function loadSong(songUrl = url, automaticCalibration = false) {
    const match = songUrl.match(
      /(?:spotify:track:|spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?track\/)([a-zA-Z0-9]+)(?:[/?#]|$)/i,
    );
    if (!match) {
      setError("Pegá un enlace válido de una canción de Spotify.");
      return;
    }
    setLoading(true);
    setError("");
    setUrl(songUrl);
    try {
      const response = await fetch("/api/lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: songUrl }),
      });
      const data = (await response.json()) as LyricsResponse & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          data.error || "No encontramos letras para esta canción.",
        );
      const edits = readStoredJson<Record<string, SyncedLyric[]>>(LS.edits, {});
      const originals = readStoredJson<Record<string, boolean>>(LS.originals, {});
      const offsets = readStoredJson<Record<string, number>>(LS.offsets, {});
      const profiles = readStoredJson<Record<string, SyncProfile>>(LS.syncProfiles, {});
      const originalLyrics = validateSyncedLyrics(
        data.originalSyncedLyrics || data.syncedLyrics,
        data.trackDetails.track_duration_ms,
      );
      const recommendedLyrics = validateSyncedLyrics(
        data.syncedLyrics,
        data.trackDetails.track_duration_ms,
      );
      let loadedLyrics = originals[match[1]] ? originalLyrics : recommendedLyrics;
      let loadedOrigin: "LRCLIB" | "personal" | "community" = originals[match[1]]
        ? "LRCLIB"
        : data.lyricsOrigin || "LRCLIB";
      if (!automaticCalibration && !originals[match[1]] && edits[match[1]]?.length) {
        loadedLyrics = validateSyncedLyrics(edits[match[1]], data.trackDetails.track_duration_ms);
        loadedOrigin = "personal";
      } else if (!automaticCalibration && !originals[match[1]]) {
        const { data: authData } = await supabase.auth.getUser();
        const personal = authData.user
          ? await supabase.from("lyric_edits").select("lyrics").eq("user_id", authData.user.id).eq("spotify_track_id", match[1]).maybeSingle()
          : { data: null };
        if (Array.isArray(personal.data?.lyrics) && personal.data.lyrics.length) {
          loadedLyrics = validateSyncedLyrics(personal.data.lyrics, data.trackDetails.track_duration_ms);
          loadedOrigin = "personal";
        }
      }
      const storedProfile = profiles[match[1]];
      const sameSource =
        !storedProfile?.sourceId || storedProfile.sourceId === data.lyricsSource?.id;
      const selectedScale = 1;
      setOffset(
        automaticCalibration
          ? 0
          : normalizeDeviceOffset(
              sameSource ? storedProfile?.offsetMs ?? offsets[match[1]] ?? 0 : 0,
            ),
      );
      setTimeScale(selectedScale);
      setSourceTimeScale(1);
      setSyncConfidence(data.syncAdjustment?.confidence || "medium");
      setTrackId(match[1]);
      setSpotifyStatus("loading");
      setTrack(data.trackDetails);
      setSourceLyrics(originalLyrics);
      setLyricsSource(data.lyricsSource);
      setLyricsOrigin(loadedOrigin);
      setSyncMessage(automaticCalibration
        ? `Se eligió la mejor sincronización disponible (${loadedOrigin === "community" ? "corregida por administración" : `LRCLIB, confianza ${data.syncAdjustment?.confidence || "medium"}`}).`
        : "");
      if (!loadedLyrics?.length)
        throw new Error("Esta canción no tiene letras sincronizadas disponibles.");
      setLyrics(loadedLyrics);
      setDraftLyrics(loadedLyrics);
      setTab("play");
      resetGame();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo cargar la canción.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const requestedTrack = new URLSearchParams(window.location.search).get("track");
    const spotifyState = new URLSearchParams(window.location.search).get("spotify");
    if (spotifyState) {
      setTab("library");
      setPlaylistMessage(spotifyState === "connected" ? "Spotify quedó conectado. Ya podés importar una playlist propia o colaborativa." : "No se pudo conectar Spotify. Revisá que la URL de retorno esté habilitada.");
    }
    if (requestedTrack && /^[a-zA-Z0-9]+$/.test(requestedTrack))
      void loadSong(`https://open.spotify.com/track/${requestedTrack}`);
    if (requestedTrack || spotifyState) window.history.replaceState({}, "", window.location.pathname);
    // Solo procesa el enlace proveniente del historial al abrir la página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (search.trim().length < 2) return;
    setSearching(true);
    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(search)}`,
      );
      const data = await response.json();
      setSearchResults(data.tracks || []);
    } finally {
      setSearching(false);
    }
  };
  const toggleFavorite = () => {
    if (!trackId || !track) return;
    const item = {
      id: trackId,
      title: track.track_name,
      artist: track.track_artist,
      image: track.album_image,
      url: `https://open.spotify.com/track/${trackId}`,
    };
    const removing = favorites.some((song) => song.id === trackId);
    setFavorites((old) =>
      removing ? old.filter((song) => song.id !== trackId) : [item, ...old],
    );
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      if (removing)
        await supabase
          .from("favorites")
          .delete()
          .eq("user_id", data.user.id)
          .eq("spotify_track_id", trackId);
      else
        await supabase.from("favorites").upsert({
          user_id: data.user.id,
          spotify_track_id: trackId,
          title: track.track_name,
          artist: track.track_artist,
          image_url: track.album_image,
        });
    });
  };
  const saveEdits = async () => {
    if (!trackId) return;
    let validated: SyncedLyric[];
    try {
      const normalizedTimeline = scaleLyricsToPlayback(draftLyrics, timeScale);
      validated = validateSyncedLyrics(normalizedTimeline, track?.track_duration_ms);
    } catch (reason) {
      setSyncMessage(reason instanceof Error ? reason.message : "La letra no es válida.");
      return;
    }
    const all = readStoredJson<Record<string, SyncedLyric[]>>(LS.edits, {});
    all[trackId] = validated;
    writeStoredJson(LS.edits, all);
    const originals = readStoredJson<Record<string, boolean>>(LS.originals, {});
    delete originals[trackId];
    writeStoredJson(LS.originals, originals);
    setLyrics(validated);
    setLyricsOrigin("personal");
    setTimeScale(1);
    setEditorOpen(false);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { error: saveError } = await supabase.rpc("save_lyric_edit", {
        target_track_id: trackId,
        target_lyrics: validated,
        request_public: publicEdit,
        target_duration_ms: track?.track_duration_ms || null,
      });
      setSyncMessage(saveError ? saveError.message : publicEdit
        ? "Guardamos tu corrección. Quedó pendiente de moderación."
        : "Corrección personal guardada.");
    }
  };

  const restoreOriginalLyrics = async () => {
    if (!trackId || !sourceLyrics.length) return;
    const all = readStoredJson<Record<string, SyncedLyric[]>>(LS.edits, {});
    delete all[trackId];
    writeStoredJson(LS.edits, all);
    const originals = readStoredJson<Record<string, boolean>>(LS.originals, {});
    originals[trackId] = true;
    writeStoredJson(LS.originals, originals);
    const offsets = readStoredJson<Record<string, number>>(LS.offsets, {});
    const profiles = readStoredJson<Record<string, SyncProfile>>(LS.syncProfiles, {});
    delete offsets[trackId];
    delete profiles[trackId];
    writeStoredJson(LS.offsets, offsets);
    writeStoredJson(LS.syncProfiles, profiles);
    setOffset(0);
    setLyrics(sourceLyrics);
    setDraftLyrics(sourceLyrics);
    setLyricsOrigin("LRCLIB");
    setTimeScale(sourceTimeScale);
    resetGameAndPlayback();
    setSyncMessage("Se restauró la sincronización original de LRCLIB.");
    const { data } = await supabase.auth.getUser();
    if (data.user)
      await supabase.from("lyric_edits").delete().eq("user_id", data.user.id).eq("spotify_track_id", trackId);
  };

  const reportSynchronization = async () => {
    if (!trackId) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setSyncMessage("Iniciá sesión para reportar una sincronización.");
      return;
    }
    const { error: reportError } = await supabase.from("lyric_reports").upsert({
      user_id: data.user.id,
      spotify_track_id: trackId,
      source_id: lyricsSource?.id || null,
      observed_offset_ms: offset,
      status: "open",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,spotify_track_id" });
    setSyncMessage(reportError ? reportError.message : "Gracias. Guardamos el reporte para revisar esta canción.");
  };
  const changeDraft = (updater: (old: SyncedLyric[]) => SyncedLyric[]) => {
    undoRef.current.push(draftLyrics.map((line) => ({ ...line })));
    redoRef.current = [];
    setDraftLyrics(updater);
  };
  const undoDraft = () => {
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current.push(draftLyrics);
    setDraftLyrics(previous);
  };
  const redoDraft = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(draftLyrics);
    setDraftLyrics(next);
  };
  const applyAutomaticCalibration = () => {
    if (!trackId) return;
    const edits = readStoredJson<Record<string, SyncedLyric[]>>(LS.edits, {});
    const originals = readStoredJson<Record<string, boolean>>(LS.originals, {});
    const offsets = readStoredJson<Record<string, number>>(LS.offsets, {});
    const profiles = readStoredJson<Record<string, SyncProfile>>(LS.syncProfiles, {});
    delete edits[trackId];
    delete originals[trackId];
    delete offsets[trackId];
    delete profiles[trackId];
    writeStoredJson(LS.edits, edits);
    writeStoredJson(LS.originals, originals);
    writeStoredJson(LS.offsets, offsets);
    writeStoredJson(LS.syncProfiles, profiles);
    sessionStorage.setItem(LS.calibrationReload, `https://open.spotify.com/track/${trackId}`);
    window.location.reload();
  };

  const resetLatency = () => {
    if (trackId) {
      const offsets = readStoredJson<Record<string, number>>(LS.offsets, {});
      const profiles = readStoredJson<Record<string, SyncProfile>>(LS.syncProfiles, {});
      delete offsets[trackId];
      delete profiles[trackId];
      writeStoredJson(LS.offsets, offsets);
      writeStoredJson(LS.syncProfiles, profiles);
    }
    setOffset(0);
    setTimeScale(sourceTimeScale);
    resetGameAndPlayback();
    setSyncMessage("Se borró el ajuste personal de esta canción.");
  };

  const beginDeviceCalibration = () => {
    if (!trackId || !lyrics.length) return;
    resetGame();
    setDeviceCalibrationMessage("");
    setDeviceCalibrationOpen(true);
    sendPlayer("restart");
  };

  const restartDeviceCalibration = () => {
    setDeviceCalibrationMessage("");
    sendPlayer("restart");
    window.setTimeout(() => sendPlayer("play"), 120);
  };

  const captureDeviceCalibration = () => {
    if (!lyrics.length || position < 250) {
      setDeviceCalibrationMessage(
        "Primero reproducí la canción y esperá a escuchar la primera voz.",
      );
      return;
    }
    const rawCorrection = lyrics[0].startTimeMs * timeScale - (position + offset);
    if (Math.abs(rawCorrection) > 1_200) {
      setDeviceCalibrationMessage(
        "La medición quedó fuera del rango normal. No la guardamos porque probablemente esta letra necesite una corrección propia.",
      );
      return;
    }
    const correction = deviceOffsetFromFirstVoice(
      lyrics[0].startTimeMs,
      position + offset,
      timeScale,
    );
    setDeviceOffsetMs(correction);
    setDeviceCalibrationOpen(false);
    setDeviceCalibrationMessage("");
    setSyncMessage(
      "Sincronización de este navegador guardada. Se aplicará a todas las canciones y al multijugador.",
    );
    resetGame();
  };

  const resetDeviceCalibration = () => {
    setDeviceOffsetMs(0);
    setDeviceCalibrationMessage("");
    setSyncMessage("Se eliminó el ajuste de sincronización de este navegador.");
  };
  const importPlaylist = async (event: FormEvent) => {
    event.preventDefault();
    setSearching(true);
    setPlaylistMessage("");
    try {
      const response = await fetch("/api/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: playlistUrl }),
      });
      const data = await response.json();
      if (data.requiresSpotifyAuth && data.connectUrl) {
        window.location.assign(data.connectUrl);
        return;
      }
      if (!response.ok) throw new Error(data.error);
      setPlaylistTracks(data.tracks || []);
      setPlaylistMessage(`${data.tracks?.length || 0} canciones importadas.`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "No se pudo importar",
      );
      setPlaylistMessage(reason instanceof Error ? reason.message : "No se pudo importar la playlist.");
    } finally {
      setSearching(false);
    }
  };
  const level = Math.floor(stats.totalScore / 10000) + 1;
  const levelProgress = (stats.totalScore % 10000) / 100;

  const achievements = [
    { name: "Primer escenario", done: stats.games >= 1, icon: Star },
    { name: "Velocista", done: stats.bestWpm >= 60, icon: Flame },
    {
      name: "Precisión quirúrgica",
      done: stats.bestAccuracy >= 98,
      icon: Target,
    },
    { name: "Habitual", done: stats.streak >= 3, icon: Award },
  ];
  const progressCards = [
    { label: "Partidas", value: stats.games, Icon: Music2 },
    {
      label: "Puntos totales",
      value: stats.totalScore.toLocaleString(),
      Icon: Trophy,
    },
    { label: "Mejor velocidad", value: `${stats.bestWpm} ppm`, Icon: Flame },
    { label: "Racha", value: `${stats.streak} días`, Icon: Sparkles },
  ];
  const favorite = !!trackId && favorites.some((song) => song.id === trackId);

  return (
    <main
      className={`min-h-screen text-white selection:bg-fuchsia-500/40 ${highContrast ? "bg-black" : "bg-[#07080d]"} ${reducedMotion ? "[&_*]:!transition-none [&_*]:!animate-none" : ""} ${mobileSite ? "mobile-safe-bottom" : ""}`}
    >
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_0%,rgba(124,58,237,.25),transparent_38%),radial-gradient(circle_at_85%_25%,rgba(6,182,212,.16),transparent_30%)]" />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07080d]/85 backdrop-blur-xl">
        <div className={`mx-auto flex max-w-7xl items-center justify-between px-4 ${mobileSite ? "py-2.5" : "py-4"}`}>
          <button
            onClick={() => setTab("play")}
            className="flex items-center gap-3"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg shadow-violet-500/20">
              <Keyboard />
            </span>
            <span className={`${mobileSite ? "text-base" : "text-xl"} font-black tracking-tight`}>
              TypeTheLyrics
            </span>
          </button>
          <nav className={`${mobileSite ? "hidden" : "flex"} gap-1 rounded-xl bg-white/5 p-1 text-sm`}>
            {(
              [
                ["play", "Jugar", Music2],
                ["library", "Canciones", BookOpen],
                ["progress", "Progreso", BarChart3],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 ${tab === key ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
            <button
              onClick={() => setModesOpen(true)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-cyan-300 hover:bg-cyan-400/10 hover:text-cyan-200"
            >
              <Gamepad2 size={16} />
              <span className="hidden sm:inline">Modos</span>
            </button>
            <button
              onClick={() => { setGuideStep(0); setGuideOpen(true); }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-emerald-300 hover:bg-emerald-400/10"
            >
              <HelpCircle size={16} />
              <span className="hidden sm:inline">Guía</span>
            </button>
            <a
              href="https://discord.gg/vWBs6txYZR"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-indigo-300 hover:bg-indigo-400/10 hover:text-indigo-200"
            >
              <MessageCircle size={16} />
              <span className="hidden sm:inline">Discord</span>
            </a>
          </nav>
          <div className="flex gap-2">
            {mobileSite && isAdmin && (
              <Link
                href="/admin"
                aria-label="Administración"
                className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-2 text-emerald-200"
              >
                <ShieldCheck size={18} />
              </Link>
            )}
            {mobileSite && (
              <button
                onClick={() => setModesOpen(true)}
                aria-label="Modos de juego"
                className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-200"
              >
                <Gamepad2 size={18} />
              </button>
            )}
            {mobileSite && (
              <button
                onClick={() => { setGuideStep(0); setGuideOpen(true); }}
                aria-label="Guía"
                className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-2 text-emerald-200"
              >
                <HelpCircle size={18} />
              </button>
            )}
            {isAdmin && !mobileSite && (
              <Link
                href="/admin"
                className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-200 hover:bg-emerald-400/20"
              >
                <ShieldCheck size={17} />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            )}
            {!mobileSite && (
              <Link
                href="/multiplayer"
                className="flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-400/10 px-3 py-2 text-sm text-violet-200 hover:bg-violet-400/20"
              >
                <Gamepad2 size={17} />
                <span className="hidden sm:inline">Multijugador</span>
              </Link>
            )}
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Configuración"
              className="rounded-xl border border-white/10 p-2 text-zinc-300 hover:bg-white/5"
            >
              <Settings2 size={18} />
            </button>
            <Link
              href={authUser ? "/account" : "/auth"}
              className="flex max-w-[190px] items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
            >
              {headerProfile?.avatar_url ? (
                <Image
                  src={headerProfile.avatar_url}
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <UserRound size={16} />
              )}{" "}
              <span className="hidden min-w-0 sm:block">
                <span className="block truncate">
                  {authUser ? headerProfile?.username || "Mi cuenta" : "Entrar"}
                </span>
                {headerProfile?.is_premium &&
                  (!headerProfile.premium_until ||
                    new Date(headerProfile.premium_until) > new Date()) && (
                    <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-300">
                      <Crown size={9} /> Premium
                    </span>
                  )}
              </span>
            </Link>
          </div>
        </div>
      </header>

      {mobileSite && (
        <nav className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0b0c12]/95 px-2 pt-2 backdrop-blur-xl">
          <div className="mx-auto grid max-w-lg grid-cols-5">
            {(
              [
                ["play", "Jugar", Music2],
                ["library", "Canciones", BookOpen],
                ["progress", "Progreso", BarChart3],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold ${tab === key ? "bg-violet-500/15 text-violet-200" : "text-zinc-500"}`}
              >
                <Icon size={20} />
                {label}
              </button>
            ))}
            <Link
              href="/multiplayer"
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold text-zinc-500"
            >
              <Gamepad2 size={20} />
              Multi
            </Link>
            <Link
              href={authUser ? "/account" : "/auth"}
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold text-zinc-500"
            >
              <UserRound size={20} />
              Cuenta
            </Link>
          </div>
        </nav>
      )}

      <div className={`relative mx-auto max-w-7xl px-4 ${mobileSite ? "py-4" : "py-8"}`}>
        {tab === "play" && (
          <>
            {!track && (
              <section className={`mx-auto max-w-3xl text-center ${mobileSite ? "py-8" : "py-16"}`}>
                <span className="mb-5 inline-flex rounded-full border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-sm text-violet-200">
                  <Sparkles size={16} className="mr-2" />
                  Mecanografía al ritmo de tu música
                </span>
                <h1 className={`${mobileSite ? "text-4xl" : "text-4xl sm:text-6xl"} font-black tracking-tight`}>
                  Escribí la letra.
                  <br />
                  <span className="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text text-transparent">
                    Sentí el ritmo.
                  </span>
                </h1>
                <p className="mx-auto mt-5 max-w-xl text-zinc-400">
                  Pegá una canción de Spotify o buscala por nombre. Las letras
                  aparecerán exactamente cuando empiece cada verso.
                </p>
              </section>
            )}
            <section className="mx-auto mb-8 max-w-4xl rounded-2xl border border-white/10 bg-white/[.04] p-4 shadow-2xl">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  loadSong();
                }}
                className="flex flex-col gap-3 sm:flex-row"
              >
                <div className="relative flex-1">
                  <Music2
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-violet-400"
                    size={20}
                  />
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Pegá el enlace de Spotify..."
                    className="h-14 w-full rounded-xl border border-white/10 bg-black/30 pl-12 pr-4 outline-none focus:border-violet-400"
                  />
                </div>
                <button
                  disabled={loading}
                  className="h-14 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-7 font-bold disabled:opacity-50"
                >
                  {loading ? "Buscando letra…" : "Cargar canción"}
                </button>
              </form>
              {error && (
                <p className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
                  {error}
                </p>
              )}
            </section>

            {track && trackId && (
              <section className="grid gap-5 lg:grid-cols-[340px_1fr]">
                <aside className="space-y-4">
                  <div className={`overflow-hidden rounded-2xl border border-white/10 bg-white/[.04] p-4 ${mobileSite ? "flex items-center gap-4" : ""}`}>
                    {track.album_image && (
                      <Image
                        src={track.album_image}
                        alt="Portada"
                        width={320}
                        height={320}
                        className={`${mobileSite ? "h-24 w-24 shrink-0" : "mb-4 aspect-square w-full"} rounded-xl object-cover`}
                      />
                    )}
                    <div className={`${mobileSite ? "min-w-0 flex-1" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="text-xl font-bold">
                          {track.track_name}
                        </h2>
                        <p className="text-zinc-400">{track.track_artist}</p>
                      </div>
                      <button
                        onClick={toggleFavorite}
                        aria-label="Favorito"
                        className={`rounded-lg p-2 ${favorite ? "bg-pink-500 text-white" : "bg-white/5 text-zinc-400"}`}
                      >
                        <Heart
                          size={19}
                          fill={favorite ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-violet-500/15 px-3 py-1 text-violet-300">
                        {difficultyFor(lyrics)}
                      </span>
                      <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-300">
                        {lyricsOrigin === "community"
                          ? "Sincronización verificada"
                          : lyricsOrigin === "personal"
                            ? "Sincronización personal"
                            : `Sincronización ${syncConfidence === "exact" ? "exacta" : syncConfidence === "high" ? "alta" : "media"}`}
                      </span>
                    </div>
                    </div>
                  </div>
                  <SpotifyEmbed
                    key={trackId}
                    ref={spotifyRef}
                    trackId={trackId}
                    durationMs={track.track_duration_ms}
                    onControllerStatus={setSpotifyStatus}
                    onPlaybackUpdate={(state) => {
                      setPosition(state.position);
                      setBuffering(state.isBuffering);
                      setPlaying(!state.isPaused && !state.isBuffering);
                    }}
                  />
                  {spotifyStatus === "loading" && (
                    <p className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-100">
                      Preparando el reloj de Spotify…
                    </p>
                  )}
                  {spotifyStatus === "unavailable" && (
                    <p role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
                      El reproductor visible puede reproducir audio, pero no entregó el reloj necesario para sincronizar el juego. Recargá la página o desactivá el bloqueador de contenido.
                    </p>
                  )}
                  {spotifyStatus === "fallback" && (
                    <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
                      Spotify está usando el modo compatible. Pulsá Play dentro de Spotify y enseguida Comenzar partida; el juego mantendrá un reloj propio.
                    </p>
                  )}
                  <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">
                      Modo de juego
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {(Object.keys(MODE_INFO) as GameMode[]).map((key) => (
                        <button
                          key={key}
                          disabled={started}
                          onClick={() => {
                            setMode(key);
                            resetGameAndPlayback();
                          }}
                          title={MODE_INFO[key].description}
                          className={`rounded-lg border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${mode === key ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/5 bg-black/20 text-zinc-400"}`}
                        >
                          {MODE_INFO[key].name}
                        </button>
                      ))}
                    </div>
                  </div>
                </aside>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[.04] p-5">
                    <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {[
                        [Trophy, score.toLocaleString(), "Puntos"],
                        [Flame, `${combo}x`, "Combo"],
                        [
                          Target,
                          `${correct + mistakes ? Math.round((correct / (correct + mistakes)) * 100) : 100}%`,
                          "Precisión",
                        ],
                        [Clock3, `${Math.round(position / 1000)}s`, "Tiempo"],
                        [
                          Medal,
                          `x${Math.min(4, 1 + Math.floor(combo / 5))}`,
                          "Multiplicador",
                        ],
                        [Keyboard, `${lineIndex + 1}/${lyrics.length}`, "Verso"],
                      ].map(([Icon, value, label], i) => (
                        <div
                          key={i}
                          className="rounded-xl bg-black/25 p-3 text-center"
                        >
                          <Icon
                            className="mx-auto mb-1 text-violet-400"
                            size={17}
                          />
                          <b className="block text-sm">{String(value)}</b>
                          <span className="text-[10px] uppercase text-zinc-500">
                            {String(label)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div
                    onClick={() => inputRef.current?.focus()}
                    className={`relative cursor-text overflow-hidden rounded-3xl border bg-gradient-to-b from-white/[.07] to-white/[.02] transition-all duration-200 ${mobileSite ? "min-h-[280px] p-4" : "min-h-[330px] p-6 sm:p-10"} ${lineFeedback === "correct" ? "border-emerald-400 bg-emerald-400/10 shadow-[0_0_40px_rgba(52,211,153,.25)]" : lineFeedback === "partial" ? "border-amber-400 bg-amber-400/10 shadow-[0_0_40px_rgba(251,191,36,.2)]" : lineFeedback === "missed" ? "border-red-400 bg-red-400/10 shadow-[0_0_40px_rgba(248,113,113,.2)]" : "border-white/10"}`}
                  >
                    {lineFeedback && (
                      <div
                        className={`absolute left-4 top-4 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider ${lineFeedback === "correct" ? "bg-emerald-400 text-emerald-950" : lineFeedback === "partial" ? "bg-amber-400 text-amber-950" : "bg-red-400 text-red-950"}`}
                      >
                        {lineFeedback === "correct"
                          ? "✓ Frase correcta"
                          : lineFeedback === "partial"
                            ? "~ Frase parcial"
                            : "✕ Frase incompleta"}
                      </div>
                    )}
                    <div className={`${mobileSite ? "relative mb-4 flex justify-center" : "absolute right-4 top-4 z-10 flex flex-wrap justify-end"} gap-2`}>
                      <button
                        disabled={started}
                        onClick={(event) => {
                          event.stopPropagation();
                          beginDeviceCalibration();
                        }}
                        className="flex items-center gap-2 rounded-lg bg-violet-400/15 px-3 py-2 text-xs font-bold text-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Clock3 size={14} /> Sincronizar mi dispositivo
                      </button>
                      <button
                        disabled={started}
                        onClick={(event) => {
                          event.stopPropagation();
                          applyAutomaticCalibration();
                        }}
                        className="flex items-center gap-2 rounded-lg bg-cyan-400/15 px-3 py-2 text-xs font-bold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Gauge size={14} /> Buscar mejor sincronización
                      </button>
                    </div>
                    {deviceCalibrationOpen && (
                      <div className="mt-14 rounded-2xl border border-violet-400/30 bg-violet-400/10 p-4 text-left">
                        <b className="text-violet-200">
                          Sincronización para este navegador
                        </b>
                        <p className="mt-2 text-sm text-zinc-300">
                          Reiniciá el audio y, apenas escuches la primera voz,
                          presioná “La voz empezó ahora”. Este ajuste se hará
                          una sola vez y se aplicará a todas las canciones.
                        </p>
                        <p className="mt-2 text-sm italic text-zinc-400">
                          Primera frase: “{lyrics[0]?.words}”
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              restartDeviceCalibration();
                            }}
                            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold"
                          >
                            1. Reiniciar audio
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              captureDeviceCalibration();
                            }}
                            className="rounded-lg bg-violet-400 px-4 py-2 text-sm font-black text-violet-950"
                          >
                            2. La voz empezó ahora
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeviceCalibrationOpen(false);
                              setDeviceCalibrationMessage("");
                            }}
                            className="px-3 py-2 text-sm text-zinc-400"
                          >
                            Cancelar
                          </button>
                        </div>
                        {deviceCalibrationMessage && (
                          <p className="mt-3 text-sm text-amber-200">
                            {deviceCalibrationMessage}
                          </p>
                        )}
                      </div>
                    )}
                    <div className={deviceCalibrationOpen ? "mt-6 text-center" : mobileSite ? "mt-4 text-center" : "mt-12 text-center"}>
                      <p
                        className={`mb-6 text-sm uppercase tracking-[.3em] ${canType ? "text-cyan-300" : "text-zinc-600"}`}
                      >
                        {!started
                          ? "Prepará tus dedos"
                          : allLinesComplete
                            ? "Letra completada · la canción continúa hasta el final"
                          : buffering
                            ? "Spotify está cargando · esperá un momento"
                          : !playing
                            ? "Spotify está pausado · presioná Play"
                          : canType
                            ? "Escribí ahora"
                            : `${lineIndex === 0 ? "Intro musical" : "Próximo verso"} · la voz entra en ${(lineWaitMs / 1000).toFixed(1)} s`}
                      </p>
                      <div
                        className={`min-h-24 font-bold leading-relaxed transition-opacity ${started && !canType ? "opacity-35" : "opacity-100"}`}
                        style={{
                          fontSize: mobileSite
                            ? `clamp(1.35rem, ${fontScale * 6.5}vw, ${fontScale * 2.1}rem)`
                            : `clamp(1.5rem, ${fontScale * 3.2}vw, ${fontScale * 2.7}rem)`,
                        }}
                      >
                        {(noPunctuation ? target : current?.words || "")
                          .split(/\s+/)
                          .map((word, wordIndex) => (
                          <span
                            key={wordIndex}
                            className={`mr-3 inline-block transition-all ${canType && wordIndex === currentWord ? "text-cyan-300 [text-shadow:0_0_22px_rgba(103,232,249,.5)]" : ""}`}
                          >
                            {word.split("").map((char, charIndex) => {
                              const before =
                                (noPunctuation ? target : current?.words || "")
                                  .split(/\s+/)
                                  .slice(0, wordIndex)
                                  .join(" ").length +
                                (wordIndex ? 1 : 0) +
                                charIndex;
                              const feedback = characterFeedback[before];
                              return (
                                <span
                                  key={charIndex}
                                    className={
                                      feedback === "pending"
                                        ? "text-zinc-300"
                                      : feedback === "correct"
                                        ? "text-emerald-400"
                                        : "rounded bg-red-500/30 text-red-300"
                                  }
                                >
                                  {char}
                                </span>
                              );
                            })}
                          </span>
                        ))}
                      </div>
                      <p className={`${mobileSite ? "mt-6 text-base" : "mt-8 text-xl"} text-zinc-600`}>
                        {lyrics[lineIndex + 1]?.words || "Último verso"}
                      </p>
                      {started && !canType && !allLinesComplete && (
                        <div className="mx-auto mt-6 h-1.5 max-w-xs overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full animate-pulse bg-cyan-300"
                            style={{
                              width: `${Math.max(8, 100 - Math.min(100, (lineWaitMs / 5000) * 100))}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <input
                      ref={inputRef}
                      value={visibleTyped}
                      onChange={(event) => handleTyping(event.target.value)}
                      onPaste={(event) => event.preventDefault()}
                      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Escape") {
                          sendPlayer("pause");
                        }
                      }}
                      disabled={!mobileSite && !canType}
                      aria-label="Escribir la letra actual"
                      placeholder={canType ? "Escribí la frase…" : started ? "Esperá a que comience la voz…" : "Tocá aquí para preparar el teclado"}
                      className={mobileSite
                        ? "mt-6 h-14 w-full rounded-xl border border-white/15 bg-black/35 px-4 text-base text-white outline-none placeholder:text-zinc-600 focus:border-cyan-300"
                        : "pointer-events-none absolute inset-0 opacity-0"}
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      inputMode="text"
                      enterKeyHint="done"
                      spellCheck={false}
                    />
                  </div>
                  <div className={`flex flex-wrap items-center justify-between gap-3 ${mobileSite ? "[&>div]:w-full" : ""}`}>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          sendPlayer(playing ? "pause" : "play");
                        }}
                        className={`flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 ${mobileSite ? "flex-1" : ""}`}
                      >
                        {playing ? <Pause size={18} /> : <Play size={18} />}{" "}
                        {playing ? "Pausar" : "Reproducir"}
                      </button>
                      <button
                        onClick={resetGameAndPlayback}
                        className="rounded-xl border border-white/10 bg-white/5 p-3"
                        title="Reiniciar"
                      >
                        <RotateCcw size={18} />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={started}
                        onClick={() => {
                          setDraftLyrics(lyrics);
                          setEditorOpen(true);
                        }}
                        className={`flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${mobileSite ? "flex-1" : ""}`}
                      >
                        <Edit3 size={17} /> Editar sincronización
                      </button>
                      {!started && (
                        <button
                          onClick={startGame}
                          disabled={spotifyStatus === "loading" || spotifyStatus === "unavailable"}
                          className={`rounded-xl bg-white px-7 py-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-40 ${mobileSite ? "flex-1" : ""}`}
                        >
                          Comenzar partida
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      disabled={started || mode === "expert"}
                      onClick={() => setLowercase((v) => !v)}
                      title={mode === "expert" ? "En Difícil las mayúsculas son obligatorias" : undefined}
                      className={`rounded-full px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40 ${mode !== "expert" && lowercase ? "bg-violet-500/20 text-violet-300" : "bg-white/5 text-zinc-500"}`}
                    >
                      {mode === "expert"
                        ? "Mayúsculas obligatorias"
                        : "Ignorar mayúsculas"}
                    </button>
                    <button
                      disabled={started || mode === "expert"}
                      onClick={() => setNoPunctuation((v) => !v)}
                      title={mode === "expert" ? "En Difícil la puntuación es obligatoria" : undefined}
                      className={`rounded-full px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40 ${mode !== "expert" && noPunctuation ? "bg-violet-500/20 text-violet-300" : "bg-white/5 text-zinc-500"}`}
                    >
                      {mode === "expert"
                        ? "Puntuación obligatoria"
                        : "Ignorar puntuación"}
                    </button>
                    <button
                      onClick={resetLatency}
                      disabled={started || (offset === 0 && timeScale === sourceTimeScale)}
                      className="flex items-center gap-1 rounded-full bg-white/5 px-3 py-2 text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <RotateCcw size={14} /> Borrar ajuste de canción
                    </button>
                    <button
                      onClick={() => void restoreOriginalLyrics()}
                      disabled={started || lyricsOrigin === "LRCLIB"}
                      className="flex items-center gap-1 rounded-full bg-white/5 px-3 py-2 text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Undo2 size={14} /> Restaurar letra original
                    </button>
                    <button
                      onClick={() => void reportSynchronization()}
                      className="rounded-full bg-amber-400/10 px-3 py-2 text-amber-200"
                    >
                      Reportar desincronización
                    </button>
                    <span className="rounded-full bg-white/5 px-3 py-2 text-zinc-400">
                      Fuente: {lyricsOrigin === "personal" ? "tu corrección" : lyricsOrigin === "community" ? "comunidad" : `LRCLIB${lyricsSource?.id ? ` #${lyricsSource.id}` : ""}`}
                    </span>
                    {lyricsOrigin === "LRCLIB" && (
                      <span className="rounded-full bg-cyan-400/10 px-3 py-2 text-cyan-200">
                        Coincidencia {syncConfidence === "exact" ? "exacta" : syncConfidence === "high" ? "alta" : "media"} · tiempos originales
                      </span>
                    )}
                    <span className="rounded-full bg-white/5 px-3 py-2 text-zinc-500">
                      Esc pausa · Retroceso corrige
                    </span>
                  </div>
                  {syncMessage && (
                    <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
                      {syncMessage}
                    </p>
                  )}
                </div>
              </section>
            )}
          </>
        )}

        {tab === "library" && (
          <section>
            <h1 className="mb-2 text-3xl font-black">Tu música</h1>
            <p className="mb-8 text-zinc-400">
              Buscá canciones sin copiar enlaces, importá una playlist y retomá
              tus favoritas.
            </p>
            <form onSubmit={doSearch} className="mb-4 flex max-w-2xl flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Canción o artista..."
                  className="h-14 w-full rounded-xl border border-white/10 bg-white/5 pl-12 pr-4 outline-none focus:border-violet-400"
                />
              </div>
              <button className="h-12 rounded-xl bg-violet-500 px-6 font-bold sm:h-auto">
                {searching ? "Buscando…" : "Buscar"}
              </button>
            </form>
            <form
              onSubmit={importPlaylist}
              className="mb-8 flex max-w-2xl flex-col gap-2 sm:flex-row"
            >
              <input
                value={playlistUrl}
                onChange={(e) => setPlaylistUrl(e.target.value)}
                placeholder="Enlace de una playlist propia o colaborativa"
                className="h-12 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 outline-none"
              />
              <button className="h-12 rounded-xl border border-white/10 px-5 sm:h-auto">
                {searching ? "Importando…" : "Importar"}
              </button>
            </form>
            <div className="mb-8 flex max-w-2xl flex-wrap items-center gap-3 text-sm">
              <a href="/api/spotify/login" className="rounded-xl bg-emerald-500/15 px-4 py-2 font-bold text-emerald-200">Conectar Spotify</a>
              <span className="text-zinc-500">Spotify exige conectar la cuenta y sólo permite playlists propias o colaborativas.</span>
            </div>
            {playlistMessage && <p className="mb-6 max-w-2xl rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-zinc-300">{playlistMessage}</p>}
            {searchResults.length > 0 && (
              <SongGrid
                title="Resultados"
                songs={searchResults}
                onPick={(song) => loadSong(song.url)}
              />
            )}
            <SongGrid
              title="Playlist importada"
              songs={playlistTracks}
              onPick={(song) => loadSong(song.url)}
            />
            <SongGrid
              title="Favoritas"
              songs={favorites}
              onPick={(song) => loadSong(song.url)}
            />
            <SongGrid
              title="Jugadas recientemente"
              songs={history}
              onPick={(song) => loadSong(song.url)}
            />
          </section>
        )}

        {tab === "progress" && (
          <section>
            <div className="mb-8 rounded-3xl border border-violet-400/20 bg-gradient-to-r from-violet-500/15 to-cyan-500/10 p-6">
              <div className="flex items-center gap-4">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-white text-2xl font-black text-black">
                  {level}
                </div>
                <div className="flex-1">
                  <h1 className="text-2xl font-black">Nivel {level}</h1>
                  <p className="text-sm text-zinc-400">
                    {stats.totalScore % 10000}/10.000 XP para el siguiente nivel
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30">
                    <div
                      className="h-full bg-gradient-to-r from-violet-400 to-cyan-300"
                      style={{ width: `${levelProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {progressCards.map(({ label, value, Icon }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-white/[.04] p-6"
                >
                  <Icon className="mb-6 text-violet-400" />
                  <b className="block text-3xl">{String(value)}</b>
                  <span className="text-sm text-zinc-500">{label}</span>
                </div>
              ))}
            </div>
            <h2 className="mb-4 text-xl font-bold">Logros</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {achievements.map(({ name, done, icon: Icon }) => (
                <div
                  key={name}
                  className={`rounded-2xl border p-5 ${done ? "border-amber-400/30 bg-amber-400/10" : "border-white/5 bg-white/[.02] opacity-45"}`}
                >
                  <Icon className={done ? "text-amber-300" : "text-zinc-600"} />
                  <b className="mt-4 block">{name}</b>
                  <span className="text-xs text-zinc-500">
                    {done ? "Desbloqueado" : "Todavía bloqueado"}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-8 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-6">
              <span className="text-xs font-bold uppercase tracking-widest text-cyan-300">
                Desafío diario
              </span>
              <h3 className="mt-2 text-xl font-bold">
                Completá una canción con 95% de precisión
              </h3>
              <p className="mt-1 text-zinc-400">
                Premio: insignia diaria y 1.000 puntos extra.
              </p>
            </div>
            {trackId && (
              <div className="mt-8">
                <h2 className="mb-4 text-xl font-bold">
                  Ranking de {track?.track_name} · {MODE_INFO[mode].name}
                </h2>
                <div className="overflow-hidden rounded-2xl border border-white/10">
                  {rankings.length ? (
                    rankings.map((row, index) => (
                      <div
                        key={`${row.username}-${index}`}
                        className="grid grid-cols-[45px_1fr_repeat(3,80px)] items-center border-b border-white/5 p-4 text-sm last:border-0"
                      >
                        <b className="text-violet-300">#{index + 1}</b>
                        <span>{row.username}</span>
                        <span>{row.score.toLocaleString()}</span>
                        <span>{row.wpm} ppm</span>
                        <span>{row.accuracy}%</span>
                      </div>
                    ))
                  ) : (
                    <p className="p-5 text-zinc-500">
                      Todavía no hay resultados en este modo.
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="mt-8 flex justify-center gap-5 text-sm text-zinc-500 underline">
              <Link href="/privacy">Privacidad y atribuciones</Link>
              <Link href="/terms">Términos de uso</Link>
            </div>
          </section>
        )}
      </div>

      {result && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 p-4 backdrop-blur-md">
          <div className="mx-auto my-4 w-full max-w-4xl rounded-3xl border border-white/10 bg-[#11121a] p-6 sm:p-8">
            <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
              <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 text-5xl font-black shadow-2xl shadow-violet-500/30">
                {result.rank}
              </div>
              <div>
                <h2 className="text-3xl font-black">¡Canción completada!</h2>
                <p className="mt-1 text-zinc-400">
                  {track?.track_name} · {MODE_INFO[mode].name}
                </p>
                {result.challengeBonus > 0 && (
                  <span className="mt-2 inline-block rounded-full bg-amber-400/15 px-3 py-1 text-xs text-amber-300">
                    +{result.challengeBonus} desafío diario
                  </span>
                )}
              </div>
            </div>
            <div className="my-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Puntuación", result.score.toLocaleString()],
                ["Precisión", `${result.accuracy}%`],
                ["Velocidad", `${result.wpm} ppm`],
                ["Combo máximo", `${result.maxCombo}x`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl bg-white/5 p-4 text-center"
                >
                  <b className="block text-xl">{value}</b>
                  <span className="text-xs text-zinc-500">{label}</span>
                </div>
              ))}
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["Perfectas", "perfect", "emerald"],
                  ["Corregidas", "corrected", "cyan"],
                  ["Parciales", "partial", "amber"],
                  ["Omitidas", "missed", "red"],
                ] as const
              ).map(([label, status, color]) => (
                <div
                  key={status}
                  className={`rounded-xl border border-${color}-400/20 bg-${color}-400/10 p-3 text-center`}
                >
                  <b className={`text-${color}-300`}>
                    {
                      result.lines.filter((line) => line.status === status)
                        .length
                    }
                  </b>
                  <span className="ml-2 text-xs text-zinc-400">{label}</span>
                </div>
              ))}
            </div>
            <h3 className="mb-3 font-bold">Detalle por frase</h3>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {result.lines.map((line) => (
                <div
                  key={line.index}
                  className={`rounded-xl border p-3 ${line.status === "perfect" ? "border-emerald-400/20 bg-emerald-400/5" : line.status === "corrected" ? "border-cyan-400/20 bg-cyan-400/5" : line.status === "partial" ? "border-amber-400/20 bg-amber-400/5" : "border-red-400/20 bg-red-400/5"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{line.text}</span>
                    <b className="shrink-0 text-sm">+{line.points}</b>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {line.status === "perfect"
                      ? "Perfecta, sin errores"
                      : line.status === "corrected"
                        ? `Completada después de ${line.errors} error${line.errors === 1 ? "" : "es"}`
                        : line.status === "partial"
                          ? `Parcial: “${line.typed}”`
                          : "No escrita"}
                  </p>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                setResult(null);
                resetGameAndPlayback();
              }}
              className="mt-6 w-full rounded-xl bg-white py-3 font-bold text-black"
            >
              Jugar otra vez
            </button>
          </div>
        </div>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 p-4 backdrop-blur-md">
          <div className="mx-auto flex h-full max-w-5xl flex-col rounded-2xl border border-white/10 bg-[#11121a]">
            <div className="flex items-center justify-between border-b border-white/10 p-5">
              <div>
                <h2 className="text-xl font-bold">Editor de sincronización</h2>
                <p className="text-sm text-zinc-500">
                  Marcá tiempos mientras suena la canción, dividí o uní versos y
                  deshacé cambios.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={undoDraft}
                  title="Deshacer"
                  className="rounded-lg bg-white/5 p-2"
                >
                  <Undo2 size={18} />
                </button>
                <button
                  onClick={redoDraft}
                  title="Rehacer"
                  className="rounded-lg bg-white/5 p-2"
                >
                  <Redo2 size={18} />
                </button>
                <button onClick={() => setEditorOpen(false)} className="p-2">
                  <X />
                </button>
              </div>
            </div>
            <div className="border-b border-white/10 p-3 text-center text-sm text-zinc-400">
              Posición del reproductor:{" "}
              <b className="text-cyan-300">{(position / 1000).toFixed(2)}s</b> ·
              Usá “Marcar” cuando empiece el verso
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-5">
              {draftLyrics.map((line, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-xl bg-white/5 p-2 md:grid-cols-[125px_1fr_auto]"
                >
                  <div className="flex items-center">
                    <button
                      onClick={() =>
                        changeDraft((old) =>
                          old.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  startTimeMs: Math.max(
                                    0,
                                    item.startTimeMs - 250,
                                  ),
                                }
                              : item,
                          ),
                        )
                      }
                      className="px-2 text-zinc-400"
                    >
                      −
                    </button>
                    <span className="w-16 text-center text-xs text-cyan-300">
                      {(line.startTimeMs / 1000).toFixed(2)}s
                    </span>
                    <button
                      onClick={() =>
                        changeDraft((old) =>
                          old.map((item, i) =>
                            i === index
                              ? { ...item, startTimeMs: item.startTimeMs + 250 }
                              : item,
                          ),
                        )
                      }
                      className="px-2 text-zinc-400"
                    >
                      +
                    </button>
                  </div>
                  <input
                    value={line.words}
                    onChange={(e) =>
                      changeDraft((old) =>
                        old.map((item, i) =>
                          i === index
                            ? { ...item, words: e.target.value }
                            : item,
                        ),
                      )
                    }
                    className="rounded-lg bg-black/30 px-3 py-2 outline-none focus:ring-1 focus:ring-violet-400"
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={() =>
                        changeDraft((old) =>
                          old.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  startTimeMs:
                                    (position + offset) /
                                    Math.max(0.001, timeScale),
                                }
                              : item,
                          ),
                        )
                      }
                      className="rounded px-2 text-xs text-cyan-300"
                    >
                      Marcar
                    </button>
                    <button
                      title="Dividir"
                      onClick={() =>
                        changeDraft((old) => {
                          const words = line.words.split(" ");
                          const middle = Math.ceil(words.length / 2);
                          return [
                            ...old.slice(0, index),
                            {
                              ...line,
                              words: words.slice(0, middle).join(" "),
                            },
                            {
                              startTimeMs: line.startTimeMs + 1000,
                              words: words.slice(middle).join(" "),
                            },
                            ...old.slice(index + 1),
                          ];
                        })
                      }
                      className="p-2 text-zinc-400"
                    >
                      <Scissors size={15} />
                    </button>
                    <button
                      disabled={index === 0}
                      title="Unir con anterior"
                      onClick={() =>
                        changeDraft((old) =>
                          old
                            .map((item, i) =>
                              i === index - 1
                                ? {
                                    ...item,
                                    words: `${item.words} ${line.words}`,
                                  }
                                : item,
                            )
                            .filter((_, i) => i !== index),
                        )
                      }
                      className="p-2 text-zinc-400 disabled:opacity-20"
                    >
                      <Merge size={15} />
                    </button>
                    <button
                      onClick={() =>
                        changeDraft((old) => old.filter((_, i) => i !== index))
                      }
                      className="p-2 text-zinc-600 hover:text-red-400"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-5">
              <button
                onClick={() =>
                  changeDraft((old) => [
                    ...old,
                    {
                      startTimeMs: (old.at(-1)?.startTimeMs || 0) + 3000,
                      words: "Nuevo verso",
                    },
                  ])
                }
                className="rounded-xl border border-white/10 px-4 py-2"
              >
                Añadir verso
              </button>
              <label className="flex items-center gap-2 text-sm text-zinc-400">
                <input
                  type="checkbox"
                  checked={publicEdit}
                  onChange={(e) => setPublicEdit(e.target.checked)}
                />{" "}
                Compartir corrección con la comunidad
              </label>
              <button
                onClick={saveEdits}
                className="rounded-xl bg-violet-500 px-6 py-2 font-bold"
              >
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      <GameModesModal open={modesOpen} onClose={() => setModesOpen(false)} />
      {spotifyNoticeOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/85 p-4 backdrop-blur-md">
          <div role="dialog" aria-modal="true" aria-labelledby="spotify-notice-title" className="w-full max-w-lg rounded-3xl border border-emerald-400/25 bg-[#11131a] p-7 shadow-2xl shadow-emerald-950/40">
            <div className="flex items-start justify-between gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300"><Music2/></div>
              <button aria-label="Cerrar aviso" onClick={() => setSpotifyNoticeOpen(false)} className="rounded-full p-1 text-zinc-400 hover:bg-white/10"><X/></button>
            </div>
            <h2 id="spotify-notice-title" className="mt-6 text-3xl font-black">Antes de comenzar</h2>
            <p className="mt-4 leading-relaxed text-zinc-300">Para escuchar la canción completa, iniciá sesión en Spotify desde este mismo navegador. Sin una sesión activa, Spotify puede reproducir solamente una vista previa de 30 segundos y la partida quedará incompleta.</p>
            <a href="https://open.spotify.com/" target="_blank" rel="noopener noreferrer" className="mt-6 block w-full rounded-xl border border-emerald-400/30 bg-emerald-400/10 py-3 text-center font-bold text-emerald-200">Abrir Spotify e iniciar sesión</a>
            <button onClick={acceptSpotifyNotice} className="mt-3 w-full rounded-xl bg-emerald-400 py-3 font-black text-emerald-950">Ya inicié sesión · comenzar</button>
            <p className="mt-4 text-center text-xs text-zinc-500">Este aviso se mostrará solamente esta vez.</p>
          </div>
        </div>
      )}
      {announcement && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/85 p-4 backdrop-blur-md">
          <div role="dialog" aria-modal="true" aria-labelledby="announcement-title" className="w-full max-w-xl overflow-hidden rounded-3xl border border-violet-400/25 bg-[#11131a] shadow-2xl shadow-violet-950/50">
            <div className="bg-gradient-to-r from-violet-600/30 to-cyan-500/20 p-7">
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[.25em] text-violet-200"><Sparkles size={16}/> Novedades</span>
                <button aria-label="Cerrar anuncio" onClick={dismissAnnouncement} className="rounded-full p-1 text-zinc-300 hover:bg-white/10"><X/></button>
              </div>
              <h2 id="announcement-title" className="mt-6 text-3xl font-black">{announcement.title}</h2>
            </div>
            <div className="p-7">
              <p className="whitespace-pre-wrap leading-relaxed text-zinc-300">{announcement.body}</p>
              <button onClick={dismissAnnouncement} className="mt-7 w-full rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 py-3 font-black text-white">¡Entendido!</button>
            </div>
          </div>
        </div>
      )}
      {guideOpen && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4 backdrop-blur-md">
          <div role="dialog" aria-modal="true" aria-labelledby="guide-title" className="w-full max-w-lg rounded-3xl border border-emerald-400/20 bg-[#11131a] p-7 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-[.25em] text-emerald-300">Guía rápida · {guideStep + 1}/{GUIDE_STEPS.length}</span>
              <button aria-label="Cerrar guía" onClick={() => setGuideOpen(false)}><X /></button>
            </div>
            <h2 id="guide-title" className="mt-6 text-3xl font-black">{GUIDE_STEPS[guideStep].title}</h2>
            <p className="mt-4 leading-relaxed text-zinc-300">{GUIDE_STEPS[guideStep].text}</p>
            <div className="mt-7 flex gap-2">{GUIDE_STEPS.map((_, index) => <span key={index} className={`h-1.5 flex-1 rounded-full ${index <= guideStep ? "bg-emerald-400" : "bg-white/10"}`} />)}</div>
            <div className="mt-7 flex justify-between">
              <button disabled={guideStep === 0} onClick={() => setGuideStep(step => Math.max(0, step - 1))} className="rounded-xl px-4 py-3 text-zinc-400 disabled:opacity-30">Anterior</button>
              <button onClick={() => {
                if (guideStep < GUIDE_STEPS.length - 1) setGuideStep(step => step + 1);
                else { localStorage.setItem(LS.guide, "1"); setGuideOpen(false); }
              }} className="rounded-xl bg-emerald-400 px-6 py-3 font-black text-emerald-950">{guideStep < GUIDE_STEPS.length - 1 ? "Siguiente" : "Entendido"}</button>
            </div>
          </div>
        </div>
      )}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#11121a] p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Accessibility /> Configuración
              </h2>
              <button onClick={() => setSettingsOpen(false)}>
                <X />
              </button>
            </div>
            <label className="mt-6 block text-sm text-zinc-400">
              Tamaño de letra: {Math.round(fontScale * 100)}%
            </label>
            <input
              type="range"
              min="0.8"
              max="1.5"
              step="0.1"
              value={fontScale}
              onChange={(e) => setFontScale(Number(e.target.value))}
              className="mt-2 w-full"
            />
            <label className="mt-5 flex items-center justify-between rounded-xl bg-white/5 p-4">
              <span>Alto contraste</span>
              <input
                type="checkbox"
                checked={highContrast}
                onChange={(e) => setHighContrast(e.target.checked)}
              />
            </label>
            <label className="mt-2 flex items-center justify-between rounded-xl bg-white/5 p-4">
              <span>Reducir animaciones</span>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(e) => setReducedMotion(e.target.checked)}
              />
            </label>
            <div className="mt-5 rounded-xl border border-violet-400/20 bg-violet-400/10 p-4">
              <b className="text-sm text-violet-200">
                Sincronización del dispositivo
              </b>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                {deviceOffsetMs === 0
                  ? "Sin ajuste personal. Si todas las canciones se escuchan adelantadas o atrasadas, calibralo desde una canción."
                  : "Hay un ajuste personal activo para este navegador y también se usa en multijugador."}
              </p>
              {deviceOffsetMs !== 0 && (
                <button
                  onClick={resetDeviceCalibration}
                  className="mt-3 rounded-lg border border-violet-300/20 px-3 py-2 text-xs font-bold text-violet-200"
                >
                  Restablecer sincronización del dispositivo
                </button>
              )}
            </div>
            {mobileSite && (
              <a
                href="https://discord.gg/vWBs6txYZR"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-400/20 bg-indigo-400/10 py-3 text-sm font-bold text-indigo-200"
              >
                <MessageCircle size={17} /> Unirme al Discord
              </a>
            )}
            <button
              onClick={() => {
                Object.values(LS).forEach((key) => {
                  localStorage.removeItem(key);
                  sessionStorage.removeItem(key);
                });
                location.reload();
              }}
              className="mt-5 w-full rounded-xl border border-red-400/20 py-3 text-sm text-red-300"
            >
              Borrar datos locales
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function SongGrid({
  title,
  songs,
  onPick,
}: {
  title: string;
  songs: SongCard[];
  onPick: (song: SongCard) => void;
}) {
  if (!songs.length) return null;
  return (
    <div className="mb-10">
      <h2 className="mb-4 text-xl font-bold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {songs.map((song) => (
          <button
            key={song.id}
            onClick={() => onPick(song)}
            className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.04] p-3 text-left hover:border-violet-400/50"
          >
            {song.image ? (
              <Image
                src={song.image}
                alt=""
                width={64}
                height={64}
                className="h-16 w-16 rounded-xl object-cover"
              />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-xl bg-violet-500/15">
                <Music2 />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <b className="block truncate">{song.title}</b>
              <span className="block truncate text-sm text-zinc-500">
                {song.artist}
              </span>
              {song.bestScore && (
                <span className="text-xs text-violet-300">
                  Récord {song.bestScore.toLocaleString()}
                </span>
              )}
            </span>
            <ChevronRight className="text-zinc-700 group-hover:text-violet-300" />
          </button>
        ))}
      </div>
    </div>
  );
}
