# Shared by run-backup.ps1, restore-drill.ps1 and backup-health.ps1.
#
# This file must stay pure ASCII. Windows PowerShell 5.1 reads a .ps1 that has
# no byte-order mark in the ANSI codepage, so a literal em-dash in here would
# itself be mangled - the very bug this backup system was built to end.
#
# PowerShell never handles backed-up rows as text. Everything that reads or
# writes the data runs in Node (backup-tool.js), which does its own UTF-8.
# PowerShell only starts programs, moves files and decides what to report.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$script:TaskBackup = 'BuildSupply Backup'
$script:TaskHealth = 'BuildSupply Backup Health Check'
$script:TaskDrill  = 'BuildSupply Restore Drill'
$script:TaskLegacy = 'BuildSupply Daily Backup'
$script:Inv = [System.Globalization.CultureInfo]::InvariantCulture

function Initialize-Bs {
  $script:Here = $PSScriptRoot
  $cfg = @{
    ProjectRef        = 'pefarymejlfdsmwusbbq'
    OutputRoot        = (Join-Path $env:USERPROFILE 'OneDrive\BuildSupply Verified Backups')
    DrillImage        = 'public.ecr.aws/supabase/postgres:17.6.1.167'
    NodePath          = 'node'
    CliPath           = (Join-Path $env:APPDATA 'npm\supabase.cmd')
    DockerPath        = 'docker'
    DockerDesktopPath = (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe')
    StaleHours        = 48
    DrillStaleDays    = 14
    SizeWarnMB        = 2048
  }
  $cfgFile = Join-Path $script:Here 'config.json'
  if (Test-Path $cfgFile) {
    $j = [System.IO.File]::ReadAllText($cfgFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    foreach ($p in $j.PSObject.Properties) { $cfg[$p.Name] = $p.Value }
  }
  $script:Cfg        = $cfg
  $script:Installed  = Test-Path (Join-Path $script:Here 'install.json')
  # The CLI finds its linked project from the folder it starts in. The
  # installed copy carries its own supabase\ folder; run from the repo, it
  # uses the repo's.
  $script:CliWorkDir = if (Test-Path (Join-Path $script:Here 'supabase')) { $script:Here } else { (Resolve-Path (Join-Path $script:Here '..\..')).Path }
  $script:Root       = $cfg.OutputRoot
  $script:BackupsDir = Join-Path $script:Root 'backups'
  $script:DrillsDir  = Join-Path $script:Root 'drills'
  $script:History    = Join-Path $script:Root 'history.log'
  $script:StatusFile = Join-Path $script:Root 'STATUS.txt'
  $script:Problem    = Join-Path $script:Root 'PROBLEM-READ-ME.txt'
  # Not under %LOCALAPPDATA% - see install-backup.ps1 for why.
  $script:StateDir   = Join-Path $env:USERPROFILE 'BuildSupply Backup System\state'
  foreach ($d in @($script:Root, $script:BackupsDir, $script:DrillsDir, $script:StateDir)) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
  }
  # Node and the CLI both need this on a machine whose antivirus re-signs TLS
  # (Avast here): without it every HTTPS call fails certificate checks.
  $env:NODE_OPTIONS = '--use-system-ca'
}

function Get-BsNow { (Get-Date).ToString('yyyy-MM-dd HH:mm:ss', $script:Inv) }
function Format-BsDate([datetime]$d) { $d.ToString('dd MMM yyyy HH:mm', $script:Inv) }
function Format-BsAge([datetime]$d) {
  $s = (Get-Date) - $d
  if ($s.TotalMinutes -lt 2) { return 'just now' }
  if ($s.TotalHours -lt 2) { return ('{0} minutes ago' -f [int]$s.TotalMinutes) }
  if ($s.TotalDays -lt 2) { return ('{0} hours ago' -f [int]$s.TotalHours) }
  return ('{0} days ago' -f [int]$s.TotalDays)
}

# history.log is append-only: nothing ever rewrites or trims it, so a failure
# stays on record even after later runs succeed.
function Write-BsHistory([string]$kind, [string]$result, [string]$message) {
  $line = '{0}  {1,-6}  {2,-7}  {3}' -f (Get-BsNow), $kind, $result, ($message -replace '[\r\n]+', ' ')
  Add-Content -Path $script:History -Value $line -Encoding utf8
  Write-Host $line
}

function Get-BsLastHistory([string]$kind) {
  if (-not (Test-Path $script:History)) { return $null }
  $lines = [System.IO.File]::ReadAllLines($script:History, [System.Text.Encoding]::UTF8)
  for ($i = $lines.Length - 1; $i -ge 0; $i--) {
    $m = [regex]::Match($lines[$i], '^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)  (\S+)\s+(\S+)\s+(.*)$')
    if ($m.Success -and $m.Groups[2].Value -eq $kind -and $m.Groups[3].Value -ne 'SKIPPED' -and $m.Groups[3].Value -ne 'NOTDUE') {
      return [pscustomobject]@{
        At      = [datetime]::ParseExact($m.Groups[1].Value, 'yyyy-MM-dd HH:mm:ss', $script:Inv)
        Result  = $m.Groups[3].Value
        Message = $m.Groups[4].Value
      }
    }
  }
  return $null
}

# Runs a program with stdout and stderr going straight to files. Start-Process
# rather than the call operator: in PowerShell 5.1 a native program's stderr
# arrives as error records, which under ErrorActionPreference Stop turns a
# harmless progress line into a fatal error, and piping stdout re-encodes it.
function Invoke-BsNative([string]$exe, [string[]]$argList, [string]$outFile, [string]$errFile, [string]$workDir) {
  $quoted = foreach ($a in $argList) { if ($a -match '[\s"]') { '"' + ($a -replace '"', '\"') + '"' } else { $a } }
  $p = @{ FilePath = $exe; ArgumentList = ($quoted -join ' '); NoNewWindow = $true; Wait = $true; PassThru = $true
          RedirectStandardOutput = $outFile; RedirectStandardError = $errFile }
  if ($workDir) { $p.WorkingDirectory = $workDir }
  $proc = Start-Process @p
  return $proc.ExitCode
}

function Read-BsSmallText([string]$file, [int]$max = 400) {
  if (-not (Test-Path $file)) { return '' }
  $t = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8).Trim()
  $t = $t -replace '[^\x20-\x7e]', ' '
  if ($t.Length -gt $max) { $t = $t.Substring(0, $max) + '...' }
  return $t
}

