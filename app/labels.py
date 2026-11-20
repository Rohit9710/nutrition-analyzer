"""Label OCR (optional, needs Tesseract) and a parser that turns label text into per-100 g values."""
import io
import re

try:
    import pytesseract
    from PIL import Image

    def _ocr_ok() -> bool:
        try:
            pytesseract.get_tesseract_version()
            return True
        except Exception:
            return False
except Exception:  # pragma: no cover
    pytesseract = None

    def _ocr_ok() -> bool:
        return False


def ocr_available() -> bool:
    return _ocr_ok()


def run_ocr(image_bytes: bytes) -> str:
    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    if img.width < 1200:
        scale = 1200 / img.width
        img = img.resize((int(img.width * scale), int(img.height * scale)))
    return pytesseract.image_to_string(img, config="--psm 6")


_NUM = r"(\d+(?:[.,]\d+)?)"
PATTERNS = {
    "kcal": [rf"(?:energy|calories?)[^\d\n]{{0,25}}{_NUM}\s*kcal", rf"{_NUM}\s*kcal"],
    "protein_g": [rf"protein[^\d\n]{{0,15}}{_NUM}\s*g?"],
    "carbs_g": [rf"carbohydrates?[^\d\n]{{0,15}}{_NUM}\s*g?", rf"total carbohydrate[^\d\n]{{0,15}}{_NUM}"],
    "sugar_g": [rf"(?:of which )?(?:total )?sugars?[^\d\n]{{0,25}}{_NUM}\s*g?"],
    "fat_g": [rf"(?:total )?fat[^\d\n]{{0,15}}{_NUM}\s*g?"],
    "fiber_g": [rf"(?:dietary )?fib(?:re|er)[^\d\n]{{0,15}}{_NUM}\s*g?"],
    "sodium_mg": [rf"sodium[^\d\n]{{0,15}}{_NUM}\s*mg"],
}


def _f(s: str) -> float:
    return float(s.replace(",", "."))


def parse_label(text: str) -> dict:
    low = text.lower()
    found = {}
    for key, pats in PATTERNS.items():
        for pat in pats:
            m = re.search(pat, low)
            if m:
                found[key] = _f(m.group(1))
                break
    if "sodium_mg" not in found:
        m = re.search(rf"salt[^\d\n]{{0,15}}{_NUM}\s*g", low)
        if m:
            found["sodium_mg"] = round(_f(m.group(1)) * 400)  # 1 g salt ~ 400 mg sodium
    ingredients = None
    m = re.search(r"ingredients?\s*[:\-]\s*(.+?)(?:\n\s*\n|nutrition|allergen|$)", text, flags=re.I | re.S)
    if m:
        ingredients = " ".join(m.group(1).split())[:600]
    return {"per100": found, "ingredients": ingredients, "found_fields": sorted(found)}


def fill(per100: dict) -> dict:
    keys = ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg"]
    return {k: float(per100.get(k) or 0.0) for k in keys}


def per_serving(per100: dict, serving_g: float) -> dict:
    return {k: round(v * serving_g / 100.0, 1) for k, v in fill(per100).items()}
