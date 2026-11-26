import { Icon, ProgressRing } from "./ui.jsx";
import { fmt } from "./lib.js";

const bar = (label, v, goal, color) => (
  <div className="today-bar" key={label}>
    <div><span>{label}</span><b>{Math.round(v)} / {goal ? Math.round(goal) : "?"} g</b></div>
    <div className="track"><i style={{ width: Math.min(100, goal ? (v / goal) * 100 : 0) + "%", background: color }} /></div>
  </div>
);

export default function Today({ items, targets, onRemove, onClear, onGoal }) {
  const sum = (k) => items.reduce((a, i) => a + (i[k] || 0), 0);
  return (
    <div>
      <section className="hero">
        <h1>Today</h1>
        <p>Everything you add from the Analyze tab is counted against your daily plan.</p>
      </section>
      {!targets && <p className="empty">Set your goal to see how today compares with your plan. <button className="link" onClick={onGoal}>Set my goal</button></p>}
      <div className="today-top">
        <ProgressRing value={sum("kcal")} goal={targets?.target_kcal} />
        <div className="today-bars">
          {bar("Protein", sum("protein_g"), targets?.protein_g, "var(--c-protein)")}
          {bar("Carbs", sum("carbs_g"), targets?.carbs_g, "var(--c-carbs)")}
          {bar("Fat", sum("fat_g"), targets?.fat_g, "var(--c-fat)")}
          {targets && <p className="hint">Water goal: about {targets.water_l} litres.</p>}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="empty">Nothing logged yet. Check a meal, then tap "Add to today".</p>
      ) : (
        <>
          <ul className="log">
            {items.map((i) => (
              <li key={i.id}>
                <div><b>{i.name}</b><small>{i.meal}</small></div>
                <span>{fmt(i.kcal)} kcal</span>
                <button className="icon-btn" aria-label={`Remove ${i.name}`} onClick={() => onRemove(i.id)}><Icon name="trash" size={18} /></button>
              </li>
            ))}
          </ul>
          <button className="ghost" onClick={onClear}>Clear today</button>
        </>
      )}
    </div>
  );
}
