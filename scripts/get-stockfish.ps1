$ErrorActionPreference = "Stop"

$tag = "sf_19"
$asset = "stockfish-windows-x86-64-universal.zip"
$sha256 = "3c8bf1f9ea66a09350a40df4f632288285ac206d99f33ab5842c408fc30b48a7"

$engine = Join-Path $PSScriptRoot "..\src-tauri\engine"
$tmp = Join-Path ([IO.Path]::GetTempPath()) "luftchess-stockfish"
New-Item -ItemType Directory -Force $engine, $tmp | Out-Null

$zip = Join-Path $tmp $asset
Invoke-WebRequest "https://github.com/official-stockfish/Stockfish/releases/download/$tag/$asset" -OutFile $zip
if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne $sha256) { throw "Checksum mismatch for $asset" }

Expand-Archive $zip -DestinationPath $tmp -Force
$src = Join-Path $tmp "stockfish"
Copy-Item (Join-Path $src "stockfish-windows-x86-64-universal.exe") (Join-Path $engine "stockfish.exe") -Force
Copy-Item (Join-Path $src "Copying.txt") (Join-Path $engine "COPYING.txt") -Force
Copy-Item (Join-Path $src "AUTHORS") (Join-Path $engine "AUTHORS.txt") -Force
Remove-Item $tmp -Recurse -Force
Write-Host "Stockfish installed in $engine"
