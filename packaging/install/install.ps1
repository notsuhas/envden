& {
param([switch]$Platform, [switch]$Help)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if ($Help) { Write-Output 'Usage: install.ps1 [-Platform] [-Help]'; return }
if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'Windows required' }
$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
if ($arch -notin @('x64', 'arm64')) { throw 'Unsupported architecture' }
if ($Platform) { Write-Output "windows-$arch"; return }
$repo = 'notsuhas/envden'
if ($repo.Contains('REPLACE')) { throw 'Maintainer must configure the release repository' }
$version = $env:ENVDEN_VERSION
if (!$version -or $version -ceq 'latest') { $base = "https://github.com/$repo/releases/latest/download" }
elseif ($version -cmatch '\Av(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\z') { $base = "https://github.com/$repo/releases/download/$version" }
else { throw 'Invalid ENVDEN_VERSION: expected latest or vX.Y.Z (stable, no leading zeros)' }
$bin = $env:ENVDEN_INSTALL_DIR
if (!$bin) { $bin = Join-Path $env:LOCALAPPDATA 'envden/bin' }
$homeDir = $env:ENVDEN_HOME
if (!$homeDir) { $homeDir = Join-Path $HOME '.envden' }
$work = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $work | Out-Null
try {
  $asset = "envden-windows-$arch.exe"
  $download = Join-Path $work $asset
  Invoke-WebRequest -UseBasicParsing "$base/$asset" -OutFile $download
  $checksumFile = Join-Path $work 'SHA256SUMS'
  Invoke-WebRequest -UseBasicParsing "$base/SHA256SUMS" -OutFile $checksumFile
  $checksums = Get-Content $checksumFile -Raw
  $lines = @($checksums -split "`n" | Where-Object { $_ -match "^[a-f0-9]{64}  $([regex]::Escape($asset))`r?$" })
  if ($lines.Count -ne 1) { throw 'Missing or duplicate checksum' }
  if ((Get-FileHash $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $lines[0].Substring(0,64)) { throw 'Checksum mismatch' }
  New-Item -ItemType Directory -Force -Path $bin,$homeDir | Out-Null
  $staged = Join-Path $bin ('.envden-install-' + [guid]::NewGuid().ToString() + '.exe')
  Copy-Item $download $staged -Force
  Move-Item $staged (Join-Path $bin 'envden.exe') -Force
  [IO.File]::WriteAllText((Join-Path $homeDir 'install-method'), "script")
  Write-Output "Installed envden. Add $bin to your user PATH."
  Write-Output 'Verified SHA256SUMS over HTTPS. Integrity rests on GitHub and TLS.'
} finally { Remove-Item $work -Recurse -Force }
} @args
