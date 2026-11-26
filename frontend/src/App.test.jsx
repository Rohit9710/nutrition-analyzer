import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";

const NUTR = { kcal: 414, protein_g: 9.5, carbs_g: 62.3, fat_g: 14.4, fiber_g: 4.1, sugar_g: 6.2, sodium_mg: 820 };
const TARGETS = { bmi: 22.5, bmi_category: "Normal", bmi_standard: "asian", target_kcal: 1900, protein_g: 80, carbs_g: 240, fat_g: 53, water_l: 2.3, notes: [], assumptions: "A.", disclaimer: "D.", bmr_kcal: 1600, maintenance_kcal: 2200 };
const VERDICT = { status: "fits", headline: "Fits your goal", reasons: ["Reason one."], flags: [{ nutrient: "sodium", level: "high", message: "High sodium (820 mg per serving)." }], targets: TARGETS, meal: "lunch", meal_budget_kcal: 665, ratio: 0.62 };
const json = (b) => Promise.resolve({ ok: true, json: () => Promise.resolve(b) });

beforeEach(() => {
  localStorage.clear();
  global.fetch = vi.fn((url) => {
    if (url.endsWith("/api/dishes")) return json([{ name: "poha", label: "Poha", serving: "1 plate (~180 g)" }]);
    if (url.endsWith("/api/ingredients")) return json([{ name: "potato", label: "Potato" }]);
    if (url.endsWith("/api/dish/nutrition")) return json({ label: "Poha", serving: "1 plate", per_serving: NUTR, assumption: "Estimate.", breakdown: [{ ingredient: "poha", label: "Flattened rice (poha)", grams: 60, kcal: 207 }] });
    if (url.endsWith("/api/goal")) return json(TARGETS);
    if (url.endsWith("/api/verdict")) return json(VERDICT);
    return Promise.reject(new Error("unmocked " + url));
  });
});
afterEach(cleanup);

describe("Nutrition Analyzer UI", () => {
  it("opens on the plate hero with the goal prompt", async () => {
    render(<App />);
    expect(screen.getByText("What's on your plate?")).toBeTruthy();
    expect(screen.getByText("Set your goal")).toBeTruthy();
    expect(screen.getAllByText("Take photo").length).toBeGreaterThan(0);
  });

  it("shows nutrition after picking a dish, then logs it under Today", async () => {
    render(<App />);
    await screen.findByText("Choose a dish");
    await waitFor(() => expect(screen.getAllByRole("option", { name: "Poha" }).length).toBeGreaterThan(0));
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "poha" } });
    await screen.findByText("Add to today");
    expect(screen.getByText("How we calculated this")).toBeTruthy();
    fireEvent.click(screen.getByText("Add to today"));
    expect(screen.getByText("Added to today")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Today/ }));
    expect(await screen.findByText(/Poha \(portion\)/)).toBeTruthy();
    expect(screen.getByText("414 kcal")).toBeTruthy();
  });

  it("saves a goal, shows the daily plan and then judges meals against it", async () => {
    render(<App />);
    fireEvent.click(screen.getAllByText("Set your goal")[0]);
    fireEvent.click(await screen.findByText("Lose weight"));
    fireEvent.click(screen.getByText("Save my plan"));
    await waitFor(() => expect(screen.getByText("1,900 kcal a day")).toBeTruthy());
    expect(JSON.parse(localStorage.getItem("na_targets")).target_kcal).toBe(1900);
    await waitFor(() => expect(screen.getAllByRole("option", { name: "Poha" }).length).toBeGreaterThan(0));
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "poha" } });
    expect(await screen.findByText("Fits your goal")).toBeTruthy();
    expect(screen.getByText(/62% of your lunch budget/)).toBeTruthy();
    expect(screen.getByText(/High sodium/)).toBeTruthy();
  });

  it("explains an unknown ingredient instead of failing silently", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("Recipe"));
    fireEvent.change(screen.getByLabelText("Ingredient 1"), { target: { value: "Dragonfruit" } });
    fireEvent.change(screen.getByLabelText("Grams 1"), { target: { value: "100" } });
    fireEvent.click(screen.getByText("Calculate nutrition"));
    expect(await screen.findByText(/not in our ingredient list/)).toBeTruthy();
  });

  it("offers one-tap popular dishes and shows a full result without any photo", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Poha" }));
    expect(await screen.findByText("Add to today")).toBeTruthy();
    expect(screen.getByText(/Regular portion for Poha/)).toBeTruthy();
  });

  it("switches between light and dark themes and remembers the choice", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Switch to (dark|light) theme/ }));
    const first = document.documentElement.dataset.theme;
    expect(["light", "dark"]).toContain(first);
    fireEvent.click(screen.getByRole("button", { name: /Switch to (dark|light) theme/ }));
    expect(document.documentElement.dataset.theme).not.toBe(first);
    expect(JSON.parse(localStorage.getItem("na_theme"))).toBe(document.documentElement.dataset.theme);
  });
});
