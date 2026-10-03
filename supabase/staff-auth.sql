create table if not exists public.vitality_staff(
 auth_user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null unique check(email=lower(email)),
 name text not null check(length(name) between 1 and 100),
 role text not null check(role in ('BHW','Doctor')),
 approved boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.vitality_staff enable row level security;
revoke all on public.vitality_staff from public,anon,authenticated;
grant select,insert,update on public.vitality_staff to service_role;
-- Approval is an administrator action; signup cannot set approved=true.
