-- ILP fulfillment data can be 32KiB, plus the ILP packet envelope, encoded in
-- Base64 (33% overhead). 64KiB should be safe.

ALTER TABLE "L_FULFILLMENTS"
  ADD COLUMN "FULFILLMENT_DATA" CHARACTER VARYING(65535) NULL;

-- Memos may contain ILP packets which can be slightly larger than 33KiB,
-- encoded in Base64.
ALTER TABLE "L_TRANSFER_ADJUSTMENTS"
  ALTER COLUMN "MEMO" TYPE VARCHAR(65535),
  ALTER COLUMN "REJECTION_MESSAGE" TYPE VARCHAR(65535);
