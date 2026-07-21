begin;

-- Keep read-only baseline values in this SQL Editor session so the
-- verification queries after COMMIT can prove that existing data was unchanged.
do $$
begin
  perform set_config(
    'starwarranty.wfm_pre_submission_rows_count',
    (select count(*)::text from public.submission_rows),
    false
  );
  perform set_config(
    'starwarranty.wfm_pre_target_batch_status',
    coalesce((
      select b.status
        from public.submission_batches b
       where b.batch_no = 'SUB-202607-000011'
       limit 1
    ), '__MISSING__'),
    false
  );
  perform set_config(
    'starwarranty.wfm_pre_target_certificate_status',
    coalesce((
      select c.status
        from public.warranty_certificates c
       where c.certificate_no = 'SUB-202607-000011-W-0001'
       limit 1
    ), '__MISSING__'),
    false
  );
  perform set_config(
    'starwarranty.wfm_pre_target_fulfillment_event_count',
    (
      select count(*)::text
        from public.submission_events e
        join public.submission_batches b on b.id = e.batch_id
       where b.batch_no = 'SUB-202607-000011'
         and e.event_type = 'status_changed'
         and e.next_status in ('printed', 'mailed')
    ),
    false
  );
end;
$$;

-- Fail before creating anything if the referenced production key types differ
-- from the UUID foreign-key design used by this migration.
do $$
declare
  v_submission_batch_id_type text;
  v_warranty_certificate_id_type text;
  v_auth_user_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into v_submission_batch_id_type
    from pg_catalog.pg_attribute a
   where a.attrelid = 'public.submission_batches'::regclass
     and a.attname = 'id'
     and not a.attisdropped;

  select format_type(a.atttypid, a.atttypmod)
    into v_warranty_certificate_id_type
    from pg_catalog.pg_attribute a
   where a.attrelid = 'public.warranty_certificates'::regclass
     and a.attname = 'id'
     and not a.attisdropped;

  select format_type(a.atttypid, a.atttypmod)
    into v_auth_user_id_type
    from pg_catalog.pg_attribute a
   where a.attrelid = 'auth.users'::regclass
     and a.attname = 'id'
     and not a.attisdropped;

  if v_submission_batch_id_type is distinct from 'uuid'
     or v_warranty_certificate_id_type is distinct from 'uuid'
     or v_auth_user_id_type is distinct from 'uuid' then
    raise exception
      'WARRANTY_FULFILLMENT_SCHEMA_MISMATCH: expected UUID keys, got submission_batches.id=%, warranty_certificates.id=%, auth.users.id=%',
      v_submission_batch_id_type,
      v_warranty_certificate_id_type,
      v_auth_user_id_type;
  end if;
end;
$$;

create table if not exists public.warranty_certificate_fulfillments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.submission_batches(id) on delete restrict,
  certificate_id uuid not null references public.warranty_certificates(id) on delete restrict,
  print_status text not null default 'pending',
  printed_at timestamptz null,
  printed_by uuid null references auth.users(id) on delete restrict,
  printed_by_label text null,
  print_count integer not null default 0,
  print_note text null,
  mail_status text not null default 'pending',
  mailed_at timestamptz null,
  mailed_by uuid null references auth.users(id) on delete restrict,
  mailed_by_label text null,
  mail_method text null,
  tracking_number text null,
  recipient_name_snapshot text null,
  postal_code_snapshot text null,
  address_snapshot text null,
  mail_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warranty_certificate_fulfillments_certificate_id_key unique (certificate_id),
  constraint warranty_certificate_fulfillments_print_status_check
    check (print_status in ('pending', 'printed')),
  constraint warranty_certificate_fulfillments_mail_status_check
    check (mail_status in ('pending', 'mailed')),
  constraint warranty_certificate_fulfillments_print_count_check
    check (print_count >= 0),
  constraint warranty_certificate_fulfillments_mail_method_check
    check (
      mail_method is null
      or mail_method in (
        'regular_mail',
        'letter_pack_light',
        'letter_pack_plus',
        'yu_packet',
        'courier',
        'other'
      )
    ),
  constraint warranty_certificate_fulfillments_printed_fields_check
    check (
      print_status = 'pending'
      or (
        printed_at is not null
        and printed_by is not null
        and length(btrim(coalesce(printed_by_label, ''))) > 0
        and print_count > 0
      )
    ),
  constraint warranty_certificate_fulfillments_mailed_fields_check
    check (
      mail_status = 'pending'
      or (
        print_status = 'printed'
        and mailed_at is not null
        and mailed_by is not null
        and length(btrim(coalesce(mailed_by_label, ''))) > 0
        and mail_method is not null
        and length(btrim(coalesce(recipient_name_snapshot, ''))) > 0
        and length(btrim(coalesce(postal_code_snapshot, ''))) > 0
        and length(btrim(coalesce(address_snapshot, ''))) > 0
      )
    )
);

