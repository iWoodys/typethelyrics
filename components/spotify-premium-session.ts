"use client";

import { useCallback, useEffect, useState } from "react";
import {
  classifySpotifyPremiumSession,
  type SpotifySessionPayload,
} from "@/lib/spotify-premium";

export type SpotifyPremiumSessionStatus =
  | "idle"
  | "loading"
  | "disconnected"
  | "free"
  | "premium"
  | "not_allowed"
  | "error";

export function useSpotifyPremiumSession(enabled: boolean) {
  const [status, setStatus] = useState<SpotifyPremiumSessionStatus>(
    enabled ? "loading" : "idle",
  );
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => {
    setStatus("loading");
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    void fetch("/api/spotify/session", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const payload = (await response.json()) as SpotifySessionPayload & {
          code?: string;
        };
        if (response.status === 403 && payload.code === "spotify_user_not_allowed")
          return "not_allowed" as const;
        if (!response.ok) throw new Error("SPOTIFY_SESSION");
        return classifySpotifyPremiumSession(payload);
      })
      .then((nextStatus) => {
        if (!cancelled) setStatus(nextStatus);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, revision]);

  return { status, refresh };
}
