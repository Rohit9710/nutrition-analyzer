import json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent.parent


def mk(path, seed, size=(160, 160)):
    """Image = random 8x8 colour blocks scaled up: distinct per seed, and a resized copy stays recognisable."""
    path.parent.mkdir(parents=True, exist_ok=True)
    blocks = np.random.default_rng(seed).integers(0, 255, (8, 8, 3), dtype="uint8")
    Image.fromarray(blocks).resize(size, Image.NEAREST).save(path)


def test_merge_dedupe_split(tmp_path):
    a, b = tmp_path / "src_a", tmp_path / "src_b"
    for i in range(30):
        mk(a / "Poha" / f"{i}.jpg", i)              # source A poha
        mk(b / "poha" / f"{i}.png", 1000 + i)       # source B poha (different images)
    for i in range(10):
        mk(b / "poha" / f"dup{i}.png", i, (120, 120))  # resized PNG copies of source A images -> must be removed
    for i in range(20):
        mk(a / "idly" / f"{i}.jpg", 5000 + i)       # alias idly -> idli
    for i in range(5):
        mk(a / "dosa" / f"{i}.jpg", 9000 + i)       # too few -> dropped
    for i in range(70):
        mk(a / "pizza" / f"{i}.jpg", 7000 + i)      # not a target class -> ignored
    (a / "Poha" / "broken.jpg").write_bytes(b"not an image")
    mk(a / "Poha" / "tiny.jpg", 1, (40, 40))
    (tmp_path / "alias.json").write_text(json.dumps({"idly": "idli"}))
    out = tmp_path / "out"
    r = subprocess.run([sys.executable, str(HERE / "prepare_data.py"), "--sources", str(a), str(b), "--classes", "poha,idli,dosa",
                        "--aliases", str(tmp_path / "alias.json"), "--out", str(out), "--min_per_class", "15"], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    s = json.loads((out / "data_summary.json").read_text())
    assert set(s["classes"]) == {"poha", "idli"} and "dosa" in s["dropped_classes"]
    assert s["classes"]["poha"]["total"] == 60            # 30 + 30, duplicates/broken/tiny removed
    p = s["classes"]["poha"]
    assert p["train"] + p["val"] + p["test"] == 60 and p["test"] >= 8 and p["val"] >= 8
    names = [f.name for sp in ("train", "val", "test") for f in (out / sp / "poha").iterdir()]
    assert len(names) == len(set(names)) == 60
    assert not (out / "train" / "pizza").exists()


def test_stops_when_fewer_than_two_classes(tmp_path):
    a = tmp_path / "src"
    for i in range(80):
        mk(a / "poha" / f"{i}.jpg", i)
    r = subprocess.run([sys.executable, str(HERE / "prepare_data.py"), "--sources", str(a), "--classes", "poha,idli", "--out", str(tmp_path / "o"), "--min_per_class", "60"], capture_output=True, text=True)
    assert r.returncode == 1 and "STOP" in r.stdout