create index if not exists warranty_certificate_fulfillments_batch_id_idx
  on public.warranty_certificate_fulfillments(batch_id);

create index if not exists warranty_certificate_fulfillments_print_status_idx
  on public.warranty_certificate_fulfillments(print_status);

create index if not exists warranty_certificate_fulfillments_mail_status_idx
  on public.warranty_certificate_fulfillments(mail_status);

create table if not exists public.warranty_certificate_fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  fulfillment_id uuid not null references public.warranty_certificate_fulfillments(id) on delete restrict,
  batch_id uuid not null references public.submission_batches(id) on delete restrict,
  certificate_id uuid not null references public.warranty_certificates(id) on delete restrict,
  event_type text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_label text not null,
  note text null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint warranty_certificate_fulfillment_events_event_type_check
    check (event_type in ('printed', 'reprinted', 'mailed', 'remailed')),
  constraint warranty_certificate_fulfillment_events_actor_label_check
    check (length(btrim(actor_label)) > 0)
);

create index if not exists warranty_certificate_fulfillment_events_fulfillment_id_idx
  on public.warranty_certificate_fulfillment_events(fulfillment_id);

create index if not exists warranty_certificate_fulfillment_events_batch_id_idx
  on public.warranty_certificate_fulfillment_events(batch_id);

create index if not exists warranty_certificate_fulfillment_events_certificate_id_idx
  on public.warranty_certificate_fulfillment_events(certificate_id);

create index if not exists warranty_certificate_fulfillment_events_created_at_idx
  on public.warranty_certificate_fulfillment_events(created_at desc);

alter table public.warranty_certificate_fulfillments enable row level security;
alter table public.warranty_certificate_fulfillment_events enable row level security;

revoke all on table public.warranty_certificate_fulfillments from public;
revoke all on table public.warranty_certificate_fulfillments from anon;
revoke all on table public.warranty_certificate_fulfillments from authenticated;
revoke all on table public.warranty_certificate_fulfillments from service_role;
grant select, insert, update on table public.warranty_certificate_fulfillments to service_role;

revoke all on table public.warranty_certificate_fulfillment_events from public;
revoke all on table public.warranty_certificate_fulfillment_events from anon;
revoke all on table public.warranty_certificate_fulfillment_events from authenticated;
revoke all on table public.warranty_certificate_fulfillment_events from service_role;
grant select, insert on table public.warranty_certificate_fulfillment_events to service_role;

