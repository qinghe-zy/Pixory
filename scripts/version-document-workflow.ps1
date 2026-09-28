param(
  [ValidateSet('Status', 'InitializeCycle', 'AppendUpdate', 'ValidateCurrent', 'PreviewRelease', 'FinalizeRelease', 'MigrateLegacy')]
  [string]$Action = 'Status',
  [string]$ReleasedVersion = '',
  [string]$ApkPath = '',
  [string]$Commit = '',
  [string]$Tag = '',
  [ValidateSet('LocalCommit', 'HotUpdate', 'Manual')]
  [string]$EventType = 'Manual',
  [string]$Summary = '',
  [string]$SourceCommit = '',
  [string]$RepositoryRoot = '',
  [switch]$ApplyMigration
)

$ErrorActionPreference = 'Stop'

function Normalize-Version([string]$Value) {
  $normalized = $Value.Trim().TrimStart('v')
  if ($normalized -notmatch '^\d+\.\d+\.\d+(\.\d+)?$') {
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
$rootPrdPath = Join-Path $repoRoot 'PRD.md'

$requiredDocuments = @(
  [pscustomobject]@{ Name = 'PRD.md'; Title = '产品需求文档（PRD）'; Purpose = '定义本次迭代做什么、业务规则、异常流程和状态机。' },
  [pscustomobject]@{ Name = 'TDD.md'; Title = '技术设计文档（TDD）'; Purpose = '定义针对 PRD 的架构、实现、性能、安全和迁移方案。' },
  [pscustomobject]@{ Name = 'Test-Report.md'; Title = '测试报告（Test Report）'; Purpose = '记录发版前的量化质量结论、遗留缺陷和已知风险。' },
  [pscustomobject]@{ Name = 'Release-Notes-External.md'; Title = '对外发版说明'; Purpose = '用用户能理解的语言描述本次更新。' },
  [pscustomobject]@{ Name = 'Release-Notes-Internal.md'; Title = '对内发版说明'; Purpose = '记录客服、运营影响、迁移风险和应对话术。' }
)

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

function Get-RequiredDocumentPaths {
  return @($requiredDocuments | ForEach-Object { Join-Path $currentDir $_.Name })
}

function New-RequiredDocument([pscustomobject]$Definition, [string]$FromVersion, [string]$ToVersion) {
  $path = Join-Path $currentDir $Definition.Name
  if (Test-Path -LiteralPath $path -PathType Leaf) { return }
  $common = @"
# Pixory $FromVersion → $ToVersion $($Definition.Title)

> 定位：$($Definition.Purpose)
> 本文件属于当前迭代的持续文档。每次本地提交和热更新都必须通过 `scripts/version-document-workflow.ps1 -Action AppendUpdate` 追加记录；需求冲突时，必须先修订本文档并在“变更记录”中标明替代关系。

## 当前有效内容

待补充。这里仅保留当前有效规则；被替代的旧内容必须移入变更记录，不得与当前规则并列。

## 变更记录
<!-- PIXORY_CHANGE_RECORD -->

| 时间 | 事件 | 来源提交/更新 | 变更 | 影响与知会 |
| --- | --- | --- | --- | --- |
| $((Get-Date).ToString('yyyy-MM-dd')) | 初始化 | - | 创建本版本文档 | 待评审 |
"@
  $specific = switch ($Definition.Name) {
    'PRD.md' { @"

## 业务范围与规则

### 正向流程

待补充。

### 异常流程

至少覆盖断网、请求报错、数据为空、重复操作、权限不足和恢复/重试路径。

### 状态机

用文字或 Mermaid 明确状态、事件、守卫、动作和终态。

### 评审后需求变更

所有评审后修改必须高亮记录，说明旧规则、新规则、原因、影响和已知会的干系人。
"@ }
    'TDD.md' { @"

## 技术方案

### 架构与时序

必要时补充架构图和系统时序图，说明模块边界与交互。

### 性能与安全评估

明确高并发限流/降级、事务一致性、失败恢复、数据脱敏和敏感信息边界。

### 数据库与迁移

如涉及表结构，引用或补充 `DB-Schema.md`，说明迁移、回滚和兼容窗口。
"@ }
    'Test-Report.md' { @"

## 质量指标

- 用例执行率：待填写
- Bug 遗留率：待填写
- 严重级别 Bug 分布：待填写

## 发布结论

结论：待评审（是否同意发版：是/否）。

## Known Issues

暂无，或明确列出带病上线风险、影响范围和规避方式。
"@ }
    'Release-Notes-External.md' { @"

## 用户版

使用非专业术语描述用户能感知的变化、收益、限制和升级注意事项。
"@ }
    'Release-Notes-Internal.md' { @"

## 客服与运营版

记录可能引起客诉的变化、旧数据迁移影响、FAQ、应对话术和升级路径。
"@ }
  }
  Write-Utf8File $path ($common + $specific + "`n")
}

function Ensure-RequiredDocuments([string]$FromVersion, [string]$ToVersion) {
  foreach ($definition in $requiredDocuments) {
    New-RequiredDocument $definition $FromVersion $ToVersion
  }
}

function New-RoadmapSection([string]$ReleasedVersion, [string]$NextVersion, [string]$ExistingSection = '') {
  $preserved = $ExistingSection.Trim()
  if ($preserved -match '(?ms)^### 维护状态\s*.*?(?=^### |\z)') {
    $preserved = [regex]::Replace($preserved, '(?ms)^### 维护状态\s*.*?(?=^### |\z)', '').Trim()
  }
  if (-not $preserved) {
    $preserved = '- 待根据本版本 PRD、TDD、Test Report 和评审结论补充具体路线项。'
  }
  return @"
## 13. 版本路线图
<!-- PIXORY_ROADMAP_START -->
### 维护状态

- 已归档版本：v$ReleasedVersion
- 当前后续迭代：v$NextVersion
- 维护来源：当前版本 PRD、TDD、Test Report、功能矩阵和评审变更记录

### 路线内容

$preserved

### 更新规则

- 每次版本迭代和评审后需求变更都要更新本节，不能只追加重复描述。
- 当前有效路线必须与 PRD 的当前有效内容一致；被替代路线移入变更记录或明确标记为历史。
<!-- PIXORY_ROADMAP_END -->
"@
}

function Sync-RootProductRequirements([string]$Version, [string]$NextVersion) {
  $sourcePath = Join-Path $currentDir 'PRD.md'
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "缺少本版本 PRD，无法更新根目录总 PRD：$sourcePath"
  }
  $source = (Get-Content -Raw -LiteralPath $sourcePath).Trim()
  $hasStructuredPrd = ($source -match '## 当前有效内容') -or
    (($source -match '## 0\.') -and ($source -match '### 0\.2') -and ($source -match '## 1\.'))
  if ($source.Length -lt 200 -or $source -notmatch '产品需求文档|PRD' -or -not $hasStructuredPrd) {
    throw "本版本 PRD 结构不完整，拒绝覆盖根目录 PRD：$sourcePath"
  }
  $existingRoadmap = ''
  if (Test-Path -LiteralPath $rootPrdPath -PathType Leaf) {
    $root = Get-Content -Raw -LiteralPath $rootPrdPath
    $match = [regex]::Match($root, '(?ms)## \d+\. 版本路线图\s*<!-- PIXORY_ROADMAP_START -->(?<body>.*?)<!-- PIXORY_ROADMAP_END -->')
    if ($match.Success) { $existingRoadmap = $match.Groups['body'].Value }
  }
  $source = [regex]::Replace($source, '(?ms)\r?\n## \d+\. 版本路线图\s*<!-- PIXORY_ROADMAP_START -->.*?<!-- PIXORY_ROADMAP_END -->\s*$', '')
  $roadmap = New-RoadmapSection $Version $NextVersion $existingRoadmap
  Write-Utf8File $rootPrdPath ($source.TrimEnd() + "`n`n" + $roadmap.Trim() + "`n")
  return $rootPrdPath
}

function Assert-CurrentDocumentsValid {
  $range = Read-VersionRange
  Ensure-RequiredDocuments $range.FromVersion $range.ToVersion
  $missing = @(Get-RequiredDocumentPaths | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) })
  if ($missing.Count -gt 0) { throw "缺少本版本必需文档：$($missing -join ', ')" }
  foreach ($path in Get-RequiredDocumentPaths) {
    $content = Get-Content -Raw -LiteralPath $path
    $isPrd = ([System.IO.Path]::GetFileName($path) -eq 'PRD.md')
    $hasPrdStructure = $isPrd -and ($content -match '## 0\.') -and ($content -match '### 0\.2') -and ($content -match '## 1\.')
    $hasCurrentSection = $content -match '## 当前有效内容'
    $hasChangeSection = $content.Contains('<!-- PIXORY_CHANGE_RECORD -->') -or $content -match '## 变更记录'
    $invalid = $false
    if (-not $isPrd -and -not $hasCurrentSection) {
      $invalid = $true
    }
    if (-not $hasChangeSection -and -not $isPrd) { $invalid = $true }
    if ($invalid) {
      throw "文档缺少当前有效内容或变更记录区块：$path"
    }
  }
  return $range
}

function Append-VersionUpdate {
  Ensure-LocalDirectories
  $range = Assert-CurrentDocumentsValid
  $commit = if ($SourceCommit) { $SourceCommit } else { Resolve-GitValue @('rev-parse', 'HEAD') '未记录' }
  $summaryValue = if ($Summary) { $Summary.Trim() } elseif ($EventType -eq 'HotUpdate') { '热更新变更' } elseif ($EventType -eq 'LocalCommit') { '本地提交变更' } else { '版本过程变更' }
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
  $entry = @"

### $stamp · $EventType

- 来源提交/更新：$commit
- 变更摘要：$summaryValue
- 文档规则：如与既有需求冲突，先更新 PRD/TDD/测试/发布说明的“当前有效内容”，再在“变更记录”标注替代关系并知会干系人。
"@
  Append-Utf8File $localUpdatesPath $entry
  Append-Utf8File $currentIndexPath $entry
  Write-Host "已追加版本文档事件：$EventType / $commit"
}

function Resolve-GitValue([string[]]$Arguments, [string]$Fallback) {
  try {
    $value = (& git -C $repoRoot @Arguments 2>$null | Select-Object -First 1)
    if ($LASTEXITCODE -ne 0 -or -not $value) {
      return $Fallback
    }
    return ([string]$value).Trim()
  } catch {
    return $Fallback
  }
}

function Show-ReleasePlan([string]$Version) {
  Ensure-LocalDirectories
  $range = Assert-CurrentDocumentsValid
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

当前尚无过程文档。必需文档为 PRD、TDD、Test Report、对外发版说明和对内发版说明；只有用户明确要求写入本版本的其他 Spec、Plan、Review、规划、算法或调研才添加到这里。

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
  Ensure-RequiredDocuments $from $to
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

  $rootPrdBackup = if (Test-Path -LiteralPath $rootPrdPath -PathType Leaf) { Get-Content -Raw -LiteralPath $rootPrdPath } else { $null }
  Sync-RootProductRequirements $version (Get-NextPatchVersion $version) | Out-Null

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
    if ($null -eq $rootPrdBackup) {
      if (Test-Path -LiteralPath $rootPrdPath) { Remove-Item -LiteralPath $rootPrdPath -Force }
    } else {
      Write-Utf8File $rootPrdPath $rootPrdBackup
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
    $range = Assert-CurrentDocumentsValid
    Write-Host "当前版本文档区间：v$($range.FromVersion) → v$($range.ToVersion)"
    Write-Host "当前版本文档：$((Get-CurrentDocumentFiles).Count) 个文件"
    Write-Host "历史版本目录：$(@(Get-ChildItem -LiteralPath $historyRoot -Directory).Count) 个"
    Write-Host "版本更新说明：$(@(Get-ChildItem -LiteralPath $releaseNotesDir -File).Count) 个"
    Write-Host "待办文件：$(@(Get-ChildItem -LiteralPath $todoDir -File).Count) 个"
  }
  'InitializeCycle' {
    Ensure-LocalDirectories
    $range = Read-VersionRange
    Ensure-RequiredDocuments $range.FromVersion $range.ToVersion
    Write-Host "已初始化 v$($range.FromVersion) → v$($range.ToVersion) 的必需版本文档：$($requiredDocuments.Name -join ', ')"
  }
  'ValidateCurrent' {
    $range = Assert-CurrentDocumentsValid
    Write-Host "当前版本文档校验通过：v$($range.FromVersion) → v$($range.ToVersion)"
  }
  'AppendUpdate' {
    Append-VersionUpdate
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

