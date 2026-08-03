import Link from "next/link";

export default function TermsPage() {
  return <main className="min-h-screen bg-[#07080d] px-5 py-16 text-zinc-200"><article className="mx-auto max-w-3xl space-y-6">
    <Link href="/" className="text-violet-300">← Volver al juego</Link>
    <h1 className="text-4xl font-black text-white">Términos de uso</h1>
    <p>Al usar TypeTheLyrics aceptás estas reglas. El juego se ofrece para entretenimiento y aprendizaje de mecanografía; puede cambiar, interrumpirse o contener errores.</p>
    <h2 className="text-2xl font-bold text-white">Cuenta y conducta</h2>
    <p>Sos responsable de tu cuenta. No está permitido intentar acceder a cuentas o funciones administrativas, automatizar partidas, alterar puntuaciones, acosar a otros jugadores ni abusar de Spotify, LRCLIB o Supabase. Podemos limitar o suspender cuentas que incumplan estas reglas.</p>
    <h2 className="text-2xl font-bold text-white">Música, letras y contenido</h2>
    <p>Spotify reproduce la música y LRCLIB aporta letras sincronizadas bajo sus propias condiciones. TypeTheLyrics no está afiliado ni patrocinado por Spotify. Las correcciones enviadas por jugadores pueden moderarse, rechazarse o reutilizarse dentro del juego.</p>
    <h2 className="text-2xl font-bold text-white">Premium</h2>
    <p>Premium habilita funciones indicadas dentro del juego durante el plazo asignado. Una concesión promocional o manual puede revocarse por fraude, error o abuso. Antes de aceptar pagos se publicarán condiciones específicas de precio, renovación y reembolsos.</p>
    <h2 className="text-2xl font-bold text-white">Disponibilidad y responsabilidad</h2>
    <p>No garantizamos que todas las canciones estén disponibles o perfectamente sincronizadas. En la medida permitida por la ley, no respondemos por interrupciones o pérdidas indirectas causadas por servicios externos.</p>
    <h2 className="text-2xl font-bold text-white">Contacto y derechos</h2>
    <p>Para reportar contenido, problemas o una posible infracción, usá el reporte del juego o el <a className="text-violet-300 underline" href="https://discord.gg/vWBs6txYZR" target="_blank" rel="noreferrer">Discord oficial</a>, indicando la canción y el motivo.</p>
    <p className="text-sm text-zinc-500">Última actualización: 3 de agosto de 2026.</p>
  </article></main>;
}
