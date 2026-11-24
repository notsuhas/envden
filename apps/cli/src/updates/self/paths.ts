function brewPaths(path: string) {
  let prefix = /^(\/.*)\/Cellar\/envden\//.exec(path)?.[1];

  if (!prefix && /^\/(opt\/homebrew|usr\/local)\/(bin|opt\/envden\/bin)\/envden$/.test(path))
    prefix = path.startsWith("/opt/homebrew/") ? "/opt/homebrew" : "/usr/local";

  return prefix ? { manager: `${prefix}/bin/brew`, binary: `${prefix}/bin/envden` } : undefined;
}

// Cleanup removes versioned Cellar folders, so persisted paths use Homebrew's stable link.
export function stableExecutable(executable: string) {
  return brewPaths(executable)?.binary ?? executable;
}

export function pinnedInstall(manager: string, executable: string) {
  return manager === "brew" ? brewPaths(executable) : undefined;
}
