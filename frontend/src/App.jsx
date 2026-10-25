import { useEffect, useState } from "react";
import { get, post, upload } from "./api.js";

const EMPTY_PROFILE = { age: 21, sex: "male", height_cm: 170, weight_kg: 65, goal_weight_kg: "", activity: "light", goal: "maintain", bmi_standard: "asian" };
const NUTR = [["kcal", "Calories", "kcal"], ["protein_g", "Protein", "g"], ["carbs_g", "Carbs", "g"], ["fat_g", "Fat", "g"], ["fiber_g", "Fiber", "g"], ["sugar_g", "Sugar", "g"], ["sodium_mg", "Sodium", "mg"]];
const DISCLAIMER = "Awareness only, not medical advice. Nutrition from a photo is an estimate.";

const num = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v));
const cleanProfile = (p) => ({ ...p, age: num(p.age), height_cm: num(p.height_cm), weight_kg: num(p.weight_kg), goal_weight_kg: p.goal_weight_kg === "" ? null : num(p.goal_weight_kg) });

function useProfile() {
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem("na_profile")) || null; } catch { return null; }
  });
  const save = (p) => { setProfile(p); try { localStorage.setItem("na_profile", JSON.stringify(p)); } catch {} };
  return [profile, save];
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Err({ msg }) { return msg ? <div className="alert error">{msg}</div> : null; }

