create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  email text not null,
  avatar_url text,
  birth_date date,
  gender text check (gender is null or gender in ('female', 'male', 'non_binary', 'prefer_not_to_say', 'other')),
  score integer not null default 0 check (score >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null,
  spotify_url text not null unique,
  play_count integer not null default 0 check (play_count >= 0),
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.songs enable row level security;

create policy "Public leaderboard profiles"
on public.users for select
using (true);

create policy "Users create their own profile"
on public.users for insert
with check (auth.uid() = id);

create policy "Users update their own score"
on public.users for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Public song leaderboard"
on public.songs for select
using (true);

create policy "Anyone can register a song play"
on public.songs for insert
with check (true);

create policy "Anyone can increment song plays"
on public.songs for update
using (true)
with check (true);

create table if not exists public.game_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  spotify_track_id text not null,
  track_title text not null default 'Canción',
  track_artist text not null default '',
  image_url text,
  mode text not null check (mode in ('relaxed', 'rhythm', 'expert', 'practice', 'survival')),
  score integer not null default 0,
  wpm integer not null default 0,
  accuracy numeric(5,2) not null default 0,
  max_combo integer not null default 0,
  rank text not null default 'C',
  created_at timestamptz not null default now()
);

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  spotify_track_id text not null,
  title text not null,
  artist text not null,
  image_url text,
  created_at timestamptz not null default now(),
  primary key (user_id, spotify_track_id)
);

create table if not exists public.lyric_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  spotify_track_id text not null,
  lyrics jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, spotify_track_id)
);

alter table public.game_results enable row level security;
alter table public.favorites enable row level security;
alter table public.lyric_edits enable row level security;

create policy "Public game rankings" on public.game_results for select using (true);
create policy "Users save their results" on public.game_results for insert with check (auth.uid() = user_id);
create policy "Users view favorites" on public.favorites for select using (auth.uid() = user_id);
create policy "Users add favorites" on public.favorites for insert with check (auth.uid() = user_id);
create policy "Users remove favorites" on public.favorites for delete using (auth.uid() = user_id);
create policy "Users view own or public lyric edits" on public.lyric_edits for select using (auth.uid() = user_id or is_public);
create policy "Users create lyric edits" on public.lyric_edits for insert with check (auth.uid() = user_id);
create policy "Users update lyric edits" on public.lyric_edits for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete lyric edits" on public.lyric_edits for delete using (auth.uid() = user_id);

create index if not exists game_results_track_score_idx on public.game_results (spotify_track_id, score desc);
create index if not exists game_results_user_created_idx on public.game_results (user_id, created_at desc);

alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists birth_date date;
alter table public.users add column if not exists gender text;
alter table public.users add column if not exists is_premium boolean not null default false;
alter table public.users add column if not exists premium_until timestamptz;
revoke update on public.users from authenticated;
grant update (username, avatar_url, birth_date, gender, score) on public.users to authenticated;
alter table public.game_results add column if not exists track_title text not null default 'Canción';
alter table public.game_results add column if not exists track_artist text not null default '';
alter table public.game_results add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Public avatar images" on storage.objects;
create policy "Public avatar images" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users delete own avatar" on storage.objects;
create policy "Users delete own avatar" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, username, email, score)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1) || '_' || substr(new.id::text, 1, 6)),
    coalesce(new.email, ''),
    0
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Multiplayer ---------------------------------------------------------------
create table if not exists public.lobbies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'countdown', 'playing', 'finished')),
  game_mode text not null default 'rhythm' check (game_mode in ('relaxed', 'rhythm', 'expert', 'practice', 'survival')),
  spotify_track_id text, track_url text, track_title text, track_artist text, image_url text,
  duration_ms integer, lyrics jsonb not null default '[]'::jsonb, start_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table public.lobbies add column if not exists game_mode text not null default 'rhythm';

create table if not exists public.lobby_players (
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  ready boolean not null default false,
  score integer not null default 0, accuracy numeric(5,2) not null default 0,
  wpm integer not null default 0, max_combo integer not null default 0,
  finished_at timestamptz, joined_at timestamptz not null default now(),
  primary key (lobby_id, user_id)
);

