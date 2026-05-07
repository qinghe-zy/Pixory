$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$outputDir = Join-Path $root 'assets/backgrounds/japanese-fresh/elements'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

function New-Canvas {
  param(
    [int] $Width,
    [int] $Height
  )

  $bitmap = New-Object System.Drawing.Bitmap $Width, $Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)

  return [PSCustomObject]@{
    Bitmap = $bitmap
    Graphics = $graphics
    Width = $Width
    Height = $Height
  }
}

function New-Color {
  param(
    [int] $Alpha,
    [int] $Red,
    [int] $Green,
    [int] $Blue
  )

  return [System.Drawing.Color]::FromArgb($Alpha, $Red, $Green, $Blue)
}

function New-RoundedRectPath {
  param(
    [float] $X,
    [float] $Y,
    [float] $Width,
    [float] $Height,
    [float] $Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Save-Canvas {
  param(
    [object] $Canvas,
    [string] $Name
  )

  $path = Join-Path $outputDir $Name
  $Canvas.Bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $Canvas.Graphics.Dispose()
  $Canvas.Bitmap.Dispose()
}

function Draw-BotanicalBranch {
  $canvas = New-Canvas 360 520
  $g = $canvas.Graphics
  $pen = New-Object System.Drawing.Pen (New-Color 46 86 107 72), 4
  $leafBrush = New-Object System.Drawing.SolidBrush (New-Color 36 111 133 93)

  $g.DrawBezier($pen, 278, 28, 224, 120, 154, 256, 82, 494)
  $leaves = @(
    @(236, 106, 68, 34, -22), @(284, 158, 62, 28, 18), @(174, 224, 74, 34, -28),
    @(220, 282, 70, 32, 18), @(118, 350, 82, 36, -24), @(152, 418, 70, 30, 20)
  )

  foreach ($leaf in $leaves) {
    $state = $g.Save()
    $g.TranslateTransform($leaf[0], $leaf[1])
    $g.RotateTransform($leaf[4])
    $g.FillEllipse($leafBrush, -($leaf[2] / 2), -($leaf[3] / 2), $leaf[2], $leaf[3])
    $g.Restore($state)
  }

  $pen.Dispose()
  $leafBrush.Dispose()
  Save-Canvas $canvas 'botanical-branch.png'
}

function Draw-WashiPaperCorner {
  $canvas = New-Canvas 440 340
  $g = $canvas.Graphics
  $paperBrush = New-Object System.Drawing.SolidBrush (New-Color 74 230 216 194)
  $linePen = New-Object System.Drawing.Pen (New-Color 44 137 114 84), 2
  $foldBrush = New-Object System.Drawing.SolidBrush (New-Color 42 247 240 230)

  $path = New-RoundedRectPath 44 28 350 250 28
  $g.FillPath($paperBrush, $path)
  $g.DrawPath($linePen, $path)
  $fold = New-Object System.Drawing.Drawing2D.GraphicsPath
  $fold.AddPolygon([System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(314, 28),
    [System.Drawing.PointF]::new(394, 28),
    [System.Drawing.PointF]::new(394, 108)
  ))
  $g.FillPath($foldBrush, $fold)
  $g.DrawLine($linePen, 315, 30, 392, 107)

  for ($i = 0; $i -lt 30; $i++) {
    $x = 62 + (($i * 37) % 306)
    $y = 52 + (($i * 61) % 206)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush (New-Color 16 120 104 78)), $x, $y, 2, 2)
  }

  $paperBrush.Dispose()
  $linePen.Dispose()
  $foldBrush.Dispose()
  Save-Canvas $canvas 'washi-paper-corner.png'
}

function Draw-DotIndexGrid {
  $canvas = New-Canvas 340 260
  $g = $canvas.Graphics
  $dotBrush = New-Object System.Drawing.SolidBrush (New-Color 42 111 133 93)
  $linePen = New-Object System.Drawing.Pen (New-Color 30 154 163 151), 1
  $linePen.DashPattern = @(4, 9)

  for ($y = 28; $y -le 224; $y += 28) {
    $g.DrawLine($linePen, 28, $y, 312, $y)
  }

  for ($x = 30; $x -le 312; $x += 28) {
    for ($y = 30; $y -le 230; $y += 28) {
      $g.FillEllipse($dotBrush, $x, $y, 4, 4)
    }
  }

  $dotBrush.Dispose()
  $linePen.Dispose()
  Save-Canvas $canvas 'dot-index-grid.png'
}

