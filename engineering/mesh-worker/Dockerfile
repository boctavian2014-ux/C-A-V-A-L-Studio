# Cavallo Robotics mesh worker — TRELLIS text-to-3D on CUDA (Railway GPU).
# Build from repo root:
#   docker build -f engineering/mesh-worker/Dockerfile -t caval-mesh-worker .
#
# Env:
#   MESH_WORKER_TOKEN   optional Bearer auth
#   TRELLIS_MODEL_ID    default JeffreyXiang/TRELLIS-text-xlarge
#   MESH_WORKER_ALLOW_MOCK=1  smoke-test cube without GPU (dev only)

FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8090

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv git git-lfs ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install

WORKDIR /app

COPY engineering/mesh-worker/requirements.txt /app/requirements.txt
RUN pip3 install --no-cache-dir -r /app/requirements.txt \
    && pip3 install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu121

# Official TRELLIS package (text-to-3D pipeline).
RUN pip3 install --no-cache-dir "git+https://github.com/microsoft/TRELLIS.git" \
    || pip3 install --no-cache-dir "git+https://github.com/JeffreyXiang/TRELLIS.git" \
    || echo "WARN: TRELLIS pip install failed — set MESH_WORKER_ALLOW_MOCK=1 for smoke only"

COPY engineering/mesh-worker /app

EXPOSE 8090

CMD ["python3", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8090", "--timeout-keep-alive", "600"]
