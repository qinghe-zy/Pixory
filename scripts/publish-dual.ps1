$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$version = "2.8.8.0"
$tag = "v$version"
$apkPath = "$repoRoot\output\release\Pixory-v2.8.8.0.apk"
$externalNotes = "$repoRoot\版本文档\当前版本文档\Release-Notes-External.md"

if (-not (Test-Path $apkPath)) {
    throw "APK file not found: $apkPath"
}
if (-not (Test-Path $externalNotes)) {
    throw "Release notes not found: $externalNotes"
}

$rawNotes = Get-Content $externalNotes -Raw
$userVersionIndex = $rawNotes.IndexOf('## 用户版')
if ($userVersionIndex -ge 0) {
    $rawNotes = $rawNotes.Substring($userVersionIndex)
    $rawNotes = $rawNotes -replace '## 用户版\r?\n+', ''
    $rawNotes = $rawNotes -replace '使用非专业术语描述用户能感知的变化、收益、限制和升级注意事项。\r?\n+', ''
    $rawNotes = $rawNotes -replace '(?m)^\s*[\r\n]', "`n"
    $rawNotes = $rawNotes -replace '\n{3,}', "`n`n"
    $rawNotes = $rawNotes.Trim()
}
$tempNotesPath = "$env:TEMP\Pixory_Clean_Notes_$($tag).md"
Set-Content $tempNotesPath -Value $rawNotes

Write-Host "==== 1. 推送及发版至 Legacy 仓库 (包含历史脏记录) ====" -ForegroundColor Cyan
& git -C $repoRoot tag -a $tag -m "Pixory $tag" 2>$null
& git -C $repoRoot push legacy local-work --no-verify
& git -C $repoRoot push legacy $tag --no-verify -f 2>$null
& gh release create $tag $apkPath --repo qinghe-zy/Pixory-legacy 2>$null --title "Pixory v$version" --notes-file $tempNotesPath

Write-Host "==== 2. 同步并准备纯净代码到新仓库 ====" -ForegroundColor Cyan
& "$repoRoot\scripts\sync-clean-repo.ps1"

$cleanRepo = (Resolve-Path "$repoRoot\..\Pixory-Clean").Path
if (-not (Test-Path $cleanRepo)) {
    throw "Clean repo not created: $cleanRepo"
}

Write-Host "==== 3. 推送及发版至新仓库 (纯净代码) ====" -ForegroundColor Cyan
# 配置新仓库
& git -C $cleanRepo remote add origin https://github.com/qinghe-zy/Pixory.git 2>$null
& git -C $cleanRepo branch -M main

& git -C $cleanRepo add -A
& git -C $cleanRepo commit -m "chore: initial release v$version (clean)"
& git -C $cleanRepo tag -a $tag -m "Pixory $tag Clean Release" -f

& git -C $cleanRepo push -f origin main
& git -C $cleanRepo push -f origin $tag

& gh release create $tag $apkPath --repo qinghe-zy/Pixory 2>$null --title "Pixory v$version" --notes-file $tempNotesPath

Write-Host "双仓库发布流程完成！" -ForegroundColor Green








Write-Host '==== 4. 自动部署至官网服务器 ====' -ForegroundColor Cyan
.\scripts\deploy-docs-mist01.ps1 -ApkPath "output\release\Pixory-v$version.apk"

