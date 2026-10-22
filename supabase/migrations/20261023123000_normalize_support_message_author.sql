do $migration$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='support_messages' and column_name='user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='support_messages' and column_name='author_user_id'
  ) then
    alter table public.support_messages rename column user_id to author_user_id;
  end if;
end;$migration$;
