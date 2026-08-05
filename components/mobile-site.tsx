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
  // La primera renderización debe coincidir con el servidor. El script de layout
  // aplica el CSS móvil antes de pintar y este efecto habilita el JSX móvil luego.
  const [mobileSite, setMobileSite] = useState(false);

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
