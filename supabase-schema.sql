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
