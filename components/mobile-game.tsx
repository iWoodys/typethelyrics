"use client";

import { useCallback, useEffect, useState } from "react";

type WakeLockHandle = {
  release: () => Promise<void>;
  released?: boolean;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockHandle>;
  };
};

export function useMobileKeyboard(active: boolean) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (!active) {
      setKeyboardOpen(false);
      document.documentElement.dataset.mobileKeyboard = "false";
      document.documentElement.style.removeProperty("--mobile-viewport-height");
      document.documentElement.style.removeProperty("--mobile-keyboard-height");
      return;
    }

    const viewport = window.visualViewport;
    const update = () => {
      const viewportHeight = viewport?.height || window.innerHeight;
      const obscuredHeight = Math.max(
        0,
        window.innerHeight - viewportHeight - (viewport?.offsetTop || 0),
      );
      const open = obscuredHeight > 120;
      setKeyboardOpen(open);
      document.documentElement.dataset.mobileKeyboard = open ? "true" : "false";
      document.documentElement.style.setProperty(
        "--mobile-viewport-height",
        `${Math.round(viewportHeight)}px`,
      );
      document.documentElement.style.setProperty(
        "--mobile-keyboard-height",
        `${Math.round(obscuredHeight)}px`,
      );
    };

    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.documentElement.dataset.mobileKeyboard = "false";
      document.documentElement.style.removeProperty("--mobile-viewport-height");
      document.documentElement.style.removeProperty("--mobile-keyboard-height");
    };
  }, [active]);

  return keyboardOpen;
}

export function useScreenWakeLock(active: boolean) {
  const [wakeLockActive, setWakeLockActive] = useState(false);

  useEffect(() => {
    if (!active) {
      setWakeLockActive(false);
      return;
    }

    let cancelled = false;
    let handle: WakeLockHandle | null = null;
    const request = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const wakeLock = (navigator as WakeLockNavigator).wakeLock;
        if (!wakeLock) return;
        handle = await wakeLock.request("screen");
        if (cancelled) {
          await handle.release();
          return;
        }
        setWakeLockActive(true);
      } catch {
        setWakeLockActive(false);
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void request();
      else setWakeLockActive(false);
    };

    void request();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (handle && !handle.released) void handle.release();
      setWakeLockActive(false);
    };
  }, [active]);

  return wakeLockActive;
}

export function useFullscreenMode() {
  const [fullscreen, setFullscreen] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(typeof document.documentElement.requestFullscreen === "function");
    const update = () => setFullscreen(!!document.fullscreenElement);
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Safari iOS y navegadores integrados pueden rechazar el modo pantalla completa.
    }
  }, []);

  return { fullscreen, supported, toggleFullscreen };
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
