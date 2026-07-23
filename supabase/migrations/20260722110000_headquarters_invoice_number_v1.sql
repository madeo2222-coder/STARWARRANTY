begin;

alter table public.headquarters_settings
  add column if not exists invoice_number text null;

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class rel on rel.oid = con.conrelid
      join pg_catalog.pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'headquarters_settings'
       and con.conname = 'headquarters_settings_invoice_number_check'
  ) then
    alter table public.headquarters_settings
      add constraint headquarters_settings_invoice_number_check
      check (
        invoice_number is null
        or invoice_number ~ '^T[0-9]{13}$'
      );
  end if;
end;
$$;

commit;

-- Read-only verification queries for Supabase Dashboard SQL Editor.
select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'headquarters_settings'
  and column_name = 'invoice_number';

select
  con.conname as constraint_name,
  pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class rel on rel.oid = con.conrelid
join pg_catalog.pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'headquarters_settings'
  and con.conname = 'headquarters_settings_invoice_number_check';

select
  count(*) as invalid_invoice_number_count
from public.headquarters_settings
where invoice_number is not null
  and invoice_number !~ '^T[0-9]{13}$';
