# Three·ation

Convert a single reference photograph into a textured 3D model — entirely on your own machine. No external API calls, no cloud uploads.

---

## What it does

Upload a photo of an object. Three·ation isolates the subject, estimates depth, and builds a 3D mesh you can orbit, inspect as a point cloud, and export as `.OBJ` or `.GLB`.

When the optional TripoSR server stage is running, the depth path is bypassed in favour of a full neural 3D reconstruction that produces a closed mesh with proper sides and back.

---

## Architecture

The project is split into a **Vite/React frontend** and a **local Python Flask server**. The two communicate over `http://127.0.0.1:8765`.

```
three-ation/
├── src/
│   ├── App.jsx                          # Root state, server capability routing
│   ├── features/
│   │   ├── InputPanel/                  # Settings: resolution, isolation, point-cloud toggle
│   │   ├── OutputPanel/                 # Preview, progress bar, download buttons
│   │   ├── ModelViewer/                 # React Three Fiber canvas (mesh or point cloud)
│   │   └── ServerSetupModal/            # First-run setup instructions with copy buttons
│   └── machinery/
│       ├── generateMesh.js              # Full depth → mesh pipeline (browser)
│       ├── depthEstimator.js            # Sends image to /depth, returns rawDepth array
│       ├── reconstructor.js             # Sends image to /reconstruct, returns GLB
│       ├── segmentSubject.js            # MediaPipe DeepLab v3 AI segmentation (browser)
│       ├── removeBackground.js          # Color-key background removal (browser)
│       ├── resizeImageData.js           # Downscale ImageData to max dimension
│       ├── loadImageData.js             # File → ImageData + object URL
│       └── exportModel.js              # OBJ + GLB export helpers
└── server/
    ├── server.py                        # Flask app, staged capability discovery
    ├── requirements.txt                 # Python dependencies
    └── stages/
        ├── depth.py                     # Depth-Anything V2 Small stage
        └── reconstruct.py               # TripoSR stage (optional, requires git clone)
```

---

## Pipeline overview

### Depth path (always available)

```
Input image
  │
  ├─ Browser: MediaPipe DeepLab v3 OR color-key segmentation → binary mask
  │
  ├─ Server /depth: Depth-Anything V2 Small → per-pixel depth map
  │
  └─ Browser: pinhole backprojection → 3D vertices
               ↓
             statistical outlier removal (median ± 1.5 σ)
               ↓
             depth discontinuity filtering (DISC_ABS = 2.5)
               ↓
             Z compression to 25% of XY extent
               ↓
             Taubin smoothing (λ=0.5, μ=−0.53, 8 passes)
               ↓
             boundary edge extrusion → side walls (WALL_DEPTH = 0.18)
               ↓
             BufferGeometry → CanvasTexture
```

### Reconstruction path (requires TripoSR)

```
Input image → AI segmentation → masked RGBA PNG
  │
  └─ Server /reconstruct: TripoSR neural reconstruction → GLB
       (stabilityai/TripoSR — ~500 MB on first run, cached locally)
```

The server exposes a `/health` endpoint that returns `{ capabilities: ["depth", "reconstruct"] }`. The browser checks this on startup and routes to the best available path automatically.

---

## Setup

### Prerequisites

- Node.js 18+ and pnpm
- Python 3.10+

### Frontend

```bash
pnpm install
pnpm source:local   # link prototype-library from disk
pnpm dev            # starts at http://localhost:5173
```

### Python server

**1. Install dependencies** *(one-time)*

```bash
python3 -m pip install -r server/requirements.txt
```

**2. Optional — clone TripoSR for full 3D reconstruction** *(one-time, ~500 MB model download on first run)*

```bash
git clone https://github.com/VAST-AI-Research/TripoSR.git server/vendor/TripoSR
```

TripoSR has no `pyproject.toml` so it cannot be installed via pip. The server adds `server/vendor/TripoSR` to `sys.path` at import time.

