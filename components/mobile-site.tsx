"use client";

import { useEffect, useState } from "react";
import { isMobileSiteLocation } from "@/lib/mobile-site";

function detectMobileSite() {
  if (typeof window === "undefined") return false;
  return isMobileSiteLocation(
    window.location.hostname,
    window.location.search,
    window.innerWidth,
  );
}

export function useMobileSite() {
  const [mobileSite, setMobileSite] = useState(detectMobileSite);

  useEffect(() => {
    const update = () => {
      const detected = detectMobileSite();
      setMobileSite(detected);
      document.documentElement.dataset.mobileSite = detected ? "true" : "false";
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return mobileSite;
}
