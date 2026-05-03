-- Allow multiple valid tickets per (user,event) and multiple tickets per order.
DROP INDEX IF EXISTS "Ticket_userId_eventId_valid_key";
DROP INDEX IF EXISTS "Ticket_orderId_key";

-- Keep fast lookup for webhook idempotent reads by order.
CREATE INDEX IF NOT EXISTS "Ticket_orderId_idx" ON "Ticket"("orderId");
