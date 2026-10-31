<#
  Pakti runtime control panel (WinForms + tray icon).

  Dipakai untuk menyalakan/mematikan/merestart backend Pakti (port 3001) dan
  Cloudflare Tunnel tanpa perintah manual. Butuh hak admin karena task
  "Pakti Backend" terdaftar dengan RunLevel Highest, jadi prosesnya hanya bisa
  dihentikan dari sesi elevated. Skrip ini meminta elevasi sendiri saat dibuka.

  Cara pakai:
    double-click scripts\runtime\pakti-control.bat
  atau:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\runtime\pakti-control.ps1

  Switch:
    -NoElevate  jalankan tanpa minta UAC (tombol Stop/Restart bisa gagal)
    -StartHidden mulai dalam tray saja
#>
param(
  [switch] $NoElevate,
  [switch] $StartHidden
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$LogDir = Join-Path $ProjectRoot '.cache\runtime-logs'
$BackendTask = 'Pakti Backend'
$TunnelTask = 'Pakti Cloudflare Tunnel'
$BackendScript = Join-Path $PSScriptRoot 'start-backend.ps1'
$TunnelScript = Join-Path $PSScriptRoot 'start-tunnel.ps1'
$LocalHealth = 'http://127.0.0.1:3001/api/health'
$TunnelHealth = 'https://api-pakti.zakado.id/api/health'

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not $NoElevate -and -not (Test-IsAdmin)) {
  $shellPath = (Get-Process -Id $PID).Path
  $relaunchArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
  if ($StartHidden) { $relaunchArgs += '-StartHidden' }
  Start-Process -FilePath $shellPath -ArgumentList $relaunchArgs -Verb RunAs -WindowStyle Hidden
  exit 0
}

# ---------- status helpers ----------

function Get-PortOwner {
  param([int] $Port = 3001)
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $conn) { return $null }
  return [int] $conn.OwningProcess
}

function Get-TunnelProcess {
  # CommandLine hanya terbaca dari sesi elevated; kalau tidak terbaca (panel
  # dijalankan tanpa admin), fallback ke nama proses supaya status tidak
  # salah lapor "mati".
  $match = Get-CimInstance Win32_Process -Filter "name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*tunnel*' -and $_.CommandLine -like '*run*' } |
    Select-Object -First 1
  if ($null -ne $match) { return $match }

  $fallback = Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $fallback) { return $null }
  return [pscustomobject]@{ ProcessId = $fallback.Id; CommandLine = $null }
}

function Get-TaskState {
  param([string] $Name)
  $task = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  if ($null -eq $task) { return 'tidak terdaftar' }
  return $task.State.ToString().ToLower()
}

function Begin-Probe {
  param([string] $Url, [int] $TimeoutSec)
  $ps = [powershell]::Create()
  $ps.AddScript({
      param($u, $t)
      try { return (Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec $t -ErrorAction Stop).StatusCode }
      catch { return 0 }
    }).AddArgument($Url).AddArgument($TimeoutSec) | Out-Null
  return @{ Ps = $ps; AR = $ps.BeginInvoke() }
}

function Complete-Probe {
  param($Probe)
  if ($null -eq $Probe -or -not $Probe.AR.IsCompleted) { return $null }
  try { $result = $Probe.Ps.EndInvoke($Probe.AR) } catch { $result = 0 }
  $Probe.Ps.Dispose()
  # EndInvoke mengembalikan PSDataCollection (bukan [array]), jadi ambil elemen
  # pertama lalu paksa jadi int agar perbandingan kesehatan tidak melempar.
  $first = @($result | Select-Object -First 1)
  if ($first.Count -eq 0) { return 0 }
  try { return [int] $first[0] } catch { return 0 }
}

