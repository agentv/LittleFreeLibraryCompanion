-- LFL Steward Companion: initial schema.
-- Runs as the database owner. The API connects as role lfl_api, which is
-- subject to row-level security (backend R15). See docs/backend-requirements.md.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'lfl_api') then
    create role lfl_api nologin; -- ops grants LOGIN and a password per environment
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Request context. The API sets these per transaction with set_config(..., true).
-- ---------------------------------------------------------------------------

create or replace function app_member_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.member_id', true), '')::uuid
$$;

create or replace function app_device_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.device_id', true), '')::uuid
$$;

create or replace function app_device_time() returns timestamptz
language sql stable as $$
  select nullif(current_setting('app.device_time', true), '')::timestamptz
$$;

-- System operations (sign-up form, token refresh) that run before a member is known.
create or replace function app_is_system() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.system', true), '') = 'on'
$$;

-- ---------------------------------------------------------------------------
-- Members (R12, R13). id matches the Supabase Auth user id.
-- ---------------------------------------------------------------------------

create table members (
  id uuid primary key,
  email text not null unique,
  display_name text not null default '',
  role text not null default 'steward' check (role in ('steward', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function app_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where id = app_member_id() and role = 'admin' and status = 'active')
$$;

create or replace function app_is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where id = app_member_id() and status = 'active')
$$;

-- ---------------------------------------------------------------------------
-- Devices (R27 to R32, docs/device-trust.md).
-- ---------------------------------------------------------------------------

create table devices (
  id uuid primary key,
  member_id uuid not null references members(id),
  public_key text not null, -- SPKI DER, base64; ECDSA P-256
  platform text not null check (platform in ('ios', 'android')),
  model text,
  app_version text not null,
  attestation text not null check (attestation in ('passed', 'failed', 'unavailable')),
  status text not null check (status in ('pending', 'trusted', 'revoked')),
  registered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  trust_expires_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references members(id),
  updated_at timestamptz not null default now()
);
create index devices_member_idx on devices(member_id);

create table device_challenges (
  challenge text primary key,
  member_id uuid not null references members(id),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Synced tables (R1 to R5). Ids come from the phone. change_seq orders the
-- incremental pull (R3); updated_at is server-assigned (R4).
-- ---------------------------------------------------------------------------

create sequence sync_seq;

create table libraries (
  id uuid primary key,
  name text not null,
  charter_number text,
  description text,
  latitude double precision not null,
  longitude double precision not null,
  location_accuracy_m double precision,
  location_source text not null check (location_source in ('gps', 'last_known', 'manual_pin')),
  address_line text,
  city text,
  county text,
  region text,
  postal_code text,
  country text,
  address_source text check (address_source in ('typed', 'suggestion')),
  address_status text not null check (address_status in ('missing', 'confirmed')),
  cover_photo_id uuid,
  created_by uuid not null references members(id),
  created_on_device_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  change_seq bigint not null default 0
);

create table visits (
  id uuid primary key,
  library_id uuid not null references libraries(id),
  user_id uuid not null references members(id),
  visited_at timestamptz not null,
  latitude double precision,
  longitude double precision,
  location_accuracy_m double precision,
  location_source text check (location_source in ('gps', 'last_known', 'manual_pin')),
  position_mocked boolean,
  created_on_device_id uuid not null,
  stock_level text check (stock_level in ('empty', 'low', 'good', 'overflowing')),
  condition text check (condition in ('good', 'needs_cleaning', 'damaged')),
  door_ok boolean,
  items_removed boolean,
  -- Location sanity flags set by the server for admin review (R25).
  flag_far_from_library boolean not null default false,
  flag_low_accuracy boolean not null default false,
  flag_mocked boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  change_seq bigint not null default 0
);
create index visits_library_idx on visits(library_id);

create table comments (
  id uuid primary key,
  visit_id uuid not null references visits(id),
  user_id uuid not null references members(id),
  created_on_device_id uuid not null,
  body text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  change_seq bigint not null default 0
);

create table attachments (
  id uuid primary key,
  visit_id uuid not null references visits(id),
  comment_id uuid references comments(id),
  created_by uuid not null references members(id),
  created_on_device_id uuid not null,
  kind text not null check (kind in ('photo', 'audio')),
  role text check (role in ('shelf', 'establishing', 'location')),
  storage_path text,
  thumbnail_storage_path text,
  mime_type text not null,
  size_bytes bigint,
  width integer,
  height integer,
  duration_s double precision,
  caption text,
  sort_order integer not null default 0,
  captured_at timestamptz,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  change_seq bigint not null default 0,
  check (role is null or kind = 'photo')
);
-- At most one photo per role per visit.
create unique index attachments_role_per_visit on attachments(visit_id, role)
  where role is not null and deleted_at is null;

create index libraries_seq_idx on libraries(change_seq);
create index visits_seq_idx on visits(change_seq);
create index comments_seq_idx on comments(change_seq);
create index attachments_seq_idx on attachments(change_seq);

-- Writers to synced tables take one advisory lock, so change_seq order equals
-- commit order and an incremental pull can never skip a row. Traffic is small
-- (about 15 stewards), so serialising writes costs nothing noticeable.
create or replace function stamp_sync_row() returns trigger
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(727001);
  new.change_seq := nextval('sync_seq');
  new.updated_at := now();
  return new;
end
$$;

create trigger libraries_stamp before insert or update on libraries for each row execute function stamp_sync_row();
create trigger visits_stamp before insert or update on visits for each row execute function stamp_sync_row();
create trigger comments_stamp before insert or update on comments for each row execute function stamp_sync_row();
create trigger attachments_stamp before insert or update on attachments for each row execute function stamp_sync_row();

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end
$$;
create trigger members_touch before update on members for each row execute function touch_updated_at();
create trigger devices_touch before update on devices for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Review queue: address conflicts and inputs held from untrusted devices.
-- ---------------------------------------------------------------------------

create table review_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('address_conflict', 'held_change')),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  table_name text not null check (table_name in ('libraries', 'visits', 'comments', 'attachments')),
  record_id uuid not null,
  member_id uuid not null references members(id),
  device_id uuid,
  reason text not null,
  payload jsonb not null, -- what was submitted
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references members(id),
  resolution_note text
);
-- One open item per kind and record: a resubmission replaces the payload.
create unique index review_items_open_unique on review_items(kind, table_name, record_id) where status = 'open';
create trigger review_items_touch before update on review_items for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Change history (R21): append-only, written only by these triggers.
-- ---------------------------------------------------------------------------

