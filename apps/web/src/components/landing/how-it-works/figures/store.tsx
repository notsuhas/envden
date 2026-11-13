const CHECKOUT_LINKS = [
  { path: "~/code/shop/.env", note: "clone" },
  { path: "~/code/shop-fix/.env", note: "worktree" },
];

const STORE_FILE = "~/.envden/store/github.com/you/shop/.env";

export function StoreFigure() {
  return (
    <figure className="rounded-xl border border-den-line bg-den-surface p-5 font-mono text-[13px] leading-7">
      <ul>
        {CHECKOUT_LINKS.map((link) => (
          <li key={link.path} className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-den-ink">{link.path}</span>
            <span className="text-den-muted">{`link, ${link.note}`}</span>
          </li>
        ))}
      </ul>
      <p className="py-1 pl-4 text-den-muted" aria-hidden="true">
        ↓
      </p>
      <p className="break-all rounded-lg border border-den-lantern px-3 py-1.5 text-den-ink">
        {STORE_FILE}
      </p>
      <figcaption className="pt-3 font-sans text-xs text-den-muted">
        Both checkouts link to the one real file in the store.
      </figcaption>
    </figure>
  );
}
