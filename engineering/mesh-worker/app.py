"""Cavallo Robotics text-to-3D mesh worker (TRELLIS on CUDA).

POST /v1/text-to-3d  { "prompt": "...", "seed": 42? }
  → { "ok": true, "stlBase64": "..." } | { "ok": false, "error": "..." }

GET /health → worker + GPU + model status
"""

from __future__ import annotations

import base64
import os
import time
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from trellis_backend import generate_stl_bytes, get_backend_status

APP_TOKEN = (os.environ.get("MESH_WORKER_TOKEN") or "").strip()
PORT = int(os.environ.get("PORT") or os.environ.get("MESH_WORKER_PORT") or "8090")

app = FastAPI(title="Cavallo Mesh Worker", version="1.0.0")


class TextTo3DRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    seed: int | None = None


class TextTo3DResponse(BaseModel):
    ok: bool
    stlBase64: str | None = None
    bytes: int | None = None
    provider: str | None = None
    elapsedMs: int | None = None
    error: str | None = None


def _check_auth(authorization: str | None) -> None:
    if not APP_TOKEN:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization[len("Bearer ") :].strip()
    if token != APP_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid token")


@app.get("/health")
def health() -> dict[str, Any]:
    status = get_backend_status()
    return {
        "ok": True,
        "service": "mesh-worker",
        "authRequired": bool(APP_TOKEN),
        **status,
        "checkedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


@app.post("/v1/text-to-3d", response_model=TextTo3DResponse)
def text_to_3d(
    body: TextTo3DRequest,
    authorization: str | None = Header(default=None),
) -> TextTo3DResponse:
    _check_auth(authorization)
    prompt = body.prompt.strip()
    if not prompt:
        return TextTo3DResponse(ok=False, error="prompt is required")

    started = time.time()
    result = generate_stl_bytes(prompt=prompt, seed=body.seed)
    elapsed_ms = int((time.time() - started) * 1000)

    if not result.ok or not result.stl_bytes:
        return TextTo3DResponse(
            ok=False,
            error=result.error or "mesh generation failed",
            provider=result.provider,
            elapsedMs=elapsed_ms,
        )

    return TextTo3DResponse(
        ok=True,
        stlBase64=base64.b64encode(result.stl_bytes).decode("ascii"),
        bytes=len(result.stl_bytes),
        provider=result.provider,
        elapsedMs=elapsed_ms,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=PORT, workers=1)
