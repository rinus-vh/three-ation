#!/usr/bin/env python3
"""
Three·ation — local 3D generation server.

Each pipeline stage lives in server/stages/<name>.py and exposes a single
run(image) function.  Stages are loaded at startup; missing dependencies
disable a stage gracefully — the server still starts with whatever is available.

Run:   python server/server.py
"""
import base64
import datetime
import io
import json
import re
import sys
import threading
import uuid
import zipfile
from collections import deque

import logging

from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image

app = Flask(__name__)

# Suppress access-log noise for polling endpoints (logs, health, job status).
# These fire every second and drown out meaningful output in the terminal.
class _SuppressPollingFilter(logging.Filter):
    _PATTERN = re.compile(r'"(?:GET|OPTIONS) /(?:logs|health|job/)')

    def filter(self, record):
        return not self._PATTERN.search(record.getMessage())

logging.getLogger('werkzeug').addFilter(_SuppressPollingFilter())
CORS(app)

# ---------------------------------------------------------------------------
# Log capture — intercept stdout/stderr into a rolling buffer so the browser
# can poll /logs and display live server output.
# ---------------------------------------------------------------------------
_LOG_LOCK  = threading.Lock()
_LOG_LINES = deque(maxlen=500)
_LOG_SEQ   = 0
# Seq of the last carriage-return line (tqdm progress bar); None when not in a
# progress context.  New \r writes overwrite this entry so the browser panel
# shows a single updating line instead of 30 separate ones.
_PROGRESS_SEQ = None

# Suppress noisy polling endpoints from the log buffer to avoid feedback loops.
_SKIP_LOG_RE = re.compile(r'"(?:GET|OPTIONS) /(?:logs(?:\?|$)|health(?:\?| |$)|job/)')


class _Tee:
    """Write to the original stream AND append to the log buffer."""

    def __init__(self, orig):
        self._orig = orig

    def write(self, text):
        global _LOG_SEQ, _PROGRESS_SEQ
        self._orig.write(text)
        if not text or _SKIP_LOG_RE.search(text):
            return
        # Strip all leading \r and trailing whitespace/newlines for storage.
        line = text.strip('\r\n')
        if not line:
            return
        # tqdm uses \r to overwrite the current line.  Detect this and update
        # the last buffered entry in-place (with a new seq so clients re-fetch).
        is_overwrite = text.startswith('\r') and '\n' not in text
        with _LOG_LOCK:
            if is_overwrite and _PROGRESS_SEQ is not None and _LOG_LINES and _LOG_LINES[-1]['seq'] == _PROGRESS_SEQ:
                _LOG_SEQ += 1
                _LOG_LINES[-1] = {'seq': _LOG_SEQ, 'text': line}
                _PROGRESS_SEQ = _LOG_SEQ
            else:
                _LOG_SEQ += 1
                _LOG_LINES.append({'seq': _LOG_SEQ, 'text': line})
                _PROGRESS_SEQ = _LOG_SEQ if is_overwrite else None

    def flush(self):
        self._orig.flush()

    def fileno(self):
        return self._orig.fileno()


sys.stdout = _Tee(sys.stdout)
sys.stderr = _Tee(sys.stderr)

# ---------------------------------------------------------------------------
# Job registry — long-running stages run in background threads so the HTTP
# connection is never held open.  Browser polls GET /job/<id> for status.
# ---------------------------------------------------------------------------
_JOBS_LOCK = threading.Lock()
_JOBS: dict = {}  # job_id -> {status, result, error}

# ---------------------------------------------------------------------------
# Debug store — holds the last generation's inputs/outputs for download.
# TODO: Remove this debug feature once reconstruction quality is validated.
# ---------------------------------------------------------------------------
_DEBUG_LOCK = threading.Lock()
_debug_last: dict = {}