**3. Start the server**

```bash
python3 server/server.py
```

Keep the terminal open. The server prints which stages loaded successfully:

```
  ✓ depth        (Depth-Anything V2 Small)
  ✓ reconstruct  (TripoSR)
```

If TripoSR is not cloned, only `depth` will be available and the app falls back to depth triangulation.

---

## Staged server architecture

Each pipeline component lives in `server/stages/<name>.py` and exposes a single `run(image)` function. The server discovers stages at startup — if a stage fails to import (missing model, missing dependency), it is silently skipped and the capability is omitted from `/health`.

This makes every stage independently swappable. To replace the depth model:

1. Create `server/stages/depth.py` with the same `run(image_rgb) → { depth_b64, width, height }` contract.
2. Restart the server.

**Planned stages**

| Stage | Model | What it adds |
|-------|-------|-------------|
| `multiview.py` | Zero123++ | Synthesises 6 views (sides + back) from a single input → depth-merge for closed mesh |

---

## Segmentation modes

| Mode | Engine | Notes |
|------|--------|-------|
| AI segmentation | MediaPipe DeepLab v3 (`@mediapipe/tasks-vision 0.10.35`) | Runs in the browser via WASM. Loads ~6 MB on first use from CDN. Best quality. |
| Color key | Built-in flood-fill | No model needed. Adjust the Tolerance slider. Works well on studio photos with flat backgrounds. |

A live mask preview updates in the output area as soon as an image is uploaded — before generation runs.

---

## ModelViewer

The viewer is a React Three Fiber canvas with:

- Two local directional lights + hemisphere light (no remote HDRI — fully offline)
- Auto-rotate until the user orbits
- **Point cloud toggle** in the Settings panel — renders `THREE.Points` with `PointsMaterial` for a raw view of the underlying depth data

### Rendering paths

| Result type | Renderer |
|-------------|----------|
| `{ geometry, texture }` (depth path) | `<mesh>` with `MeshStandardMaterial` + canvas texture |
| `{ scene }` (TripoSR path) | `<primitive>` preserving TripoSR's original materials and UVs |

---

## Export formats

| Format | Contents |
|--------|----------|
| `.OBJ` + `.MTL` + `.PNG` | Geometry + material + texture. Opens in Blender, Cinema 4D, etc. |
| `.GLB` | Binary GLTF with embedded texture. Web-ready, opens in model viewers. |

---

## GPU / hardware notes

| Stage | Model | Memory | First-run download | Approx. time (M2 Pro) |
|-------|-------|--------|-------------------|-----------------------|
| Depth estimation | Depth-Anything V2 Small | ~200 MB | ~100 MB | < 1 s |
| TripoSR reconstruction | stabilityai/TripoSR | ~1.5 GB | ~500 MB | 30–60 s |

Device selection order: MPS (Apple Silicon) → CUDA → CPU.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| UI framework | React 19 |
| Build tool | Vite 6 |
| 3D rendering | React Three Fiber v9 + drei v10 + Three.js v0.184 |
| Component library | `@6njp/prototype-library` (local, linked via `pnpm source:local`) |
| AI segmentation | MediaPipe Tasks Vision 0.10.35 |
| Depth estimation | Depth-Anything V2 Small (HuggingFace) |
| 3D reconstruction | TripoSR (VAST-AI-Research) |
| Server | Flask + PyTorch |

---

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Vite dev server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint (0 warnings policy) |
| `pnpm lint:css` | Stylelint (0 warnings policy) |
| `python3 server/server.py` | Start local inference server |

---

## Development notes

- `server/vendor/` is gitignored — never commit model weights or cloned repos.
- No secrets in the repo — environment variables only.
- The prototype-library package is linked from disk. Run `pnpm source:local` after a fresh clone.
- CSS layout follows strict parent-nesting conventions — layout properties only via `& > .childClass` nesting inside the parent's CSS rule.
