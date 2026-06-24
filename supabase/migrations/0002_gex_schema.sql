create table gex_snapshots (
  id               uuid default gen_random_uuid() primary key,
  snapshot_date    date not null,
  ticker           text not null,
  underlying_price numeric not null,
  net_gex          numeric,
  abs_gex          numeric,
  zero_gamma       numeric,
  call_wall        numeric,
  put_wall         numeric,
  regime           text,
  gex_by_strike    jsonb,
  put_call_ratio   numeric,
  iv_skew          numeric,
  created_at       timestamptz default now(),
  unique (snapshot_date, ticker)
);

create index on gex_snapshots (snapshot_date, abs_gex desc);
create index on gex_snapshots (snapshot_date, ticker);

alter table gex_snapshots enable row level security;

create policy "Public read gex_snapshots"
  on gex_snapshots for select using (true);
