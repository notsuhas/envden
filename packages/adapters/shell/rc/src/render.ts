import { renderPhysical } from "./render/physical.ts";
import { EnvdenError } from "@envden/core/errors";
import { isAbsolute, join } from "node:path";
import { start, end } from "./markers.ts";
import type { TShell } from "./shell.ts";

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const psQuote = (value: string) => `'${value.replace(/['’‘‚‛]/g, (quote) => quote + quote)}'`;

export function renderHook(shell: TShell, binaryPath: string, envdenHome: string) {
  if (!isAbsolute(binaryPath) || /[\r\n]/.test(binaryPath + envdenHome))
    throw new EnvdenError("INVALID_INPUT", "Hook paths must be absolute and single-line");

  const state = join(envdenHome, "state");

  const paths = {
    notice: quote(join(state, "notice")),
    approved: quote(join(state, "approved-checkouts")),
    offered: quote(join(state, "track-offered")),
    offers: quote(join(state, "track-offers")),
    update: quote(join(state, "notice-update")),
    day: quote(join(state, "update-offered-day")),
  };

  const command = `env -u BUN_OPTIONS -u BUN_BE_BUN ${quote(binaryPath)} status --refresh-cache`;
  let body: string;

  switch (shell) {
    case "bash":
    case "zsh": {
      body = `_envden_notice() {
  local saved_status=$?
  [ "\${_envden_last_pwd-}" != "$PWD" ] || return "$saved_status"
  _envden_last_pwd="$PWD"
  local physical=${shell === "zsh" ? '"${PWD:A}"' : '"$(pwd -P)"'}
  local root approved=0 cache=${paths.notice} now modified
  [ -r ${paths.approved} ] && while IFS= read -r root; do
    [ -n "$root" ] || continue
    if _envden_inside "$root" "$physical"; then approved=1; break; fi
  done 2>/dev/null < ${paths.approved}
  local offered=${paths.offered} root_seen=0 day line
  [ -r ${paths.offers} ] && while IFS= read -r root; do
    [ -n "$root" ] || continue
    if _envden_inside "$root" "$physical"; then
      root_seen=0
      [ -r "$offered" ] && while IFS= read -r line; do [ "$line" != "$root" ] || root_seen=1; done 2>/dev/null < "$offered"
      if [ "$root_seen" = 0 ]; then
        printf '%s\\n' 'envden: env files found; run envden track'
        printf '%s\\n' "$root" >> "$offered"
      fi
      break
    fi
  done 2>/dev/null < ${paths.offers}
  day=$(date +%Y-%m-%d)
  [ -r ${paths.update} ] && while IFS= read -r line; do
    case "$line" in
      'envden: update required; run envden update') printf '%s\\n' "$line" ;;
      'envden: update available; run envden update')
        if [ "$(cat -- ${paths.day} 2>/dev/null)" != "$day" ]; then
          printf '%s\\n' "$line"
          printf '%s\\n' "$day" > ${paths.day}
        fi ;;
    esac
  done 2>/dev/null < ${paths.update}
  if [ "$approved" = 1 ] && [ -f "$cache" ]; then LC_ALL=C tr -cd '\\11\\12\\40-\\176' < "$cache"; fi
  now=$(date +%s)
  modified=$(stat -c %Y "$cache" 2>/dev/null) || modified=$(stat -f %m "$cache" 2>/dev/null) || modified=0
  if [ "$((now - modified))" -gt 60 ]; then
    (${command} </dev/null >/dev/null 2>&1 &)
  fi
  return "$saved_status"
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
  set -l saved_status $status
  set -l cache ${paths.notice}
  set -l physical (pwd -P)
  set -l approved 0
  if test -f ${paths.approved}
    while read -l root
      if test -n "$root"; and _envden_inside "$root" "$physical"
        set approved 1
        break
      end
    end < ${paths.approved}
  end
  set -l offered ${paths.offered}
  if test -f ${paths.offers}
    while read -l root
      if test -n "$root"; and _envden_inside "$root" "$physical"
        if not contains -- "$root" (cat -- "$offered" 2>/dev/null)
          printf '%s\\n' 'envden: env files found; run envden track'
          printf '%s\\n' "$root" >> "$offered"
        end
        break
      end
    end < ${paths.offers}
  end
  set -l day (date +%Y-%m-%d)
  if test -f ${paths.update}
    while read -l line
      switch "$line"
        case 'envden: update required; run envden update'
          printf '%s\\n' "$line"
        case 'envden: update available; run envden update'
          if test (cat -- ${paths.day} 2>/dev/null; or echo missing) != "$day"
            printf '%s\\n' "$line"
            printf '%s\\n' "$day" > ${paths.day}
          end
      end
    end < ${paths.update}
  end
  if test "$approved" = 1; and test -f "$cache"
    env LC_ALL=C tr -cd '\\11\\12\\40-\\176' < "$cache"
  end
  set -l modified (stat -c %Y "$cache" 2>/dev/null; or stat -f %m "$cache" 2>/dev/null; or echo 0)
  if test (math (date +%s) - "$modified") -gt 60
    ${command} </dev/null >/dev/null 2>&1 &
    disown
  end
  return $saved_status
end
_envden_notice`;

      break;
    case "powershell":
      body = `if (!$global:EnvdenPreviousPrompt) { $global:EnvdenPreviousPrompt = $function:prompt }
function global:prompt {
  $envdenSuccess = $?
  $envdenExitCode = $global:LASTEXITCODE
  $physical = _envden_physical_path ((Get-Location).ProviderPath)
  $insensitive = @(Get-Content -LiteralPath ${psQuote(join(state, "approved-checkouts-insensitive"))} -ErrorAction SilentlyContinue)
  $cache = ${psQuote(join(state, "notice"))}
  $approved = @(Get-Content -LiteralPath ${psQuote(join(state, "approved-checkouts"))} -ErrorAction SilentlyContinue | Where-Object { $_ -and (($physical.TrimEnd('/','\\') + [IO.Path]::DirectorySeparatorChar).StartsWith($_.TrimEnd('/','\\') + [IO.Path]::DirectorySeparatorChar, $(if ($insensitive -ccontains $_) { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }))) }).Count -gt 0
  $changed = $global:EnvdenLastDirectory -cne $PWD.Path
  $global:EnvdenLastDirectory = $PWD.Path
  if ($changed) {
    $offered = ${psQuote(join(state, "track-offered"))}
    foreach ($root in @(Get-Content -LiteralPath ${psQuote(join(state, "track-offers"))} -ErrorAction SilentlyContinue)) {
      if ($root -and (($physical.TrimEnd('/','\\') + [IO.Path]::DirectorySeparatorChar).StartsWith($root.TrimEnd('/','\\') + [IO.Path]::DirectorySeparatorChar, $(if ($IsWindows) { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal })))) {
        if (@(Get-Content -LiteralPath $offered -ErrorAction SilentlyContinue) -cnotcontains $root) {
          Write-Host 'envden: env files found; run envden track'
          Add-Content -LiteralPath $offered -Value $root
        }
        break
      }
    }
    $day = (Get-Date).ToString('yyyy-MM-dd')
    $dayFile = ${psQuote(join(state, "update-offered-day"))}
    foreach ($line in @(Get-Content -LiteralPath ${psQuote(join(state, "notice-update"))} -ErrorAction SilentlyContinue)) {
      if ($line -ceq 'envden: update required; run envden update') { Write-Host $line }
      if ($line -ceq 'envden: update available; run envden update' -and (Get-Content -LiteralPath $dayFile -ErrorAction SilentlyContinue) -cne $day) {
        Write-Host $line
        Set-Content -LiteralPath $dayFile -Value $day
      }
    }
    if ($approved -and (Test-Path -LiteralPath $cache)) { Get-Content -LiteralPath $cache | ForEach-Object { $_ -replace '[^\\x20-\\x7E]', '' } | Out-Host }
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
  $global:LASTEXITCODE = $envdenExitCode
  if (!$envdenSuccess) { Write-Error 'Previous command failed' -ErrorAction Ignore }
  & $global:EnvdenPreviousPrompt
}`;

      break;
  }

  return `${start}\n${renderPhysical(shell)}\n${body}\n${end}\n`;
}
