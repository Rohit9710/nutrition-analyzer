import os
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import classifier, goals, labels, nutrition

app = FastAPI(title="AI-Based Nutrition Analyzer", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])

MAX_UPLOAD = 8 * 1024 * 1024


class Item(BaseModel):
    ingredient: str
    grams: float = Field(ge=0, le=5000)


class RecipeIn(BaseModel):
    items: list[Item] = Field(min_length=1, max_length=60)
    servings: float = Field(default=1, gt=0, le=100)


class DishIn(BaseModel):
    dish: str
    servings: float = Field(default=1, gt=0, le=20)


class Profile(BaseModel):
    age: int = Field(ge=10, le=100)
    sex: Literal["male", "female"]
    height_cm: float = Field(ge=100, le=230)
    weight_kg: float = Field(ge=25, le=250)
    goal_weight_kg: Optional[float] = Field(default=None, ge=25, le=250)
    activity: Literal["sedentary", "light", "moderate", "active", "very_active"] = "light"
    goal: Literal["lose", "maintain", "gain"] = "maintain"
    bmi_standard: Literal["asian", "who"] = "asian"


class Nutr(BaseModel):
    kcal: float = 0
    protein_g: float = 0
    carbs_g: float = 0
    fat_g: float = 0
    fiber_g: float = 0
    sugar_g: float = 0
    sodium_mg: float = 0


class VerdictIn(BaseModel):
    profile: Profile
    nutrition: Nutr
    meal: Literal["breakfast", "lunch", "dinner", "snack"] = "lunch"
    per100: Optional[Nutr] = None


class LabelIn(BaseModel):
    per100: Nutr
    serving_g: float = Field(default=100, gt=0, le=2000)
    servings: float = Field(default=1, gt=0, le=20)


async def read_image(f: UploadFile) -> bytes:
    if f.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(415, "Please upload a JPG, PNG or WEBP image.")
    data = await f.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "Image is larger than 8 MB.")
    return data


@app.get("/api/health")
def health():
    return {"status": "ok", "model": classifier.status(), "ocr_available": labels.ocr_available()}


@app.get("/api/ingredients")
def list_ingredients():
    return [{"name": k, "label": v["label"]} for k, v in nutrition.ingredients().items()]


@app.get("/api/dishes")
def list_dishes():
    return [{"name": k, "label": v["label"], "serving": v["serving"]} for k, v in nutrition.dishes().items()]


@app.post("/api/recipe")
def recipe(body: RecipeIn):
    try:
        return nutrition.calc_recipe([i.model_dump() for i in body.items], body.servings)
    except KeyError as e:
        raise HTTPException(422, str(e).strip("'"))


@app.post("/api/dish/predict")
async def dish_predict(image: UploadFile = File(...)):
    data = await read_image(image)
    st = classifier.status()
    if not st["model_loaded"]:
        return {"model_loaded": False, "message": st["message"], "predictions": []}
    try:
        preds = classifier.predict(data)
    except Exception:
        raise HTTPException(422, "Could not read this image.")
    top = preds[0]["confidence"] if preds else 0
    return {"model_loaded": True, "predictions": preds, "low_confidence": top < 0.6,
            "message": "Low confidence: please confirm the dish yourself." if top < 0.6 else None}


@app.post("/api/dish/nutrition")
def dish_nutrition(body: DishIn):
    try:
        return nutrition.calc_dish(body.dish, body.servings)
    except KeyError as e:
        raise HTTPException(404, str(e).strip("'"))


@app.post("/api/label/ocr")
async def label_ocr(image: UploadFile = File(...)):
    data = await read_image(image)
    if not labels.ocr_available():
        return {"ocr_available": False, "text": "", "parsed": {"per100": {}, "ingredients": None, "found_fields": []},
                "message": "OCR is not installed on this server. Enter the values from the label manually."}
    text = labels.run_ocr(data)
    return {"ocr_available": True, "text": text, "parsed": labels.parse_label(text)}


@app.post("/api/label/analyze")
def label_analyze(body: LabelIn):
    per100 = body.per100.model_dump()
    one = labels.per_serving(per100, body.serving_g)
    ps = {k: round(v * body.servings, 1) for k, v in one.items()}
    return {"per100": labels.fill(per100), "per_serving": ps, "serving_g": body.serving_g, "servings": body.servings,
            "flags": goals.risk_flags(ps, per100), "disclaimer": goals.DISCLAIMER}


@app.post("/api/goal")
def goal(body: Profile):
    return goals.targets(body.model_dump())


@app.post("/api/verdict")
def verdict(body: VerdictIn):
    return goals.verdict(body.profile.model_dump(), body.nutrition.model_dump(), body.meal, body.per100.model_dump() if body.per100 else None)


# Serve the built React app (single-service deployment)
DIST = Path(__file__).resolve().parent.parent / "static"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = DIST / path
        return FileResponse(f if path and f.is_file() else DIST / "index.html")
