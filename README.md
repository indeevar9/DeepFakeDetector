# DeepShield AI

AI-powered deepfake detection — a single-page dashboard app (landing page + Scan/Analytics/History/Settings) backed by a Flask API.

## Folder structure

```
DeepShield-AI/
├── frontend/          → the full app: landing page + Scan/Analytics/History/Settings SPA
│   ├── index.html
│   ├── style.css
│   └── script.js
└── backend/            → Flask API that powers real scans
    ├── app.py
    ├── requirements.txt
    ├── detectors/
    │   └── deepfake_detector.py   ← swap in a real model here later
    └── uploads/                    (scratch folder, files are deleted right after each scan)
```

`frontend/index.html` is both the marketing/landing page and the app — the "Try Now" button doesn't navigate anywhere, it just reveals the dashboard section in place, all on one deployed site.

## Deploying to Netlify

Netlify serves **static** sites — `frontend/` deploys there directly. Flask (`backend/`) will **not** run on Netlify and needs to be deployed separately.

**frontend/** → connect the GitHub repo in Netlify, leave the build command empty (no build step, it's plain HTML/CSS/JS), and set the publish directory to `frontend`.

**backend/** → deploy separately to a host that runs Python, e.g. [Render](https://render.com), [Railway](https://railway.app), or [Fly.io](https://fly.io). Start command: `gunicorn app:app`. Once it's live, update `API_BASE` in `frontend/script.js` (currently `http://localhost:5000`) to your deployed backend's URL.

**Note:** if you deploy only the frontend without the backend, scans still work — `script.js` automatically falls back to a local mock detector when it can't reach `API_BASE`, so the demo never breaks. Point `API_BASE` at your real backend whenever it's live to get real API-driven results (currently the backend itself also returns mock results — see below).

## Running the backend locally

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python3 app.py
```

Runs on `http://localhost:5000`. Endpoints:
- `GET /health` — health check
- `POST /scan` — multipart form upload, field name `file` → returns `{ result, confidence, reason, summary, time }`

## Plugging in a real model

Everything scoring-related lives in `backend/detectors/deepfake_detector.py`, isolated from the Flask routing in `app.py`. Right now `analyze_file()` returns a randomized, plausible-looking result so the whole app works end-to-end without a trained model. Replace the body of that function with a real model call (PyTorch/TensorFlow/ONNX, or a call out to a hosted inference API) and keep the same return shape — nothing else in the app needs to change.

## Fonts

Headings use **Space Grotesk** via Google Fonts CDN — free for commercial use, no local files needed. Body text uses **Outfit**.
