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

Write-Host "==== 1. 推送及发版至 Legacy 仓库 (包含历史脏记录) ====" -ForegroundColor Cyan
& git -C $repoRoot tag -a $tag -m "Pixory $tag"
& git -C $repoRoot push legacy local-work
& git -C $repoRoot push legacy $tag
& gh release create $tag $apkPath --repo qinghe-zy/Pixory-legacy --title "Pixory v$version" --notes-file $externalNotes

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
& git -C $cleanRepo tag -a $tag -m "Pixory $tag Clean Release"

& git -C $cleanRepo push -f origin main
& git -C $cleanRepo push -f origin $tag

& gh release create $tag $apkPath --repo qinghe-zy/Pixory --title "Pixory v$version" --notes-file $externalNotes

Write-Host "双仓库发布流程完成！" -ForegroundColor Green

