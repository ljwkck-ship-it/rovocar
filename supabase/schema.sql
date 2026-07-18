-- RoVoCar: Supabase SQL Editor에서 한 번 실행합니다.
create table if not exists public.decks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  order_index integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.words (
  id text primary key,
  deck_id text not null references public.decks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  english text not null check (char_length(english) between 1 and 200),
  korean text not null check (char_length(korean) between 1 and 500),
  attempts integer not null default 0 check (attempts >= 0),
  correct integer not null default 0 check (correct >= 0 and correct <= attempts),
  order_index integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.words add column if not exists registry_no integer;

create table if not exists public.vocabulary_registry (
  user_id uuid not null references auth.users(id) on delete cascade,
  english_normalized text not null,
  registry_no integer not null check (registry_no > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, english_normalized),
  unique (user_id, registry_no)
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'RoVoCar 사용자',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visit_count integer not null default 1 check (visit_count > 0)
);

-- 관리자 UUID는 SQL Editor에서만 등록합니다. 클라이언트에는 쓰기 정책이 없습니다.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists decks_user_id_idx on public.decks(user_id);
create index if not exists words_user_id_idx on public.words(user_id);
create index if not exists words_deck_id_idx on public.words(deck_id);
create index if not exists vocabulary_registry_user_idx on public.vocabulary_registry(user_id);

alter table public.decks enable row level security;
alter table public.words enable row level security;
alter table public.vocabulary_registry enable row level security;
alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "decks_select_own" on public.decks;
drop policy if exists "decks_insert_own" on public.decks;
drop policy if exists "decks_update_own" on public.decks;
drop policy if exists "decks_delete_own" on public.decks;
create policy "decks_select_own" on public.decks for select to authenticated using ((select auth.uid()) = user_id);
create policy "decks_insert_own" on public.decks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "decks_update_own" on public.decks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "decks_delete_own" on public.decks for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "words_select_own" on public.words;
drop policy if exists "words_insert_own" on public.words;
drop policy if exists "words_update_own" on public.words;
drop policy if exists "words_delete_own" on public.words;
create policy "words_select_own" on public.words for select to authenticated using ((select auth.uid()) = user_id);
create policy "words_insert_own" on public.words for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "words_update_own" on public.words for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "words_delete_own" on public.words for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "registry_select_own" on public.vocabulary_registry;
drop policy if exists "registry_insert_own" on public.vocabulary_registry;
create policy "registry_select_own" on public.vocabulary_registry for select to authenticated using ((select auth.uid()) = user_id);
create policy "registry_insert_own" on public.vocabulary_registry for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 전체 단어장을 한 트랜잭션으로 저장하여 오프라인 재동기화 중 부분 손실을 막습니다.
create or replace function public.replace_user_data(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  deck_item jsonb;
  word_item jsonb;
  registry_item record;
  assigned_registry_no integer;
  deck_position integer := 0;
  word_position integer;
begin
  if owner_id is null then raise exception '로그인이 필요합니다.'; end if;
  if jsonb_typeof(payload->'decks') <> 'array' then raise exception '잘못된 단어장 데이터입니다.'; end if;

  for registry_item in
    select key as english_normalized, value::text::integer as registry_no
    from jsonb_each(payload->'registry')
  loop
    -- 이미 다른 단어가 같은 순번을 사용한다면 기존 번호를 보존하고 다음 빈 번호를 배정합니다.
    if not exists (
      select 1 from public.vocabulary_registry
      where user_id=owner_id and english_normalized=registry_item.english_normalized
    ) and exists (
      select 1 from public.vocabulary_registry
      where user_id=owner_id and registry_no=registry_item.registry_no
    ) then
      select coalesce(max(registry_no),0)+1 into assigned_registry_no
      from public.vocabulary_registry where user_id=owner_id;
    else
      assigned_registry_no := registry_item.registry_no;
    end if;
    insert into public.vocabulary_registry(user_id,english_normalized,registry_no)
    values(owner_id,registry_item.english_normalized,assigned_registry_no)
    on conflict (user_id,english_normalized) do nothing;
  end loop;

  delete from public.words where user_id = owner_id;
  delete from public.decks where user_id = owner_id;

  for deck_item in select value from jsonb_array_elements(payload->'decks')
  loop
    insert into public.decks(id,user_id,name,created_at,order_index,updated_at)
    values (
      deck_item->>'id', owner_id, deck_item->>'name',
      coalesce((deck_item->>'createdAt')::timestamptz,now()), deck_position, now()
    );
    word_position := 0;
    for word_item in select value from jsonb_array_elements(coalesce(deck_item->'words','[]'::jsonb))
    loop
      select registry_no into assigned_registry_no from public.vocabulary_registry
      where user_id=owner_id and english_normalized=lower(trim(word_item->>'english'));
      insert into public.words(id,deck_id,user_id,english,korean,attempts,correct,registry_no,order_index,updated_at)
      values (
        word_item->>'id', deck_item->>'id', owner_id,
        word_item->>'english', word_item->>'korean',
        greatest(coalesce((word_item->>'attempts')::integer,0),0),
        greatest(coalesce((word_item->>'correct')::integer,0),0),
        assigned_registry_no, word_position, now()
      );
      word_position := word_position + 1;
    end loop;
    deck_position := deck_position + 1;
  end loop;
end;
$$;

revoke execute on function public.replace_user_data(jsonb) from public, anon;
grant execute on function public.replace_user_data(jsonb) to authenticated;

create or replace function public.record_visit(display_name_input text)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  insert into public.profiles(user_id,display_name)
  values(auth.uid(),left(coalesce(nullif(trim(display_name_input),''),'RoVoCar 사용자'),80))
  on conflict(user_id) do update set
    display_name=excluded.display_name,
    last_seen_at=now(),
    visit_count=public.profiles.visit_count+1;
end; $$;
revoke execute on function public.record_visit(text) from public,anon;
grant execute on function public.record_visit(text) to authenticated;

create or replace function public.is_rovocar_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.admin_users where user_id=auth.uid());
$$;
revoke execute on function public.is_rovocar_admin() from public,anon;
grant execute on function public.is_rovocar_admin() to authenticated;

create or replace function public.admin_user_overview()
returns table(user_id uuid,display_name text,first_seen_at timestamptz,last_seen_at timestamptz,visit_count integer,deck_count bigint,unique_word_count bigint,total_attempts bigint)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_rovocar_admin() then raise exception '관리자 권한이 없습니다.'; end if;
  return query select p.user_id,p.display_name,p.first_seen_at,p.last_seen_at,p.visit_count,
    (select count(*) from public.decks d where d.user_id=p.user_id),
    (select count(*) from public.vocabulary_registry r where r.user_id=p.user_id),
    (select coalesce(sum(w.attempts),0) from public.words w where w.user_id=p.user_id)
  from public.profiles p order by p.last_seen_at desc;
end; $$;
revoke execute on function public.admin_user_overview() from public,anon;
grant execute on function public.admin_user_overview() to authenticated;

create or replace function public.admin_deck_overview(target_user_id uuid)
returns table(id text,name text,word_count bigint,total_attempts bigint,updated_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_rovocar_admin() then raise exception '관리자 권한이 없습니다.'; end if;
  return query select d.id,d.name,count(w.id),coalesce(sum(w.attempts),0),greatest(d.updated_at,coalesce(max(w.updated_at),d.updated_at))
  from public.decks d left join public.words w on w.deck_id=d.id
  where d.user_id=target_user_id group by d.id,d.name,d.updated_at order by d.created_at desc;
end; $$;
revoke execute on function public.admin_deck_overview(uuid) from public,anon;
grant execute on function public.admin_deck_overview(uuid) to authenticated;

-- 첫 관리자가 로그인한 뒤 Auth > Users에서 UUID를 확인하고 SQL Editor에서 실행:
-- insert into public.admin_users(user_id) values ('관리자-사용자-UUID');
