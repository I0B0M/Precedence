"use client";

import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

// A short guided tour of the portfolio (driver.js), started only from "Take the tour" on the portfolio — never
// on its own, so the first thing on screen is never a modal. Steps not on screen are skipped.

const STEPS: DriveStep[] = [
  { element: ".pf-head", popover: { title: "Everything you own", description: "One number for everything you hold, at the last market close, and how many things are worth a look today." } },
  { element: ".alloc-wrap", popover: { title: "Where it sits", description: "Stocks, funds, a 401(k), private funds and a home, as one bar." } },
  { element: "[data-tour=ownmap]", popover: { title: "What you really own", description: "In Pro, funds are opened up into the stocks inside them, so a stock you own twice shows as one box. Gold means Heads up." } },
  { element: "[data-tour=risk]", popover: { title: "How bumpy it's been", description: "Your worst drop from a high, and how your mix moves next to the market." } },
  { element: ".hrow", popover: { title: "Calm or Heads up", description: "Heads up means something that has come before drops for that stock is happening again. Not proven, and not a prediction. Tap a row to see it." } },
  { element: ".seg", popover: { title: "Lite or Pro", description: "The same answer either way. Pro adds the working: case counts, ranges, the stricter checks, candles and the full risk table." } },
  { element: "a[href='/signals']", popover: { title: "Has this mattered before?", description: "Pick a stock and a kind of news. Precedence shows every time it happened in two years and what the stock did next." } },
];

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
  });
  d.drive();
}
