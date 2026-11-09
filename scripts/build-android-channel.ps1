param(
  [string]$Channel = "preview",
  [string]$PackageSuffix = ".preview",
  [string]$AppName = "Pixory 测试版",
  [string]$Version = "",
  [switch]$KeepModified
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $repoRoot "android"
$appDir = Join-Path $androidDir "app"
$nativeBuildDir = Join-Path $appDir ".cxx"
$packageJsonPath = Join-Path $repoRoot "package.json"
$appJsonPath = Join-Path $repoRoot "app.json"
$buildGradlePath = Join-Path $appDir "build.gradle"
$stringsXmlPath = Join-Path $appDir "src\main\res\values\strings.xml"
$manifestPath = Join-Path $appDir "src\main\AndroidManifest.xml"
$gradleWrapper = Join-Path $androidDir "gradlew.bat"

if (-not $Version) {
  $Version = (Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json).version
}

$targetPackage = "com.pixory.app$PackageSuffix"
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "开始构建多通道共存测试包" -ForegroundColor Cyan
Write-Host "通道 (Channel)    : $Channel" -ForegroundColor Yellow
Write-Host "应用 ID (App ID)  : $targetPackage" -ForegroundColor Yellow
Write-Host "应用名称 (Name)   : $AppName" -ForegroundColor Yellow
Write-Host "版本号 (Version)  : $Version" -ForegroundColor Yellow
Write-Host "共存保障机制      : 独立 ApplicationId + 独立 FileProvider Authorities" -ForegroundColor Green
Write-Host "发布状态          : 本地构建，不发布" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

# 备份原始配置以确保构建后原子复原
$origAppJson = Get-Content -Raw -LiteralPath $appJsonPath
$origBuildGradle = Get-Content -Raw -LiteralPath $buildGradlePath
$origStringsXml = Get-Content -Raw -LiteralPath $stringsXmlPath
$origManifest = Get-Content -Raw -LiteralPath $manifestPath

function Restore-OriginalFiles {
  Write-Host "正在还原生产主版本配置..." -ForegroundColor Yellow
  [System.IO.File]::WriteAllText($appJsonPath, $origAppJson, [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText($buildGradlePath, $origBuildGradle, [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText($stringsXmlPath, $origStringsXml, [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText($manifestPath, $origManifest, [System.Text.UTF8Encoding]::new($false))
  Write-Host "生产主版本配置已还原。" -ForegroundColor Green
}

try {
  # 1. 配置 app.json
  $appJson = $origAppJson | ConvertFrom-Json
  $appJson.expo.name = $AppName
  $appJson.expo.android.package = $targetPackage
  $appJson.expo.updates.requestHeaders.'expo-channel-name' = $Channel
  $newAppJsonText = ConvertTo-Json -InputObject $appJson -Depth 10
  [System.IO.File]::WriteAllText($appJsonPath, $newAppJsonText + "`n", [System.Text.UTF8Encoding]::new($false))

  # 2. 配置 strings.xml 中的 app_name
  $newStringsXml = $origStringsXml -replace '<string name="app_name">[^<]+</string>', "<string name=`"app_name`">$AppName</string>"
  [System.IO.File]::WriteAllText($stringsXmlPath, $newStringsXml, [System.Text.UTF8Encoding]::new($false))

  # 3. 配置 AndroidManifest.xml 中的 expo-channel-name
  $escapedChannel = [System.Security.SecurityElement]::Escape($Channel)
  $newManifest = $origManifest -replace 'android:value="\{&quot;expo-channel-name&quot;:&quot;[^&]+&quot;\}"', "android:value=`"{&quot;expo-channel-name&quot;:&quot;$escapedChannel&quot;}`""
  [System.IO.File]::WriteAllText($manifestPath, $newManifest, [System.Text.UTF8Encoding]::new($false))

  # 4. 配置 build.gradle
  $expectedApkOutputName = "Pixory-v$Version-$Channel-local-release.apk"
  $newBuildGradle = $origBuildGradle -replace "applicationId 'com\.pixory\.app'", "applicationId '$targetPackage'"
  $newBuildGradle = $newBuildGradle -replace 'outputFileName = "Pixory-v[^"\r\n]+\.apk"', "outputFileName = `"$expectedApkOutputName`""
  [System.IO.File]::WriteAllText($buildGradlePath, $newBuildGradle, [System.Text.UTF8Encoding]::new($false))

  # 清理 native build 缓存
  if (Test-Path -LiteralPath $nativeBuildDir) {
    [System.IO.Directory]::Delete("\\?\$nativeBuildDir", $true)
  }

  Write-Host "开始执行 Gradle clean & assembleRelease..." -ForegroundColor Cyan
  Push-Location $androidDir
  try {
    & $gradleWrapper clean
    if ($LASTEXITCODE -ne 0) { throw "Gradle clean failed with exit code $LASTEXITCODE." }

    & $gradleWrapper assembleRelease "-PreactNativeArchitectures=armeabi-v7a,arm64-v8a"
    if ($LASTEXITCODE -ne 0) { throw "Gradle assembleRelease failed with exit code $LASTEXITCODE." }
  } finally {
    Pop-Location
  }

  $builtApk = Join-Path $androidDir "app\build\outputs\apk\release\$expectedApkOutputName"
  if (-not (Test-Path -LiteralPath $builtApk)) {
    throw "Release APK was not produced at: $builtApk"
  }

  $outputDir = Join-Path $repoRoot "output\release"
  New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
  $finalApkPath = Join-Path $outputDir "Pixory-v$Version-$Channel.apk"
  Copy-Item -LiteralPath $builtApk -Destination $finalApkPath -Force

  # 验签与产物校验
  $sdkRoot = $env:ANDROID_HOME
  if (-not $sdkRoot) { $sdkRoot = $env:ANDROID_SDK_ROOT }
  if (-not $sdkRoot) { throw "ANDROID_HOME not found." }
  $aapt = Get-ChildItem (Join-Path $sdkRoot 'build-tools/*/aapt.exe') | Sort-Object FullName -Descending | Select-Object -First 1
  $apksigner = Get-ChildItem (Join-Path $sdkRoot 'build-tools/*/apksigner.bat') | Sort-Object FullName -Descending | Select-Object -First 1

  # 1. 验证 package name 与 app label
  $badging = & $aapt.FullName dump badging $finalApkPath
  $packageLine = $badging | Where-Object { $_ -match '^package:' } | Select-Object -First 1
  if ($packageLine -notmatch "name='$([regex]::Escape($targetPackage))'") {
    throw "APK package does not match expected '$targetPackage': $packageLine"
  }
  Write-Host "✓ 包名校验通过: $targetPackage" -ForegroundColor Green

  # 2. 验证签名
  $signature = & $apksigner.FullName verify --print-certs $finalApkPath
  if ($LASTEXITCODE -ne 0 -or ($signature -join "`n") -notmatch 'b64a034ebd68c7fbc2e8c345e7c461c471f461ba59a034f8f81cc72b7e957e2e') {
    throw "APK 签名校验失败或使用了未知签名证书。"
  }
  Write-Host "✓ 官方签名证书校验通过" -ForegroundColor Green

  # 3. 验证内置 app.config
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($finalApkPath)
  try {
    $entry = $archive.GetEntry('assets/app.config')
    if (-not $entry) { throw "Embedded Expo configuration missing from APK." }
    $reader = [System.IO.StreamReader]::new($entry.Open())
    try { $embedded = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    if ($embedded.android.package -ne $targetPackage) {
      throw "Embedded package does not match: $($embedded.android.package)"
    }
    if ($embedded.updates.requestHeaders.'expo-channel-name' -ne $Channel) {
      throw "Embedded channel does not match: $($embedded.updates.requestHeaders.'expo-channel-name')"
    }
    Write-Host "✓ 内置 Expo 配置校验通过: package=$($embedded.android.package), channel=$($embedded.updates.requestHeaders.'expo-channel-name')" -ForegroundColor Green
  } finally {
    $archive.Dispose()
  }

  $fileHash = (Get-FileHash -LiteralPath $finalApkPath -Algorithm SHA256).Hash.ToLower()
  $fileSize = (Get-Item -LiteralPath $finalApkPath).Length

  Write-Host "==========================================================" -ForegroundColor Green
  Write-Host "共存测试包构建成功！" -ForegroundColor Green
  Write-Host "产物文件: $finalApkPath" -ForegroundColor Green
  Write-Host "文件大小: $fileSize 字节" -ForegroundColor Green
  Write-Host "SHA-256 : $fileHash" -ForegroundColor Green
  Write-Host "共存说明: 包名与系统 ContentProvider 隔离，可与主版本同时安装在同一手机上。" -ForegroundColor Cyan
  Write-Host "==========================================================" -ForegroundColor Green
} finally {
  if (-not $KeepModified) {
    Restore-OriginalFiles
  }
}