create or replace function public.mark_warranty_certificates_printed(
  p_batch_id uuid,
  p_certificate_ids uuid[],
  p_print_count integer,
  p_print_note text,
  p_actor_user_id uuid,
  p_actor_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.submission_batches%rowtype;
  v_now timestamptz := now();
  v_expected_ids uuid[];
  v_expected_numbers text[];
  v_expected_count integer := 0;
  v_updated_count integer := 0;
  v_event_count integer := 0;
  v_batch_update_count integer := 0;
  v_error_code text;
begin
  if p_batch_id is null then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_BATCH_NOT_FOUND', 'message', '受付情報が見つかりません。');
  end if;
  if p_certificate_ids is null or cardinality(p_certificate_ids) = 0 then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_CERTIFICATE_MISMATCH', 'message', '印刷確認する保証書を指定してください。');
  end if;
  if (select count(distinct value) from unnest(p_certificate_ids) as ids(value)) <> cardinality(p_certificate_ids) then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_CERTIFICATE_MISMATCH', 'message', '保証書IDが重複しています。');
  end if;
  if p_print_count is null or p_print_count < 1 then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_PRINT_COUNT_INVALID', 'message', '印刷枚数は1以上で指定してください。');
  end if;
  if p_actor_user_id is null or length(btrim(coalesce(p_actor_label, ''))) = 0 then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_AUDIT_FAILED', 'message', '印刷確認者を特定できません。');
  end if;

  select * into v_batch
    from public.submission_batches
   where id = p_batch_id
   for update;
  if not found then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_BATCH_NOT_FOUND', 'message', '受付情報が見つかりません。');
  end if;
  if v_batch.status = 'printed' then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_ALREADY_PRINTED', 'message', 'この受付はすでに印刷確認済みです。');
  end if;
  if v_batch.status <> 'warranty_created' then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_STATUS_CHANGED', 'message', '受付状態が変更されています。再読み込みしてください。');
  end if;

  select array_agg(c.id order by c.id), array_agg(c.certificate_no order by c.id), count(*)::integer
    into v_expected_ids, v_expected_numbers, v_expected_count
    from public.warranty_certificates c
   where c.certificate_no like v_batch.batch_no || '-W-%';
  if v_expected_count = 0 then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_CERTIFICATE_NOT_FOUND', 'message', '対象受付の保証書が見つかりません。');
  end if;
  if cardinality(p_certificate_ids) <> v_expected_count
     or exists (
       select 1 from unnest(p_certificate_ids) as ids(value)
        where not (value = any(v_expected_ids))
     ) then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_CERTIFICATE_MISMATCH', 'message', '確認された保証書が受付の対象一覧と一致しません。');
  end if;

  perform 1
    from public.warranty_certificates c
   where c.id = any(p_certificate_ids)
   order by c.id
   for update;

  insert into public.warranty_certificate_fulfillments (
    batch_id, certificate_id, print_status, mail_status
  )
  select p_batch_id, value, 'pending', 'pending'
    from unnest(p_certificate_ids) as ids(value)
  on conflict (certificate_id) do nothing;

  perform 1
    from public.warranty_certificate_fulfillments f
   where f.certificate_id = any(p_certificate_ids)
   order by f.certificate_id
   for update;

  if exists (
    select 1 from public.warranty_certificate_fulfillments f
     where f.certificate_id = any(p_certificate_ids)
       and f.batch_id <> p_batch_id
  ) then
    raise exception 'FULFILLMENT_CERTIFICATE_MISMATCH: 保証書と受付の関連が一致しません。' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.warranty_certificate_fulfillments f
     where f.certificate_id = any(p_certificate_ids)
       and f.print_status = 'printed'
  ) then
    raise exception 'FULFILLMENT_ALREADY_PRINTED: 印刷確認済みの保証書が含まれています。' using errcode = 'P0001';
  end if;

  update public.warranty_certificate_fulfillments
     set print_status = 'printed',
         printed_at = v_now,
         printed_by = p_actor_user_id,
         printed_by_label = btrim(p_actor_label),
         print_count = p_print_count,
         print_note = nullif(btrim(coalesce(p_print_note, '')), ''),
         updated_at = v_now
   where batch_id = p_batch_id
     and certificate_id = any(p_certificate_ids)
     and print_status = 'pending';
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_expected_count then
    raise exception 'FULFILLMENT_CONCURRENT_UPDATE: 印刷確認中にFulfillment情報が更新されました。' using errcode = 'P0001';
  end if;
  if exists (
    select 1
      from unnest(v_expected_ids) as expected(certificate_id)
      left join public.warranty_certificate_fulfillments f
        on f.batch_id = p_batch_id
       and f.certificate_id = expected.certificate_id
       and f.print_status = 'printed'
     where f.id is null
  ) then
    raise exception 'FULFILLMENT_NOT_ALL_PRINTED: 全保証書の印刷確認が完了していません。' using errcode = 'P0001';
  end if;

  begin
    insert into public.warranty_certificate_fulfillment_events (
      fulfillment_id, batch_id, certificate_id, event_type,
      actor_user_id, actor_label, note, snapshot, created_at
    )
    select
      f.id, f.batch_id, f.certificate_id, 'printed',
      p_actor_user_id, btrim(p_actor_label), f.print_note,
      jsonb_build_object(
        'certificate_no', c.certificate_no,
        'print_status', f.print_status,
        'printed_at', f.printed_at,
        'printed_by', f.printed_by,
        'printed_by_label', f.printed_by_label,
        'print_count', f.print_count,
        'print_note', f.print_note
      ),
      v_now
      from public.warranty_certificate_fulfillments f
      join public.warranty_certificates c on c.id = f.certificate_id
     where f.batch_id = p_batch_id
       and f.certificate_id = any(p_certificate_ids);
    get diagnostics v_event_count = row_count;
    if v_event_count <> v_expected_count then
      raise exception '印刷監査イベント件数が一致しません。';
    end if;
  exception when others then
    raise exception 'FULFILLMENT_AUDIT_FAILED: %', sqlerrm using errcode = 'P0001';
  end;

  update public.submission_batches
     set status = 'printed',
         reviewed_by = p_actor_user_id,
         reviewed_at = v_now,
         review_note = '全保証書の印刷確認が完了',
         updated_at = v_now
   where id = p_batch_id
     and status = 'warranty_created';
  get diagnostics v_batch_update_count = row_count;
  if v_batch_update_count <> 1 then
    raise exception 'FULFILLMENT_CONCURRENT_UPDATE: 受付状態が同時更新されました。' using errcode = 'P0001';
  end if;

  begin
    insert into public.submission_events (
      batch_id, event_type, actor_user_id, actor_label,
      previous_status, next_status, note, created_at
    ) values (
      p_batch_id, 'status_changed', p_actor_user_id, btrim(p_actor_label),
      'warranty_created', 'printed',
      format('全保証書の印刷確認が完了（%s件、各%s枚）', v_expected_count, p_print_count),
      v_now
    );
  exception when others then
    raise exception 'FULFILLMENT_AUDIT_FAILED: %', sqlerrm using errcode = 'P0001';
  end;

  return jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'previous_status', 'warranty_created',
    'next_status', 'printed',
    'certificate_count', v_expected_count,
    'certificate_ids', to_jsonb(v_expected_ids),
    'certificate_numbers', to_jsonb(v_expected_numbers),
    'processed_at', v_now
  );
