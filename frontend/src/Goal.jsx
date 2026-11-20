import { useState } from "react";
import { post } from "./api.js";
import { Alert, Field, Segmented } from "./ui.jsx";
import { cleanProfile, fmt } from "./lib.js";

export const EMPTY = { age: 21, sex: "male", height_cm: 170, weight_kg: 65, goal_weight_kg: "", activity: "light", goal: "maintain", bmi_standard: "asian" };
const GOALS = [["lose", "Lose weight"], ["maintain", "Stay the same"], ["gain", "Build up"]];
const ACTIVITY = [["sedentary", "Mostly sitting"], ["light", "Light exercise, 1 to 3 days"], ["moderate", "Moderate, 3 to 5 days"], ["active", "Hard exercise, 6 to 7 days"], ["very_active", "Very hard or physical job"]];

function BmiScale({ bmi, standard }) {
  const cuts = standard === "who" ? [18.5, 25, 30] : [18.5, 23, 25];
  const names = ["Underweight", "Normal", "Overweight", "Obese"];
  const lo = 15, hi = 35, pos = (v) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  const edges = [lo, ...cuts, hi];
  return (
    <div className="bmi">
      <div className="bmi-bar">
        {names.map((n, i) => <span key={n} style={{ width: pos(edges[i + 1]) - pos(edges[i]) + "%" }} className={"b" + i}>{n}</span>)}
        <i style={{ left: pos(bmi) + "%" }} aria-hidden="true" />
      </div>
      <small>BMI {bmi}. Screening only: it cannot tell muscle from fat.</small>
    </div>
  );
}

export default function Goal({ profile, targets, onSave }) {
  const [p, setP] = useState(profile || EMPTY);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setP({ ...p, [k]: v });
  const save = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { const t = await post("/api/goal", cleanProfile(p)); onSave(p, t); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <section className="hero">
        <h1>Your goal</h1>
        <p>Tell us a little about you. We turn it into a daily plan and judge every meal against it.</p>
      </section>
      <form className="panel" onSubmit={save}>
        <div><span className="field-label">What do you want?</span><Segmented label="Goal" value={p.goal} onChange={(v) => set("goal", v)} options={GOALS} /></div>
        <div className="grid">
          <Field label="Age"><input inputMode="numeric" type="number" min="10" max="100" value={p.age} onChange={(e) => set("age", e.target.value)} /></Field>
          <Field label="Sex"><select value={p.sex} onChange={(e) => set("sex", e.target.value)}><option value="male">Male</option><option value="female">Female</option></select></Field>
          <Field label="Height (cm)"><input inputMode="decimal" type="number" min="100" max="230" value={p.height_cm} onChange={(e) => set("height_cm", e.target.value)} /></Field>
          <Field label="Weight now (kg)"><input inputMode="decimal" type="number" min="25" max="250" value={p.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} /></Field>
          <Field label="Goal weight (kg)" hint="Optional"><input inputMode="decimal" type="number" min="25" max="250" value={p.goal_weight_kg} onChange={(e) => set("goal_weight_kg", e.target.value)} /></Field>
          <Field label="BMI scale"><select value={p.bmi_standard} onChange={(e) => set("bmi_standard", e.target.value)}><option value="asian">Asian Indian (23 and 25)</option><option value="who">WHO (25 and 30)</option></select></Field>
        </div>
        <Field label="How active are you?"><select value={p.activity} onChange={(e) => set("activity", e.target.value)}>{ACTIVITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <button className="primary wide" disabled={busy}>{busy ? "Working it out..." : "Save my plan"}</button>
        <Alert tone="error">{err}</Alert>
      </form>
      {targets && (
        <section className="plan">
          <h2>Your daily plan</h2>
          <div className="plan-grid">
            <div className="big"><b>{fmt(targets.target_kcal)}</b><span>kcal a day</span></div>
            <div><b>{targets.protein_g} g</b><span>protein</span></div>
            <div><b>{targets.carbs_g} g</b><span>carbs</span></div>
            <div><b>{targets.fat_g} g</b><span>fat</span></div>
            <div><b>{targets.water_l} L</b><span>water</span></div>
          </div>
          <BmiScale bmi={targets.bmi} standard={targets.bmi_standard} />
          {targets.notes.map((n, i) => <Alert key={i} tone="warn">{n}</Alert>)}
          <p className="fine">{targets.assumptions} {targets.disclaimer}</p>
        </section>
      )}
    </div>
  );
}
