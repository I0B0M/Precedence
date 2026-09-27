"use client";

import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { SAVED } from "./api";

// A short guided tour of the board (driver.js). On the live site it runs once by itself on a first visit, remembered in
// this browser; everywhere, the header's Tour button plays it. Steps whose element isn't on screen are skipped.
const KEY = "stone.tour";

const STEPS: DriveStep[] = [
  { element: ".pf-head", popover: { title: "Everything you own", description: "One number for everything you hold, at the last market close, and how many things are worth a look today." } },
  { element: "[data-tour=ownmap]", popover: { title: "What you really own", description: "Funds are opened up into the stocks inside them, so a stock you own twice shows as one box. Blue means Heads up." } },
  { element: "[data-tour=risk]", popover: { title: "How bumpy it's been", description: "Your worst drop from a high, in dollars, and how your mix moves next to the market. Worked out with QuantStats." } },
  { element: ".hrow", popover: { title: "Calm or Heads up", description: "Heads up only when news is happening that has actually mattered before for that stock. Tap a row to see it in plain words." } },
  { element: ".osw", popover: { title: "Tap the O for Pro", description: "The same data with the working shown: case counts, 90% ranges, the hold-out, candles and the full risk table." } },
  { element: "a[href='/lab']", popover: { title: "Does it matter?", description: "Pick a stock and a kind of news. Stone shows every time it happened in two years and what the stock did next." } },
];

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === "done";
  } catch {
    return true; // storage blocked: never nag
  }
}

export function startTour() {
  const steps = STEPS.filter((s) => typeof s.element !== "string" || document.querySelector(s.element));
  if (!steps.length) return;
  const d = driver({
    steps,
    showProgress: true,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    popoverClass: "stone-tour",
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

/** On the board: the first visit gets the tour once, after the page has settled. */
export function maybeAutoTour() {
  if (!SAVED || seen() || new URLSearchParams(window.location.search).has("notour")) return;
  setTimeout(startTour, 700);
}