alter table public.lobbies enable row level security;
alter table public.lobby_players enable row level security;
drop policy if exists "Authenticated users find lobbies" on public.lobbies;
create policy "Authenticated users find lobbies" on public.lobbies for select to authenticated using (true);
drop policy if exists "Players view lobby members" on public.lobby_players;
create policy "Players view lobby members" on public.lobby_players for select to authenticated using (true);

create or replace function public.create_lobby()
returns public.lobbies language plpgsql security definer set search_path = public as $$
declare room public.lobbies; premium boolean;
begin
  select (is_premium and (premium_until is null or premium_until > now())) into premium from public.users where id = auth.uid();
  if not coalesce(premium, false) then raise exception 'Solo los usuarios Premium pueden crear salas.'; end if;
  insert into public.lobbies (code, host_id)
  values (upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), auth.uid()) returning * into room;
  insert into public.lobby_players (lobby_id, user_id, ready) values (room.id, auth.uid(), true);
  return room;
end; $$;

create or replace function public.join_lobby(room_code text)
returns public.lobbies language plpgsql security definer set search_path = public as $$
declare room public.lobbies;
begin
  select * into room from public.lobbies where code = upper(trim(room_code)) and status = 'waiting';
  if room.id is null then raise exception 'La sala no existe o ya comenzó.'; end if;
  if (select count(*) from public.lobby_players where lobby_id = room.id) >= 8
     and not exists (select 1 from public.lobby_players where lobby_id = room.id and user_id = auth.uid())
  then raise exception 'La sala está completa.'; end if;
  insert into public.lobby_players (lobby_id, user_id) values (room.id, auth.uid()) on conflict do nothing;
  return room;
end; $$;

create or replace function public.set_lobby_ready(target_lobby uuid, is_ready boolean)
returns void language plpgsql security definer set search_path = public as $$
begin update public.lobby_players set ready = is_ready where lobby_id = target_lobby and user_id = auth.uid(); end; $$;

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

