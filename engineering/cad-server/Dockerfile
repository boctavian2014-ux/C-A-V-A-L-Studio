FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends openscad ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Minimal deps only — no Electron, node-pty, or native modules
COPY engineering/cad-server/package.json engineering/cad-server/package-lock.json ./
RUN npm ci --omit=dev

COPY engineering/cad-server ./engineering/cad-server
# Supabase admin client only — cad-server must not import from ai/ (not copied)
COPY billing/supabase/client.ts ./billing/supabase/client.ts

ENV NODE_ENV=production

EXPOSE 8080

CMD ["npx", "tsx", "engineering/cad-server/standalone.ts"]
