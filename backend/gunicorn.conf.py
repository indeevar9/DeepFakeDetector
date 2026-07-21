"""
DeepShield AI v3 — Gunicorn configuration (memory-optimized for free tier)
"""

import os

port = os.environ.get("PORT", "10000")
bind = f"0.0.0.0:{port}"

# Only 1 worker, 1 thread — minimizes memory since each worker would
# otherwise load its own separate copy of the PyTorch model into memory.
workers = 1
worker_class = "sync"
threads = 1

timeout = 180
graceful_timeout = 30
keepalive = 5

accesslog = "-"
errorlog = "-"
loglevel = "info"

proc_name = "deepshield-ai-v3"

# Preload so the model loads once before forking (only matters with >1
# worker, but harmless here and keeps startup behavior predictable).
preload_app = True

# Restart the worker fairly often to release any memory that gradually
# builds up across many inference calls.
max_requests = 20
max_requests_jitter = 5
