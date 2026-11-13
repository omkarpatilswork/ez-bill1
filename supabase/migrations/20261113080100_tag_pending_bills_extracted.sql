-- NFC Airdrop: the bill photo is now read once, when staff send it (they are signed in),
-- and the result is stored here. resolve-tag returns it to the guest who taps, so the
-- claim page no longer calls extract-receipt before sign-in, and extract-receipt can
-- require a signed-in user. Null until the read finishes, or if it failed.
ALTER TABLE public.tag_pending_bills ADD COLUMN IF NOT EXISTS extracted jsonb;