# backup-tool.js prints exactly one ASCII line: 'OK ...' or 'ERROR ...'.
function Invoke-BsTool([string]$work, [string[]]$toolArgs) {
  $out = Join-Path $work '_tool.out'; $err = Join-Path $work '_tool.err'
  $script = Join-Path $script:Here 'backup-tool.js'
  $code = Invoke-BsNative $script:Cfg.NodePath (@($script) + $toolArgs) $out $err $null
  $line = Read-BsSmallText $out
  if ($code -ne 0 -or -not $line.StartsWith('OK')) {
    $why = if ($line) { $line } else { Read-BsSmallText $err }
    throw ('backup-tool ' + $toolArgs[0] + ' failed: ' + $why)
  }
  return $line
}

# One query against the live database through the Supabase CLI's stored login.
# Retried because the Supabase API occasionally answers 5xx for a minute (one
# night in September 2026 it was a Cloudflare 520). Every query file this
# system sends begins with `set transaction read only`.
function Invoke-BsQuery([string]$sqlFile, [string]$outFile, [string]$label) {
  $first = [System.IO.File]::ReadAllText($sqlFile).TrimStart()
  if (-not $first.StartsWith('set transaction read only;')) { throw ('refusing to send ' + $label + ': it is not marked read-only') }
  $errFile = $outFile + '.err'
  $waits = @(0, 20, 60)
  $why = ''
  foreach ($w in $waits) {
    if ($w -gt 0) { Start-Sleep -Seconds $w }
    $cliArgs = @('db', 'query', '--file', $sqlFile, '--linked', '--project-ref', $script:Cfg.ProjectRef, '--output-format', 'json', '--agent', 'no')
    $code = Invoke-BsNative $script:Cfg.CliPath $cliArgs $outFile $errFile $script:CliWorkDir
    $size = if (Test-Path $outFile) { (Get-Item $outFile).Length } else { 0 }
    if ($code -eq 0 -and $size -gt 0) {
      Remove-Item $errFile -Force -ErrorAction SilentlyContinue
      return
    }
    $why = 'exit ' + $code + ': ' + (Read-BsSmallText $errFile) + ' ' + (Read-BsSmallText $outFile 200)
  }
  Remove-Item $errFile -Force -ErrorAction SilentlyContinue
  throw ('could not read ' + $label + ' from the live database after 3 tries (' + $why.Trim() + '). ' +
         'If this keeps happening, the Supabase CLI login may have expired: run  npx supabase login')
}

