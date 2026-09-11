param(
  [Parameter(Mandatory = $true)]
  [string]$Summary,
  [string]$SourceCommit = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'version-document-workflow.ps1') `
  -Action AppendUpdate -EventType HotUpdate -Summary $Summary -SourceCommit $SourceCommit
if ($LASTEXITCODE -ne 0) { throw "热更新文档追加失败，退出码：$LASTEXITCODE" }
