# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/tsconfig/package.json packages/tsconfig/
# Keep `pnpm install` without `--prod`: the start command in railway.json
# (repo root) runs `prisma migrate deploy` at boot, which needs the
# `prisma` CLI from devDependencies. If you tighten this to `--prod`,
# move `prisma` to dependencies in packages/db/package.json first.
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY . .
RUN pnpm --filter @jdm/db db:generate
RUN pnpm --filter @jdm/db build
RUN pnpm --filter @jdm/api build

FROM node:22-alpine AS runner
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/package.json ./
COPY --from=build /repo/package.json ./root-package.json
COPY --from=build /repo/pnpm-lock.yaml ./
COPY --from=build /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/apps ./apps
COPY --from=build /repo/packages ./packages
EXPOSE 4000
CMD ["node", "dist/server.js"]
