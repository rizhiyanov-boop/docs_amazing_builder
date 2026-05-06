# Full-stack dev run (auth + AI + server projects)

Use this command from the project root:

```bash
npm run dev:fullstack
```

Default URL:

- `http://127.0.0.1:3001`

Notes:

- This mode runs Vercel dev (`/api/*` available).
- Plain `npm run dev` starts only Vite UI (`/api/*` is unavailable).
- The launcher sets `NODE_TLS_REJECT_UNAUTHORIZED=0` by default for local corporate TLS chains.