exception when others then
  v_error_code := split_part(sqlerrm, ':', 1);
  return jsonb_build_object(
    'success', false,
    'code', v_error_code,
    'message', case
      when position(':' in sqlerrm) > 0 then btrim(substr(sqlerrm, position(':' in sqlerrm) + 1))
      else sqlerrm
    end
  );
end;
$$;

create or replace function public.mark_warranty_certificates_mailed(
  p_batch_id uuid,
  p_mail_items jsonb,
  p_mail_note text,
  p_actor_user_id uuid,
  p_actor_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.submission_batches%rowtype;
  v_now timestamptz := now();
  v_expected_ids uuid[];
  v_expected_numbers text[];
  v_requested_ids uuid[];
  v_expected_count integer := 0;
  v_updated_count integer := 0;
  v_event_count integer := 0;
  v_batch_update_count integer := 0;
  v_error_code text;
begin
  if p_batch_id is null then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_BATCH_NOT_FOUND', 'message', '受付情報が見つかりません。');
  end if;
  if p_mail_items is null
     or jsonb_typeof(p_mail_items) <> 'array'
     or jsonb_array_length(p_mail_items) = 0 then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_CERTIFICATE_MISMATCH', 'message', '郵送確認する保証書を指定してください。');
  end if;
  begin
    select array_agg(item.certificate_id order by item.certificate_id)
      into v_requested_ids
      from jsonb_to_recordset(p_mail_items) as item(
        certificate_id uuid,
        mail_method text,
        tracking_number text
      );
  exception when others then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_CERTIFICATE_MISMATCH', 'message', '保証書ごとの郵送情報が正しくありません。');
  end;
  if cardinality(v_requested_ids) <> jsonb_array_length(p_mail_items)
     or (select count(distinct value) from unnest(v_requested_ids) as ids(value)) <> cardinality(v_requested_ids) then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_CERTIFICATE_MISMATCH', 'message', '保証書IDが重複しています。');
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(p_mail_items) as item(
        certificate_id uuid,
        mail_method text,
        tracking_number text
      )
     where btrim(coalesce(item.mail_method, '')) not in (
       'regular_mail', 'letter_pack_light', 'letter_pack_plus',
       'yu_packet', 'courier', 'other'
     )
  ) then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_MAIL_METHOD_INVALID', 'message', '郵送方法が正しくありません。');
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(p_mail_items) as item(
        certificate_id uuid,
        mail_method text,
        tracking_number text
      )
     where btrim(coalesce(item.mail_method, '')) in (
       'letter_pack_light', 'letter_pack_plus', 'yu_packet', 'courier'
     )
       and length(btrim(coalesce(item.tracking_number, ''))) = 0
  ) then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_TRACKING_REQUIRED', 'message', '選択した郵送方法では追跡番号が必要です。');
  end if;
  if p_actor_user_id is null or length(btrim(coalesce(p_actor_label, ''))) = 0 then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_AUDIT_FAILED', 'message', '郵送担当者を特定できません。');
  end if;

  select * into v_batch
    from public.submission_batches
   where id = p_batch_id
   for update;
  if not found then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_BATCH_NOT_FOUND', 'message', '受付情報が見つかりません。');
  end if;
  if v_batch.status = 'mailed' then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_ALREADY_MAILED', 'message', 'この受付はすでに郵送済みです。');
  end if;
  if v_batch.status <> 'printed' then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_STATUS_CHANGED', 'message', '受付状態が変更されています。再読み込みしてください。');
  end if;

  select array_agg(c.id order by c.id), array_agg(c.certificate_no order by c.id), count(*)::integer
    into v_expected_ids, v_expected_numbers, v_expected_count
    from public.warranty_certificates c
   where c.certificate_no like v_batch.batch_no || '-W-%';
  if v_expected_count = 0 then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_CERTIFICATE_NOT_FOUND', 'message', '対象受付の保証書が見つかりません。');
  end if;
  if cardinality(v_requested_ids) <> v_expected_count
     or exists (
       select 1 from unnest(v_requested_ids) as ids(value)
        where not (value = any(v_expected_ids))
     ) then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_CERTIFICATE_MISMATCH', 'message', '確認された保証書が受付の対象一覧と一致しません。');
  end if;

  perform 1
    from public.warranty_certificates c
   where c.id = any(v_requested_ids)
   order by c.id
   for update;

  perform 1
    from public.warranty_certificate_fulfillments f
   where f.certificate_id = any(v_requested_ids)
   order by f.certificate_id
   for update;
  if (select count(*) from public.warranty_certificate_fulfillments f where f.batch_id = p_batch_id and f.certificate_id = any(v_requested_ids)) <> v_expected_count
     or exists (
       select 1 from public.warranty_certificate_fulfillments f
        where f.certificate_id = any(v_requested_ids)
          and (f.batch_id <> p_batch_id or f.print_status <> 'printed')
     ) then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_NOT_ALL_PRINTED', 'message', '全保証書の印刷確認が完了していません。');
  end if;
  if exists (
    select 1 from public.warranty_certificate_fulfillments f
     where f.certificate_id = any(v_requested_ids)
       and f.mail_status = 'mailed'
  ) then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_ALREADY_MAILED', 'message', '郵送済みの保証書が含まれています。');
  end if;
  if exists (
    select 1 from public.warranty_certificates c
     where c.id = any(v_requested_ids)
       and (
         length(btrim(coalesce(c.customer_name, ''))) = 0
         or length(btrim(coalesce(c.postal_code, ''))) = 0
         or length(btrim(concat_ws(' ', c.address1, c.address2, c.address3))) = 0
       )
  ) then
    return jsonb_build_object('success', false, 'code', 'FULFILLMENT_RECIPIENT_INCOMPLETE', 'message', '宛名・郵便番号・住所が不足している保証書があります。');
  end if;

  update public.warranty_certificate_fulfillments f
     set mail_status = 'mailed',
         mailed_at = v_now,
         mailed_by = p_actor_user_id,
         mailed_by_label = btrim(p_actor_label),
         mail_method = btrim(item.mail_method),
         tracking_number = nullif(btrim(coalesce(item.tracking_number, '')), ''),
         recipient_name_snapshot = c.customer_name,
         postal_code_snapshot = c.postal_code,
         address_snapshot = btrim(concat_ws(' ', c.address1, c.address2, c.address3)),
         mail_note = nullif(btrim(coalesce(p_mail_note, '')), ''),
         updated_at = v_now
    from public.warranty_certificates c
    join jsonb_to_recordset(p_mail_items) as item(
      certificate_id uuid,
      mail_method text,
      tracking_number text
    ) on item.certificate_id = c.id
   where f.batch_id = p_batch_id
     and f.certificate_id = c.id
     and f.certificate_id = any(v_requested_ids)
     and f.print_status = 'printed'
     and f.mail_status = 'pending';
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_expected_count then
    raise exception 'FULFILLMENT_CONCURRENT_UPDATE: 郵送確認中にFulfillment情報が更新されました。' using errcode = 'P0001';
  end if;
  if exists (
    select 1
      from unnest(v_expected_ids) as expected(certificate_id)
      left join public.warranty_certificate_fulfillments f
        on f.batch_id = p_batch_id
       and f.certificate_id = expected.certificate_id
       and f.mail_status = 'mailed'
     where f.id is null
  ) then
    raise exception 'FULFILLMENT_CONCURRENT_UPDATE: 全保証書の郵送確認が完了していません。' using errcode = 'P0001';
  end if;

  begin
    insert into public.warranty_certificate_fulfillment_events (
      fulfillment_id, batch_id, certificate_id, event_type,
      actor_user_id, actor_label, note, snapshot, created_at
    )
    select
      f.id, f.batch_id, f.certificate_id, 'mailed',
      p_actor_user_id, btrim(p_actor_label), f.mail_note,
      jsonb_build_object(
        'certificate_no', c.certificate_no,
        'mail_status', f.mail_status,
        'mailed_at', f.mailed_at,
        'mailed_by', f.mailed_by,
        'mailed_by_label', f.mailed_by_label,
        'mail_method', f.mail_method,
        'tracking_number', f.tracking_number,
        'recipient_name_snapshot', f.recipient_name_snapshot,
        'postal_code_snapshot', f.postal_code_snapshot,
        'address_snapshot', f.address_snapshot,
        'mail_note', f.mail_note
      ),
      v_now
      from public.warranty_certificate_fulfillments f
      join public.warranty_certificates c on c.id = f.certificate_id
     where f.batch_id = p_batch_id
       and f.certificate_id = any(v_requested_ids);
    get diagnostics v_event_count = row_count;
    if v_event_count <> v_expected_count then
      raise exception '郵送監査イベント件数が一致しません。';
    end if;
  exception when others then
    raise exception 'FULFILLMENT_AUDIT_FAILED: %', sqlerrm using errcode = 'P0001';
  end;

  update public.submission_batches
     set status = 'mailed',
         reviewed_by = p_actor_user_id,
         reviewed_at = v_now,
         review_note = '全保証書の郵送確認が完了',
         updated_at = v_now
   where id = p_batch_id
     and status = 'printed';
  get diagnostics v_batch_update_count = row_count;
  if v_batch_update_count <> 1 then
    raise exception 'FULFILLMENT_CONCURRENT_UPDATE: 受付状態が同時更新されました。' using errcode = 'P0001';
  end if;

  begin
    insert into public.submission_events (
      batch_id, event_type, actor_user_id, actor_label,
      previous_status, next_status, note, created_at
    ) values (
      p_batch_id, 'status_changed', p_actor_user_id, btrim(p_actor_label),
      'printed', 'mailed',
      format('全保証書の郵送確認が完了（%s件）', v_expected_count),
      v_now
    );
  exception when others then
    raise exception 'FULFILLMENT_AUDIT_FAILED: %', sqlerrm using errcode = 'P0001';
  end;

  return jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'previous_status', 'printed',
    'next_status', 'mailed',
    'certificate_count', v_expected_count,
    'certificate_ids', to_jsonb(v_expected_ids),
    'certificate_numbers', to_jsonb(v_expected_numbers),
    'processed_at', v_now
  );
