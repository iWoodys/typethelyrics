-- Ejecutar una sola vez en Supabase SQL Editor.
alter table public.users add column if not exists is_admin boolean not null default false;
alter table public.lyric_edits add column if not exists moderation_status text not null default 'private';
alter table public.lyric_edits drop constraint if exists lyric_edits_moderation_status_check;
alter table public.lyric_edits add constraint lyric_edits_moderation_status_check
  check (moderation_status in ('private', 'pending', 'approved', 'rejected'));
alter table public.lyric_edits add column if not exists reviewed_at timestamptz;
alter table public.lyric_edits add column if not exists reviewed_by uuid references auth.users(id);

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from public.users where id = auth.uid() and is_admin);
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Users view own or public lyric edits" on public.lyric_edits;
drop policy if exists "Users view own or approved lyric edits" on public.lyric_edits;
create policy "Users view own or approved lyric edits" on public.lyric_edits for select to authenticated
  using (user_id = auth.uid() or (is_public and moderation_status = 'approved') or public.is_admin());
drop policy if exists "Admins view lyric reports" on public.lyric_reports;
create policy "Admins view lyric reports" on public.lyric_reports for select to authenticated using (public.is_admin());
revoke insert, update on public.lyric_edits from authenticated;

create or replace function public.save_lyric_edit(
  target_track_id text, target_lyrics jsonb, request_public boolean, target_duration_ms integer default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare edit_id uuid; item jsonb; previous_ms integer := -1; current_ms integer; line_text text;
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión.'; end if;
  if target_track_id !~ '^[A-Za-z0-9]{10,30}$' or jsonb_typeof(target_lyrics) <> 'array'
     or jsonb_array_length(target_lyrics) not between 1 and 2000 then raise exception 'La letra no es válida.'; end if;
  for item in select value from jsonb_array_elements(target_lyrics) loop
    current_ms := (item->>'startTimeMs')::integer;
    line_text := btrim(item->>'words');
    if current_ms < 0 or current_ms < previous_ms or length(line_text) not between 1 and 500
       or (target_duration_ms is not null and current_ms > target_duration_ms + 5000) then
      raise exception 'La letra contiene tiempos desordenados o texto inválido.';
    end if;
    previous_ms := current_ms;
  end loop;
  insert into public.lyric_edits(user_id, spotify_track_id, lyrics, is_public, moderation_status, updated_at)
  values(auth.uid(), target_track_id, target_lyrics, request_public,
    case when request_public then 'pending' else 'private' end, now())
  on conflict(user_id, spotify_track_id) do update set lyrics = excluded.lyrics,
    is_public = excluded.is_public, moderation_status = excluded.moderation_status,
    reviewed_at = null, reviewed_by = null, updated_at = now()
  returning id into edit_id;
  return edit_id;
end; $$;
revoke all on function public.save_lyric_edit(text,jsonb,boolean,integer) from public;
grant execute on function public.save_lyric_edit(text,jsonb,boolean,integer) to authenticated;

create or replace function public.moderate_lyric_edit(target_edit uuid, decision text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Acceso denegado.'; end if;
  if decision not in ('approved','rejected') then raise exception 'Decisión inválida.'; end if;
  update public.lyric_edits set moderation_status = decision, is_public = (decision = 'approved'),
    reviewed_at = now(), reviewed_by = auth.uid() where id = target_edit;
  if not found then raise exception 'Corrección inexistente.'; end if;
end; $$;
revoke all on function public.moderate_lyric_edit(uuid,text) from public;
grant execute on function public.moderate_lyric_edit(uuid,text) to authenticated;

create or replace function public.resolve_lyric_report(target_report uuid, decision text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Acceso denegado.'; end if;
  if decision not in ('reviewed','resolved') then raise exception 'Estado inválido.'; end if;
  update public.lyric_reports set status=decision, updated_at=now() where id=target_report;
end; $$;
revoke all on function public.resolve_lyric_report(uuid,text) from public;
grant execute on function public.resolve_lyric_report(uuid,text) to authenticated;

create index if not exists lyric_edits_review_queue_idx on public.lyric_edits(moderation_status, updated_at desc);
create index if not exists lyric_reports_status_idx on public.lyric_reports(status, updated_at desc);

-- Impide progreso imposible según tiempo transcurrido y contenido de la canción.
create or replace function public.update_lobby_progress(target_lobby uuid, current_score integer,
  current_accuracy numeric, current_wpm integer, current_combo integer)
returns void language plpgsql security definer set search_path = public as $$
declare room public.lobbies%rowtype; elapsed_seconds numeric; max_characters integer; score_cap integer;
begin
  select * into room from public.lobbies where id = target_lobby and status in ('countdown','playing');
  if not found or room.start_at is null then raise exception 'La partida no está activa.'; end if;
  elapsed_seconds := greatest(0, extract(epoch from (now() - room.start_at)));
  select coalesce(sum(length(value->>'words')),0) into max_characters from jsonb_array_elements(room.lyrics);
  score_cap := least(max_characters * 130 + jsonb_array_length(room.lyrics) * 350,
    floor(elapsed_seconds * 4000 + 1000)::integer);
  if current_score not between 0 and greatest(0, score_cap) or current_accuracy not between 0 and 100
    or current_wpm not between 0 and least(300, floor(elapsed_seconds * 12 + 80)::integer)
    or current_combo not between 0 and jsonb_array_length(room.lyrics) then raise exception 'Progreso no plausible.'; end if;
  update public.lobby_players set score = greatest(score,current_score), accuracy=current_accuracy,
    wpm=current_wpm, max_combo=greatest(max_combo,current_combo)
  where lobby_id=target_lobby and user_id=auth.uid() and finished_at is null;
  if not found then raise exception 'No pertenecés a esta partida.'; end if;
end; $$;
