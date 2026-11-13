-- The NFC staff flow (StaffTables.tsx, resolve-tag, delete-account) uses the private
-- `pending-receipts` bucket, but no earlier migration creates it: Lovable made it outside
-- the migration files. Create it here so a fresh project built from the repo has it.
-- Idempotent: does nothing on a database that already has the bucket.
INSERT INTO storage.buckets (id, name, public)
VALUES ('pending-receipts', 'pending-receipts', false)
ON CONFLICT (id) DO NOTHING;
