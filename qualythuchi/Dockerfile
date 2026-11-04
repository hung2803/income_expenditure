FROM node:24-bookworm-slim AS base

# workerd is a native binary. Slim Node images do not provide every runtime
# library needed by all workerd releases (see cloudflare/workerd npm installer).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libc++1 libc++abi1 libatomic1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY apps/backend/package.json ./apps/backend/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

# Use the lockfile when available; the initial scaffold has no lockfile yet.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY --chown=node:node --chmod=755 . .
# Windows build contexts can copy directories with read-only permission bits.
# Ownership alone does not let the node user create Vite/Workbox output files.
RUN mkdir -p /app/apps/backend/.wrangler /app/apps/frontend/dist /app/node_modules/.vite \
    && chown node:node /app/apps/backend/.wrangler /app/apps/frontend/dist /app/node_modules/.vite

ENV WRANGLER_SEND_METRICS=false
USER node

FROM base AS frontend-dev
EXPOSE 5173
CMD ["npm", "run", "dev", "--workspace", "@thu-chi/frontend", "--", "--host", "0.0.0.0", "--configLoader", "runner"]

FROM base AS frontend
ARG VITE_API_BASE_URL=""
RUN test -w /app/apps/frontend \
    && test -w /app/apps/frontend/dist \
    && npm run build --workspace @thu-chi/frontend
EXPOSE 5173
CMD ["npm", "run", "preview", "--workspace", "@thu-chi/frontend", "--", "--host", "0.0.0.0"]

FROM base AS backend
WORKDIR /app/apps/backend
RUN npm run runtime:check
EXPOSE 8787
CMD ["sh", "-c", "npm run runtime:check && npm run db:migrate:local && exec npm run dev -- --ip 0.0.0.0"]
