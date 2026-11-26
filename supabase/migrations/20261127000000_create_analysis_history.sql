create table public.analysis_history (
  job_id text primary key,
  file_name text not null check (char_length(file_name) between 1 and 255),
  created_at timestamptz not null default now(),
  status text not null default 'in_progress' check (status in ('in_progress','completed','failed','cancelled')),
  result jsonb,
  source text,
  error text,
  updated_at timestamptz not null default now()
);
create index analysis_history_created_at_idx on public.analysis_history (created_at desc);
alter table public.analysis_history enable row level security;
revoke all on public.analysis_history from anon, authenticated;
grant select, insert, update on public.analysis_history to service_role;
