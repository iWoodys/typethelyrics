"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { isLikelySpotifyPreview } from "@/lib/spotify-playback";

export type SpotifyPlaybackState = {
  position: number;
  duration: number;
  isPaused: boolean;
  isBuffering: boolean;
  playingURI?: string;
};

type SpotifyPlaybackEvent = { data: SpotifyPlaybackState };
type SpotifyReadyEvent = { data?: { playingURI?: string } };

type SpotifyEmbedController = {
  addListener: (
    event: "ready" | "playback_started" | "playback_update",
    listener: (event: SpotifyPlaybackEvent | SpotifyReadyEvent) => void,
  ) => void;
  destroy: () => void;
  pause: () => void;
  play: () => void;
  restart: () => void;
  resume: () => void;
  seek: (seconds: number) => void;
};

type SpotifyIframeApi = {
  createController: (
    element: HTMLElement,
    options: {
      uri: string;
      width: number | string;
      height: number;
    },
    callback: (controller: SpotifyEmbedController) => void,
  ) => void;
};

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIframeApi) => void;
    __typeTheLyricsSpotifyApi?: SpotifyIframeApi;
  }
}

export type SpotifyEmbedCommand = "pause" | "play" | "restart" | "resume";
export type SpotifyControllerStatus =
  | "loading"
  | "ready"
  | "preview"
  | "premium-required"
  | "fallback"
  | "unavailable";

export type SpotifyEmbedHandle = {
  activate: () => void;
  command: (command: SpotifyEmbedCommand) => void;
  retry: () => void;
  seek: (seconds: number) => void;
};

type SpotifyEmbedProps = {
  trackId: string;
  durationMs?: number;
  height?: number;
  className?: string;
  onPlaybackUpdate?: (state: SpotifyPlaybackState) => void;
  onPlaybackStarted?: () => void;
  onReady?: () => void;
  onControllerStatus?: (status: SpotifyControllerStatus) => void;
};

let iframeApiPromise: Promise<SpotifyIframeApi> | null = null;
const SPOTIFY_ORIGIN = "https://open.spotify.com";

