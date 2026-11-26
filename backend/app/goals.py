"""BMI (screening only), Mifflin-St Jeor targets, food verdict and risk flags."""

ACTIVITY = {"sedentary": 1.2, "light": 1.375, "moderate": 1.55, "active": 1.725, "very_active": 1.9}
MEAL_SHARE = {"breakfast": 0.25, "lunch": 0.35, "dinner": 0.30, "snack": 0.10}
SUGAR_LIMIT_G = 50.0      # ~10% of 2000 kcal (WHO free-sugar guideline), used as a rough daily reference
SODIUM_LIMIT_MG = 2000.0  # WHO: <2 g sodium (<5 g salt) per day

DISCLAIMER = "Awareness only, not medical advice. Consult a doctor or dietitian for health conditions."


def bmi_value(weight_kg: float, height_cm: float) -> float:
    h = height_cm / 100.0
    return weight_kg / (h * h)


def bmi_category(bmi: float, standard: str = "asian") -> str:
    if bmi < 18.5:
        return "Underweight"
    if standard == "who":
        return "Normal" if bmi < 25 else "Overweight" if bmi < 30 else "Obese"
    # Consensus guidelines for Asian Indians (screening cut-offs)
    return "Normal" if bmi < 23 else "Overweight" if bmi < 25 else "Obese"


def targets(p: dict) -> dict:
    w, h, age, sex = p["weight_kg"], p["height_cm"], p["age"], p["sex"]
    bmr = 10 * w + 6.25 * h - 5 * age + (5 if sex == "male" else -161)
    tdee = bmr * ACTIVITY[p["activity"]]
    goal = p["goal"]
    notes = []
    if goal == "lose":
        kcal = tdee - min(500.0, 0.2 * tdee)
        protein_per_kg = 1.2
    elif goal == "gain":
        kcal = tdee + 300.0
        protein_per_kg = 1.4
    else:
        kcal, protein_per_kg = tdee, 1.0
    gw = p.get("goal_weight_kg")
    if gw:
        if goal == "lose" and gw >= w:
            notes.append("Your goal weight is not lower than your current weight; check the goal you selected.")
        if goal == "gain" and gw <= w:
            notes.append("Your goal weight is not higher than your current weight; check the goal you selected.")
    floor = 1500 if sex == "male" else 1200
    if kcal < floor:
        notes.append(f"This calorie target is below {floor} kcal, which is very low. Please speak to a doctor or dietitian first.")
    protein_g = protein_per_kg * w
    fat_g = 0.25 * kcal / 9.0
    carbs_g = max(0.0, (kcal - protein_g * 4 - fat_g * 9) / 4.0)
    bmi = bmi_value(w, h)
    return {
        "bmi": round(bmi, 1),
        "bmi_category": bmi_category(bmi, p.get("bmi_standard", "asian")),
        "bmi_standard": p.get("bmi_standard", "asian"),
        "bmr_kcal": round(bmr),
        "maintenance_kcal": round(tdee),
        "target_kcal": round(kcal),
        "protein_g": round(protein_g),
        "carbs_g": round(carbs_g),
        "fat_g": round(fat_g),
        "water_l": round(w * 0.035, 1),
        "notes": notes,
        "assumptions": "Mifflin-St Jeor energy estimate; fat 25% of energy; protein per kg by goal; water about 35 ml per kg. BMI is a screening measure only.",
        "disclaimer": DISCLAIMER,
    }


def risk_flags(per_serving: dict, per100: dict | None = None) -> list[dict]:
    flags = []
    sugar, sodium = per_serving.get("sugar_g", 0), per_serving.get("sodium_mg", 0)
    risk_s = "Regular high sugar intake may increase the risk of obesity, type 2 diabetes and tooth decay."
    risk_n = "Regular high sodium intake may increase the risk of high blood pressure and heart disease."
    if sugar >= 0.30 * SUGAR_LIMIT_G:
        flags.append({"nutrient": "sugar", "level": "high", "message": f"High sugar ({sugar:.0f} g per serving). {risk_s}"})
    elif per100 and per100.get("sugar_g", 0) > 22.5:
        flags.append({"nutrient": "sugar", "level": "high", "message": f"High sugar product ({per100['sugar_g']:.0f} g per 100 g; {sugar:.0f} g in this serving). {risk_s}"})
    elif sugar >= 0.15 * SUGAR_LIMIT_G:
        flags.append({"nutrient": "sugar", "level": "moderate", "message": f"Moderate sugar ({sugar:.0f} g per serving). Keep an eye on the rest of your day."})
    if sodium >= 0.30 * SODIUM_LIMIT_MG:
        flags.append({"nutrient": "sodium", "level": "high", "message": f"High sodium ({sodium:.0f} mg per serving). {risk_n}"})
    elif per100 and per100.get("sodium_mg", 0) > 600:
        flags.append({"nutrient": "sodium", "level": "high", "message": f"High sodium product ({per100['sodium_mg']:.0f} mg per 100 g; {sodium:.0f} mg in this serving). {risk_n}"})
    elif sodium >= 0.15 * SODIUM_LIMIT_MG:
        flags.append({"nutrient": "sodium", "level": "moderate", "message": f"Moderate sodium ({sodium:.0f} mg per serving)."})
    return flags


def verdict(profile: dict, nutrition: dict, meal: str = "lunch", per100: dict | None = None) -> dict:
    t = targets(profile)
    budget = t["target_kcal"] * MEAL_SHARE[meal]
    kcal = nutrition["kcal"]
    ratio = kcal / budget if budget else 0
    goal = profile["goal"]
    reasons = [f"This serving has {kcal:.0f} kcal, about {ratio * 100:.0f}% of a typical {meal} budget (~{budget:.0f} kcal) for your target."]
    if goal == "lose":
        status = "fits" if ratio <= 1.0 else "smaller_portion" if ratio <= 1.3 else "not_ideal"
    elif goal == "gain":
        status = "fits" if 0.8 <= ratio <= 1.4 else "smaller_portion" if ratio > 1.4 else "add_more"
    else:
        status = "fits" if 0.75 <= ratio <= 1.25 else "smaller_portion" if ratio > 1.25 else "add_more"
    p_meal = t["protein_g"] * MEAL_SHARE[meal]
    if nutrition["protein_g"] >= 0.8 * p_meal:
        reasons.append("Protein is close to or above your meal share, which supports your goal.")
    else:
        reasons.append(f"Protein ({nutrition['protein_g']:.0f} g) is below your meal share (~{p_meal:.0f} g); pair it with dal, curd, eggs or paneer.")
    flags = risk_flags(nutrition, per100)
    if any(f["level"] == "high" for f in flags) and status == "fits":
        status = "smaller_portion"
        reasons.append("Because of the high sugar or sodium warning, keep the portion modest or choose it less often.")
    text = {
        "fits": "Fits your goal",
        "smaller_portion": "Okay in a smaller portion or less often",
        "not_ideal": "Not ideal for your goal",
        "add_more": "Light for your goal; add more food or protein",
    }[status]
    return {"status": status, "headline": text, "reasons": reasons, "flags": flags, "targets": t, "meal": meal,
            "meal_budget_kcal": round(budget), "ratio": round(ratio, 2), "disclaimer": DISCLAIMER}
