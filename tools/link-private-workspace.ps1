param(
  [Parameter(Mandatory = $true)]
  [string]$PrivateWorkspaceRoot
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$target = Join-Path $PrivateWorkspaceRoot "projects\\ai-chat-export-pro\\private-docs"
$link = Join-Path $projectRoot "private-docs"

if (-not (Test-Path -LiteralPath $target -PathType Container)) {
  throw "Private workspace target does not exist: $target"
}

if (Test-Path -LiteralPath $link) {
  throw "Refusing to replace existing path: $link"
}

New-Item -ItemType Junction -Path $link -Target $target | Out-Null
Write-Output "Created $link -> $target"
