# I2PDM2-vuejs-frontend

Camera page for pest recognition — the standalone recognition UI, handed off
without the LINE-linked profile/history pages. A user opens the page,
takes or uploads a photo, and gets back the detected pest counts (plus an
optional pie-chart breakdown) from the `I2PDM2-fastapi-backend` API.

## Quick Start (Docker)

1. Make sure `I2PDM2-fastapi-backend` is already running and reachable at
   `http://localhost:28000` — the frontend build points there by default
   (see `Dockerfile`). **No `.env` is needed** for Docker-based testing.
2. `docker compose up -d --build`
3. Open http://localhost:8080 and allow camera access.

## Deployment

```bash
# Build
docker compose up -d --build
# Start (without build)
docker compose up -d
# Stop
docker compose down
```

To point the build at a different backend URL/domain instead of
`localhost:28000`, pass `VITE_API_BASE_URL` / `VITE_BASE_PATH` as
`build.args` in `docker-compose.yaml` (see the comment there), or see
`i2pdm2-demo-cam/.env.example` if you're running outside Docker via
`npm run dev`.

![camera ui](./readme-assets/ui-1117.png)
