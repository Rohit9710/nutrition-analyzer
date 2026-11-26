import { useEffect, useRef, useState } from "react";
import { get, post, upload } from "./api.js";
import { Alert, Field, Icon, Result, Segmented, Stepper } from "./ui.jsx";
import { cleanProfile, num, shrink } from "./lib.js";

const SIZES = { small: 0.75, regular: 1, large: 1.5 };
const MEALS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snack", "Snack"]];
const sizeText = (s, c) => `${s === "regular" ? "" : s + " "}portion${c > 1 ? " x " + c : ""}`.trim();

async function verdictFor(profile, nutrition, meal, per100) {
  if (!profile) return null;
  return post("/api/verdict", { profile: cleanProfile(profile), nutrition, meal, per100: per100 || null });
}

function PhotoPick({ onFile, children, round, busy, preview, prompt }) {
  const gallery = useRef(), camera = useRef();
  const [drag, setDrag] = useState(false);
  const pick = (f) => f && onFile(f);
  return (
    <div className="pick">
      <div
        className={"drop" + (round ? " round" : "") + (drag ? " drag" : "") + (preview ? " has" : "")}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
      >
        {preview ? <img src={preview} alt="Your photo" /> : (
          <div className="drop-hint"><Icon name="image" size={40} /><p>{prompt}</p></div>
        )}
        {busy && <div className="scan" aria-hidden="true" />}
      </div>
      <div className="pick-actions">
        <button type="button" className="primary" onClick={() => camera.current.click()}><Icon name="camera" size={18} /> Take photo</button>
        <button type="button" className="ghost" onClick={() => gallery.current.click()}><Icon name="image" size={18} /> Choose photo</button>
      </div>
      <input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={(e) => pick(e.target.files[0])} />
      <input ref={gallery} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pick(e.target.files[0])} />
      {children}
    </div>
  );
}