function Draw-MagnifierTexture {
  $canvas = New-Canvas 300 300
  $g = $canvas.Graphics
  $pen = New-Object System.Drawing.Pen (New-Color 36 111 133 93), 8
  $thinPen = New-Object System.Drawing.Pen (New-Color 28 111 133 93), 2

  $g.DrawEllipse($pen, 54, 44, 140, 140)
  $g.DrawLine($pen, 164, 164, 238, 238)
  $g.DrawEllipse($thinPen, 86, 76, 78, 78)

  $pen.Dispose()
  $thinPen.Dispose()
  Save-Canvas $canvas 'magnifier-texture.png'
}

function Draw-FolderOutline {
  $canvas = New-Canvas 420 300
  $g = $canvas.Graphics
  $brush = New-Object System.Drawing.SolidBrush (New-Color 36 230 216 194)
  $pen = New-Object System.Drawing.Pen (New-Color 58 137 114 84), 4
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath

  $path.AddLine(42, 92, 142, 92)
  $path.AddBezier(142, 92, 158, 92, 162, 112, 178, 112)
  $path.AddLine(358, 112)
  $path.AddArc(358, 112, 24, 24, 270, 90)
  $path.AddLine(382, 240)
  $path.AddArc(358, 240, 24, 24, 0, 90)
  $path.AddLine(54, 264)
  $path.AddArc(30, 240, 24, 24, 90, 90)
  $path.AddLine(30, 116)
  $path.AddArc(30, 92, 24, 24, 180, 90)
  $path.CloseFigure()

  $g.FillPath($brush, $path)
  $g.DrawPath($pen, $path)

  $brush.Dispose()
  $pen.Dispose()
  Save-Canvas $canvas 'archive-folder-outline.png'
}

function Draw-TagPaperStack {
  $canvas = New-Canvas 340 250
  $g = $canvas.Graphics
  $pen = New-Object System.Drawing.Pen (New-Color 48 111 133 93), 3
  $brushA = New-Object System.Drawing.SolidBrush (New-Color 48 240 231 217)
  $brushB = New-Object System.Drawing.SolidBrush (New-Color 46 221 231 211)

  $rectA = New-RoundedRectPath 62 40 208 92 18
  $rectB = New-RoundedRectPath 92 104 196 86 18
  $g.FillPath($brushA, $rectA)
  $g.FillPath($brushB, $rectB)
  $g.DrawPath($pen, $rectA)
  $g.DrawPath($pen, $rectB)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush (New-Color 58 111 133 93)), 84, 72, 14, 14)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush (New-Color 56 111 133 93)), 114, 134, 12, 12)

  $pen.Dispose()
  $brushA.Dispose()
  $brushB.Dispose()
  Save-Canvas $canvas 'tag-paper-stack.png'
}

function Draw-FilmEdge {
  $canvas = New-Canvas 180 560
  $g = $canvas.Graphics
  $brush = New-Object System.Drawing.SolidBrush (New-Color 34 39 49 43)
  $holeBrush = New-Object System.Drawing.SolidBrush (New-Color 42 251 247 239)
  $pen = New-Object System.Drawing.Pen (New-Color 28 104 116 106), 2

  $g.FillRectangle($brush, 38, 20, 96, 520)
  for ($y = 48; $y -le 492; $y += 58) {
    $g.FillRectangle($holeBrush, 52, $y, 18, 28)
    $g.FillRectangle($holeBrush, 102, $y, 18, 28)
  }
  $g.DrawRectangle($pen, 38, 20, 96, 520)

  $brush.Dispose()
  $holeBrush.Dispose()
  $pen.Dispose()
  Save-Canvas $canvas 'film-edge.png'
}

function Draw-StorageBox {
  $canvas = New-Canvas 390 290
  $g = $canvas.Graphics
  $brush = New-Object System.Drawing.SolidBrush (New-Color 42 221 231 211)
  $pen = New-Object System.Drawing.Pen (New-Color 52 86 107 72), 4
  $path = New-RoundedRectPath 58 86 270 150 24
  $g.FillPath($brush, $path)
  $g.DrawPath($pen, $path)
  $g.DrawLine($pen, 92, 126, 294, 126)
  $g.DrawArc($pen, 142, 106, 102, 54, 0, 180)

  $brush.Dispose()
  $pen.Dispose()
  Save-Canvas $canvas 'storage-box-outline.png'
}

