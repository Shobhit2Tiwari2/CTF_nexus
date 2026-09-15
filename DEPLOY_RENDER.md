# Deploying CTF Nexus to Render & Running in Containers

This guide covers deploying the **CTF Nexus Challenge** to [Render](https://render.com) using Docker containers, as well as running the container locally.

---

## Architecture Overview

- **Runtime**: Node.js 20 on Alpine Linux (`node:20-alpine`)
- **Container Port**: Configurable via `PORT` env var (Render automatically sets `PORT=10000`, local defaults to `3000`)
- **Health Check**: `GET /healthz` (returns `{"status":"ok"}`)
- **Database**: `sql.js` (WebAssembly SQLite) initialized automatically on startup

---

## Option 1: Deploy to Render using Blueprint (Easiest)

Render Blueprints let you configure everything in code via the included [`render.yaml`](./render.yaml).

1. Push this repository to your GitHub account:
   ```bash
   git add .
   git commit -m "feat: add Docker and Render deployment setup"
   git push origin main
   ```
2. Log in to [dashboard.render.com](https://dashboard.render.com).
3. Click **New +** in the top navigation bar and select **Blueprint**.
4. Connect your GitHub repository.
5. Render will automatically detect [`render.yaml`](./render.yaml) and configure:
   - **Service Type**: Web Service
   - **Environment**: Docker
   - **Health Check Path**: `/healthz`
   - **Plan**: Free
6. Click **Apply**. Render will build the container and deploy it to a live public URL (e.g. `https://ctf-nexus-challenge.onrender.com`).

---

## Option 2: Deploy to Render Manually via Web Service

1. Push your repository to GitHub.
2. In the Render Dashboard, click **New +** → **Web Service**.
3. Select **Build and deploy from a Git repository** and pick your repository.
4. Fill in the service details:
   - **Name**: `ctf-nexus-challenge` (or your preferred name)
   - **Region**: Choose the closest region (e.g., Oregon, Frankfurt)
   - **Branch**: `main`
   - **Root Directory**: *(leave blank — defaults to repository root)*
   - **Runtime**: **Docker**
   - **Instance Type**: **Free**
5. Expand **Advanced**:
   - **Health Check Path**: `/healthz`
   - **Environment Variables**:
     - `NODE_ENV` = `production`
     - *(Optional)* `CTF_FLAG` = `flag{your_custom_flag_here}`
     - *(Optional)* `WEB_CONCURRENCY` = `1`
6. Click **Create Web Service**.

---

## Running Locally with Docker & Docker Compose

### Using Docker Compose (Recommended)

To build and run the container locally:

```bash
docker compose up --build
```

To run in the background (detached):

```bash
docker compose up -d --build
```

Open your browser at:
**[http://localhost:3000](http://localhost:3000)**

To stop the containers:

```bash
docker compose down
```

---

### Using Direct Docker CLI

1. **Build the container image**:
   ```bash
   docker build -t ctf-nexus-challenge .
   ```

2. **Run the container**:
   ```bash
   docker run -p 3000:3000 --rm ctf-nexus-challenge
   ```

---

## Optional Environment Variables

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port the server listens on (Render automatically injects `10000`) |
| `NODE_ENV` | `production` | Enables production optimizations and compression |
| `CLUSTER_ENABLED` | `false` | When `true`, enables multi-worker cluster mode. Kept `false` by default to prevent high memory usage on free container tiers |
| `WEB_CONCURRENCY` | `1` | Number of cluster workers if `CLUSTER_ENABLED=true` |
| `CTF_FLAG` | *(Embedded default)* | Custom flag string to return at `/api/flag` |
| `CTF_PDF_BASE64` | *(Embedded default)* | Base64 encoded PDF payload for `/documents/classified` |

---

## Troubleshooting & Tips

- **Render Free Tier Spin-Down**: Render's free tier spins down containers after 15 minutes of inactivity. When a new request arrives, it may take 30–50 seconds to spin back up.
- **Database Persistence**: The challenge uses `sql.js` (WebAssembly SQLite) which creates or restores tables on startup. If you need persistent disk storage on Render, you can attach a persistent disk under **Disks** in Render dashboard and set `DB_PATH=/var/data/ctf_nexus.db`.
- **Health Check Verification**: You can verify the health check anytime at `https://<your-service>.onrender.com/healthz`.