function Get-LogTail {
  param([string] $FileName, [int] $Lines = 100)
  $path = Join-Path $LogDir $FileName
  if (-not (Test-Path -LiteralPath $path)) { return "(belum ada log: $FileName)" }
  try {
    $seeked = $false
    $fs = [System.IO.FileStream]::new($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
      $window = 90000
      if ($fs.Length -gt $window) {
        $fs.Seek(($fs.Length - $window), [System.IO.SeekOrigin]::Begin) | Out-Null
        $seeked = $true
      }
      $reader = [System.IO.StreamReader]::new($fs)
      try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
    } finally { $fs.Dispose() }

    if (-not $text) { return '(log kosong)' }
    # Nama variabel tidak boleh "lines" lagi: PowerShell case-insensitive,
    # parameter $Lines akan tertimpa dan merusak [Math]::Min.
    $rows = @($text -split "`r?`n")
    if ($seeked -and $rows.Count -gt 1) { $rows = @($rows[1..($rows.Count - 1)]) }
    $take = [Math]::Min($Lines, $rows.Count)
    return ($rows[($rows.Count - $take)..($rows.Count - 1)] -join [Environment]::NewLine)
  } catch {
    return "Gagal baca log ${FileName}: $($_.Exception.Message)"
  }
}

# ---------- actions ----------

$script:activity = New-Object System.Collections.Generic.Queue[string]

function Add-Activity {
  param([string] $Message)
  $script:activity.Enqueue("[$((Get-Date).ToString('HH:mm:ss'))] $Message")
  while ($script:activity.Count -gt 60) { $script:activity.Dequeue() | Out-Null }
}

function Wait-ForPort {
  param([int] $Port, [switch] $WantFree, [int] $Seconds = 25)
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    $owner = Get-PortOwner -Port $Port
    if (($WantFree.IsPresent -and $null -eq $owner) -or (-not $WantFree.IsPresent -and $null -ne $owner)) { return $owner }
    Start-Sleep -Milliseconds 500
  }
  return $null
}

function Stop-ProcessTree {
  param([int] $ProcessId)
  & taskkill.exe /PID $ProcessId /T /F 2>&1 | Out-Null
}

function Stop-Backend {
  param([string] $Why = 'stop')
  $owner = Get-PortOwner
  if ($null -ne $owner) {
    Stop-ScheduledTask -TaskName $BackendTask -ErrorAction SilentlyContinue
    Stop-ProcessTree -ProcessId $owner
    if ($null -eq (Wait-ForPort -Port 3001 -WantFree -Seconds 8)) {
      $still = Get-PortOwner
      if ($null -ne $still) {
        Stop-ProcessTree -ProcessId $still
        Wait-ForPort -Port 3001 -WantFree -Seconds 8 | Out-Null
      }
    }
    Add-Activity "Backend dimatikan ($Why, PID $owner)."
  } else {
    Stop-ScheduledTask -TaskName $BackendTask -ErrorAction SilentlyContinue
    Add-Activity "Backend sudah mati ($Why)."
  }
}

function Start-Backend {
  param([string] $Why = 'start')
  if ($null -ne (Get-PortOwner)) { Add-Activity "Backend sudah jalan, tidak dimulai ganda."; return }
  if (Get-ScheduledTask -TaskName $BackendTask -ErrorAction SilentlyContinue) {
    Start-ScheduledTask -TaskName $BackendTask -ErrorAction SilentlyContinue
  } else {
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$BackendScript`"") -WindowStyle Hidden
  }
  $owner = Wait-ForPort -Port 3001 -Seconds 30
  if ($null -ne $owner) { Add-Activity "Backend hidup lagi ($Why, PID $owner)." }
  else { Add-Activity "Backend belum listen di 3001 setelah 30 detik ($Why) - cek log backend.err.log." }
}

function Restart-Backend {
  Stop-Backend -Why 'restart'
  Start-Backend -Why 'restart'
}

function Stop-Tunnel {
  param([string] $Why = 'stop')
  Stop-ScheduledTask -TaskName $TunnelTask -ErrorAction SilentlyContinue

  $pids = @()
  $pids += Get-CimInstance Win32_Process -Filter "name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
    ForEach-Object { [int] $_.ProcessId }
  $pids += (Get-Process -Name 'cloudflared' -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
  $pids = $pids | Sort-Object -Unique

  $killed = 0
  foreach ($candidate in $pids) {
    Stop-ProcessTree -ProcessId $candidate
    $killed++
  }

  if ($killed -gt 0) { Add-Activity "Cloudflare Tunnel dimatikan ($Why, PID $($pids -join ', '))." }
  else { Add-Activity "Cloudflare Tunnel sudah mati ($Why)." }
  $script:publicHealth = $null
}

function Start-Tunnel {
  param([string] $Why = 'start')
  if ($null -ne (Get-TunnelProcess)) { Add-Activity "Tunnel sudah jalan, tidak dimulai ganda."; return }
  if (Get-ScheduledTask -TaskName $TunnelTask -ErrorAction SilentlyContinue) {
    Start-ScheduledTask -TaskName $TunnelTask -ErrorAction SilentlyContinue
  } else {
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$TunnelScript`"") -WindowStyle Hidden
  }
  $deadline = (Get-Date).AddSeconds(25)
  while ((Get-Date) -lt $deadline -and $null -eq (Get-TunnelProcess)) { Start-Sleep -Milliseconds 500 }
  if ($null -ne (Get-TunnelProcess)) { Add-Activity "Cloudflare Tunnel hidup lagi ($Why)." }
  else { Add-Activity "Tunnel belum terlihat setelah 25 detik ($Why) - cek log tunnel.log." }
}