function loadIframeApi() {
  if (typeof window === "undefined")
    return Promise.reject(new Error("Spotify sólo está disponible en el navegador."));
  if (window.__typeTheLyricsSpotifyApi)
    return Promise.resolve(window.__typeTheLyricsSpotifyApi);
  if (iframeApiPromise) return iframeApiPromise;

  iframeApiPromise = new Promise<SpotifyIframeApi>((resolve, reject) => {
    const previousReady = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = (api) => {
      window.__typeTheLyricsSpotifyApi = api;
      resolve(api);
      previousReady?.(api);
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://open.spotify.com/embed/iframe-api/v1"]',
    );
    if (existing) return;

    const script = document.createElement("script");
    script.src = "https://open.spotify.com/embed/iframe-api/v1";
    script.async = true;
    script.dataset.typethelyricsSpotify = "true";
    script.addEventListener("error", () => {
      iframeApiPromise = null;
      reject(new Error("No se pudo iniciar el reproductor de Spotify."));
    });
    document.body.appendChild(script);
  });

  return iframeApiPromise;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export const SpotifyEmbed = forwardRef<SpotifyEmbedHandle, SpotifyEmbedProps>(
  function SpotifyEmbed(
    {
      trackId,
      durationMs = 0,
      height = 152,
      className = "",
      onPlaybackUpdate,
      onPlaybackStarted,
      onReady,
      onControllerStatus,
    },
    ref,
  ) {
    const mountRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const controllerRef = useRef<SpotifyEmbedController | null>(null);
    const controllerReadyRef = useRef(false);
    const fallbackActiveRef = useRef(false);
    const previewDetectedRef = useRef(false);
    const [useNativeFallback, setUseNativeFallback] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const updateRef = useRef(onPlaybackUpdate);
    const startedRef = useRef(onPlaybackStarted);
    const readyRef = useRef(onReady);
    const statusRef = useRef(onControllerStatus);
    const sampleRef = useRef<(SpotifyPlaybackState & { receivedAt: number }) | null>(
      null,
    );
    const displayedRef = useRef(0);
    const lastTickRef = useRef(0);
    const lastPauseCommandAtRef = useRef(0);

    updateRef.current = onPlaybackUpdate;
    startedRef.current = onPlaybackStarted;
    readyRef.current = onReady;
    statusRef.current = onControllerStatus;

    const updateFallbackClock = useCallback(
      (action: SpotifyEmbedCommand | "seek", seekSeconds = 0) => {
        const now = performance.now();
        const previous = sampleRef.current;
        const elapsed = previous && !previous.isPaused
          ? Math.max(0, now - previous.receivedAt)
          : 0;
        let nextPosition = Math.max(
          0,
          (previous?.position || displayedRef.current || 0) + elapsed,
        );
        let isPaused = previous?.isPaused ?? true;

        if (action === "restart") {
          nextPosition = 0;
          isPaused = true;
        } else if (action === "pause") {
          isPaused = true;
        } else if (action === "play" || action === "resume") {
          isPaused = false;
        } else {
          nextPosition = Math.max(0, seekSeconds * 1000);
        }

        const duration = durationMs || previous?.duration || 0;
        if (duration) nextPosition = Math.min(duration, nextPosition);
        const nextState: SpotifyPlaybackState & { receivedAt: number } = {
          position: nextPosition,
          duration,
          isPaused,
          isBuffering: false,
          playingURI: `spotify:track:${trackId}`,
          receivedAt: now,
        };
        sampleRef.current = nextState;
        displayedRef.current = nextPosition;
        lastTickRef.current = now;
        updateRef.current?.(nextState);
      },
      [durationMs, trackId],
    );

    useImperativeHandle(
      ref,
      () => ({
        activate() {
          const controller = controllerRef.current;
          if (controller) {
            controller.play();
            return;
          }
          if (fallbackActiveRef.current) updateFallbackClock("play");
          iframeRef.current?.contentWindow?.postMessage(
            { command: "play" },
            SPOTIFY_ORIGIN,
          );
        },
        command(command) {
          if (command === "pause")
            lastPauseCommandAtRef.current = performance.now();
          const controller = controllerRef.current;
          if (controller) {
            if (command === "play") controller.play();
            else if (command === "resume") controller.resume();
            else if (command === "pause") controller.pause();
            else controller.restart();
            return;
          }
          if (fallbackActiveRef.current) updateFallbackClock(command);
          iframeRef.current?.contentWindow?.postMessage(
            { command },
            SPOTIFY_ORIGIN,
          );
        },
        retry() {
          controllerRef.current?.destroy();
          controllerRef.current = null;
          fallbackActiveRef.current = false;
          previewDetectedRef.current = false;
          statusRef.current?.("loading");
          if (!window.__typeTheLyricsSpotifyApi) {
            document
              .querySelector<HTMLScriptElement>(
                'script[src="https://open.spotify.com/embed/iframe-api/v1"]',
              )
              ?.remove();
            iframeApiPromise = null;
          }
          setUseNativeFallback(false);
          setAttempt((value) => value + 1);
        },
        seek(seconds) {
          const safeSeconds = Math.max(0, Math.round(seconds));
          if (controllerRef.current) controllerRef.current.seek(safeSeconds);
          else if (fallbackActiveRef.current)
            updateFallbackClock("seek", safeSeconds);
        },
      }),
      [updateFallbackClock],
    );

    useEffect(() => {
      let cancelled = false;
      let timer: number | null = null;
      let fallbackTimer: number | null = null;
      const mount = mountRef.current;

      fallbackActiveRef.current = useNativeFallback;
      controllerReadyRef.current = false;
      previewDetectedRef.current = false;
      sampleRef.current = null;
      displayedRef.current = 0;
      lastTickRef.current = performance.now();
      statusRef.current?.("loading");

      const acceptPlaybackUpdate = (state: SpotifyPlaybackState) => {
        if (!Number.isFinite(state.position)) return;
        const receivedAt = performance.now();
        const reportedDuration = Number(state.duration) || 0;
        const previous = sampleRef.current;
        const isPreview = isLikelySpotifyPreview({
          expectedDurationMs: durationMs,
          reportedDurationMs: reportedDuration,
          positionMs: state.position,
          isPaused: state.isPaused,
          isBuffering: state.isBuffering,
          wasPlaying: Boolean(previous && !previous.isPaused),
          nowMs: receivedAt,
          lastPauseCommandAtMs: lastPauseCommandAtRef.current,
        });
        if (isPreview && !previewDetectedRef.current) {
          previewDetectedRef.current = true;
          statusRef.current?.("preview");
        }
        sampleRef.current = {
          ...state,
          isPaused: Boolean(state.isPaused),
          isBuffering: Boolean(state.isBuffering),
          receivedAt,
        };
        if (
          !previous ||
          Math.abs(state.position - displayedRef.current) > 1_200 ||
          state.position + 500 < previous.position
        ) {
          displayedRef.current = state.position;
        }
        updateRef.current?.({ ...state, position: displayedRef.current });
      };

      const activateFallback = () => {
        if (cancelled || controllerReadyRef.current || fallbackActiveRef.current)
          return;
        controllerRef.current?.destroy();
        controllerRef.current = null;
        fallbackActiveRef.current = true;
        setUseNativeFallback(true);
      };

      const onMessage = (event: MessageEvent) => {
        if (
          event.origin !== SPOTIFY_ORIGIN ||
          event.source !== iframeRef.current?.contentWindow
        )
          return;
        if (event.data?.type === "playback_started") {
          startedRef.current?.();
          return;
        }
        if (event.data?.type !== "playback_update") return;
        const payload = event.data?.payload as SpotifyPlaybackState | undefined;
        if (!payload || !Number.isFinite(payload.position)) return;
        acceptPlaybackUpdate(payload);
      };
      window.addEventListener("message", onMessage);

      timer = window.setInterval(() => {
        const sample = sampleRef.current;
        if (!sample) return;
        const now = performance.now();
        const elapsed = Math.max(0, now - lastTickRef.current);
        lastTickRef.current = now;

        if (sample.isPaused || sample.isBuffering) {
          displayedRef.current = sample.position;
        } else {
          const target = Math.min(
            sample.duration || Number.MAX_SAFE_INTEGER,
            sample.position + Math.max(0, now - sample.receivedAt),
          );
          const natural = displayedRef.current + elapsed;
          const correction = target - natural;
          displayedRef.current =
            Math.abs(correction) > 1_200
              ? target
              : natural + clamp(correction * 0.12, -18, 18);
        }

        updateRef.current?.({
          ...sample,
          position: Math.max(0, displayedRef.current),
        });
      }, 100);

      // Una conexión lenta no debe mandar al jugador a un iframe sin reloj.
      // Esperamos al controlador; el iframe clásico queda sólo como respaldo
      // para escuchar, pero el juego sabrá que no puede sincronizarse con él.
      if (!useNativeFallback && mount) {
        fallbackTimer = window.setTimeout(activateFallback, 15_000);

        void loadIframeApi()
          .then((api) => {
            if (cancelled || !mountRef.current) return;
            api.createController(
              mountRef.current,
              {
                uri: `spotify:track:${trackId}`,
                width: "100%",
                height,
              },
              (controller) => {
                if (cancelled) {
                  controller.destroy();
                  return;
                }
                if (fallbackActiveRef.current) {
                  controller.destroy();
                  return;
                }
                controllerRef.current = controller;
                // createController ya entrega un controlador utilizable. En
                // algunos navegadores el evento `ready` ocurre antes de que
                // podamos suscribirnos, por lo que no debemos esperar por él.
                controllerReadyRef.current = true;
                if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
                if (!previewDetectedRef.current) statusRef.current?.("ready");
                readyRef.current?.();
                controller.addListener("ready", () => {
                  controllerReadyRef.current = true;
                  if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
                  if (!previewDetectedRef.current) statusRef.current?.("ready");
                });
                controller.addListener("playback_started", () =>
                  startedRef.current?.(),
                );
                controller.addListener("playback_update", (event) => {
                  if (!("data" in event)) return;
                  acceptPlaybackUpdate(event.data as SpotifyPlaybackState);
                });
              },
            );
          })
          .catch(activateFallback);
      }

      return () => {
        cancelled = true;
        if (timer !== null) window.clearInterval(timer);
        if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
        window.removeEventListener("message", onMessage);
        controllerRef.current?.destroy();
        controllerRef.current = null;
        if (mount?.isConnected) mount.replaceChildren();
      };
    }, [attempt, durationMs, height, trackId, updateFallbackClock, useNativeFallback]);

    return (
      <div
        className={`overflow-hidden rounded-xl ${className}`}
        style={{ minHeight: height }}
      >
        {useNativeFallback ? (
          <iframe
            ref={iframeRef}
            title="Spotify"
            src={`https://open.spotify.com/embed/track/${trackId}?theme=0`}
            width="100%"
            height={height}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="eager"
            onLoad={() => {
              statusRef.current?.("fallback");
              readyRef.current?.();
            }}
            onError={() => statusRef.current?.("unavailable")}
            className="block border-0"
          />
        ) : (
          <div ref={mountRef} />
        )}
      </div>
    );
  },
);
