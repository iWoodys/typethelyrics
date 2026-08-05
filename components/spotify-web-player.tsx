"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Music2 } from "lucide-react";
import type {
  SpotifyControllerStatus,
  SpotifyEmbedCommand,
  SpotifyEmbedHandle,
  SpotifyPlaybackState,
} from "@/components/spotify-embed";

type WebPlaybackState = {
  paused: boolean;
  loading?: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: { id: string; uri: string };
  };
};

type WebPlaybackPlayer = {
  activateElement: () => Promise<void>;
  addListener: (event: string, listener: (payload: never) => void) => boolean;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
};

type SpotifyWebSdk = {
  Player: new (options: {
    name: string;
    getOAuthToken: (callback: (token: string) => void) => void;
    volume: number;
  }) => WebPlaybackPlayer;
};

declare global {
  interface Window {
    Spotify?: SpotifyWebSdk;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

type SpotifyWebPlayerProps = {
  trackId: string;
  durationMs?: number;
  className?: string;
  onPlaybackUpdate?: (state: SpotifyPlaybackState) => void;
  onPlaybackStarted?: () => void;
  onReady?: () => void;
  onControllerStatus?: (status: SpotifyControllerStatus) => void;
};

let webPlaybackSdkPromise: Promise<SpotifyWebSdk> | null = null;

function loadWebPlaybackSdk() {
  if (window.Spotify) return Promise.resolve(window.Spotify);
  if (webPlaybackSdkPromise) return webPlaybackSdkPromise;

  webPlaybackSdkPromise = new Promise<SpotifyWebSdk>((resolve, reject) => {
    const previousReady = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      previousReady?.();
      if (window.Spotify) resolve(window.Spotify);
      else reject(new Error("Spotify Web Playback SDK unavailable"));
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://sdk.scdn.co/spotify-player.js"]',
    );
    if (existing) return;
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    script.addEventListener("error", () => {
      webPlaybackSdkPromise = null;
      reject(new Error("No se pudo cargar Spotify Web Playback."));
    });
    document.body.appendChild(script);
  });
  return webPlaybackSdkPromise;
}

async function requestPremiumToken() {
  const response = await fetch("/api/spotify/session", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = (await response.json()) as {
    accessToken?: string | null;
    premium?: boolean | null;
  };
  if (!response.ok || payload.premium === false || !payload.accessToken)
    throw new Error("SPOTIFY_PREMIUM_REQUIRED");
  return payload.accessToken;
}

export const SpotifyWebPlayer = forwardRef<
  SpotifyEmbedHandle,
  SpotifyWebPlayerProps
>(function SpotifyWebPlayer(
  {
    trackId,
    durationMs = 0,
    className = "",
    onPlaybackUpdate,
    onPlaybackStarted,
    onReady,
    onControllerStatus,
  },
  ref,
) {
  const playerRef = useRef<WebPlaybackPlayer | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const currentTrackRef = useRef<string | null>(null);
  const sampleRef = useRef<(SpotifyPlaybackState & { receivedAt: number }) | null>(
    null,
  );
  const updateRef = useRef(onPlaybackUpdate);
  const startedRef = useRef(onPlaybackStarted);
  const readyRef = useRef(onReady);
  const statusRef = useRef(onControllerStatus);
  const [attempt, setAttempt] = useState(0);
  const [label, setLabel] = useState("Preparando Spotify Premium…");

  updateRef.current = onPlaybackUpdate;
  startedRef.current = onPlaybackStarted;
  readyRef.current = onReady;
  statusRef.current = onControllerStatus;

  const startTrack = useCallback(
    async (positionMs = 0) => {
      const deviceId = deviceIdRef.current;
      if (!deviceId) throw new Error("SPOTIFY_DEVICE_NOT_READY");
      const token = await requestPremiumToken();
      const response = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            uris: [`spotify:track:${trackId}`],
            position_ms: Math.max(0, Math.round(positionMs)),
          }),
        },
      );
      if (!response.ok) throw new Error(`SPOTIFY_PLAY_${response.status}`);
    },
    [trackId],
  );

  useImperativeHandle(
    ref,
    () => ({
      activate() {
        const player = playerRef.current;
        if (!player) return;
        void player
          .activateElement()
          .then(() => startTrack(0))
          .catch(() => {
            setLabel("Spotify no pudo iniciar la reproducción.");
            statusRef.current?.("unavailable");
          });
      },
      command(command: SpotifyEmbedCommand) {
        const player = playerRef.current;
        if (!player) return;
        if (command === "pause") void player.pause();
        else if (command === "restart") void startTrack(0);
        else if (currentTrackRef.current === trackId) void player.resume();
        else void startTrack(0);
      },
      retry() {
        playerRef.current?.disconnect();
        playerRef.current = null;
        deviceIdRef.current = null;
        setLabel("Preparando Spotify Premium…");
        statusRef.current?.("loading");
        setAttempt((value) => value + 1);
      },
      seek(seconds: number) {
        void playerRef.current?.seek(Math.max(0, Math.round(seconds * 1000)));
      },
    }),
    [startTrack, trackId],
  );

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    statusRef.current?.("loading");
    setLabel("Preparando Spotify Premium…");
    sampleRef.current = null;

    const fail = (message: string, premiumRequired = false) => {
      if (cancelled) return;
      setLabel(message);
      statusRef.current?.(premiumRequired ? "premium-required" : "unavailable");
    };

    void loadWebPlaybackSdk()
      .then((sdk) => {
        if (cancelled) return;
        const player = new sdk.Player({
          name: "TypeTheLyrics Mobile",
          volume: 0.8,
          getOAuthToken(callback) {
            void requestPremiumToken().then(callback).catch(() => {
              fail("Conectá una cuenta Spotify Premium.", true);
            });
          },
        });
        playerRef.current = player;
        player.addListener("ready", ((payload: { device_id: string }) => {
          if (cancelled) return;
          deviceIdRef.current = payload.device_id;
          setLabel("Spotify Premium listo");
          statusRef.current?.("ready");
          readyRef.current?.();
        }) as (payload: never) => void);
        player.addListener("not_ready", (() =>
          fail("Spotify perdió la conexión.")) as (payload: never) => void);
        player.addListener("initialization_error", (() =>
          fail("Este navegador no admite el reproductor Premium.")) as (payload: never) => void);
        player.addListener("authentication_error", (() =>
          fail("Volvé a conectar Spotify para renovar los permisos.", true)) as (payload: never) => void);
        player.addListener("account_error", (() =>
          fail("Spotify Premium es obligatorio en móviles.", true)) as (payload: never) => void);
        player.addListener("playback_error", (() =>
          fail("Spotify no pudo reproducir esta canción.")) as (payload: never) => void);
        player.addListener("autoplay_failed", (() => {
          if (!cancelled) setLabel("Tocá Activar Spotify para habilitar el audio.");
        }) as (payload: never) => void);
        player.addListener("player_state_changed", ((state: WebPlaybackState | null) => {
          if (!state || cancelled) return;
          const receivedAt = performance.now();
          const wasPaused = sampleRef.current?.isPaused ?? true;
          currentTrackRef.current = state.track_window.current_track.id;
          const mapped: SpotifyPlaybackState & { receivedAt: number } = {
            position: state.position,
            duration: state.duration || durationMs,
            isPaused: state.paused,
            isBuffering: Boolean(state.loading),
            playingURI: state.track_window.current_track.uri,
            receivedAt,
          };
          sampleRef.current = mapped;
          updateRef.current?.(mapped);
          if (wasPaused && !state.paused) startedRef.current?.();
        }) as (payload: never) => void);
        return player.connect();
      })
      .then((connected) => {
        if (!cancelled && connected === false)
          fail("Spotify no pudo conectar el reproductor Premium.");
      })
      .catch((error) => {
        fail(
          String(error).includes("PREMIUM_REQUIRED")
            ? "Conectá una cuenta Spotify Premium."
            : "No se pudo iniciar Spotify Premium.",
          String(error).includes("PREMIUM_REQUIRED"),
        );
      });

    timer = window.setInterval(() => {
      const sample = sampleRef.current;
      if (!sample) return;
      const elapsed = sample.isPaused || sample.isBuffering
        ? 0
        : performance.now() - sample.receivedAt;
      updateRef.current?.({
        ...sample,
        position: Math.min(
          sample.duration || Number.MAX_SAFE_INTEGER,
          sample.position + Math.max(0, elapsed),
        ),
      });
    }, 100);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
      playerRef.current?.disconnect();
      playerRef.current = null;
      deviceIdRef.current = null;
    };
  }, [attempt, durationMs, trackId]);

  return (
    <div
      className={`flex min-h-20 items-center gap-3 rounded-xl border border-emerald-400/20 bg-[#121914] px-4 py-3 ${className}`}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-400 text-black">
        <Music2 size={22} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-wider text-emerald-300">
          Spotify Premium · móvil
        </p>
        <p className="truncate text-sm text-zinc-300">{label}</p>
      </div>
    </div>
  );
});
