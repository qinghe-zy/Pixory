param(
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $repoRoot "android"
$appDir = Join-Path $androidDir "app"
$nativeBuildDir = Join-Path $appDir ".cxx"
$packageJsonPath = Join-Path $repoRoot "package.json"
$gradleWrapper = Join-Path $androidDir "gradlew.bat"
$versionDocumentWorkflow = Join-Path $PSScriptRoot "version-document-workflow.ps1"

if (-not $Version) {
  $Version = (Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json).version
}

& $versionDocumentWorkflow -Action PreviewRelease -ReleasedVersion $Version
if ($LASTEXITCODE -ne 0) {
  throw "Version document preflight failed with exit code $LASTEXITCODE."
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

& $versionDocumentWorkflow -Action FinalizeRelease -ReleasedVersion $Version -ApkPath $outputApk
if ($LASTEXITCODE -ne 0) {
  throw "Version document finalization failed with exit code $LASTEXITCODE."
}

Write-Host "Built physical-device release APK: $outputApk"
