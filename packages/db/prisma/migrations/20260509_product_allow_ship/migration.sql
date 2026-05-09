-- Add allowShip boolean to Product
-- Backfill: all existing products were implicitly shippable;
-- shippingFeeCents=null meant store-default fee, not no-shipping.
-- Also fix allowPickup backfill from prior migration (same false assumption).
ALTER TABLE "Product" ADD COLUMN "allowShip" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Product" SET "allowShip" = true;
UPDATE "Product" SET "allowPickup" = false WHERE "shippingFeeCents" IS NULL AND "allowPickup" = true;