create table change_history (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('create', 'update', 'delete')),
  changed_by uuid,
  device_id uuid,
  changed_at timestamptz not null default now(),
  device_time timestamptz,
  changes jsonb not null default '{}'::jsonb
);
create index change_history_record_idx on change_history(table_name, record_id, changed_at);

create or replace function record_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_j jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  new_j jsonb := to_jsonb(new);
  diff jsonb := '{}'::jsonb;
  k text;
  act text := 'create';
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_j) loop
      if k in ('change_seq', 'updated_at', 'last_seen_at') then continue; end if;
      if (old_j -> k) is distinct from (new_j -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_object('before', old_j -> k, 'after', new_j -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then return new; end if;
    act := 'update';
    if (old_j ->> 'deleted_at') is null and (new_j ->> 'deleted_at') is not null then
      act := 'delete';
    end if;
  end if;
  insert into change_history (table_name, record_id, action, changed_by, device_id, device_time, changes)
  values (tg_table_name, (new_j ->> 'id')::uuid, act, app_member_id(), app_device_id(), app_device_time(), diff);
  return new;
end
$$;

create trigger libraries_history after insert or update on libraries for each row execute function record_change();
create trigger visits_history after insert or update on visits for each row execute function record_change();
create trigger comments_history after insert or update on comments for each row execute function record_change();
create trigger attachments_history after insert or update on attachments for each row execute function record_change();
create trigger members_history after insert or update on members for each row execute function record_change();
create trigger devices_history after insert or update on devices for each row execute function record_change();

-- ---------------------------------------------------------------------------
-- Row-level security for lfl_api (R6, R14, R15). The service also checks
-- these rules itself to give clear rejection reasons; RLS is the backstop.
-- No DELETE is granted anywhere: deletes are soft (R5).
-- ---------------------------------------------------------------------------

grant usage on schema public to lfl_api;
grant usage on sequence sync_seq to lfl_api;
grant select, insert, update on members, devices, device_challenges, libraries, visits, comments, attachments, review_items to lfl_api;
grant select on change_history to lfl_api;
grant execute on function app_member_id(), app_device_id(), app_device_time(), app_is_system(), app_is_admin(), app_is_active() to lfl_api;

alter table members enable row level security;
alter table devices enable row level security;
alter table device_challenges enable row level security;
alter table libraries enable row level security;
alter table visits enable row level security;
alter table comments enable row level security;
alter table attachments enable row level security;
alter table review_items enable row level security;
alter table change_history enable row level security;

-- Members: you see yourself; admins see everyone. New rows only as pending stewards.
create policy members_select on members for select using (id = app_member_id() or app_is_admin() or app_is_system());
create policy members_insert on members for insert with check (
  (app_is_system() or id = app_member_id()) and role = 'steward' and status = 'pending');
create policy members_update on members for update using (app_is_admin() or app_is_system());

-- Devices: yours, or any for admins.
create policy devices_select on devices for select using (member_id = app_member_id() or app_is_admin() or app_is_system());
create policy devices_insert on devices for insert with check (member_id = app_member_id());
create policy devices_update on devices for update using (member_id = app_member_id() or app_is_admin() or app_is_system());

create policy challenges_all on device_challenges for all
  using (member_id = app_member_id()) with check (member_id = app_member_id());

-- Synced data: everyone signed in reads everything; active members create
-- their own rows; you update what you created, admins update anything.
create policy libraries_select on libraries for select using (app_member_id() is not null);
create policy libraries_insert on libraries for insert with check (app_is_active() and created_by = app_member_id());
create policy libraries_update on libraries for update using (app_is_active() and (created_by = app_member_id() or app_is_admin()));

create policy visits_select on visits for select using (app_member_id() is not null);
create policy visits_insert on visits for insert with check (app_is_active() and user_id = app_member_id());
create policy visits_update on visits for update using (app_is_active() and (user_id = app_member_id() or app_is_admin()));

create policy comments_select on comments for select using (app_member_id() is not null);
create policy comments_insert on comments for insert with check (app_is_active() and user_id = app_member_id());
create policy comments_update on comments for update using (app_is_active() and (user_id = app_member_id() or app_is_admin()));

create policy attachments_select on attachments for select using (app_member_id() is not null);
create policy attachments_insert on attachments for insert with check (app_is_active() and created_by = app_member_id());
create policy attachments_update on attachments for update using (app_is_active() and (created_by = app_member_id() or app_is_admin()));

-- Review queue: anyone signed in can file an item about their own submission;
-- only admins read or resolve.
create policy review_select on review_items for select using (app_is_admin() or member_id = app_member_id());
create policy review_insert on review_items for insert with check (member_id = app_member_id());
create policy review_update on review_items for update using (app_is_admin() or member_id = app_member_id());

-- History: admins only (decided default; see backend-requirements Q4).
create policy history_select on change_history for select using (app_is_admin());
