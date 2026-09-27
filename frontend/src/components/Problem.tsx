"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, SAVED, SAVED_AS_OF, SAVED_TICKERS } from "@/lib/api";

/** The API answered "we have no data for this" (as opposed to not answering at all). */
export const isNotFound = (e: unknown) => e instanceof ApiError && e.status === 404;

/** Loading, in words. After a while it says it's still waiting, so a slow API never looks like a blank page. */
export function Loading({ what }: { what: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="pulse" aria-hidden />
      <span>{slow ? `Still waiting for Stone's data (${what})…` : `Loading ${what}…`}</span>
    </div>
  );
}

/** The API is down, slow to fail, or answered with an error. Never a raw error message. */
export function ApiProblem() {
  return (
    <div className="card problem" role="alert">
      <h3>Can&apos;t reach Stone&apos;s data</h3>
      <p>Stone can&apos;t reach its data right now. Is the server running?</p>
      <button className="btn small" type="button" onClick={() => window.location.reload()} style={{ alignSelf: "flex-start" }}>Try again</button>
    </div>
  );
}

/** /company/XYZ for a ticker Stone doesn't have. */
export function NotFollowed({ ticker }: { ticker: string }) {
  return (
    <div className="card problem">
      <h3>{SAVED ? `${ticker} isn't in the live demo` : <>We don&apos;t follow {ticker} yet</>}</h3>
      {SAVED
        ? <p>The live demo runs on real data saved at the close on {SAVED_AS_OF}, for {SAVED_TICKERS}. The full app covers the S&amp;P 100 and a few funds.</p>
        : <p>Stone has filings, prices and signals for the S&amp;P 100 companies and a few funds. {ticker} isn&apos;t one of them yet.</p>}
      <div className="row-flex">
        <Link className="btn small" href="/">Back to your portfolio</Link>
        <Link className="btn light small" href="/lab">Does it matter?</Link>
      </div>
    </div>
  );
}
