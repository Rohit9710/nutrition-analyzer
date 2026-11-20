// jsdom has no matchMedia or URL.createObjectURL: provide minimal versions and skip animations
window.matchMedia = window.matchMedia || ((q) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
URL.createObjectURL = URL.createObjectURL || (() => "blob:test");
