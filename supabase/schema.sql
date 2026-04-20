-- MilestonePay Supabase Schema
-- Run this in your Supabase SQL editor: supabase.com → project → SQL Editor

create table if not exists users (
  wallet text primary key,
  role   text not null check (role in ('client', 'freelancer')),
  created_at timestamptz default now()
);

create table if not exists projects (
  id               serial primary key,
  name             text not null,
  client_wallet    text not null,
  freelancer_wallet text not null,
  deadline         integer not null,
  tx_hash          text default '',
  created_at       timestamptz default now()
);

create table if not exists milestones (
  id                serial primary key,
  project_id        integer not null references projects(id) on delete cascade,
  name              text not null,
  description       text default '',
  amount            numeric(18,6) not null,
  status            text not null default 'created'
                      check (status in ('created','progress','review','revision','released','disputed')),
  review_expires_at timestamptz,
  proof_link        text default '',
  proof_file_url    text default '',
  rev_fee           integer default 0,
  rev_feedback      text default '',
  created_at        timestamptz default now()
);

create table if not exists timeline (
  id         serial primary key,
  project_id integer not null references projects(id) on delete cascade,
  dot        text not null check (dot in ('done','act')),
  time       text not null,
  text       text not null,
  created_at timestamptz default now()
);

-- Storage bucket for proof files
insert into storage.buckets (id, name, public)
values ('proof-files', 'proof-files', true)
on conflict (id) do nothing;

-- Permissive RLS (MVP — tighten per-wallet in production)
alter table users     enable row level security;
alter table projects  enable row level security;
alter table milestones enable row level security;
alter table timeline  enable row level security;

create policy "allow all" on users      for all using (true) with check (true);
create policy "allow all" on projects   for all using (true) with check (true);
create policy "allow all" on milestones for all using (true) with check (true);
create policy "allow all" on timeline   for all using (true) with check (true);

create policy "allow uploads" on storage.objects
  for all using (bucket_id = 'proof-files') with check (bucket_id = 'proof-files');
