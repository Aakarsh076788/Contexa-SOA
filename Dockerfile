FROM node:24.22.0-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --include=dev
COPY . .
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_API_BASE=
# Client generation reads configuration, but never connects to this placeholder.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run db:generate && npm run build
RUN npm prune --omit=dev && npm cache clean --force

FROM node:24.22.0-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /usr/local/share/ca-certificates/rds-global-bundle.pem \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/rds-global-bundle.pem
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./
COPY --from=build --chown=node:node /app/backend ./backend
COPY --from=build --chown=node:node /app/connectors ./connectors
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /app/.local && chown node:node /app/.local
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=4s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
