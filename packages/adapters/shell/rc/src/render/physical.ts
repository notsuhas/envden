import type { TShell } from "../shell.ts";

export function renderPhysical(shell: TShell) {
  if (shell === "powershell")
    return `function _envden_physical_path([string]$path) {
  if (!$path) { return '' }
  $directory = Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
  if (!$directory) { return '' }
  if ($directory.LinkType) {
    try { $target = $directory.ResolveLinkTarget($true) } catch { return '' }
    if ($target) { return _envden_physical_path $target.FullName }
  }
  if (!$directory.Parent) { return $directory.FullName }
  $parent = _envden_physical_path $directory.Parent.FullName
  if (!$parent) { return '' }
  return [IO.Path]::Combine($parent, $directory.Name)
}`;

  if (shell === "fish")
    return `function _envden_inside
  set -l directory $argv[2]
  while test -n "$directory"
    if test "$directory" -ef "$argv[1]"
      return 0
    end
    if test "$directory" = /
      break
    end
    set directory (string replace -r '/[^/]*$' '' -- "$directory")
    test -n "$directory"; or set directory /
  end
  return 1
end`;

  return `_envden_inside() {
  local directory="$2"
  while [ -n "$directory" ]; do
    [ "$directory" -ef "$1" ] && return 0
    [ "$directory" != / ] || break
    directory="\${directory%/*}"
    [ -n "$directory" ] || directory=/
  done
  return 1
}`;
}