exception when others then
  v_error_code := split_part(sqlerrm, ':', 1);
  return jsonb_build_object(
    'success', false,
    'code', v_error_code,
    'message', case
      when position(':' in sqlerrm) > 0 then btrim(substr(sqlerrm, position(':' in sqlerrm) + 1))
      else sqlerrm
    end
  );
end;
$$;

alter function public.mark_warranty_certificates_printed(uuid, uuid[], integer, text, uuid, text) owner to postgres;
alter function public.mark_warranty_certificates_mailed(uuid, jsonb, text, uuid, text) owner to postgres;

revoke all on function public.mark_warranty_certificates_printed(uuid, uuid[], integer, text, uuid, text) from public;
revoke all on function public.mark_warranty_certificates_printed(uuid, uuid[], integer, text, uuid, text) from anon;
revoke all on function public.mark_warranty_certificates_printed(uuid, uuid[], integer, text, uuid, text) from authenticated;
grant execute on function public.mark_warranty_certificates_printed(uuid, uuid[], integer, text, uuid, text) to service_role;

revoke all on function public.mark_warranty_certificates_mailed(uuid, jsonb, text, uuid, text) from public;
revoke all on function public.mark_warranty_certificates_mailed(uuid, jsonb, text, uuid, text) from anon;
revoke all on function public.mark_warranty_certificates_mailed(uuid, jsonb, text, uuid, text) from authenticated;
grant execute on function public.mark_warranty_certificates_mailed(uuid, jsonb, text, uuid, text) to service_role;