function Draw-ImportTray {
  $canvas = New-Canvas 360 280
  $g = $canvas.Graphics
  $brush = New-Object System.Drawing.SolidBrush (New-Color 40 240 231 217)
  $pen = New-Object System.Drawing.Pen (New-Color 54 111 133 93), 4
  $arrowPen = New-Object System.Drawing.Pen (New-Color 58 86 107 72), 5

  $tray = New-RoundedRectPath 64 150 232 74 20
  $g.FillPath($brush, $tray)
  $g.DrawPath($pen, $tray)
  $g.DrawLine($arrowPen, 180, 46, 180, 132)
  $g.DrawLine($arrowPen, 148, 104, 180, 136)
  $g.DrawLine($arrowPen, 212, 104, 180, 136)

  $brush.Dispose()
  $pen.Dispose()
  $arrowPen.Dispose()
  Save-Canvas $canvas 'import-tray.png'
}

function Draw-TrashSoftWarning {
  $canvas = New-Canvas 340 260
  $g = $canvas.Graphics
  $brush = New-Object System.Drawing.SolidBrush (New-Color 40 255 241 237)
  $pen = New-Object System.Drawing.Pen (New-Color 58 201 111 95), 4
  $thinPen = New-Object System.Drawing.Pen (New-Color 38 201 111 95), 2
  $body = New-RoundedRectPath 102 90 136 120 18
  $g.FillPath($brush, $body)
  $g.DrawPath($pen, $body)
  $g.DrawLine($pen, 88, 76, 252, 76)
  $g.DrawLine($thinPen, 136, 112, 136, 190)
  $g.DrawLine($thinPen, 170, 112, 170, 190)
  $g.DrawLine($thinPen, 204, 112, 204, 190)

  $brush.Dispose()
  $pen.Dispose()
  $thinPen.Dispose()
  Save-Canvas $canvas 'trash-soft-warning.png'
}

function Draw-BackupManifest {
  $canvas = New-Canvas 350 310
  $g = $canvas.Graphics
  $paperBrush = New-Object System.Drawing.SolidBrush (New-Color 52 255 253 248)
  $goldPen = New-Object System.Drawing.Pen (New-Color 58 184 148 90), 4
  $sagePen = New-Object System.Drawing.Pen (New-Color 42 86 107 72), 3
  $sheet = New-RoundedRectPath 82 42 184 222 22
  $g.FillPath($paperBrush, $sheet)
  $g.DrawPath($goldPen, $sheet)

  foreach ($y in @(94, 126, 158, 190)) {
    $g.DrawLine($sagePen, 118, $y, 230, $y)
  }
  $g.DrawEllipse($goldPen, 124, 210, 42, 42)
  $g.DrawLine($goldPen, 134, 232, 144, 242)
  $g.DrawLine($goldPen, 144, 242, 158, 220)

  $paperBrush.Dispose()
  $goldPen.Dispose()
  $sagePen.Dispose()
  Save-Canvas $canvas 'backup-manifest-sheet.png'
}

function Draw-DetailPaperEdge {
  $canvas = New-Canvas 240 560
  $g = $canvas.Graphics
  $brush = New-Object System.Drawing.SolidBrush (New-Color 42 247 240 230)
  $pen = New-Object System.Drawing.Pen (New-Color 32 137 114 84), 2
  $path = New-RoundedRectPath 24 20 170 520 26
  $g.FillPath($brush, $path)
  $g.DrawPath($pen, $path)
  for ($y = 70; $y -le 490; $y += 70) {
    $g.DrawLine($pen, 50, $y, 168, $y)
  }

  $brush.Dispose()
  $pen.Dispose()
  Save-Canvas $canvas 'detail-paper-edge.png'
}

Draw-BotanicalBranch
Draw-WashiPaperCorner
Draw-DotIndexGrid
Draw-MagnifierTexture
Draw-FolderOutline
Draw-TagPaperStack
Draw-FilmEdge
Draw-StorageBox
Draw-ImportTray
Draw-TrashSoftWarning
Draw-BackupManifest
Draw-DetailPaperEdge

$manifest = [ordered]@{
  generatedAt = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK')
  strategy = 'transparent-decor-elements'
  note = 'Decorative PNGs only. UI, text, status bars, cards, shadows, and controls stay in React Native code and tokens.'
  elements = @(
    'botanical-branch.png',
    'washi-paper-corner.png',
    'dot-index-grid.png',
    'magnifier-texture.png',
    'archive-folder-outline.png',
    'tag-paper-stack.png',
    'film-edge.png',
    'storage-box-outline.png',
    'import-tray.png',
    'trash-soft-warning.png',
    'backup-manifest-sheet.png',
    'detail-paper-edge.png'
  )
}

$manifestPath = Join-Path $outputDir 'manifest.background-elements.json'
$manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestPath -Encoding UTF8
Write-Host "Generated Japanese Fresh background elements in $outputDir"
