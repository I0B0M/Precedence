"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

// What the running API can do that needs a key: status.screenshots (reading a screenshot) and status.summaries
// (plain-words filing summaries). Asked once per page load. A field is undefined until known, or when an older API
// doesn't send it; callers treat undefined as "not known", never as on.
export type Features = { screenshots?: boolean; summaries?: boolean };

let asked: Promise<Features> | null = null;
export function features(): Promise<Features> {
  asked ??= api.status().then((s) => ({ screenshots: s.screenshots, summaries: s.summaries }), () => ({}));
  return asked;
}

export function useFeatures(): Features {
  const [f, setF] = useState<Features>({});
  useEffect(() => {
    let live = true;
    features().then((v) => live && setF(v));
    return () => { live = false; };
  }, []);
  return f;
}

/** The one quiet line for what isn't working yet. Robinhood connect isn't built; screenshots need a key. */
export function comingNext(screenshots: boolean): string {
  return screenshots ? "Robinhood connect: coming next." : "Robinhood connect and screenshot reading: coming next.";
}
