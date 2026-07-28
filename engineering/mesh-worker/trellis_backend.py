"""TRELLIS text-to-3D backend with optional mock for CPU/dev smoke tests."""

from __future__ import annotations

import os
import struct
import threading
from dataclasses import dataclass
from typing import Any

_PIPELINE = None
_PIPELINE_LOCK = threading.Lock()
_LOAD_ERROR: str | None = None

MODEL_ID = os.environ.get("TRELLIS_MODEL_ID", "JeffreyXiang/TRELLIS-text-xlarge").strip()
ALLOW_MOCK = os.environ.get("MESH_WORKER_ALLOW_MOCK", "").strip() in ("1", "true", "True")


@dataclass
class GenerateResult:
    ok: bool
    stl_bytes: bytes | None = None
    provider: str | None = None
    error: str | None = None


def _cuda_available() -> bool:
    try:
        import torch

        return bool(torch.cuda.is_available())
    except Exception:
        return False


def get_backend_status() -> dict[str, Any]:
    return {
        "cuda": _cuda_available(),
        "modelId": MODEL_ID,
        "modelLoaded": _PIPELINE is not None,
        "allowMock": ALLOW_MOCK,
        "loadError": _LOAD_ERROR,
    }


def _load_pipeline() -> Any:
    global _PIPELINE, _LOAD_ERROR
    with _PIPELINE_LOCK:
        if _PIPELINE is not None:
            return _PIPELINE
        try:
            import torch
            from trellis.pipelines import TrellisTextTo3DPipeline

            if not torch.cuda.is_available():
                raise RuntimeError("CUDA GPU required for TRELLIS")

            pipeline = TrellisTextTo3DPipeline.from_pretrained(MODEL_ID)
            pipeline.cuda()
            _PIPELINE = pipeline
            _LOAD_ERROR = None
            return _PIPELINE
        except Exception as exc:  # noqa: BLE001 — surface to health + callers
            _LOAD_ERROR = str(exc)
            raise


def _mesh_to_stl_bytes(mesh: Any) -> bytes:
    """Export a TRELLIS / trimesh-like mesh to binary STL."""
    import numpy as np
    import trimesh

    if isinstance(mesh, trimesh.Trimesh):
        tri = mesh
    elif hasattr(mesh, "vertices") and hasattr(mesh, "faces"):
        vertices = np.asarray(mesh.vertices, dtype=np.float64)
        faces = np.asarray(mesh.faces, dtype=np.int64)
        tri = trimesh.Trimesh(vertices=vertices, faces=faces, process=True)
    else:
        # TRELLIS Mesh class often exposes .to_trimesh() or dict-like outputs
        if hasattr(mesh, "to_trimesh"):
            tri = mesh.to_trimesh()
        elif isinstance(mesh, dict) and "vertices" in mesh and "faces" in mesh:
            tri = trimesh.Trimesh(
                vertices=np.asarray(mesh["vertices"], dtype=np.float64),
                faces=np.asarray(mesh["faces"], dtype=np.int64),
                process=True,
            )
        else:
            raise TypeError(f"Unsupported mesh type: {type(mesh)!r}")

    if tri.is_empty:
        raise RuntimeError("Generated mesh is empty")

    # Center on bed and ensure positive Z for FDM preview.
    tri.apply_translation(-tri.bounds[0])
    data = tri.export(file_type="stl")
    if isinstance(data, str):
        return data.encode("utf-8")
    return bytes(data)


def _mock_stl_cube(size_mm: float = 20.0) -> bytes:
    """Minimal binary STL cube for local smoke tests without GPU."""
    s = float(size_mm)
    # 12 triangles (2 per face) — binary STL
    faces = [
        # -Z
        ((0, 0, 0), (s, 0, 0), (s, s, 0)),
        ((0, 0, 0), (s, s, 0), (0, s, 0)),
        # +Z
        ((0, 0, s), (s, s, s), (s, 0, s)),
        ((0, 0, s), (0, s, s), (s, s, s)),
        # -Y
        ((0, 0, 0), (s, 0, s), (s, 0, 0)),
        ((0, 0, 0), (0, 0, s), (s, 0, s)),
        # +Y
        ((0, s, 0), (s, s, 0), (s, s, s)),
        ((0, s, 0), (s, s, s), (0, s, s)),
        # -X
        ((0, 0, 0), (0, s, 0), (0, s, s)),
        ((0, 0, 0), (0, s, s), (0, 0, s)),
        # +X
        ((s, 0, 0), (s, 0, s), (s, s, s)),
        ((s, 0, 0), (s, s, s), (s, s, 0)),
    ]

    def normal(a, b, c):
        ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
        nx = uy * vz - uz * vy
        ny = uz * vx - ux * vz
        nz = ux * vy - uy * vx
        length = (nx * nx + ny * ny + nz * nz) ** 0.5 or 1.0
        return nx / length, ny / length, nz / length

    buf = bytearray(80)  # header
    buf += struct.pack("<I", len(faces))
    for a, b, c in faces:
        n = normal(a, b, c)
        buf += struct.pack("<3f", *n)
        buf += struct.pack("<3f", *a)
        buf += struct.pack("<3f", *b)
        buf += struct.pack("<3f", *c)
        buf += struct.pack("<H", 0)
    return bytes(buf)


def generate_stl_bytes(*, prompt: str, seed: int | None = None) -> GenerateResult:
    fdm_prompt = (
        f"{prompt.strip()}. FDM 3D printable, watertight manifold mesh, "
        "flat base for bed adhesion, minimum wall thickness 1.2mm."
    )

    try:
        pipeline = _load_pipeline()
        kwargs: dict[str, Any] = {"prompt": fdm_prompt}
        if seed is not None:
            kwargs["seed"] = int(seed)
        outputs = pipeline.run(**kwargs)

        mesh = None
        if isinstance(outputs, dict):
            meshes = outputs.get("mesh") or outputs.get("meshes")
            if isinstance(meshes, (list, tuple)) and meshes:
                mesh = meshes[0]
            else:
                mesh = outputs.get("gaussian")  # unlikely; keep for API drift
        if mesh is None:
            raise RuntimeError("TRELLIS returned no mesh")

        stl = _mesh_to_stl_bytes(mesh)
        if len(stl) < 84:
            raise RuntimeError("STL export too small")
        return GenerateResult(ok=True, stl_bytes=stl, provider="trellis")
    except Exception as exc:  # noqa: BLE001
        if ALLOW_MOCK:
            return GenerateResult(
                ok=True,
                stl_bytes=_mock_stl_cube(),
                provider="mock",
            )
        return GenerateResult(
            ok=False,
            provider="trellis",
            error=f"TRELLIS generation failed: {exc}",
        )
