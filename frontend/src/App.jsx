import { useState } from "react";
import Analyze from "./Analyze.jsx";
import Today from "./Today.jsx";
import Goal from "./Goal.jsx";
import { Icon } from "./ui.jsx";
import { fmt, today, useStored } from "./lib.js";

const TABS = [["analyze", "Analyze", "scan"], ["today", "Today", "log"], ["goal", "My goal", "target"]];

export default function App() {
  const [tab, setTab] = useState("analyze");
  const [profile, setProfile] = useStored("na_profile", null);
  const [targets, setTargets] = useStored("na_targets", null);
  const [log, setLog] = useStored("na_log", { date: today(), items: [] });
  const items = log.date === today() ? log.items : [];

  const add = (entry) => setLog({ date: today(), items: [...items, { id: Date.now() + Math.random(), ...entry }] });
  const remove = (id) => setLog({ date: today(), items: items.filter((i) => i.id !== id) });

  return (
    <div className="shell">
      <header className="top">
        <div className="brand"><span className="mark" aria-hidden="true" /><b>Nutrition Analyzer</b></div>
        <button className="chip-goal" onClick={() => setTab("goal")}>
          {targets ? `${fmt(targets.target_kcal)} kcal a day` : "Set your goal"}
        </button>
      </header>
      <nav className="tabs" aria-label="Main">
        {TABS.map(([k, label, icon]) => (
          <button key={k} className={tab === k ? "on" : ""} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>
            <Icon name={icon} size={22} /><span>{label}</span>
            {k === "today" && items.length > 0 && <em>{items.length}</em>}
          </button>
        ))}
      </nav>
      <main>
        <div hidden={tab !== "analyze"}><Analyze profile={profile} onAdd={add} onGoal={() => setTab("goal")} /></div>
        {tab === "today" && <Today items={items} targets={targets} onRemove={remove} onClear={() => setLog({ date: today(), items: [] })} onGoal={() => setTab("goal")} />}
        {tab === "goal" && <Goal profile={profile} targets={targets} onSave={(p, t) => { setProfile(p); setTargets(t); setTab("analyze"); }} />}
      </main>
      <footer>Awareness, not diagnosis. Minor project, B.Tech CSE (Data Science), MAIT.</footer>
    </div>
  );
}
