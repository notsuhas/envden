import { isAbsolute, join } from "node:path";
import { start, end } from "./markers.ts";
import type { TShell } from "./shell.ts";

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const psQuote = (value: string) => `'${value.replaceAll("'", "''")}'`;

export function renderHook(shell: TShell, binaryPath: string, envdenHome: string) {
  if (!isAbsolute(binaryPath) || /[\r\n]/.test(binaryPath + envdenHome))
    throw new Error("Hook paths must be absolute and single-line");

  const state = join(envdenHome, "state");
  const command = `env -u BUN_OPTIONS -u BUN_BE_BUN ${quote(binaryPath)} status --refresh-cache`;
  let body: string;

  switch (shell) {
    case "bash":
    case "zsh": {
      body = `_envden_notice() {
  local root approved=0 cache=${quote(join(state, "notice"))} now modified
  while IFS= read -r root; do
    [ -n "$root" ] || continue
    case "$PWD/" in "$root/"*) approved=1; break ;; esac
  done < ${quote(join(state, "approved-checkouts"))} 2>/dev/null
  [ "$approved" = 1 ] || return 0
  [ ! -f "$cache" ] || cat -- "$cache"
  now=$(date +%s)
  modified=$(stat -f %m "$cache" 2>/dev/null) || modified=$(stat -c %Y "$cache" 2>/dev/null) || modified=0
  if [ "$((now - modified))" -gt 60 ]; then
    (${command} </dev/null >/dev/null 2>&1 &)
  fi
}
`;

      body +=
        shell === "zsh"
          ? "autoload -Uz add-zsh-hook\nadd-zsh-hook -d chpwd _envden_notice\nadd-zsh-hook chpwd _envden_notice\n_envden_notice"
          : 'case ";${PROMPT_COMMAND:-};" in *\'_envden_notice;\'*) ;; *) PROMPT_COMMAND="_envden_notice;${PROMPT_COMMAND:-}" ;; esac\n_envden_notice';

      break;
    }
    case "fish":
      body = `function _envden_notice --on-variable PWD
  set -l cache ${quote(join(state, "notice"))}
  set -l approved 0
  if test -f ${quote(join(state, "approved-checkouts"))}
    while read -l root
      if test -n "$root"; and test (string sub -l (string length -- "$root/") -- "$PWD/") = "$root/"
        set approved 1
        break
      end
    end < ${quote(join(state, "approved-checkouts"))}
  end
  test $approved = 1; or return
  test ! -f "$cache"; or cat -- "$cache"
  set -l modified (stat -f %m "$cache" 2>/dev/null; or stat -c %Y "$cache" 2>/dev/null; or echo 0)
  if test (math (date +%s) - $modified) -gt 60
    ${command} </dev/null >/dev/null 2>&1 &
    disown
  end
end
_envden_notice`;

      break;
    case "powershell":
      body = `if (!$global:EnvdenPreviousPrompt) { $global:EnvdenPreviousPrompt = $function:prompt }
function global:prompt {
  $cache = ${psQuote(join(state, "notice"))}
  $approved = @(Get-Content -LiteralPath ${psQuote(join(state, "approved-checkouts"))} -ErrorAction SilentlyContinue | Where-Object { $_ -and (($PWD.Path.TrimEnd('/','\\') + [IO.Path]::DirectorySeparatorChar).StartsWith($_.TrimEnd('/','\\') + [IO.Path]::DirectorySeparatorChar, $(if ($IsWindows) { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }))) }).Count -gt 0
  if ($approved) {
    if (Test-Path -LiteralPath $cache) { Get-Content -LiteralPath $cache | Out-Host }
    if (!(Test-Path -LiteralPath $cache) -or ((Get-Date) - (Get-Item -LiteralPath $cache).LastWriteTime).TotalSeconds -gt 60) {
      $info = [Diagnostics.ProcessStartInfo]::new(${psQuote(binaryPath)})
      $info.ArgumentList.Add('status'); $info.ArgumentList.Add('--refresh-cache')
      $info.UseShellExecute = $false; $info.CreateNoWindow = $true
      $info.Environment.Remove('BUN_OPTIONS'); $info.Environment.Remove('BUN_BE_BUN')
      $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
      $process = [Diagnostics.Process]::Start($info)
      $process.Dispose()
    }
  }
  & $global:EnvdenPreviousPrompt
}`;

      break;
  }

  return `${start}\n${body}\n${end}\n`;
}
