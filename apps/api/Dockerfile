FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web-portaria/package.json apps/web-portaria/package.json
COPY apps/web-morador/package.json apps/web-morador/package.json
COPY apps/web-sindico/package.json apps/web-sindico/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
RUN pnpm --filter api build \
  && mkdir -p apps/api/dist/db/migrations \
  && cp apps/api/src/db/migrations/*.sql apps/api/dist/db/migrations/
RUN pnpm --filter api deploy --prod --legacy /prod/api

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod/api/package.json ./package.json
COPY --from=build /prod/api/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
