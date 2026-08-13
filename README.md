# TypeTheLyrics

Juego de mecanografía musical con canciones de Spotify, letras sincronizadas de LRCLIB, cinco modos de juego, cuentas, progreso y salas multijugador de hasta ocho personas.

## Desarrollo local

Requiere Node.js 22 LTS.

```bash
npm install
npm run dev
```

Variables necesarias en `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-clave-publicable
SPOTIFY_CLIENT_ID=tu-client-id
SPOTIFY_CLIENT_SECRET=tu-client-secret
```

No publiques `SPOTIFY_CLIENT_SECRET` ni una clave `service_role`. La clave `NEXT_PUBLIC_SUPABASE_ANON_KEY` sí está diseñada para ejecutarse en el navegador y su acceso queda limitado por RLS.

## Base de datos

Para una instalación nueva, ejecutá `supabase-schema.sql` y luego las migraciones en orden:

1. `migrations/006_security_moderation_sync.sql`
2. `migrations/007_final_score_validation.sql`
3. `migrations/008_admin_announcements.sql`
4. `migrations/009_audit_hardening.sql`
5. `migrations/010_lobby_reliability.sql`
6. `migrations/011_lobby_chat.sql`

Las migraciones 009, 010 y 011 son obligatorias. La 010 valida las partidas en el servidor, evita sobrecupos, agrega presencia/salida de salas y registra los cambios Premium del administrador. La 011 instala el chat de las salas con RLS, antispam y actualizaciones en tiempo real.

## Spotify

En Spotify Developer Dashboard agregá exactamente estas Redirect URIs:

- Producción: `https://typethelyrics.sbs/api/spotify/callback`
- Local: `http://localhost:3000/api/spotify/callback`

La conexión de Spotify solo se usa para importar playlists propias o colaborativas. La reproducción se realiza con el reproductor embebido de Spotify y puede requerir que el usuario tenga una sesión de Spotify abierta en el navegador.

## Verificación

```bash
npm test -- --run
npm run lint
npm run typecheck
npm run build
```

## Despliegue

El repositorio incluye `render.yaml`. Configurá las cuatro variables de entorno en Render, aplicá las migraciones en Supabase y verificá `/api/health` y `/api/ready` después del despliegue. UptimeRobot debe vigilar `/api/ready`, que comprueba también la base de datos. Nunca copies secretos dentro del repositorio.

GitHub Actions ejecuta pruebas, lint, tipos y build en cada push. El workflow de backup requiere crear el secret de repositorio `SUPABASE_DB_URL` con la cadena de conexión PostgreSQL de Supabase; guarda copias privadas durante 14 días. Ejecutalo manualmente una vez para comprobar la restauración antes de confiar en la programación diaria.

## Servicios y atribución

- Spotify Web API y Spotify Embed para catálogo y reproducción.
- LRCLIB para letras sincronizadas.
- Supabase para autenticación, PostgreSQL, Realtime y almacenamiento de avatares.
- Render para alojamiento.
