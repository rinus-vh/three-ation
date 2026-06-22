"""
Stage: depth estimation
Model:  Depth-Anything V2 Small  (depth-anything/Depth-Anything-V2-Small-hf)
Input:  PIL Image (RGB)
Output: dict { depth_b64: str, width: int, height: int }
        depth_b64 — little-endian float32 array, 0-1 where 1 = closest pixel

Swap this file to change the depth model.  The contract (input / output shape)
must stay the same so the Flask route and the browser decoder don't need touching.
"""
import base64
import numpy as np

MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf"

_pipe = None


def _get_pipe():
    global _pipe
    if _pipe is None:
        from transformers import pipeline
        print(f"  [depth] Loading {MODEL_ID} …", flush=True)
        _pipe = pipeline("depth-estimation", MODEL_ID)
        print("  [depth] Ready.", flush=True)
    return _pipe


def run(image_rgb):
    """
    image_rgb: PIL Image in RGB mode.
    Returns the stage output dict.
    """
    result = _get_pipe()(image_rgb)

    depth_t = result["predicted_depth"].squeeze()
    d_min = float(depth_t.min())
    d_max = float(depth_t.max())
    span = (d_max - d_min) if d_max != d_min else 1.0

    # Normalise: 1.0 = closest, 0.0 = farthest.
    depth_norm = ((depth_t - d_min) / span).numpy().astype(np.float32)

    h, w = depth_norm.shape
    depth_b64 = base64.b64encode(depth_norm.tobytes()).decode("utf-8")

    return {"depth_b64": depth_b64, "width": w, "height": h}
