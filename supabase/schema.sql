-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It is safe to run again; existing tables are left alone.
-- Login does not use Supabase Auth. The server stores a username and a password hash in `users`.

create table if not exists users (
  name text primary key,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by text not null references users (name),
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid not null references groups (id) on delete cascade,
  user_name text not null references users (name),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_name)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  sender text not null references users (name),
  text text not null,
  sent_at timestamptz not null default now()
);

create index if not exists messages_room_sent_at on messages (room_id, sent_at);

-- Only the server (secret key) touches these tables. With row level security on and no
-- policies, the public anon key cannot read or write anything.
alter table users enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table messages enable row level security;
