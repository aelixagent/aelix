# AELIX access request storage

`/api/access-request` validates every wallet request before it writes anything. A success response means the persistent backend acknowledged the write.

## Local or VPS Next.js

Without webhook env vars, the API writes JSONL to:

```sh
ACCESS_REQUEST_DATA_FILE=.data/access-requests.jsonl
```

This mode is suitable only when the app runs on a server with persistent disk.

## Vercel with a VPS collector

Vercel does not provide persistent writable disk for this flow. Run the collector on a VPS, then point Vercel at it.

VPS env:

```sh
ACCESS_REQUEST_COLLECTOR_SECRET=<same-long-random-secret-as-vercel>
ACCESS_ADMIN_TOKEN=<admin-read-token>
ACCESS_REQUEST_DATA_FILE=/srv/aelix/access-requests.jsonl
PORT=8787
```

Start it:

```sh
npm run access:collector
```

Vercel env:

```sh
ACCESS_REQUEST_WEBHOOK_URL=https://<collector-host>/access-request
ACCESS_REQUEST_WEBHOOK_READ_URL=https://<collector-host>/access-requests
ACCESS_REQUEST_WEBHOOK_SECRET=<same-long-random-secret-as-vps>
ACCESS_ADMIN_TOKEN=<admin-read-token>
```

Admin read:

```sh
curl -H "Authorization: Bearer $ACCESS_ADMIN_TOKEN" https://www.aelix.xyz/api/access-request
```
