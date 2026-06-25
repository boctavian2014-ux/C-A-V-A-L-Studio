FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openscad ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm install tsx --no-save
COPY engineering/cad-server ./engineering/cad-server
COPY billing/supabase ./billing/supabase
ENV NODE_ENV=production
# Railway injects PORT at runtime; do not hardcode EXPOSE to a fixed value only
EXPOSE 8080
# Explicit entrypoint — never npm start (Electron)
CMD ["npx", "tsx", "engineering/cad-server/standalone.ts"]