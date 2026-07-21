begin;

create table if not exists public.submission_duplicate_reviews (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.submission_batches(id) on delete restrict,
  row_id uuid not null references public.submission_rows(id) on delete restrict,
  duplicate_of_row_id uuid not null references public.submission_rows(id) on delete restrict,
  decision text not null,
  previous_duplicate_status text not null,
  next_duplicate_status text not null,
  previous_import_status text not null,
  next_import_status text not null,
  review_note text not null,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by_label text not null,
  reviewed_at timestamptz not null default now(),
  review_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint submission_duplicate_reviews_row_id_key unique (row_id),
  constraint submission_duplicate_reviews_decision_check
    check (decision in ('separate', 'exclude')),
  constraint submission_duplicate_reviews_previous_duplicate_status_check
    check (previous_duplicate_status in ('duplicate', 'needs_review')),
  constraint submission_duplicate_reviews_next_duplicate_status_check
    check (next_duplicate_status in ('unique', 'duplicate', 'needs_review')),
  constraint submission_duplicate_reviews_note_check
    check (length(btrim(review_note)) > 0),
  constraint submission_duplicate_reviews_transition_check
    check (
      (
        decision = 'separate'
        and next_duplicate_status = 'unique'
        and next_import_status = previous_import_status
      )
      or
      (
        decision = 'exclude'
        and next_duplicate_status = previous_duplicate_status
        and next_import_status = 'skipped'
      )
    )
);

create index if not exists submission_duplicate_reviews_batch_id_idx
  on public.submission_duplicate_reviews(batch_id);

create index if not exists submission_duplicate_reviews_duplicate_of_row_id_idx
  on public.submission_duplicate_reviews(duplicate_of_row_id);

create index if not exists submission_duplicate_reviews_reviewed_at_idx
  on public.submission_duplicate_reviews(reviewed_at desc);

alter table public.submission_duplicate_reviews enable row level security;

revoke all on table public.submission_duplicate_reviews from public;
revoke all on table public.submission_duplicate_reviews from anon;
revoke all on table public.submission_duplicate_reviews from authenticated;
revoke all on table public.submission_duplicate_reviews from service_role;
grant select on table public.submission_duplicate_reviews to service_role;

