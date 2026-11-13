import Link from "next/link";

export default function NotFound() {
  return (
    <main className="den-frame flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <p className="den-label">404 / page not found</p>
      <h1 className="den-display text-5xl text-den-ink sm:text-7xl">Nothing here.</h1>
      <p className="max-w-sm text-den-muted">This page may have moved, or the link is wrong.</p>
      <nav aria-label="Page not found" className="flex flex-wrap justify-center gap-4">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center border border-den-ink px-5 font-mono text-sm text-den-ink hover:bg-den-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-den-lantern"
        >
          Home
        </Link>
        <Link
          href="/docs"
          className="inline-flex min-h-11 items-center border border-den-ink px-5 font-mono text-sm text-den-ink hover:bg-den-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-den-lantern"
        >
          Docs
        </Link>
      </nav>
    </main>
  );
}
