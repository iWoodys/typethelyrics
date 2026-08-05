"use client";

import { Crown, RotateCcw } from "lucide-react";
import type { SpotifyPremiumSessionStatus } from "@/components/spotify-premium-session";

type SpotifyPremiumGateProps = {
  status: SpotifyPremiumSessionStatus;
  onRefresh: () => void;
  returnTo?: string;
};

export function SpotifyPremiumGate({
  status,
  onRefresh,
  returnTo = "/",
}: SpotifyPremiumGateProps) {
  const loading = status === "loading";
  const free = status === "free";
  const title = loading
    ? "Validando Spotify Premium…"
    : free
      ? "Esta cuenta no tiene Spotify Premium"
      : "Conectá Spotify Premium para jugar en móvil";
  const detail = loading
    ? "Estamos comprobando tu suscripción y los permisos de reproducción."
    : free
      ? "La versión móvil necesita reproducción bajo demanda y un reloj preciso. Podés seguir jugando gratis desde una computadora."
      : "En computadoras Spotify sigue funcionando como antes. Este requisito se aplica únicamente a teléfonos y tablets.";
  const connectHref = `/api/spotify/login?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[.07] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-300 text-amber-950">
          <Crown size={22} />
        </span>
        <div>
          <p className="font-black text-amber-100">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-amber-100/70">
            {detail}
          </p>
        </div>
      </div>
      {!loading && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a
            href={connectHref}
            className="rounded-xl bg-emerald-400 px-3 py-3 text-center text-sm font-black text-emerald-950"
          >
            {free ? "Conectar otra cuenta" : "Conectar Spotify"}
          </a>
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold"
          >
            <RotateCcw size={16} /> Comprobar
          </button>
        </div>
      )}
    </div>
  );
}