def _start_job(fn, *args):
    """Run fn(*args) in a daemon thread; return a job_id the client can poll."""
    job_id = str(uuid.uuid4())
    with _JOBS_LOCK:
        _JOBS[job_id] = {'status': 'running', 'result': None, 'error': None}

    def _run():
        try:
            result = fn(*args)
            with _JOBS_LOCK:
                _JOBS[job_id] = {'status': 'done', 'result': result, 'error': None}
        except Exception as exc:
            import traceback
            traceback.print_exc()
            with _JOBS_LOCK:
                _JOBS[job_id] = {'status': 'error', 'result': None, 'error': str(exc)}

    threading.Thread(target=_run, daemon=True).start()
    return job_id


# ---------------------------------------------------------------------------
# Stage registry — populated at startup, keyed by capability name.
# ---------------------------------------------------------------------------
STAGES = {}


def _load_stages():
    print("Three·ation server — loading stages…", flush=True)

    try:
        from stages import depth
        STAGES["depth"] = depth
        print("  ✓ depth        (Depth-Anything V2 Small)", flush=True)
    except Exception as exc:
        print(f"  ✗ depth        — {exc}", flush=True)

    try:
        from stages import reconstruct
        STAGES["reconstruct"] = reconstruct
        print("  ✓ reconstruct  (TripoSR)", flush=True)
    except Exception as exc:
        print(f"  ✗ reconstruct  — {exc}", flush=True)

    try:
        from stages import multiview
        STAGES["multiview"] = multiview
        print("  ✓ multiview    (Zero123++)", flush=True)
    except Exception as exc:
        print(f"  ✗ multiview    — {exc}", flush=True)

    try:
        import open3d  # noqa: F401
        from stages import reconstruct3d
        STAGES["reconstruct3d"] = reconstruct3d
        print("  ✓ reconstruct3d (Open3D Poisson)", flush=True)
    except Exception as exc:
        print(f"  ✗ reconstruct3d — {exc}", flush=True)

    if not STAGES:
        print("  No stages loaded — check requirements.", flush=True)
    print(flush=True)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return jsonify({"status": "ok", "capabilities": list(STAGES.keys())})


@app.get("/logs")
def logs():
    since = int(request.args.get('since', 0))
    with _LOG_LOCK:
        lines = [l for l in _LOG_LINES if l['seq'] > since]
    return jsonify(lines)


@app.get("/debug-package")
def debug_package():
    # TODO: Remove this debug endpoint once reconstruction quality is validated.
    with _DEBUG_LOCK:
        d = dict(_debug_last)
    if not d.get('timestamp'):
        return jsonify({'error': 'No debug data yet — run a generation first'}), 404

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        if d.get('input_b64'):
            zf.writestr('input.png', base64.b64decode(d['input_b64']))
        for i, v in enumerate(d.get('views_b64', [])):
            zf.writestr(f'view_{i + 1:02d}.png', base64.b64decode(v))
        if d.get('grid_b64'):
            zf.writestr('grid.png', base64.b64decode(d['grid_b64']))
        with _LOG_LOCK:
            log_text = '\n'.join(line['text'] for line in _LOG_LINES)
        zf.writestr('server_log.txt', log_text)
        meta = {
            'timestamp': d['timestamp'],
            'steps':     d.get('steps'),
            'scheduler': d.get('scheduler'),
            'n_views':   len(d.get('views_b64', [])),
        }
        zf.writestr('metadata.json', json.dumps(meta, indent=2))

    buf.seek(0)
    from flask import Response
    ts = d['timestamp']
    filename = f'threeation-debug-{ts}.zip'
    return Response(
        buf.getvalue(),
        mimetype='application/zip',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )


@app.post("/remesh")
def remesh():
    if "reconstruct3d" not in STAGES:
        return jsonify({"error": "reconstruct3d stage not available"}), 503
    data = request.get_json(force=True)
    voxel_res = int(data.get("voxel_res", 128))
    job_id = _start_job(STAGES["reconstruct3d"].remesh, voxel_res)
    return jsonify({"job_id": job_id})


