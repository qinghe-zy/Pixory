param(
    [string]$TargetDir = "..\Pixory-Clean"
)

$ErrorActionPreference = 'Stop'
$sourceDir = Split-Path -Parent $PSScriptRoot
$TargetDir = [IO.Path]::GetFullPath($TargetDir)
$sourcePath = [IO.Path]::GetFullPath($sourceDir)
if ($TargetDir -eq $sourcePath -or $TargetDir.StartsWith($sourcePath + '\', [StringComparison]::OrdinalIgnoreCase) -or $sourcePath.StartsWith($TargetDir + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Clean repository must not overlap the source repository.'
}

Write-Host "开始同步纯净代码到新仓库: $TargetDir" -ForegroundColor Cyan

# 检查目标文件夹是否存在，不存在则创建
if (-not (Test-Path $TargetDir)) {
    Write-Host "目标仓库不存在，正在创建..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $TargetDir | Out-Null
    & git -C $TargetDir init
}

# 核心同步逻辑：使用 robocopy 镜像代码，严格排除脏数据
# /MIR : 镜像目录树 (等于 /E 加 /PURGE)
# /XD : 排除目录
# /XF : 排除文件
# /NFL /NDL /NJH /NJS : 减少输出噪音

$excludeDirs = @(
    ".git", ".expo", "node_modules", "output", "dist", "web-build",
    ".codex*", ".superpowers", ".playwright-mcp", ".worktrees", ".local",
    "版本文档", "temp", "temp_*", ".idea", ".vscode", "coverage", "playwright-report",
    ".gradle", ".kotlin", ".cxx", "build", (Join-Path $sourceDir 'scripts/local')
)

$excludeFiles = @(
    ".git", "AGENTS.md", "agents.md", ".impeccable.md", "LOCAL_UPDATES_LOG.md",
    "*.py", "temp_*", "temp_*.js", "temp_*.ps1", "temp_*.md", "temp_*.txt",
    "patch*.js", "fix_*.js", "make-b64.js", "task_plan.md",
    "findings.md", "progress.md", "PRD.md", "PRODUCT.md", "concise_release.md",
    "*.codex", "*.log", "*.sqlite*", "*.db*",
    "failed_tests.txt", "test_output*.txt", "createManifest.txt",
    "*_apk.txt", "*_assets.txt",
    ".env", ".env.*", "credentials.json", "*.pem", "*.p12",
    "*.tsbuildinfo", "*.apk", "*.jks", "*.keystore", "local.properties", "keystore.local.properties", "eas-credentials.local.json"
)

Write-Host "正在执行文件镜像覆盖..." -ForegroundColor Yellow

$roboArgs = @(
    $sourceDir,
    $TargetDir,
    "/MIR",
    "/XD"
) + $excludeDirs + @("/XF") + $excludeFiles + @(
    "/NFL", "/NDL", "/NJH", "/NJS"
)

& robocopy @roboArgs

# robocopy 的 exit code 小于 8 都算成功
if ($LASTEXITCODE -ge 8) {
    throw "Robocopy 失败，退出码: $LASTEXITCODE"
}

Write-Host "文件同步完成！" -ForegroundColor Green
Write-Host "目标仓库 ($TargetDir) 现在只包含纯净的代码和必需的文档。" -ForegroundColor Green
Write-Host "请前往 $TargetDir 执行 git add 和 git commit 即可推送到你的新仓库。" -ForegroundColor Cyan
