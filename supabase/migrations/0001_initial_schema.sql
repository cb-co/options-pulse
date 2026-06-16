-- Profiles: extends auth.users with subscription info
create table profiles (
  id uuid references auth.users(id) primary key,
  email text,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text not null default 'free',
  created_at timestamptz default now()
);

-- Watchlist items
create table watchlist_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) not null,
  ticker text not null,
  created_at timestamptz default now(),
  unique (user_id, ticker)
);

-- Raw daily option chain snapshots
create table option_snapshots (
  id uuid default gen_random_uuid() primary key,
  snapshot_date date not null,
  ticker text not null,
  contract_symbol text not null,
  expiration date not null,
  strike numeric not null,
  option_type text not null,
  volume integer,
  open_interest integer,
  implied_volatility numeric,
  last_price numeric,
  created_at timestamptz default now(),
  unique (snapshot_date, contract_symbol)
);

-- Computed daily digest per ticker
create table digests (
  id uuid default gen_random_uuid() primary key,
  digest_date date not null,
  ticker text not null,
  unusualness_score numeric,
  signals jsonb,
  narrative text,
  created_at timestamptz default now(),
  unique (digest_date, ticker)
);

-- Indexes
create index on option_snapshots (ticker, snapshot_date);
create index on digests (digest_date, unusualness_score desc);
create index on digests (digest_date, ticker);

-- RLS
alter table profiles enable row level security;
alter table watchlist_items enable row level security;
alter table option_snapshots enable row level security;
alter table digests enable row level security;

-- profiles: own row only
create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- watchlist_items: own rows only
create policy "Users can read own watchlist"
  on watchlist_items for select using (auth.uid() = user_id);
create policy "Users can insert own watchlist"
  on watchlist_items for insert with check (auth.uid() = user_id);
create policy "Users can delete own watchlist"
  on watchlist_items for delete using (auth.uid() = user_id);

-- option_snapshots and digests: public read, service-role write
create policy "Public read option_snapshots"
  on option_snapshots for select to anon using (true);
create policy "Public read digests"
  on digests for select to anon using (true);
