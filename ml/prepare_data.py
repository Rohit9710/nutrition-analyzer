"""Merge image folders from several sources into one clean train/val/test dataset.

Each source is a folder with one sub-folder per class (any nesting inside a class folder is fine):
  src_a/samosa/*.jpg   src_b/Poha/*.png   own_photos/idli/*.jpeg ...
Class names are normalised (lower case, spaces/hyphens -> underscore), mapped with aliases, and only classes
listed in --classes are kept. Broken or tiny images are dropped, duplicates (across sources too) are removed
BEFORE splitting so the same photo can never be in both train and test.
"""
import argparse
import hashlib
import json
import random
import shutil
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageOps

EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def norm(name: str) -> str:
    return name.strip().lower().replace("-", "_").replace(" ", "_")


def ahash(img: Image.Image) -> int:
    g = ImageOps.grayscale(img).resize((8, 8))
    px = list(g.getdata())
    avg = sum(px) / 64
    return sum(1 << i for i, p in enumerate(px) if p > avg)


def collect(sources, classes, aliases, min_side):
    keep, stats = defaultdict(list), defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    seen_md5, seen_ah = set(), defaultdict(list)
    for src in sources:
        src = Path(src)
        sname = src.name
        for cdir in sorted(p for p in src.iterdir() if p.is_dir()):
            cls = aliases.get(norm(cdir.name), norm(cdir.name))
            if cls not in classes:
                continue
            for f in sorted(cdir.rglob("*")):
                if f.suffix.lower() not in EXT or not f.is_file():
                    continue
                try:
                    data = f.read_bytes()
                    md5 = hashlib.md5(data).hexdigest()
                    if md5 in seen_md5:
                        stats[cls][sname]["duplicate"] += 1
                        continue
                    img = Image.open(f)
                    img.verify()
                    img = Image.open(f)
                    img = ImageOps.exif_transpose(img).convert("RGB")
                except Exception:
                    stats[cls][sname]["broken"] += 1
                    continue
                if min(img.size) < min_side:
                    stats[cls][sname]["too_small"] += 1
                    continue
                ah = ahash(img)
                if any((ah ^ other).bit_count() <= 3 for other in seen_ah[cls]):  # near-duplicate (resized/re-saved copy)
                    stats[cls][sname]["duplicate"] += 1
                    continue
                seen_md5.add(md5); seen_ah[cls].append(ah)
                keep[cls].append((img, sname))
                stats[cls][sname]["kept"] += 1
    return keep, stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", nargs="+", required=True)
    ap.add_argument("--classes", required=True, help="comma-separated dish keys, or a path to dishes.json")
    ap.add_argument("--aliases", default=None, help="JSON file {source_class_name: dish_key}")
    ap.add_argument("--out", default="data")
    ap.add_argument("--min_side", type=int, default=100)
    ap.add_argument("--min_per_class", type=int, default=60, help="classes with fewer images are dropped with a warning")
    ap.add_argument("--max_per_class", type=int, default=600)
    ap.add_argument("--max_side", type=int, default=512)
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()

    if a.classes.endswith(".json"):
        classes = set(json.loads(Path(a.classes).read_text()).keys())
    else:
        classes = {norm(c) for c in a.classes.split(",")}
    aliases = {norm(k): v for k, v in json.loads(Path(a.aliases).read_text()).items()} if a.aliases else {}

    keep, stats = collect(a.sources, classes, aliases, a.min_side)
    out = Path(a.out)
    if out.exists():
        shutil.rmtree(out)
    rng = random.Random(a.seed)
    summary = {"classes": {}, "dropped_classes": {}, "sources": [Path(s).name for s in a.sources], "per_source_stats": {c: {s: dict(v) for s, v in d.items()} for c, d in stats.items()}}
    for cls in sorted(classes):
        items = keep.get(cls, [])
        if len(items) < a.min_per_class:
            summary["dropped_classes"][cls] = len(items)
            print(f"WARNING: '{cls}' has only {len(items)} usable images (< {a.min_per_class}); class dropped. Add more photos for it.")
            continue
        rng.shuffle(items)
        items = [(img, sname, i) for i, (img, sname) in enumerate(items[: a.max_per_class])]
        n = len(items); n_val = max(1, round(n * 0.15)); n_test = max(1, round(n * 0.15))
        split = {"test": items[:n_test], "val": items[n_test:n_test + n_val], "train": items[n_test + n_val:]}
        for sp, lst in split.items():
            d = out / sp / cls
            d.mkdir(parents=True, exist_ok=True)
            for img, sname, i in lst:
                img.thumbnail((a.max_side, a.max_side))
                img.save(d / f"{sname}_{i:04d}.jpg", quality=90)
        summary["classes"][cls] = {"total": n, "train": len(split["train"]), "val": len(split["val"]), "test": len(split["test"])}
    tot = {k: sum(v[k] for v in summary["classes"].values()) for k in ("total", "train", "val", "test")}
    summary["totals"] = tot
    (out / "data_summary.json").write_text(json.dumps(summary, indent=2))
    print(f"\n{'class':<18}{'total':>7}{'train':>7}{'val':>6}{'test':>6}")
    for c, v in summary["classes"].items():
        print(f"{c:<18}{v['total']:>7}{v['train']:>7}{v['val']:>6}{v['test']:>6}")
    print(f"{'TOTAL':<18}{tot['total']:>7}{tot['train']:>7}{tot['val']:>6}{tot['test']:>6}   classes kept: {len(summary['classes'])}")


if __name__ == "__main__":
    main()