function Restart-Tunnel {
  Stop-Tunnel -Why 'restart'
  Start-Tunnel -Why 'restart'
}

# ---------- icons ----------

function New-TrayIcon {
  param([string] $Hex, [string] $Glyph)
  $bmp = New-Object System.Drawing.Bitmap(32, 32)
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $gfx.Clear([System.Drawing.Color]::Transparent)
  $fill = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($Hex))
  $gfx.FillEllipse($fill, 3, 3, 26, 26)
  $fill.Dispose()
  $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(200, 30, 30, 30), 2)
  $gfx.DrawEllipse($pen, 3, 3, 26, 26)
  $pen.Dispose()
  $font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
  $text = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $fmt = [System.Drawing.StringFormat]::new()
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $gfx.DrawString($Glyph, $font, $text, (New-Object System.Drawing.RectangleF(0, 0, 32, 32)), $fmt)
  $fmt.Dispose()
  $text.Dispose()
  $font.Dispose()
  $gfx.Dispose()
  return @{ Bmp = $bmp; Icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon()) }
}

$script:iconUp = New-TrayIcon -Hex '#16A34A' -Glyph 'P'
$script:iconWarn = New-TrayIcon -Hex '#D97706' -Glyph '!'
$script:iconDown = New-TrayIcon -Hex '#DC2626' -Glyph 'x'

# ---------- form ----------

$script:tick = 0
$script:backendHealth = $null
$script:publicHealth = $null
$script:probeLocal = $null
$script:probePublic = $null
$script:exitRequested = $false

function New-Label {
  param([string] $Text, [int] $X, [int] $Y, [int] $W = 610, [int] $H = 20, [switch] $Bold)
  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Text
  $label.Location = New-Object System.Drawing.Point($X, $Y)
  $label.Size = New-Object System.Drawing.Size($W, $H)
  if ($Bold) { $label.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold) }
  return $label
}

