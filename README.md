# TypeTheLyrics

Juego de mecanografía musical con canciones de Spotify, letras sincronizadas de LRCLIB, tres modos de juego, cuentas, progreso y salas multijugador de hasta ocho personas.

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
- Producción móvil: `https://m.typethelyrics.sbs/api/spotify/callback`
- Local: `http://localhost:3000/api/spotify/callback`

En computadoras, la reproducción continúa usando el reproductor embebido. En la versión móvil, la conexión también autoriza Web Playback SDK: cada jugador debe conectar una cuenta Spotify Premium para poder iniciar tanto partidas individuales como multijugador. El Premium propio de TypeTheLyrics sigue siendo independiente y solo controla las funciones internas del juego.

Si la aplicación de Spotify está en Development Mode, agregá cada tester en `Settings > Users Management`. Spotify limita este modo a cinco usuarios autorizados; iniciar sesión sin estar en esa lista no alcanza para usar la API.

## Versión móvil

La misma aplicación sirve la versión móvil cuando el hostname es `m.typethelyrics.sbs` o la ventana mide 767 px de ancho o menos. Para probarla localmente, abrí `http://localhost:3000/?mobile=1`.

En Render agregá `m.typethelyrics.sbs` como Custom Domain del mismo servicio. En el proveedor DNS creá un registro CNAME con nombre `m` y como destino el subdominio `onrender.com` del servicio; luego verificá el dominio en Render. También es obligatorio registrar la Redirect URI móvil indicada arriba en Spotify Developer Dashboard.

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
