"""
Stage: multi-view synthesis
Model:  Zero123++ v1.2  (sudo-ai/zero123plus-v1.2)
Input:  PIL Image (RGBA — alpha is the subject mask)
Output: dict { views: list[str], grid: str }
        views — 6 base64-encoded PNG images arranged in Zero123++ output order
                (row-major, 3 cols × 2 rows):
                  row 0: az=30  el=+20,  az=90  el=-10,  az=150 el=+20
                  row 1: az=210 el=-10,  az=270 el=+20,  az=330 el=-10

Install before first use:
    python3 -m pip install "diffusers>=0.25" accelerate
"""
import base64
import hashlib
import io
import threading

# huggingface_hub >= 0.24 removed cached_download; diffusers and the Zero123++
# custom pipeline still reference it. Shim MUST be applied before diffusers import.
import huggingface_hub
if not hasattr(huggingface_hub, "cached_download"):
    huggingface_hub.cached_download = huggingface_hub.hf_hub_download

import torch
from diffusers import DiffusionPipeline
from PIL import Image

MODEL_ID = "sudo-ai/zero123plus-v1.2"
CUSTOM_PIPELINE = "sudo-ai/zero123plus-pipeline"
DEFAULT_STEPS = 10
DEFAULT_SCHEDULER = "dpm++"
# Emit a preview every N denoising steps (decoded from latents, sent to client).
PREVIEW_EVERY_N_STEPS = 5

_pipe = None
_pipe_scheduler_config = None  # original config snapshot for swapping back

# Only one inference may run at a time — Zero123++ is not re-entrant and both
# requests would share the same _pipe / scheduler object, corrupting its state.
_inference_lock = threading.Lock()

# Last-result cache keyed by (image_hash, steps, scheduler).
# Avoids re-running the 10–20 min Zero123++ inference when nothing changed.
_cache_key = None
_cache_result = None


def _tensors_to(obj, device):
    """Recursively move all tensors in a (possibly dataclass) object to device."""
    if torch.is_tensor(obj):
        return obj.to(device)
    if hasattr(obj, "__dict__"):
        for k, v in vars(obj).items():
            if torch.is_tensor(v):
                setattr(obj, k, v.to(device))
    return obj


class _CPUEncoderWithMPSOutput(torch.nn.Module):
    """
    Runs a vision encoder on CPU (avoids MPS float32 numerical instability that
    causes corrupt CLIP embeddings → unconditioned diffusion → color-noise output),
    then moves every output tensor back to `out_device` (MPS) so the downstream
    pipeline operations that combine encoder_hidden_states with global_embeds
    don't hit a cross-device RuntimeError.
    """

    def __init__(self, model, out_device):
        super().__init__()
        self.model = model.to("cpu").float()
        self.out_device = out_device

    def forward(self, *args, **kwargs):
        cpu_args   = [a.to("cpu") if torch.is_tensor(a) else a for a in args]
        cpu_kwargs = {k: v.to("cpu") if torch.is_tensor(v) else v for k, v in kwargs.items()}
        out = self.model(*cpu_args, **cpu_kwargs)
        return _tensors_to(out, self.out_device)

    def parameters(self, recurse=True):
        return self.model.parameters(recurse=recurse)


def _device():
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def _dtype():
    # float16 on MPS produces NaN values for this model → black output images.
    # Only use float16 on CUDA where it is numerically stable.
    if torch.cuda.is_available():
        return torch.float16
    return torch.float32


def _get_pipe():
    global _pipe, _pipe_scheduler_config
    if _pipe is None:
        dev = _device()
        print(f"  [multiview] Loading {MODEL_ID} on {dev} …", flush=True)
        _pipe = DiffusionPipeline.from_pretrained(
            MODEL_ID,
            custom_pipeline=CUSTOM_PIPELINE,
            torch_dtype=_dtype(),
            trust_remote_code=True,
        )
        _pipe.to(dev)

        if dev == "mps":
            # The Zero123++ custom pipeline calls self.vision_encoder for CLIP encoding.
            # On MPS float32 it produces corrupt embeddings (the UNet then runs without
            # conditioning and outputs color noise).  Fix: run the encoder on CPU for
            # numerical stability, but wrap the output tensors back to MPS so the rest
            # of the pipeline (UNet, etc.) can combine them without device mismatches.
            if hasattr(_pipe, "vision_encoder"):
                _pipe.vision_encoder = _CPUEncoderWithMPSOutput(_pipe.vision_encoder, dev)
                print("  [multiview] vision_encoder wrapped: runs on CPU, outputs on MPS.", flush=True)

        _pipe.enable_attention_slicing(1)
        _pipe_scheduler_config = dict(_pipe.scheduler.config)
        print("  [multiview] Ready.", flush=True)
    return _pipe


def _apply_scheduler(pipe, scheduler_key):
    """Swap the pipeline's scheduler to the requested one."""
    config = _pipe_scheduler_config
    if scheduler_key == "dpm++":
        from diffusers import DPMSolverMultistepScheduler
        pipe.scheduler = DPMSolverMultistepScheduler.from_config(config)
    elif scheduler_key == "ddim":
        from diffusers import DDIMScheduler
        pipe.scheduler = DDIMScheduler.from_config(config)
    # Any unknown key → leave current scheduler unchanged


