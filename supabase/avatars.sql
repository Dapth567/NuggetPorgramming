-- Run after schema.sql, and on any database that already has its tables.
-- Keep the length in step with LIMITS.avatarMaxLength in shared/src/index.ts.
alter table public.users add column if not exists avatar text;

alter table public.users drop constraint if exists users_avatar_length;
alter table public.users
  add constraint users_avatar_length check (avatar is null or length(avatar) <= 20000);

notify pgrst, 'reload schema';