function DishPanel({ profile, onAdd }) {
  const [dishes, setDishes] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pred, setPred] = useState(null);
  const [dish, setDish] = useState("");
  const [size, setSize] = useState("regular");
  const [count, setCount] = useState(1);
  const [meal, setMeal] = useState("lunch");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [added, setAdded] = useState(false);

  useEffect(() => { get("/api/dishes").then(setDishes).catch((e) => setErr(e.message)); }, []);

  useEffect(() => {
    if (!dish) return;
    let live = true;
    (async () => {
      try {
        const servings = SIZES[size] * count;
        const n = await post("/api/dish/nutrition", { dish, servings });
        const v = await verdictFor(profile, n.per_serving, meal);
        if (live) { setRes({ n, v, servings }); setAdded(false); setErr(""); }
      } catch (e) { if (live) setErr(e.message); }
    })();
    return () => { live = false; };
  }, [dish, size, count, meal, profile]);

  const onFile = async (f) => {
    setErr(""); setRes(null); setPred(null); setDish(""); setBusy(true);
    setPreview(URL.createObjectURL(f));
    try {
      const r = await upload("/api/dish/predict", await shrink(f, 1024));
      setPred(r);
      if (r.model_loaded && r.predictions.length) setDish(r.predictions[0].dish);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const label = dishes.find((d) => d.name === dish)?.label;
  return (
    <div className="panel">
      <PhotoPick round onFile={onFile} busy={busy} preview={preview} prompt="Drop a photo of your plate here">
        {busy && <p className="status">Looking at your plate...</p>}
      </PhotoPick>

      {!dish && !pred && dishes.length > 0 && (
        <div className="quick">
          <p>No photo handy? Try a popular dish</p>
          <div className="chips">
            {dishes.slice(0, 6).map((d) => <button key={d.name} type="button" className="chip" onClick={() => setDish(d.name)}><span>{d.label}</span></button>)}
          </div>
        </div>
      )}

      {pred && !pred.model_loaded && <Alert>Photo recognition is not switched on yet, so pick the dish yourself below. Everything else works as normal.</Alert>}
      {pred?.model_loaded && (
        <div className="guesses">
          <p>This looks like</p>
          <div className="chips">
            {pred.predictions.map((p) => (
              <button key={p.dish} type="button" aria-pressed={dish === p.dish} className={"chip" + (dish === p.dish ? " on" : "")} onClick={() => setDish(p.dish)}>
                <span>{dishes.find((d) => d.name === p.dish)?.label || p.dish}</span>
                <small>{Math.round(p.confidence * 100)}%</small>
                <i style={{ width: p.confidence * 100 + "%" }} />
              </button>
            ))}
          </div>
          {pred.low_confidence && <Alert tone="warn">We are not sure about this one. Please check the dish before you trust the numbers.</Alert>}
        </div>
      )}

      <div className="controls">
        <Field label={pred?.model_loaded ? "Not right? Pick the dish" : "Dish"}>
          <select value={dish} onChange={(e) => setDish(e.target.value)}>
            <option value="">Choose a dish</option>
            {dishes.map((d) => <option key={d.name} value={d.name}>{d.label}</option>)}
          </select>
        </Field>
        <div className="row-controls">
          <div><span className="field-label">Portion</span>
            <Segmented label="Portion size" value={size} onChange={setSize} options={[["small", "Small"], ["regular", "Regular"], ["large", "Large"]]} /></div>
          <div><span className="field-label">How many</span><Stepper label="portions" value={count} onChange={setCount} min={1} step={1} max={10} /></div>
        </div>
        <div><span className="field-label">Meal</span><Segmented label="Meal" value={meal} onChange={setMeal} options={MEALS} /></div>
        {label && <p className="hint">Regular portion for {label}: {dishes.find((d) => d.name === dish)?.serving}. A photo cannot show the exact amount, so adjust the portion if yours differs.</p>}
      </div>
      <Alert tone="error">{err}</Alert>
      {!dish && !err && <p className="empty">Add a photo or choose a dish to see calories, macros and what it means for your goal.</p>}
      {res && (
        <Result title={res.n.label} subtitle={`${sizeText(size, count)}, about ${Math.round(res.n.per_serving.kcal)} kcal`} nutrition={res.n.per_serving} verdict={res.v}
          note={res.n.assumption} breakdown={res.n.breakdown} factor={res.servings} added={added}
          onAdd={() => { onAdd({ name: `${res.n.label} (${sizeText(size, count)})`, meal, ...res.n.per_serving }); setAdded(true); }} />
      )}
    </div>
  );
}

const FIELDS = [["kcal", "Calories", "kcal"], ["protein_g", "Protein", "g"], ["carbs_g", "Carbs", "g"], ["fat_g", "Fat", "g"], ["sugar_g", "Sugar", "g"], ["sodium_mg", "Sodium", "mg"], ["fiber_g", "Fiber", "g"]];

function LabelPanel({ profile, onAdd }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ocr, setOcr] = useState(null);
  const [vals, setVals] = useState(Object.fromEntries(FIELDS.map(([k]) => [k, ""])));
  const [serving, setServing] = useState(30);
  const [count, setCount] = useState(1);
  const [meal, setMeal] = useState("snack");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [added, setAdded] = useState(false);

  const onFile = async (f) => {
    setErr(""); setOcr(null); setRes(null); setBusy(true); setPreview(URL.createObjectURL(f));
    try {
      const r = await upload("/api/label/ocr", await shrink(f, 1600));
      setOcr(r);
      setVals((v) => ({ ...v, ...Object.fromEntries(Object.entries(r.parsed.per100).map(([k, x]) => [k, String(x)])) }));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const check = async () => {
    setErr("");
    try {
      const per100 = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, num(v)]));
      if (!per100.kcal && !per100.sugar_g && !per100.sodium_mg) throw new Error("Enter at least calories, sugar or sodium from the label.");
      const r = await post("/api/label/analyze", { per100, serving_g: num(serving) || 100, servings: count });
      const v = await verdictFor(profile, r.per_serving, meal, r.per100);
      setRes({ r, v }); setAdded(false);
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="panel">
      <PhotoPick onFile={onFile} busy={busy} preview={preview} prompt="Photograph the nutrition table on the back of the pack">
        {busy && <p className="status">Reading the label...</p>}
      </PhotoPick>
      {ocr && !ocr.ocr_available && <Alert>Label reading is not switched on yet. Type the values from the pack below.</Alert>}
      {ocr?.ocr_available && <Alert>{ocr.parsed.found_fields.length ? `We read ${ocr.parsed.found_fields.length} values. Check each one against the pack, as photos can be misread.` : "We could not read any values. Try a flatter, brighter photo, or type them below."}</Alert>}
      {ocr?.parsed?.ingredients && <p className="hint"><b>Ingredients:</b> {ocr.parsed.ingredients}</p>}
      <fieldset className="grid">
        <legend>Values per 100 g</legend>
        {FIELDS.map(([k, l, u]) => (
          <Field key={k} label={`${l} (${u})`}><input inputMode="decimal" type="number" min="0" step="0.1" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} /></Field>
        ))}
      </fieldset>
      <div className="row-controls">
        <Field label="Your serving (g)"><input inputMode="decimal" type="number" min="1" value={serving} onChange={(e) => setServing(e.target.value)} /></Field>
        <div><span className="field-label">How many servings</span><Stepper label="servings" value={count} onChange={setCount} min={1} step={1} max={10} /></div>
      </div>
      <div><span className="field-label">Meal</span><Segmented label="Meal" value={meal} onChange={setMeal} options={MEALS} /></div>
      <button className="primary wide" onClick={check}>Check this product</button>
      <Alert tone="error">{err}</Alert>
      {res && <Result title="Packaged food" subtitle={`${Math.round(num(serving) * count)} g eaten`} nutrition={res.r.per_serving} verdict={res.v} flags={res.r.flags} added={added}
        onAdd={() => { onAdd({ name: `Packaged food (${Math.round(num(serving) * count)} g)`, meal, ...res.r.per_serving }); setAdded(true); }} />}
    </div>
  );
}

