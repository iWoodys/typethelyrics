-- Cierre de seguridad posterior a la auditoria integral.
-- Ejecutar despues de 008_admin_announcements.sql.

-- El esquema historico podia volver a crear esta firma sin las validaciones finales.
drop function if exists public.save_game_result(text,text,text,text,text,integer,integer,numeric,integer);

create or replace function public.save_game_result(
  target_track_id text, target_title text, target_artist text, target_image text,
  target_mode text, target_score integer, target_wpm integer,
  target_accuracy numeric, target_combo integer, target_duration_ms integer,
  target_characters integer, target_lines integer, target_elapsed_ms integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare result_id uuid; computed_rank text; score_cap integer; wpm_cap integer;
begin
  if auth.uid() is null then raise exception 'Tenes que iniciar sesion.'; end if;
  if target_track_id !~ '^[A-Za-z0-9]{10,30}$'
    or target_mode not in ('relaxed','rhythm','expert','practice','survival')
    or target_duration_ms not between 10000 and 1800000
    or target_elapsed_ms not between 1000 and 7200000
    or target_characters not between 1 and 200000 or target_lines not between 1 and 2000 then
    raise exception 'Datos de partida invalidos.';
  end if;
  score_cap := target_characters * 130 + target_lines * 350;
  wpm_cap := least(300, floor(target_characters / 5.0 / greatest(target_elapsed_ms / 60000.0, 1.0/60.0))::integer + 5);
  if target_score not between 0 and score_cap or target_wpm not between 0 and wpm_cap
    or target_accuracy not between 0 and 100 or target_combo not between 0 and target_lines then
    raise exception 'Resultado no plausible.';
  end if;
  computed_rank := case
    when target_accuracy >= 98 and target_score >= 12000 then 'S'
    when target_accuracy >= 95 and target_score >= 7500 then 'A'
    when target_accuracy >= 88 then 'B' else 'C' end;
  insert into public.game_results(user_id,spotify_track_id,track_title,track_artist,image_url,
    mode,score,wpm,accuracy,max_combo,rank)
  values(auth.uid(),target_track_id,left(coalesce(target_title,'Cancion'),200),
    left(coalesce(target_artist,''),300),left(target_image,1000),target_mode,target_score,
    target_wpm,target_accuracy,target_combo,computed_rank) returning id into result_id;
  return result_id;
end; $$;

-- Los perfiles se crean mediante trigger/RPC; el cliente nunca puede elegir privilegios.
drop policy if exists "Users create their own profile" on public.users;
revoke insert on public.users from anon, authenticated;
revoke select on public.users from anon, authenticated;
grant select (id, username, avatar_url, is_premium, premium_until, score) on public.users to anon, authenticated;
revoke update (score, email, is_premium, premium_until, is_admin) on public.users from authenticated;
alter table public.users drop constraint if exists users_username_format_check;
alter table public.users add constraint users_username_format_check
  check (username ~ '^[A-Za-z0-9_.-]{3,24}$') not valid;
alter table public.users drop constraint if exists users_birth_date_check;
alter table public.users add constraint users_birth_date_check
  check (birth_date is null or birth_date <= current_date) not valid;
do $$ begin
  if not exists(select 1 from public.users group by lower(username) having count(*) > 1) then
    execute 'create unique index if not exists users_username_lower_unique on public.users(lower(username))';
  end if;
end $$;

create or replace function public.repair_my_profile()
returns public.users
language plpgsql security definer set search_path = public, auth as $$
declare
  result public.users;
  base_name text;
begin
  if auth.uid() is null then raise exception 'Tenes que iniciar sesion.'; end if;
  select * into result from public.users where id = auth.uid();
  if found then return result; end if;

  base_name := regexp_replace(
    coalesce((select raw_user_meta_data->>'username' from auth.users where id=auth.uid()),
             split_part(coalesce(auth.jwt()->>'email','jugador'),'@',1), 'jugador'),
    '[^A-Za-z0-9_.-]', '', 'g');
  if length(base_name) < 3 then base_name := 'jugador'; end if;
  base_name := left(base_name, 16) || '_' || left(replace(auth.uid()::text,'-',''), 6);

  insert into public.users(id, username, email, score, is_premium, is_admin)
  values(auth.uid(), base_name, coalesce(auth.jwt()->>'email',''), 0, false, false)
  returning * into result;
  return result;
end; $$;
revoke all on function public.repair_my_profile() from public, anon;
grant execute on function public.repair_my_profile() to authenticated;

-- El historial privado se entrega solo a su propietario.
drop policy if exists "Public game rankings" on public.game_results;
revoke select, insert, update, delete on public.game_results from anon, authenticated;

create or replace function public.get_my_game_results()
returns table(id uuid, spotify_track_id text, track_title text, track_artist text,
  image_url text, mode text, score integer, wpm integer, accuracy numeric,
  max_combo integer, rank text, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select gr.id, gr.spotify_track_id, gr.track_title, gr.track_artist, gr.image_url,
    gr.mode, gr.score, gr.wpm, gr.accuracy, gr.max_combo, gr.rank, gr.created_at
  from public.game_results gr where gr.user_id=auth.uid()
  order by gr.created_at desc limit 500;
$$;
revoke all on function public.get_my_game_results() from public, anon;
grant execute on function public.get_my_game_results() to authenticated;

-- Ranking publico anonimizado: una sola mejor marca por jugador y cancion.
create or replace function public.get_track_rankings(target_track_id text, target_mode text default null)
returns table(username text, score integer, wpm integer, accuracy numeric,
  max_combo integer, rank text, mode text, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select best.username, best.score, best.wpm, best.accuracy, best.max_combo,
    best.rank, best.mode, best.created_at
  from (
    select distinct on (gr.user_id) u.username, gr.score, gr.wpm, gr.accuracy,
      gr.max_combo, gr.rank, gr.mode, gr.created_at, gr.user_id
    from public.game_results gr join public.users u on u.id=gr.user_id
    where gr.spotify_track_id=target_track_id
      and (target_mode is null or gr.mode=target_mode)
    order by gr.user_id, gr.score desc, gr.accuracy desc, gr.created_at asc
  ) best order by best.score desc, best.accuracy desc limit 20;
$$;
revoke all on function public.get_track_rankings(text,text) from public;
grant execute on function public.get_track_rankings(text,text) to anon, authenticated;

create or replace function public.get_top_typists()
returns table(username text, avatar_url text, score bigint)
language sql security definer stable set search_path = public as $$
  select u.username, u.avatar_url, sum(gr.score)::bigint as score
  from public.game_results gr join public.users u on u.id=gr.user_id
  group by u.id, u.username, u.avatar_url order by score desc limit 10;
$$;
revoke all on function public.get_top_typists() from public;
grant execute on function public.get_top_typists() to anon, authenticated;

create or replace function public.get_top_songs()
returns table(title text, artist text, spotify_url text, play_count bigint)
language sql security definer stable set search_path = public as $$
  select max(gr.track_title), max(gr.track_artist),
    'https://open.spotify.com/track/' || gr.spotify_track_id, count(*)::bigint
  from public.game_results gr group by gr.spotify_track_id order by count(*) desc limit 10;
$$;
revoke all on function public.get_top_songs() from public;
grant execute on function public.get_top_songs() to anon, authenticated;

-- La sincronizacion comunitaria aprobada no expone datos del autor.
create or replace function public.get_approved_lyrics(target_track_id text)
returns table(lyrics jsonb)
language sql security definer stable set search_path = public as $$
  select le.lyrics from public.lyric_edits le
  where le.spotify_track_id=target_track_id and le.is_public
    and le.moderation_status='approved'
  order by le.reviewed_at desc nulls last, le.updated_at desc limit 1;
$$;
revoke all on function public.get_approved_lyrics(text) from public;
grant execute on function public.get_approved_lyrics(text) to anon, authenticated;

-- Solo un integrante real de la sala puede confirmar que ya esta reproduciendo.
create or replace function public.mark_lobby_playing(target_lobby uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists(
    select 1 from public.lobby_players
    where lobby_id=target_lobby and user_id=auth.uid()
  ) then raise exception 'No perteneces a esta sala.'; end if;
  update public.lobbies set status='playing', updated_at=now()
  where id=target_lobby and status='countdown' and start_at <= now();
end; $$;

-- PostgreSQL concede EXECUTE a PUBLIC por defecto: se cierra cada RPC sensible.
revoke all on function public.create_lobby() from public, anon;
revoke all on function public.join_lobby(text) from public, anon;
revoke all on function public.set_lobby_ready(uuid,boolean) from public, anon;
revoke all on function public.set_lobby_audio_ready(uuid,boolean) from public, anon;
revoke all on function public.configure_lobby(uuid,text,text,text,text,text,integer,jsonb,text) from public, anon;
revoke all on function public.set_lobby_mode(uuid,text) from public, anon;
revoke all on function public.start_lobby(uuid) from public, anon;
revoke all on function public.mark_lobby_playing(uuid) from public, anon;
revoke all on function public.submit_lobby_result(uuid,integer,numeric,integer,integer) from public, anon;
revoke all on function public.update_lobby_progress(uuid,integer,numeric,integer,integer) from public, anon;
revoke all on function public.reset_lobby(uuid) from public, anon;
revoke all on function public.is_lobby_member(uuid) from public, anon;
grant execute on function public.mark_lobby_playing(uuid) to authenticated;

-- Asegura que las funciones finales tampoco conserven permisos heredados.
revoke all on function public.save_game_result(text,text,text,text,text,integer,integer,numeric,integer,integer,integer,integer,integer) from public, anon;
grant execute on function public.save_game_result(text,text,text,text,text,integer,integer,numeric,integer,integer,integer,integer,integer) to authenticated;
