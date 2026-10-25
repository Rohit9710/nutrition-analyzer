"""Deterministic nutrition engine: N_i = (w_i / 100) * n_i, summed, divided by servings."""
import csv
import json
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).parent / "data"
NUTRIENTS = ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg"]


@lru_cache(maxsize=1)
def ingredients() -> dict:
    out = {}
    with open(DATA / "ingredients.csv", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            out[row["name"]] = {"label": row["label"], **{k: float(row[k]) for k in NUTRIENTS}}
    return out


@lru_cache(maxsize=1)
def dishes() -> dict:
    with open(DATA / "dishes.json", encoding="utf-8") as f:
        return json.load(f)


def zero() -> dict:
    return {k: 0.0 for k in NUTRIENTS}


def rounded(n: dict) -> dict:
    return {k: round(v, 1) for k, v in n.items()}


def calc_recipe(items: list[dict], servings: float = 1.0) -> dict:
    """items: [{'ingredient': key, 'grams': float}]. Returns total and per-serving nutrition."""
    if servings <= 0:
        raise ValueError("servings must be greater than 0")
    table = ingredients()
    total = zero()
    breakdown = []
    for it in items:
        key, grams = it["ingredient"], float(it["grams"])
        if key not in table:
            raise KeyError(f"Unknown ingredient: {key}")
        if grams < 0:
            raise ValueError("grams cannot be negative")
        contrib = {k: grams / 100.0 * table[key][k] for k in NUTRIENTS}
        for k in NUTRIENTS:
            total[k] += contrib[k]
        breakdown.append({"ingredient": key, "label": table[key]["label"], "grams": grams, **rounded(contrib)})
    per_serving = {k: v / servings for k, v in total.items()}
    return {"total": rounded(total), "per_serving": rounded(per_serving), "servings": servings, "breakdown": breakdown}


def calc_dish(dish: str, servings: float = 1.0) -> dict:
    d = dishes().get(dish)
    if d is None:
        raise KeyError(f"Unknown dish: {dish}")
    items = [{"ingredient": k, "grams": g} for k, g in d["ingredients"].items()]
    res = calc_recipe(items, 1.0)
    res["per_serving"] = {k: round(v * servings, 1) for k, v in res["per_serving"].items()}
    res["dish"] = dish
    res["label"] = d["label"]
    res["serving"] = d["serving"]
    res["assumption"] = "Estimated from a standard home recipe and serving size; real oil, salt and portion can differ."
    return res
