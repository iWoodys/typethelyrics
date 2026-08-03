"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

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

export type SpotifyEmbedHandle = {
  command: (command: SpotifyEmbedCommand) => void;
  seek: (seconds: number) => void;
};

type SpotifyEmbedProps = {
  trackId: string;
  height?: number;
  className?: string;
  onPlaybackUpdate?: (state: SpotifyPlaybackState) => void;
  onPlaybackStarted?: () => void;
  onReady?: () => void;
};

let iframeApiPromise: Promise<SpotifyIframeApi> | null = null;

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
      height = 152,
      className = "",
      onPlaybackUpdate,
      onPlaybackStarted,
      onReady,
    },
    ref,
  ) {
    const mountRef = useRef<HTMLDivElement>(null);
    const controllerRef = useRef<SpotifyEmbedController | null>(null);
    const updateRef = useRef(onPlaybackUpdate);
    const startedRef = useRef(onPlaybackStarted);
    const readyRef = useRef(onReady);
    const sampleRef = useRef<(SpotifyPlaybackState & { receivedAt: number }) | null>(
      null,
    );
    const displayedRef = useRef(0);
    const lastTickRef = useRef(0);

    updateRef.current = onPlaybackUpdate;
    startedRef.current = onPlaybackStarted;
    readyRef.current = onReady;

    useImperativeHandle(
      ref,
      () => ({
        command(command) {
          const controller = controllerRef.current;
          if (!controller) return;
          if (command === "play") controller.play();
          else if (command === "resume") controller.resume();
          else if (command === "pause") controller.pause();
          else controller.restart();
        },
        seek(seconds) {
          controllerRef.current?.seek(Math.max(0, Math.round(seconds)));
        },
      }),
      [],
    );

    useEffect(() => {
      let cancelled = false;
      let timer: number | null = null;
      const mount = mountRef.current;
      if (!mount) return;

      sampleRef.current = null;
      displayedRef.current = 0;
      lastTickRef.current = performance.now();

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
              controllerRef.current = controller;
              controller.addListener("ready", () => readyRef.current?.());
              controller.addListener("playback_started", () =>
                startedRef.current?.(),
              );
              controller.addListener("playback_update", (event) => {
                if (!("data" in event)) return;
                const state = event.data as SpotifyPlaybackState;
                if (!Number.isFinite(state.position)) return;
                const receivedAt = performance.now();
                const previous = sampleRef.current;
                sampleRef.current = { ...state, receivedAt };
                if (
                  !previous ||
                  Math.abs(state.position - displayedRef.current) > 1_200 ||
                  state.position + 500 < previous.position
                ) {
                  displayedRef.current = state.position;
                }
                updateRef.current?.({ ...state, position: displayedRef.current });
              });

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
            },
          );
        })
        .catch(() => {
          // El iframe queda vacío y la interfaz principal muestra el estado pausado.
        });

      return () => {
        cancelled = true;
        if (timer !== null) window.clearInterval(timer);
        controllerRef.current?.destroy();
        controllerRef.current = null;
        mount.replaceChildren();
      };
    }, [height, trackId]);

    return (
      <div
        className={`overflow-hidden rounded-xl ${className}`}
        style={{ minHeight: height }}
      >
        <div ref={mountRef} />
      </div>
    );
  },
);
