# Clauset Deployment Guide

Clauset is designed to be deployed effortlessly to any cloud platform, serverless edge, or self-hosted server. Because it includes the **Embedded TypeScript Mesh Runtime**, it has **zero required native dependencies** (no Python or Docker mandatory for core functionality).

---

## Option 1: Vercel (Recommended — 2-Minute Free Deploy)

The fastest way to get a live, public HTTPS URL for hackathon judges:

1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "feat: ready for deployment"
   git push origin main
   ```
2. **Import into Vercel**:
   - Go to [vercel.com](https://vercel.com) and click **"Add New..."** ➔ **"Project"**.
   - Select your `clauset` repository.
3. **Configure Build Settings**:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next` (default)
4. **Environment Variables** (Optional):
   - `PROTOCOL_FORCE_EMBEDDED`: `1`
5. Click **Deploy**. Vercel will build and assign you a live domain (e.g., `https://clauset.vercel.app`).

---

## Option 2: Render (Using Pre-configured `render.yaml` Blueprint)

Clauset includes a pre-configured Blueprint file (`render.yaml`) in the repository:

1. Push your code to GitHub.
2. Go to [dashboard.render.com](https://dashboard.render.com).
3. Click **"New +"** ➔ **"Blueprint"**.
4. Connect your GitHub repository.
5. Render will detect `render.yaml` and deploy:
   - **`clauset-workbench`** (Node.js web service).
6. Click **Apply**. Once built, your workbench will be live at `https://clauset-workbench.onrender.com`.

*Manual Render Web Service Setup (if not using Blueprints):*
- **Runtime**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run next:start`
- **Health Check Path**: `/api/protocol/health`

---

## Option 3: Railway (Auto-Docker Deployment)

1. Go to [railway.app](https://railway.app) and sign in.
2. Click **"New Project"** ➔ **"Deploy from GitHub repo"**.
3. Select your repository. Railway automatically detects the root `Dockerfile`.
4. Click **"Generate Domain"** under service settings.
5. Your service is live with full WebSocket and Server-Sent Events (SSE) support.

---

## Option 4: Docker & Docker Compose (Self-Hosted / VPS)

For deploying on AWS EC2, DigitalOcean Droplet, GCP Compute Engine, or a local server:

### Using Docker Compose
```bash
# Build and run container in detached mode
docker compose up -d

# View live logs
docker compose logs -f
```
The application will be accessible at `http://localhost:3000` (or your VPS IP address).

### Using Docker Directly
```bash
docker build -t clauset:latest .
docker run -d -p 3000:3000 --name clauset-app clauset:latest
```

---

## Option 5: Direct Node.js Production Run (VPS / EC2)

```bash
# 1. Install production dependencies
npm ci

# 2. Compile Webpack production bundle
npm run build

# 3. Start production server
npm run next:start
# Or with the cross-platform launcher:
node scripts/launch.mjs --prod
```

---

## Verifying Deployment Health

Once your app is deployed, you can verify that the mesh runtime is operating cleanly by checking the health endpoint:

```bash
curl https://your-domain.com/api/protocol/health
```

Expected JSON response:
```json
{
  "service": "clauset-gateway",
  "status": "healthy",
  "protocol_version": "1.3.0",
  "engine_mode": "embedded_mesh",
  "engine_label": "Embedded TS Mesh (Persistent)",
  "features": {
    "hybrid_recall": true,
    "residency_firewall": true,
    "conflict_arbitration": true,
    "grounded_rag": true
  }
}
```