# Working folders hold plaintext customer data while a run is in progress, so
# they are only ever made with these prefixes, only ever deleted with these
# prefixes, and always deleted - on success and on failure.
$script:TempPrefixes = @('buildsupply-run-', 'buildsupply-drill-')
function New-BsTempDir([string]$kind) {
  $name = 'buildsupply-' + $kind + '-' + (Get-Date).ToString('yyyyMMdd-HHmmss', $script:Inv) + '-' + ([guid]::NewGuid().ToString('N').Substring(0, 6))
  $d = Join-Path $env:TEMP $name
  New-Item -ItemType Directory -Force -Path $d | Out-Null
  return $d
}
function Remove-BsTempDir([string]$dir) {
  if (-not $dir -or -not (Test-Path $dir)) { return }
  $full = (Resolve-Path $dir).Path
  $leaf = Split-Path -Leaf $full
  $parent = (Split-Path -Parent $full).TrimEnd('\')
  $temp = ([System.IO.Path]::GetFullPath($env:TEMP)).TrimEnd('\')
  $ours = $false
  foreach ($p in $script:TempPrefixes) { if ($leaf.StartsWith($p)) { $ours = $true } }
  if (-not $ours -or $parent -ne $temp) { throw ('refusing to delete ' + $full + ': not a backup working folder') }
  Remove-Item -LiteralPath $full -Recurse -Force
  if (Test-Path $full) { throw ('could not delete the working folder ' + $full + ' - it holds plaintext data') }
}
# A run killed outright (power cut) never reaches its cleanup. The next run
# removes what it left, but only folders this system made, and only ones more
# than 12 hours old so a run in progress is never touched.
function Clear-BsStaleTemp {
  foreach ($p in $script:TempPrefixes) {
    Get-ChildItem -Path $env:TEMP -Directory -Filter ($p + '*') -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTime -lt (Get-Date).AddHours(-12) } |
      ForEach-Object { Remove-BsTempDir $_.FullName; Write-BsHistory 'CLEAN' 'OK' ('removed a working folder left by an interrupted run: ' + $_.Name) }
  }
}

# The installer records the SHA-256 of every file it copied. A change to any
# of them afterwards - an edit, a half-finished copy, a stray branch switch
# reaching in - is reported instead of silently changing what runs tonight.
function Test-BsInstallIntegrity {
  $f = Join-Path $script:Here 'install.json'
  if (-not (Test-Path $f)) { return @() }
  $inst = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  $bad = @()
  foreach ($p in $inst.files.PSObject.Properties) {
    $full = Join-Path $script:Here $p.Name
    if (-not (Test-Path $full)) { $bad += $p.Name + ' (missing)'; continue }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $full).Hash.ToLower() -ne $p.Value) { $bad += $p.Name }
  }
  return $bad
}

# Every verified backup: a zip with its .sha256 and .manifest.json beside it.
# A zip without both is not counted - so nothing unverified can ever be
# mistaken for a good backup.
function Get-BsVerifiedBackups {
  if (-not (Test-Path $script:BackupsDir)) { return @() }
  $list = foreach ($z in Get-ChildItem -Path $script:BackupsDir -Recurse -File -Filter 'buildsupply-*.zip') {
    $sha = $z.FullName + '.sha256'
    $man = [System.IO.Path]::ChangeExtension($z.FullName, '.manifest.json')
    if (-not (Test-Path $sha) -or -not (Test-Path $man)) { continue }
    try { $m = [System.IO.File]::ReadAllText($man, [System.Text.Encoding]::UTF8) | ConvertFrom-Json } catch { continue }
    [pscustomobject]@{
      Zip = $z.FullName; Name = $z.Name; ShaFile = $sha; Manifest = $m
      TakenAt = ([datetime]::Parse($m.taken_at, $script:Inv)).ToLocalTime()
      Rows = $m.total_rows; Tables = $m.table_count; Bytes = $z.Length
    }
  }
  return @($list | Sort-Object TakenAt -Descending)
}

