import { useEffect, useState } from "react";

export const num = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v));
export const fmt = (n) => Math.round(n).toLocaleString("en-IN");
export const today = () => new Date().toISOString().slice(0, 10);
export const cleanProfile = (p) => ({
  ...p, age: num(p.age), height_cm: num(p.height_cm), weight_kg: num(p.weight_kg),
  goal_weight_kg: p.goal_weight_kg === "" || p.goal_weight_kg == null ? null : num(p.goal_weight_kg),
});

export function useStored(key, initial) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  const set = (x) => {
    setV(x);
    try { localStorage.setItem(key, JSON.stringify(x)); } catch {}
  };
  return [v, set];
}

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function useCountUp(target, ms = 650) {
  const [v, setV] = useState(reduced() ? target : 0);
  useEffect(() => {
    if (reduced() || typeof requestAnimationFrame !== "function") { setV(target); return; }
    let raf, start;
    const step = (t) => {
      start ??= t;
      const k = Math.min(1, (t - start) / ms);
      setV(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

// Phone photos are often 5-12 MB. Shrink before upload so they are fast and never hit the server limit.
export async function shrink(file, max = 1024) {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (s === 1 && file.size < 1_500_000) return file;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
    return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}
