# Installs (or updates) the BuildSupply automatic backup on this computer.
#
#   powershell -ExecutionPolicy Bypass -File scripts\backup\install-backup.ps1
#
# Copies the backup scripts, the database structure (schema.sql and every
# migration, for the restore drill) and the Supabase CLI's link to the live
# project into C:\Users\<you>\BuildSupply Backup System\program - OUTSIDE the
# Git working tree. The scheduled tasks run that copy, so checking out another branch,
# editing a script or pulling a change can never alter what runs tonight.
# Only running this installer again does, and it records the SHA-256 of every
# file it copies so any later change is reported by the health check.
#
# Registers three tasks, running as you, only while you are signed in (so no
# password is stored anywhere):
#   BuildSupply Backup               daily 13:00 and 21:00
#   BuildSupply Restore Drill        Sundays 21:30
#   BuildSupply Backup Health Check  every 4 hours, and 10 minutes after sign-in
# "Run as soon as possible after a missed start" is on for all three, so a
# laptop that was off at the time catches up when it is next on.
#
# It does not touch any existing backup, the old "BuildSupply Daily Backup"
# task, or the live database.

param([switch]$NoTasks)

$ErrorActionPreference = 'Stop'
$Inv = [System.Globalization.CultureInfo]::InvariantCulture
$src  = $PSScriptRoot
$repo = (Resolve-Path (Join-Path $src '..\..')).Path
# Deliberately NOT under %LOCALAPPDATA%. Installed from inside a packaged
# (MSIX) app - such as a terminal in the Claude desktop app - Windows quietly
# redirects writes there into the app's private storage: the files looked
# installed, but Task Scheduler could not see them at all, and every scheduled
# run failed (found 2026-09-23). The user profile folder is not redirected.
$base = Join-Path $env:USERPROFILE 'BuildSupply Backup System'
$dest = Join-Path $base 'program'
$staging = Join-Path $base ('program-installing-' + (Get-Date).ToString('yyyyMMddHHmmss', $Inv))
$previous = Join-Path $base 'program-previous'
$outRoot = Join-Path $env:USERPROFILE 'OneDrive\BuildSupply Verified Backups'

$scripts = @('backup-lib.ps1', 'run-backup.ps1', 'restore-drill.ps1', 'backup-health.ps1',
             'backup-tool.js', 'restore-from-backup.mjs', 'restore-logins.mjs', 'drill-shim.sql')
foreach ($f in $scripts) { if (-not (Test-Path (Join-Path $src $f))) { throw ('missing ' + $f + ' next to the installer') } }
foreach ($f in @('supabase\schema.sql', 'supabase\migrations', 'supabase\config.toml', 'supabase\.temp\project-ref')) {
  if (-not (Test-Path (Join-Path $repo $f))) { throw ('missing ' + $f + ' in the project - run this from the BuildSupply repo') }
}

