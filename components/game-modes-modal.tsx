"use client";

import { ShieldCheck, Timer, X, Zap } from "lucide-react";
import { GAME_MODE_DETAILS, GameMode } from "@/lib/game";

const ICONS = {
  relaxed: ShieldCheck,
  rhythm: Timer,
  expert: Zap,
} as const;

export function GameModesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto bg-black/85 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto my-8 w-full max-w-4xl rounded-3xl border border-white/10 bg-[#11121a] p-6 text-white shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.25em] text-violet-300">
              Cómo jugar
            </p>
            <h2 className="mt-2 text-3xl font-black">Modos de juego</h2>
            <p className="mt-2 text-zinc-400">
              Elige el desafío que mejor se adapte a tu ritmo.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar guía de modos"
            className="rounded-xl bg-white/5 p-2 text-zinc-400 hover:text-white"
          >
            <X />
          </button>
        </div>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {(Object.keys(GAME_MODE_DETAILS) as GameMode[]).map((mode) => {
            const detail = GAME_MODE_DETAILS[mode];
            const Icon = ICONS[mode];
            return (
              <article
                key={mode}
                className={`rounded-2xl border p-5 ${mode === "expert" ? "border-amber-400/20 bg-amber-400/[.06]" : "border-white/10 bg-white/[.04]"}`}
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/15 text-violet-300">
                    <Icon size={20} />
                  </span>
                  <div>
                    <h3 className="font-black">{detail.name}</h3>
                    <p className="text-sm text-zinc-400">
                      {detail.description}
                    </p>
                  </div>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-zinc-300">
                  {detail.rules.map((rule) => (
                    <li key={rule} className="flex gap-2">
                      <span className="text-cyan-300">•</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
