-- Run after schema.sql. The server calls this with its service-role key only.
-- Deleting the group and its messages must be one transaction.
create or replace function public.delete_chat_group(p_group_id uuid, p_creator text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  owner_name text;
begin
  select created_by into owner_name from public.groups where id = p_group_id for update;
  if not found then return 'not_found'; end if;
  if owner_name <> p_creator then return 'forbidden'; end if;
  delete from public.messages where room_id = 'group:' || p_group_id::text;
  delete from public.group_members where group_id = p_group_id;
  delete from public.groups where id = p_group_id;
  return 'deleted';
end;
$$;

revoke all on function public.delete_chat_group(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_chat_group(uuid, text) to service_role;

-- Serialize a group message insert against deletion of its group.
create or replace function public.lock_message_group()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.room_id like 'group:%' then
    perform 1 from public.groups where id::text = substring(new.room_id from 7) for key share;
    if not found then
      raise exception 'Group does not exist' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists lock_message_group_before_insert on public.messages;
create trigger lock_message_group_before_insert
before insert on public.messages
for each row execute function public.lock_message_group();

notify pgrst, 'reload schema';
