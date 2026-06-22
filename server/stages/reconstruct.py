"""
Stage: single-image 3D reconstruction
Model:  TripoSR  (stabilityai/TripoSR)
Input:  PIL Image (RGBA — alpha is the subject mask)
Output: dict { glb_b64: str }
        glb_b64 — base64-encoded GLB file with mesh + texture

Swap this file to change the reconstruction model (e.g. Zero123++ + InstantMesh).
The contract (input / output) must stay the same so the Flask route and the
browser GLB loader don't need touching.

Install TripoSR once before first use:
    pip install git+https://github.com/VAST-AI-Research/TripoSR.git
"""
import base64
import os
import sys
import tempfile

# TripoSR has no pyproject.toml so it can't be pip-installed from git.
# Clone it to server/vendor/TripoSR and we add it to sys.path here.
_vendor = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'vendor', 'TripoSR'))
if os.path.isdir(_vendor) and _vendor not in sys.path:
    sys.path.insert(0, _vendor)

# This import is intentionally at module level so that importing this stage
# fails fast (and loudly) if TripoSR is not cloned yet — the server startup
# check catches the ImportError and marks the stage as unavailable.
from tsr.system import TSR  # noqa: E402

import torch

MODEL_ID = "stabilityai/TripoSR"
CHUNK_SIZE = 8192  # renderer chunk — lower = less VRAM, slower

_model = None


def _device():
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def _get_model():
    global _model
    if _model is None:
        dev = _device()
        print(f"  [reconstruct] Loading {MODEL_ID} on {dev} …", flush=True)
        _model = TSR.from_pretrained(
            MODEL_ID,
            config_name="config.yaml",
            weight_name="model.ckpt",
        )
        _model.renderer.set_chunk_size(CHUNK_SIZE)
        _model.to(dev)
        print("  [reconstruct] Ready.", flush=True)
    return _model


def run(image_rgba):
    """
    image_rgba: PIL Image in RGBA mode (alpha = subject mask).
    Returns the stage output dict.
    """
    from PIL import Image

    model = _get_model()
    dev = _device()

    # TripoSR expects a white-background RGB image with the subject isolated.
    bg = Image.new("RGBA", image_rgba.size, (255, 255, 255, 255))
    bg.paste(image_rgba, mask=image_rgba.split()[3])
    image_rgb = bg.convert("RGB")

    with torch.no_grad():
        scene_codes = model([image_rgb], device=dev)

    meshes = model.extract_mesh(scene_codes, resolution=256)
    mesh = meshes[0]

    with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as f:
        tmp_path = f.name

    try:
        mesh.export(tmp_path)
        with open(tmp_path, "rb") as f:
            glb_bytes = f.read()
    finally:
        os.unlink(tmp_path)

    glb_b64 = base64.b64encode(glb_bytes).decode("utf-8")
    return {"glb_b64": glb_b64}
