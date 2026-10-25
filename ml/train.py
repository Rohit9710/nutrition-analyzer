"""Train the Indian-dish classifier (MobileNetV2 transfer learning) and export everything the app and the PPT need.

Dataset layout (folder names must match the dish keys in backend/app/data/dishes.json):
  data/train/<dish>/*.jpg    data/val/<dish>/*.jpg    data/test/<dish>/*.jpg

Run:  python train.py --data data --epochs 15 --fine_tune_epochs 5
Outputs: backend/model/dish_model.tflite + labels.json, and reports/ (metrics.json, accuracy_loss.png, confusion_matrix.png)
"""
import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import tensorflow as tf
from sklearn.metrics import classification_report, confusion_matrix

ROOT = Path(__file__).resolve().parent.parent


def load(path, img, batch, shuffle):
    return tf.keras.utils.image_dataset_from_directory(
        path, label_mode="categorical", image_size=(img, img), batch_size=batch, shuffle=shuffle, seed=42)


def build(num_classes, img, weights):
    base = tf.keras.applications.MobileNetV2(input_shape=(img, img, 3), include_top=False, weights=None if weights == "none" else weights, pooling="avg")
    base.trainable = False
    inp = tf.keras.Input((img, img, 3))
    x = tf.keras.layers.Rescaling(1 / 127.5, offset=-1)(inp)  # the model rescales itself: feed raw 0-255 pixels
    x = base(x, training=False)
    x = tf.keras.layers.Dropout(0.2)(x)
    out = tf.keras.layers.Dense(num_classes, activation="softmax")(x)
    infer = tf.keras.Model(inp, out, name="dish_classifier")
    aug = tf.keras.Sequential([
        tf.keras.layers.RandomFlip("horizontal"), tf.keras.layers.RandomRotation(0.1),
        tf.keras.layers.RandomZoom(0.1), tf.keras.layers.RandomBrightness(0.1, value_range=(0, 255)),
    ])
    return base, infer, tf.keras.Sequential([aug, infer])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data")
    ap.add_argument("--img", type=int, default=224)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--epochs", type=int, default=15)
    ap.add_argument("--fine_tune_epochs", type=int, default=5)
    ap.add_argument("--weights", default="imagenet", help="imagenet or none (none only for quick tests)")
    ap.add_argument("--out", default=str(ROOT / "backend" / "model"))
    ap.add_argument("--reports", default=str(ROOT / "ml" / "reports"))
    a = ap.parse_args()
    out, rep = Path(a.out), Path(a.reports)
    out.mkdir(parents=True, exist_ok=True); rep.mkdir(parents=True, exist_ok=True)

    d = Path(a.data)
    train, val, test = load(d / "train", a.img, a.batch, True), load(d / "val", a.img, a.batch, False), load(d / "test", a.img, a.batch, False)
    classes = train.class_names
    dj = ROOT / "backend/app/data/dishes.json"
    if dj.exists():
        missing = [c for c in classes if c not in json.loads(dj.read_text())]
        if missing:
            print(f"WARNING: no recipe in dishes.json for classes: {missing}. Add them before using the app.")
    base, infer, model = build(len(classes), a.img, a.weights)

    model.compile(optimizer=tf.keras.optimizers.Adam(1e-4), loss="categorical_crossentropy", metrics=["accuracy"])
    counts = np.bincount([classes.index(Path(p).parent.name) for p in train.file_paths], minlength=len(classes))
    cw = {i: float(counts.sum() / (len(classes) * max(c, 1))) for i, c in enumerate(counts)}  # rarer class -> larger weight
    h = model.fit(train, validation_data=val, epochs=a.epochs, class_weight=cw)
    hist = {k: list(map(float, v)) for k, v in h.history.items()}
    if a.fine_tune_epochs > 0:
        base.trainable = True
        for layer in base.layers[:-30]:
            layer.trainable = False
        model.compile(optimizer=tf.keras.optimizers.Adam(1e-5), loss="categorical_crossentropy", metrics=["accuracy"])
        h2 = model.fit(train, validation_data=val, epochs=a.fine_tune_epochs, class_weight=cw)
        for k, v in h2.history.items():
            hist[k] += list(map(float, v))

    y_true = np.concatenate([np.argmax(y, 1) for _, y in test])
    y_pred = np.argmax(infer.predict(test), 1)
    r = classification_report(y_true, y_pred, target_names=classes, output_dict=True, zero_division=0)
    cm = confusion_matrix(y_true, y_pred)
    metrics = {
        "n_train": int(sum(1 for _ in train.file_paths)), "n_val": int(len(val.file_paths)), "n_test": int(len(y_true)),
        "classes": classes, "image_size": a.img, "epochs": a.epochs, "fine_tune_epochs": a.fine_tune_epochs,
        "accuracy": float(r["accuracy"]), "precision_macro": float(r["macro avg"]["precision"]),
        "recall_macro": float(r["macro avg"]["recall"]), "f1_macro": float(r["macro avg"]["f1-score"]),
        "per_class": {c: r[c] for c in classes}, "confusion_matrix": cm.tolist(), "history": hist,
    }
    (rep / "metrics.json").write_text(json.dumps(metrics, indent=2))

    fig, ax = plt.subplots(1, 2, figsize=(11, 4))
    ax[0].plot(hist["accuracy"], label="Training"); ax[0].plot(hist["val_accuracy"], label="Validation"); ax[0].set_title("Accuracy"); ax[0].set_xlabel("Epoch"); ax[0].legend()
    ax[1].plot(hist["loss"], label="Training"); ax[1].plot(hist["val_loss"], label="Validation"); ax[1].set_title("Loss"); ax[1].set_xlabel("Epoch"); ax[1].legend()
    fig.tight_layout(); fig.savefig(rep / "accuracy_loss.png", dpi=160); plt.close(fig)

    fig, ax = plt.subplots(figsize=(6, 5))
    ax.imshow(cm, cmap="Blues"); ax.set_xticks(range(len(classes)), classes, rotation=45, ha="right"); ax.set_yticks(range(len(classes)), classes)
    for i in range(len(classes)):
        for j in range(len(classes)):
            ax.text(j, i, cm[i, j], ha="center", va="center", color="white" if cm[i, j] > cm.max() / 2 else "black")
    ax.set_xlabel("Predicted"); ax.set_ylabel("Actual"); ax.set_title("Confusion matrix (test set)")
    fig.tight_layout(); fig.savefig(rep / "confusion_matrix.png", dpi=160); plt.close(fig)

    infer.save(out / "dish_model.keras")
    tfl = tf.lite.TFLiteConverter.from_keras_model(infer)
    tfl.optimizations = [tf.lite.Optimize.DEFAULT]
    (out / "dish_model.tflite").write_bytes(tfl.convert())
    (out / "labels.json").write_text(json.dumps(classes))
    print(f"\nTest accuracy {metrics['accuracy']:.3f}  macro F1 {metrics['f1_macro']:.3f}\nSaved model to {out} and reports to {rep}")


if __name__ == "__main__":
    main()