commit;

-- Read-only verification queries. These statements do not modify database data.

-- 1. Table existence and RLS state.
select
  c.relname as table_name,
  c.relkind = 'r' as exists_as_table,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'warranty_certificate_fulfillments',
    'warranty_certificate_fulfillment_events'
  )
order by c.relname;

-- 2. Every column, type, nullability, and default.
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_schema,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'warranty_certificate_fulfillments',
    'warranty_certificate_fulfillment_events'
  )
order by table_name, ordinal_position;

-- 3. Primary keys, foreign keys, CHECK constraints, and unique constraints.
select
  c.relname as table_name,
  con.conname as constraint_name,
  case con.contype
    when 'p' then 'PRIMARY KEY'
    when 'f' then 'FOREIGN KEY'
    when 'c' then 'CHECK'
    when 'u' then 'UNIQUE'
    else con.contype::text
  end as constraint_type,
  pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class c on c.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'warranty_certificate_fulfillments',
    'warranty_certificate_fulfillment_events'
  )
order by c.relname, constraint_type, con.conname;

-- 4. Indexes.
select tablename as table_name, indexname, indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename in (
    'warranty_certificate_fulfillments',
    'warranty_certificate_fulfillment_events'
  )
order by tablename, indexname;

-- 5. RLS policies. Zero rows is expected because browser roles receive no
-- table privileges and all access is through the authenticated server API.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in (
    'warranty_certificate_fulfillments',
    'warranty_certificate_fulfillment_events'
  )
