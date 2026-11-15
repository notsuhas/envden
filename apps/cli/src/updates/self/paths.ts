function brewPaths(path: string) {
  let prefix = /^(\/.*)\/Cellar\/envden\//.exec(path)?.[1];

  if (!prefix && /^\/(opt\/homebrew|usr\/local)\/(bin|opt\/envden\/bin)\/envden$/.test(path))
    prefix = path.startsWith("/opt/homebrew/") ? "/opt/homebrew" : "/usr/local";

  return prefix ? { manager: `${prefix}/bin/brew`, binary: `${prefix}/bin/envden` } : undefined;
}

function npmPaths(path: string, executable: string) {
  const prefix =
    /^(\/.*)\/lib\/node_modules\/envden\//.exec(path)?.[1] ??
    /^(\/.*)\/bin\/envden$/.exec(path)?.[1];

  if (prefix) return { manager: `${prefix}/bin/npm`, binary: `${prefix}/bin/envden` };

  const windows = /^([A-Za-z]:\/.*\/npm)\/(?:node_modules\/envden\/.*|envden(?:\.exe)?)$/.exec(
    path,
  )?.[1];

  return windows ? { manager: `${windows}/npm.cmd`, binary: executable } : undefined;
}

export function pinnedInstall(manager: string, executable: string) {
  const path = executable.replaceAll("\\", "/");

  switch (manager) {
    case "brew":
      return brewPaths(path);
    case "npm":
      return npmPaths(path, executable);
    case "scoop": {
      const prefix = /^([A-Za-z]:\/.*\/scoop)\/apps\/envden\//i.exec(path)?.[1];

      return prefix
        ? {
            manager: `${prefix}/shims/scoop.cmd`,
            binary: `${prefix}/shims/envden.exe`,
          }
        : undefined;
    }
    case "winget": {
      const prefix =
        /^([A-Za-z]:\/.*\/AppData\/Local)\/Microsoft\/WinGet\/(?:Packages|Links)\//i.exec(
          path,
        )?.[1];

      return prefix
        ? {
            manager: `${prefix}/Microsoft/WindowsApps/winget.exe`,
            binary: `${prefix}/Microsoft/WinGet/Links/envden.exe`,
          }
        : undefined;
    }
    default:
      return undefined;
  }
}
