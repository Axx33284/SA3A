# End-to-end test of IslandHelper.exe on a real Windows machine (GitHub Actions).
# Run with Windows PowerShell 5.1 (it needs the built-in WinRT projection):
#   powershell -File scripts\ci-helper-test.ps1 -Helper native\IslandHelper\bin\Release\net48\IslandHelper.exe
param([Parameter(Mandatory = $true)][string]$Helper)
$ErrorActionPreference = 'Stop'
$Helper = (Resolve-Path $Helper).Path
$results = New-Object System.Collections.ArrayList
function Check($name, $ok, $hard) {
  $tag = if ($ok) { 'PASS' } elseif ($hard) { 'FAIL' } else { 'WARN' }
  [void]$results.Add([pscustomobject]@{ Check = $name; Result = $tag })
  Write-Host "[$tag] $name"
}

# ---------- 1. self-test mode ----------
$lines = & $Helper --selftest
$msgs = @($lines | Where-Object { $_ -match '^\{' } | ForEach-Object { $_ | ConvertFrom-Json })
Check 'helper starts and says hello' (@($msgs | Where-Object type -eq 'hello').Count -eq 1) $true
$self = $msgs | Where-Object type -eq 'selftest' | Select-Object -First 1
Check 'self-test summary is printed' ($null -ne $self) $true
if ($self) { Write-Host ('self-test: ' + ($self | ConvertTo-Json -Depth 5 -Compress)) }

# ---------- 2. interactive session ----------
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $Helper
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$proc = [System.Diagnostics.Process]::Start($psi)
$script:pending = $null
$script:seen = @{}
$script:last = @{}

function Next-Message([int]$ms) {
  if ($null -eq $script:pending) { $script:pending = $proc.StandardOutput.ReadLineAsync() }
  if (-not $script:pending.Wait($ms)) { return $null }
  $line = $script:pending.Result; $script:pending = $null
  if ($null -eq $line -or -not $line.StartsWith('{')) { return $null }
  $m = $line | ConvertFrom-Json
  $script:seen[$m.type] = $true
  $script:last[$m.type] = $m
  if ($m.type -ne 'thumb') { Write-Host ('  <- ' + $(if ($line.Length -gt 400) { $line.Substring(0, 400) + '...' } else { $line })) }
  else { Write-Host ('  <- thumb ' + $m.key + ' (' + $m.data.Length + ' chars)') }
  return $m
}
function Wait-For([scriptblock]$pred, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    $m = Next-Message 500
    if ($null -ne $m -and (& $pred $m)) { return $m }
  }
  return $null
}
function Send($obj) { $proc.StandardInput.WriteLine(($obj | ConvertTo-Json -Compress)); $proc.StandardInput.Flush() }

Check 'hello' ($null -ne (Wait-For { param($m) $m.type -eq 'hello' } 10)) $true
Send @{ cmd = 'ping' }
Check 'answers commands (ping/pong)' ($null -ne (Wait-For { param($m) $m.type -eq 'pong' } 10)) $true
$st = if ($script:seen['notif-status']) { $script:last['notif-status'] } else { Wait-For { param($m) $m.type -eq 'notif-status' } 30 }
Check ('notification source reported: ' + $(if ($st) { "$($st.mode) $($st.detail)" } else { 'none' })) ($null -ne $st) $true
$null = Wait-For { param($m) $script:seen['power'] -and $script:seen['fullscreen'] } 10
Check 'battery / power status' ($script:seen['power'] -eq $true) $true
Check 'fullscreen detection' ($script:seen['fullscreen'] -eq $true) $true
Check 'audio endpoint (volume)' ($script:seen['volume'] -eq $true) $false
Check 'privacy indicators' ($script:seen['privacy'] -eq $true) $true

# ---------- 3. real media session (WinRT MediaPlayer in another process) ----------
$wav = Join-Path $env:TEMP 'winisland-ci.wav'
$rate = 8000; $secs = 120; $n = $rate * $secs
$fs = [System.IO.File]::Create($wav); $bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([Text.Encoding]::ASCII.GetBytes('RIFF')); $bw.Write([int](36 + $n * 2)); $bw.Write([Text.Encoding]::ASCII.GetBytes('WAVEfmt '))
$bw.Write([int]16); $bw.Write([int16]1); $bw.Write([int16]1); $bw.Write([int]$rate); $bw.Write([int]($rate * 2)); $bw.Write([int16]2); $bw.Write([int16]16)
$bw.Write([Text.Encoding]::ASCII.GetBytes('data')); $bw.Write([int]($n * 2))
$buf = New-Object byte[] ($n * 2)   # silence is enough for a media session
$bw.Write($buf); $bw.Close()

