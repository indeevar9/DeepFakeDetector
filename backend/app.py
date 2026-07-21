"""
DeepShield AI v3 — Backend
Flask + PyTorch inference server for real/fake image detection
using a fine-tuned EfficientNet-B0 model (best_model-v3.pt).

Memory-optimized version for low-RAM free hosting tiers.
"""

import os

# IMPORTANT: these environment variables must be set BEFORE importing torch.
# They force PyTorch/MKL/OpenMP to use a single thread instead of spawning
# multiple internal worker threads, which significantly reduces baseline
# memory usage on small (512MB) instances.
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

import io
import gc
import logging
import tempfile
import socket
import ipaddress
from datetime import datetime
from urllib.parse import urlparse, urljoin

import cv2
import requests
from bs4 import BeautifulSoup

import torch
torch.set_num_threads(1)
torch.set_grad_enabled(False)  # we never need gradients for inference

import torch.nn as nn
import torch.nn.functional as F
from torchvision import models, transforms
from PIL import Image, UnidentifiedImageError

from flask import Flask, request, jsonify
from flask_cors import CORS

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("deepshield")

# ---------------------------------------------------------------------------
# Flask app setup
# ---------------------------------------------------------------------------

app = Flask(__name__)

CORS(
    app,
    resources={r"/*": {"origins": "*"}},
    supports_credentials=False,
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "OPTIONS"],
)

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
# Single-image endpoint keeps a tight 6MB cap to protect low-RAM instances.
# Raised overall to fit small batches and video uploads (each route enforces
# its own tighter per-file cap below).
app.config["MAX_CONTENT_LENGTH"] = 60 * 1024 * 1024

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "bmp"}
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "mov", "avi", "webm", "mkv", "m4v"}
MAX_SINGLE_FILE_BYTES = 6 * 1024 * 1024
MAX_BATCH_FILES = 15
MAX_VIDEO_FILE_BYTES = 50 * 1024 * 1024
MAX_VIDEO_FRAMES = 12  # sampled evenly across the video's duration

URL_REQUEST_TIMEOUT = 8  # seconds
MAX_URL_PAGE_BYTES = 5 * 1024 * 1024
MAX_URL_IMAGES = 8
MAX_URL_IMAGE_BYTES = 6 * 1024 * 1024
URL_SHORTENER_DOMAINS = {
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly",
    "shorte.st", "adf.ly", "rebrand.ly", "cutt.ly", "rb.gy", "shorturl.at",
    "tiny.cc", "s.id", "lnkd.in",
}
SUSPICIOUS_KEYWORDS = [
    "login", "verify", "secure", "account", "update", "confirm",
    "banking", "password", "signin", "wallet", "reset", "unlock",
]

MODEL_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "best_model-v3.pt"
)

CLASS_NAMES = ["REAL", "FAKE"]
NUM_CLASSES = len(CLASS_NAMES)

DEVICE = torch.device("cpu")

IMAGE_SIZE = 224

preprocess = transforms.Compose(
    [
        transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
        ),
    ]
)

model = None
model_load_error = None


def build_efficientnet_b0(num_classes: int) -> nn.Module:
    net = models.efficientnet_b0(weights=None)
    in_features = net.classifier[1].in_features
    net.classifier[1] = nn.Linear(in_features, num_classes)
    return net


def load_model():
    global model, model_load_error

    if not os.path.exists(MODEL_PATH):
        model_load_error = f"Model file not found at {MODEL_PATH}"
        logger.error(model_load_error)
        return

    try:
        checkpoint = torch.load(MODEL_PATH, map_location=DEVICE, weights_only=False)
    except Exception as e:
        model_load_error = f"Failed to torch.load model file: {e}"
        logger.error(model_load_error)
        return

    try:
        if isinstance(checkpoint, nn.Module):
            loaded_model = checkpoint
            logger.info("Loaded model as a full serialized nn.Module.")

        elif isinstance(checkpoint, dict):
            if "model_state_dict" in checkpoint:
                state_dict = checkpoint["model_state_dict"]
            elif "state_dict" in checkpoint:
                state_dict = checkpoint["state_dict"]
            else:
                state_dict = checkpoint

            cleaned_state_dict = {
                (k[7:] if k.startswith("module.") else k): v
                for k, v in state_dict.items()
            }

            loaded_model = build_efficientnet_b0(NUM_CLASSES)
            missing, unexpected = loaded_model.load_state_dict(
                cleaned_state_dict, strict=False
            )
            if missing:
                logger.warning(f"Missing keys: {missing}")
            if unexpected:
                logger.warning(f"Unexpected keys: {unexpected}")
            logger.info("Loaded model via state_dict into EfficientNet-B0.")

        else:
            model_load_error = f"Unrecognized checkpoint format: {type(checkpoint)}"
            logger.error(model_load_error)
            return

        loaded_model.to(DEVICE)
        loaded_model.eval()

        # Free the raw checkpoint object immediately — once weights are
        # loaded into loaded_model, the original checkpoint (which can be
        # a large duplicate copy of all tensors) is no longer needed.
        del checkpoint
        gc.collect()

        model = loaded_model
        logger.info(f"DeepShield model loaded successfully on device: {DEVICE}")

    except Exception as e:
        model_load_error = f"Failed to construct/load model weights: {e}"
        logger.error(model_load_error)


