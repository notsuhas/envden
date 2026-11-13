export function remoteParts(remote: string): { host: string; path: string; ssh: boolean } {
  if (remote.includes("://")) {
    if (!/^(ssh|https?|git):\/\//i.test(remote)) throw new Error("Unsupported git remote");

    if (
      decodeURIComponent(remote)
        .split("/")
        .some((part) => part === ".." || part === ".")
    )
      throw new Error("Unsafe git remote");

    const url = new URL(remote);
    if (!url.hostname || url.search || url.hash) throw new Error("Unsupported git remote");

    return {
      host: url.hostname,
      path: decodeURIComponent(url.pathname),
      ssh: url.protocol === "ssh:",
    };
  }

  const scp = /^(?:[^@/\s]+@)?(\[[^\]]+\]|[^:/\s]+):(.+)$/.exec(remote);
  if (!scp) throw new Error("A hosted git remote is required");

  return { host: scp[1]!, path: scp[2]!, ssh: true };
}
