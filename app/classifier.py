"""Dish classifier. Uses a TFLite model if backend/model/dish_model.tflite exists, otherwise runs in demo mode."""
import io
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

MODEL_DIR = Path(os.getenv("MODEL_DIR") or Path(__file__).resolve().parent.parent / "model")
MODEL_PATH = MODEL_DIR / "dish_model.tflite"
LABELS_PATH = MODEL_DIR / "labels.json"

_state = {"interp": None, "labels": None, "tried": False, "error": None}


def _load():
    if _state["tried"]:
        return
    _state["tried"] = True
    if not (MODEL_PATH.exists() and LABELS_PATH.exists()):
        _state["error"] = "No trained model found (backend/model/dish_model.tflite). Running in demo mode."
        return
    Interpreter = None
    for mod in ("ai_edge_litert.interpreter", "tflite_runtime.interpreter"):
        try:
            Interpreter = __import__(mod, fromlist=["Interpreter"]).Interpreter
            break
        except Exception:
            continue
    if Interpreter is None:
        try:
            import tensorflow as tf
            Interpreter = tf.lite.Interpreter
        except Exception:
            pass
    if Interpreter is None:
        _state["error"] = "No TFLite runtime installed (pip install ai-edge-litert or tensorflow)."
        return
    try:
        interp = Interpreter(model_path=str(MODEL_PATH))
        interp.allocate_tensors()
        _state["interp"] = interp
        _state["labels"] = json.loads(LABELS_PATH.read_text(encoding="utf-8"))
    except Exception as e:  # pragma: no cover
        _state["error"] = f"Could not load model: {e}"


def model_loaded() -> bool:
    _load()
    return _state["interp"] is not None


def status() -> dict:
    _load()
    return {"model_loaded": model_loaded(), "message": _state["error"], "classes": _state["labels"]}


def predict(image_bytes: bytes, top_k: int = 3) -> list[dict]:
    _load()
    if _state["interp"] is None:
        return []
    interp = _state["interp"]
    inp, out = interp.get_input_details()[0], interp.get_output_details()[0]
    size = int(inp["shape"][1])
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((size, size))
    x = np.asarray(img, dtype=np.float32)[None, ...]  # model has its own Rescaling layer
    interp.set_tensor(inp["index"], x)
    interp.invoke()
    probs = interp.get_tensor(out["index"])[0]
    idx = np.argsort(probs)[::-1][:top_k]
    return [{"dish": _state["labels"][int(i)], "confidence": round(float(probs[int(i)]), 4)} for i in idx]