order by tablename, policyname;

-- 6. Effective table privileges for application roles.
select
  roles.role_name,
  tables.table_name,
  privileges.privilege,
  has_table_privilege(
    roles.role_name,
    format('public.%I', tables.table_name),
    privileges.privilege
  ) as allowed
from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name)
cross join (
  values
    ('warranty_certificate_fulfillments'),
    ('warranty_certificate_fulfillment_events')
) as tables(table_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as privileges(privilege)
order by tables.table_name, roles.role_name, privileges.privilege;

-- 7. Function signature, owner, SECURITY DEFINER, return type, and search_path.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as result_type,
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,
  p.proconfig as function_settings
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'mark_warranty_certificates_printed',
    'mark_warranty_certificates_mailed'
  )
order by p.proname, identity_arguments;

-- 8. Effective RPC EXECUTE privileges. Expected: anon=false,
-- authenticated=false, service_role=true for both functions.
select
  roles.role_name,
  functions.function_name,
  has_function_privilege(
    roles.role_name,
    functions.function_oid,
    'EXECUTE'
  ) as execute_allowed
from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name)
cross join (
  values
    (
      'mark_warranty_certificates_printed',
      to_regprocedure(
        'public.mark_warranty_certificates_printed(uuid,uuid[],integer,text,uuid,text)'
      )
    ),
    (
      'mark_warranty_certificates_mailed',
      to_regprocedure(
        'public.mark_warranty_certificates_mailed(uuid,jsonb,text,uuid,text)'
      )
    )
) as functions(function_name, function_oid)
order by functions.function_name, roles.role_name;

