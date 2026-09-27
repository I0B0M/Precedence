"use client";

import { useEffect, useState } from "react";
import { api, SAVED, SAVED_AS_OF, SAVED_TICKERS, type Status } from "@/lib/api";

/** Shown whenever any sample (fictional) rows are in the database. Never hide this in a demo. */
export function SampleBanner() {
  const [status, setStatus] = useState<Status | null>(null);
  const [down, setDown] = useState(false);
  useEffect(() => {
    api.status().then(setStatus).catch(() => setDown(true));
  }, []);
  if (SAVED) return <div className="sample"><b>SAVED DATA</b>Real data saved at the close on {SAVED_AS_OF}, for {SAVED_TICKERS}. Your own holdings and screenshots need the full app.</div>;
  if (down) return <div className="sample"><b>OFFLINE</b>Can&apos;t reach our server.</div>;
  if (!status || status.data === "real") return null;
  if (status.data === "empty") return <div className="sample"><b>NO DATA</b>The database is empty. Run the sample seed or the real ingest.</div>;
  return (
    <div className="sample">
      <b>SAMPLE DATA</b>
      {status.data === "mixed" ? "Some companies below are fictional sample data." : "Every company and number here is fictional sample data."}
    </div>
  );
}
