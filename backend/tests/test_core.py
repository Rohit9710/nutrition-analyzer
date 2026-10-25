import io
from fastapi.testclient import TestClient
from PIL import Image
from app.main import app
from app import nutrition, goals, labels

c = TestClient(app)
P = {"age": 21, "sex": "male", "height_cm": 175, "weight_kg": 80, "goal_weight_kg": 72, "activity": "light", "goal": "lose", "bmi_standard": "asian"}


def test_recipe_formula():
    r = nutrition.calc_recipe([{"ingredient": "oil", "grams": 10}, {"ingredient": "sugar", "grams": 50}], 2)
    assert r["total"]["kcal"] == 90 + 199 and r["per_serving"]["kcal"] == 144.5
    assert r["total"]["fat_g"] == 10.0


def test_all_dishes_resolve():
    for d in nutrition.dishes():
        assert nutrition.calc_dish(d)["per_serving"]["kcal"] > 50


def test_bmr_mifflin():
    t = goals.targets({**P, "goal": "maintain"})
    assert t["bmr_kcal"] == round(10 * 80 + 6.25 * 175 - 5 * 21 + 5)
    assert t["maintenance_kcal"] == round((10 * 80 + 6.25 * 175 - 5 * 21 + 5) * 1.375)


def test_bmi_cutoffs():
    assert goals.bmi_category(24.0, "asian") == "Overweight" and goals.bmi_category(24.0, "who") == "Normal"
    assert goals.bmi_category(17, "asian") == "Underweight" and goals.bmi_category(26, "asian") == "Obese"


def test_flags_high_sugar_sodium():
    f = goals.risk_flags({"sugar_g": 30, "sodium_mg": 900})
    assert {x["nutrient"] for x in f} == {"sugar", "sodium"} and all(x["level"] == "high" for x in f)


def test_label_parser():
    txt = "Ingredients: Wheat flour, sugar, salt.\n\nNutrition Information (per 100 g)\nEnergy 480 kcal\nProtein 6.5 g\nCarbohydrate 70 g\nof which sugars 24 g\nTotal Fat 18 g\nSodium 620 mg"
    p = labels.parse_label(txt)["per100"]
    assert p["kcal"] == 480 and p["sugar_g"] == 24 and p["sodium_mg"] == 620 and p["fat_g"] == 18


def test_api_flow():
    assert c.get("/api/health").json()["status"] == "ok"
    r = c.post("/api/dish/nutrition", json={"dish": "poha"}).json()
    v = c.post("/api/verdict", json={"profile": P, "nutrition": r["per_serving"], "meal": "breakfast"}).json()
    assert v["status"] in {"fits", "smaller_portion", "not_ideal", "add_more"} and "targets" in v
    assert c.post("/api/recipe", json={"items": [{"ingredient": "nope", "grams": 5}]}).status_code == 422
    assert c.post("/api/goal", json={**P, "age": 5}).status_code == 422


def test_upload_validation_and_demo_mode():
    buf = io.BytesIO(); Image.new("RGB", (64, 64), "red").save(buf, "PNG")
    r = c.post("/api/dish/predict", files={"image": ("a.png", buf.getvalue(), "image/png")})
    assert r.status_code == 200 and r.json()["model_loaded"] in (True, False)
    assert c.post("/api/dish/predict", files={"image": ("a.txt", b"hi", "text/plain")}).status_code == 415