function Result({ title, nutrition, verdict, flags, note }) {
  const max = Math.max(nutrition.protein_g * 4, nutrition.carbs_g * 4, nutrition.fat_g * 9, 1);
  const bars = [["Protein", nutrition.protein_g * 4, "teal"], ["Carbs", nutrition.carbs_g * 4, "navy"], ["Fat", nutrition.fat_g * 9, "orange"]];
  const allFlags = verdict?.flags || flags || [];
  return (
    <div className="card result">
      <h3>{title}</h3>
      <div className="grid-nutr">
        {NUTR.map(([k, l, u]) => (
          <div key={k} className={"stat" + (k === "kcal" ? " big" : "")}><b>{Math.round(nutrition[k] * 10) / 10}</b><small>{u}</small><span>{l}</span></div>
        ))}
      </div>
      <div className="bars">
        {bars.map(([l, v, c]) => (
          <div key={l} className="bar-row"><span>{l}</span><div className="bar"><i className={c} style={{ width: `${(v / max) * 100}%` }} /></div><em>{Math.round(v)} kcal</em></div>
        ))}
      </div>
      {note && <p className="muted">{note}</p>}
      {verdict && (
        <div className={"verdict " + verdict.status}>
          <h4>{verdict.headline}</h4>
          <ul>{verdict.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
      {allFlags.map((f, i) => <div key={i} className={"alert " + (f.level === "high" ? "warn" : "info")}>{f.message}</div>)}
      <p className="muted small">{DISCLAIMER}</p>
    </div>
  );
}

function MealSelect({ value, onChange }) {
  return (
    <Field label="Meal">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {["breakfast", "lunch", "dinner", "snack"].map((m) => <option key={m}>{m}</option>)}
      </select>
    </Field>
  );
}

async function withVerdict(profile, nutrition, meal, per100) {
  if (!profile) return null;
  return post("/api/verdict", { profile: cleanProfile(profile), nutrition, meal, per100: per100 || null });
}

function DishTab({ profile }) {
  const [dishes, setDishes] = useState([]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [pred, setPred] = useState(null);
  const [dish, setDish] = useState("");
  const [servings, setServings] = useState(1);
  const [meal, setMeal] = useState("lunch");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { get("/api/dishes").then((d) => { setDishes(d); setDish(d[0]?.name || ""); }).catch((e) => setErr(e.message)); }, []);

  const onFile = (f) => { setFile(f); setRes(null); setPred(null); setPreview(f ? URL.createObjectURL(f) : null); };
  const identify = async () => {
    setErr(""); setBusy(true);
    try {
      const r = await upload("/api/dish/predict", file);
      setPred(r);
      if (r.predictions?.length) setDish(r.predictions[0].dish);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const analyze = async () => {
    setErr(""); setBusy(true);
    try {
      const n = await post("/api/dish/nutrition", { dish, servings: num(servings) || 1 });
      const v = await withVerdict(profile, n.per_serving, meal);
      setRes({ n, v });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <section>
      <div className="card">
        <h3>1. Upload a photo of your dish</h3>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => onFile(e.target.files[0])} />
        {preview && <img className="preview" src={preview} alt="dish preview" />}
        <button disabled={!file || busy} onClick={identify}>Identify dish</button>
        {pred && !pred.model_loaded && <div className="alert info">{pred.message} Pick the dish below to continue.</div>}
        {pred?.model_loaded && (
          <div className="chips">
            {pred.predictions.map((p) => <button key={p.dish} className={"chip" + (dish === p.dish ? " on" : "")} onClick={() => setDish(p.dish)}>{p.dish.replace(/_/g, " ")} {Math.round(p.confidence * 100)}%</button>)}
          </div>
        )}
        {pred?.low_confidence && <div className="alert warn">{pred.message}</div>}
      </div>
      <div className="card">
        <h3>2. Confirm and analyze</h3>
        <div className="row">
          <Field label="Dish"><select value={dish} onChange={(e) => setDish(e.target.value)}>{dishes.map((d) => <option key={d.name} value={d.name}>{d.label} ({d.serving})</option>)}</select></Field>
          <Field label="Servings"><input type="number" min="0.5" step="0.5" value={servings} onChange={(e) => setServings(e.target.value)} /></Field>
          <MealSelect value={meal} onChange={setMeal} />
        </div>
        <button disabled={!dish || busy} onClick={analyze}>Analyze nutrition</button>
        <Err msg={err} />
      </div>
      {res && <Result title={`${res.n.label}: ${res.n.serving} x ${servings}`} nutrition={res.n.per_serving} verdict={res.v} note={res.n.assumption} />}
    </section>
  );
}

function LabelTab({ profile }) {
  const [file, setFile] = useState(null);
  const [vals, setVals] = useState({ kcal: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "", sugar_g: "", sodium_mg: "" });
  const [serving, setServing] = useState(30);
  const [meal, setMeal] = useState("snack");
  const [ocr, setOcr] = useState(null);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const read = async () => {
    setErr(""); setBusy(true);
    try {
      const r = await upload("/api/label/ocr", file);
      setOcr(r);
      setVals((v) => ({ ...v, ...Object.fromEntries(Object.entries(r.parsed.per100).map(([k, x]) => [k, String(x)])) }));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const analyze = async () => {
    setErr(""); setBusy(true);
    try {
      const per100 = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, num(v)]));
      const r = await post("/api/label/analyze", { per100, serving_g: num(serving) || 100 });
      const v = await withVerdict(profile, r.per_serving, meal, r.per100);
      setRes({ r, v });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <section>
      <div className="card">
        <h3>1. Photo of the packet's nutrition label (optional)</h3>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files[0])} />
        <button disabled={!file || busy} onClick={read}>Read label (OCR)</button>
        {ocr && !ocr.ocr_available && <div className="alert info">{ocr.message}</div>}
        {ocr?.ocr_available && <div className="alert info">Found: {ocr.parsed.found_fields.join(", ") || "nothing readable"}. Please check every value below.</div>}
        {ocr?.parsed?.ingredients && <p className="muted"><b>Ingredients:</b> {ocr.parsed.ingredients}</p>}
      </div>
      <div className="card">
        <h3>2. Check or type the values (per 100 g)</h3>
        <div className="row wrap">
          {NUTR.map(([k, l, u]) => (
            <Field key={k} label={`${l} (${u})`}><input type="number" min="0" step="0.1" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} /></Field>
          ))}
          <Field label="Serving size (g)"><input type="number" min="1" value={serving} onChange={(e) => setServing(e.target.value)} /></Field>
          <MealSelect value={meal} onChange={setMeal} />
        </div>
        <button disabled={busy} onClick={analyze}>Analyze product</button>
        <Err msg={err} />
      </div>
      {res && <Result title={`Product: ${res.r.serving_g} g serving`} nutrition={res.r.per_serving} verdict={res.v} flags={res.r.flags} />}
    </section>
  );
}

function RecipeTab({ profile }) {
  const [ings, setIngs] = useState([]);
  const [rows, setRows] = useState([{ ingredient: "", grams: "" }]);
  const [servings, setServings] = useState(1);
  const [meal, setMeal] = useState("lunch");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { get("/api/ingredients").then(setIngs).catch((e) => setErr(e.message)); }, []);
  const setRow = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const analyze = async () => {
    setErr("");
    try {
      const items = rows.filter((r) => r.ingredient && r.grams !== "").map((r) => ({ ingredient: r.ingredient, grams: num(r.grams) }));
      if (!items.length) throw new Error("Add at least one ingredient with grams.");
      const n = await post("/api/recipe", { items, servings: num(servings) || 1 });
      const v = await withVerdict(profile, n.per_serving, meal);
      setRes({ n, v });
    } catch (e) { setErr(e.message); }
  };
  return (
    <section>
      <div className="card">
        <h3>Your recipe (raw ingredient weights)</h3>
        {rows.map((r, i) => (
          <div className="row" key={i}>
            <Field label="Ingredient">
              <select value={r.ingredient} onChange={(e) => setRow(i, "ingredient", e.target.value)}>
                <option value="">Select...</option>
                {ings.map((x) => <option key={x.name} value={x.name}>{x.label}</option>)}
              </select>
            </Field>
            <Field label="Grams"><input type="number" min="0" value={r.grams} onChange={(e) => setRow(i, "grams", e.target.value)} /></Field>
            <button className="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}>Remove</button>
          </div>
        ))}
        <button className="ghost" onClick={() => setRows([...rows, { ingredient: "", grams: "" }])}>+ Add ingredient</button>
        <div className="row">
          <Field label="Makes (servings)"><input type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} /></Field>
          <MealSelect value={meal} onChange={setMeal} />
        </div>
        <button onClick={analyze}>Calculate nutrition</button>
        <Err msg={err} />
      </div>
      {res && <Result title={`Per serving (recipe makes ${res.n.servings})`} nutrition={res.n.per_serving} verdict={res.v} note="Calculated as weight / 100 x nutrient per 100 g, summed and divided by servings." />}
    </section>
  );
}

function GoalTab({ profile, save }) {
  const [p, setP] = useState(profile || EMPTY_PROFILE);
  const [t, setT] = useState(null);
  const [err, setErr] = useState("");
  const set = (k, v) => setP({ ...p, [k]: v });
  const run = async () => {
    setErr("");
    try { const r = await post("/api/goal", cleanProfile(p)); setT(r); save(p); } catch (e) { setErr(e.message); }
  };
  return (
    <section>
      <div className="card">
        <h3>Your goal</h3>
        <div className="row wrap">
          <Field label="Age"><input type="number" value={p.age} onChange={(e) => set("age", e.target.value)} /></Field>
          <Field label="Sex"><select value={p.sex} onChange={(e) => set("sex", e.target.value)}><option>male</option><option>female</option></select></Field>
          <Field label="Height (cm)"><input type="number" value={p.height_cm} onChange={(e) => set("height_cm", e.target.value)} /></Field>
          <Field label="Weight (kg)"><input type="number" value={p.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} /></Field>
          <Field label="Goal weight (kg)"><input type="number" value={p.goal_weight_kg} onChange={(e) => set("goal_weight_kg", e.target.value)} /></Field>
          <Field label="Activity"><select value={p.activity} onChange={(e) => set("activity", e.target.value)}>{["sedentary", "light", "moderate", "active", "very_active"].map((a) => <option key={a}>{a}</option>)}</select></Field>
          <Field label="Goal"><select value={p.goal} onChange={(e) => set("goal", e.target.value)}><option value="lose">Weight loss</option><option value="maintain">Maintain</option><option value="gain">Muscle / weight gain</option></select></Field>
          <Field label="BMI cut-offs"><select value={p.bmi_standard} onChange={(e) => set("bmi_standard", e.target.value)}><option value="asian">Asian Indian (23 / 25)</option><option value="who">WHO (25 / 30)</option></select></Field>
        </div>
        <button onClick={run}>Calculate and save</button>
        <Err msg={err} />
      </div>
      {t && (
        <div className="card result">
          <h3>Your daily plan</h3>
          <div className="grid-nutr">
            <div className="stat big"><b>{t.target_kcal}</b><small>kcal</small><span>Daily target</span></div>
            <div className="stat"><b>{t.protein_g}</b><small>g</small><span>Protein</span></div>
            <div className="stat"><b>{t.carbs_g}</b><small>g</small><span>Carbs</span></div>
            <div className="stat"><b>{t.fat_g}</b><small>g</small><span>Fat</span></div>
            <div className="stat"><b>{t.water_l}</b><small>L</small><span>Water</span></div>
            <div className="stat"><b>{t.bmi}</b><small></small><span>BMI: {t.bmi_category}</span></div>
          </div>
          {t.notes.map((n, i) => <div key={i} className="alert warn">{n}</div>)}
          <p className="muted small">{t.assumptions} {t.disclaimer}</p>
          <p className="muted small">Saved on this device. Food results on the other tabs now include a goal verdict.</p>
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [tab, setTab] = useState("dish");
  const [profile, setProfile] = useProfile();
  const tabs = [["dish", "Dish Photo"], ["label", "Packaged Label"], ["recipe", "Recipe"], ["goal", "My Goal"]];
  return (
    <div className="app">
      <header>
        <h1>AI-Based Nutrition Analyzer</h1>
        <p>Dish photo, packet label or recipe in. Nutrition and goal-based guidance out.</p>
      </header>
      <nav>{tabs.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</nav>
      {!profile && tab !== "goal" && <div className="alert info">Set your goal in "My Goal" to get a verdict for each food.</div>}
      {tab === "dish" && <DishTab profile={profile} />}
      {tab === "label" && <LabelTab profile={profile} />}
      {tab === "recipe" && <RecipeTab profile={profile} />}
      {tab === "goal" && <GoalTab profile={profile} save={setProfile} />}
      <footer>Awareness, not diagnosis. Minor project, B.Tech CSE (Data Science), MAIT.</footer>
    </div>
  );
}
