$ErrorActionPreference = 'Stop'
$packageRoot = Split-Path -Parent $PSScriptRoot
$packageOutput = Join-Path $packageRoot 'public\docbuilder-confluence-local.zip'
$nodeVersion = '24.22.2'
$runtimeChecksums = [ordered]@{
  x64 = 'ca1bff5d8ead13c9f2ea404a176db46bd430704d5b5113734049fa365e7799e2'
  arm64 = 'f47968c213105077f64c6510f007632c0ca2574802a0b5067c327c49abe1c468'
}
$packageTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$packageStage = [IO.Path]::GetFullPath((Join-Path $packageTempRoot ('docbuilder-confluence-' + [guid]::NewGuid().ToString('N'))))
if (-not $packageStage.StartsWith($packageTempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid package staging directory' }
$payload = Join-Path $packageStage 'payload'
New-Item -ItemType Directory -Path $payload | Out-Null
try {
  foreach ($packageName in @('server.mjs', 'bridge.mjs', 'credential-store.mjs', 'jira.mjs', 'jira-form.mjs')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('confluence\' + $packageName)) -Destination (Join-Path $payload $packageName)
  }
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'confluence\start.cmd') -Destination (Join-Path $payload 'start-confluence.cmd')
  Copy-Item -LiteralPath (Join-Path $packageRoot 'docs\confluence-local.md') -Destination (Join-Path $payload 'README.md')
  foreach ($architecture in $runtimeChecksums.Keys) {
    $runtimeName = "node-v$nodeVersion-win-$architecture"
    $runtimeArchive = Join-Path $packageStage "$runtimeName.zip"
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$nodeVersion/$runtimeName.zip" -OutFile $runtimeArchive
    if ((Get-FileHash -LiteralPath $runtimeArchive -Algorithm SHA256).Hash -ne $runtimeChecksums[$architecture]) {
      throw "Node.js $runtimeName SHA-256 mismatch"
    }
    $runtimePayload = Join-Path $payload "runtime\$architecture"
    New-Item -ItemType Directory -Path $runtimePayload -Force | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $runtimeZip = [IO.Compression.ZipFile]::OpenRead($runtimeArchive)
    try {
      foreach ($runtimeFile in @('node.exe', 'LICENSE')) {
        $entry = $runtimeZip.GetEntry("$runtimeName/$runtimeFile")
        if ($null -eq $entry) { throw "Missing $runtimeFile in $runtimeName" }
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $runtimePayload $runtimeFile))
      }
    } finally {
      $runtimeZip.Dispose()
    }
  }
  $stagedArchive = Join-Path $packageStage 'docbuilder-confluence-local.zip'
  Compress-Archive -Path (Join-Path $payload '*') -DestinationPath $stagedArchive
  Move-Item -LiteralPath $stagedArchive -Destination $packageOutput -Force
  Write-Output $packageOutput
} finally {
  $packageStageVerified = [IO.Path]::GetFullPath($packageStage)
  if ($packageStageVerified.StartsWith($packageTempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $packageStageVerified).StartsWith('docbuilder-confluence-')) {
    Remove-Item -LiteralPath $packageStageVerified -Recurse -Force
  }
}