@app.post("/depth")
def depth():
    if "depth" not in STAGES:
        return jsonify({"error": "depth stage not available"}), 503
    image = _decode_image(request.get_json()["image"], mode="RGB")
    return jsonify(STAGES["depth"].run(image))


@app.post("/reconstruct")
def reconstruct():
    if "reconstruct" not in STAGES:
        return jsonify({"error": "reconstruct stage not available"}), 503
    image = _decode_image(request.get_json()["image"], mode="RGBA")
    return jsonify(STAGES["reconstruct"].run(image))


@app.post("/multiview")
def multiview():
    if "multiview" not in STAGES:
        return jsonify({"error": "multiview stage not available"}), 503
    body      = request.get_json()
    image     = _decode_image(body["image"], mode="RGBA")
    steps     = int(body.get("steps",     20))
    scheduler = str(body.get("scheduler", "dpm++"))

    # Inline job creation so we can pass a live preview callback.
    job_id = str(uuid.uuid4())
    with _JOBS_LOCK:
        _JOBS[job_id] = {'status': 'running', 'result': None, 'error': None, 'preview': None}

    def on_preview(data):
        with _JOBS_LOCK:
            if job_id in _JOBS and _JOBS[job_id]['status'] == 'running':
                _JOBS[job_id]['preview'] = data

    def _run():
        try:
            result = STAGES["multiview"].run(image, on_preview=on_preview, steps=steps, scheduler=scheduler)
            with _JOBS_LOCK:
                _JOBS[job_id] = {'status': 'done', 'result': result, 'error': None, 'preview': None}
            # Store for debug package
            with _DEBUG_LOCK:
                _debug_last.update({
                    'timestamp': datetime.datetime.now().strftime('%Y%m%d_%H%M%S'),
                    'input_b64': base64.b64encode(
                        _image_to_png_bytes(image)
                    ).decode(),
                    'views_b64': result.get('views', []),
                    'grid_b64':  result.get('grid', ''),
                    'steps':     steps,
                    'scheduler': scheduler,
                })
        except Exception as exc:
            import traceback
            traceback.print_exc()
            with _JOBS_LOCK:
                _JOBS[job_id] = {'status': 'error', 'result': None, 'error': str(exc), 'preview': None}

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"job_id": job_id})


@app.post("/reconstruct3d")
def reconstruct3d():
    if "reconstruct3d" not in STAGES:
        return jsonify({"error": "reconstruct3d stage not available"}), 503
    body  = request.get_json()
    grid  = _decode_image(body["grid"],  mode="RGB")
    front = _decode_image(body["front"], mode="RGBA")
    job_id = _start_job(STAGES["reconstruct3d"].run, grid, front)
    return jsonify({"job_id": job_id})


@app.get("/job/<job_id>")
def job_status(job_id):
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
    if not job:
        return jsonify({"error": "job not found"}), 404
    return jsonify(job)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _decode_image(b64_str, mode="RGB"):
    img_bytes = base64.b64decode(b64_str)
    return Image.open(io.BytesIO(img_bytes)).convert(mode)


def _image_to_png_bytes(pil_image):
    buf = io.BytesIO()
    pil_image.save(buf, format='PNG')
    return buf.getvalue()


# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import platform, subprocess, atexit

    # On macOS, prevent the system from idle-sleeping while the server is running.
    # caffeinate -i: prevent idle sleep; -m: prevent disk sleep.
    # This keeps inference alive if you walk away — it does NOT prevent lid-close sleep.
    _caffeinate = None
    if platform.system() == "Darwin":
        try:
            _caffeinate = subprocess.Popen(["caffeinate", "-i", "-m"])
            atexit.register(_caffeinate.terminate)
            print("  ☕ caffeinate active — system won't idle-sleep during inference", flush=True)
        except FileNotFoundError:
            pass

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    _load_stages()
    print(f"Listening on http://127.0.0.1:{port}", flush=True)
    print("Keep this terminal open while you use the app.\n", flush=True)
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
