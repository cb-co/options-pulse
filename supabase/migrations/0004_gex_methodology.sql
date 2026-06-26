-- Track the expiry configuration used for each canonical cron snapshot.
-- Required so own-history percentile windows only compare apples-to-apples records
-- (snapshots computed with the same methodology, not a mix of N=4 vs N=6 vs 0DTE-only).
-- null = pre-migration rows, excluded from percentile windows by the history module.

alter table gex_snapshots
  add column if not exists methodology jsonb;