function RecipePanel({ profile, onAdd }) {
  const [ings, setIngs] = useState([]);
  const [name, setName] = useState("");
  const [rows, setRows] = useState([{ label: "", grams: "" }, { label: "", grams: "" }]);
  const [servings, setServings] = useState(1);
  const [meal, setMeal] = useState("lunch");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [added, setAdded] = useState(false);
  useEffect(() => { get("/api/ingredients").then(setIngs).catch((e) => setErr(e.message)); }, []);
  const match = (label) => ings.find((i) => i.label.toLowerCase() === label.trim().toLowerCase());
  const setRow = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const calc = async () => {
    setErr("");
    try {
      const filled = rows.filter((r) => r.label.trim() || r.grams !== "");
      const bad = filled.find((r) => !match(r.label));
      if (bad) throw new Error(`"${bad.label || "(empty)"}" is not in our ingredient list. Pick a name from the suggestions.`);
      const items = filled.filter((r) => r.grams !== "").map((r) => ({ ingredient: match(r.label).name, grams: num(r.grams) }));
      if (!items.length) throw new Error("Add at least one ingredient with its weight in grams.");
      const n = await post("/api/recipe", { items, servings });
      const v = await verdictFor(profile, n.per_serving, meal);
      setRes({ n, v }); setAdded(false);
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="panel">
      <Field label="Recipe name (optional)"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="For example: Sunday sabzi" /></Field>
      <div className="rows">
        {rows.map((r, i) => (
          <div className="recipe-row" key={i}>
            <Field label={i === 0 ? "Ingredient" : ""}>
              <input list="ing-list" value={r.label} onChange={(e) => setRow(i, "label", e.target.value)} placeholder="Start typing, e.g. Potato" aria-label={`Ingredient ${i + 1}`}
                className={r.label && !match(r.label) ? "bad" : ""} />
            </Field>
            <Field label={i === 0 ? "Grams" : ""}><input inputMode="decimal" type="number" min="0" value={r.grams} onChange={(e) => setRow(i, "grams", e.target.value)} placeholder="g" aria-label={`Grams ${i + 1}`} /></Field>
            <button type="button" className="icon-btn" aria-label={`Remove ingredient ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon name="trash" size={18} /></button>
          </div>
        ))}
      </div>
      <datalist id="ing-list">{ings.map((i) => <option key={i.name} value={i.label} />)}</datalist>
      <button type="button" className="ghost" onClick={() => setRows([...rows, { label: "", grams: "" }])}><Icon name="plus" size={18} /> Add ingredient</button>
      <p className="hint">Use raw weights. The nutrition tables list ingredients before cooking.</p>
      <div className="row-controls">
        <div><span className="field-label">This recipe makes</span><Stepper label="servings" value={servings} onChange={setServings} min={1} step={1} max={30} /></div>
        <div><span className="field-label">Meal</span><Segmented label="Meal" value={meal} onChange={setMeal} options={MEALS} /></div>
      </div>
      <button className="primary wide" onClick={calc}>Calculate nutrition</button>
      <Alert tone="error">{err}</Alert>
      {res && <Result title={name || "Your recipe"} subtitle={`One serving, from a recipe that makes ${res.n.servings}`} nutrition={res.n.per_serving} verdict={res.v}
        breakdown={res.n.breakdown} factor={1 / res.n.servings} note="Each ingredient: weight / 100 x nutrient per 100 g. Totals are added, then divided by servings." added={added}
        onAdd={() => { onAdd({ name: `${name || "Home recipe"} (1 serving)`, meal, ...res.n.per_serving }); setAdded(true); }} />}
    </div>
  );
}

export default function Analyze({ profile, onAdd, onGoal }) {
  const [mode, setMode] = useState("dish");
  return (
    <div>
      <section className="hero">
        <h1>What's on your plate?</h1>
        <p>Snap a dish, scan a label or type a recipe. See the calories and what the meal means for your goal.</p>
        {!profile && <button className="link" onClick={onGoal}>Set your goal to get a verdict on every meal</button>}
      </section>
      <Segmented label="What do you want to check" value={mode} onChange={setMode} options={[["dish", "Dish photo"], ["label", "Packaged food"], ["recipe", "Recipe"]]} />
      <div hidden={mode !== "dish"}><DishPanel profile={profile} onAdd={onAdd} /></div>
      <div hidden={mode !== "label"}><LabelPanel profile={profile} onAdd={onAdd} /></div>
      <div hidden={mode !== "recipe"}><RecipePanel profile={profile} onAdd={onAdd} /></div>
    </div>
  );
}
