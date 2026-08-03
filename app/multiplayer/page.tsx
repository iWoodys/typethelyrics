"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Crown,
  Copy,
  Gamepad2,
  Heart,
  LogIn,
  LogOut,
  MessageCircle,
  Music2,
  Play,
  Radio,
  Search,
  Send,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  GameMode,
  MULTIPLAYER_GAME_MODE_DETAILS,
  multiplayerLinePolicy,
  normalizeText,
  rankFor,
} from "@/lib/game";
import type { LyricsResponse, SyncedLyric } from "@/components/types";

type Profile = {
  id: string;
  username: string;
  avatar_url: string | null;
  is_premium: boolean;
  premium_until: string | null;
};
type Lobby = {
  id: string;
  code: string;
  host_id: string;
  status: "waiting" | "countdown" | "playing" | "finished";
  game_mode: GameMode;
  spotify_track_id: string | null;
  track_url: string | null;
  track_title: string | null;
  track_artist: string | null;
  image_url: string | null;
  duration_ms: number | null;
  lyrics: SyncedLyric[];
  start_at: string | null;
};
type Player = {
  lobby_id: string;
  user_id: string;
  ready: boolean;
  audio_ready: boolean;
  score: number;
  accuracy: number;
  wpm: number;
  max_combo: number;
  finished_at: string | null;
  users: Profile;
};
type SongResult = {
  id: string;
  title: string;
  artist: string;
  image?: string;
  url: string;
};
type LobbyMessage = {
  id: string;
  lobby_id: string;
  user_id: string;
  body: string;
  created_at: string;
  users: Profile;
};

const premiumActive = (
  profile?: Pick<Profile, "is_premium" | "premium_until"> | null,
) =>
  !!profile?.is_premium &&
  (!profile.premium_until || new Date(profile.premium_until) > new Date());