function New-Button {
  param([string] $Text, [int] $X, [int] $Y, [int] $W = 104, [int] $H = 28)
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.Location = New-Object System.Drawing.Point($X, $Y)
  $button.Size = New-Object System.Drawing.Size($W, $H)
  return $button
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Pakti Control'
$form.ClientSize = New-Object System.Drawing.Size(676, 646)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false
$form.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$form.Icon = $script:iconUp.Icon

$overallLabel = New-Label 'Menunggu status...' 14 12 640 22 -Bold
$form.Controls.Add($overallLabel)

$backendGroup = New-Object System.Windows.Forms.GroupBox
$backendGroup.Text = 'Backend Pakti (port 3001, tunnel api-pakti.zakado.id)'
$backendGroup.Location = New-Object System.Drawing.Point(12, 40)
$backendGroup.Size = New-Object System.Drawing.Size(652, 116)
$form.Controls.Add($backendGroup)

$backendStateLabel = New-Label 'Backend: -' 16 28 620 20
$backendDetailLabel = New-Label 'Task: - | Health: -' 16 52 620 20
$btnBackendStart = New-Button 'Mulai' 16 80
$btnBackendStop = New-Button 'Hentikan' 126 80
$btnBackendRestart = New-Button 'Restart' 236 80
$backendGroup.Controls.Add($backendStateLabel)
$backendGroup.Controls.Add($backendDetailLabel)
$backendGroup.Controls.Add($btnBackendStart)
$backendGroup.Controls.Add($btnBackendStop)
$backendGroup.Controls.Add($btnBackendRestart)

$tunnelGroup = New-Object System.Windows.Forms.GroupBox
$tunnelGroup.Text = 'Cloudflare Tunnel (api-pakti.zakado.id -> 127.0.0.1:3001)'
$tunnelGroup.Location = New-Object System.Drawing.Point(12, 166)
$tunnelGroup.Size = New-Object System.Drawing.Size(652, 116)
$form.Controls.Add($tunnelGroup)

$tunnelStateLabel = New-Label 'Tunnel: -' 16 28 620 20
$tunnelDetailLabel = New-Label 'Task: - | Health publik: -' 16 52 620 20
$btnTunnelStart = New-Button 'Mulai' 16 80
$btnTunnelStop = New-Button 'Hentikan' 126 80
$btnTunnelRestart = New-Button 'Restart' 236 80
$tunnelGroup.Controls.Add($tunnelStateLabel)
$tunnelGroup.Controls.Add($tunnelDetailLabel)
$tunnelGroup.Controls.Add($btnTunnelStart)
$tunnelGroup.Controls.Add($btnTunnelStop)
$tunnelGroup.Controls.Add($btnTunnelRestart)

$logCaption = New-Label 'Log (100 baris terakhir)' 12 292 300 18
$form.Controls.Add($logCaption)

$logCombo = New-Object System.Windows.Forms.ComboBox
$logCombo.Location = New-Object System.Drawing.Point(12, 312)
$logCombo.Size = New-Object System.Drawing.Size(240, 24)
$logCombo.DropDownStyle = 'DropDownList'
@('backend.out.log', 'backend.err.log', 'backend.log', 'tunnel.log', 'tunnel.err.log') | ForEach-Object { $logCombo.Items.Add($_) | Out-Null }
$logCombo.SelectedIndex = 0
$form.Controls.Add($logCombo)

$btnLogRefresh = New-Button 'Muat ulang log' 262 310 120 26
$form.Controls.Add($btnLogRefresh)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Location = New-Object System.Drawing.Point(12, 342)
$logBox.Size = New-Object System.Drawing.Size(652, 232)
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = 'Vertical'
$logBox.WordWrap = $false
$logBox.Font = New-Object System.Drawing.Font('Consolas', 8.5)
$form.Controls.Add($logBox)

$btnStopAll = New-Button 'Matikan Semua' 12 584 130 30
$btnOpenLogs = New-Button 'Buka Folder Log' 152 584 140 30
$btnRefreshNow = New-Button 'Segarkan' 302 584 100 30
$btnMinimize = New-Button 'Sembunyikan ke Tray' 412 584 150 30
$form.Controls.Add($btnStopAll)
$form.Controls.Add($btnOpenLogs)
$form.Controls.Add($btnRefreshNow)
$form.Controls.Add($btnMinimize)

$actionLabel = New-Label 'Aktivitas: -' 12 620 652 18
$form.Controls.Add($actionLabel)

# ---------- tray ----------

$trayMenu = New-Object System.Windows.Forms.ContextMenuStrip
$null = $trayMenu.Items.Add('Buka Panel', $null, [System.EventHandler] { Show-Panel })
$null = $trayMenu.Items.Add('Restart Backend', $null, [System.EventHandler] { Restart-Backend; Update-Status; Refresh-Log })
$null = $trayMenu.Items.Add('Restart Tunnel', $null, [System.EventHandler] { Restart-Tunnel; Update-Status; Refresh-Log })
$null = $trayMenu.Items.Add('-')
$null = $trayMenu.Items.Add('Matikan Semua', $null, [System.EventHandler] { Stop-All })
$null = $trayMenu.Items.Add('Keluar', $null, [System.EventHandler] { Exit-Panel })

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = $script:iconUp.Icon
$notifyIcon.Text = 'Pakti Control'
$notifyIcon.ContextMenuStrip = $trayMenu
$notifyIcon.Visible = $true
$script:notifyIcon = $notifyIcon

# ---------- behavior ----------

function Update-Status {
  $backendPid = Get-PortOwner
  $backendTaskState = Get-TaskState -Name $BackendTask
  $tunnelProc = Get-TunnelProcess
  $tunnelTaskState = Get-TaskState -Name $TunnelTask

  if ($null -ne $backendPid) {
    $backendStateLabel.Text = "Backend: hidup (PID $backendPid)"
    $backendStateLabel.ForeColor = [System.Drawing.Color]::FromArgb(22, 132, 66)
  } else {
    $backendStateLabel.Text = 'Backend: mati (port 3001 tidak ada yang listen)'
    $backendStateLabel.ForeColor = [System.Drawing.Color]::FromArgb(180, 35, 35)
  }

  $localHealthText = if ($null -eq $script:backendHealth) { 'sedang dicek' } elseif ([int] $script:backendHealth -eq 200) { '200 ok' } else { "$script:backendHealth (gagal)" }
  $backendDetailLabel.Text = "Task: $backendTaskState | Health lokal: $localHealthText | Elevated: $(Test-IsAdmin)"
  $backendDetailLabel.ForeColor = if ([int] $script:backendHealth -eq 200) { [System.Drawing.Color]::FromArgb(22, 132, 66) } else { [System.Drawing.Color]::DarkOrange }

  if ($null -ne $tunnelProc) {
    $tunnelStateLabel.Text = "Tunnel: hidup (cloudflared PID $($tunnelProc.ProcessId))"
    $tunnelStateLabel.ForeColor = [System.Drawing.Color]::FromArgb(22, 132, 66)
  } else {
    $tunnelStateLabel.Text = 'Tunnel: mati (cloudflared tidak berjalan)'
    $tunnelStateLabel.ForeColor = [System.Drawing.Color]::FromArgb(180, 35, 35)
  }

  $publicHealthText = if ($null -eq $script:publicHealth) { 'sedang dicek' } elseif ([int] $script:publicHealth -eq 200) { '200 ok' } else { "$script:publicHealth (gagal)" }
  $tunnelDetailLabel.Text = "Task: $tunnelTaskState | Health publik: $publicHealthText"
  $tunnelDetailLabel.ForeColor = if ([int] $script:publicHealth -eq 200) { [System.Drawing.Color]::FromArgb(22, 132, 66) } else { [System.Drawing.Color]::DarkOrange }

  $backendOk = ($null -ne $backendPid) -and ([int] $script:backendHealth -eq 200)
  $tunnelOk = ($null -ne $tunnelProc) -and ([int] $script:publicHealth -eq 200)
  $runningOnly = ($null -ne $backendPid) -and ($null -ne $tunnelProc)

  if ($backendOk -and $tunnelOk) {
    $overallLabel.Text = 'Status: SEMUA HIDUP - backend dan tunnel public siap dipakai.'
    $overallLabel.ForeColor = [System.Drawing.Color]::FromArgb(22, 132, 66)
    $notifyIcon.Icon = $script:iconUp.Icon
    $notifyBalloonType = [System.Windows.Forms.ToolTipIcon]::Info
  } elseif ($runningOnly) {
    $overallLabel.Text = 'Status: PROSES HIDUP tapi health belum 200 - tunggu 15 detik atau cek log.'
    $overallLabel.ForeColor = [System.Drawing.Color]::DarkOrange
    $notifyIcon.Icon = $script:iconWarn.Icon
    $notifyBalloonType = [System.Windows.Forms.ToolTipIcon]::Warning
  } else {
    $overallLabel.Text = 'Status: ADA YANG MATI - frontend/mobile tidak bisa simpan atau kirim bukti.'
    $overallLabel.ForeColor = [System.Drawing.Color]::FromArgb(180, 35, 35)
    $notifyIcon.Icon = $script:iconDown.Icon
    $notifyBalloonType = [System.Windows.Forms.ToolTipIcon]::Error
  }

  $notifyIcon.Text = "Pakti | backend $(if ($null -ne $backendPid) {'hidup'} else {'mati'}) | tunnel $(if ($null -ne $tunnelProc) {'hidup'} else {'mati'})"

  if ($script:activity.Count -gt 0) {
    $actionLabel.Text = 'Aktivitas: ' + (($script:activity.ToArray() | Select-Object -Last 2) -join '  ||  ')
  }
  $script:lastBalloonType = $notifyBalloonType
}

function Refresh-Log {
  $selected = $logCombo.SelectedItem
  if (-not $selected) { return }
  $tail = Get-LogTail -FileName ([string] $selected) -Lines 100
  $logBox.Text = $tail
  $logBox.SelectionStart = $logBox.Text.Length
  $logBox.ScrollToCaret()
}

function Show-Panel {
  $form.Show()
  if ($form.WindowState -eq 'Minimized') { $form.WindowState = 'Normal' }
  $form.Activate()
}

function Hide-ToTray {
  $form.Hide()
}

function Exit-Panel {
  $script:exitRequested = $true
  $notifyIcon.Visible = $false
  $form.Close()
}

function Stop-All {
  $answer = [System.Windows.Forms.MessageBox]::Show(
    'Matikan backend Pakti DAN Cloudflare Tunnel? Frontend/mobile akan berhenti bisa simpan dan kirim bukti packing.',
    'Matikan Semua',
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Warning)
  if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) { return }
  Stop-Backend -Why 'stop-all'
  Stop-Tunnel -Why 'stop-all'
  Update-Status
  Refresh-Log
}