function Test-BsArchiveHash($b) {
  $want = ([System.IO.File]::ReadAllText($b.ShaFile).Trim() -split '\s+')[0].ToLower()
  $have = (Get-FileHash -Algorithm SHA256 -LiteralPath $b.Zip).Hash.ToLower()
  return ($want -eq $have)
}

function Get-BsLastDrill([string]$result) {
  $f = Get-ChildItem -Path $script:DrillsDir -File -Filter ('drill-*-' + $result + '.txt') -ErrorAction SilentlyContinue |
       Sort-Object Name -Descending | Select-Object -First 1
  if (-not $f) { return $null }
  $m = [regex]::Match($f.Name, '^drill-(\d{4}-\d\d-\d\d-\d{4})')
  $at = [datetime]::ParseExact($m.Groups[1].Value, 'yyyy-MM-dd-HHmm', $script:Inv)
  return [pscustomobject]@{ File = $f.FullName; Name = $f.Name; At = $at }
}

function Show-BsToast([string]$title, [string]$body) {
  try {
    [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
    $esc = { param($s) [System.Security.SecurityElement]::Escape($s) }
    $folder = 'file:///' + ($script:Root -replace '\\', '/')
    $xml = '<toast activationType="protocol" launch="' + (& $esc $folder) + '" scenario="reminder"><visual><binding template="ToastGeneric">' +
           '<text>' + (& $esc $title) + '</text><text>' + (& $esc $body) + '</text></binding></visual>' +
           '<actions><action content="Open backup folder" activationType="protocol" arguments="' + (& $esc $folder) + '"/></actions></toast>'
    $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
    $doc.LoadXml($xml)
    $app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($doc))
    return $true
  } catch {
    return $false
  }
}

