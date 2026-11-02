-- FATIH BOUTIQUE participant portal
-- Run this in the Supabase SQL Editor for the SAME project.
-- This script does not alter or delete public.admins or existing auth users.

create extension if not exists pgcrypto;

do $$ begin
  create type public.participant_status as enum ('pending','confirmed','suspended');
exception when duplicate_object then null; end $$;

create table if not exists public.participants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  username text not null,
  status public.participant_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participants_full_name_length check (char_length(full_name) between 2 and 100),
  constraint participants_username_format check (username ~ '^[A-Za-z0-9_]{3,24}$')
);
create unique index if not exists participants_username_lower_unique on public.participants (lower(username));

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 140),
  body text not null check (char_length(body) between 1 and 8000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

-- Helper functions avoid recursive RLS checks against public.admins.
create or replace function public.current_admin_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.admins where user_id = auth.uid() limit 1;
$$;

create or replace function public.is_confirmed_participant()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.participants
    where user_id = auth.uid() and status = 'confirmed'
  );
$$;

-- Create a pending participant profile automatically when a new auth user signs up.
create or replace function public.create_participant_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_username text;
  desired_name text;
begin
  desired_username := coalesce(new.raw_user_meta_data->>'username', 'guest_' || substr(new.id::text,1,8));
  desired_name := coalesce(new.raw_user_meta_data->>'full_name', 'Participant');
  insert into public.participants(user_id, full_name, username, status)
  values (new.id, desired_name, desired_username, 'pending')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_participant on auth.users;
create trigger on_auth_user_created_participant
after insert on auth.users
for each row execute procedure public.create_participant_profile();

alter table public.participants enable row level security;
alter table public.announcements enable row level security;
alter table public.forum_posts enable row level security;

-- Participants can read their own profile; confirmed participants and admins can read the roster.
drop policy if exists "participant self or confirmed roster read" on public.participants;
create policy "participant self or confirmed roster read"
on public.participants for select to authenticated
using (user_id = auth.uid() or public.is_confirmed_participant() or public.current_admin_role() = 'admin');

-- Participants may edit only their own display name and username (not their status).
revoke update on public.participants from authenticated;
grant update (full_name, username) on public.participants to authenticated;
drop policy if exists "participant edits own profile" on public.participants;
create policy "participant edits own profile"
on public.participants for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Admin-only status changes via controlled RPC.
create or replace function public.admin_set_participant_status(target_user_id uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_admin_role() is distinct from 'admin' then
    raise exception 'Only an administrator can change participant status';
  end if;
  if new_status not in ('pending','confirmed','suspended') then
    raise exception 'Invalid participant status';
  end if;
  update public.participants
    set status = new_status::public.participant_status, updated_at = now()
    where user_id = target_user_id;
  if not found then raise exception 'Participant not found'; end if;
end;
$$;
revoke all on function public.admin_set_participant_status(uuid,text) from public;
grant execute on function public.admin_set_participant_status(uuid,text) to authenticated;

-- Announcement access: confirmed participants read; admin/editor publish and manage.
drop policy if exists "confirmed read announcements" on public.announcements;
create policy "confirmed read announcements" on public.announcements
for select to authenticated
using (public.is_confirmed_participant() or public.current_admin_role() in ('admin','editor'));
drop policy if exists "admin editor create announcements" on public.announcements;
create policy "admin editor create announcements" on public.announcements
for insert to authenticated
with check (public.current_admin_role() in ('admin','editor') and created_by = auth.uid());
drop policy if exists "admin editor update announcements" on public.announcements;
create policy "admin editor update announcements" on public.announcements
for update to authenticated
using (public.current_admin_role() in ('admin','editor'))
with check (public.current_admin_role() in ('admin','editor'));
drop policy if exists "admin editor delete announcements" on public.announcements;
create policy "admin editor delete announcements" on public.announcements
for delete to authenticated
using (public.current_admin_role() in ('admin','editor'));

-- Forum: only confirmed participants and staff can read; only confirmed participants can post.
drop policy if exists "confirmed read forum posts" on public.forum_posts;
create policy "confirmed read forum posts" on public.forum_posts
for select to authenticated
using (public.is_confirmed_participant() or public.current_admin_role() in ('admin','editor'));
drop policy if exists "confirmed create own forum posts" on public.forum_posts;
create policy "confirmed create own forum posts" on public.forum_posts
for insert to authenticated
with check (public.is_confirmed_participant() and user_id = auth.uid());
drop policy if exists "owner or admin delete forum posts" on public.forum_posts;
create policy "owner or admin delete forum posts" on public.forum_posts
for delete to authenticated
using (user_id = auth.uid() or public.current_admin_role() = 'admin');

-- Minimal grants required by the browser client.
grant select on public.participants to authenticated;
grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert, delete on public.forum_posts to authenticated;
grant usage on schema public to authenticated;

-- Important: existing public.admins table is intentionally left untouched.
