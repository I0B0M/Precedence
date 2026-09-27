import Link from "next/link";

// Any URL Precedence has no page for.
export default function NotFound() {
  return (
    <div className="card problem">
      <h3>No page here</h3>
      <div className="row-flex">
        <Link className="btn small" href="/">Home</Link>
        <Link className="btn light small" href="/portfolio">Your portfolio</Link>
      </div>
    </div>
  );
}
