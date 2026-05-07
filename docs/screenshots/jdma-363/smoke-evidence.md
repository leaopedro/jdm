# JDMA-363 §3.6 Estoque smoke evidence

Run timestamp: 2026-05-07 ~21:05 UTC. Branch `feat/jdma-363-low-stock-page` @ `65fde6a`.
Local stack: Postgres 16 (`jdm-postgres` on `:5433`) + API on `:4000` + admin on `:3000`.

## Seed matrix (threshold = 5)

| SKU           | Variant                      | qtyTotal | qtySold | available | status |
| ------------- | ---------------------------- | -------- | ------- | --------- | ------ |
| JDM-TEE-CLS-G | Camiseta Classic / Tamanho G | 2        | 2       | 0         | zero   |
| JDM-TEE-CLS-M | Camiseta Classic / Tamanho M | 4        | 0       | 4         | low    |
| JDM-TEE-CLS-P | Camiseta Classic / Tamanho P | 20       | 0       | 20        | ok     |
| JDM-STK-LOGO  | Adesivo Logo / Único         | 200      | 0       | 200       | ok     |

## Step 1 — Threshold + filters

`/loja/estoque` (Estoque tab inside Loja section) renders header `Limite de estoque baixo: 5 ajustar` and filter chips `Todos (4)`, `Estoque baixo (1)`, `Esgotados (1)`. Variants sort by `available` ascending (zero → low → ok). See `01-estoque-all.png`.

API echo:

```
GET /admin/store/inventory
{ "threshold": 5,
  "totals": { "all": 4, "ok": 2, "low": 1, "zero": 1 },
  "items": [
    { "sku": "JDM-TEE-CLS-G", "available": 0,  "status": "zero" },
    { "sku": "JDM-TEE-CLS-M", "available": 4,  "status": "low"  },
    { "sku": "JDM-TEE-CLS-P", "available": 20, "status": "ok"   },
    { "sku": "JDM-STK-LOGO",  "available": 200,"status": "ok"   }
  ] }
```

Filtered:

- `?status=low` → only `JDM-TEE-CLS-M` (`02-estoque-low.png`).
- `?status=zero` → only `JDM-TEE-CLS-G` (`03-estoque-zero.png`).

## Step 2 — Status badges

Badges visible in `01-estoque-all.png`: G shows red `Esgotado`, M shows amber `Baixo`, P + sticker show green `OK`.

## Step 3 — Quick inventory edit (happy path)

`PATCH /admin/store/variants/<M_id>` with `{ "quantityTotal": 12 }` returns 200; admin re-renders with M = 12, available = 12, status `OK`, low filter empty (`Estoque baixo (0)`). See `04-estoque-after-edit-M-12.png`. Restored to qty=4 after capture.

## Step 4 — Guard rail (`quantityTotal < quantitySold`)

Targeted `JDM-TEE-CLS-G` (sold=2). `PATCH … { "quantityTotal": 1 }` →

```
HTTP 409
{ "error": "Conflict", "message": "quantityTotal cannot drop below quantitySold" }
```

Server-side guard intact; the row's number input also has `min=quantitySold` to block UI-side submit.

## Step 5 — Threshold awareness

Set `JDM-TEE-CLS-P` qty=8 (available=8). Threshold sweep:

- threshold=5 → P = `ok` (`totals.ok=2, low=1, zero=1`).
- threshold=10 → P = `low` (`totals.ok=1, low=2, zero=1`).

Restored threshold=5 + P qty=20 after capture.

## Step 6 — Auth gates

| Caller       | Endpoint                     | Result     |
| ------------ | ---------------------------- | ---------- |
| no token     | `GET /admin/store/inventory` | `HTTP 401` |
| `staff` role | `GET /admin/store/inventory` | `HTTP 403` |
| `admin` role | `GET /admin/store/inventory` | `HTTP 200` |

Staff role flag was applied to `user@jdm.local` for the test, then reverted to `user`.

## Pass criteria

- ✅ Filter chips reflect threshold-aware counts and switch table contents on click.
- ✅ Quick edits persist via the existing variant `PATCH` route; row revalidates on refresh without a full reload.
- ✅ `quantityTotal < quantitySold` surfaces PT-BR conflict (HTTP 409) instead of silently accepting.
- ✅ Threshold change propagates within one refresh.
- ✅ Auth gate: `staff` blocked on the API, `admin` allowed.
