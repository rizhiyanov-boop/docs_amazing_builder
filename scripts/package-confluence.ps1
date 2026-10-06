$ErrorActionPreference = 'Stop'
$packageRoot = Split-Path -Parent $PSScriptRoot
$packageOutput = Join-Path $packageRoot 'public\docbuilder-confluence-local.zip'
$packageTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$packageStage = [IO.Path]::GetFullPath((Join-Path $packageTempRoot ('docbuilder-confluence-' + [guid]::NewGuid().ToString('N'))))
if (-not $packageStage.StartsWith($packageTempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid package staging directory' }
New-Item -ItemType Directory -Path $packageStage | Out-Null
try {
  foreach ($packageName in @('server.mjs', 'bridge.mjs', 'credential-store.mjs', 'jira.mjs', 'jira-form.mjs')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('confluence\' + $packageName)) -Destination (Join-Path $packageStage $packageName)
  }
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'confluence\start.cmd') -Destination (Join-Path $packageStage 'start-confluence.cmd')
  Copy-Item -LiteralPath (Join-Path $packageRoot 'docs\confluence-local.md') -Destination (Join-Path $packageStage 'README.md')
  Compress-Archive -Path (Join-Path $packageStage '*') -DestinationPath $packageOutput -Force
  Write-Output $packageOutput
} finally {
  $packageStageVerified = [IO.Path]::GetFullPath($packageStage)
  if ($packageStageVerified.StartsWith($packageTempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $packageStageVerified).StartsWith('docbuilder-confluence-')) {
    Remove-Item -LiteralPath $packageStageVerified -Recurse -Force
  }
}
