"""
Stage: 3D surface reconstruction from Zero123++ multi-view grid.
Method: Visual hull (space carving) — foreground masks from the white-background
        Zero123++ views are projected onto a 3D voxel grid using the known
        camera poses.  Marching cubes extracts the surface.  No depth
        estimation; no neural reconstructor required.

Why visual hull instead of depth-based Poisson?
  Depth-Anything V2 was trained on real photographs, not on the synthetic
  renders that Zero123++ produces.  Its depth predictions on these images are
  unreliable, leading to incoherent point clouds regardless of how well the
  camera-pose math is set up.
  Visual hull needs only silhouette masks, which are trivially extracted from
  Zero123++'s pure-white background.  Given 7 silhouettes (front + 6 views)
  with known azimuth/elevation, space carving reliably reconstructs the outer
  shape of the object.

Input:  dict { grid: PIL Image (Zero123++ grid, RGB), front: PIL Image (subject RGBA) }
Output: dict { glb_b64: str }
"""
import base64
import io
import math
import os
import tempfile

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, binary_fill_holes, gaussian_filter, label
from skimage.measure import marching_cubes

# Zero123++ v1.2 output poses — row-major, regardless of grid orientation.
VIEW_POSES = [
    (30,  20),
    (90,  -10),
    (150, 20),
    (210, -10),
    (270, 20),
    (330, -10),
]

# Zero123++ v1.2 camera intrinsics for 320 × 320 renders.
# Focal ≈ 350 px  ⟹  half-FoV = atan(160/350) ≈ 24.6°.
FOV_HALF_DEG = 24.5

# Camera distance from the world origin in our normalised [-1, 1] voxel space.
# Zero123++ normalises the input so the subject fills the 256×256 input crop.
# Empirically the object radius in Zero123++'s coordinate system is ~0.82
# (it fills the FOV, not just the unit sphere radius 0.5).
# Scaling to our ±1 voxel space (object radius 1.0):
#   cam_dist = 1.8 / 0.82 × 1.0 ≈ 2.2
# At 3.6 the entire voxel grid falls inside the car silhouette from every
# angle and no carving happens; 2.2 lets side views carve the Z extent.
CAM_DIST = 2.2

# Voxel-grid resolution.  128³ = 2 M voxels, ~1 s of carving on CPU.
VOXEL_RES = 128

# Cached carve inputs — stored after each run() so remesh() can re-use them.
_carve_cache: dict = {}