# The programs this depends on, found now and written into config.json, so
# the scheduled tasks never depend on PATH being set up the same way.
$node = (Get-Command node.exe -ErrorAction Stop).Source
$cli = Join-Path $env:APPDATA 'npm\supabase.cmd'
if (-not (Test-Path $cli)) { $cli = (Get-Command supabase.cmd -ErrorAction Stop).Source }
$dockerCmd = Get-Command docker.exe -ErrorAction SilentlyContinue
$docker = if ($dockerCmd) { $dockerCmd.Source } else { 'docker' }
$dockerDesktop = @((Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'),
                   (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')) | Where-Object { Test-Path $_ } | Select-Object -First 1
$projectRef = ([System.IO.File]::ReadAllText((Join-Path $repo 'supabase\.temp\project-ref'))).Trim()
if ($projectRef -notmatch '^[a-z]{20}$') { throw ('unexpected project ref: ' + $projectRef) }

# Never swap files under a run that is in progress.
$locks = @()
foreach ($name in @('Local\BuildSupplyBackupRun', 'Local\BuildSupplyRestoreDrill')) {
  $m = New-Object System.Threading.Mutex($false, $name)
  if (-not $m.WaitOne(0)) { foreach ($l in $locks) { $l.ReleaseMutex() }; throw 'a backup or drill is running right now - try again in a few minutes' }
  $locks += $m
}

try {
  New-Item -ItemType Directory -Force -Path $staging | Out-Null
  foreach ($f in $scripts) { Copy-Item -LiteralPath (Join-Path $src $f) -Destination $staging }
  New-Item -ItemType Directory -Force -Path (Join-Path $staging 'schema\migrations') | Out-Null
  Copy-Item -LiteralPath (Join-Path $repo 'supabase\schema.sql') -Destination (Join-Path $staging 'schema')
  Copy-Item -Path (Join-Path $repo 'supabase\migrations\*.sql') -Destination (Join-Path $staging 'schema\migrations')
  # The CLI's link to the live project: which project, and how to reach it.
  # No password or token is in these files; the CLI keeps its login elsewhere.
  New-Item -ItemType Directory -Force -Path (Join-Path $staging 'supabase\.temp') | Out-Null
  Copy-Item -LiteralPath (Join-Path $repo 'supabase\config.toml') -Destination (Join-Path $staging 'supabase')
  foreach ($t in @('project-ref', 'pooler-url', 'postgres-version', 'linked-project.json')) {
    $p = Join-Path $repo ('supabase\.temp\' + $t)
    if (Test-Path $p) { Copy-Item -LiteralPath $p -Destination (Join-Path $staging 'supabase\.temp') }
  }

  $config = [ordered]@{
    ProjectRef        = $projectRef
    OutputRoot        = $outRoot
    DrillImage        = 'public.ecr.aws/supabase/postgres:17.6.1.167'
    NodePath          = $node
    CliPath           = $cli
    DockerPath        = $docker
    DockerDesktopPath = $dockerDesktop
    StaleHours        = 48
    DrillStaleDays    = 14
    SizeWarnMB        = 2048
  }
  [System.IO.File]::WriteAllText((Join-Path $staging 'config.json'), ($config | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))

  $commit = (& git -C $repo rev-parse HEAD 2>$null)
  $branch = (& git -C $repo rev-parse --abbrev-ref HEAD 2>$null)
  $dirty = [bool](& git -C $repo status --porcelain -- scripts/backup supabase/schema.sql supabase/migrations 2>$null)
  $hashes = [ordered]@{}
  foreach ($f in Get-ChildItem -Path $staging -Recurse -File | Sort-Object FullName) {
    $rel = $f.FullName.Substring($staging.Length + 1)
    $hashes[$rel] = (Get-FileHash -Algorithm SHA256 -LiteralPath $f.FullName).Hash.ToLower()
  }
  $install = [ordered]@{
    installed_at        = (Get-Date).ToString('o', $Inv)
    source_repo         = $repo
    source_commit       = $commit
    source_branch       = $branch
    source_uncommitted  = $dirty
    files               = $hashes
  }
  [System.IO.File]::WriteAllText((Join-Path $staging 'install.json'), ($install | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding($false)))

  # Swap in the new copy, keeping the one before it for a quick rollback.
  if (Test-Path $previous) { Remove-Item -LiteralPath $previous -Recurse -Force }
  if (Test-Path $dest) { Move-Item -LiteralPath $dest -Destination $previous }
  Move-Item -LiteralPath $staging -Destination $dest
}
finally {
  if (Test-Path $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
  foreach ($l in $locks) { $l.ReleaseMutex() }
}

# The backup folder, with a note saying what it is.
foreach ($d in @($outRoot, (Join-Path $outRoot 'backups'), (Join-Path $outRoot 'drills'))) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
}
$nl = [Environment]::NewLine
$readme = 'BuildSupply Verified Backups' + $nl + $nl +
  'Open STATUS.txt to see whether everything is fine. If something is wrong, PROBLEM-READ-ME.txt appears here' + $nl +
  'and Windows shows a notification.' + $nl + $nl +
  'backups\   one verified copy of the whole live database per run, twice a day. Each .zip has a .sha256' + $nl +
  '           (its fingerprint) and a .manifest.json (what is inside) beside it. Nothing here is ever' + $nl +
  '           deleted automatically.' + $nl +
  'drills\    the weekly proof that the newest backup really restores.' + $nl +
  'history.log  every run, good or bad, kept forever.' + $nl + $nl +
  'These files hold every customer name, phone number, bill and payment. Do not share this folder.' + $nl +
  'Do not move, rename or edit anything in it. To restore, follow DISASTER-RECOVERY.md in the BuildSupply project.' + $nl
[System.IO.File]::WriteAllText((Join-Path $outRoot 'README.txt'), $readme, (New-Object System.Text.UTF8Encoding($true)))

if (-not $NoTasks) {
  $ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  # Plain powershell.exe with a hidden window, full path, and NO "Start in"
  # folder. Both alternatives failed on 2026-09-23:
  #   - conhost --headless (no window at all) reports success to Task
  #     Scheduler whatever the script does - a probe script exiting 7 showed
  #     as 0 - so a failing backup would have looked fine;
  #   - with a "Start in" folder set, Task Scheduler refused to launch
  #     (0x8007010B) when that folder was one it could not see.
  # A console window may flash for a moment when a task starts. That is the
  # price of Windows reporting failures truthfully.
  $mk = { param($script) New-ScheduledTaskAction -Execute $ps -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $dest $script) + '"') }
  $who = New-ScheduledTaskPrincipal -UserId ($env:USERDOMAIN + '\' + $env:USERNAME) -LogonType Interactive -RunLevel Limited
  $common = @{ StartWhenAvailable = $true; AllowStartIfOnBatteries = $true; DontStopIfGoingOnBatteries = $true; MultipleInstances = 'IgnoreNew' }

  $s = New-ScheduledTaskSettingsSet @common -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15)
  Register-ScheduledTask -TaskName 'BuildSupply Backup' -Action (& $mk 'run-backup.ps1') -Principal $who -Settings $s -Force `
    -Trigger @((New-ScheduledTaskTrigger -Daily -At '13:00'), (New-ScheduledTaskTrigger -Daily -At '21:00')) `
    -Description ('Verified backup of the BuildSupply live database into OneDrive. Read-only against the database. Installed copy: ' + $dest) | Out-Null

  $s = New-ScheduledTaskSettingsSet @common -ExecutionTimeLimit (New-TimeSpan -Minutes 45)
  Register-ScheduledTask -TaskName 'BuildSupply Restore Drill' -Action (& $mk 'restore-drill.ps1') -Principal $who -Settings $s -Force `
    -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '21:30') `
    -Description 'Restores the newest BuildSupply backup into a throwaway, network-less Docker database and checks every row. Never touches production.' | Out-Null

  $s = New-ScheduledTaskSettingsSet @common -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
  $logon = New-ScheduledTaskTrigger -AtLogOn -User ($env:USERDOMAIN + '\' + $env:USERNAME)
  $logon.Delay = 'PT10M'
  $every4h = New-ScheduledTaskTrigger -Once -At ((Get-Date).Date) -RepetitionInterval (New-TimeSpan -Hours 4)
  Register-ScheduledTask -TaskName 'BuildSupply Backup Health Check' -Action (& $mk 'backup-health.ps1') -Principal $who -Settings $s -Force `
    -Trigger @($logon, $every4h) `
    -Description 'Warns if BuildSupply has had no verified backup for 48 hours, a drill failed, or a backup task was switched off.' | Out-Null

  # Prove Windows can actually run these tasks: start the health check
  # through Task Scheduler (the same path a timed trigger takes) and check
  # for an EFFECT - STATUS.txt rewritten after the start - not just the
  # result code. On 2026-09-23 a result code of 0 came back from tasks that
  # had never run at all.
  $statusFile = Join-Path $outRoot 'STATUS.txt'
  $before = if (Test-Path $statusFile) { (Get-Item $statusFile).LastWriteTimeUtc } else { [datetime]::MinValue }
  Start-Sleep -Seconds 2
  Start-ScheduledTask -TaskName 'BuildSupply Backup Health Check'
  $deadline = (Get-Date).AddSeconds(90)
  do { Start-Sleep -Seconds 2 } while ((Get-ScheduledTask -TaskName 'BuildSupply Backup Health Check').State -eq 'Running' -and (Get-Date) -lt $deadline)
  Start-Sleep -Seconds 1
  $launch = (Get-ScheduledTaskInfo -TaskName 'BuildSupply Backup Health Check').LastTaskResult
  $after = if (Test-Path $statusFile) { (Get-Item $statusFile).LastWriteTimeUtc } else { [datetime]::MinValue }
  if (($launch -ne 0 -and $launch -ne 1) -or $after -le $before) {
    throw ('Task Scheduler did not really run the health check (result 0x{0:X}, STATUS.txt {1}). The tasks are registered but would not work - do not rely on them.' -f $launch, $(if ($after -gt $before) { 'updated' } else { 'NOT updated' }))
  }
  Write-Host ('launch test    : Task Scheduler ran the health check and it rewrote STATUS.txt (result ' + $launch + ')')
}

Write-Host ('installed to   : ' + $dest)
Write-Host ('from           : ' + $branch + ' @ ' + $commit + $(if ($dirty) { ' (with uncommitted changes)' } else { '' }))
Write-Host ('files recorded : ' + $hashes.Count)
Write-Host ('backups go to  : ' + $outRoot)
if (-not $NoTasks) {
  foreach ($t in @('BuildSupply Backup', 'BuildSupply Restore Drill', 'BuildSupply Backup Health Check')) {
    $i = Get-ScheduledTaskInfo -TaskName $t
    Write-Host ('task           : {0,-32} next run {1}' -f $t, $i.NextRunTime)
  }
}
$legacy = Get-ScheduledTask -TaskName 'BuildSupply Daily Backup' -ErrorAction SilentlyContinue
if ($legacy) { Write-Host ('old task       : "BuildSupply Daily Backup" left as it is (' + $legacy.State + ') - not touched by this installer') }
