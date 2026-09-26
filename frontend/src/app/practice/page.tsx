import Link from "next/link";

// Placeholder: practice money is being specced. No numbers here until the feature exists.
export default function PracticeScreen() {
  return (
    <section className="stack" style={{ gap: 28 }}>
      <div className="stack" style={{ gap: 8 }}>
        <span className="ticker">Practice</span>
        <h1>Try an idea first</h1>
        <p className="lede">Practice trades with pretend money, so you can see how an idea would have gone before you risk anything real.</p>
      </div>
      <div className="card">
        <h3>Coming next</h3>
        <p>Practice isn&apos;t built yet. Nothing on this page places a trade, real or pretend.</p>
        <p className="mute">Until then, you can check whether a kind of news has ever mattered for a stock.</p>
        <Link className="btn small" href="/lab" style={{ alignSelf: "flex-start" }}>Does it matter?</Link>
      </div>
    </section>
  );
}
