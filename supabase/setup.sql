-- Run once in the Supabase SQL Editor. Dedicated fictional-demo tables only.
create table if not exists public.vitality_cases (
  id text primary key,
  payload jsonb not null check (payload->>'id' = id),
  version integer not null default 1 check (version > 0),
  status text not null check (status in ('awaiting_review','active','completed','declined')),
  appointment_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.vitality_cases enable row level security;
revoke all on public.vitality_cases from anon, authenticated;
grant select, insert, update on public.vitality_cases to service_role;
create unique index if not exists vitality_slot_unique
  on public.vitality_cases (appointment_at)
  where appointment_at is not null and status in ('active','completed');

create or replace function public.vitality_save_case(p_id text, p_payload jsonb, p_expected integer)
returns setof public.vitality_cases language plpgsql security invoker
set search_path = '' as $$
declare v_at timestamptz;
begin
  if p_payload->>'id' is distinct from p_id then raise exception 'Invalid case ID'; end if;
  if p_payload->>'status' in ('active','completed') then
    v_at := (p_payload->'plan'->>'due')::timestamptz;
  end if;
  if p_expected is null then
    return query insert into public.vitality_cases(id,payload,status,appointment_at)
      values(p_id,p_payload,p_payload->>'status',v_at) returning *;
  else
    return query update public.vitality_cases
      set payload=p_payload, status=p_payload->>'status', appointment_at=v_at,
          version=version+1, updated_at=now()
      where id=p_id and version=p_expected returning *;
  end if;
end $$;
revoke all on function public.vitality_save_case(text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.vitality_save_case(text,jsonb,integer) to service_role;

create table if not exists public.vitality_sms (
  id text primary key,
  case_id text not null references public.vitality_cases(id),
  state text not null check (state in ('pending','accepted','unknown')),
  message_id text,
  created_at timestamptz not null default now()
);
alter table public.vitality_sms enable row level security;
revoke all on public.vitality_sms from anon, authenticated;
grant select, insert, update on public.vitality_sms to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('vitality-documents','vitality-documents',false,500000,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do nothing;
-- No public Storage policies: server secret alone accesses this private bucket.
