-- Stores only aggregate counters needed to enforce the family OCR limit.
-- It never stores an image, OCR output, email address, or auth token.
create table if not exists public.ocr_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create table if not exists public.ocr_usage_minute (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, window_start)
);

alter table public.ocr_usage_daily enable row level security;
alter table public.ocr_usage_minute enable row level security;

-- The function is called with the service-role connection inside the Edge Function.
-- No client policy is created, so a signed-in browser cannot read or alter counters.
create or replace function public.consume_ocr_quota(
  p_user_id uuid,
  p_daily_limit integer,
  p_minute_limit integer
)
returns table (allowed boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  daily_count integer;
  minute_count integer;
  minute_window timestamptz := date_trunc('minute', now());
begin
  if p_daily_limit < 1 or p_minute_limit < 1 then
    raise exception 'quota configuration must be positive';
  end if;

  insert into ocr_usage_daily (user_id, usage_date, request_count)
  values (p_user_id, current_date, 0)
  on conflict (user_id, usage_date) do nothing;
  insert into ocr_usage_minute (user_id, window_start, request_count)
  values (p_user_id, minute_window, 0)
  on conflict (user_id, window_start) do nothing;

  select request_count into daily_count from ocr_usage_daily
    where user_id = p_user_id and usage_date = current_date for update;
  select request_count into minute_count from ocr_usage_minute
    where user_id = p_user_id and window_start = minute_window for update;

  if daily_count >= p_daily_limit then return query select false, 'daily_limit'; return; end if;
  if minute_count >= p_minute_limit then return query select false, 'minute_limit'; return; end if;

  update ocr_usage_daily set request_count = request_count + 1, updated_at = now()
    where user_id = p_user_id and usage_date = current_date;
  update ocr_usage_minute set request_count = request_count + 1
    where user_id = p_user_id and window_start = minute_window;
  return query select true, null::text;
end;
$$;

revoke all on function public.consume_ocr_quota(uuid, integer, integer) from public;
grant execute on function public.consume_ocr_quota(uuid, integer, integer) to service_role;

