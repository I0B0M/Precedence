import type { Metadata } from "next";
import { Stage } from "@/components/briefing/Stage";
import "./briefing.css";

export const metadata: Metadata = {
  title: "Briefing · Precedence",
  description: "Precedence reads your portfolio out loud: what you own, what's Heads up and why, tied to the evidence.",
};

// Brief: "summarize complex information" · "more accessible … engaging" · "turn information into meaningful insight"
export default function BriefingPage() {
  return (
    <>
      <div className="bf-head">
        <span className="kicker">Briefing</span>
        <h1>What Precedence would tell you today</h1>
        <p className="lede">The board, read out loud, one line at a time, each tied to the numbers it came from.</p>
      </div>
      <Stage />
    </>
  );
}
