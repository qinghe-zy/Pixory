param(
  [string]$NewVersion = "",

  [string]$Version = "",
  [switch]$SkipVersionDocuments,
  [switch]$SkipPublish,
  [string]$NotesPath = "",
  [string]$BuildDirectory = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $repoRoot "android"
$appDir = Join-Path $androidDir "app"
$nativeBuildDir = Join-Path $appDir ".cxx"
$packageJsonPath = Join-Path $repoRoot "package.json"
$gradleWrapper = Join-Path $androidDir "gradlew.bat"
$versionDocumentWorkflow = Join-Path $PSScriptRoot "version-document-workflow.ps1"

$currentBranch = (& git -C $repoRoot branch --show-current).Trim()
if ($currentBranch -notin @('local-work', 'main')) {
  throw "打包只允许在 local-work 或 main 执行，当前分支为 $currentBranch。请回到版本开发分支。"
}


if ($NewVersion) { $Version = $NewVersion }
if (-not $Version) {
  $Version = (Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json).version
}

& node (Join-Path $PSScriptRoot 'update-versions.js') $Version
if ($LASTEXITCODE -ne 0) { throw 'Version synchronization failed.' }
& node (Join-Path $PSScriptRoot 'update-versions.js') --check $Version
if ($LASTEXITCODE -ne 0) { throw 'Version consistency check failed.' }

if ($BuildDirectory) {
  $sourceChanges = & git -C $repoRoot -c core.quotepath=false diff HEAD --name-only
  $publicChanges = @($sourceChanges | Where-Object { $_ -notmatch '^(版本文档/|LOCAL_UPDATES_LOG\.md$)' })
  if ($publicChanges.Count -gt 0) { throw 'Commit synchronized source before building from another directory.' }
  $buildRoot = (Resolve-Path -LiteralPath $BuildDirectory).Path
  $sourceCommit = (& git -C $repoRoot rev-parse HEAD).Trim()
  $buildCommit = (& git -C $buildRoot rev-parse HEAD).Trim()
  if ($sourceCommit -ne $buildCommit) { throw 'Build directory must use the same committed source.' }
  if ((& git -C $buildRoot status --porcelain --untracked-files=no)) { throw 'Build directory has uncommitted source changes.' }
  & node (Join-Path $buildRoot 'scripts/update-versions.js') --check $Version
  if ($LASTEXITCODE -ne 0) { throw 'Build directory version check failed.' }
  $androidDir = Join-Path $buildRoot 'android'
  $appDir = Join-Path $androidDir 'app'
  $nativeBuildDir = Join-Path $appDir '.cxx'
  $gradleWrapper = Join-Path $androidDir 'gradlew.bat'
}
if ($androidDir.Length -gt 50) { throw 'Use a short physical BuildDirectory for Windows native builds.' }

if (-not $SkipVersionDocuments) {
  & $versionDocumentWorkflow -Action PreviewRelease -ReleasedVersion $Version
  if ($LASTEXITCODE -ne 0) { throw 'Version document preflight failed.' }
}

# React Native New Architecture can leave a CMake clean graph that references
# codegen directories removed earlier in Gradle's clean task. This folder is
# generated state only; clearing it first makes the required Gradle clean reliable.
if ([System.IO.Path]::GetDirectoryName($nativeBuildDir) -ne [System.IO.Path]::GetFullPath($appDir)) {
  throw "Refusing to clear an unexpected native build path: $nativeBuildDir"
}
if (Test-Path -LiteralPath $nativeBuildDir) {
  # Extended-length prefix avoids Windows PowerShell's legacy MAX_PATH limit
  # for deeply nested CMake/codegen object files.
  [System.IO.Directory]::Delete("\\?\$nativeBuildDir", $true)
}

Push-Location $androidDir
try {
  & $gradleWrapper clean
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle clean failed with exit code $LASTEXITCODE."
  }

  & $gradleWrapper assembleRelease "-PreactNativeArchitectures=armeabi-v7a,arm64-v8a"
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle assembleRelease failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

$builtApk = Join-Path $androidDir "app\build\outputs\apk\release\Pixory-v$Version-local-release.apk"
if (-not (Test-Path -LiteralPath $builtApk)) {
  throw "Release APK was not produced at the expected path: $builtApk"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($builtApk)
try {
  $nativeEntries = @($archive.Entries | ForEach-Object { $_.FullName } | Where-Object { $_ -like 'lib/*' })
  # A store release must never contain lib/x86/ or lib/x86_64/ simulator binaries.
  $emulatorEntries = @($nativeEntries | Where-Object { $_ -match '^lib/(?:x86|x86_64)/' })
  if ($emulatorEntries.Count -gt 0) {
    throw "Release APK contains emulator ABI native libraries: $($emulatorEntries -join ', ')"
  }
  if (-not ($nativeEntries | Where-Object { $_ -match '^lib/arm64-v8a/' })) {
    throw "Release APK does not contain required arm64-v8a native libraries."
  }
} finally {
  $archive.Dispose()
}

$outputDir = Join-Path $repoRoot "output\release"
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$outputApk = Join-Path $outputDir "Pixory-v$Version.apk"
Copy-Item -LiteralPath $builtApk -Destination $outputApk -Force

$sdkRoot = $env:ANDROID_HOME
if (-not $sdkRoot) { $sdkRoot = $env:ANDROID_SDK_ROOT }
if (-not $sdkRoot) { throw 'Set ANDROID_HOME to verify release signing.' }
$apksigner = Get-ChildItem (Join-Path $sdkRoot 'build-tools/*/apksigner.bat') | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $apksigner) { throw 'Android apksigner was not found.' }
$signature = & $apksigner.FullName verify --print-certs $outputApk
if ($LASTEXITCODE -ne 0 -or ($signature -join "`n") -notmatch 'b64a034ebd68c7fbc2e8c345e7c461c471f461ba59a034f8f81cc72b7e957e2e') {
  throw 'Release APK signature does not match the existing Pixory release certificate.'
}

if (-not $SkipVersionDocuments) {
  & $versionDocumentWorkflow -Action FinalizeRelease -ReleasedVersion $Version -ApkPath $outputApk
  if ($LASTEXITCODE -ne 0) { throw 'Version document finalization failed.' }
}

if (-not $SkipPublish) {
  & (Join-Path $PSScriptRoot 'publish-dual.ps1') -Version $Version -ApkPath $outputApk -NotesPath $NotesPath
  if (-not $?) { throw 'Release publishing failed.' }
}

if ($SkipPublish) {
  Write-Host "Built and verified physical-device release APK (not published): $outputApk"
} else {
  Write-Host "Built and published physical-device release APK: $outputApk"
}