create or replace function public.review_submission_duplicate(
  p_batch_id uuid,
  p_row_id uuid,
  p_decision text,
  p_review_note text,
  p_reviewed_by uuid,
  p_reviewed_by_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.submission_rows%rowtype;
  v_source public.submission_rows%rowtype;
  v_existing_review_id uuid;
  v_updated_row_id uuid;
  v_review_id uuid;
  v_next_duplicate_status text;
  v_next_import_status text;
  v_snapshot jsonb;
  v_now timestamptz := now();
begin
  if p_decision is null or p_decision not in ('separate', 'exclude') then
    return jsonb_build_object(
      'success', false,
      'code', 'INVALID_DUPLICATE_DECISION',
      'message', '許可されていない重複判断です。'
    );
  end if;

  if p_review_note is null or length(btrim(p_review_note)) = 0 then
    return jsonb_build_object(
      'success', false,
      'code', 'REVIEW_NOTE_REQUIRED',
      'message', '判断理由を入力してください。'
    );
  end if;

  if p_reviewed_by is null or length(btrim(coalesce(p_reviewed_by_label, ''))) = 0 then
    return jsonb_build_object(
      'success', false,
      'code', 'DUPLICATE_REVIEW_SAVE_FAILED',
      'message', '判断者を確認できません。'
    );
  end if;

  select *
    into v_row
    from public.submission_rows
   where id = p_row_id
   for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'ROW_NOT_FOUND',
      'message', '対象行が見つかりません。'
    );
  end if;

  if v_row.batch_id <> p_batch_id then
    return jsonb_build_object(
      'success', false,
      'code', 'ROW_BATCH_MISMATCH',
      'message', '対象行は指定された受付に属していません。'
    );
  end if;

  select id
    into v_existing_review_id
    from public.submission_duplicate_reviews
   where row_id = p_row_id;

  if v_existing_review_id is not null then
    return jsonb_build_object(
      'success', false,
      'code', 'DUPLICATE_REVIEW_NOT_REQUIRED',
      'message', 'この行はすでに重複判断済みです。'
    );
  end if;

  if v_row.duplicate_status not in ('duplicate', 'needs_review')
     or v_row.import_status = 'skipped' then
    return jsonb_build_object(
      'success', false,
      'code', 'DUPLICATE_REVIEW_NOT_REQUIRED',
      'message', 'この行は重複判断の対象状態ではありません。'
    );
  end if;

  if v_row.duplicate_of_row_id is null then
    return jsonb_build_object(
      'success', false,
      'code', 'DUPLICATE_SOURCE_NOT_FOUND',
      'message', '重複元行が設定されていません。'
    );
  end if;

  select *
    into v_source
    from public.submission_rows
   where id = v_row.duplicate_of_row_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'DUPLICATE_SOURCE_NOT_FOUND',
      'message', '重複元行が見つかりません。'
    );
  end if;

  v_next_duplicate_status := case
    when p_decision = 'separate' then 'unique'
    else v_row.duplicate_status
  end;
  v_next_import_status := case
    when p_decision = 'exclude' then 'skipped'
    else v_row.import_status
  end;

  select jsonb_build_object(
    'target', jsonb_build_object(
      'batch_id', target_batch.id,
      'batch_no', target_batch.batch_no,
      'batch_status', target_batch.status,
      'partner_id', target_batch.partner_id,
      'partner_name', target_partner.company_name,
      'target_month', target_batch.target_month,
      'row', to_jsonb(v_row)
    ),
    'source', jsonb_build_object(
      'batch_id', source_batch.id,
      'batch_no', source_batch.batch_no,
      'batch_status', source_batch.status,
      'partner_id', source_batch.partner_id,
      'partner_name', source_partner.company_name,
      'target_month', source_batch.target_month,
      'row', to_jsonb(v_source)
    )
  )
    into v_snapshot
    from public.submission_batches target_batch
    left join public.partners target_partner
      on target_partner.id = target_batch.partner_id
    join public.submission_batches source_batch
      on source_batch.id = v_source.batch_id
    left join public.partners source_partner
      on source_partner.id = source_batch.partner_id
   where target_batch.id = v_row.batch_id;

  if v_snapshot is null then
    return jsonb_build_object(
      'success', false,
      'code', 'DUPLICATE_SOURCE_NOT_FOUND',
      'message', '比較に必要な受付情報を取得できません。'
    );
  end if;

  begin
    update public.submission_rows
       set duplicate_status = v_next_duplicate_status,
           import_status = v_next_import_status,
           updated_at = v_now
     where id = p_row_id
       and batch_id = p_batch_id
       and duplicate_status = v_row.duplicate_status
       and import_status = v_row.import_status
    returning id into v_updated_row_id;
  exception when others then
    raise exception 'DUPLICATE_ROW_UPDATE_FAILED: %', sqlerrm
      using errcode = 'P0001';
  end;

  if v_updated_row_id is null then
    raise exception 'DUPLICATE_REVIEW_CONCURRENT_UPDATE'
      using errcode = 'P0001';
  end if;

  begin
    insert into public.submission_duplicate_reviews (
      batch_id,
      row_id,
      duplicate_of_row_id,
      decision,
      previous_duplicate_status,
      next_duplicate_status,
      previous_import_status,
      next_import_status,
      review_note,
      reviewed_by,
      reviewed_by_label,
      reviewed_at,
      review_snapshot
    ) values (
      p_batch_id,
      p_row_id,
      v_row.duplicate_of_row_id,
      p_decision,
      v_row.duplicate_status,
      v_next_duplicate_status,
      v_row.import_status,
      v_next_import_status,
      btrim(p_review_note),
      p_reviewed_by,
      btrim(p_reviewed_by_label),
      v_now,
      v_snapshot
    )
    returning id into v_review_id;
  exception
    when unique_violation then
      raise exception 'DUPLICATE_REVIEW_CONCURRENT_UPDATE'
        using errcode = 'P0001';
    when others then
      raise exception 'DUPLICATE_REVIEW_SAVE_FAILED: %', sqlerrm
        using errcode = 'P0001';
  end;

  return jsonb_build_object(
    'success', true,
    'review_id', v_review_id,
    'row_id', p_row_id,
    'batch_id', p_batch_id,
    'decision', p_decision,
    'previous_duplicate_status', v_row.duplicate_status,
    'next_duplicate_status', v_next_duplicate_status,
    'previous_import_status', v_row.import_status,
    'next_import_status', v_next_import_status,
    'duplicate_of_row_id', v_row.duplicate_of_row_id,
    'reviewed_at', v_now
  );
