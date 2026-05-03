# JDMA-149: Admin Users List + Detail UI

## Overview

Build `/admin/users` (search + paginated table) and `/admin/users/:id` (detail with tickets/orders) pages in the admin Next.js app. PT-BR copy.

## API Contract (already implemented — JDMA-139)

- `GET /admin/users?q=&cursor=&limit=` → `{ items: AdminUserRow[], nextCursor: string | null }`
- `GET /admin/users/:id` → `AdminUserDetail` (profile + stats + recentTickets + recentOrders)

## Pages

### `/admin/users` — Usuários

- Server component with URL query params for search (`q`) and pagination (`cursor`)
- Search form: client component, text input, submits via form action (no JS state management)
- Table columns: avatar circle (initials fallback), Nome, Email
- Cursor pagination: "Carregar mais" link preserving current `q`
- Empty state: "Nenhum usuário encontrado."

### `/admin/users/:id` — Detalhe do Usuário

- Server component, fetches `getAdminUser(id)`
- Header card: large avatar/initials, name, email, role badge, city/stateCode, "Membro desde" date
- Stats: "X ingressos" / "X pedidos" badges
- Ingressos recentes table: Evento, Status, Origem, Data
- Pedidos recentes table: Evento, Status, Valor (formatted BRL), Data
- Back link: "← Usuários"
- Empty states per section

## Files

| Action | Path                                                                       |
| ------ | -------------------------------------------------------------------------- |
| Modify | `apps/admin/src/lib/admin-api.ts` — add `searchAdminUsers`, `getAdminUser` |
| Create | `apps/admin/app/(authed)/users/page.tsx` — list page                       |
| Create | `apps/admin/app/(authed)/users/search-form.tsx` — client search input      |
| Create | `apps/admin/app/(authed)/users/[id]/page.tsx` — detail page                |
| Modify | `apps/admin/app/(authed)/layout.tsx` — add nav link                        |

## Patterns

- Follow existing events page table pattern (CSS variables, Tailwind)
- `apiFetch` with Zod schema validation
- Server components by default, client only for interactive search
- Role badge: similar to StatusBadge component

## Done Criteria

Admin can search users by email/name and view a user's tickets list.
