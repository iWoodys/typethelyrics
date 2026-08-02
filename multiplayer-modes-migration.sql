-- Ejecutá este archivo una sola vez en Supabase > SQL Editor antes de publicar la app.
alter table public.lobbies
  add column if not exists game_mode text not null default 'rhythm';

drop function if exists public.configure_lobby(uuid, text, text, text, text, text, integer, jsonb);

create or replace function public.configure_lobby(target_lobby uuid, new_track_id text, new_track_url text,
  new_title text, new_artist text, new_image text, new_duration integer, new_lyrics jsonb, new_mode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.lobbies set spotify_track_id = new_track_id, track_url = new_track_url, track_title = new_title,
    track_artist = new_artist, image_url = new_image, duration_ms = new_duration, lyrics = new_lyrics,
    game_mode = case when new_mode in ('relaxed', 'rhythm', 'expert', 'practice', 'survival') then new_mode else 'rhythm' end,
    updated_at = now()
  where id = target_lobby and host_id = auth.uid() and status = 'waiting';
  if not found then raise exception 'Solo el anfitrión puede elegir la canción.'; end if;
  update public.lobby_players set ready = (user_id = auth.uid()), score = 0, accuracy = 0, wpm = 0,
    max_combo = 0, finished_at = null where lobby_id = target_lobby;
end; $$;

create or replace function public.set_lobby_mode(target_lobby uuid, new_mode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if new_mode not in ('relaxed', 'rhythm', 'expert', 'practice', 'survival') then
    raise exception 'Modo de juego inválido.';
  end if;
  update public.lobbies set game_mode = new_mode, updated_at = now()
  where id = target_lobby and host_id = auth.uid() and status = 'waiting';
  if not found then raise exception 'Solo el anfitrión puede cambiar el modo.'; end if;
end; $$;

grant execute on function public.configure_lobby(uuid, text, text, text, text, text, integer, jsonb, text) to authenticated;
grant execute on function public.set_lobby_mode(uuid, text) to authenticated;
