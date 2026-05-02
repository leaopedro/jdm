# Migration Rollback — Extras Models (20260502235900)

Migration: `20260502235900_add_extras_models`

Adds three new tables and one enum. All are additive — no existing columns altered.

## Rollback SQL

Run in order (reverse of apply):

```sql
-- 1. Drop foreign keys + tables (dependents first)
DROP TABLE IF EXISTS "TicketExtraItem";
DROP TABLE IF EXISTS "OrderExtra";
DROP TABLE IF EXISTS "TicketExtra";

-- 2. Drop enum
DROP TYPE IF EXISTS "TicketExtraItemStatus";
```

## Safety Notes

- These tables will be empty at time of rollback unless extras data was already written. Verify before dropping:
  ```sql
  SELECT COUNT(*) FROM "TicketExtraItem";
  SELECT COUNT(*) FROM "OrderExtra";
  SELECT COUNT(*) FROM "TicketExtra";
  ```
- After running rollback SQL, delete the migration file and revert `schema.prisma` to remove the models + back-relations on `Event`, `Order`, `Ticket`.
- Run `prisma generate` after schema revert to rebuild the client.

## Prisma Migration Table Cleanup

```sql
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260502235900_add_extras_models';
```