function Avatar({
  profile,
  size = "md",
}: {
  profile: Profile;
  size?: "sm" | "md" | "lg";
}) {
  const dimensions =
    size === "lg" ? "h-20 w-20" : size === "sm" ? "h-9 w-9" : "h-12 w-12";
  const pixels = size === "lg" ? 80 : size === "sm" ? 36 : 48;
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      {profile.avatar_url ? (
        <Image
          src={profile.avatar_url}
          alt=""
          width={pixels}
          height={pixels}
          className={`${dimensions} rounded-2xl border border-white/10 object-cover`}
        />
      ) : (
        <div
          className={`${dimensions} grid place-items-center rounded-2xl border border-white/10 bg-white/5`}
        >
          <UserRound className="text-zinc-500" />
        </div>
      )}
      {premiumActive(profile) && (
        <span className="rounded-full bg-gradient-to-r from-amber-300 to-yellow-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-black">
          Premium
        </span>
      )}
    </div>
  );
}
export default function MultiplayerPage() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [messages, setMessages] = useState<LobbyMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatError, setChatError] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [code, setCode] = useState("");
  const [songUrl, setSongUrl] = useState("");
  const [selectedMode, setSelectedMode] = useState<GameMode>("rhythm");
  const [songSearch, setSongSearch] = useState("");
  const [songResults, setSongResults] = useState<SongResult[]>([]);
  const [searchingSongs, setSearchingSongs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [typedLineIndex, setTypedLineIndex] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const [lineFeedback, setLineFeedback] = useState<"correct" | "missed" | null>(
    null,
  );
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [lives, setLives] = useState(3);
  const [startedAt, setStartedAt] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [localFinished, setLocalFinished] = useState(false);
  const [allLinesComplete, setAllLinesComplete] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const feedbackTimer = useRef<number | null>(null);
  const submittedRef = useRef(false);
  const lastLineRef = useRef(0);
  const lastTypedLength = useRef(0);
  const lastProgressRef = useRef("");
  const publishingProgressRef = useRef(false);
  const audioReadySentRef = useRef<boolean | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState<number | null>(null);
  const [playbackUpdatedAt, setPlaybackUpdatedAt] = useState(0);
  const [playbackPaused, setPlaybackPaused] = useState(true);
  const liveStatsRef = useRef({ score: 0, accuracy: 100, wpm: 0, combo: 0 });

  const loadMessages = useCallback(async (roomId: string) => {
    const { data, error: messagesError } = await supabase
      .from("lobby_messages")
      .select(
        "id,lobby_id,user_id,body,created_at,users!lobby_messages_user_id_fkey(id,username,avatar_url,is_premium,premium_until)",
      )
      .eq("lobby_id", roomId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (messagesError) {
      setChatError("El chat no esta disponible en este momento.");
      return;
    }
    setMessages([...(data ?? [])].reverse() as unknown as LobbyMessage[]);
  }, []);

  const loadRoom = useCallback(async (roomId: string) => {
    const [{ data: room }, { data: memberRows }] = await Promise.all([
      supabase.from("lobbies").select("*").eq("id", roomId).single(),
      supabase
        .from("lobby_players")
        .select(
          "lobby_id,user_id,ready,audio_ready,score,accuracy,wpm,max_combo,finished_at,users!lobby_players_user_id_fkey(id,username,avatar_url,is_premium,premium_until)",
        )
        .eq("lobby_id", roomId)
        .order("joined_at"),
    ]);
    if (room) {
      const typedRoom = room as Lobby;
      setLobby(typedRoom);
      setSelectedMode(typedRoom.game_mode || "rhythm");
    }
    if (memberRows) setPlayers(memberRows as unknown as Player[]);
  }, []);

  useEffect(() => {
    let active = true;

    const restoreUser = async (user: User | null) => {
      if (!active) return;
      setAuthUser(user);
      setProfile(null);

      if (!user) {
        setLoading(false);
        return;
      }

      let { data: userProfile } = await supabase
        .from("users")
        .select("id,username,avatar_url,is_premium,premium_until")
        .eq("id", user.id)
        .maybeSingle();

      if (!userProfile) {
        const repaired = await supabase.rpc("repair_my_profile");
        userProfile = repaired.data as Profile | null;
        if (repaired.error) setError(`No pudimos crear tu perfil: ${repaired.error.message}`);
      }

      // Repara cuentas antiguas o perfiles que no fueron creados por el trigger.
      if (!userProfile) {
        const requestedUsername = String(
          user.user_metadata?.username ||
            user.email?.split("@")[0] ||
            "jugador",
        );
        let { data: repairedProfile, error: repairError } = await supabase
          .from("users")
          .insert({
            id: user.id,
            username: requestedUsername,
            email: user.email || "",
            score: 0,
          })
          .select("id,username,avatar_url,is_premium,premium_until")
          .maybeSingle();

        // Si el nombre ya existe, conserva la elección y agrega un sufijo corto.
        if (repairError?.code === "23505") {
          const retry = await supabase
            .from("users")
            .insert({
              id: user.id,
              username: `${requestedUsername}_${user.id.slice(0, 6)}`,
              email: user.email || "",
              score: 0,
            })
            .select("id,username,avatar_url,is_premium,premium_until")
            .maybeSingle();
          repairedProfile = retry.data;
          repairError = retry.error;
        }

        if (repairError)
          setError(`No pudimos crear tu perfil: ${repairError.message}`);
        userProfile = repairedProfile;
      }

      if (!active) return;
      setProfile(userProfile as Profile | null);
      // Mantiene la lista de salas limpia sin depender de un servicio pago.
      void supabase.rpc("cleanup_abandoned_lobbies");

      const roomCode = new URLSearchParams(window.location.search).get("room");
      if (roomCode) {
        const { data: room, error: joinError } = await supabase.rpc(
          "join_lobby",
          { room_code: roomCode.toUpperCase() },
        );
        if (!active) return;
        if (joinError) setError(joinError.message);
        else {
          const joinedRoom = room as Lobby;
          setLobby(joinedRoom);
          await loadRoom(joinedRoom.id);
        }
      }
      if (active) setLoading(false);
    };

    void supabase.auth
      .getSession()
      .then(({ data }) => restoreUser(data.session?.user ?? null));
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void restoreUser(session?.user ?? null);
      },
    );

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadRoom]);

  useEffect(() => {
    const roomId = lobby?.id;
    if (!roomId) return;
    const channel = supabase
      .channel(`lobby-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lobbies",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") setLobby(null);
          else setLobby((current) => current ? { ...current, ...(payload.new as Partial<Lobby>) } : current);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lobby_players",
          filter: `lobby_id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.eventType !== "UPDATE") { void loadRoom(roomId); return; }
          const changed = payload.new as Partial<Player> & { user_id?: string };
          setPlayers((current) => current.map((player) =>
            player.user_id === changed.user_id ? { ...player, ...changed } : player));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "lobby_messages",
          filter: `lobby_id=eq.${roomId}`,
        },
        () => void loadMessages(roomId),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [lobby?.id, loadMessages, loadRoom]);

  useEffect(() => {
    if (!lobby?.id || lobby.status !== "waiting") {
      setChatText("");
      setChatError("");
      return;
    }
    void loadMessages(lobby.id);
  }, [lobby?.id, lobby?.status, loadMessages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);

  useEffect(() => {
    if (!lobby?.id || !authUser) return;
    const beat = () => void supabase.rpc("heartbeat_lobby", { target_lobby: lobby.id }).then(({ error: heartbeatError }) => {
      if (heartbeatError) {
        setLobby(null);
        setPlayers([]);
        setError("La sala ya no está disponible.");
        history.replaceState(null, "", "/multiplayer");
      }
    });
    beat();
    const timer = window.setInterval(beat, 15_000);
    return () => window.clearInterval(timer);
  }, [authUser, lobby?.id]);

  const createLobby = async () => {
    setWorking(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("create_lobby");
    if (rpcError) setError(rpcError.message);
    else {
      const room = data as Lobby;
      setLobby(room);
      await loadRoom(room.id);
      history.replaceState(null, "", `/multiplayer?room=${room.code}`);
    }
    setWorking(false);
  };

  const joinByCode = async (rawCode = code, quiet = false) => {
    if (!authUser && !quiet) {
      setError("Iniciá sesión para entrar a una sala.");
      return;
    }
    setWorking(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("join_lobby", {
      room_code: rawCode.toUpperCase(),
    });
    if (rpcError) setError(rpcError.message);
    else {
      const room = data as Lobby;
      setLobby(room);
      await loadRoom(room.id);
      history.replaceState(null, "", `/multiplayer?room=${room.code}`);
    }
    setWorking(false);
  };

  const configureSongUrl = async (nextSongUrl: string) => {
    if (!lobby) return;
    const match = nextSongUrl.match(
      /(?:spotify:track:|spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?track\/)([a-zA-Z0-9]+)/i,
    );
    if (!match) {
      setError("Pegá un enlace válido de Spotify.");
      return;
    }
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: nextSongUrl }),
      });
      const data = (await response.json()) as LyricsResponse & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "No encontramos letras sincronizadas.");
      const { error: rpcError } = await supabase.rpc("configure_lobby", {
        target_lobby: lobby.id,
        new_track_id: match[1],
        new_track_url: nextSongUrl,
        new_title: data.trackDetails.track_name,
        new_artist: data.trackDetails.track_artist,
        new_image: data.trackDetails.album_image || null,
        new_duration: data.trackDetails.track_duration_ms || 0,
        new_lyrics: data.syncedLyrics,
        new_mode: selectedMode,
      });
      if (rpcError) throw rpcError;
      await loadRoom(lobby.id);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo cargar la canción.",
      );
    }
    setWorking(false);
  };

  const configureSong = (event: FormEvent) => {
    event.preventDefault();
    void configureSongUrl(songUrl);
  };

  const searchLobbySongs = async (event: FormEvent) => {
    event.preventDefault();
    if (songSearch.trim().length < 2) return;
    setSearchingSongs(true);
    setError("");
    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(songSearch)}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo buscar.");
      setSongResults(data.tracks || []);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo buscar la canción.",
      );
    } finally {
      setSearchingSongs(false);
    }
  };

  const changeLobbyMode = async (nextMode: GameMode) => {
    if (!lobby || lobby.host_id !== authUser?.id || lobby.status !== "waiting")
      return;
    setSelectedMode(nextMode);
    setError("");
    const { error: rpcError } = await supabase.rpc("set_lobby_mode", {
      target_lobby: lobby.id,
      new_mode: nextMode,
    });
    if (rpcError) setError(rpcError.message);
    else await loadRoom(lobby.id);
  };

  const toggleReady = async () => {
    if (!lobby || !authUser) return;
    const me = players.find((player) => player.user_id === authUser.id);
    const { error: rpcError } = await supabase.rpc("set_lobby_ready", {
      target_lobby: lobby.id,
      is_ready: !me?.ready,
    });
    if (rpcError) setError(rpcError.message);
    else await loadRoom(lobby.id);
  };

  const startLobby = async () => {
    if (!lobby) return;
    setError("");
    const { error: rpcError } = await supabase.rpc("start_lobby", {
      target_lobby: lobby.id,
    });
    if (rpcError) setError(rpcError.message);
    else await loadRoom(lobby.id);
  };

  const copyLobbyCode = async () => {
    if (!lobby) return;
    setError("");
    try {
      if (navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(lobby.code);
      else throw new Error("Clipboard API unavailable");
    } catch {
      const helper = document.createElement("textarea");
      helper.value = lobby.code;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      const copiedWithFallback = document.execCommand("copy");
      helper.remove();
      if (!copiedWithFallback) {
        setError(`No se pudo copiar. Código: ${lobby.code}`);
        return;
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const sendLobbyMessage = async (event: FormEvent) => {
    event.preventDefault();
    const messageBody = chatText.trim().replace(/\s+/g, " ");
    if (!lobby || lobby.status !== "waiting" || !messageBody) return;
    setSendingMessage(true);
    setChatError("");
    const { error: messageError } = await supabase.rpc("send_lobby_message", {
      target_lobby: lobby.id,
      message_body: messageBody,
    });
    if (messageError) {
      setChatError(messageError.message);
    } else {
      setChatText("");
      await loadMessages(lobby.id);
    }
    setSendingMessage(false);
  };

  const leaveLobby = async () => {
    if (!lobby) return;
    setWorking(true); setError("");
    const { error: leaveError } = await supabase.rpc("leave_lobby", { target_lobby: lobby.id });
    setWorking(false);
    if (leaveError) { setError(leaveError.message); return; }
    setLobby(null); setPlayers([]); setMessages([]); setStartedAt(0); setLocalFinished(false);
    history.replaceState(null, "", "/multiplayer");
  };

  const returnToLobby = async () => {
    if (!lobby) return;
    setWorking(true);
    setError("");
    const { error: resetError } = await supabase.rpc("reset_lobby", {
      target_lobby: lobby.id,
    });
    if (resetError) {
      setError(resetError.message);
      setWorking(false);
      return;
    }
    setLocalFinished(false);
    setAllLinesComplete(false);
    setStartedAt(0);
    setCountdown(null);
    setTyped("");
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setCorrect(0);
    setMistakes(0);
    setLives(3);
    submittedRef.current = false;
    lastProgressRef.current = "";
    lastLineRef.current = 0;
    lastTypedLength.current = 0;
    await loadRoom(lobby.id);
    setWorking(false);
  };

  const sendPlayer = useCallback(
    (command: string) =>
      iframeRef.current?.contentWindow?.postMessage({ command }, "*"),
    [],
  );
  useEffect(() => {
    audioReadySentRef.current = null;
    setPlaybackPosition(null);
    setPlaybackPaused(true);
  }, [lobby?.spotify_track_id]);
  useEffect(() => {
    const onPlayback = (event: MessageEvent) => {
      if (event.origin !== "https://open.spotify.com" || event.data?.type !== "playback_update") return;
      const payload = event.data?.payload;
      if (!lobby) return;
      setPlaybackPaused(Boolean(payload?.isPaused));
      if (typeof payload?.position === "number") {
        setPlaybackPosition(payload.position);
        setPlaybackUpdatedAt(Date.now());
      }
      if (lobby.status !== "waiting") return;
      const ready = !payload?.isPaused;
      if (audioReadySentRef.current === ready) return;
      audioReadySentRef.current = ready;
      void supabase.rpc("set_lobby_audio_ready", { target_lobby: lobby.id, is_ready: ready })
        .then(() => loadRoom(lobby.id));
    };
    window.addEventListener("message", onPlayback);
    return () => window.removeEventListener("message", onPlayback);
  }, [lobby, loadRoom]);
  useEffect(() => {
    if (!lobby?.start_at || !["countdown", "playing"].includes(lobby.status))
      return;
    const tick = () => {
      const remaining = new Date(lobby.start_at!).getTime() - Date.now();
      setCountdown(remaining > 0 ? Math.ceil(remaining / 1000) : 0);
      if (remaining <= 0 && !startedAt) {
        setLineIndex(0);
        setTypedLineIndex(0);
        setTyped("");
        setLineFeedback(null);
        setAllLinesComplete(false);
        setStartedAt(new Date(lobby.start_at!).getTime());
        sendPlayer("restart");
        sendPlayer("play");
        void supabase.rpc("mark_lobby_playing", { target_lobby: lobby.id });
      }
    };
    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [lobby?.id, lobby?.start_at, lobby?.status, sendPlayer, startedAt]);

  useEffect(() => {
    if (lobby?.status !== "waiting" || !localFinished) return;
    setLocalFinished(false);
    setAllLinesComplete(false);
    setStartedAt(0);
    setCountdown(null);
    submittedRef.current = false;
  }, [lobby?.status, localFinished]);

  useEffect(() => {
    if (!startedAt || localFinished) return;
    const timer = window.setInterval(() => setClock(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [localFinished, startedAt]);

  const wallPosition = startedAt ? Math.max(0, clock - startedAt) : 0;
  // El reloj compartido manda: una pausa o reinicio local de Spotify nunca puede
  // atrasar las letras ni extender la partida para un solo jugador.
  const gamePosition = wallPosition;
  const estimatedPlaybackPosition = playbackPosition === null
    ? null
    : playbackPosition + (playbackPaused ? 0 : Math.max(0, clock - playbackUpdatedAt));
  const playbackDrift = estimatedPlaybackPosition === null
    ? null
    : estimatedPlaybackPosition - gamePosition;
  const synchronized = playbackDrift === null || gamePosition < 5_000 || Math.abs(playbackDrift) <= 1_500;
  const lyrics = useMemo(() => lobby?.lyrics || [], [lobby?.lyrics]);
  const gameMode: GameMode = lobby?.game_mode || "rhythm";
  const timedIndex = useMemo(() => {
    let found = 0;
    lyrics.forEach((line, index) => {
      if (gamePosition >= line.startTimeMs) found = index;
    });
    return found;
  }, [gamePosition, lyrics]);
  const currentLine = lyrics[lineIndex];
  const target = currentLine
    ? normalizeText(currentLine.words, gameMode === "expert", true, false)
    : "";
  const visibleTyped = typedLineIndex === lineIndex ? typed : "";
  const normalizedTyped = normalizeText(
    visibleTyped,
    gameMode === "expert",
    true,
    false,
  );
  const singerStarted =
    !!currentLine && gamePosition >= currentLine.startTimeMs;
  const lineWaitMs = currentLine
    ? Math.max(0, currentLine.startTimeMs - gamePosition)
    : 0;
  const canType =
    !!startedAt &&
    countdown === 0 &&
    singerStarted &&
    !localFinished &&
    !allLinesComplete &&
    lineIndex <= timedIndex &&
    !playbackPaused;
  const currentWord = useMemo(() => {
    if (!currentLine) return -1;
    const next =
      lyrics[lineIndex + 1]?.startTimeMs || currentLine.startTimeMs + 5000;
    const ratio = Math.max(
      0,
      Math.min(
        0.999,
        (gamePosition - currentLine.startTimeMs) /
          Math.max(1, next - currentLine.startTimeMs),
      ),
    );
    return Math.floor(ratio * currentLine.words.split(/\s+/).length);
  }, [currentLine, gamePosition, lineIndex, lyrics]);
  const showLineFeedback = useCallback((type: "correct" | "missed") => {
    setLineFeedback(type);
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setLineFeedback(null), 700);
  }, []);
  useEffect(() => {
    if (canType) inputRef.current?.focus();
  }, [canType, lineIndex]);

  useEffect(() => {
    if (
      !startedAt ||
      localFinished ||
      timedIndex <= lineIndex ||
      !multiplayerLinePolicy(gameMode).advanceWithClock
    )
      return;
    const missed = timedIndex - lineIndex;
    if (multiplayerLinePolicy(gameMode).penalizeMissed) {
      setMistakes((value) => value + missed);
      setCombo(0);
    }
    setTyped("");
    setTypedLineIndex(timedIndex);
    setLineIndex(timedIndex);
    showLineFeedback("missed");
    lastTypedLength.current = 0;
    lastLineRef.current = timedIndex;
    if (gameMode === "survival")
      setLives((value) => Math.max(0, value - missed));
  }, [
    gameMode,
    lineIndex,
    localFinished,
    showLineFeedback,
    startedAt,
    timedIndex,
  ]);

  const finish = useCallback(async (finalStats?: {
    score?: number;
    correct?: number;
    mistakes?: number;
    maxCombo?: number;
  }, pauseAudio = true) => {
    if (!lobby || submittedRef.current) return;
    submittedRef.current = true;
    const finalScore = finalStats?.score ?? score;
    const finalCorrect = finalStats?.correct ?? correct;
    const finalMistakes = finalStats?.mistakes ?? mistakes;
    const finalMaxCombo = finalStats?.maxCombo ?? maxCombo;
    const minutes = Math.max((Date.now() - startedAt) / 60000, 1 / 60);
    const accuracy = finalCorrect + finalMistakes
      ? (finalCorrect / (finalCorrect + finalMistakes)) * 100
      : 0;
    const wpm = Math.round(finalCorrect / 5 / minutes);
    setLocalFinished(true);
    if (pauseAudio) sendPlayer("pause");
    const { error: rpcError } = await supabase.rpc("submit_lobby_result", {
      target_lobby: lobby.id,
      final_score: finalScore,
      final_accuracy: accuracy,
      final_wpm: wpm,
      final_combo: finalMaxCombo,
    });
    if (rpcError) setError(rpcError.message);
    await loadRoom(lobby.id);
  }, [
    correct,
    lobby,
    loadRoom,
    maxCombo,
    mistakes,
    score,
    sendPlayer,
    startedAt,
  ]);

  const liveAccuracy =
    correct + mistakes ? (correct / (correct + mistakes)) * 100 : 100;
  const liveMinutes = Math.max((Date.now() - startedAt) / 60000, 1 / 60);
  liveStatsRef.current = {
    score,
    accuracy: liveAccuracy,
    wpm: Math.round(correct / 5 / liveMinutes),
    combo: maxCombo,
  };

  useEffect(() => {
    if (!lobby || !startedAt || localFinished) return;
    const publish = async () => {
      const stats = liveStatsRef.current;
      const signature = `${stats.score}:${stats.accuracy.toFixed(1)}:${stats.wpm}:${stats.combo}`;
      if (
        signature === lastProgressRef.current ||
        publishingProgressRef.current
      )
        return;
      publishingProgressRef.current = true;
      setPlayers((current) =>
        current.map((player) =>
          player.user_id === authUser?.id
            ? {
                ...player,
                score: stats.score,
                accuracy: Math.round(stats.accuracy * 10) / 10,
                wpm: stats.wpm,
                max_combo: Math.max(player.max_combo, stats.combo),
              }
            : player,
        ),
      );
      const { error: progressError } = await supabase.rpc(
        "update_lobby_progress",
        {
          target_lobby: lobby.id,
          current_score: stats.score,
          current_accuracy: stats.accuracy,
          current_wpm: stats.wpm,
          current_combo: stats.combo,
        },
      );
      publishingProgressRef.current = false;
      if (progressError) {
        setError(
          `No se pudo sincronizar la puntuación: ${progressError.message}`,
        );
        return;
      }
      lastProgressRef.current = signature;
      await loadRoom(lobby.id);
    };
    publish();
    const timer = window.setInterval(publish, 2000);
    return () => window.clearInterval(timer);
  }, [authUser?.id, loadRoom, lobby, localFinished, startedAt]);

  useEffect(() => {
    if (
      startedAt &&
      lobby?.duration_ms &&
      gamePosition >= lobby.duration_ms - 100
    )
      void finish(undefined, false);
  }, [finish, gamePosition, lobby?.duration_ms, startedAt]);

  const typeLine = (value: string) => {
    if (!canType || !currentLine) return;
    const normalized = normalizeText(value, gameMode === "expert", true, false);
    let addedCorrect = 0;
    let addedMistakes = 0;
    if (normalized.length > lastTypedLength.current) {
      for (let at = lastTypedLength.current; at < normalized.length; at += 1) {
        if (normalized[at] === target[at]) addedCorrect += 1;
        else addedMistakes += 1;
      }
      if (addedCorrect) setCorrect((old) => old + addedCorrect);
      if (addedMistakes) {
        setMistakes((old) => old + addedMistakes);
        setCombo(0);
        if (gameMode === "survival")
          setLives((currentLives) => Math.max(0, currentLives - addedMistakes));
      }
    }
    lastTypedLength.current = normalized.length;
    setTypedLineIndex(lineIndex);
    setTyped(value);
    if (normalized === target) {
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      setMaxCombo((old) => Math.max(old, nextCombo));
      const linePoints = target.length * 10 + 300 + Math.min(900, nextCombo * 30);
      setScore((old) => old + linePoints);
      showLineFeedback("correct");
      setTyped("");
      lastTypedLength.current = 0;
      lastLineRef.current = lineIndex + 1;
      if (lineIndex >= lyrics.length - 1) setAllLinesComplete(true);
      else {
        setTypedLineIndex(lineIndex + 1);
        setLineIndex((index) => index + 1);
      }
    }
  };

  useEffect(() => {
    if (gameMode === "survival" && startedAt && lives <= 0 && !localFinished)
      void finish();
  }, [finish, gameMode, lives, localFinished, startedAt]);

  const sortedPlayers = [...players].sort(
    (a, b) => b.score - a.score || b.accuracy - a.accuracy || b.wpm - a.wpm,
  );
  const me = players.find((player) => player.user_id === authUser?.id);
  const allReady =
    players.length > 0 && players.every((player) => player.ready);
  const allAudioReady =
    players.length > 0 && players.every((player) => player.audio_ready);

  if (loading)
    return (
      <main className="grid min-h-screen place-items-center bg-[#07080d] text-zinc-400">
        Cargando multijugador…
      </main>
    );
  if (!authUser || !profile)
    return (
      <main className="grid min-h-screen place-items-center bg-[#07080d] p-4 text-white">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <LogIn className="mx-auto text-violet-300" size={42} />
          <h1 className="mt-4 text-2xl font-black">
            Iniciá sesión para competir
          </h1>
          <p className="mt-2 text-zinc-400">
            Todas las cuentas pueden unirse. Las cuentas Premium también pueden
            crear salas.
          </p>
          <Link
            href="/auth"
            className="mt-6 inline-block rounded-xl bg-violet-500 px-6 py-3 font-bold"
          >
            Entrar o registrarme
          </Link>
        </div>
      </main>
    );

  if (!lobby)
    return (
      <main className="min-h-screen bg-[#07080d] p-4 text-white">
        <div className="mx-auto max-w-5xl py-10">
          <Link href="/" className="text-sm text-zinc-400">
            ← Volver al juego
          </Link>
          <div className="mt-8 text-center">
            <Gamepad2 className="mx-auto text-violet-300" size={54} />
            <h1 className="mt-4 text-4xl font-black">Multijugador</h1>
            <p className="mt-2 text-zinc-400">
              Competí en tiempo real con hasta ocho jugadores.
            </p>
          </div>
          {error && (
            <p className="mx-auto mt-5 max-w-xl rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-center text-red-300">
              {error}
            </p>
          )}
          <div className="mx-auto mt-10 grid max-w-3xl gap-5 md:grid-cols-2">
            <section className="rounded-3xl border border-amber-400/20 bg-amber-400/[.06] p-6">
              <Crown className="text-amber-300" />
              <h2 className="mt-4 text-xl font-bold">Crear una sala</h2>
              <p className="mt-2 min-h-12 text-sm text-zinc-400">
                Elegí la canción e invitá hasta siete amigos.
              </p>
              <button
                disabled={!premiumActive(profile) || working}
                onClick={createLobby}
                className="mt-6 w-full rounded-xl bg-gradient-to-r from-amber-300 to-yellow-500 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                {premiumActive(profile)
                  ? "Crear lobby Premium"
                  : "Requiere Premium"}
              </button>
            </section>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void joinByCode();
              }}
              className="rounded-3xl border border-violet-400/20 bg-violet-400/[.06] p-6"
            >
              <Users className="text-violet-300" />
              <h2 className="mt-4 text-xl font-bold">Unirme a una sala</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Ingresá el código de seis caracteres.
              </p>
              <input
                value={code}
                onChange={(event) =>
                  setCode(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 6),
                  )
                }
                placeholder="ABC123"
                className="mt-5 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-center text-xl font-black tracking-[.35em] outline-none focus:border-violet-400"
              />
              <button
                disabled={code.length !== 6 || working}
                className="mt-3 w-full rounded-xl bg-violet-500 py-3 font-bold disabled:opacity-40"
              >
                Unirme
              </button>
            </form>
          </div>
        </div>
      </main>
    );

  const isHost = lobby.host_id === authUser.id;
  const showResults = localFinished || lobby.status === "finished";
  if (showResults)
    return (
      <main className="min-h-screen bg-[#07080d] p-4 text-white">
        <div className="mx-auto max-w-3xl py-10">
          <Trophy className="mx-auto text-amber-300" size={58} />
          <h1 className="mt-3 text-center text-4xl font-black">Resultados</h1>
          <p className="mt-2 text-center text-zinc-400">{lobby.track_title}</p>
          <div className="mt-8 space-y-3">
            {sortedPlayers.map((player, index) => (
              <div
                key={player.user_id}
                className={`grid grid-cols-[45px_1fr_auto] items-center gap-3 rounded-2xl border p-4 ${index === 0 ? "border-amber-300/40 bg-amber-300/10" : "border-white/10 bg-white/[.04]"}`}
              >
                <b className="text-xl">#{index + 1}</b>
                <div className="flex items-center gap-3">
                  <Avatar profile={player.users} size="sm" />
                  <div>
                    <b>{player.users.username}</b>
                    <p className="text-xs text-zinc-500">
                      {player.finished_at
                        ? `${player.wpm} ppm · ${player.accuracy}%`
                        : "Jugando…"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <b className="text-xl text-violet-300">
                    {player.score.toLocaleString()}
                  </b>
                  <p className="text-xs text-zinc-500">
                    {rankFor(player.score, player.accuracy)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => void (isHost ? returnToLobby() : leaveLobby())}
            className="mt-7 w-full rounded-xl bg-white py-3 text-center font-bold text-black"
          >
            {isHost ? "Volver a la lobby" : "Salir de la sala"}
          </button>
        </div>
      </main>
    );

  const inGame = lobby.status !== "waiting";
  return (
    <main className="min-h-screen bg-[#07080d] p-4 text-white">
      <div className="mx-auto max-w-6xl py-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><Link href="/" className="font-bold">TypeTheLyrics</Link>
            <button disabled={working} onClick={() => void leaveLobby()} className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 hover:text-white disabled:opacity-50"><LogOut size={14}/> Salir</button>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2">
            <Radio size={15} className="text-emerald-300" />
            <span className="text-xs text-zinc-400">SALA</span>
            <b className="tracking-[.2em]">{lobby.code}</b>
            <button
              onClick={() => void copyLobbyCode()}
              aria-label="Copiar código de la lobby"
            >
              <Copy size={15} />
            </button>
            {copied && (
              <span className="text-xs text-emerald-300">Copiado</span>
            )}
          </div>
        </header>
        {error && (
          <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-red-300">
            {error}
          </p>
        )}
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
          <section className="rounded-3xl border border-white/10 bg-white/[.04] p-5 sm:p-7">
            {lobby.spotify_track_id && (
              <iframe
                ref={iframeRef}
                title="Spotify"
                src={`https://open.spotify.com/embed/track/${lobby.spotify_track_id}?theme=0`}
                width="100%"
                height="152"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                className="rounded-xl"
              />
            )}
            {!inGame && lobby.host_id === authUser.id && (
              <div className="mt-5 space-y-5">
                <div>
                  <p className="mb-2 text-sm font-bold text-zinc-300">
                    Modo de juego
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {(Object.keys(MULTIPLAYER_GAME_MODE_DETAILS) as GameMode[]).map(
                      (modeKey) => (
                        <button
                          key={modeKey}
                          onClick={() => void changeLobbyMode(modeKey)}
                          title={MULTIPLAYER_GAME_MODE_DETAILS[modeKey].description}
                          className={`rounded-xl border px-3 py-2 text-sm font-bold ${selectedMode === modeKey ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/10 bg-black/20 text-zinc-400"}`}
                        >
                          {MULTIPLAYER_GAME_MODE_DETAILS[modeKey].name}
                        </button>
                      ),
                    )}
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    {MULTIPLAYER_GAME_MODE_DETAILS[selectedMode].description}
                  </p>
                </div>
                <form onSubmit={searchLobbySongs}>
                  <label className="text-sm font-bold text-zinc-300">
                    Buscar una canción
                  </label>
                  <div className="mt-2 flex gap-2">
                    <div className="relative flex-1">
                      <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                        size={18}
                      />
                      <input
                        value={songSearch}
                        onChange={(event) => setSongSearch(event.target.value)}
                        placeholder="Canción o artista"
                        className="h-12 w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-3 outline-none focus:border-violet-400"
                      />
                    </div>
                    <button
                      disabled={searchingSongs}
                      className="rounded-xl bg-white px-5 font-bold text-black"
                    >
                      {searchingSongs ? "Buscando…" : "Buscar"}
                    </button>
                  </div>
                </form>
                {songResults.length > 0 && (
                  <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
                    {songResults.map((song) => (
                      <button
                        key={song.id}
                        disabled={working}
                        onClick={() => {
                          setSongUrl(song.url);
                          void configureSongUrl(song.url);
                        }}
                        className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-left hover:border-violet-400/50 disabled:opacity-50"
                      >
                        {song.image ? (
                          <Image
                            src={song.image}
                            alt=""
                            width={48}
                            height={48}
                            className="h-12 w-12 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="grid h-12 w-12 place-items-center rounded-lg bg-violet-500/15">
                            <Music2 size={18} />
                          </span>
                        )}
                        <span className="min-w-0">
                          <b className="block truncate text-sm">{song.title}</b>
                          <span className="block truncate text-xs text-zinc-500">
                            {song.artist}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <form onSubmit={configureSong}>
                  <label className="text-sm text-zinc-400">
                    O pegá un enlace de Spotify
                    <input
                      value={songUrl}
                      onChange={(event) => setSongUrl(event.target.value)}
                      placeholder="https://open.spotify.com/track/..."
                      className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 outline-none focus:border-violet-400"
                    />
                  </label>
                  <button
                    disabled={working}
                    className="mt-3 w-full rounded-xl bg-violet-500 py-3 font-bold"
                  >
                    {working ? "Cargando letras…" : "Elegir canción"}
                  </button>
                </form>
              </div>
            )}
            {!inGame && lobby.host_id !== authUser.id && !lobby.track_title && (
              <div className="grid min-h-64 place-items-center text-center text-zinc-500">
                El anfitrión está eligiendo una canción en modo{" "}
                {MULTIPLAYER_GAME_MODE_DETAILS[gameMode].name}…
              </div>
            )}
            {!inGame && lobby.track_title && (
              <div className="mt-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black">{lobby.track_title}</h2>
                  <p className="text-zinc-400">{lobby.track_artist}</p>
                  <span className="mt-2 inline-block rounded-full bg-violet-500/15 px-3 py-1 text-xs font-bold text-violet-300">
                    {MULTIPLAYER_GAME_MODE_DETAILS[gameMode].name}
                  </span>
                  <p className="mt-3 text-sm text-amber-200">
                    Presioná Play en Spotify. La partida se habilita cuando todos tengan audio.
                  </p>
                </div>
                {lobby.host_id === authUser.id ? (
                  <button
                    disabled={!allReady || !allAudioReady}
                    onClick={startLobby}
                    className="flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 font-black text-black disabled:opacity-30"
                  >
                    <Play size={18} /> Iniciar
                  </button>
                ) : (
                  <button
                    onClick={toggleReady}
                    className={`rounded-xl px-5 py-3 font-black ${me?.ready ? "bg-emerald-400 text-black" : "bg-white text-black"}`}
                  >
                    {me?.ready ? "¡Listo!" : "Estoy listo"}
                  </button>
                )}
              </div>
            )}
            {inGame && (
              <div className="mt-6">
                {countdown !== null && countdown > 0 ? (
                  <div className="grid min-h-72 place-items-center text-center">
                    <div>
                      <p className="text-zinc-400">La partida comienza en</p>
                      <b className="text-8xl font-black text-violet-300">
                        {countdown}
                      </b>
                      <p className="mt-4 text-sm text-amber-200">
                        Presioná Play en Spotify durante la cuenta regresiva.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                      <span className="text-zinc-400">
                        Puntuación{" "}
                        <b className="text-white">{score.toLocaleString()}</b>
                      </span>
                      <span className="rounded-full bg-violet-500/15 px-3 py-1 text-xs font-bold text-violet-300">
                        {MULTIPLAYER_GAME_MODE_DETAILS[gameMode].name}
                      </span>
                      {gameMode === "survival" && (
                        <span className="flex items-center gap-1 text-red-300">
                          <Heart size={15} fill="currentColor" /> {lives}
                        </span>
                      )}
                      <span className="text-zinc-400">
                        Combo <b className="text-cyan-300">{combo}x</b>
                      </span>
                    </div>
                    {!synchronized && (
                      <div role="status" className="mb-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-center text-sm text-amber-100">
                        Spotify está fuera del tiempo de la sala ({Math.round(playbackDrift || 0)} ms). Los versos seguirán avanzando para no congelar la partida.
                      </div>
                    )}
                    <div
                      onClick={() => inputRef.current?.focus()}
                      className={`relative min-h-[330px] cursor-text overflow-hidden rounded-3xl border bg-gradient-to-b from-white/[.07] to-white/[.02] p-6 text-center transition-all duration-200 sm:p-10 ${lineFeedback === "correct" ? "border-emerald-400 bg-emerald-400/10 shadow-[0_0_40px_rgba(52,211,153,.25)]" : lineFeedback === "missed" ? "border-red-400 bg-red-400/10 shadow-[0_0_40px_rgba(248,113,113,.2)]" : "border-white/10"}`}
                    >
                      {lineFeedback && (
                        <div
                          className={`absolute left-4 top-4 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider ${lineFeedback === "correct" ? "bg-emerald-400 text-emerald-950" : "bg-red-400 text-red-950"}`}
                        >
                          {lineFeedback === "correct"
                            ? "✓ Frase correcta"
                            : "✕ Frase incompleta"}
                        </div>
                      )}
                      <p
                        className={`mb-6 mt-12 text-sm uppercase tracking-[.3em] ${canType ? "text-cyan-300" : "text-zinc-600"}`}
                      >
                        {canType
                          ? "Escribí ahora"
                          : currentLine
                            ? `La voz entra en ${(lineWaitMs / 1000).toFixed(1)} s`
                            : "Canción completada"}
                      </p>
                      <div
                        className={`min-h-24 text-3xl font-bold leading-relaxed transition-opacity ${!canType ? "opacity-35" : "opacity-100"}`}
                      >
                        {currentLine?.words
                          .split(/\s+/)
                          .map((word, wordIndex) => (
                            <span
                              key={wordIndex}
                              className={`mr-3 inline-block transition-all ${canType && wordIndex === currentWord ? "text-cyan-300 [text-shadow:0_0_22px_rgba(103,232,249,.5)]" : ""}`}
                            >
                              {word.split("").map((char, charIndex) => {
                                const before =
                                  currentLine.words
                                    .split(/\s+/)
                                    .slice(0, wordIndex)
                                    .join(" ").length +
                                  (wordIndex ? 1 : 0) +
                                  charIndex;
                                const actual = normalizedTyped[before];
                                const expected = target[before];
                                return (
                                  <span
                                    key={charIndex}
                                    className={
                                      actual == null
                                        ? "text-zinc-300"
                                        : actual === expected
                                          ? "text-emerald-400"
                                          : "rounded bg-red-500/30 text-red-300"
                                    }
                                  >
                                    {char}
                                  </span>
                                );
                              })}
                            </span>
                          )) || "Preparando la letra…"}
                      </div>
                      <p className="mt-8 text-xl text-zinc-600">
                        {lyrics[lineIndex + 1]?.words || "Último verso"}
                      </p>
                      {!canType && currentLine && (
                        <div className="mx-auto mt-6 h-1.5 max-w-xs overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full animate-pulse bg-cyan-300"
                            style={{
                              width: `${Math.max(8, 100 - Math.min(100, (lineWaitMs / 5000) * 100))}%`,
                            }}
                          />
                        </div>
                      )}
                      <input
                        key={lineIndex}
                        ref={inputRef}
                        value={visibleTyped}
                        onChange={(event) => typeLine(event.target.value)}
                        onPaste={(event) => event.preventDefault()}
                        disabled={!canType}
                        className="absolute inset-0 opacity-0"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
          <aside className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">
                {inGame ? "Clasificación en vivo" : "Jugadores"}
              </h2>
              <span className="rounded-full bg-white/5 px-2 py-1 text-xs">
                {players.length}/8
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {(inGame ? sortedPlayers : players).map((player, index) => (
                <div
                  key={player.user_id}
                  className={`flex items-center gap-3 rounded-2xl border p-3 ${inGame && index === 0 ? "border-amber-300/30 bg-amber-300/10" : "border-white/5 bg-black/20"}`}
                >
                  <span
                    className={`w-5 text-center text-xs font-black ${index === 0 && inGame ? "text-amber-300" : "text-zinc-500"}`}
                  >
                    {inGame ? `#${index + 1}` : ""}
                  </span>
                  <Avatar profile={player.users} size="sm" />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate">{player.users.username}</b>
                    <span className="text-xs text-zinc-500">
                      {inGame
                        ? `${player.accuracy}% · ${player.wpm} ppm`
                        : `${player.user_id === lobby.host_id ? "Anfitrión" : player.ready ? "Listo" : "Preparándose"} · ${player.audio_ready ? "audio listo" : "sin audio"}`}
                    </span>
                  </div>
                  {inGame ? (
                    <b className="text-sm text-violet-300">
                      {player.score.toLocaleString()}
                    </b>
                  ) : (
                    <span className={`h-2 w-2 rounded-full ${player.ready && player.audio_ready ? "bg-emerald-400" : "bg-amber-300"}`} />
                  )}
                </div>
              ))}
            </div>
            {!inGame && (
              <div className="mt-6 border-t border-white/10 pt-5">
                <div className="flex items-center gap-2">
                  <MessageCircle size={17} className="text-cyan-300" />
                  <h2 className="font-bold">Chat de la sala</h2>
                </div>
                <div
                  className="mt-3 h-64 space-y-3 overflow-y-auto rounded-2xl border border-white/5 bg-black/20 p-3"
                  aria-live="polite"
                >
                  {messages.length === 0 && (
                    <p className="py-10 text-center text-sm text-zinc-600">
                      Todavia no hay mensajes.
                    </p>
                  )}
                  {messages.map((message) => (
                    <div key={message.id} className="flex items-start gap-2">
                      <Avatar profile={message.users} size="sm" />
                      <div className="min-w-0 flex-1 rounded-xl bg-white/5 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <b className="truncate text-xs text-violet-200">
                            {message.users.username}
                          </b>
                          <time
                            dateTime={message.created_at}
                            className="shrink-0 text-[10px] text-zinc-600"
                          >
                            {new Date(message.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                        <p className="mt-1 break-words text-sm text-zinc-300">
                          {message.body}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={sendLobbyMessage} className="mt-3 flex gap-2">
                  <input
                    value={chatText}
                    onChange={(event) => setChatText(event.target.value)}
                    maxLength={300}
                    placeholder="Escribi un mensaje..."
                    aria-label="Mensaje para el chat de la sala"
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-400"
                  />
                  <button
                    type="submit"
                    disabled={sendingMessage || !chatText.trim()}
                    aria-label="Enviar mensaje"
                    className="grid w-11 place-items-center rounded-xl bg-cyan-400 text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Send size={17} />
                  </button>
                </form>
                {chatError && (
                  <p className="mt-2 text-xs text-red-300">{chatError}</p>
                )}
                <p className="mt-2 text-[11px] text-zinc-600">
                  El chat se cierra automaticamente cuando comienza la partida.
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
