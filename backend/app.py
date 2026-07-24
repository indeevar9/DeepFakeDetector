"""
DeepShield AI — Flask backend
Exposes a /scan endpoint that accepts an uploaded image/video and returns
a deepfake-detection verdict. The actual model call lives in
detectors/deepfake_detector.py — swap in a real model there without
touching this file.
"""

import os
import time
import uuid

from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename

from detectors.deepfake_detector import analyze_file

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "mp4", "mov", "webm"}
MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__)
CORS(app)  # allow the frontend (served from a different origin) to call this API
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "service": "DeepShield AI backend",
        "status": "operational",
        "endpoints": {"scan": "POST /scan (multipart/form-data, field name: file)"}
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/scan", methods=["POST"])
def scan():
    if "file" not in request.files:
        return jsonify({"error": "No file provided. Attach a file under the 'file' field."}), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"error": "No file selected."}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Unsupported file type. Use JPG, PNG, MP4, MOV, or WEBM."}), 400

    filename = secure_filename(file.filename)
    unique_name = f"{uuid.uuid4().hex}_{filename}"
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], unique_name)

    start = time.time()
    file.save(save_path)

    try:
        result = analyze_file(save_path, filename)
    finally:
        # Files are analyzed transiently and removed immediately after scoring
        if os.path.exists(save_path):
            os.remove(save_path)

    elapsed = round(time.time() - start, 1)
    result["time"] = f"{elapsed}s"

    return jsonify(result)


@app.errorhandler(413)
def file_too_large(e):
    return jsonify({"error": "File exceeds the 50MB size limit."}), 413


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error while scanning the file."}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
