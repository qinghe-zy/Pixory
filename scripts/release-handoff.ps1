param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [string]$ApkPath = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$version = $Version.Trim().TrimStart('v')
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "版本号格式无效：$Version" }
${branch} = (& git -C $repoRoot branch --show-current).Trim()
if ($branch -notin @('local-work', 'main')) {
  throw "自动远程交接只允许在 local-work 或 main 执行，当前分支为 $branch。"
}
$historyDir = Join-Path $repoRoot "版本文档\历史文档\v$version"
$externalNotes = Join-Path $historyDir 'Release-Notes-External.md'
$internalNotes = Join-Path $historyDir 'Release-Notes-Internal.md'
$releaseNotes = Join-Path $repoRoot "版本文档\版本更新说明\Pixory-v$version-版本更新说明.md"
foreach ($required in @($externalNotes, $internalNotes, $releaseNotes)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "缺少 v$version 本版本更新文档，禁止生成远程 Release：$required"
  }
  if ([string]::IsNullOrWhiteSpace((Get-Content -Raw -LiteralPath $required))) {
    throw "本版本更新文档为空，禁止生成远程 Release：$required"
  }
}

$origin = (& git -C $repoRoot remote get-url origin 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $origin -notmatch 'github\.com[:/]qinghe-zy/Pixory(?:\.git)?$') {
  throw "origin 不是 Pixory GitHub 远端，拒绝自动推送：$origin"
}
$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) { throw '未找到 GitHub CLI（gh），无法创建 GitHub Release。' }
& gh auth status --hostname github.com 2>$null
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI 未登录，无法安全执行远程发版交接。' }

function Test-PublicPath {
  param([string]$Path)
  $Path = $Path.Replace('\', '/')
  if ($Path -eq 'PRD.md') { return $true }
  return $Path -notmatch '(^|/)(AGENTS\.md|\.codex/|\.impeccable\.md$|LOCAL_UPDATES_LOG\.md$|版本文档/|scripts/local/|\.local/|task_plan\.md$|findings\.md$|progress\.md$)'
}
$mainOid = (& git -C $repoRoot rev-parse refs/heads/main).Trim()
$tempIndex = Join-Path $repoRoot ".local\release-index-$PID"
$pathspecPath = Join-Path $repoRoot ".local\release-pathspec-$PID"
$oldIndex = $env:GIT_INDEX_FILE
try {
  New-Item -ItemType Directory -Path (Split-Path -Parent $tempIndex) -Force | Out-Null
  Remove-Item -LiteralPath $pathspecPath -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path (Split-Path -Parent $tempIndex) -Force | Out-Null
  $env:GIT_INDEX_FILE = $tempIndex
  Remove-Item -LiteralPath $tempIndex -Force -ErrorAction SilentlyContinue
  & git -C $repoRoot read-tree refs/heads/main
  if ($LASTEXITCODE -ne 0) { throw '读取 main 公开基线失败。' }
  & git -C $repoRoot add -A
  if ($LASTEXITCODE -ne 0) { throw '公开发布文件暂存失败。' }
  $privateStaged = @(& git -C $repoRoot diff --cached --name-only | Where-Object { -not (Test-PublicPath $_) })
  foreach ($privatePath in $privateStaged) {
    & git -C $repoRoot update-index --force-remove -- $privatePath
    if ($LASTEXITCODE -ne 0) { throw "从公开索引移除私有路径失败：$privatePath" }
  }
  $staged = @(& git -C $repoRoot diff --cached --name-only)
  $forbidden = @($staged | Where-Object { -not (Test-PublicPath $_) })
  if ($forbidden.Count -gt 0) { throw "公开交接包含私有路径，已停止：$($forbidden -join ', ')" }
  $tree = (& git -C $repoRoot write-tree).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $tree) { throw '生成公开发布树失败。' }
} finally {
  if ($oldIndex) { $env:GIT_INDEX_FILE = $oldIndex } else { Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $tempIndex -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $pathspecPath -Force -ErrorAction SilentlyContinue
}

$body = @"
自动完成 v$version 发版交接。

- 公开 release tree 基于 main 生成；版本开发文档保留在 local-work，不进入 GitHub。
- APK：$ApkPath
- 文档：版本文档归档与下一版本当前文档已由 version-document-workflow.ps1 完成。
- 验证：交接脚本检查了公开路径、GitHub origin、私有路径和 pre-push 规则。
"@
$commit = ($body | & git -C $repoRoot commit-tree $tree -p $mainOid).Trim()
if ($LASTEXITCODE -ne 0 -or -not $commit) { throw '发版公开提交失败。' }
& git -C $repoRoot update-ref refs/heads/main $commit $mainOid
if ($LASTEXITCODE -ne 0) { throw '更新本地 main 发布引用失败。' }

$tag = "v$version"
$tagExists = (& git -C $repoRoot tag --list $tag).Trim()
if (-not $tagExists) {
  & git -C $repoRoot tag -a $tag $commit -m "Pixory $tag"
  if ($LASTEXITCODE -ne 0) { throw "创建标签失败：$tag" }
} else {
  $tagCommit = (& git -C $repoRoot rev-list -n 1 $tag).Trim()
  if ($tagCommit -ne $commit) { throw "标签已存在且不指向本次公开提交：$tag" }
}

$oldHandoff = $env:PIXORY_RELEASE_HANDOFF
$env:PIXORY_RELEASE_HANDOFF = '1'
try {
  & git -C $repoRoot push origin main
  if ($LASTEXITCODE -ne 0) { throw '推送 main 失败。' }
  & git -C $repoRoot push origin $tag
  if ($LASTEXITCODE -ne 0) { throw "推送标签失败：$tag" }
} finally {
  if ($oldHandoff) { $env:PIXORY_RELEASE_HANDOFF = $oldHandoff } else { Remove-Item Env:PIXORY_RELEASE_HANDOFF -ErrorAction SilentlyContinue }
}

$releaseExists = (& gh release view $tag --repo qinghe-zy/Pixory 2>$null)
if ($LASTEXITCODE -eq 0) {
  & gh release edit $tag --repo qinghe-zy/Pixory --title "Pixory v$version" --notes-file $externalNotes
  if ($LASTEXITCODE -ne 0) { throw "更新 GitHub Release 说明失败：$tag" }
  if ($ApkPath) {
    & gh release upload $tag $ApkPath --repo qinghe-zy/Pixory --clobber
    if ($LASTEXITCODE -ne 0) { throw "更新 GitHub Release APK 失败：$tag" }
  }
} else {
  $releaseArgs = @('release', 'create', $tag, '--repo', 'qinghe-zy/Pixory', '--title', "Pixory v$version", '--notes-file', $externalNotes)
  if ($ApkPath) { $releaseArgs += $ApkPath }
  & gh @releaseArgs
  if ($LASTEXITCODE -ne 0) { throw "创建 GitHub Release 失败：$tag" }
}

Write-Host "发版交接完成：v$version / Commit $commit / Tag $tag / origin/main / GitHub Release"