end;
$$;

alter function public.review_submission_duplicate(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text
) owner to postgres;

revoke all on function public.review_submission_duplicate(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text
) from public;

revoke all on function public.review_submission_duplicate(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text
) from anon;

revoke all on function public.review_submission_duplicate(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text
) from authenticated;

grant execute on function public.review_submission_duplicate(
  uuid,
  uuid,
  text,
  text,
  uuid,
  text
) to service_role;

commit;

-- ================================================================
-- 適用後確認（読み取り専用）
-- ================================================================

-- 1. テーブル、RLS、所有者
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  pg_get_userbyid(c.relowner) as table_owner
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n
  on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'submission_duplicate_reviews'
  and c.relkind = 'r';

-- 2. 列、型、NULL許可、DEFAULT
select
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'submission_duplicate_reviews'
order by ordinal_position;

-- 3. CHECK、外部キー、一意制約、主キー
select
  con.conname as constraint_name,
  case con.contype
    when 'p' then 'PRIMARY KEY'
    when 'u' then 'UNIQUE'
    when 'f' then 'FOREIGN KEY'
    when 'c' then 'CHECK'
    else con.contype::text
  end as constraint_type,
  pg_catalog.pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class rel
  on rel.oid = con.conrelid
join pg_catalog.pg_namespace n
  on n.oid = rel.relnamespace
where n.nspname = 'public'
  and rel.relname = 'submission_duplicate_reviews'
order by constraint_type, constraint_name;

-- 4. インデックス
select
  indexname,
  indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename = 'submission_duplicate_reviews'
order by indexname;

-- 5. RLSポリシー（0件であること。service_role以外はテーブル権限も剥奪済み）
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename = 'submission_duplicate_reviews'
order by policyname;

-- 6. テーブル権限（service_roleのSELECTだけが表示されること）
select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'submission_duplicate_reviews'
  and grantee in ('anon', 'authenticated', 'service_role')
order by grantee, privilege_type;

-- 7. 関数、引数、戻り値、SECURITY DEFINER、所有者、search_path
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  pg_catalog.pg_get_userbyid(p.proowner) as function_owner,
  p.proconfig as function_config
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'review_submission_duplicate';

-- 8. 関数実行権限（false, false, trueの順になること）
select
  pg_catalog.has_function_privilege(
    'anon',
    'public.review_submission_duplicate(uuid,uuid,text,text,uuid,text)',
    'EXECUTE'
  ) as anon_can_execute,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.review_submission_duplicate(uuid,uuid,text,text,uuid,text)',
    'EXECUTE'
  ) as authenticated_can_execute,
  pg_catalog.has_function_privilege(
    'service_role',
    'public.review_submission_duplicate(uuid,uuid,text,text,uuid,text)',
    'EXECUTE'
  ) as service_role_can_execute;

-- 9. 監査テーブル件数（初回適用直後は0件であること）
select count(*) as submission_duplicate_reviews_count
from public.submission_duplicate_reviews;

-- 10. 既存submission_rows件数（適用前確認値は5件）
select count(*) as submission_rows_count
from public.submission_rows;

-- 11. SUB-202607-000011の対象行が変更されていないこと
--     適用前確認値:
--       id = dc851dd7-7d66-41de-ad94-994b76b49715
--       duplicate_status = duplicate
--       import_status = pending
--       duplicate_of_row_id = 084fe8e9-20f4-405c-aff3-4e390ec6c505
select
  b.batch_no,
  b.status as batch_status,
  r.id as row_id,
  r.duplicate_status,
  r.import_status,
  r.duplicate_of_row_id,
  r.row_hash,
  r.updated_at
from public.submission_batches b
join public.submission_rows r
  on r.batch_id = b.id
where b.batch_no = 'SUB-202607-000011'
order by r.id;
