param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [string]$ApkPath = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$version = $Version.Trim().TrimStart('v')
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "版本号格式无效：$Version" }
$branch = (& git -C $repoRoot branch --show-current).Trim()
if ($branch -ne 'main') {
  throw "自动远程交接只允许在 main 执行，当前分支为 $branch。请先将公开提交整理到 main。"
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

$publicPaths = @(
  'src', 'android', 'plugins', 'docs', 'scripts', 'tests',
  'README.md', 'PRD.md', '.gitignore', '.githooks', 'app.json', 'package.json',
  'pnpm-lock.yaml', 'tsconfig.json', 'babel.config.js', 'metro.config.js'
)
& git -C $repoRoot add -u -- @publicPaths
& git -C $repoRoot add -- @publicPaths
if ($LASTEXITCODE -ne 0) { throw '公开发布文件暂存失败。' }

$staged = @(& git -C $repoRoot diff --cached --name-only)
$forbidden = @($staged | Where-Object { $_ -match '(^|/)(AGENTS\.md|\.codex/|\.impeccable\.md$|LOCAL_UPDATES_LOG\.md$|版本文档/|scripts/local/|\.local/|task_plan\.md$|findings\.md$|progress\.md$)' })
if ($forbidden.Count -gt 0) {
  throw "公开交接包含私有路径，已停止：$($forbidden -join ', ')"
}

$commit = (& git -C $repoRoot rev-parse HEAD).Trim()
if ($staged.Count -gt 0) {
  $body = @"
自动完成 v$version 发版交接。

- 变更已在 main 上按公开路径暂存。
- APK：$ApkPath
- 文档：版本文档归档与下一版本当前文档已由 version-document-workflow.ps1 完成。
- 验证：交接脚本检查了分支、GitHub origin、私有路径和 pre-push 规则。
"@
  & git -C $repoRoot commit -m "release: publish v$version" -m $body
  if ($LASTEXITCODE -ne 0) { throw '发版提交失败。' }
  $commit = (& git -C $repoRoot rev-parse HEAD).Trim()
}

$tag = "v$version"
$tagExists = (& git -C $repoRoot tag --list $tag).Trim()
if (-not $tagExists) {
  & git -C $repoRoot tag -a $tag -m "Pixory $tag"
  if ($LASTEXITCODE -ne 0) { throw "创建标签失败：$tag" }
}

& git -C $repoRoot push origin main
if ($LASTEXITCODE -ne 0) { throw '推送 main 失败。' }
& git -C $repoRoot push origin $tag
if ($LASTEXITCODE -ne 0) { throw "推送标签失败：$tag" }

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
