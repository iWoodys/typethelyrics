-- Validación final de resultados. Ejecutar después de 006_security_moderation_sync.sql.
drop function if exists public.save_game_result(text,text,text,text,text,integer,integer,numeric,integer);
create or replace function public.save_game_result(
  target_track_id text, target_title text, target_artist text, target_image text,
  target_mode text, target_score integer, target_wpm integer,
  target_accuracy numeric, target_combo integer, target_duration_ms integer,
  target_characters integer, target_lines integer, target_elapsed_ms integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare result_id uuid; computed_rank text; score_cap integer; wpm_cap integer;
begin
  if auth.uid() is null then raise exception 'Tienes que iniciar sesión.'; end if;
  if target_track_id !~ '^[A-Za-z0-9]{10,30}$'
    or target_mode not in ('relaxed','rhythm','expert')
    or target_duration_ms not between 10000 and 1800000
    or target_elapsed_ms not between 1000 and 7200000
    or target_characters not between 1 and 200000 or target_lines not between 1 and 2000 then
    raise exception 'Datos de partida inválidos.';
  end if;
  score_cap := target_characters * 130 + target_lines * 350;
  wpm_cap := least(300, floor(target_characters / 5.0 / greatest(target_elapsed_ms / 60000.0, 1.0/60.0))::integer + 5);
  if target_score not between 0 and score_cap or target_wpm not between 0 and wpm_cap
    or target_accuracy not between 0 and 100 or target_combo not between 0 and target_lines then
    raise exception 'Resultado no plausible.';
  end if;
  computed_rank := case when target_accuracy >= 98 and target_score >= 10000 then 'S'
    when target_accuracy >= 95 then 'A' when target_accuracy >= 85 then 'B' else 'C' end;
  insert into public.game_results(user_id,spotify_track_id,track_title,track_artist,image_url,
    mode,score,wpm,accuracy,max_combo,rank)
  values(auth.uid(),target_track_id,left(coalesce(target_title,'Canción'),200),
    left(coalesce(target_artist,''),300),left(target_image,1000),target_mode,target_score,
    target_wpm,target_accuracy,target_combo,computed_rank) returning id into result_id;
  return result_id;
end; $$;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare target_user uuid := auth.uid();
begin
  if target_user is null then raise exception 'Tienes que iniciar sesión.'; end if;
  delete from auth.users where id=target_user;
end; $$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.save_game_result(text,text,text,text,text,integer,integer,numeric,integer,integer,integer,integer,integer) from public;
grant execute on function public.save_game_result(text,text,text,text,text,integer,integer,numeric,integer,integer,integer,integer,integer) to authenticated;

create or replace function public.submit_lobby_result(target_lobby uuid, final_score integer,
  final_accuracy numeric, final_wpm integer, final_combo integer)
returns void language plpgsql security definer set search_path = public as $$
declare room public.lobbies%rowtype; elapsed_seconds numeric; max_characters integer; score_cap integer; wpm_cap integer;
begin
  select * into room from public.lobbies where id=target_lobby and status in ('countdown','playing');
  if not found or room.start_at is null then raise exception 'La partida no está activa.'; end if;
  elapsed_seconds := greatest(1,extract(epoch from (now()-room.start_at)));
  select coalesce(sum(length(value->>'words')),0) into max_characters from jsonb_array_elements(room.lyrics);
  score_cap := max_characters*130 + jsonb_array_length(room.lyrics)*350;
  wpm_cap := least(300,floor(max_characters/5.0/(elapsed_seconds/60.0))::integer+5);
  if final_score not between 0 and score_cap or final_accuracy not between 0 and 100
    or final_wpm not between 0 and wpm_cap or final_combo not between 0 and jsonb_array_length(room.lyrics)
    then raise exception 'Resultado no plausible.'; end if;
  update public.lobby_players set score=greatest(score,final_score),accuracy=final_accuracy,
    wpm=final_wpm,max_combo=greatest(max_combo,final_combo),finished_at=now()
    where lobby_id=target_lobby and user_id=auth.uid();
  if not found then raise exception 'No pertenecés a esta sala.'; end if;
  update public.lobbies set status='finished',updated_at=now() where id=target_lobby
    and now() >= room.start_at + room.duration_ms*interval '1 millisecond';
end; $$;
