# Cavallo Mesh Worker (TRELLIS)

Robotics-only text-to-3D service for the CAD cloud. Coding Chat never calls this.

## API

- `GET /health` — CUDA / model status
- `POST /v1/text-to-3d` — `{ "prompt": "...", "seed": 42? }` → `{ "ok": true, "stlBase64": "..." }`

Optional auth: set `MESH_WORKER_TOKEN` and send `Authorization: Bearer <token>`.

## Railway (GPU)

1. New service from this Dockerfile (`engineering/mesh-worker/Dockerfile`).
2. Enable a GPU plan / CUDA runtime.
3. Set `MESH_WORKER_TOKEN` (recommended).
4. On the CAD server service, set:
   - `MESH_WORKER_URL=https://<mesh-worker-domain>`
   - `MESH_WORKER_TOKEN=<same token>`

CAD server tries the OSS worker first, then Meshy if `MESHY_API_KEY` is set.

## Local smoke (no GPU)

```bash
cd engineering/mesh-worker
python -m venv .venv
.venv\Scripts\activate   # or source .venv/bin/activate
pip install -r requirements.txt
set MESH_WORKER_ALLOW_MOCK=1
uvicorn app:app --port 8090
```
