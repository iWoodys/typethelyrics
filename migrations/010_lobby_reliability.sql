-- Lobbies robustas, presencia y trazabilidad Premium.
-- Ejecutar despues de 009_audit_hardening.sql.

alter table public.lobby_players
  add column if not exists last_seen_at timestamptz not null default now();
create index if not exists lobby_players_presence_idx
  on public.lobby_players(lobby_id, last_seen_at);

create table if not exists public.premium_audit_log (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  target_email text not null default '',
  changed_by uuid references auth.users(id) on delete set null,
  previous_premium boolean not null,
  previous_until timestamptz,
  new_premium boolean not null,
  new_until timestamptz,
  reason text not null default '',
  created_at timestamptz not null default now()
);
alter table public.premium_audit_log add column if not exists target_email text not null default '';
alter table public.premium_audit_log enable row level security;
revoke all on public.premium_audit_log from anon, authenticated;
grant select on public.premium_audit_log to authenticated;
drop policy if exists "Admins view premium audit" on public.premium_audit_log;
create policy "Admins view premium audit" on public.premium_audit_log
  for select to authenticated using (public.is_admin());

create or replace function public.set_user_premium(
  target_email text, premium_days integer default null, change_reason text default '')
returns void language plpgsql security definer set search_path = public as $$
declare profile public.users%rowtype; new_until timestamptz;
begin
  if not public.is_admin() then raise exception 'Acceso denegado.'; end if;
  if premium_days is not null and premium_days not between 0 and 3650 then
    raise exception 'La cantidad de dias debe estar entre 0 y 3650.';
  end if;
  select * into profile from public.users where lower(email)=lower(trim(target_email)) for update;
  if not found then raise exception 'No existe una cuenta con ese correo.'; end if;
  new_until := case when premium_days is null then null
    when premium_days = 0 then now()
    else now() + make_interval(days => premium_days) end;
  insert into public.premium_audit_log(target_user_id,target_email,changed_by,previous_premium,
    previous_until,new_premium,new_until,reason)
  values(profile.id,profile.email,auth.uid(),profile.is_premium,profile.premium_until,
    premium_days is null or premium_days > 0,new_until,left(coalesce(change_reason,''),300));
  update public.users set is_premium=(premium_days is null or premium_days > 0),
    premium_until=new_until where id=profile.id;
end; $$;
revoke all on function public.set_user_premium(text,integer,text) from public, anon;
grant execute on function public.set_user_premium(text,integer,text) to authenticated;

create or replace function public.join_lobby(room_code text)
returns public.lobbies language plpgsql security definer set search_path = public as $$
declare room public.lobbies; current_players integer;
begin
  if auth.uid() is null then raise exception 'Tenes que iniciar sesion.'; end if;
  select * into room from public.lobbies
    where code=upper(trim(room_code)) and status='waiting' for update;
  if not found then raise exception 'La sala no existe o ya comenzo.'; end if;
  delete from public.lobby_players where lobby_id=room.id
    and user_id<>room.host_id and last_seen_at < now()-interval '90 seconds';
  if exists(select 1 from public.lobby_players where lobby_id=room.id and user_id=auth.uid()) then
    update public.lobby_players set last_seen_at=now() where lobby_id=room.id and user_id=auth.uid();
    return room;
  end if;
  select count(*) into current_players from public.lobby_players where lobby_id=room.id;
  if current_players >= 8 then raise exception 'La sala esta completa.'; end if;
  insert into public.lobby_players(lobby_id,user_id,last_seen_at)
    values(room.id,auth.uid(),now());
  return room;
end; $$;

create or replace function public.configure_lobby(target_lobby uuid, new_track_id text,
  new_track_url text, new_title text, new_artist text, new_image text,
  new_duration integer, new_lyrics jsonb, new_mode text)