$btnBackendStart.Add_Click({ Start-Backend -Why 'tombol'; Update-Status; Refresh-Log })
$btnBackendStop.Add_Click({ Stop-Backend -Why 'tombol'; Update-Status; Refresh-Log })
$btnBackendRestart.Add_Click({ Restart-Backend; Update-Status; Refresh-Log })
$btnTunnelStart.Add_Click({ Start-Tunnel -Why 'tombol'; Update-Status; Refresh-Log })
$btnTunnelStop.Add_Click({ Stop-Tunnel -Why 'tombol'; Update-Status; Refresh-Log })
$btnTunnelRestart.Add_Click({ Restart-Tunnel; Update-Status; Refresh-Log })
$btnStopAll.Add_Click({ Stop-All })
$btnLogRefresh.Add_Click({ Refresh-Log })
$btnRefreshNow.Add_Click({ Update-Status; Refresh-Log })
$btnMinimize.Add_Click({ Hide-ToTray })
$logCombo.Add_SelectedIndexChanged({ Refresh-Log })
$notifyIcon.Add_MouseDoubleClick({ Show-Panel })

$form.Add_Closing({
    param($sender, $e)
    if (-not $script:exitRequested) {
      $e.Cancel = $true
      Hide-ToTray
      $notifyIcon.ShowBalloonTip(2500, 'Pakti Control', 'Panel disembunyikan ke tray. Klik kanan ikon untuk keluar.', $script:lastBalloonType)
    }
  })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({
    try {
      $script:tick++

      if ($null -ne $script:probeLocal) {
        $result = Complete-Probe $script:probeLocal
        if ($null -ne $result) { $script:backendHealth = $result; $script:probeLocal = $null }
      } elseif (($script:tick % 3) -eq 0) {
        $script:probeLocal = Begin-Probe -Url $LocalHealth -TimeoutSec 3
      }

      if ($null -ne $script:probePublic) {
        $result = Complete-Probe $script:probePublic
        if ($null -ne $result) { $script:publicHealth = $result; $script:probePublic = $null }
      } elseif (($script:tick % 4) -eq 0) {
        $script:probePublic = Begin-Probe -Url $TunnelHealth -TimeoutSec 6
      }

      Update-Status
      if ($form.Visible -and ($script:tick % 6) -eq 0) { Refresh-Log }
    } catch {
      # Jangan biarkan error diam membuat panel tampak beku.
      $overallLabel.Text = "Status: error di timer - $($_.Exception.Message)"
      $overallLabel.ForeColor = [System.Drawing.Color]::FromArgb(180, 35, 35)
    }
  })
$timer.Start()

Update-Status
Refresh-Log
if ($StartHidden) { Hide-ToTray }
[System.Windows.Forms.Application]::Run($form)
$timer.Dispose()
$notifyIcon.Dispose()
@($script:iconUp, $script:iconWarn, $script:iconDown) | ForEach-Object { $_.Icon.Dispose(); $_.Bmp.Dispose() }

