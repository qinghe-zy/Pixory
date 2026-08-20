param(
  [ValidateSet('Status', 'PreviewRelease', 'FinalizeRelease', 'MigrateLegacy')]
  [string]$Action = 'Status',
  [string]$ReleasedVersion = '',
  [string]$ApkPath = '',
  [string]$Commit = '',
  [string]$Tag = '',
  [string]$RepositoryRoot = '',
  [switch]$ApplyMigration
)

$ErrorActionPreference = 'Stop'

function Normalize-Version([string]$Value) {
  $normalized = $Value.Trim().TrimStart('v')
  if ($normalized -notmatch '^\d+\.\d+\.\d+$') {
    throw "版本号格式无效：$Value"
  }
  return $normalized
}

function Get-NextPatchVersion([string]$Value) {
  $parts = (Normalize-Version $Value).Split('.')
  return "$($parts[0]).$($parts[1]).$([int]$parts[2] + 1)"
}

function Write-Utf8File([string]$Path, [string]$Content) {
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Append-Utf8File([string]$Path, [string]$Content) {
  [System.IO.File]::AppendAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

if (-not $RepositoryRoot) {
  $RepositoryRoot = Split-Path -Parent $PSScriptRoot
}
$repoRoot = [System.IO.Path]::GetFullPath($RepositoryRoot)
$versionRoot = Join-Path $repoRoot '版本文档'
$currentDir = Join-Path $versionRoot '当前版本文档'
$historyRoot = Join-Path $versionRoot '历史文档'
$releaseNotesDir = Join-Path $versionRoot '版本更新说明'
$todoDir = Join-Path $versionRoot '待办'
$rangePath = Join-Path $currentDir '版本区间.json'
$currentIndexPath = Join-Path $currentDir '版本过程索引.md'
$localUpdatesPath = Join-Path $repoRoot 'LOCAL_UPDATES_LOG.md'

function Assert-PathUnderVersionRoot([string]$Path) {
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $rootPrefix = $versionRoot.TrimEnd('\') + '\'
  if (-not $fullPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "拒绝操作版本文档根目录之外的路径：$fullPath"
  }
}

function Ensure-LocalDirectories {
  foreach ($path in @($versionRoot, $currentDir, $historyRoot, $releaseNotesDir, $todoDir)) {
    Assert-PathUnderVersionRoot (Join-Path $path '.path-check')
    [System.IO.Directory]::CreateDirectory($path) | Out-Null
  }
}

function Read-VersionRange {
  if (-not (Test-Path -LiteralPath $rangePath -PathType Leaf)) {
    throw "缺少当前版本区间文件：$rangePath"
  }
  $range = Get-Content -Raw -LiteralPath $rangePath | ConvertFrom-Json
  return [pscustomobject]@{
    FromVersion = Normalize-Version ([string]$range.fromVersion)
    ToVersion = Normalize-Version ([string]$range.toVersion)
  }
}

function Get-CurrentDocumentFiles {
  $nested = @(Get-ChildItem -LiteralPath $currentDir -Directory -Force)
  if ($nested.Count -gt 0) {
    throw "当前版本文档禁止嵌套目录：$($nested.FullName -join ', ')"
  }
  return @(Get-ChildItem -LiteralPath $currentDir -File -Force | Sort-Object Name)
}

function Resolve-GitValue([string[]]$Arguments, [string]$Fallback) {
  $value = (& git -C $repoRoot @Arguments 2>$null | Select-Object -First 1)
  if ($LASTEXITCODE -ne 0 -or -not $value) {
    return $Fallback
  }
  return ([string]$value).Trim()
}

function Show-ReleasePlan([string]$Version) {
  Ensure-LocalDirectories
  $range = Read-VersionRange
  $version = Normalize-Version $Version
  $historyTarget = Join-Path $historyRoot "v$version"
  $releaseNoteTarget = Join-Path $releaseNotesDir "Pixory-v$version-版本更新说明.md"
  $alreadyArchived = (Test-Path -LiteralPath $historyTarget -PathType Container) -and
    (Test-Path -LiteralPath $releaseNoteTarget -PathType Leaf) -and
    $range.FromVersion -eq $version

  if ($alreadyArchived) {
    Write-Host "版本 v$version 已归档；重复打包不会移动 v$($range.FromVersion)→v$($range.ToVersion) 文档。"
    return [pscustomobject]@{ AlreadyArchived = $true; Range = $range }
  }
  if ($range.ToVersion -ne $version) {
    throw "打包版本 v$version 与当前文档目标 v$($range.ToVersion) 不一致。请先完成版本号和区间同步。"
  }
  if (-not (Test-Path -LiteralPath $localUpdatesPath -PathType Leaf)) {
    throw "缺少当前更新说明：$localUpdatesPath"
  }
  $files = Get-CurrentDocumentFiles
  if ($files.Count -eq 0) {
    throw '当前版本文档为空，拒绝生成无法追溯的版本包。'
  }
  if (Test-Path -LiteralPath $historyTarget) {
    throw "拒绝覆盖历史版本目录：$historyTarget"
  }
  if (Test-Path -LiteralPath $releaseNoteTarget) {
    throw "拒绝覆盖版本更新说明：$releaseNoteTarget"
  }

  Write-Host "版本文档预检：v$($range.FromVersion) → v$($range.ToVersion)"
  Write-Host "当前更新说明：$localUpdatesPath"
  Write-Host "历史文档目标：$historyTarget"
  Write-Host "版本说明目标：$releaseNoteTarget"
  Write-Host '待同步的当前版本文档：'
  foreach ($file in $files) { Write-Host "  - $($file.FullName)" }
  Write-Host "待办目录保持不动：$todoDir"
  Write-Host '最新功能矩阵只保留 docs/feature-matrix.md，不生成版本快照。'
  return [pscustomobject]@{ AlreadyArchived = $false; Files = $files; Range = $range }
}

function New-CurrentVersionFiles([string]$FromVersion) {
  $from = Normalize-Version $FromVersion
  $to = Get-NextPatchVersion $from
  [System.IO.Directory]::CreateDirectory($currentDir) | Out-Null
  Write-Utf8File $rangePath (([ordered]@{ fromVersion = $from; toVersion = $to } | ConvertTo-Json) + "`n")
  Write-Utf8File $currentIndexPath @"
# Pixory $from → $to 版本过程索引

## 区间信息

- 基线版本：$from
- 目标版本：$to
- 状态：开发中
- 当前更新说明：``LOCAL_UPDATES_LOG.md``
- 最新功能矩阵：``docs/feature-matrix.md``

## 当前文档

当前尚无过程文档。只有用户明确要求写入本版本的 Spec、Plan、Review、规划、算法或调研才添加到这里。

## 最终发布信息

尚未发布。只有 v$to APK 成功生成后才能由归档脚本写入最终版本信息。
"@
  Write-Utf8File $localUpdatesPath @"
# Pixory $from → $to 更新日志

> 本文件记录从已发布 v$from 到目标 v$to 的全部变化，仅保存在本地，不进入 Git。

## 版本区间

- 基线版本：$from
- 目标版本：$to
- 状态：开发中

## 更新内容

尚无记录。后续每次完成功能、修复、性能优化或文档工作时追加，不覆盖旧条目。

## 最终发布信息

尚未发布。只有 v$to APK 成功生成后才能写入最终版本、提交、标签、时间、验证和产物路径。
"@
}

function Finalize-Release([string]$Version) {
  $plan = Show-ReleasePlan $Version
  if ($plan.AlreadyArchived) { return }
  $version = Normalize-Version $Version
  if ($ApkPath -and -not (Test-Path -LiteralPath $ApkPath -PathType Leaf)) {
    throw "APK 不存在，禁止归档版本文档：$ApkPath"
  }
  $historyTarget = Join-Path $historyRoot "v$version"
  $releaseNoteTarget = Join-Path $releaseNotesDir "Pixory-v$version-版本更新说明.md"
  Assert-PathUnderVersionRoot (Join-Path $historyTarget '.path-check')
  Assert-PathUnderVersionRoot $releaseNoteTarget

  if (-not $Commit) { $script:Commit = Resolve-GitValue @('rev-parse', 'HEAD') '未记录' }
  if (-not $Tag) { $script:Tag = Resolve-GitValue @('tag', '--points-at', 'HEAD') '未创建' }
  $releaseTime = Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
  $apkValue = if ($ApkPath) { [System.IO.Path]::GetFullPath($ApkPath) } else { '未提供' }
  $marker = "PIXORY_FINAL_VERSION:v$version"
  $finalBlock = @"

---

## 最终发布信息

<!-- $marker -->
- 最终版本：v$version
- 发布时间：$releaseTime
- Commit：$Commit
- Tag：$Tag
- APK：$apkValue
- 归档状态：已完成
"@
  $originalContents = @{}
  foreach ($path in @($localUpdatesPath, $currentIndexPath)) {
    $content = Get-Content -Raw -LiteralPath $path
    $originalContents[$path] = $content
    if ($content -notmatch [regex]::Escape($marker)) {
      Append-Utf8File $path $finalBlock
    }
  }

  $historyMoved = $false
  $releaseNoteMoved = $false
  try {
    # The whole flat current directory is renamed in one operation. This avoids
    # leaving half of a version in history if an individual file move fails.
    Move-Item -LiteralPath $currentDir -Destination $historyTarget
    $historyMoved = $true
    Move-Item -LiteralPath $localUpdatesPath -Destination $releaseNoteTarget
    $releaseNoteMoved = $true
    New-CurrentVersionFiles $version
  } catch {
    $archiveError = $_
    if ($historyMoved) {
      if (Test-Path -LiteralPath $currentDir) {
        Assert-PathUnderVersionRoot (Join-Path $currentDir '.path-check')
        [System.IO.Directory]::Delete($currentDir, $true)
      }
      if ($releaseNoteMoved -and (Test-Path -LiteralPath $releaseNoteTarget)) {
        Move-Item -LiteralPath $releaseNoteTarget -Destination $localUpdatesPath
      }
      if (Test-Path -LiteralPath $historyTarget) {
        Move-Item -LiteralPath $historyTarget -Destination $currentDir
      }
    }
    foreach ($path in $originalContents.Keys) {
      if (Test-Path -LiteralPath $path) {
        Write-Utf8File $path $originalContents[$path]
      }
    }
    throw $archiveError
  }
  Write-Host "版本 v$version 文档归档完成；已开启 v$version → v$(Get-NextPatchVersion $version)。"
}

function Get-LegacyDocumentType([string]$RelativePath) {
  $path = $RelativePath.Replace('\', '/')
  if ($path -match '/specs/') { return 'Spec' }
  if ($path -match '/plans/' -or $path -eq 'task_plan.md' -or $path -match 'implementation_plan') { return 'Plan' }
  if ($path -match '/reviews/' -or $path -match 'audit|review|change-log|progress') { return 'Review' }
  if ($path.EndsWith('.drawio')) { return 'Algorithm' }
  if ($path -match 'research|findings|50_models') { return 'Research' }
  if ($path -eq 'design.md') { return 'Spec' }
  return 'Planning'
}

function Get-FlatArchiveName([string]$RelativePath, [string]$Type) {
  $leaf = [System.IO.Path]::GetFileName($RelativePath)
  return "$Type-$leaf"
}

function Get-ReleaseTags {
  $records = @()
  foreach ($name in @(& git -C $repoRoot tag --list 'v*')) {
    if ($name -notmatch '^v\d+\.\d+\.\d+$') { continue }
    $dateText = (& git -C $repoRoot log -1 --format=%cI $name 2>$null | Select-Object -First 1)
    if ($dateText) {
      $records += [pscustomobject]@{ Name = $name.TrimStart('v'); Date = [DateTimeOffset]::Parse($dateText) }
    }
  }
  return @($records | Sort-Object Date, Name)
}

function Get-LegacyDocuments {
  $paths = @(& git -C $repoRoot -c core.quotepath=false ls-files -- 'docs/superpowers' 'docs/reviews' 'docs/ai-chat-research' 'docs/ai-chat-streaming-research' 'docs/memory-v1-implementation-audit.md' 'docs/product-capability-baseline.md' 'task_plan.md' 'findings.md' 'progress.md' 'ai_chat_experience_review.md' 'design.md' 'report' 'scratch')
  if ($LASTEXITCODE -ne 0) { throw '无法读取 Git 版本过程文档列表。' }
  $existingPaths = $paths | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $repoRoot $_) -PathType Leaf) }
  return @($existingPaths | Sort-Object -Unique)
}

function Migrate-LegacyDocuments {
  Ensure-LocalDirectories
  $range = Read-VersionRange
  $tags = Get-ReleaseTags
  $documents = Get-LegacyDocuments
  $moves = @()

  foreach ($relativePath in $documents) {
    $metadata = (& git -C $repoRoot -c core.quotepath=false log -1 --format='%H|%cI' -- $relativePath 2>$null | Select-Object -First 1)
    if (-not $metadata) { throw "无法读取文档 Git 时间：$relativePath" }
    $parts = $metadata -split '\|', 2
    $lastCommit = $parts[0]
    $lastDate = [DateTimeOffset]::Parse($parts[1])
    $release = $tags | Where-Object { $_.Date -ge $lastDate } | Select-Object -First 1
    $version = if ($release) { $release.Name } else { $range.ToVersion }
    $type = Get-LegacyDocumentType $relativePath
    $isTodo = [System.IO.Path]::GetFileName($relativePath) -match 'backlog|todo|待办|清单'
    $destinationDirectory = if ($isTodo) { $todoDir } elseif ($version -eq $range.ToVersion) { $currentDir } else { Join-Path $historyRoot "v$version" }
    $name = if ($isTodo) { '性能优化待办.md' } else { Get-FlatArchiveName $relativePath $type }
    $destination = Join-Path $destinationDirectory $name
    if (Test-Path -LiteralPath $destination) {
      $sourceKey = $relativePath.Replace('/', '__').Replace('\', '__')
      $destination = Join-Path $destinationDirectory "$type-$sourceKey"
    }
    if (Test-Path -LiteralPath $destination) { throw "拒绝覆盖迁移目标：$destination" }
    $moves += [pscustomobject]@{
      Source = Join-Path $repoRoot $relativePath
      SourceRelative = $relativePath
      Destination = $destination
      DestinationDirectory = $destinationDirectory
      LastCommit = $lastCommit
      LastDate = $lastDate.ToString('yyyy-MM-dd')
      Type = $type
      Version = $version
      IsTodo = $isTodo
    }
  }

  Write-Host "旧版本过程文档迁移计划：$($moves.Count) 个文件"
  foreach ($group in $moves | Group-Object { if ($_.IsTodo) { '待办' } elseif ($_.Version -eq $range.ToVersion) { "当前 v$($_.Version)" } else { "历史 v$($_.Version)" } }) {
    Write-Host "  $($group.Name)：$($group.Count)"
  }
  foreach ($move in $moves | Sort-Object Version, SourceRelative) {
    $targetLabel = $move.Destination.Substring($versionRoot.Length).TrimStart('\')
    Write-Host "  - $($move.SourceRelative) -> $targetLabel"
  }
  if (-not $ApplyMigration) {
    Write-Host '当前为预览；增加 -ApplyMigration 后才移动文件。'
    return
  }

  foreach ($move in $moves) {
    Assert-PathUnderVersionRoot $move.Destination
    [System.IO.Directory]::CreateDirectory($move.DestinationDirectory) | Out-Null
    Move-Item -LiteralPath $move.Source -Destination $move.Destination
  }
  foreach ($group in $moves | Where-Object { -not $_.IsTodo } | Group-Object DestinationDirectory) {
    $indexPath = if ($group.Name -eq $currentDir) {
      $currentIndexPath
    } else {
      Join-Path $group.Name '版本文档索引.md'
    }
    $title = if ($group.Name -eq $currentDir) { "Pixory $($range.FromVersion) → $($range.ToVersion) 版本过程索引" } else { "Pixory $([System.IO.Path]::GetFileName($group.Name)) 历史版本文档索引" }
    $rows = ($group.Group | Sort-Object Destination | ForEach-Object {
      "| ``$([System.IO.Path]::GetFileName($_.Destination))`` | ``$($_.SourceRelative)`` | $($_.Type) | ``$($_.LastCommit.Substring(0, 7))`` | $($_.LastDate) |"
    }) -join "`n"
    $section = @"

## 迁移归档记录

| 归档文件 | 原始路径 | 类型 | 最后提交 | 日期 |
| --- | --- | --- | --- | --- |
$rows
"@
    if (Test-Path -LiteralPath $indexPath) {
      Append-Utf8File $indexPath $section
    } else {
      Write-Utf8File $indexPath "# $title`n$section"
    }
  }
  Write-Host "旧版本过程文档迁移完成：$($moves.Count) 个文件。"
}

switch ($Action) {
  'Status' {
    Ensure-LocalDirectories
    $range = Read-VersionRange
    Write-Host "当前版本文档区间：v$($range.FromVersion) → v$($range.ToVersion)"
    Write-Host "当前版本文档：$((Get-CurrentDocumentFiles).Count) 个文件"
    Write-Host "历史版本目录：$(@(Get-ChildItem -LiteralPath $historyRoot -Directory).Count) 个"
    Write-Host "版本更新说明：$(@(Get-ChildItem -LiteralPath $releaseNotesDir -File).Count) 个"
    Write-Host "待办文件：$(@(Get-ChildItem -LiteralPath $todoDir -File).Count) 个"
  }
  'PreviewRelease' {
    if (-not $ReleasedVersion) { throw 'PreviewRelease 必须提供 -ReleasedVersion。' }
    Show-ReleasePlan $ReleasedVersion | Out-Null
  }
  'FinalizeRelease' {
    if (-not $ReleasedVersion) { throw 'FinalizeRelease 必须提供 -ReleasedVersion。' }
    Finalize-Release $ReleasedVersion
  }
  'MigrateLegacy' {
    Migrate-LegacyDocuments
  }
}
