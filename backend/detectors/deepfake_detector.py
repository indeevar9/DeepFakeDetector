"""
DeepShield AI — detection logic

This module is intentionally isolated from app.py so a real deepfake
detection model (PyTorch / TensorFlow / ONNX / a hosted inference API,
etc.) can be dropped in later without touching the Flask routing layer.

Swap the body of `analyze_file()` for a real model call — keep the same
return shape: { result, confidence, reason, summary }.
"""

import random

FAKE_REASONS = [
    "Detected inconsistent facial patterns, compression artifacts, and AI-generated texture anomalies.",
    "Unnatural blending around facial boundaries combined with irregular lighting gradients.",
    "Temporal flickering across frames and mismatched eye reflections suggest synthetic generation.",
    "Skin texture lacks natural pore-level detail; frequency analysis shows GAN fingerprint patterns.",
]

REAL_REASONS = [
    "Facial geometry, lighting, and texture patterns are consistent with authentic camera capture.",
    "No compression or blending artifacts detected; noise patterns match native sensor output.",
    "Micro-expressions and natural asymmetry are consistent with unaltered human features.",
    "Metadata and pixel-level texture analysis show no signs of generative manipulation.",
]

FAKE_SUMMARY = (
    "DeepShield's neural pipeline flagged multiple regions of concern. The overall pattern of "
    "artifacts is consistent with AI-generated or manipulated media rather than an unedited capture."
)

REAL_SUMMARY = (
    "DeepShield's neural pipeline found no significant indicators of synthetic generation. Texture, "
    "lighting, and structural signals align with genuine, unaltered media."
)


def analyze_file(file_path, original_filename):
    """
    Runs deepfake detection on the saved file at `file_path`.

    Currently a placeholder that returns a randomized, plausible verdict so the
    frontend has a fully working end-to-end demo without a trained model attached.
    Replace this function body with a real model inference call when ready —
    the `file_path` argument gives you the file on disk to load into your model.
    """
    is_fake = random.random() > 0.45

    if is_fake:
        confidence = random.randint(80, 95)
        reason = random.choice(FAKE_REASONS)
        summary = FAKE_SUMMARY
    else:
        confidence = random.randint(78, 97)
        reason = random.choice(REAL_REASONS)
        summary = REAL_SUMMARY

    return {
        "result": "fake" if is_fake else "real",
        "confidence": confidence,
        "reason": reason,
        "summary": summary,
    }
