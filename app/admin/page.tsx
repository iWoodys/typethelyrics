"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Crown, Megaphone, Send, Shield, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Edit = { id: string; user_id: string; spotify_track_id: string; lyrics: unknown[]; users: { username: string } | null };
type Report = { id: string; spotify_track_id: string; observed_offset_ms: number; status: string };
type Announcement = { id: string; title: string; body: string; created_at: string };
type PremiumAudit = { id: string; target_email: string; new_premium: boolean; new_until: string | null; reason: string; created_at: string };

const announcementError = (message: string) =>
  message.includes("publish_announcement") || message.includes("schema cache")
    ? "Falta instalar el sistema de anuncios en Supabase. Ejecuta migrations/008_admin_announcements.sql en el SQL Editor."
    : message;

export default function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [edits, setEdits] = useState<Edit[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");
  const [premiumEmail, setPremiumEmail] = useState("");
  const [premiumDays, setPremiumDays] = useState("");
  const [premiumReason, setPremiumReason] = useState("");
  const [premiumAudit, setPremiumAudit] = useState<PremiumAudit[]>([]);
  const [savingPremium, setSavingPremium] = useState(false);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setAllowed(false); return; }
    const { data: admin, error: adminError } = await supabase.rpc("is_admin");
    if (adminError || admin !== true) {
      setAllowed(false); setEdits([]); setReports([]); return;
    }
    setAllowed(true);
    const [a, b, c, d] = await Promise.all([
      supabase.from("lyric_edits").select("id,user_id,spotify_track_id,lyrics").eq("moderation_status", "pending").order("updated_at"),
      supabase.from("lyric_reports").select("id,spotify_track_id,observed_offset_ms,status").neq("status", "resolved").order("updated_at"),
      supabase.from("announcements").select("id,title,body,created_at").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("premium_audit_log").select("id,target_email,new_premium,new_until,reason,created_at").order("created_at", { ascending: false }).limit(20),
    ]);
    if (a.error || b.error || c.error) setMessage(a.error?.message || b.error?.message || c.error?.message || "No se pudo cargar el panel.");
    const editRows = (a.data || []) as Omit<Edit, "users">[];
    const userIds = [...new Set(editRows.map((row) => row.user_id))];
    const { data: authors } = userIds.length
      ? await supabase.from("users").select("id,username").in("id", userIds)
      : { data: [] as { id: string; username: string }[] };
    const names = new Map((authors || []).map((row) => [row.id, row.username]));
    setEdits(editRows.map((row) => ({ ...row, users: { username: names.get(row.user_id) || "Jugador" } })));
    setReports((b.data || []) as Report[]);
    setAnnouncement((c.data as Announcement | null) || null);
    if (!d.error) setPremiumAudit((d.data || []) as PremiumAudit[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const publish = async (event: FormEvent) => {
    event.preventDefault();
    setPublishing(true); setMessage("");
    const { error } = await supabase.rpc("publish_announcement", { announcement_title: title, announcement_body: body });
    setPublishing(false);
    if (error) { setMessage(announcementError(error.message)); return; }
    setTitle(""); setBody(""); setMessage("Anuncio publicado. Aparecerá una vez en el inicio de cada jugador.");
    await load();
  };
  const disableAnnouncement = async () => {
    const { error } = await supabase.rpc("disable_active_announcement");
    setMessage(error?.message || "Anuncio desactivado.");
    await load();
  };
  const moderate = async (id: string, decision: "approved" | "rejected") => {
    const { error } = await supabase.rpc("moderate_lyric_edit", { target_edit: id, decision });
    setMessage(error?.message || `Corrección ${decision === "approved" ? "aprobada" : "rechazada"}.`);
    await load();
  };
  const resolve = async (id: string) => {
    const { error } = await supabase.rpc("resolve_lyric_report", { target_report: id, decision: "resolved" });
    setMessage(error?.message || "Reporte resuelto.");
    await load();
  };
  const changePremium = async (event: FormEvent) => {
    event.preventDefault();
    setSavingPremium(true); setMessage("");
    const parsedDays = premiumDays.trim() === "" ? null : Number(premiumDays);
    const { error } = await supabase.rpc("set_user_premium", {
      target_email: premiumEmail.trim(), premium_days: parsedDays, change_reason: premiumReason.trim(),
    });
    setSavingPremium(false);
    if (error) { setMessage(error.message.includes("set_user_premium") ? "Ejecuta migrations/010_lobby_reliability.sql en Supabase." : error.message); return; }
    setMessage(parsedDays === 0 ? "Premium retirado correctamente." : "Premium actualizado correctamente.");
    setPremiumEmail(""); setPremiumDays(""); setPremiumReason("");
    await load();
  };

  if (allowed === null) return <main className="grid min-h-screen place-items-center bg-[#07080d] text-zinc-400">Comprobando permisos…</main>;
  if (!allowed) return <main className="grid min-h-screen place-items-center bg-[#07080d] text-white"><div className="text-center"><Shield className="mx-auto mb-4 text-red-300"/><h1 className="text-2xl font-black">Acceso restringido</h1><Link href="/" className="mt-5 inline-block text-violet-300">Volver al juego</Link></div></main>;

  return <main className="min-h-screen bg-[#07080d] p-6 text-white"><div className="mx-auto max-w-5xl">
    <Link href="/" className="text-violet-300">← Volver</Link>
    <h1 className="mt-5 text-3xl font-black">Panel de administración</h1>
    {message && <p role="status" className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">{message}</p>}

    <section className="mt-8 rounded-3xl border border-violet-400/20 bg-violet-400/[.07] p-6">
      <h2 className="flex items-center gap-2 text-xl font-bold"><Megaphone className="text-violet-300"/> Anuncio de novedades</h2>
      <p className="mt-2 text-sm text-zinc-400">Cada anuncio aparece una sola vez por navegador. Al publicar uno nuevo, reemplazará al anuncio activo.</p>
      {announcement && <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/[.07] p-4"><span className="text-xs font-bold uppercase tracking-wider text-emerald-300">Publicado actualmente</span><h3 className="mt-2 text-lg font-black">{announcement.title}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{announcement.body}</p><button onClick={disableAnnouncement} className="mt-4 rounded-xl border border-red-400/20 px-4 py-2 text-sm text-red-300">Desactivar</button></div>}
      <form onSubmit={publish} className="mt-5 space-y-3">
        <label className="block text-sm text-zinc-300">Título<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required placeholder="Mejoras" className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 outline-none focus:border-violet-400"/></label>
        <label className="block text-sm text-zinc-300">Mensaje<textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required rows={6} placeholder={"¡Tenemos novedades!\n\n• Mejoramos la sincronización.\n• Agregamos nuevos modos de juego."} className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/25 p-4 outline-none focus:border-violet-400"/><span className="mt-1 block text-right text-xs text-zinc-500">{body.length}/2000</span></label>
        <button disabled={publishing} className="flex items-center gap-2 rounded-xl bg-violet-500 px-5 py-3 font-bold disabled:opacity-50"><Send size={17}/>{publishing ? "Publicando…" : "Publicar anuncio"}</button>
      </form>
    </section>

    <section className="mt-8 rounded-3xl border border-amber-300/20 bg-amber-300/[.06] p-6">
      <h2 className="flex items-center gap-2 text-xl font-bold"><Crown className="text-amber-300"/> Administrar Premium</h2>
      <p className="mt-2 text-sm text-zinc-400">Deja los días vacíos para Premium permanente, usa 31 para un mes o 0 para retirarlo. Cada cambio queda auditado.</p>
      <form onSubmit={changePremium} className="mt-5 grid gap-3 md:grid-cols-2">
        <label className="text-sm text-zinc-300">Correo del jugador<input type="email" required value={premiumEmail} onChange={(event) => setPremiumEmail(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4"/></label>
        <label className="text-sm text-zinc-300">Días<input type="number" min="0" max="3650" value={premiumDays} onChange={(event) => setPremiumDays(event.target.value)} placeholder="Vacío = permanente" className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4"/></label>
        <label className="text-sm text-zinc-300 md:col-span-2">Motivo<input value={premiumReason} maxLength={300} onChange={(event) => setPremiumReason(event.target.value)} placeholder="Compra, premio, prueba…" className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4"/></label>
        <button disabled={savingPremium} className="flex w-fit items-center gap-2 rounded-xl bg-amber-300 px-5 py-3 font-bold text-black disabled:opacity-50"><Crown size={17}/>{savingPremium ? "Guardando…" : "Aplicar cambio"}</button>
      </form>
      {premiumAudit.length > 0 && <div className="mt-6 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-zinc-500"><tr><th className="py-2">Cuenta</th><th>Estado</th><th>Motivo</th><th>Fecha</th></tr></thead><tbody>{premiumAudit.map((entry) => <tr key={entry.id} className="border-t border-white/5"><td className="py-3 pr-4">{entry.target_email}</td><td className="pr-4">{entry.new_premium ? (entry.new_until ? `Hasta ${new Date(entry.new_until).toLocaleDateString("es-ES")}` : "Permanente") : "Retirado"}</td><td className="pr-4 text-zinc-400">{entry.reason || "Sin motivo"}</td><td className="text-zinc-500">{new Date(entry.created_at).toLocaleString("es-ES")}</td></tr>)}</tbody></table></div>}
    </section>

    <h2 className="mt-8 text-xl font-bold">Correcciones pendientes ({edits.length})</h2>
    <div className="mt-3 space-y-3">{edits.map((edit) => <article key={edit.id} className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><b>{edit.spotify_track_id}</b><span className="ml-3 text-sm text-zinc-500">{edit.users?.username || "Usuario"} · {edit.lyrics.length} líneas</span><div className="mt-3 flex gap-2"><button onClick={() => moderate(edit.id, "approved")} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 font-bold"><Check size={16}/>Aprobar</button><button onClick={() => moderate(edit.id, "rejected")} className="flex items-center gap-2 rounded-xl bg-red-500/20 px-4 py-2 text-red-200"><X size={16}/>Rechazar</button></div></article>)}</div>
    <h2 className="mt-8 text-xl font-bold">Reportes abiertos ({reports.length})</h2>
    <div className="mt-3 space-y-3">{reports.map((report) => <article key={report.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.04] p-4"><span><b>{report.spotify_track_id}</b><small className="ml-3 text-zinc-500">Offset: {report.observed_offset_ms} ms</small></span><button onClick={() => resolve(report.id)} className="rounded-xl bg-violet-500 px-4 py-2 font-bold">Resolver</button></article>)}</div>
  </div></main>;
}