create or replace function public.start_lobby(target_lobby uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare begins timestamptz := now() + interval '5 seconds';
begin
  if exists (select 1 from public.lobby_players where lobby_id = target_lobby and ready = false) then
    raise exception 'Todos los jugadores deben estar listos.'; end if;
  update public.lobbies set status = 'countdown', start_at = begins, updated_at = now()
  where id = target_lobby and host_id = auth.uid() and spotify_track_id is not null and status = 'waiting';
  if not found then raise exception 'No se puede iniciar esta sala.'; end if;
  return begins;
end; $$;

create or replace function public.mark_lobby_playing(target_lobby uuid)
returns void language plpgsql security definer set search_path = public as $$
begin update public.lobbies set status = 'playing', updated_at = now()
  where id = target_lobby and status = 'countdown' and start_at <= now(); end; $$;

create or replace function public.submit_lobby_result(target_lobby uuid, final_score integer,
  final_accuracy numeric, final_wpm integer, final_combo integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.lobby_players set score = greatest(0, final_score), accuracy = least(100, greatest(0, final_accuracy)),
    wpm = greatest(0, final_wpm), max_combo = greatest(0, final_combo), finished_at = now()
  where lobby_id = target_lobby and user_id = auth.uid();
  if not found then raise exception 'No pertenecés a esta sala.'; end if;
  if exists (select 1 from public.lobbies where id = target_lobby and host_id = auth.uid())
     or not exists (select 1 from public.lobby_players where lobby_id = target_lobby and finished_at is null) then
    update public.lobbies set status = 'finished', updated_at = now() where id = target_lobby;
  end if;
end; $$;

create or replace function public.update_lobby_progress(target_lobby uuid, current_score integer,
  current_accuracy numeric, current_wpm integer, current_combo integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.lobby_players
  set score = greatest(score, greatest(0, current_score)),
      accuracy = least(100, greatest(0, current_accuracy)),
      wpm = greatest(0, current_wpm),
      max_combo = greatest(max_combo, greatest(0, current_combo))
  where lobby_id = target_lobby
    and user_id = auth.uid()
    and finished_at is null
    and exists (
      select 1 from public.lobbies
      where id = target_lobby and status in ('countdown', 'playing')
    );
  if not found then raise exception 'No se pudo actualizar el progreso de esta partida.'; end if;
end; $$;

create or replace function public.reset_lobby(target_lobby uuid)
returns void language plpgsql security definer set search_path = public as $$
declare room public.lobbies%rowtype;
begin
  select * into room from public.lobbies
  where id = target_lobby and status in ('waiting', 'finished')
    and exists (select 1 from public.lobby_players where lobby_id = target_lobby and user_id = auth.uid());
  if not found then raise exception 'No se puede volver a esta lobby.'; end if;
  update public.lobbies set status = 'waiting', spotify_track_id = null, track_url = null,
    track_title = null, track_artist = null, image_url = null, duration_ms = null,
    lyrics = '[]'::jsonb, start_at = null, updated_at = now() where id = target_lobby;
  update public.lobby_players set ready = (user_id = room.host_id), score = 0, accuracy = 0,
    wpm = 0, max_combo = 0, finished_at = null where lobby_id = target_lobby;
end; $$;

create or replace function public.is_lobby_member(target_lobby uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.lobby_players
    where lobby_id = target_lobby and user_id = auth.uid());
$$;
revoke all on function public.is_lobby_member(uuid) from public;
grant execute on function public.is_lobby_member(uuid) to authenticated;

drop policy if exists "Authenticated users find lobbies" on public.lobbies;
create policy "Players view their lobbies" on public.lobbies for select to authenticated
  using (public.is_lobby_member(id));
drop policy if exists "Players view lobby members" on public.lobby_players;
create policy "Players view lobby members" on public.lobby_players for select to authenticated
  using (public.is_lobby_member(lobby_id));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare requested_name text;
begin
  requested_name := left(coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''),
    split_part(coalesce(new.email, 'jugador'), '@', 1)), 24);
  begin
    insert into public.users (id, username, email, score)
    values (new.id, requested_name, coalesce(new.email, ''), 0)
    on conflict (id) do nothing;
  exception when unique_violation then
    insert into public.users (id, username, email, score)
    values (new.id, left(requested_name, 17) || '_' || substr(new.id::text, 1, 6),
      coalesce(new.email, ''), 0)
    on conflict (id) do nothing;
  end;
  return new;
end; $$;

grant execute on function public.create_lobby() to authenticated;
grant execute on function public.join_lobby(text) to authenticated;
grant execute on function public.set_lobby_ready(uuid, boolean) to authenticated;
grant execute on function public.configure_lobby(uuid, text, text, text, text, text, integer, jsonb, text) to authenticated;
grant execute on function public.set_lobby_mode(uuid, text) to authenticated;
grant execute on function public.start_lobby(uuid) to authenticated;
grant execute on function public.mark_lobby_playing(uuid) to authenticated;
grant execute on function public.submit_lobby_result(uuid, integer, numeric, integer, integer) to authenticated;
grant execute on function public.update_lobby_progress(uuid, integer, numeric, integer, integer) to authenticated;
grant execute on function public.reset_lobby(uuid) to authenticated;

-- Hardening (2026-08): limita los datos públicos y evita mutaciones directas
-- de puntuaciones. Este bloque puede ejecutarse sobre una instalación existente.
revoke select on public.users from anon, authenticated;
grant select (id, username, avatar_url, score, is_premium, premium_until, created_at)
  on public.users to anon, authenticated;
revoke update on public.users from authenticated;
grant update (username, avatar_url, birth_date, gender) on public.users to authenticated;

drop policy if exists "Anyone can register a song play" on public.songs;
drop policy if exists "Anyone can increment song plays" on public.songs;
revoke insert, update, delete on public.songs from anon, authenticated;

drop policy if exists "Users save their results" on public.game_results;
revoke insert, update, delete on public.game_results from anon, authenticated;

create or replace function public.get_my_profile()
returns table (username text, email text, avatar_url text, birth_date date, gender text,
  is_premium boolean, premium_until timestamptz)
language sql security definer set search_path = public stable as $$
  select u.username, u.email, u.avatar_url, u.birth_date, u.gender,
    u.is_premium, u.premium_until
  from public.users u where u.id = auth.uid();
$$;
revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;

create or replace function public.save_game_result(
  target_track_id text, target_title text, target_artist text, target_image text,
  target_mode text, target_score integer, target_wpm integer,
  target_accuracy numeric, target_combo integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare result_id uuid; computed_rank text;
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión.'; end if;
  if target_track_id !~ '^[A-Za-z0-9]{10,30}$'
    or target_mode not in ('relaxed', 'rhythm', 'expert', 'practice', 'survival')
    or target_score not between 0 and 1000000
    or target_wpm not between 0 and 400
    or target_accuracy not between 0 and 100
    or target_combo not between 0 and 10000 then
    raise exception 'Resultado inválido.';
  end if;
  computed_rank := case
    when target_accuracy >= 98 and target_score >= 10000 then 'S'
    when target_accuracy >= 95 then 'A'
    when target_accuracy >= 85 then 'B'
    else 'C' end;
  insert into public.game_results (user_id, spotify_track_id, track_title,
    track_artist, image_url, mode, score, wpm, accuracy, max_combo, rank)
  values (auth.uid(), target_track_id, left(coalesce(target_title, 'Canción'), 200),
    left(coalesce(target_artist, ''), 300), left(target_image, 1000), target_mode,
    target_score, target_wpm, target_accuracy, target_combo, computed_rank)
  returning id into result_id;
  return result_id;
end; $$;
revoke all on function public.save_game_result(text,text,text,text,text,integer,integer,numeric,integer) from public;
grant execute on function public.save_game_result(text,text,text,text,text,integer,integer,numeric,integer) to authenticated;

create or replace function public.submit_lobby_result(target_lobby uuid, final_score integer,
  final_accuracy numeric, final_wpm integer, final_combo integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if final_score not between 0 and 1000000 or final_accuracy not between 0 and 100
    or final_wpm not between 0 and 400 or final_combo not between 0 and 10000 then
    raise exception 'Resultado inválido.';
  end if;
  update public.lobby_players set score = greatest(score, final_score), accuracy = final_accuracy,
    wpm = final_wpm, max_combo = greatest(max_combo, final_combo), finished_at = now()
  where lobby_id = target_lobby and user_id = auth.uid();
  if not found then raise exception 'No pertenecés a esta sala.'; end if;
  update public.lobbies set status = 'finished', updated_at = now()
  where id = target_lobby and status in ('countdown', 'playing')
    and start_at is not null and duration_ms is not null
    and now() >= start_at + duration_ms * interval '1 millisecond';
end; $$;

create or replace function public.update_lobby_progress(target_lobby uuid, current_score integer,
  current_accuracy numeric, current_wpm integer, current_combo integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if current_score not between 0 and 1000000 or current_accuracy not between 0 and 100
    or current_wpm not between 0 and 400 or current_combo not between 0 and 10000 then
    raise exception 'Progreso inválido.';
  end if;
  update public.lobby_players set score = greatest(score, current_score),
    accuracy = current_accuracy, wpm = current_wpm,
    max_combo = greatest(max_combo, current_combo)
  where lobby_id = target_lobby and user_id = auth.uid() and finished_at is null
    and exists (select 1 from public.lobbies where id = target_lobby
      and status in ('countdown', 'playing'));
  if not found then raise exception 'No se pudo actualizar el progreso de esta partida.'; end if;
end; $$;

create or replace function public.reset_lobby(target_lobby uuid)
returns void language plpgsql security definer set search_path = public as $$
declare room public.lobbies%rowtype;
begin
  select * into room from public.lobbies
  where id = target_lobby and host_id = auth.uid() and status in ('waiting', 'finished');
  if not found then raise exception 'Solo el anfitrión puede reiniciar esta lobby.'; end if;
  update public.lobbies set status = 'waiting', spotify_track_id = null, track_url = null,
    track_title = null, track_artist = null, image_url = null, duration_ms = null,
    lyrics = '[]'::jsonb, start_at = null, updated_at = now() where id = target_lobby;
  update public.lobby_players set ready = (user_id = room.host_id), score = 0, accuracy = 0,
    wpm = 0, max_combo = 0, finished_at = null where lobby_id = target_lobby;
end; $$;
create index if not exists lobbies_code_idx on public.lobbies(code);
create index if not exists lobby_players_score_idx on public.lobby_players(lobby_id, score desc);
do $$ begin alter publication supabase_realtime add table public.lobbies; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.lobby_players; exception when duplicate_object then null; end $$;
