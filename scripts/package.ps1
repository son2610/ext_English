$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'dist/manifest.json') -Encoding UTF8 -Raw | ConvertFrom-Json
if ($manifest.version -notmatch '^\d+\.\d+\.\d+(\.\d+)?$') { throw 'Invalid manifest version.' }

function New-PortableArchive([string]$SourceDirectory, [string]$Destination) {
  $sourceRoot = (Resolve-Path -LiteralPath $SourceDirectory).Path
  if (-not $sourceRoot.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive source must be inside the workspace.' }
  if (@(Get-ChildItem -LiteralPath $sourceRoot -Recurse -Force -Attributes ReparsePoint).Count) { throw 'Archive source contains a reparse point.' }
  $output = [IO.File]::Open($Destination, [IO.FileMode]::Create)
  $archive = New-Object IO.Compression.ZipArchive($output, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($file in Get-ChildItem -LiteralPath $sourceRoot -File -Recurse | Sort-Object FullName) {
      # Windows Compress-Archive uses backslashes; Store ZIPs need portable '/' paths.
      $entryName = $file.FullName.Substring($sourceRoot.Length + 1).Replace('\', '/')
      $entry = $archive.CreateEntry($entryName, [IO.Compression.CompressionLevel]::Optimal)
      $source = $file.OpenRead(); $target = $entry.Open()
      try { $source.CopyTo($target) } finally { $source.Dispose(); $target.Dispose() }
    }
  } finally { $archive.Dispose(); $output.Dispose() }
  $check = [IO.Compression.ZipFile]::OpenRead($Destination)
  try {
    foreach ($entry in $check.Entries) {
      if ($entry.FullName.Contains('\')) { throw 'Nonportable ZIP entry.' }
      $sourcePath = Join-Path $sourceRoot $entry.FullName
      $hash = [Security.Cryptography.SHA256]::Create(); $stream = $entry.Open()
      try { $actual = ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-', '') } finally { $stream.Dispose(); $hash.Dispose() }
      if ($actual -ne (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash) { throw 'ZIP content differs from source.' }
    }
    return [PSCustomObject]@{ File = [IO.Path]::GetFileName($Destination); Entries = $check.Entries.Count; Bytes = (Get-Item -LiteralPath $Destination).Length; SHA256 = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash }
  } finally { $check.Dispose() }
}

$release = New-PortableArchive (Join-Path $projectRoot 'dist') (Join-Path $projectRoot "artifacts/lumaread-$($manifest.version).zip")
$store = New-PortableArchive (Join-Path $projectRoot 'artifacts/store') (Join-Path $projectRoot "artifacts/lumaread-store-kit-$($manifest.version).zip")
$report = [PSCustomObject]@{ Name = $manifest.name; Version = $manifest.version; Author = $manifest.author; Archives = @($release, $store) }
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $projectRoot "artifacts/release-$($manifest.version).json") -Encoding UTF8
$report | ConvertTo-Json -Depth 5
