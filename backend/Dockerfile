# Aelix backend — zero runtime dependencies, so the image is tiny and buildless.
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# No `npm install` needed — the service uses only Node built-ins.
COPY package.json ./
COPY src ./src

# Persisted JSON store lives here when STORE_DRIVER=json (mount a volume in prod,
# or set STORE_DRIVER=postgres). Secrets come from the environment, never baked in.
VOLUME ["/app/.data"]

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://localhost:'+ (process.env.PORT||8787) +'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.mjs"]
