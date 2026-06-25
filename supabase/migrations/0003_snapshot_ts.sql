-- Store the actual wall-clock time the cron ran for each snapshot.
-- Unlike created_at (set once on INSERT), snapshot_ts is updated on every upsert
-- so client-side GEX re-computation uses the real asOf, not a hardcoded 9pm UTC.

alter table gex_snapshots
  add column if not exists snapshot_ts timestamptz;

-- Backfill existing rows so the column is never null in old data.
update gex_snapshots set snapshot_ts = created_at where snapshot_ts is null;
