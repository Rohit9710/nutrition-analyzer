# Put the Nutrition Analyzer online: complete beginner guide

You need only a laptop, a browser (Chrome or Edge) and an email address. Nothing has to be installed. Everything happens in the browser. Total cost: free. Website buttons can be named slightly differently from this guide; follow the idea.

**What you will have at the end:** a link like `https://nutrition-analyzer-xxxx.onrender.com`. Anyone can open it on a phone or laptop, upload a food photo and see nutrition information.

**The plan (in this order):**
1. Make three free accounts.
2. Put the project on GitHub.
3. Put it online with Render (it works immediately, in "demo mode").
4. Train the AI model on Google Colab.
5. Upload the trained model to GitHub, and the website updates itself.

Do step 3 *before* training, so you know the website works, and you will not be stuck at the end.

---

## Step 1. Make the accounts (10 minutes)

1. **GitHub** (stores your project): github.com > Sign up.
2. **Render** (runs your website): render.com > Get Started > "GitHub" (sign in with the GitHub account).
3. **Google account** (for Colab, free GPU). Your Gmail works.
4. **Kaggle** (a dataset used in training): kaggle.com > Register (use "Google" sign-in).

## Step 2. Put the project on GitHub

1. Unzip `nutrition-analyzer.zip`: right-click > *Extract All*. Open the extracted `nutrition-analyzer` folder. You should see `backend`, `frontend`, `ml`, `Dockerfile`, `render.yaml`, `README.md`.
2. On github.com click the **+** (top right) > **New repository**. Name: `nutrition-analyzer`. Choose **Public**. Click **Create repository**.
3. On the next page click the link **"uploading an existing file"**.
4. Open the extracted folder, press **Ctrl+A** to select everything *inside* it, and **drag it all** into the GitHub page. Wait until the upload bar finishes. (You must drag the *contents*, so that `Dockerfile` sits at the top of the repository, not inside another folder.)
5. Scroll down and click **Commit changes**.
6. Check: your repository page must show `backend`, `frontend`, `ml`, `Dockerfile`, `render.yaml` at the top.

## Step 3. Put it online with Render

1. On render.com click **New +** > **Web Service**.
2. Choose **Build and deploy from a Git repository** > connect GitHub if asked (allow access to the `nutrition-analyzer` repository) > select it > **Connect**.
3. Fill in:
   - **Name:** anything, for example `nutrition-analyzer`
   - **Language / Runtime:** **Docker** (Render finds the `Dockerfile` by itself)
   - **Region:** Singapore (closest to India)
   - **Instance type:** **Free**
4. Click **Create Web Service**. A black log screen appears. Wait about **10 to 15 minutes** for the first build. When you see "Your service is live", you are done.
5. At the top of the page you will see your link `https://....onrender.com`. Open it. You should see the Nutrition Analyzer.
6. Add `/api/health` to the end of the link. You should see `"status":"ok"`. At this stage it says `"model_loaded": false`. That is normal: the AI model is not trained yet, so the Dish tab asks you to pick the dish yourself. The Recipe, Label and Goal tabs already work.

## Step 4. Train the AI model on Google Colab

1. Go to **colab.research.google.com**. Click **File > Upload notebook**, and choose `ml/train_on_colab.ipynb` from the extracted folder.
2. Menu **Runtime > Change runtime type > T4 GPU > Save**.
3. Read each section and click the **play button** of each code cell, **one by one, top to bottom**. Wait until a cell finishes (a green tick) before running the next.
   - Sections *Setup* and *Write the helper scripts*: just run them.
   - **Source A (Food-101):** run it (automatic; about 5 to 10 minutes).
   - **Source B (Kaggle):** run it; if asked, log in to Kaggle (instructions are in the cell).
   - **Source D (your own photos):** strongly recommended. Take or collect photos of idli, dosa, rajma chawal, aloo paratha, and others, in folders named exactly as the dish names, zip the folder and upload it when asked.
   - **Sources C and E:** optional.
4. Run **Prepare the data**. It prints a table: how many images each dish got. Dishes with fewer than 40 images are dropped (the app will then not recognise them). More photos of those dishes (Source D) fix this.
5. Run the preview cell and scroll the sample pictures. If a dish shows wrong pictures, remove that data source and prepare again.
6. Run **Train**. It takes about 20 to 60 minutes. Keep the browser tab open.
7. Run the **Results** cell. You will see the accuracy, the training graph and the confusion matrix. **Save these: they are your real results for the PPT.**
8. Run the last cell: it downloads `model_package.zip`. Unzip it. Inside, the `model` folder contains `dish_model.tflite` and `labels.json`.

## Step 5. Upload the model and the website updates itself

1. On GitHub open your repository > the `backend` folder > the `model` folder.
2. Click **Add file > Upload files**. Drag `dish_model.tflite` and `labels.json` from the unzipped `model` folder (not `dish_model.keras`; it is too big and not needed). Click **Commit changes**.
3. Go back to Render. A new deploy starts by itself (3 to 5 minutes).
4. Open `https://YOUR-LINK/api/health`. It must now show `"model_loaded": true` and the list of dishes. Open the website and upload a food photo. Done. Send the link to anyone.

---

## Things you must know

- **It recognises only the dishes it was trained on** (up to 18 in this project). A photo of a food outside that list gets the *closest* dish, and often a "low confidence" warning. "Any food in the world" would need many thousands of photos and a recipe for each food.
- **The free Render site goes to sleep** when nobody uses it. The first visit after a break can take about a minute. Open your link once before you show it to someone.
- Photos are processed in memory and are not saved by the app.
- Nutrition for a photo is an estimate from a standard recipe. The numbers in `backend/app/data/ingredients.csv` are approximate: check them against IFCT 2017 / USDA FoodData Central and cite those.
- It gives awareness, not medical advice.

## If something goes wrong

| Problem | What to do |
|---|---|
| Render build fails | Open the log. If it says it cannot find a `Dockerfile`, your files are inside an extra folder; move them to the top of the repository. |
| Render says "Out of memory" | Free plan has 512 MB. Redeploy once. If it repeats, use a Hugging Face Space (Docker, free, more memory). |
| Website opens but pictures are not recognised | Open `/api/health`. If `model_loaded` is `false`, the two model files are not in `backend/model`, or the folder name is wrong. |
| Label photo gives no values | Use a flat, bright, sharp photo of just the nutrition table, or type the numbers by hand. |
| A dish you wanted is missing after "Prepare data" | It had under 40 images. Add more photos for it (Source D) and run Prepare data again. |
| Colab disconnected | Reconnect and run the cells again from the top. Data sources need to be downloaded again. |
| Kaggle cell asks for login | Kaggle > profile picture > Settings > *Create New Token*; upload the `kaggle.json` that downloads. |

## To change something later
On GitHub, open a file, click the pencil icon, edit, **Commit changes**. Render updates the website automatically.
