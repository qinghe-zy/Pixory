$ErrorActionPreference = 'Stop'
$repoRoot = (Get-Location).Path
$version = "2.8.9.0"
$tag = "v$version"
$apkPath = "$repoRoot\output\release\Pixory-v2.8.9.0.apk"
$builtApk = "$repoRoot\android\app\build\outputs\apk\release\Pixory-v2.8.9.0-local-release.apk"

# 1. Ensure output folder exists and copy APK
New-Item -ItemType Directory -Path "$repoRoot\output\release" -Force | Out-Null
Copy-Item -LiteralPath $builtApk -Destination $apkPath -Force

# 2. Push to legacy repo
Write-Host "Pushing to legacy..."
git push legacy local-work --no-verify
# Move tag locally and force push
git tag -a $tag -m "Pixory $tag" -f
git push legacy $tag -f --no-verify

# 3. Replace github release in legacy
Write-Host "Uploading to legacy release..."
gh release upload $tag $apkPath --repo qinghe-zy/Pixory-legacy --clobber

# 4. Sync clean repo
Write-Host "Syncing clean repo..."
& "$repoRoot\scripts\sync-clean-repo.ps1"
$cleanRepo = (Resolve-Path "$repoRoot\..\Pixory-Clean").Path

# 5. Push to clean repo and replace release
Write-Host "Pushing to clean repo..."
git -C $cleanRepo remote add origin https://github.com/qinghe-zy/Pixory.git 2>$null
git -C $cleanRepo branch -M main
git -C $cleanRepo add -A
git -C $cleanRepo commit -m "chore: release v$version (clean)"
git -C $cleanRepo push -f origin main

git -C $cleanRepo tag -a $tag -m "Pixory $tag Clean Release" -f
git -C $cleanRepo push -f origin $tag

Write-Host "Uploading to clean release..."
gh release upload $tag $apkPath --repo qinghe-zy/Pixory --clobber

# 6. Upload to website
Write-Host "Uploading to website..."
& "$repoRoot\scripts\deploy-docs-mist01.ps1" -ApkPath $apkPath

Write-Host "Silent build and deploy finished successfully."