# Works out whether anything needs the owner's attention, from the backup
# files themselves rather than from what the last run claimed. Rewrites
# STATUS.txt every time, writes PROBLEM-READ-ME.txt only while something is
# wrong, and pops a Windows notification - at most every 12 hours for the
# same problems, and at once when they change.
function Update-BsHealth([switch]$Notify) {
  $problems = New-Object System.Collections.Generic.List[string]
  $warnings = New-Object System.Collections.Generic.List[string]
  $now = Get-Date

  $all = Get-BsVerifiedBackups
  $newest = $null
  foreach ($b in $all) { if (Test-BsArchiveHash $b) { $newest = $b; break } else { $problems.Add('The backup ' + $b.Name + ' no longer matches its checksum - it has been changed or damaged since it was made. Older backups are still checked.') } }
  if (-not $newest) {
    $problems.Add('There is no verified backup at all.')
  } elseif (($now - $newest.TakenAt).TotalHours -gt $script:Cfg.StaleHours) {
    $problems.Add('The newest verified backup is from ' + (Format-BsDate $newest.TakenAt) + ' (' + (Format-BsAge $newest.TakenAt) + '). No backup has succeeded for more than ' + $script:Cfg.StaleHours + ' hours.')
  }

  $lastBackup = Get-BsLastHistory 'BACKUP'
  if ($lastBackup -and $lastBackup.Result -eq 'FAILED') {
    $problems.Add('The last backup attempt failed on ' + (Format-BsDate $lastBackup.At) + ': ' + $lastBackup.Message)
  }

  $passed = Get-BsLastDrill 'PASSED'
  $lastDrill = Get-BsLastHistory 'DRILL'
  if (-not $passed) {
    $problems.Add('No restore drill has passed yet, so no backup has been proven to restore.')
  } elseif (($now - $passed.At).TotalDays -gt $script:Cfg.DrillStaleDays) {
    $problems.Add('The last restore drill that passed was ' + (Format-BsAge $passed.At) + '. Drills need Docker Desktop; if it will not start, open it from the Start menu.')
  }
  if ($lastDrill -and $lastDrill.Result -eq 'FAILED') {
    $problems.Add('The last restore drill failed on ' + (Format-BsDate $lastDrill.At) + ': ' + $lastDrill.Message)
  }

  if ($script:Installed) {
    $bad = @(Test-BsInstallIntegrity)
    if ($bad.Count) { $problems.Add('Installed backup files have changed since they were installed: ' + ($bad -join ', ') + '. Run scripts\backup\install-backup.ps1 again.') }
    foreach ($t in @($script:TaskBackup, $script:TaskHealth, $script:TaskDrill)) {
      $task = Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
      if (-not $task) { $problems.Add('The scheduled task "' + $t + '" is missing. Run scripts\backup\install-backup.ps1 again.') }
      elseif ($task.State -eq 'Disabled') { $problems.Add('The scheduled task "' + $t + '" has been switched off (disabled) in Task Scheduler.') }
      else {
        # 0 = fine, 1 = ran and reported a problem (already listed above),
        # 0x41301 = running now, 0x41303 = not run yet. Anything else means
        # Windows could not even start it - the failure that shows nowhere else.
        $r = (Get-ScheduledTaskInfo -TaskName $t).LastTaskResult
        if (@(0, 1, 0x41301, 0x41303) -notcontains $r) {
          $problems.Add(('The scheduled task "{0}" could not run last time (Windows result 0x{1:X}). Run scripts\backup\install-backup.ps1 again.' -f $t, $r))
        }
      }
    }
  }
  $legacy = Get-ScheduledTask -TaskName $script:TaskLegacy -ErrorAction SilentlyContinue
  if ($legacy -and $legacy.State -ne 'Disabled') { $warnings.Add('The old "' + $script:TaskLegacy + '" task is switched on. It does not verify its backups; it should stay disabled.') }
  if (-not (Get-Process -Name OneDrive -ErrorAction SilentlyContinue)) { $warnings.Add('OneDrive is not running, so new backups are only on this laptop until it starts again.') }
  $sizeMB = [math]::Round(((Get-ChildItem -Path $script:Root -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum) / 1MB, 1)
  if ($sizeMB -gt $script:Cfg.SizeWarnMB) { $warnings.Add('The backup folder is ' + $sizeMB + ' MB. Nothing is deleted automatically; ask for a retention plan before it fills OneDrive.') }

  # STATUS.txt - the one file to open.
  $nl = [Environment]::NewLine
  $s = New-Object System.Text.StringBuilder
  [void]$s.Append('BuildSupply backups - status' + $nl + 'Checked ' + (Format-BsDate $now) + $nl + $nl)
  if ($problems.Count) { [void]$s.Append('>>> ATTENTION NEEDED - read PROBLEM-READ-ME.txt in this folder <<<' + $nl + $nl) }
  else { [void]$s.Append('ALL GOOD - nothing needs your attention.' + $nl + $nl) }
  if ($newest) {
    [void]$s.Append('Newest verified backup : ' + (Format-BsDate $newest.TakenAt) + ' (' + (Format-BsAge $newest.TakenAt) + ')' + $nl)
    [void]$s.Append('                         ' + $newest.Rows + ' rows, ' + $newest.Tables + ' tables, checksum OK' + $nl)
  } else { [void]$s.Append('Newest verified backup : NONE' + $nl) }
  $oldest = if ($all.Count) { Format-BsDate $all[-1].TakenAt } else { '-' }
  [void]$s.Append('Verified backups kept  : ' + $all.Count + ' (oldest ' + $oldest + '). None is ever deleted automatically.' + $nl)
  if ($passed) { [void]$s.Append('Last restore drill     : PASSED ' + (Format-BsDate $passed.At) + ' (' + (Format-BsAge $passed.At) + ') - drills\' + $passed.Name + $nl) }
  else { [void]$s.Append('Last restore drill     : none has passed yet' + $nl) }
  [void]$s.Append('Folder size            : ' + $sizeMB + ' MB' + $nl + $nl)
  [void]$s.Append('Schedule: a backup every day at 21:00; a restore drill every Sunday at 21:30;' + $nl)
  [void]$s.Append('this check every 4 hours and at sign-in. Runs missed while the laptop was off happen when it is next on.' + $nl)
  if ($newest -and $newest.Manifest.accounts) {
    [void]$s.Append($nl + 'Accounts in the newest backup (each one is restorable):' + $nl)
    foreach ($a in $newest.Manifest.accounts) { [void]$s.Append('  - ' + $a.business_name + '  <' + $a.email + '>  ' + $a.role + ', ' + $a.status + $nl) }
  }
  # The only tables deliberately left out, by the owner's decision - named
  # here so nobody mistakes them for business data that went missing.
  if ($newest -and $newest.Manifest.PSObject.Properties['excluded'] -and $newest.Manifest.excluded) {
    $ex = @($newest.Manifest.excluded.PSObject.Properties)
    if ($ex.Count) {
      [void]$s.Append($nl + 'Deliberately NOT in backups - security secrets, not business data (this is intended):' + $nl)
      foreach ($e in $ex) { [void]$s.Append('  - ' + $e.Name + ': ' + $e.Value.reason + $nl) }
      $pins = @($newest.Manifest.pin_accounts)
      if ($pins.Count) {
        [void]$s.Append('  After a restore, ask these accounts to set their confirmation PIN again: ' + (($pins | ForEach-Object { $_.business_name.Trim() }) -join ', ') + $nl)
      }
      [void]$s.Append('  Every other table - business data - is in every backup.' + $nl)
    }
  }
  # Drops in records reported by a backup in the last 7 days.
  if (Test-Path $script:History) {
    foreach ($l in [System.IO.File]::ReadAllLines($script:History, [System.Text.Encoding]::UTF8)) {
      $m = [regex]::Match($l, '^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)  BACKUP\s+NOTICE\s+(.*)$')
      if ($m.Success -and ($now - [datetime]::ParseExact($m.Groups[1].Value, 'yyyy-MM-dd HH:mm:ss', $script:Inv)).TotalDays -le 7) {
        $warnings.Add('On ' + $m.Groups[1].Value.Substring(0, 16) + ' a backup found ' + $m.Groups[2].Value)
      }
    }
  }
  if ($warnings.Count) { [void]$s.Append($nl + 'Notes:' + $nl); foreach ($w in $warnings) { [void]$s.Append('  - ' + $w + $nl) } }
  [void]$s.Append($nl + 'How to restore: see DISASTER-RECOVERY.md in the BuildSupply project.' + $nl)
  [System.IO.File]::WriteAllText($script:StatusFile, $s.ToString(), (New-Object System.Text.UTF8Encoding($true)))

  if ($problems.Count) {
    $p = New-Object System.Text.StringBuilder
    [void]$p.Append('BuildSupply backups need attention (' + (Format-BsDate $now) + ')' + $nl + $nl)
    $i = 1; foreach ($x in $problems) { [void]$p.Append([string]$i + '. ' + $x + $nl + $nl); $i++ }
    [void]$p.Append('Your existing backups have not been touched. This file disappears by itself once the problem is fixed.' + $nl)
    [void]$p.Append('The full record of every run is in history.log in this folder.' + $nl)
    [System.IO.File]::WriteAllText($script:Problem, $p.ToString(), (New-Object System.Text.UTF8Encoding($true)))
  } elseif (Test-Path $script:Problem) {
    Remove-Item -LiteralPath $script:Problem -Force
  }

  if ($Notify -and $problems.Count) {
    $key = ($problems -join '|').GetHashCode().ToString()
    $stamp = Join-Path $script:StateDir 'last-toast.txt'
    $prev = if (Test-Path $stamp) { (Get-Content $stamp -Raw).Trim() -split ' ', 2 } else { @('', '') }
    $due = $prev[1] -ne $key
    if (-not $due -and $prev[0]) { $due = ((Get-Date) - [datetime]::ParseExact($prev[0], 'yyyyMMddHHmmss', $script:Inv)).TotalHours -ge 12 }
    if ($due) {
      $first = $problems[0]; if ($first.Length -gt 180) { $first = $first.Substring(0, 180) + '...' }
      [void](Show-BsToast 'BuildSupply backup needs attention' $first)
      Set-Content -Path $stamp -Value ((Get-Date).ToString('yyyyMMddHHmmss', $script:Inv) + ' ' + $key) -Encoding ascii
    }
  }
  return $problems.Count
}
