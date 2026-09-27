"use client";

import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { SAVED } from "./api";

// A short guided tour of the portfolio (driver.js). On the saved-data demo it runs once by itself on a first visit,
// remembered in this browser; everywhere, "Take the tour" on the portfolio plays it. Steps not on screen are skipped.
const KEY = "stone.tour";

const STEPS: DriveStep[] = [
  { element: ".pf-head", popover: { title: "Everything you own", description: "One number for everything you hold, at the last market close, and how many things are worth a look today." } },
  { element: ".alloc-wrap", popover: { title: "Where it sits", description: "Stocks, funds, a 401(k), private funds and a home, as one bar." } },
  { element: "[data-tour=ownmap]", popover: { title: "What you really own", description: "In Pro, funds are opened up into the stocks inside them, so a stock you own twice shows as one box. Gold means Heads up." } },
  { element: "[data-tour=risk]", popover: { title: "How bumpy it's been", description: "Your worst drop from a high, and how your mix moves next to the market." } },
  { element: ".hrow", popover: { title: "Calm or Heads up", description: "Heads up means something that has come before drops for that stock is happening again. Not proven, and not a prediction. Tap a row to see it." } },
  { element: ".seg", popover: { title: "Lite or Pro", description: "The same answer either way. Pro adds the working: case counts, ranges, the stricter checks, candles and the full risk table." } },
  { element: "a[href='/signals']", popover: { title: "Has this mattered before?", description: "Pick a stock and a kind of news. Precedence shows every time it happened in two years and what the stock did next." } },
];

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === "done";
  } catch {
    return true; // storage blocked: never nag
  }
}

export function startTour() {
  const steps = STEPS.filter((s) => {
    if (typeof s.element !== "string") return true;
    const el = document.querySelector(s.element) as HTMLElement | null;
    return !!el && el.offsetParent !== null; // skip steps that aren't visible (e.g. a Pro-only block in Lite)
  });
  if (!steps.length) return;
  const d = driver({
    steps,
    showProgress: true,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    popoverClass: "precedence-tour",
    stagePadding: 6,
    stageRadius: 12,
    animate: !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    onDestroyed: () => {
      try {
        localStorage.setItem(KEY, "done");
      } catch {}
    },
  });
  d.drive();
}

/** On the portfolio: the first visit to the saved-data demo gets the tour once, after the page has settled. */
export function maybeAutoTour() {
  if (!SAVED || seen() || new URLSearchParams(window.location.search).has("notour")) return;
  setTimeout(startTour, 700);
}