returns void language plpgsql security definer set search_path = public as $$
declare item jsonb; previous_ms integer := -1; current_ms integer; line_text text;
begin
  if new_track_id !~ '^[A-Za-z0-9]{10,30}$'
    or new_track_url !~ '^https://open[.]spotify[.]com/(intl-[A-Za-z-]+/)?track/[A-Za-z0-9]{10,30}'
    or length(coalesce(new_title,'')) not between 1 and 200
    or length(coalesce(new_artist,'')) not between 1 and 300
    or length(coalesce(new_image,'')) > 1000
    or new_duration not between 10000 and 1800000
    or new_mode not in ('relaxed','rhythm','expert','practice','survival')
    or jsonb_typeof(new_lyrics) <> 'array'
    or jsonb_array_length(new_lyrics) not between 1 and 2000
    or pg_column_size(new_lyrics) > 1048576 then
    raise exception 'La configuracion de la cancion no es valida.';
  end if;
  for item in select value from jsonb_array_elements(new_lyrics) loop
    begin current_ms := (item->>'startTimeMs')::integer;
    exception when others then raise exception 'La letra contiene tiempos invalidos.'; end;
    line_text := btrim(coalesce(item->>'words',''));
    if current_ms < 0 or current_ms < previous_ms or current_ms > new_duration+5000
      or length(line_text) not between 1 and 500 then
      raise exception 'La letra contiene lineas invalidas o desordenadas.';
    end if;
    previous_ms := current_ms;
  end loop;
  update public.lobbies set spotify_track_id=new_track_id,track_url=new_track_url,
    track_title=new_title,track_artist=new_artist,image_url=nullif(new_image,''),
    duration_ms=new_duration,lyrics=new_lyrics,game_mode=new_mode,updated_at=now()
  where id=target_lobby and host_id=auth.uid() and status='waiting';
  if not found then raise exception 'Solo el anfitrion puede elegir la cancion.'; end if;
  update public.lobby_players set ready=(user_id=auth.uid()),audio_ready=false,
    score=0,accuracy=0,wpm=0,max_combo=0,finished_at=null,last_seen_at=now()
    where lobby_id=target_lobby;
end; $$;

create or replace function public.heartbeat_lobby(target_lobby uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.lobby_players set last_seen_at=now()
    where lobby_id=target_lobby and user_id=auth.uid();
  if not found then raise exception 'No perteneces a esta sala.'; end if;
end; $$;

create or replace function public.leave_lobby(target_lobby uuid)
returns void language plpgsql security definer set search_path = public as $$
declare room_host uuid;
begin
  select host_id into room_host from public.lobbies where id=target_lobby;
  if not found then return; end if;
  if room_host=auth.uid() then
    delete from public.lobbies where id=target_lobby;
  else
    delete from public.lobby_players where lobby_id=target_lobby and user_id=auth.uid();
  end if;
end; $$;

create or replace function public.cleanup_abandoned_lobbies()
returns integer language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  delete from public.lobbies l where
    (l.status in ('waiting','finished') and l.updated_at < now()-interval '24 hours')
    or not exists(select 1 from public.lobby_players p
      where p.lobby_id=l.id and p.user_id=l.host_id
        and p.last_seen_at >= now()-interval '5 minutes');
  get diagnostics removed = row_count;
  return removed;
end; $$;

revoke all on function public.join_lobby(text) from public, anon;
revoke all on function public.configure_lobby(uuid,text,text,text,text,text,integer,jsonb,text) from public, anon;
revoke all on function public.heartbeat_lobby(uuid) from public, anon;
revoke all on function public.leave_lobby(uuid) from public, anon;
revoke all on function public.cleanup_abandoned_lobbies() from public, anon;
grant execute on function public.join_lobby(text) to authenticated;
grant execute on function public.configure_lobby(uuid,text,text,text,text,text,integer,jsonb,text) to authenticated;
grant execute on function public.heartbeat_lobby(uuid) to authenticated;
grant execute on function public.leave_lobby(uuid) to authenticated;
grant execute on function public.cleanup_abandoned_lobbies() to authenticated;
