"""Creates a tiny fake dataset (coloured patterns) ONLY to test the pipeline. Never use it for real results."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(sys.argv[1] if len(sys.argv) > 1 else "synthetic")
rng = np.random.default_rng(0)
colours = {"poha": (240, 200, 60), "idli": (235, 235, 235), "dosa": (190, 130, 60)}
for split, n in [("train", 40), ("val", 10), ("test", 10)]:
    for name, col in colours.items():
        (root / split / name).mkdir(parents=True, exist_ok=True)
        for i in range(n):
            a = np.clip(rng.normal(col, 25, (96, 96, 3)), 0, 255).astype("uint8")
            Image.fromarray(a).save(root / split / name / f"{i}.jpg")