def run(grid_image, front_image):
    """
    grid_image:  PIL Image — Zero123++ synthesis grid (RGB, white background)
    front_image: PIL Image — original subject (RGBA, alpha = mask)
    Returns:     dict with glb_b64 key.
    """
    # ── Split grid into 6 view images ─────────────────────────────────────
    gw, gh = grid_image.size
    cols, rows = (3, 2) if gw >= gh else (2, 3)
    cw, ch = gw // cols, gh // rows
    print(f"  [reconstruct3d] grid {gw}×{gh} → {cols}×{rows} cells of {cw}×{ch}", flush=True)
    view_images = []
    for row in range(rows):
        for col in range(cols):
            crop = grid_image.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch))
            view_images.append(crop.convert("RGB"))

    # ── Build silhouette masks ─────────────────────────────────────────────
    # Front view (az=0, el=0): use the RGBA cutout from background removal.
    # Letterbox-resize to match multiview.py's 256×256 preprocessing, then
    # scale to view size.  binary_fill_holes fills any window/glass holes.
    print("  [reconstruct3d] extracting silhouette masks …", flush=True)

    front_rgba = front_image.convert("RGBA")
    front_mask = _letterbox_mask(front_rgba, cw)
    front_mask = binary_fill_holes(front_mask)
    front_mask = binary_dilation(front_mask, iterations=2)
    front_pct  = front_mask.sum() / front_mask.size * 100
    print(f"  [reconstruct3d] front  mask: {front_pct:.1f}% fg", flush=True)

    # Zero123++ views: adaptive background removal using corner sampling.
    # Zero123++ renders onto a gray background (~178,177,175), NOT pure white,
    # so a fixed brightness threshold fails.  Corner pixels are always bg.
    view_masks = []
    for i, view_img in enumerate(view_images):
        arr = np.array(view_img).astype(np.float32)
        corners = np.concatenate([
            arr[:20, :20].reshape(-1, 3), arr[:20, -20:].reshape(-1, 3),
            arr[-20:, :20].reshape(-1, 3), arr[-20:, -20:].reshape(-1, 3),
        ])
        bg = np.median(corners, axis=0)
        mask = np.abs(arr - bg).max(axis=2) > 25
        mask = binary_fill_holes(mask)
        mask = binary_dilation(mask, iterations=2)
        view_masks.append(mask)
        pct = mask.sum() / mask.size * 100
        print(f"  [reconstruct3d] view {i + 1} mask: {pct:.1f}% fg  (bg≈{bg.astype(int).tolist()})", flush=True)

    all_poses = [(0, 0)] + list(VIEW_POSES)
    all_masks = [front_mask] + view_masks
    all_sizes = [(cw, ch)] * len(all_poses)

    # Build per-view RGB images for multi-view texturing (all cw×ch).
    front_lb = _letterbox_rgb(front_rgba, cw)
    all_color_imgs = [front_lb] + view_images  # 7 images, all cw×cw RGB

    # Store inputs so remesh() can rebuild the mesh at a different voxel resolution.
    _carve_cache.update({
        'poses':      all_poses,
        'masks':      all_masks,
        'sizes':      all_sizes,
        'front_rgba': front_rgba,
        'color_imgs': all_color_imgs,
    })

    # ── Space carving ──────────────────────────────────────────────────────
    print(f"  [reconstruct3d] space carving {VOXEL_RES}³ …", flush=True)
    voxel_grid = _space_carve(all_poses, all_masks, all_sizes)
    n_solid    = int(voxel_grid.sum())
    fill_pct   = n_solid / VOXEL_RES ** 3 * 100
    print(f"  [reconstruct3d] {n_solid} solid voxels ({fill_pct:.1f}%)", flush=True)

    if n_solid < 8:
        return {"error": "space carving produced no solid voxels — try a clearer subject image"}

    voxel_grid = _postprocess_voxels(voxel_grid, VOXEL_RES)

    # ── Marching cubes ─────────────────────────────────────────────────────
    print("  [reconstruct3d] marching cubes …", flush=True)
    step = 2.0 / VOXEL_RES
    verts, faces, _, _ = marching_cubes(
        voxel_grid,
        level=0.5,
        spacing=(step, step, step),
    )
    verts -= 1.0          # shift output from [0, 2] → [-1, 1]
    faces = faces[:, ::-1]  # flip winding: marching cubes normals point inward by default
    print(f"  [reconstruct3d] mesh: {len(verts)} verts, {len(faces)} faces", flush=True)

    if len(verts) == 0 or len(faces) == 0:
        return {"error": "marching cubes produced an empty mesh"}

    # ── Multi-view texture projection ─────────────────────────────────────
    print("  [reconstruct3d] projecting multi-view texture …", flush=True)
    import trimesh

    vertex_colors = _multiview_color_vertices(verts, faces, all_color_imgs, all_poses, all_sizes)
    mesh = trimesh.Trimesh(vertices=verts, faces=faces, vertex_colors=vertex_colors, process=False)

    with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as f:
        tmp = f.name
    try:
        mesh.export(tmp)
        with open(tmp, "rb") as f:
            glb_bytes = f.read()
    finally:
        os.unlink(tmp)

    return {"glb_b64": base64.b64encode(glb_bytes).decode("utf-8")}


# ── Helpers ────────────────────────────────────────────────────────────────

def _space_carve(poses, masks, sizes, voxel_res=None):
    """
    Visual hull via space carving.

    For each camera view: every voxel centre is forward-projected into image
    space.  Voxels that land on a background pixel are carved (set to False).
    Voxels behind the camera or projecting outside the image bounds are left
    intact (conservative — the hull can only grow, never shrink beyond truth).

    Convention: axis 0 = X (right), axis 1 = Y (up), axis 2 = Z (toward
    viewer at az=0).  Matches the camera-pose math in _project.
    """
    res = voxel_res if voxel_res is not None else VOXEL_RES
    lin = np.linspace(-1 + 1.0 / res, 1 - 1.0 / res, res, dtype=np.float32)
    Xi, Yi, Zi = np.meshgrid(lin, lin, lin, indexing='ij')
    world  = np.column_stack([Xi.ravel(), Yi.ravel(), Zi.ravel()])   # (N, 3)
    solid  = np.ones(res ** 3, dtype=bool)

    for i, ((az, el), mask, (w, h)) in enumerate(zip(poses, masks, sizes)):
        u, v, in_front = _project(world, az, el, w, h)

        ui = np.round(u).astype(np.int32)
        vi = np.round(v).astype(np.int32)
        in_image = (ui >= 0) & (ui < w) & (vi >= 0) & (vi < h)

        # Only carve where we have data: in front of camera AND within image
        check  = in_front & in_image
        in_fg  = np.ones(len(world), dtype=bool)
        in_fg[check] = mask[vi[check], ui[check]]

        solid &= in_fg
        print(f"  [reconstruct3d] after view {i+1} (az={az:3d} el={el:+d}): "
              f"{solid.sum()} solid ({solid.sum()/res**3*100:.1f}%)", flush=True)

    return solid.reshape(res, res, res)


