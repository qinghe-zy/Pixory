param(
  [string]$HostName = "mist01.com",
  [string]$Server = "20.78.128.220",
  [string]$User = "qinghe",
  [string]$KeyPath = "D:\Project\keys\微软服务器\qinghe_key.pem",
  [string]$ApkPath = "",
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$docsDir = Join-Path $repoRoot "docs"
$archive = Join-Path $env:TEMP "pixory-docs-$HostName.tar.gz"
$remoteRunner = Join-Path $env:TEMP "pixory-deploy-$HostName.sh"
$remoteArchive = "/tmp/pixory-docs-$HostName.tar.gz"
$remoteRunnerPath = "/tmp/pixory-deploy-$HostName.sh"
$remoteRoot = "/var/www/$HostName/html"
$remoteApkTemp = "/tmp/pixory-latest.apk"
$remoteApkFile = ""

if (-not (Test-Path -LiteralPath $docsDir)) {
  throw "Docs directory not found: $docsDir"
}

if ($ApkPath) {
  $resolvedApkPath = (Resolve-Path -LiteralPath $ApkPath).Path
  if (-not $Version) {
    $packageJsonPath = Join-Path $repoRoot "package.json"
    $Version = (Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json).version
  }
  $remoteApkFile = "Pixory-v$Version.apk"
}

if (Test-Path -LiteralPath $archive) {
  Remove-Item -LiteralPath $archive -Force
}

tar -czf $archive -C $docsDir .
scp -i $KeyPath $archive "$User@$Server`:$remoteArchive"

if ($ApkPath) {
  scp -i $KeyPath $resolvedApkPath "$User@$Server`:$remoteApkTemp"
}

$remoteScript = @"
set -e
sudo mkdir -p '$remoteRoot'
sudo find '$remoteRoot' -mindepth 1 -maxdepth 1 ! -name downloads -exec rm -rf {} +
sudo tar -xzf '$remoteArchive' -C '$remoteRoot'
sudo chown -R www-data:www-data '/var/www/$HostName'
sudo find '/var/www/$HostName' -type d -exec chmod 755 {} +
sudo find '/var/www/$HostName' -type f -exec chmod 644 {} +
sudo nginx -t
sudo systemctl reload nginx
"@

if ($ApkPath) {
  $remoteScript += @"

sudo mkdir -p '$remoteRoot/downloads'
sudo mv '$remoteApkTemp' '$remoteRoot/downloads/$remoteApkFile'
sudo find '$remoteRoot/downloads' -type f -name 'Pixory-v*.apk' ! -name '$remoteApkFile' -delete
sudo chown -R www-data:www-data '$remoteRoot/downloads'
sudo chmod 755 '$remoteRoot/downloads'
sudo chmod 644 '$remoteRoot/downloads/$remoteApkFile'
"@
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($remoteRunner, ($remoteScript -replace "`r`n", "`n"), $utf8NoBom)

scp -i $KeyPath $remoteRunner "$User@$Server`:$remoteRunnerPath"
ssh -i $KeyPath "$User@$Server" "bash '$remoteRunnerPath'"

Write-Host "Deployed docs to https://$HostName/"
if ($ApkPath) {
  Write-Host "Deployed latest APK to https://$HostName/downloads/$remoteApkFile"
}
