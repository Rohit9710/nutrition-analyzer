# AI-Based Nutrition Analyzer and Dietary Risk Awareness System

Minor project, 7th semester, B.Tech CSE (Data Science), MAIT.

One web app, three inputs, one goal-based verdict:

| Feature | What it does |
|---|---|
| **Dish photo** | MobileNetV2 classifier names the dish; nutrition comes from a standard recipe and serving (an estimate). |
| **Packaged label** | Tesseract OCR reads the nutrition label; you check or correct the values; sugar and sodium warnings. |
| **Recipe** | Ingredients and grams give total and per-serving nutrition: `N = (weight / 100) x nutrient per 100 g`. |
| **My Goal** | Height, weight, goal and activity give BMI category (screening), Mifflin-St Jeor calorie target, protein/carb/fat and water targets, and a verdict on each food. |

It gives awareness, not diagnosis. There is no disease-prediction model.

## Project layout

```
backend/   FastAPI app (app/main.py), nutrition engine, goal logic, label parser, classifier, tests
frontend/  React + Vite web app
ml/        train.py (MobileNetV2 transfer learning), writes the model and the result graphs/metrics
Dockerfile, render.yaml   one-container deployment
```

> **Never used GitHub, Colab or Render?** Follow `DEPLOY_GUIDE.md`: it puts the project online with nothing installed on your laptop. Training notebook: `ml/train_on_colab.ipynb` (merges several data sources, trains on a free GPU).

## The interface

Mobile-first React app with three tabs: **Analyze** (dish photo, packaged food, recipe), **Today** (a daily food log with progress against your plan) and **My goal**. Portion size and meal can be changed after a result appears and the numbers update live. Big phone photos are shrunk in the browser before upload. UI smoke tests: `cd frontend && npm test`.

## 1. Run it locally

You need Python 3.10+ and Node 18+. Tesseract is optional (only for label photos): Windows installer from UB-Mannheim, `sudo apt install tesseract-ocr` on Ubuntu, `brew install tesseract` on macOS.

**Backend** (terminal 1):
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows;  source .venv/bin/activate on macOS/Linux
pip install -r requirements-dev.txt
pytest                          # 8 tests should pass
uvicorn app.main:app --reload --port 8000
```

**Frontend** (terminal 2):
```bash
cd frontend
npm install
npm run dev                     # open http://localhost:5173
```

Without a trained model the Dish tab runs in **demo mode**: you pick the dish from a list. Recipe, Label and Goal work fully. Train a model (next section) to enable photo recognition.

## 2. Train the dish classifier

1. Easiest: use `ml/train_on_colab.ipynb` on Google Colab (free GPU). It merges Food-101, the Kaggle Indian Food Images dataset, your own photos and optional web top-ups with `ml/prepare_data.py`. Or do it by hand: make a dataset with folders named exactly like the dish keys in `backend/app/data/dishes.json`:
   ```
   ml/data/train/poha/*.jpg   ml/data/val/poha/*.jpg   ml/data/test/poha/*.jpg
   ml/data/train/idli/...     (18 dishes: see the keys in backend/app/data/dishes.json)
   ```
   Split about 70/15/15 and keep the test images unseen. Possible sources: an Indian food dataset such as Khana (arXiv:2509.06006), Food-101 for overlapping classes like samosa, plus your own photos. **Check each dataset's access and licence before using it.** Aim for 300 or more images per class.
2. Train:
   ```bash
   cd ml
   pip install -r requirements.txt
   python train.py --data data --epochs 15 --fine_tune_epochs 5
   ```
3. Outputs:
   - `backend/model/dish_model.tflite` and `labels.json` (the app loads these automatically; restart the backend)
   - `ml/reports/metrics.json` (accuracy, precision, recall, F1, confusion matrix, training history), `accuracy_loss.png`, `confusion_matrix.png`

**Use these real numbers and images on slides 9 to 12 of your PPT**, replacing the example data. A GPU or Google Colab makes training much faster; copy the two model files back into `backend/model/`.

To add a dish: add its recipe to `dishes.json` (ingredient keys come from `ingredients.csv`) and add a training folder with the same name.

## 3. Run as a single service (what production does)

```bash
cd frontend && npm run build && cd ..
cp -r frontend/dist backend/static      # Windows: xcopy /E /I frontend\dist backend\static
cd backend && uvicorn app.main:app --port 8000   # app + API at http://localhost:8000
```

## 4. Deploy

### Option A: Render (free, Docker)
1. Train the model, then commit `backend/model/dish_model.tflite` and `labels.json` (a few MB) with the project. Remove the two `.gitignore` lines only if you want to commit the `.keras` file; you do not need it.
2. Push the project to a GitHub repository.
3. On render.com: **New > Web Service**, connect the repo. Render reads `render.yaml` / the `Dockerfile`. Choose the Free plan and deploy.
4. When the build finishes, open the Render URL. Check `https://YOUR-APP.onrender.com/api/health`: it should show `model_loaded: true` and `ocr_available: true`.

Free instances sleep after inactivity, so the first request can take about a minute. That is fine for a demo; open the link before your presentation.

### Option B: Hugging Face Spaces (Docker) or Railway
Both run the same `Dockerfile`. On Spaces choose a Docker Space and set `app_port: 8000` in the Space README header; on Railway just connect the repo.

### Option C: Split hosting
Backend on Render, frontend on Vercel/Netlify. Build the frontend with `VITE_API_URL=https://YOUR-BACKEND.onrender.com npm run build` and set the backend env var `CORS_ORIGINS=https://YOUR-FRONTEND-DOMAIN`.

### Environment variables
| Variable | Meaning |
|---|---|
| `PORT` | Port to listen on (platforms set this) |
| `CORS_ORIGINS` | Comma-separated allowed origins, default `*` |
| `MODEL_DIR` | Folder with `dish_model.tflite` and `labels.json` (default `backend/model`) |
| `VITE_API_URL` | Frontend build only, for split hosting |

## 5. Know the limits (say these in your viva)

- **Nutrition values in `ingredients.csv` are approximate starter values** written from memory of IFCT 2017 and USDA tables. Before you present, verify each row against IFCT 2017 / USDA FoodData Central and fix anything that differs, and cite them.
- Recipes use **raw** ingredient weights and assumed home recipes and servings. A photo cannot reveal the real oil, salt or portion, so dish nutrition is an **estimate**.
- BMI is a screening measure. The default cut-offs are the Asian-Indian consensus (23 / 25); WHO cut-offs (25 / 30) are selectable. Targets use Mifflin-St Jeor, fat at 25% of energy, protein 1.0 to 1.4 g/kg by goal, and water about 35 ml/kg. These are stated assumptions, not medical advice.
- Sugar and sodium flags compare against about 50 g sugar and 2,000 mg sodium per day (WHO guidance) and per-100 g label thresholds. Wording is "may increase the risk", never "you will get".
- Label OCR works best on a flat, well-lit, sharp photo. Always check the extracted values.

## API (interactive docs at `/docs`)

`GET /api/health` | `GET /api/ingredients` | `GET /api/dishes` | `POST /api/recipe` | `POST /api/dish/predict` (image) | `POST /api/dish/nutrition` | `POST /api/label/ocr` (image) | `POST /api/label/analyze` | `POST /api/goal` | `POST /api/verdict`
