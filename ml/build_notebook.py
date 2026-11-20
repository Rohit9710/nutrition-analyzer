import json
from pathlib import Path

HERE = Path(__file__).parent
classes = list(json.loads((HERE.parent / "backend/app/data/dishes.json").read_text()).keys())
cells = []
md = lambda s: cells.append({"cell_type": "markdown", "metadata": {}, "source": s.strip("\n").splitlines(True)})
code = lambda s: cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": s.strip("\n").splitlines(True)})

md("""
# Train the dish classifier on Google Colab (free GPU)

**Do these in order, one cell at a time (click the play button on each cell).**

0. Menu **Runtime > Change runtime type > T4 GPU > Save**.
1. Run cells 1 to 3 (setup).
2. Run the **data source** cells you can (A is automatic, B needs a free Kaggle login, C/D/E are optional top-ups).
3. Run **Prepare data**, check the table it prints, then **Train** (about 20 to 60 minutes).
4. The last cell downloads `model_package.zip`. Put `dish_model.tflite` and `labels.json` into your project's `backend/model` folder.

Every class needs roughly **150 or more good images**. Classes with fewer than 40 are dropped automatically (with a warning). Large classes are capped at 200 images so one dish does not dominate.
""")
md("## 1. Setup")
code("!pip -q install icrawler kagglehub scikit-learn matplotlib pillow\nimport tensorflow as tf\nprint('TensorFlow', tf.__version__, '| GPU:', tf.config.list_physical_devices('GPU'))")
md("## 2. Write the helper scripts (nothing to change)")
code("%%writefile prepare_data.py\n" + (HERE / "prepare_data.py").read_text())
code("%%writefile train.py\n" + (HERE / "train.py").read_text().replace("ROOT = Path(__file__).resolve().parent.parent", "ROOT = Path(__file__).resolve().parent"))
md("## 3. Which dishes the app knows\nThese names must match the recipes inside the app. Do not rename them.")
code("CLASSES = " + json.dumps(classes) + "\nprint(len(CLASSES), 'dishes:', CLASSES)\nimport os; os.makedirs('/content/src', exist_ok=True)")
md("""
## Data source A: Food-101 (automatic, public, ETH Zurich)
Food-101 has only a few Indian dishes. We take just **samosa** (the download is about 5 GB, it takes a few minutes).
""")
code("""
!wget -q --show-progress https://data.vision.ee.ethz.ch/cvl/food-101.tar.gz -O /content/food-101.tar.gz
!mkdir -p /content/src/food101
!cd /content && tar -xzf food-101.tar.gz food-101/images/samosa && mv food-101/images/samosa /content/src/food101/ && rm -rf food-101 food-101.tar.gz
!ls /content/src/food101/samosa | wc -l
""")
md("""
## Data source B: Kaggle "Indian Food Images Dataset" (80 Indian dishes)
Needs a **free Kaggle account**. If the cell asks you to log in: kaggle.com > your profile > Settings > *Create New Token*, then upload the `kaggle.json` file when asked below.
Check which of our dishes it actually contains (the cell prints the overlap).
""")
code("""
import kagglehub, os, glob
try:
    path = kagglehub.dataset_download('iamsouravbanerjee/indian-food-images-dataset')
except Exception as e:
    print('Login needed:', e)
    from google.colab import files
    files.upload()                      # choose kaggle.json
    !mkdir -p ~/.kaggle && cp kaggle.json ~/.kaggle/ && chmod 600 ~/.kaggle/kaggle.json
    path = kagglehub.dataset_download('iamsouravbanerjee/indian-food-images-dataset')
# find the folder that holds one sub-folder per dish
root = max((d for d, sub, _ in os.walk(path) if len(sub) > 20), key=lambda d: len(os.listdir(d)), default=None)
print('Dataset folder:', root)
if root:
    if not os.path.exists('/content/src/kaggle_indian'): os.symlink(root, '/content/src/kaggle_indian')
    have = sorted(set(os.listdir(root)))
    norm = lambda s: s.strip().lower().replace('-', '_').replace(' ', '_')
    print('Overlap with our dishes:', sorted(set(map(norm, have)) & set(CLASSES)))
    print('Our dishes NOT in this dataset:', sorted(set(CLASSES) - set(map(norm, have))))
""")
md("""
## Data source C (optional): another Indian food dataset, e.g. Khana
The paper "Khana: A Comprehensive Indian Cuisine Dataset" (arXiv:2509.06006) describes one. **Check where it is hosted, whether you may use it, and its licence.** Download it to your laptop as a zip with one folder per dish, then run this cell and upload the zip. Skip this cell if you have no such zip.
""")
code("""
from google.colab import files
up = files.upload()                     # choose the .zip
for name in up:
    !mkdir -p /content/src/extra_dataset && unzip -q -o "$name" -d /content/src/extra_dataset
!ls /content/src/extra_dataset | head
""")
md("""
## Data source D (best for idli, dosa, rajma chawal, aloo paratha): your own photos
Zip a folder like `own_photos/idli/*.jpg`, `own_photos/dosa/*.jpg` (folder names exactly as in the CLASSES list above). Photos from friends, family and your own kitchen are the most useful because they look like what real users upload. Run and upload the zip.
""")
code("""
from google.colab import files
up = files.upload()                     # choose own_photos.zip
for name in up:
    !mkdir -p /content/src/own_photos && unzip -q -o "$name" -d /content/src/own_photos
!ls /content/src/own_photos | head -30
""")
md("""
## Count what you have, then top up the missing images from the web (Source E)
The public datasets are small (Kaggle has only about 45 images per dish) and some dishes (idli, dosa, rajma chawal, aloo paratha) are in none of them. This cell **counts the images per dish and downloads web images for the dishes below `TARGET`**.

**Read this first:** web images can be copyrighted, wrongly labelled or duplicates. Use them for study only and do not redistribute them. The next sections remove duplicates and show a preview so you can check the labels. Set `USE_WEB = False` if you do not want this. Photos you take yourself (Source D) are always better.
""")
code("""
USE_WEB = True       # False = skip web download
TARGET = 150         # images wanted per dish
SRC = '/content/src'
import os, collections
norm = lambda s: s.strip().lower().replace('-', '_').replace(' ', '_')
EXT = ('.jpg', '.jpeg', '.png', '.webp', '.bmp')
try: ALIASES
except NameError: ALIASES = {'idly': 'idli', 'dosai': 'dosa', 'masala_dosa': 'dosa', 'paratha': 'aloo_paratha', 'chole': 'chana_masala', 'roti': 'chapati'}
def count_images():
    have = collections.Counter()
    for s in sorted(os.listdir(SRC)):
        sp = os.path.join(SRC, s)
        for cdir in os.listdir(sp):
            cls = ALIASES.get(norm(cdir), norm(cdir))
            if cls in CLASSES:
                for r, _, fs in os.walk(os.path.join(sp, cdir)):
                    have[cls] += sum(f.lower().endswith(EXT) for f in fs)
    return have
have = count_images()
print(f"{'dish':<22}{'have':>6}  need")
for c in CLASSES: print(f"{c:<22}{have[c]:>6}  {max(0, TARGET - have[c])}")
KEYWORDS = {'rajma_chawal': 'rajma chawal plate', 'aloo_paratha': 'aloo paratha', 'dosa': 'masala dosa plate', 'idli': 'idli sambar plate',
            'dal_tadka': 'dal tadka', 'chana_masala': 'chana masala chole', 'biryani': 'chicken biryani plate'}
if USE_WEB:
    from icrawler.builtin import BingImageCrawler
    for c in CLASSES:
        need = TARGET - have[c]
        if need > 0:
            kw = KEYWORDS.get(c, c.replace('_', ' ') + ' indian food')
            BingImageCrawler(storage={'root_dir': f'{SRC}/web/{c}'}, log_level=40).crawl(keyword=kw, max_num=int(need * 1.4))
            print('downloaded for', c)
    have = count_images()
    print('\\nAfter top-up:', dict(have))
""")
md("## 4. Prepare the data: merge all sources, remove broken and duplicate photos, split 70/15/15")
code("""
import json, os
ALIASES = {  # other names used by datasets -> our dish names (edit if you like)
    'idly': 'idli', 'idlis': 'idli', 'dosai': 'dosa', 'masala_dosa': 'dosa', 'plain_dosa': 'dosa',
    'paratha': 'aloo_paratha', 'aloo_parantha': 'aloo_paratha', 'rajma_rice': 'rajma_chawal',
    'chole': 'chana_masala', 'chickpea_curry': 'chana_masala', 'daal_tadka': 'dal_tadka', 'daal_makhani': 'dal_makhani',
    'paneer_makhani': 'paneer_butter_masala', 'roti': 'chapati', 'phulka': 'chapati', 'chicken_biryani': 'biryani',
}
json.dump(ALIASES, open('aliases.json', 'w'))
sources = [os.path.join('/content/src', d) for d in sorted(os.listdir('/content/src'))]
print('Sources found:', sources)
!python prepare_data.py --sources {' '.join(sources)} --classes {','.join(CLASSES)} --aliases aliases.json --out /content/data --min_per_class 40 --max_per_class 200
""")
md("""
### Look at your data (important)
Wrong labels ruin a model. Scroll through these samples. If a class looks wrong, delete that source's folder under `/content/src`, and run **Prepare data** again.
""")
code("""
import matplotlib.pyplot as plt, random, glob
classes_kept = sorted(os.listdir('/content/data/train'))
fig, axes = plt.subplots(len(classes_kept), 6, figsize=(12, 2 * len(classes_kept)))
for r, c in enumerate(classes_kept):
    files_ = random.sample(glob.glob(f'/content/data/train/{c}/*.jpg'), 6)
    for k, f in enumerate(files_):
        axes[r][k].imshow(plt.imread(f)); axes[r][k].axis('off')
    axes[r][0].set_title(c, fontsize=9, loc='left')
plt.tight_layout(); plt.show()
""")
md("## 5. Train (MobileNetV2 transfer learning, then fine-tuning)")
code("!python train.py --data /content/data --epochs 15 --fine_tune_epochs 5 --out /content/out/model --reports /content/out/reports")
md("## 6. Results (use these numbers and pictures in your PPT slides 9 to 12)")
code("""
import json, shutil
from IPython.display import Image, display
m = json.load(open('/content/out/reports/metrics.json'))
print({k: (round(v, 3) if isinstance(v, float) else v) for k, v in m.items() if k in ('n_train','n_val','n_test','accuracy','precision_macro','recall_macro','f1_macro')})
display(Image('/content/out/reports/accuracy_loss.png')); display(Image('/content/out/reports/confusion_matrix.png'))
shutil.copy('/content/data/data_summary.json', '/content/out/reports/data_summary.json')
""")
md("## 7. Download everything\nUnzip it on your laptop. Put `model/dish_model.tflite` and `model/labels.json` into your project's `backend/model` folder, then upload them to GitHub (see the deployment guide).")
code("""
import shutil
from google.colab import files
shutil.make_archive('/content/model_package', 'zip', '/content/out')
files.download('/content/model_package.zip')
""")

nb = {"cells": cells, "metadata": {"accelerator": "GPU", "colab": {"provenance": []}, "kernelspec": {"display_name": "Python 3", "name": "python3"}, "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 5}
(HERE / "train_on_colab.ipynb").write_text(json.dumps(nb, indent=1))
print("cells:", len(cells))
