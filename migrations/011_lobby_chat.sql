-- Chat seguro para las salas multijugador.
-- Ejecutar despues de 010_lobby_reliability.sql.

create table if not exists public.lobby_messages (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

create index if not exists lobby_messages_room_time_idx
  on public.lobby_messages(lobby_id, created_at desc);

alter table public.lobby_messages enable row level security;
revoke all on public.lobby_messages from anon, authenticated;
grant select on public.lobby_messages to authenticated;

drop policy if exists "Lobby members read chat" on public.lobby_messages;
create policy "Lobby members read chat" on public.lobby_messages
  for select to authenticated
  using (public.is_lobby_member(lobby_id));

create or replace function public.send_lobby_message(
  target_lobby uuid,
  message_body text
)
returns public.lobby_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_body text;
  sent_message public.lobby_messages;
begin
  if auth.uid() is null then
    raise exception 'Tienes que iniciar sesion.';
  end if;

  clean_body := btrim(regexp_replace(coalesce(message_body, ''), '[[:space:]]+', ' ', 'g'));
  if char_length(clean_body) not between 1 and 300 then
    raise exception 'El mensaje debe tener entre 1 y 300 caracteres.';
  end if;

  -- El bloqueo serializa los envios del mismo jugador y evita eludir el antispam.
  perform 1 from public.lobby_players
    where lobby_id = target_lobby and user_id = auth.uid()
    for update;
  if not found then
    raise exception 'No perteneces a esta sala.';
  end if;

  -- Bloquea la sala durante el envio para que no se cuele un mensaje justo
  -- cuando el anfitrion cambia el estado a countdown.
  perform 1 from public.lobbies
    where id = target_lobby and status = 'waiting'
    for update;
  if not found then
    raise exception 'El chat se desactiva cuando comienza la partida.';
  end if;

  if exists (
    select 1 from public.lobby_messages
    where lobby_id = target_lobby
      and user_id = auth.uid()
      and created_at > now() - interval '1 second'
  ) then
    raise exception 'Espera un segundo antes de enviar otro mensaje.';
  end if;

  insert into public.lobby_messages(lobby_id, user_id, body)
    values(target_lobby, auth.uid(), clean_body)
    returning * into sent_message;

  -- Conserva los 200 mensajes mas recientes de cada sala.
  delete from public.lobby_messages
    where lobby_id = target_lobby
      and id in (
        select id from public.lobby_messages
        where lobby_id = target_lobby
        order by created_at desc
        offset 200
      );

  return sent_message;
end;
$$;

revoke all on function public.send_lobby_message(uuid,text) from public, anon;
grant execute on function public.send_lobby_message(uuid,text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.lobby_messages;
exception when duplicate_object then null;
end $$;
