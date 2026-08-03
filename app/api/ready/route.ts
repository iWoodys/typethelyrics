import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase no está configurado");
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await supabase.from("users").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;
    return NextResponse.json({ status: "ready", database: "ok", latency_ms: Date.now() - startedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ status: "unavailable", database: "error", detail: error instanceof Error ? error.message : "Error desconocido" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