load_model()


def allowed_file(filename: str) -> bool:
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    )


def allowed_video_file(filename: str) -> bool:
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_VIDEO_EXTENSIONS
    )


def extract_video_frames(video_path: str, max_frames: int):
    """
    Sample up to `max_frames` frames evenly across the video's duration.
    Returns a list of (timestamp_seconds, PIL.Image) tuples. Raises
    ValueError if the video can't be opened or has no readable frames.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        cap.release()
        raise ValueError("Could not open the uploaded video. It may be corrupt or an unsupported codec.")

    try:
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        fps = cap.get(cv2.CAP_PROP_FPS) or 0

        if total_frames <= 0:
            raise ValueError("The uploaded video has no readable frames.")

        sample_count = min(max_frames, total_frames)
        # Evenly spaced frame indices across the whole video (avoids just
        # sampling the first second, which single-shot deepfakes could game).
        if sample_count == 1:
            frame_indices = [total_frames // 2]
        else:
            frame_indices = [
                round(i * (total_frames - 1) / (sample_count - 1)) for i in range(sample_count)
            ]

        frames = []
        for idx in frame_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            success, frame_bgr = cap.read()
            if not success or frame_bgr is None:
                continue
            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(frame_rgb)
            timestamp = (idx / fps) if fps > 0 else None
            frames.append((timestamp, pil_image))

        if not frames:
            raise ValueError("Could not read any frames from the uploaded video.")

        return frames

    finally:
        cap.release()


def is_public_hostname(hostname: str) -> bool:
    """
    Resolve a hostname and confirm every address it maps to is a public,
    routable IP. Blocks localhost, private/internal ranges, link-local, and
    other non-public addresses so this endpoint can't be used as an SSRF
    proxy to reach internal services from the server.
    """
    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False

    for info in addr_infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            return False
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            return False

    return True


def check_url_heuristics(parsed_url) -> list:
    """
    Free, no-API-key heuristic checks for phishing-style URL patterns.
    This is pattern-matching, not a verified threat-intelligence source —
    flags are signals worth a second look, not proof of malice.
    """
    flags = []
    hostname = (parsed_url.hostname or "").lower()
    full_url = parsed_url.geturl()

    if parsed_url.scheme != "https":
        flags.append("Connection is not HTTPS — data sent to this site isn't encrypted in transit.")

    try:
        ipaddress.ip_address(hostname)
        flags.append("The address uses a raw IP instead of a domain name, a common phishing pattern.")
    except ValueError:
        pass

    if hostname in URL_SHORTENER_DOMAINS:
        flags.append("This is a URL-shortener link — the real destination is hidden until you click it.")

    if "xn--" in hostname:
        flags.append("The domain uses punycode, which can be used to mimic a trusted brand with lookalike characters.")

    if hostname.count(".") >= 4:
        flags.append("Unusually many subdomains, sometimes used to disguise the real domain.")

    if hostname.count("-") >= 4:
        flags.append("Unusually many hyphens in the domain name.")

    if len(full_url) > 150:
        flags.append("Unusually long URL.")

    if "@" in parsed_url.netloc:
        flags.append("The URL contains an '@' in the address — text before it can mask the real destination.")

    hit_keywords = [kw for kw in SUSPICIOUS_KEYWORDS if kw in full_url.lower()]
    if hit_keywords:
        flags.append(
            "Contains sensitive-sounding keywords ("
            + ", ".join(sorted(set(hit_keywords))[:4])
            + ") — double-check this is really the site it claims to be."
        )

    return flags


def extract_page_images(html: str, base_url: str, max_images: int) -> list:
    """
    Parse HTML and collect up to `max_images` absolute image URLs, preferring
    the page's og:image / twitter:image (usually the representative image)
    before falling back to <img> tags in document order.
    """
    soup = BeautifulSoup(html, "html.parser")
    urls = []
    seen = set()

    def add(url):
        if not url or url in seen:
            return
        absolute = urljoin(base_url, url.strip())
        parsed = urlparse(absolute)
        if parsed.scheme not in ("http", "https"):
            return
        if absolute in seen:
            return
        seen.add(absolute)
        urls.append(absolute)

    for meta_name in ("og:image", "twitter:image", "twitter:image:src"):
        tag = soup.find("meta", attrs={"property": meta_name}) or soup.find("meta", attrs={"name": meta_name})
        if tag and tag.get("content"):
            add(tag["content"])

    for img in soup.find_all("img"):
        if len(urls) >= max_images:
            break
        src = img.get("src") or img.get("data-src")
        add(src)

    title_tag = soup.find("title")
    page_title = title_tag.get_text(strip=True) if title_tag else None

    return urls[:max_images], page_title


def build_explanation(label: str, confidence: float) -> str:
    if label == "REAL":
        if confidence >= 90:
            return (
                "The model found strong evidence of natural image characteristics "
                "consistent with an authentic, unaltered photograph."
            )
        return (
            "The model leans towards this being a real image, though some "
            "patterns were slightly ambiguous."
        )
    else:
        if confidence >= 90:
            return (
                "The model detected strong indicators of synthetic generation or "
                "manipulation, such as unnatural textures or inconsistent artifacts."
            )
        return (
            "The model leans towards this being a fake or manipulated image, "
            "though some indicators were less pronounced."
        )


@app.route("/", methods=["GET"])
def index():
    return jsonify({"status": "DeepShield AI v3 running"}), 200


@app.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok",
            "model_loaded": model is not None,
            "model_error": model_load_error,
            "device": str(DEVICE),
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
    ), 200


def classify_pil_image(image: Image.Image, filename: str) -> dict:
    """
    Run preprocess -> inference -> postprocess on an already-decoded PIL
    image. Shared by single-image scans, batch scans, and per-frame video
    scans. Raises RuntimeError on inference failure.
    """
    input_tensor = None
    outputs = None
    try:
        # Downscale very large images immediately to cap peak memory use
        # before we even get to the model's own 224x224 resize.
        image = image.copy()
        image.thumbnail((768, 768))

        input_tensor = preprocess(image).unsqueeze(0).to(DEVICE)

        outputs = model(input_tensor)
        probabilities = F.softmax(outputs, dim=1)[0]

        confidence_tensor, predicted_idx = torch.max(probabilities, dim=0)
        predicted_idx = predicted_idx.item()
        confidence = float(confidence_tensor.item()) * 100.0

        # Also surface the raw FAKE probability (index of "FAKE" in
        # CLASS_NAMES) so callers that aggregate across many frames can
        # average a consistent signal rather than mixing REAL/FAKE confidences.
        fake_idx = CLASS_NAMES.index("FAKE") if "FAKE" in CLASS_NAMES else None
        fake_probability = (
            float(probabilities[fake_idx].item()) * 100.0 if fake_idx is not None else None
        )

        if predicted_idx >= len(CLASS_NAMES):
            label = "UNKNOWN"
        else:
            label = CLASS_NAMES[predicted_idx]

        explanation = build_explanation(label, confidence)

        result = {
            "result": label,
            "confidence": round(confidence, 2),
            "fake_probability": round(fake_probability, 2) if fake_probability is not None else None,
            "explanation": explanation,
            "filename": filename,
        }

        logger.info(f"Scan complete: {filename} -> {label} ({confidence:.2f}%)")
        return result

    except Exception as e:
        logger.error(f"Inference error on '{filename}': {e}")
        raise RuntimeError(f"Inference failed: {e}")

    finally:
        del input_tensor, outputs
        gc.collect()


def classify_image_bytes(image_bytes: bytes, filename: str) -> dict:
    """
    Decode raw image bytes and classify them via classify_pil_image.
    Raises ValueError (bad image) or RuntimeError (inference failure).
    """
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except UnidentifiedImageError:
        raise ValueError("The uploaded file is not a valid image.")
    except Exception as e:
        logger.error(f"Error reading uploaded image '{filename}': {e}")
        raise ValueError("Failed to read the uploaded image.")

    try:
        return classify_pil_image(image, filename)
    finally:
        del image
        gc.collect()


@app.route("/scan", methods=["POST"])
def scan():
    if model is None:
        return (
            jsonify(
                {
                    "error": "Model is not loaded on the server. "
                    + (model_load_error or "Unknown error."),
                }
            ),
            503,
        )

    if "file" not in request.files:
        return jsonify({"error": "No file part in the request. Expected field name 'file'."}), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"error": "No file selected."}), 400

    if not allowed_file(file.filename):
        return jsonify(
            {"error": "Unsupported file type. Allowed: png, jpg, jpeg, webp, bmp."}
        ), 400

    image_bytes = file.read()

    if len(image_bytes) > MAX_SINGLE_FILE_BYTES:
        return jsonify({"error": "File too large. Maximum upload size is 6MB."}), 413

    try:
        response = classify_image_bytes(image_bytes, file.filename)
        return jsonify(response), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500
    finally:
        del image_bytes
        gc.collect()


@app.route("/scan-batch", methods=["POST"])
def scan_batch():
    """
    Batch version of /scan. Accepts multiple files under the field name
    'files' and runs inference on each sequentially (kept sequential rather
    than parallel to stay within low-RAM hosting limits). A failure on one
    image does not abort the rest of the batch — each result carries its
    own success/error status.
    """
    if model is None:
        return (
            jsonify(
                {
                    "error": "Model is not loaded on the server. "
                    + (model_load_error or "Unknown error."),
                }
            ),
            503,
        )

    files = request.files.getlist("files")

    if not files:
        return jsonify({"error": "No files provided. Expected field name 'files'."}), 400

    if len(files) > MAX_BATCH_FILES:
        return (
            jsonify(
                {"error": f"Too many files. Maximum {MAX_BATCH_FILES} images per batch scan."}
            ),
            400,
        )

    results = []

    for file in files:
        filename = file.filename or "unknown"

        if filename == "":
            results.append({"filename": "unknown", "error": "No file selected."})
            continue

        if not allowed_file(filename):
            results.append(
                {
                    "filename": filename,
                    "error": "Unsupported file type. Allowed: png, jpg, jpeg, webp, bmp.",
                }
            )
            continue

        image_bytes = None
        try:
            image_bytes = file.read()

            if len(image_bytes) > MAX_SINGLE_FILE_BYTES:
                results.append(
                    {"filename": filename, "error": "File too large. Maximum size is 6MB."}
                )
                continue

            result = classify_image_bytes(image_bytes, filename)
            results.append(result)

        except ValueError as e:
            results.append({"filename": filename, "error": str(e)})
        except RuntimeError as e:
            results.append({"filename": filename, "error": str(e)})
        finally:
            del image_bytes
            gc.collect()

    succeeded = sum(1 for r in results if "error" not in r)
    logger.info(f"Batch scan complete: {succeeded}/{len(results)} succeeded.")

    return jsonify({"results": results, "total": len(results), "succeeded": succeeded}), 200


@app.route("/scan-video", methods=["POST"])
def scan_video():
    """
    Samples up to MAX_VIDEO_FRAMES frames evenly across the uploaded video
    and runs the same image classifier on each frame, then aggregates the
    per-frame results into an overall verdict. This reuses the existing
    EfficientNet-B0 image model rather than requiring a dedicated video
    model — it's a reasonable first pass, but note that it evaluates
    per-frame visual artifacts only and does not analyze temporal/motion
    consistency between frames.
    """
    if model is None:
        return (
            jsonify(
                {
                    "error": "Model is not loaded on the server. "
                    + (model_load_error or "Unknown error."),
                }
            ),
            503,
        )

    if "file" not in request.files:
        return jsonify({"error": "No file part in the request. Expected field name 'file'."}), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"error": "No file selected."}), 400

    if not allowed_video_file(file.filename):
        return (
            jsonify(
                {
                    "error": "Unsupported video type. Allowed: "
                    + ", ".join(sorted(ALLOWED_VIDEO_EXTENSIONS))
                    + "."
                }
            ),
            400,
        )

    video_bytes = file.read()
    if len(video_bytes) > MAX_VIDEO_FILE_BYTES:
        return (
            jsonify(
                {
                    "error": f"Video too large. Maximum size is "
                    f"{MAX_VIDEO_FILE_BYTES // (1024 * 1024)}MB."
                }
            ),
            413,
        )

    tmp_path = None
    frames = []

    try:
        suffix = "." + file.filename.rsplit(".", 1)[1].lower()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(video_bytes)
            tmp_path = tmp.name

        frames = extract_video_frames(tmp_path, MAX_VIDEO_FRAMES)

        frame_results = []
        fake_probs = []

        for i, (timestamp, pil_image) in enumerate(frames):
            try:
                r = classify_pil_image(pil_image, f"frame_{i}")
                frame_results.append(
                    {
                        "frame_index": i,
                        "timestamp_seconds": round(timestamp, 2) if timestamp is not None else None,
                        "result": r["result"],
                        "confidence": r["confidence"],
                    }
                )
                if r.get("fake_probability") is not None:
                    fake_probs.append(r["fake_probability"])
            except RuntimeError as e:
                frame_results.append(
                    {
                        "frame_index": i,
                        "timestamp_seconds": round(timestamp, 2) if timestamp is not None else None,
                        "error": str(e),
                    }
                )

        analyzed = [f for f in frame_results if "error" not in f]
        if not analyzed:
            return jsonify({"error": "Inference failed on every sampled frame."}), 500

        fake_frame_count = sum(1 for f in analyzed if f["result"] == "FAKE")
        fake_ratio = fake_frame_count / len(analyzed)

        overall_confidence = (
            sum(fake_probs) / len(fake_probs) if fake_probs
            else sum(f["confidence"] for f in analyzed) / len(analyzed)
        )

        overall_label = "FAKE" if fake_ratio >= 0.5 else "REAL"
        overall_confidence_display = overall_confidence if overall_label == "FAKE" else (100 - overall_confidence)

        explanation = (
            f"{fake_frame_count} of {len(analyzed)} sampled frames were classified as FAKE "
            f"({fake_ratio * 100:.0f}%). "
            + (
                "A majority of frames showed signs of synthetic generation or manipulation."
                if overall_label == "FAKE"
                else "A majority of frames were consistent with authentic, unaltered footage."
            )
        )

        response = {
            "result": overall_label,
            "confidence": round(overall_confidence_display, 2),
            "fake_frame_ratio": round(fake_ratio, 4),
            "frames_analyzed": len(analyzed),
            "frames_sampled": len(frames),
            "frame_results": frame_results,
            "explanation": explanation,
            "filename": file.filename,
        }

        logger.info(
            f"Video scan complete: {file.filename} -> {overall_label} "
            f"({overall_confidence_display:.2f}%, {len(analyzed)} frames)"
        )
        return jsonify(response), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"Video scan error: {e}")
        return jsonify({"error": f"Video scan failed: {e}"}), 500
    finally:
        for _, pil_image in frames:
            try:
                pil_image.close()
            except Exception:
                pass
        del video_bytes, frames
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        gc.collect()


@app.route("/scan-url", methods=["POST"])
def scan_url():
    """
    Fetches a URL, runs free heuristic checks for phishing-style patterns,
    and scans images found on the page with the existing REAL/FAKE model.

    This does NOT verify factual claims on the page (that needs a
    fact-checking/search pipeline, a different system entirely) and does NOT
    classify explicit/NSFW content (that needs a dedicated content-moderation
    model). It only reports URL-pattern heuristics and image authenticity.
    """
    if model is None:
        return (
            jsonify(
                {
                    "error": "Model is not loaded on the server. "
                    + (model_load_error or "Unknown error."),
                }
            ),
            503,
        )

    data = request.get_json(silent=True) or {}
    raw_url = (data.get("url") or "").strip()

    if not raw_url:
        return jsonify({"error": "No URL provided. Expected JSON body: {\"url\": \"...\"}"}), 400

    if not raw_url.lower().startswith(("http://", "https://")):
        raw_url = "https://" + raw_url

    parsed = urlparse(raw_url)
    if not parsed.hostname:
        return jsonify({"error": "That doesn't look like a valid URL."}), 400

    if not is_public_hostname(parsed.hostname):
        return jsonify({"error": "This URL points to a private, local, or otherwise non-public address and cannot be scanned."}), 400

    heuristic_flags = check_url_heuristics(parsed)

    try:
        resp = requests.get(
            parsed.geturl(),
            timeout=URL_REQUEST_TIMEOUT,
            headers={"User-Agent": "DeepShieldAI-URLScanner/1.0"},
            stream=True,
            allow_redirects=True,
        )
    except requests.exceptions.SSLError:
        return jsonify({"error": "SSL certificate error while connecting to this URL."}), 400
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "Could not connect to this URL."}), 400
    except requests.exceptions.Timeout:
        return jsonify({"error": "The request to this URL timed out."}), 400
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Failed to fetch URL: {e}"}), 400

    # Re-validate the final host after redirects (protects against a
    # redirect chain landing on a private/internal address).
    final_host = urlparse(resp.url).hostname
    if not final_host or not is_public_hostname(final_host):
        resp.close()
        return jsonify({"error": "This URL redirects to a private, local, or otherwise non-public address and cannot be scanned."}), 400

    content_type = resp.headers.get("Content-Type", "")
    if "text/html" not in content_type:
        resp.close()
        return jsonify({"error": f"This URL did not return an HTML page (content-type: {content_type or 'unknown'})."}), 400

    html_bytes = b""
    try:
        for chunk in resp.iter_content(chunk_size=65536):
            html_bytes += chunk
            if len(html_bytes) > MAX_URL_PAGE_BYTES:
                break
    finally:
        resp.close()

    try:
        html = html_bytes.decode(resp.encoding or "utf-8", errors="replace")
    except (LookupError, TypeError):
        html = html_bytes.decode("utf-8", errors="replace")

    try:
        image_urls, page_title = extract_page_images(html, resp.url, MAX_URL_IMAGES)
    except Exception as e:
        logger.error(f"Error parsing page HTML for images: {e}")
        image_urls, page_title = [], None

    del html_bytes, html
    gc.collect()

    image_results = []
    for image_url in image_urls:
        try:
            img_parsed = urlparse(image_url)
            if not img_parsed.hostname or not is_public_hostname(img_parsed.hostname):
                image_results.append({"image_url": image_url, "error": "Skipped: points to a non-public address."})
                continue

            img_resp = requests.get(
                image_url,
                timeout=URL_REQUEST_TIMEOUT,
                headers={"User-Agent": "DeepShieldAI-URLScanner/1.0"},
                stream=True,
            )
            img_bytes = b""
            for chunk in img_resp.iter_content(chunk_size=65536):
                img_bytes += chunk
                if len(img_bytes) > MAX_URL_IMAGE_BYTES:
                    break
            img_resp.close()

            if len(img_bytes) > MAX_URL_IMAGE_BYTES:
                image_results.append({"image_url": image_url, "error": "Image too large, skipped."})
                continue

            result = classify_image_bytes(img_bytes, image_url)
            result["image_url"] = image_url
            image_results.append(result)

        except ValueError as e:
            image_results.append({"image_url": image_url, "error": str(e)})
        except requests.exceptions.RequestException as e:
            image_results.append({"image_url": image_url, "error": f"Could not fetch image: {e}"})
        except Exception as e:
            logger.error(f"Error scanning page image '{image_url}': {e}")
            image_results.append({"image_url": image_url, "error": "Failed to scan this image."})
        finally:
            gc.collect()

    scanned_ok = [r for r in image_results if "error" not in r]
    fake_images = [r for r in scanned_ok if r["result"] == "FAKE"]

    # Simple, transparent risk scoring: more heuristic flags and a higher
    # proportion of flagged-fake images push the risk level up. This is a
    # heuristic aid, not a verified security verdict.
    fake_ratio = (len(fake_images) / len(scanned_ok)) if scanned_ok else 0
    risk_score = len(heuristic_flags) * 1.5 + fake_ratio * 3

    if risk_score >= 4:
        risk_level = "high"
    elif risk_score >= 1.5:
        risk_level = "medium"
    else:
        risk_level = "low"

    response = {
        "url": resp.url,
        "requested_url": parsed.geturl(),
        "domain": final_host,
        "is_https": urlparse(resp.url).scheme == "https",
        "page_title": page_title,
        "heuristic_flags": heuristic_flags,
        "risk_level": risk_level,
        "images_found": len(image_urls),
        "images_scanned": image_results,
        "fake_image_count": len(fake_images),
        "scanned_image_count": len(scanned_ok),
    }

    logger.info(
        f"URL scan complete: {final_host} -> risk={risk_level}, "
        f"{len(heuristic_flags)} flags, {len(fake_images)}/{len(scanned_ok)} images flagged fake"
    )
    return jsonify(response), 200
def request_entity_too_large(error):
    return (
        jsonify(
            {
                "error": "Upload too large. Single scans are capped at 6MB; "
                f"batch scans are capped at {MAX_BATCH_FILES} images."
            }
        ),
        413,
    )


@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found."}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error."}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