-- 9. New tables must be empty immediately after the first application.
select
  (select count(*) from public.warranty_certificate_fulfillments)
    as fulfillment_count,
  (select count(*) from public.warranty_certificate_fulfillment_events)
    as fulfillment_event_count,
  (select count(*) from public.warranty_certificate_fulfillments) = 0
    as fulfillment_is_empty,
  (select count(*) from public.warranty_certificate_fulfillment_events) = 0
    as fulfillment_events_are_empty;

-- 10. Existing submission_rows count must equal the pre-migration baseline.
select
  current_setting(
    'starwarranty.wfm_pre_submission_rows_count',
    true
  )::bigint as before_count,
  count(*) as after_count,
  count(*) = current_setting(
    'starwarranty.wfm_pre_submission_rows_count',
    true
  )::bigint as unchanged
from public.submission_rows;

-- 11. Target batch and certificate must retain their pre-migration states.
select
  b.batch_no,
  current_setting(
    'starwarranty.wfm_pre_target_batch_status',
    true
  ) as batch_status_before,
  b.status as batch_status_after,
  b.status = current_setting(
    'starwarranty.wfm_pre_target_batch_status',
    true
  ) as batch_status_unchanged,
  b.status = 'warranty_created' as batch_is_warranty_created,
  c.certificate_no,
  current_setting(
    'starwarranty.wfm_pre_target_certificate_status',
    true
  ) as certificate_status_before,
  c.status as certificate_status_after,
  c.status = current_setting(
    'starwarranty.wfm_pre_target_certificate_status',
    true
  ) as certificate_status_unchanged,
  c.status = 'active' as certificate_is_active
from public.submission_batches b
join public.warranty_certificates c
  on c.certificate_no = b.batch_no || '-W-0001'
where b.batch_no = 'SUB-202607-000011';

-- 12. No printed/mailed workflow event may be added by this migration.
select
  current_setting(
    'starwarranty.wfm_pre_target_fulfillment_event_count',
    true
  )::bigint as before_count,
  count(*) as after_count,
  count(*) = current_setting(
    'starwarranty.wfm_pre_target_fulfillment_event_count',
    true
  )::bigint as unchanged
from public.submission_events e
join public.submission_batches b on b.id = e.batch_id
where b.batch_no = 'SUB-202607-000011'
  and e.event_type = 'status_changed'
  and e.next_status in ('printed', 'mailed');