def _project(world_pts, az_deg, el_deg, width, height):
    """
    Forward-project an (N, 3) world-space array into pixel coordinates.

    Camera-to-world rotation R (same as used in the old backprojection):
        R = [[cA,   -sA·sE,  cE·sA],
             [ 0,    cE,     sE   ],
             [-sA,  -cA·sE,  cE·cA]]

    World-to-camera = R^T:
        Xc =  cA·dx              - sA·dz
        Yc = -sA·sE·dx + cE·dy  - cA·sE·dz
        Zc =  cE·sA·dx + sE·dy  + cE·cA·dz

    In this convention Zc < 0 for points in front of the camera (depth = -Zc).

    Returns u (col), v (row), in_front (bool mask).
    """
    a   = math.radians(az_deg)
    e   = math.radians(el_deg)
    cA, sA = math.cos(a), math.sin(a)
    cE, sE = math.cos(e), math.sin(e)

    # Camera centre in world space
    tx = cE * sA * CAM_DIST
    ty = sE       * CAM_DIST
    tz = cE * cA  * CAM_DIST

    dx = world_pts[:, 0] - tx
    dy = world_pts[:, 1] - ty
    dz = world_pts[:, 2] - tz

    Xc =  cA      * dx                     - sA      * dz
    Yc = -sA * sE * dx  + cE * dy  - cA * sE * dz
    Zc =  cE * sA * dx  + sE * dy  + cE * cA * dz

    in_front = Zc < -1e-4
    depth    = np.where(in_front, -Zc, 1.0)

    fx = width  / (2.0 * math.tan(math.radians(FOV_HALF_DEG)))
    cx = width  / 2.0
    cy = height / 2.0

    u =  Xc / depth * fx + cx
    v = -Yc / depth * fx + cy   # image Y down, world Y up

    return u.astype(np.float32), v.astype(np.float32), in_front


def _composite_white(rgba_image):
    """Composite RGBA onto white background, return RGB."""
    bg = Image.new("RGBA", rgba_image.size, (255, 255, 255, 255))
    bg.paste(rgba_image, mask=rgba_image.split()[3])
    return bg.convert("RGB")


def remesh(voxel_res):
    """
    Re-run space carving + marching cubes at a different voxel resolution.
    Uses the cached carve inputs from the most recent run() call.
    Returns dict with glb_b64 key, same as run().
    """
    if not _carve_cache:
        return {'error': 'No cached carve data — run a generation first'}

    res = max(32, min(512, int(voxel_res)))
    print(f"  [reconstruct3d] remesh at {res}³ …", flush=True)

    voxel_grid = _space_carve(
        _carve_cache['poses'],
        _carve_cache['masks'],
        _carve_cache['sizes'],
        voxel_res=res,
    )
    n_solid = int(voxel_grid.sum())
    print(f"  [reconstruct3d] {n_solid} solid voxels ({n_solid / res ** 3 * 100:.1f}%)", flush=True)

    if n_solid < 8:
        return {'error': 'space carving produced no solid voxels'}

    voxel_grid = _postprocess_voxels(voxel_grid, res)

    step = 2.0 / res
    verts, faces, _, _ = marching_cubes(
        voxel_grid,
        level=0.5,
        spacing=(step, step, step),
    )
    verts -= 1.0
    faces = faces[:, ::-1]
    print(f"  [reconstruct3d] mesh: {len(verts)} verts, {len(faces)} faces", flush=True)

    if len(verts) == 0 or len(faces) == 0:
        return {'error': 'marching cubes produced an empty mesh'}

    import trimesh
    print("  [reconstruct3d] projecting multi-view texture …", flush=True)
    vertex_colors = _multiview_color_vertices(
        verts, faces,
        _carve_cache['color_imgs'],
        _carve_cache['poses'],
        _carve_cache['sizes'],
    )
    mesh = trimesh.Trimesh(vertices=verts, faces=faces, vertex_colors=vertex_colors, process=False)

    with tempfile.NamedTemporaryFile(suffix='.glb', delete=False) as f:
        tmp = f.name
    try:
        mesh.export(tmp)
        with open(tmp, 'rb') as f:
            glb_bytes = f.read()
    finally:
        os.unlink(tmp)

    return {'glb_b64': base64.b64encode(glb_bytes).decode('utf-8')}


def _postprocess_voxels(voxel_grid, res):
    """
    1. Keep only the largest connected component — removes floating debris.
    2. Gaussian-smooth the binary grid so marching cubes produces a smooth
       isosurface instead of blocky stair-steps.
    Returns a float32 grid ready for marching_cubes(level=0.5).
    """
    labeled_grid, n = label(voxel_grid)
    if n > 1:
        sizes = np.bincount(labeled_grid.ravel())
        sizes[0] = 0
        voxel_grid = labeled_grid == sizes.argmax()
        print(f"  [reconstruct3d] kept largest of {n} components "
              f"({int(voxel_grid.sum())} voxels)", flush=True)

    # Gaussian blur — sigma=1 voxel gives smooth curvature without over-shrinking.
    return gaussian_filter(voxel_grid.astype(np.float32), sigma=1.0)