def _split_grid(grid_pil, label=""):
    """
    Split a Zero123++ output grid into 6 view images (row-major order).
    Auto-detects layout: landscape (w≥h) → 3 cols × 2 rows;
                         portrait  (h>w) → 2 cols × 3 rows.
    """
    gw, gh = grid_pil.size
    cols, rows = (3, 2) if gw >= gh else (2, 3)
    cw, ch = gw // cols, gh // rows
    if label:
        print(f"  [multiview] {label} grid {gw}×{gh} → {cols}×{rows} cells of {cw}×{ch}", flush=True)
    views = []
    for row in range(rows):
        for col in range(cols):
            crop = grid_pil.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch))
            views.append(crop.convert("RGB"))
    return views


def _decode_latents_to_views(pipe, latents):
    """Decode a latents tensor → list of 6 base64 JPEG view thumbnails."""
    try:
        with torch.no_grad():
            vae_device = next(pipe.vae.parameters()).device
            lat = latents.detach().to(vae_device).float()
            dec = pipe.vae.decode(lat / pipe.vae.config.scaling_factor, return_dict=False)[0]
            dec = (dec / 2 + 0.5).clamp(0, 1)
            arr = (dec.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255).astype("uint8")

        grid_pil = Image.fromarray(arr)
        views_b64 = []
        for view in _split_grid(grid_pil):
            buf = io.BytesIO()
            view.save(buf, format="JPEG", quality=55)
            views_b64.append(base64.b64encode(buf.getvalue()).decode())
        return views_b64
    except Exception as exc:
        print(f"  [multiview] preview decode failed: {exc}", flush=True)
        return None


def _resize_to_square(pil_rgb, size=256):
    """Fit into a square canvas with white padding, preserving aspect ratio."""
    w, h = pil_rgb.size
    scale = size / max(w, h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = pil_rgb.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), (255, 255, 255))
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2))
    return canvas


def run(image_rgba, on_preview=None, steps=DEFAULT_STEPS, scheduler=DEFAULT_SCHEDULER):
    """
    image_rgba: PIL Image in RGBA mode (alpha = subject mask).
    on_preview: optional callable(dict) called every PREVIEW_EVERY_N_STEPS with
                {'step': int, 'total': int, 'views': list[str]}.
    steps:     number of denoising steps (default 20).
    scheduler: 'dpm++' or 'ddim' (default 'dpm++').
    Returns dict with a list of 6 base64-encoded PNG view images + the full grid.
    """
    global _cache_key, _cache_result

    pipe = _get_pipe()
    n_steps = max(10, min(75, int(steps)))

    # Cache check before acquiring the lock — no need to queue if result is cached
    img_hash = hashlib.sha256(image_rgba.tobytes()).hexdigest()
    key = (img_hash, n_steps, scheduler)
    if key == _cache_key and _cache_result is not None:
        print(f"  [multiview] cache hit — returning cached result (steps={n_steps}, scheduler={scheduler})", flush=True)
        return _cache_result

    if _inference_lock.locked():
        print("  [multiview] waiting for inference lock …", flush=True)
    with _inference_lock:
        # Re-check cache after acquiring lock — another request may have just finished
        if key == _cache_key and _cache_result is not None:
            print(f"  [multiview] cache hit (post-lock) — returning cached result", flush=True)
            return _cache_result

        _apply_scheduler(pipe, scheduler)
        print(f"  [multiview] {n_steps} steps, scheduler={scheduler}", flush=True)

        # Composite on white background — Zero123++ expects an RGB image
        bg = Image.new("RGBA", image_rgba.size, (255, 255, 255, 255))
        bg.paste(image_rgba, mask=image_rgba.split()[3])
        image_rgb = _resize_to_square(bg.convert("RGB"), 256)

        # --- Step callback for live previews ---
        def _step_callback(step, timestep, latents):
            if on_preview is None:
                return
            is_preview_step = ((step + 1) % PREVIEW_EVERY_N_STEPS == 0)
            is_last = (step + 1 == n_steps)
            if not (is_preview_step or is_last):
                return
            views_b64 = _decode_latents_to_views(pipe, latents)
            if views_b64:
                on_preview({'step': step + 1, 'total': n_steps, 'views': views_b64})

        import warnings
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=FutureWarning, message=".*callback.*")
            result = pipe(
                image_rgb,
                num_inference_steps=n_steps,
                callback=_step_callback,
                callback_steps=1,
            ).images[0]

        # Split final output grid into 6 full-quality PNG views (auto-detect 3×2 vs 2×3)
        views_b64 = []
        for view in _split_grid(result, label="final"):
            buf = io.BytesIO()
            view.save(buf, format="PNG")
            views_b64.append(base64.b64encode(buf.getvalue()).decode("utf-8"))

        # Also return the original unsplit grid — reconstruct3d uses it directly
        grid_buf = io.BytesIO()
        result.save(grid_buf, format="PNG")
        grid_b64 = base64.b64encode(grid_buf.getvalue()).decode("utf-8")

        result_dict = {"views": views_b64, "grid": grid_b64}
        _cache_key = key
        _cache_result = result_dict
        return result_dict
