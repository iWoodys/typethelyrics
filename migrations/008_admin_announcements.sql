-- Anuncios de inicio: lectura pública, administración únicamente mediante RPC protegidas.
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

drop policy if exists "Anyone reads active announcements" on public.announcements;
create policy "Anyone reads active announcements"
  on public.announcements for select to anon, authenticated
  using (is_active = true);

revoke insert, update, delete on public.announcements from anon, authenticated;

create or replace function public.publish_announcement(announcement_title text, announcement_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare new_id uuid;
begin
  if not public.is_admin() then raise exception 'Acceso denegado.'; end if;
  announcement_title := btrim(announcement_title);
  announcement_body := btrim(announcement_body);
  if char_length(announcement_title) not between 1 and 80
     or char_length(announcement_body) not between 1 and 2000 then
    raise exception 'El título o el contenido no tienen una longitud válida.';
  end if;
  update public.announcements set is_active = false where is_active;
  insert into public.announcements(title, body, created_by)
    values (announcement_title, announcement_body, auth.uid())
    returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.publish_announcement(text, text) from public;
grant execute on function public.publish_announcement(text, text) to authenticated;

create or replace function public.disable_active_announcement()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Acceso denegado.'; end if;
  update public.announcements set is_active = false where is_active;
end;
$$;

revoke all on function public.disable_active_announcement() from public;
grant execute on function public.disable_active_announcement() to authenticated;

create index if not exists announcements_active_created_idx
  on public.announcements(is_active, created_at desc);
