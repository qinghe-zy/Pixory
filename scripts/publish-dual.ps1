param(
  [string]$Version = '',
  [string]$ApkPath = '',
  [string]$NotesPath = '',
  [string]$CleanRepository = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
function Assert-NativeSuccess([string]$Action) {
  if ($LASTEXITCODE -ne 0) { throw "$Action failed (exit $LASTEXITCODE). Inspect remote state before retrying." }
}
if (-not $Version) { $Version = (Get-Content -Raw (Join-Path $repoRoot 'package.json') | ConvertFrom-Json).version }
if ($Version -notmatch '^\d+\.\d+\.\d+(?:\.\d+)?$') { throw 'Invalid release version.' }
if (-not $ApkPath) { $ApkPath = Join-Path $repoRoot "output/release/Pixory-v$Version.apk" }
if (-not $NotesPath) { $NotesPath = Join-Path $repoRoot "版本文档/历史文档/v$Version/Release-Notes-External.md" }
$ApkPath = (Resolve-Path -LiteralPath $ApkPath).Path
$NotesPath = (Resolve-Path -LiteralPath $NotesPath).Path
if (-not (Get-Content -Raw -LiteralPath $NotesPath).Trim()) { throw 'Release notes must not be empty.' }
if ([IO.Path]::GetFileName($ApkPath) -ne "Pixory-v$Version.apk") { throw 'APK filename does not match the release version.' }
& node (Join-Path $PSScriptRoot 'update-versions.js') --check $Version
Assert-NativeSuccess 'Version consistency check'
# Validate the artifact itself: renaming an older APK must not bypass the gate.
$sdkRoot = $env:ANDROID_HOME
if (-not $sdkRoot) { $sdkRoot = $env:ANDROID_SDK_ROOT }
if (-not $sdkRoot) { throw 'Set ANDROID_HOME to verify the release APK.' }
$aapt = Get-ChildItem (Join-Path $sdkRoot 'build-tools/*/aapt.exe') | Sort-Object FullName -Descending | Select-Object -First 1
$apksigner = Get-ChildItem (Join-Path $sdkRoot 'build-tools/*/apksigner.bat') | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $aapt -or -not $apksigner) { throw 'Android APK verification tools were not found.' }
$badging = & $aapt.FullName dump badging $ApkPath
Assert-NativeSuccess 'Read APK version'
$packageLine = $badging | Where-Object { $_ -match '^package:' } | Select-Object -First 1
$expectedCode = (Get-Content -Raw (Join-Path $repoRoot 'app.json') | ConvertFrom-Json).expo.android.versionCode
if ($packageLine -notmatch "name='com.pixory.app'" -or $packageLine -notmatch "versionName='$([regex]::Escape($Version))'" -or $packageLine -notmatch "versionCode='$expectedCode'") {
  throw 'APK package/version/code does not match the synchronized release source.'
}
$signature = & $apksigner.FullName verify --print-certs $ApkPath
Assert-NativeSuccess 'Verify APK signature'
if (($signature -join "`n") -notmatch 'b64a034ebd68c7fbc2e8c345e7c461c471f461ba59a034f8f81cc72b7e957e2e') { throw 'Unexpected release signing certificate.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($ApkPath)
try {
  $entry = $archive.GetEntry('assets/app.config')
  if (-not $entry) { throw 'Embedded Expo configuration is missing from the APK.' }
  $reader = [IO.StreamReader]::new($entry.Open())
  try { $embeddedConfig = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
  if ($embeddedConfig.version -ne $Version -or $embeddedConfig.runtimeVersion -ne $Version -or $embeddedConfig.android.versionCode -ne $expectedCode) {
    throw 'Embedded Expo version/runtime/code does not match the release.'
  }
} finally { $archive.Dispose() }
if (-not $CleanRepository) { $CleanRepository = Join-Path (Split-Path $repoRoot -Parent) 'Pixory-Clean' }
$CleanRepository = (Resolve-Path -LiteralPath $CleanRepository).Path
if ($CleanRepository -eq $repoRoot) { throw 'Clean repository must be separate from the development repository.' }
if ((& git -C $CleanRepository branch --show-current).Trim() -ne 'main') { throw 'Clean repository must be on main.' }
if ((& git -C $CleanRepository remote get-url origin).Trim() -ne 'https://github.com/qinghe-zy/Pixory.git') { throw 'Unexpected clean repository remote.' }
if (& git -C $CleanRepository status --porcelain) { throw 'Clean repository has existing changes; inspect them before publishing.' }
& git -C $CleanRepository fetch origin main
Assert-NativeSuccess 'Fetch public main'
& git -C $CleanRepository merge --ff-only origin/main
Assert-NativeSuccess 'Fast-forward public main'
$tag = "v$Version"
$existingTag = & git -C $CleanRepository ls-remote --tags origin "refs/tags/$tag"
Assert-NativeSuccess 'Check remote tag'
if ($existingTag) { throw "Remote tag $tag already exists. Inspect the existing release before continuing." }
& gh auth status
Assert-NativeSuccess 'GitHub authentication'

& (Join-Path $PSScriptRoot 'sync-clean-repo.ps1') -TargetDir $CleanRepository
if (-not $?) { throw 'Clean repository synchronization failed.' }
& git -C $CleanRepository add -A
Assert-NativeSuccess 'Stage public source'
$staged = & git -C $CleanRepository diff --cached --name-only
foreach ($file in $staged) {
  if ($file -match '(^|/)(AGENTS\.md|\.codex[^/]*|\.impeccable\.md|版本文档|LOCAL_UPDATES_LOG\.md|task_plan\.md|findings\.md|progress\.md|\.local|node_modules)(/|$)|\.(apk|jks|keystore|py)$|^scripts/local/') {
    throw "Private or generated path in public staging: $file"
  }
}
& git -C $CleanRepository diff --cached --check
Assert-NativeSuccess 'Public diff check'
& node (Join-Path $CleanRepository 'scripts/update-versions.js') --check $Version
Assert-NativeSuccess 'Public version consistency check'
if ($staged) {
  & git -C $CleanRepository commit -m "release: Pixory $Version"
  Assert-NativeSuccess 'Commit public release'
}
& git -C $CleanRepository tag -a $tag -m "Pixory $Version"
Assert-NativeSuccess 'Create release tag'
& git -C $CleanRepository push --atomic origin main "refs/tags/$tag"
Assert-NativeSuccess 'Push public main and tag'
& gh release create $tag $ApkPath --repo qinghe-zy/Pixory --verify-tag --title "Pixory $Version" --notes-file $NotesPath
Assert-NativeSuccess 'Create GitHub release'
& (Join-Path $PSScriptRoot 'deploy-docs-mist01.ps1') -ApkPath $ApkPath -Version $Version
if (-not $?) { throw 'Official website deployment failed.' }
Write-Host "Published $tag to GitHub and the official website."
