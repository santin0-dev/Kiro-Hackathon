-- Shared demo configuration. Does not delete or overwrite patient records.
create table if not exists public.vitality_areas(
 name text primary key check(length(name) between 1 and 250),
 lat double precision not null check(lat between -90 and 90),
 lng double precision not null check(lng between -180 and 180),
 city text not null default '',province text not null default '',
 hospital_id text not null default 'demo-city-hospital' check(hospital_id='demo-city-hospital'),
 created_at timestamptz not null default now()
);
create unique index if not exists vitality_area_name_unique on public.vitality_areas(lower(name));
alter table public.vitality_areas enable row level security;
revoke all on public.vitality_areas from public,anon,authenticated;
grant select,insert on public.vitality_areas to service_role;
create table if not exists public.vitality_demo_accounts(
 email text primary key check(email=lower(email) and length(email) between 3 and 150),
 name text not null check(length(name) between 1 and 100),
 role text not null check(role in ('BHW','Doctor')),
 created_at timestamptz not null default now()
);
alter table public.vitality_demo_accounts enable row level security;
revoke all on public.vitality_demo_accounts from public,anon,authenticated;
grant select,insert on public.vitality_demo_accounts to service_role;
create table if not exists public.vitality_demo_sessions(
 token_hash text primary key check(length(token_hash)=64),
 email text not null references public.vitality_demo_accounts(email),
 expires_at timestamptz not null,created_at timestamptz not null default now()
);
create index if not exists vitality_demo_session_expiry on public.vitality_demo_sessions(expires_at);
alter table public.vitality_demo_sessions enable row level security;
revoke all on public.vitality_demo_sessions from public,anon,authenticated;
grant select,insert,delete on public.vitality_demo_sessions to service_role;
insert into public.vitality_demo_accounts(email,name,role) values
 ('bhw@demo.local','Demo BHW','BHW'),('hospital@demo.local','Demo Hospital','Doctor')
on conflict(email) do nothing;
insert into public.vitality_areas(name,lat,lng,city,province) values('Demo Mabini',14.6,121.01,'','') on conflict do nothing;
insert into public.vitality_areas(name,lat,lng,city,province) values('Demo Malaya',14.61,121.03,'','') on conflict do nothing;
insert into public.vitality_areas(name,lat,lng,city,province) values('Demo Pag-asa',14.62,121.005,'','') on conflict do nothing;
insert into public.vitality_areas(name,lat,lng,city,province) values('San Vicente, San Pedro, Laguna',14.345269463229437,121.04676213109938,'San Pedro','Laguna') on conflict do nothing;
