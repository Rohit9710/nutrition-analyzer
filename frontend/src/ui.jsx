import { useEffect, useState } from "react";
import { fmt, useCountUp } from "./lib.js";

const PATHS = {
  camera: "M4 8h3l2-3h6l2 3h3v11H4z M12 10.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
  image: "M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M9 9.5h.01",
  check: "M5 12.5l4.5 4.5L19 7.5",
  alert: "M12 4l9 16H3z M12 10v4 M12 17v.5",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v5 M12 7.5v.5",
  plus: "M12 5v14 M5 12h14",
  minus: "M5 12h14",
  trash: "M5 7h14 M9 7V4h6v3 M7 7l1 13h8l1-13",
  scan: "M4 8V5h3 M17 5h3v3 M20 16v3h-3 M7 19H4v-3 M4 12h16",
  log: "M6 4h12v16H6z M9 9h6 M9 13h6 M9 17h3",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M12 11.5v1",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4",
  moon: "M21 13a8 8 0 1 1-10-10 6.5 6.5 0 0 0 10 10z",
};

export function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0.5, max = 20, step = 0.5, label }) {
  const set = (v) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)));
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Less ${label}`} onClick={() => set(Number(value) - step)}><Icon name="minus" size={18} /></button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`More ${label}`} onClick={() => set(Number(value) + step)}><Icon name="plus" size={18} /></button>
    </div>
  );
}

export function Alert({ tone = "info", children }) {
  if (!children) return null;
  return (
    <div className={"alert " + tone} role={tone === "error" ? "alert" : "status"}>
      <Icon name={tone === "info" ? "info" : "alert"} size={18} />
      <div>{children}</div>
    </div>
  );
}

const COLORS = { protein: "var(--c-protein)", carbs: "var(--c-carbs)", fat: "var(--c-fat)" };

/** The plate: a calorie ring split by where the calories come from. */
export function PlateRing({ protein, carbs, fat, kcal, size = 210, caption = "kcal" }) {
  const parts = [["protein", protein * 4], ["carbs", carbs * 4], ["fat", fat * 9]];
  const total = parts.reduce((a, [, v]) => a + v, 0) || 1;
  const r = 78, C = 2 * Math.PI * r, gap = 5;
  const [ready, setReady] = useState(false);
  useEffect(() => { const id = setTimeout(() => setReady(true), 30); return () => clearTimeout(id); }, []);
  let offset = 0;
  const shown = useCountUp(kcal);
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={`${fmt(kcal)} calories: protein ${Math.round(protein)} g, carbs ${Math.round(carbs)} g, fat ${Math.round(fat)} g`}>
        <circle cx="100" cy="100" r={r} fill="none" className="ring-track" strokeWidth="22" />
        {parts.map(([k, v]) => {
          const len = Math.max(0, (v / total) * C - gap);
          const el = (
            <circle key={k} cx="100" cy="100" r={r} fill="none" strokeWidth="22" strokeLinecap="butt"
              strokeDasharray={`${ready ? len : 0} ${C}`} strokeDashoffset={-offset} transform="rotate(-90 100 100)"
              style={{ stroke: COLORS[k], transition: "stroke-dasharray .9s cubic-bezier(.2,.8,.2,1)" }} />
          );
          offset += (v / total) * C;
          return el;
        })}
      </svg>
      <div className="ring-center"><b>{fmt(shown)}</b><span>{caption}</span></div>
    </div>
  );
}

export function ProgressRing({ value, goal, size = 150 }) {
  const r = 62, C = 2 * Math.PI * r;
  const pct = goal ? Math.min(1.25, value / goal) : 0;
  const over = goal && value > goal;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 160 160" width={size} height={size} role="img" aria-label={`${fmt(value)} of ${fmt(goal || 0)} calories today`}>
        <circle cx="80" cy="80" r={r} fill="none" className="ring-track" strokeWidth="16" />
        <circle cx="80" cy="80" r={r} fill="none" strokeWidth="16" strokeLinecap="round"
          strokeDasharray={`${Math.min(1, pct) * C} ${C}`} transform="rotate(-90 80 80)" style={{ stroke: over ? "var(--chilli)" : "var(--brand)", transition: "stroke-dasharray .6s ease" }} />
      </svg>
      <div className="ring-center small"><b>{fmt(value)}</b><span>of {goal ? fmt(goal) : "?"} kcal</span></div>
    </div>
  );
}

const LIMITS = { sugar_g: ["Sugar", 50, "g"], sodium_mg: ["Sodium", 2000, "mg"] };

export function Result({ title, subtitle, nutrition, verdict, flags, note, breakdown, factor = 1, onAdd, added }) {
  const macros = [["Protein", nutrition.protein_g, "protein", 4], ["Carbs", nutrition.carbs_g, "carbs", 4], ["Fat", nutrition.fat_g, "fat", 9]];
  const sum = macros.reduce((a, m) => a + m[1] * m[3], 0) || 1;
  const allFlags = verdict?.flags || flags || [];
  const tone = verdict ? { fits: "good", smaller_portion: "ok", add_more: "ok", not_ideal: "bad" }[verdict.status] : null;
  const ratio = verdict?.ratio;
  return (
    <section className="result" aria-live="polite">
      <header className="result-head">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <div className="result-body">
        <PlateRing protein={nutrition.protein_g} carbs={nutrition.carbs_g} fat={nutrition.fat_g} kcal={nutrition.kcal} />
        <ul className="legend">
          {macros.map(([l, g, k, c]) => (
            <li key={k}><i style={{ background: COLORS[k] }} /><span>{l}</span><b>{Math.round(g * 10) / 10} g</b><em>{Math.round((g * c / sum) * 100)}%</em></li>
          ))}
          <li className="plain"><span>Fiber</span><b>{Math.round(nutrition.fiber_g * 10) / 10} g</b></li>
        </ul>
      </div>
      <div className="meters">
        {Object.entries(LIMITS).map(([k, [label, limit, unit]]) => {
          const pct = Math.min(100, (nutrition[k] / limit) * 100);
          return (
            <div key={k} className="meter">
              <div><span>{label}</span><b>{Math.round(nutrition[k])} {unit}</b></div>
              <div className="track"><i className={pct >= 30 ? "hot" : ""} style={{ width: pct + "%" }} /></div>
              <small>{Math.round((nutrition[k] / limit) * 100)}% of a {limit} {unit} daily guide</small>
            </div>
          );
        })}
      </div>
      {verdict && (
        <div className={"verdict " + tone}>
          <h3>{verdict.headline}</h3>
          {ratio != null && (
            <div className="gauge" aria-label={`${Math.round(ratio * 100)}% of your ${verdict.meal} budget`}>
              <div className="track"><i style={{ width: Math.min(100, (ratio / 1.5) * 100) + "%" }} /><u style={{ left: (1 / 1.5) * 100 + "%" }} /></div>
              <small>{Math.round(ratio * 100)}% of your {verdict.meal} budget (about {fmt(verdict.meal_budget_kcal)} kcal)</small>
            </div>
          )}
          <ul>{verdict.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
      {allFlags.map((f, i) => <Alert key={i} tone={f.level === "high" ? "warn" : "info"}>{f.message}</Alert>)}
      {breakdown && (
        <details className="how">
          <summary>How we calculated this</summary>
          <table>
            <thead><tr><th>Ingredient</th><th>Grams</th><th>kcal</th></tr></thead>
            <tbody>{breakdown.map((b) => <tr key={b.ingredient}><td>{b.label}</td><td>{Math.round(b.grams * factor * 10) / 10}</td><td>{Math.round(b.kcal * factor)}</td></tr>)}</tbody>
          </table>
          {note && <p>{note}</p>}
        </details>
      )}
      {!breakdown && note && <p className="note">{note}</p>}
      {onAdd && (
        <button className="primary wide" onClick={onAdd} disabled={added}>
          <Icon name={added ? "check" : "plus"} size={18} /> {added ? "Added to today" : "Add to today"}
        </button>
      )}
      <p className="fine">Awareness only, not medical advice. Nutrition from a photo is an estimate.</p>
    </section>
  );
}