def _front_texture(front_rgba, tex_size=512):
    """
    Crop the RGBA cutout to its tight bounding box, composite on white,
    and resize to tex_size × tex_size. Cropping ensures the UV space
    (which is mapped to actual mesh extents) is filled with car pixels
    rather than padding.
    """
    alpha = np.array(front_rgba)[:, :, 3]
    ys, xs = np.where(alpha > 10)
    rgb = _composite_white(front_rgba)
    if len(ys):
        rgb = rgb.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    return rgb.resize((tex_size, tex_size), Image.LANCZOS).convert("RGB")


def _letterbox_mask(rgba_pil, size):
    """
    Letterbox-resize an RGBA image to square, preserving aspect ratio.
    Returns a binary (bool) alpha mask at (size, size).
    The padding area has alpha=0 (transparent) so it won't be treated as fg.
    """
    w, h = rgba_pil.size
    scale = size / max(w, h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = rgba_pil.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2))
    alpha = np.array(canvas)[:, :, 3]
    return alpha > 10


def _letterbox_rgb(rgba_pil, size):
    """Letterbox-resize RGBA to square, composite on white, return RGB PIL Image."""
    w, h = rgba_pil.size
    scale = size / max(w, h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = rgba_pil.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized.split()[3])
    return canvas.convert("RGB")


def _multiview_color_vertices(verts, faces, color_imgs, poses, sizes):
    """
    Multi-view texture projection: paint each vertex by blending all views
    weighted by how directly the face points toward each camera.

    color_imgs: list of PIL RGB images (one per pose, all same size as sizes entries)
    poses:      list of (az_deg, el_deg) matching color_imgs
    sizes:      list of (w, h) for each view's image space

    Returns uint8 RGBA array of shape (N, 4) for use as trimesh vertex_colors.
    """
    # Per-vertex normals: average adjacent face normals
    v0, v1, v2 = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    fn = np.cross(v1 - v0, v2 - v0)
    fn_len = np.linalg.norm(fn, axis=1, keepdims=True)
    fn = fn / (fn_len + 1e-8)

    vn = np.zeros_like(verts)
    for k in range(3):
        np.add.at(vn, faces[:, k], fn)
    vn_len = np.linalg.norm(vn, axis=1, keepdims=True)
    vn = vn / (vn_len + 1e-8)

    color_sum  = np.zeros((len(verts), 3), dtype=np.float64)
    weight_sum = np.zeros(len(verts),      dtype=np.float64)

    for i, ((az, el), (w, h)) in enumerate(zip(poses, sizes)):
        img_arr = np.array(color_imgs[i])     # (h, w, 3) uint8

        u, v, in_front = _project(verts, az, el, w, h)
        in_image = (u >= 0) & (u < w) & (v >= 0) & (v < h)
        visible  = in_front & in_image

        # Camera direction: normalised vector from vertex toward camera centre
        a   = math.radians(az)
        e_r = math.radians(el)
        cam_pos = np.array([
            math.cos(e_r) * math.sin(a) * CAM_DIST,
            math.sin(e_r)               * CAM_DIST,
            math.cos(e_r) * math.cos(a) * CAM_DIST,
        ])
        to_cam = cam_pos - verts
        to_cam = to_cam / (np.linalg.norm(to_cam, axis=1, keepdims=True) + 1e-8)

        # Weight = cosine of angle between face normal and camera direction
        cos_w   = np.einsum('ij,ij->i', vn, to_cam)
        weights = np.maximum(cos_w, 0) * visible

        mask = weights > 0.05   # discard grazing-angle contributions
        if not mask.any():
            continue

        ui = np.clip(np.round(u).astype(np.int32), 0, w - 1)
        vi = np.clip(np.round(v).astype(np.int32), 0, h - 1)

        sampled  = img_arr[vi[mask], ui[mask]].astype(np.float64)
        w_vals   = weights[mask]

        indices = np.where(mask)[0]
        np.add.at(color_sum,  indices, sampled * w_vals[:, np.newaxis])
        np.add.at(weight_sum, indices, w_vals)

    # Compose final RGBA — default gray for vertices with no view coverage
    rgba = np.full((len(verts), 4), [180, 180, 180, 255], dtype=np.uint8)
    valid = weight_sum > 0
    rgba[valid, :3] = np.clip(
        color_sum[valid] / weight_sum[valid, np.newaxis], 0, 255
    ).astype(np.uint8)

    covered_pct = valid.sum() / len(verts) * 100
    print(f"  [reconstruct3d] vertex color coverage: {covered_pct:.1f}%", flush=True)
    return rgba
