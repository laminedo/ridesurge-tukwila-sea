-- Driver-reported police sightings for the RideSurge police radar.
-- Applied to the Supabase project the app points at (see src/lib/police.ts).
-- Reports are anonymous: a rounded position and timestamps, nothing about who sent them.
create table public.police_reports (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null check (lat between 17 and 72),
  lng double precision not null check (lng between -180 and -64),
  confirmations integer not null default 1 check (confirmations >= 1),
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create index police_reports_last_seen_idx on public.police_reports (last_seen desc);
create index police_reports_position_idx on public.police_reports (lat, lng);

alter table public.police_reports enable row level security;

-- Anyone may read reports that are still fresh. Expired rows are invisible.
create policy "Active reports are readable"
  on public.police_reports
  for select
  to anon
  using (last_seen > now() - interval '45 minutes');

-- No direct writes: reports only arrive through report_police(), which validates and de-duplicates.
revoke all on public.police_reports from anon, authenticated;
grant select on public.police_reports to anon;

create function public.report_police(p_lat double precision, p_lng double precision)
returns public.police_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- About 100 m of precision: enough to place the sighting, not enough to pinpoint the reporter.
  v_lat double precision := round(p_lat::numeric, 3);
  v_lng double precision := round(p_lng::numeric, 3);
  v_row public.police_reports;
begin
  if p_lat is null or p_lng is null or p_lat not between 17 and 72 or p_lng not between -180 and -64 then
    raise exception 'Location is outside the supported area';
  end if;

  -- Flood guard for the whole service.
  if (select count(*) from public.police_reports where created_at > now() - interval '1 minute') >= 120 then
    raise exception 'Too many reports right now. Try again in a minute.';
  end if;

  -- A sighting within roughly 300 m of an active report confirms it instead of adding a duplicate.
  select * into v_row
    from public.police_reports r
   where r.last_seen > now() - interval '45 minutes'
     and abs(r.lat - v_lat) < 0.003
     and abs(r.lng - v_lng) < 0.004
   order by r.last_seen desc
   limit 1;

  if found then
    -- Repeated taps within a minute do not inflate the count.
    if v_row.last_seen < now() - interval '1 minute' then
      update public.police_reports r
         set confirmations = r.confirmations + 1, last_seen = now()
       where r.id = v_row.id
       returning * into v_row;
    end if;
    return v_row;
  end if;

  insert into public.police_reports (lat, lng) values (v_lat, v_lng) returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.report_police(double precision, double precision) from public;
grant execute on function public.report_police(double precision, double precision) to anon;

-- Expired reports are already invisible; this keeps the table small by deleting them a day later.
create extension if not exists pg_cron;
select cron.schedule(
  'purge-old-police-reports',
  '17 * * * *',
  $$delete from public.police_reports where last_seen < now() - interval '1 day'$$
);
