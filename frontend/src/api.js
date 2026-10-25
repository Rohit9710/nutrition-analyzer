const BASE = import.meta.env.VITE_API_URL || "";

async function handle(res) {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const get = (p) => fetch(BASE + p).then(handle);
export const post = (p, body) =>
  fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(handle);
export const upload = (p, file) => {
  const fd = new FormData();
  fd.append("image", file);
  return fetch(BASE + p, { method: "POST", body: fd }).then(handle);
};
