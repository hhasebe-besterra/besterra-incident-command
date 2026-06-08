-- ============================================================
-- BESTERRA // INCIDENT COMMAND  —  Supabase スキーマ
-- ITIL 4 / HDI 準拠の社内ITサービスデスク
-- Supabase の SQL Editor に貼り付けて実行（1回）
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- プロフィール（ロール: admin / operator / auditor） ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null,
  display_name text not null,
  role         text not null default 'operator'
);

-- ---------- チケット（インシデント / サービス要求 / 問題） ----------
create table if not exists public.incidents (
  id          bigint generated always as identity primary key,
  code        text unique not null,
  type        text not null default 'incident',
  title       text not null,
  description text,
  category    text not null default 'OTHER',
  impact      text not null default 'M',
  urgency     text not null default 'M',
  priority    text not null default 'P3',
  status      text not null default 'NEW',
  channel     text,
  affected    text,
  reporter    text,
  assignee    text,
  fcr         boolean not null default false,
  csat        int,
  workaround  text,
  root_cause  text,
  known_error boolean not null default false,
  linked      text,
  created_by  text not null,
  received_at timestamptz,
  due_date    date,
  notify      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.events (
  id          bigint generated always as identity primary key,
  incident_id bigint not null references public.incidents(id) on delete cascade,
  author      text not null,
  kind        text not null,
  body        text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_inc_status  on public.incidents(status);
create index if not exists idx_inc_type    on public.incidents(type);
create index if not exists idx_inc_created on public.incidents(created_at);
create index if not exists idx_evt_inc     on public.events(incident_id);

-- ---------- コード採番 INC/REQ/IDEA/OTH-YYYY-NNNN ----------
create or replace function public.next_code(p_type text)
returns text language plpgsql as $$
declare
  pfx text := case p_type when 'request' then 'REQ' when 'problem' then 'IDEA' when 'other' then 'OTH' else 'INC' end
              || '-' || to_char(now() at time zone 'Asia/Tokyo','YYYY') || '-';
  n int;
begin
  select coalesce(max( (regexp_replace(code,'^.*-(\d+)$','\1'))::int ), 0) + 1
    into n from public.incidents where code like pfx || '%';
  return pfx || lpad(n::text, 4, '0');
end $$;

-- 作成時にコード・作成者・updated_at を自動設定
create or replace function public.incidents_before_insert()
returns trigger language plpgsql security definer as $$
declare disp text;
begin
  if new.code is null or new.code = '' then new.code := public.next_code(new.type); end if;
  select display_name into disp from public.profiles where id = auth.uid();
  new.created_by := coalesce(disp, new.created_by, 'unknown');
  new.created_at := now(); new.updated_at := now();
  if new.status in ('RESOLVED','CLOSED','CANCELLED') then new.resolved_at := now(); end if;
  return new;
end $$;
drop trigger if exists trg_inc_bi on public.incidents;
create trigger trg_inc_bi before insert on public.incidents
  for each row execute function public.incidents_before_insert();

create or replace function public.incidents_before_update()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status in ('RESOLVED','CLOSED','CANCELLED') and old.resolved_at is null then new.resolved_at := now();
  elsif new.status not in ('RESOLVED','CLOSED','CANCELLED') then new.resolved_at := null; end if;
  return new;
end $$;
drop trigger if exists trg_inc_bu on public.incidents;
create trigger trg_inc_bu before update on public.incidents
  for each row execute function public.incidents_before_update();

-- ---------- 権限判定ヘルパ ----------
create or replace function public.is_writer()
returns boolean language sql stable security definer as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('admin','operator'));
$$;

-- ---------- RLS ----------
alter table public.profiles  enable row level security;
alter table public.incidents enable row level security;
alter table public.events    enable row level security;

-- profiles: ログインユーザは全員分を閲覧可（表示名・ロール参照のため）
drop policy if exists p_profiles_read on public.profiles;
create policy p_profiles_read on public.profiles for select to authenticated using (true);

-- incidents: 閲覧=認証済全員 / 追加・更新・削除=writer のみ
drop policy if exists p_inc_read   on public.incidents;
drop policy if exists p_inc_insert on public.incidents;
drop policy if exists p_inc_update on public.incidents;
drop policy if exists p_inc_delete on public.incidents;
create policy p_inc_read   on public.incidents for select to authenticated using (true);
create policy p_inc_insert on public.incidents for insert to authenticated with check (public.is_writer());
create policy p_inc_update on public.incidents for update to authenticated using (public.is_writer()) with check (public.is_writer());
create policy p_inc_delete on public.incidents for delete to authenticated using (public.is_writer());

-- events: 閲覧=認証済全員 / 追加=writer のみ
drop policy if exists p_evt_read   on public.events;
drop policy if exists p_evt_insert on public.events;
create policy p_evt_read   on public.events for select to authenticated using (true);
create policy p_evt_insert on public.events for insert to authenticated with check (public.is_writer());

-- ============================================================
-- 9アカウント作成（email = ID@besterra.co.jp / 初期PW = besterra）
--   ※メール確認はスキップ（email_confirmed_at = now）
-- ============================================================
do $$
declare
  u record;
  uid uuid;
  arr jsonb := '[
    {"un":"h.hasebe","dn":"長谷部","role":"admin"},
    {"un":"h.murano","dn":"村野","role":"operator"},
    {"un":"m.takeuchi","dn":"竹内","role":"operator"},
    {"un":"c.kato","dn":"加藤","role":"operator"},
    {"un":"yhonda","dn":"本田","role":"auditor"},
    {"un":"cho","dn":"長","role":"auditor"},
    {"un":"s.ikeda","dn":"池田","role":"auditor"},
    {"un":"h.miyauchi","dn":"宮内","role":"auditor"},
    {"un":"k.kido","dn":"木戸","role":"auditor"}
  ]'::jsonb;
  rec jsonb;
  em text;
begin
  for rec in select * from jsonb_array_elements(arr) loop
    em := (rec->>'un') || '@besterra.co.jp';
    -- 既存ならスキップ
    select id into uid from auth.users where email = em;
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users
        (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at,
         raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
         email_change_token_new, email_change)
      values
        ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
         crypt('besterra', gen_salt('bf')),
         now(), now(), now(),
         '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');
      insert into auth.identities
        (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values
        (uid::text, uid, json_build_object('sub', uid::text, 'email', em)::jsonb, 'email', now(), now(), now());
    end if;
    insert into public.profiles (id, username, display_name, role)
    values (uid, rec->>'un', rec->>'dn', rec->>'role')
    on conflict (username) do update set display_name = excluded.display_name, role = excluded.role;
  end loop;
end $$;
