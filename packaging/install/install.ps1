param([switch]$Platform, [switch]$Help)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Output 'Usage: install.ps1 [-Platform] [-Help]'; exit 0 }
if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'Windows required' }
$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
if ($arch -notin @('x64', 'arm64')) { throw 'Unsupported architecture' }
if ($Platform) { Write-Output "windows-$arch"; exit 0 }
$repo = 'notsuhas/envden'
if ($repo.Contains('REPLACE')) { throw 'Maintainer must configure the release repository' }
$version = $env:ENVDEN_VERSION
if (!$version -or $version -eq 'latest') { $base = "https://github.com/$repo/releases/latest/download" }
elseif ($version -match '^v[0-9]+\.[0-9]+\.[0-9]+$') { $base = "https://github.com/$repo/releases/download/$version" }
else { throw 'Invalid ENVDEN_VERSION' }
$bin = Join-Path $env:LOCALAPPDATA 'envden/bin'
$homeDir = $env:ENVDEN_HOME
if (!$homeDir) { $homeDir = Join-Path $HOME '.envden' }
$work = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $work | Out-Null
try {
  $asset = "envden-windows-$arch.exe"
  $download = Join-Path $work $asset
  Invoke-WebRequest "$base/$asset" -OutFile $download
  $checksumFile = Join-Path $work 'SHA256SUMS'
  Invoke-WebRequest "$base/SHA256SUMS" -OutFile $checksumFile
  $checksums = Get-Content $checksumFile -Raw
  $lines = @($checksums -split "`n" | Where-Object { $_ -match "^[a-f0-9]{64}  $([regex]::Escape($asset))`r?$" })
  if ($lines.Count -ne 1) { throw 'Missing or duplicate checksum' }
  if ((Get-FileHash $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $lines[0].Substring(0,64)) { throw 'Checksum mismatch' }
  New-Item -ItemType Directory -Force -Path $bin,$homeDir | Out-Null
  $staged = Join-Path $bin '.envden-install.exe'
  Copy-Item $download $staged -Force
  Move-Item $staged (Join-Path $bin 'envden.exe') -Force
  [IO.File]::WriteAllText((Join-Path $homeDir 'install-method'), "script")
  Write-Output "Installed envden. Add $bin to your user PATH."
  Write-Output 'Bootstrap verified SHA256SUMS over HTTPS; it does not authenticate the signed feed.'
} finally { Remove-Item $work -Recurse -Force }
