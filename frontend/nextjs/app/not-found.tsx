import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-shell">
      <section className="panel" style={{ marginTop: "48px" }}>
        <div className="panel-head">
          <div>
            <h2>Page not found</h2>
            <p>The route you requested does not exist in this vault interface.</p>
          </div>
        </div>
        <div className="button-row">
          <Link className="primary" href="/">
            Return Home
          </Link>
        </div>
      </section>
    </main>
  );
}