$player = @"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
`$null = [Windows.Media.Playback.MediaPlayer, Windows.Media.Playback, ContentType = WindowsRuntime]
`$null = [Windows.Media.Core.MediaSource, Windows.Media.Core, ContentType = WindowsRuntime]
`$p = New-Object Windows.Media.Playback.MediaPlayer
`$p.Source = [Windows.Media.Core.MediaSource]::CreateFromUri([Uri]'$wav')
`$u = `$p.SystemMediaTransportControls.DisplayUpdater
`$u.Type = [Windows.Media.MediaPlaybackType]::Music
`$u.MusicProperties.Title = 'WinIsland CI Song'
`$u.MusicProperties.Artist = 'GitHub Actions'
`$u.Update()
`$p.Play()
Start-Sleep -Seconds 100
"@
$playerFile = Join-Path $env:TEMP 'winisland-player.ps1'
Set-Content -Path $playerFile -Value $player -Encoding UTF8
$pl = Start-Process powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $playerFile -PassThru -WindowStyle Hidden

$song = Wait-For { param($m) $m.type -eq 'media' -and @($m.sessions | Where-Object { $_.title -eq 'WinIsland CI Song' }).Count -gt 0 } 40
Check 'sees a playing media session (title, artist)' ($null -ne $song) $false
if ($song) {
  $s = @($song.sessions | Where-Object { $_.title -eq 'WinIsland CI Song' })[0]
  Write-Host "  session id=$($s.id) status=$($s.status) duration=$($s.duration) canSeek=$($s.canSeek)"
  Check 'artist is read' ($s.artist -eq 'GitHub Actions') $true
  $null = Wait-For { param($m) $m.type -eq 'media' -and @($m.sessions | Where-Object { $_.id -eq $s.id -and $_.status -eq 'playing' }).Count -gt 0 } 15
  Send @{ cmd = 'media'; id = $s.id; action = 'pause' }
  $p1 = Wait-For { param($m) $m.type -eq 'media' -and @($m.sessions | Where-Object { $_.id -eq $s.id -and $_.status -eq 'paused' }).Count -gt 0 } 15
  Check 'pause command pauses the player' ($null -ne $p1) $true
  Send @{ cmd = 'media'; id = $s.id; action = 'toggle' }
  $p2 = Wait-For { param($m) $m.type -eq 'media' -and @($m.sessions | Where-Object { $_.id -eq $s.id -and $_.status -eq 'playing' }).Count -gt 0 } 15
  Check 'play/pause toggle resumes the player' ($null -ne $p2) $true
  if ($s.canSeek -and $s.duration -gt 60) {
    Send @{ cmd = 'media'; id = $s.id; action = 'seek'; position = 60 }
    $p3 = Wait-For { param($m) $m.type -eq 'media' -and @($m.sessions | Where-Object { $_.id -eq $s.id -and $_.position -ge 55 -and $_.position -le 80 }).Count -gt 0 } 15
    Check 'seek moves the playback position' ($null -ne $p3) $true
  } else { Check 'seek (player did not report a seekable timeline)' $false $false }
}
try { Stop-Process -Id $pl.Id -Force } catch { }

# ---------- 4. real toast notification ----------
try {
  $null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  $null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>WinIsland CI toast</text><text>Hello from GitHub Actions</text></binding></visual></toast>")
  $aumid = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($aumid).Show((New-Object Windows.UI.Notifications.ToastNotification $xml))
  $toast = Wait-For { param($m) $m.type -eq 'notification' -and $m.title -eq 'WinIsland CI toast' } 20
  Check 'mirrors a real Windows toast notification' ($null -ne $toast) $false
  if ($toast) { Check 'toast body and app are read' ($toast.body -eq 'Hello from GitHub Actions' -and $toast.appId) $true }
} catch { Check ('toast could not be shown on this machine: ' + $_.Exception.Message) $false $false }

# ---------- 5. shut down cleanly when the UI goes away ----------
$proc.StandardInput.Close()
Check 'exits when its parent closes stdin' ($proc.WaitForExit(10000)) $true
if (-not $proc.HasExited) { $proc.Kill() }

$table = ($results | ForEach-Object { "| $($_.Check) | $($_.Result) |" }) -join "`n"
if ($env:GITHUB_STEP_SUMMARY) { Add-Content $env:GITHUB_STEP_SUMMARY "### IslandHelper on Windows`n| Check | Result |`n|---|---|`n$table`n" }
$failed = @($results | Where-Object Result -eq 'FAIL')
if ($failed.Count) { throw "$($failed.Count) helper check(s) failed" }
Write-Host 'Helper checks done'
