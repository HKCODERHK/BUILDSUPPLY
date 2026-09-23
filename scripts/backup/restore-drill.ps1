# BuildSupply - prove that a backup actually restores.
#
# Run weekly by the scheduled task "BuildSupply Restore Drill". Takes the
# newest verified backup and restores it into a brand-new, throwaway Postgres
# container, then checks the restored database against the backup's own
# manifest: every table's row count, the exact set of row ids, names character
# for character, the money totals, and the app's integrity rules.
#
# Production is never involved. The container is started with
# --network none, so it has no network at all and could not reach the live
# database even by mistake. It is destroyed at the end, with everything in it,
# and so is the working folder - pass or fail.
#
#   powershell -ExecutionPolicy Bypass -File restore-drill.ps1 [-Archive <zip>]

param(
  [string]$Archive,
  [switch]$NoHealth
)

. (Join-Path $PSScriptRoot 'backup-lib.ps1')
Initialize-Bs

$Container = 'buildsupply-restore-drill'
$Docker = $script:Cfg.DockerPath
$schemaDir = if (Test-Path (Join-Path $script:Here 'schema')) { Join-Path $script:Here 'schema' } else { (Resolve-Path (Join-Path $script:Here '..\..\supabase')).Path }

$mutex = New-Object System.Threading.Mutex($false, 'Local\BuildSupplyRestoreDrill')
if (-not $mutex.WaitOne(0)) { Write-BsHistory 'DRILL' 'SKIPPED' 'another drill was already running'; exit 0 }

$work = $null
$exitCode = 0
$started = Get-Date
$steps = New-Object System.Collections.Generic.List[string]
$checkLines = New-Object System.Collections.Generic.List[string]
$backup = $null
$accounts = @()

function Invoke-Docker([string[]]$dargs, [string]$what) {
  $o = Join-Path $work '_docker.out'; $e = Join-Path $work '_docker.err'
  $code = Invoke-BsNative $Docker $dargs $o $e $null
  if ($code -ne 0) { throw ($what + ' failed: ' + (Read-BsSmallText $e) + ' ' + (Read-BsSmallText $o 200)) }
  return $o
}
function Invoke-DrillSql([string]$user, [string]$file, [string]$what) {
  Invoke-Docker @('exec', '-e', 'PGCLIENTENCODING=UTF8', $Container, 'psql', '-U', $user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-f', $file) $what
}
function Step([string]$label, [scriptblock]$body) {
  $t = Get-Date
  $r = & $body
  $steps.Add(('  {0,-58} {1,5:0.0}s' -f $label, ((Get-Date) - $t).TotalSeconds))
  return $r
}
function Test-DockerUp {
  $o = Join-Path $work '_docker.out'; $e = Join-Path $work '_docker.err'
  return ((Invoke-BsNative $Docker @('info', '--format', 'ok') $o $e $null) -eq 0)
}
function Remove-DrillContainer {
  if (-not $work) { return }
  $o = Join-Path $work '_rm.out'; $e = Join-Path $work '_rm.err'
  [void](Invoke-BsNative $Docker @('container', 'rm', '-f', '-v', $Container) $o $e $null)
}

try {
  $work = New-BsTempDir 'drill'

  # Which backup, and is it still exactly what was saved?
  if ($Archive) {
    $backup = @(Get-BsVerifiedBackups) | Where-Object { $_.Zip -eq (Resolve-Path $Archive).Path } | Select-Object -First 1
    if (-not $backup) { throw ('not a verified backup: ' + $Archive) }
  } else {
    $backup = @(Get-BsVerifiedBackups) | Select-Object -First 1
    if (-not $backup) { throw 'there is no verified backup to test' }
  }
  if (-not (Test-BsArchiveHash $backup)) { throw ($backup.Name + ' does not match its checksum') }
  $accounts = @($backup.Manifest.accounts)

  # Docker. It is often not running on this laptop; start it if so, and give
  # up politely (a SKIPPED drill, not a failed backup) if it will not come up.
  Step 'checked Docker is running' {
    if (-not (Test-DockerUp)) {
      if (Test-Path $script:Cfg.DockerDesktopPath) { Start-Process -FilePath $script:Cfg.DockerDesktopPath | Out-Null }
      $deadline = (Get-Date).AddMinutes(6)
      while (-not (Test-DockerUp)) {
        if ((Get-Date) -gt $deadline) { throw 'SKIP: Docker Desktop did not start within 6 minutes, so the drill could not run' }
        Start-Sleep -Seconds 5
      }
    }
  } | Out-Null

  # Unpack and re-verify the backup, and prepare the SQL.
  $data = Join-Path $work 'data'
  Step 'unpacked the backup and re-verified every file' {
    [System.IO.Compression.ZipFile]::ExtractToDirectory($backup.Zip, $data)
    $script:verifiedLine = Invoke-BsTool $work @('verify', $data)
    $restore = Join-Path $work 'restore.sql'
    $o = Join-Path $work '_gen.out'; $e = Join-Path $work '_gen.err'
    $code = Invoke-BsNative $script:Cfg.NodePath @((Join-Path $script:Here 'restore-from-backup.mjs'), $data, '--out', $restore) $o $e $null
    if ($code -ne 0) { throw ('could not generate the restore script: ' + (Read-BsSmallText $e)) }
    Invoke-BsTool $work @('logins-sql', $data, (Join-Path $work 'logins.sql')) | Out-Null
    Invoke-BsTool $work @('expect-sql', $data, (Join-Path $work 'checks.sql')) | Out-Null
    Invoke-BsTool $work @('categories', $data, (Join-Path $work 'categories.json')) | Out-Null
  } | Out-Null

  # A fresh container with no network. A leftover one from an interrupted
  # drill is removed first - only ever the container with this exact name.
  Remove-DrillContainer
  $pw = [guid]::NewGuid().ToString('N')
  Step ('started an isolated database (no network) from ' + ($script:Cfg.DrillImage -replace '^.*/', '')) {
    Invoke-Docker @('run', '-d', '--rm', '--name', $Container, '--network', 'none', '--label', 'buildsupply.purpose=restore-drill',
                    '-e', ('POSTGRES_PASSWORD=' + $pw), $script:Cfg.DrillImage) 'starting the drill container' | Out-Null
    $net = Get-Content (Invoke-Docker @('inspect', '--format', '{{.HostConfig.NetworkMode}}', $Container) 'inspecting the container') -Raw
    if ($net.Trim() -ne 'none') { throw ('the drill container has network mode ' + $net.Trim() + '; refusing to continue') }
    # The image initialises in stages and restarts itself once, so wait for
    # three answers in a row rather than the first.
    $ok = 0; $deadline = (Get-Date).AddMinutes(4)
    while ($ok -lt 3) {
      if ((Get-Date) -gt $deadline) { throw 'the drill database did not become ready within 4 minutes' }
      Start-Sleep -Seconds 3
      $o = Join-Path $work '_ready.out'; $e = Join-Path $work '_ready.err'
      $c = Invoke-BsNative $Docker @('exec', $Container, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-Atc',
             "select count(*) from pg_roles where rolname in ('anon','authenticated','service_role')") $o $e $null
      if ($c -eq 0 -and (Read-BsSmallText $o) -eq '3') { $ok++ } else { $ok = 0 }
    }
  } | Out-Null

  $migrations = @(Get-ChildItem -Path (Join-Path $schemaDir 'migrations') -Filter '*.sql' | Sort-Object Name)
  Step ('built the app database: schema.sql + ' + $migrations.Count + ' migrations') {
    Invoke-Docker @('exec', $Container, 'mkdir', '-p', '/tmp/drill') 'preparing the container' | Out-Null
    Invoke-Docker @('cp', (Join-Path $script:Here 'drill-shim.sql'), ($Container + ':/tmp/drill/shim.sql')) 'copying the shim' | Out-Null
    Invoke-Docker @('cp', (Join-Path $schemaDir 'schema.sql'), ($Container + ':/tmp/drill/schema.sql')) 'copying schema.sql' | Out-Null
    Invoke-Docker @('cp', (Join-Path $schemaDir 'migrations'), ($Container + ':/tmp/drill/')) 'copying the migrations' | Out-Null
    foreach ($f in @('restore.sql', 'logins.sql', 'checks.sql')) {
      Invoke-Docker @('cp', (Join-Path $work $f), ($Container + ':/tmp/drill/' + $f)) ('copying ' + $f) | Out-Null
    }
    Invoke-DrillSql 'supabase_admin' '/tmp/drill/shim.sql' 'the storage shim' | Out-Null
    Invoke-DrillSql 'postgres' '/tmp/drill/schema.sql' 'schema.sql' | Out-Null
    foreach ($m in $migrations) { Invoke-DrillSql 'postgres' ('/tmp/drill/migrations/' + $m.Name) ('migration ' + $m.Name) | Out-Null }
  } | Out-Null

  Step ('recreated ' + $accounts.Count + ' logins with their original ids') {
    Invoke-DrillSql 'postgres' '/tmp/drill/logins.sql' 'recreating the logins' | Out-Null
  } | Out-Null

  Step ('restored ' + $backup.Rows + ' rows (as the non-superuser postgres role)') {
    Invoke-DrillSql 'postgres' '/tmp/drill/restore.sql' 'the restore' | Out-Null
  } | Out-Null

  $failed = 0
  Step 'compared the restored database with the backup' {
    $out = Invoke-Docker @('exec', '-e', 'PGCLIENTENCODING=UTF8', $Container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-f', '/tmp/drill/checks.sql') 'the comparison'
    foreach ($line in [System.IO.File]::ReadAllLines($out, [System.Text.Encoding]::UTF8)) {
      if (-not $line.Trim()) { continue }
      $f = $line.Split('|')
      if ($f.Count -lt 4) { continue }
      $pass = $f[1] -eq 't'
      $detail = if ($f[0].StartsWith('schema')) { if ($pass) { '' } else { 'missing: ' + $f[3] } } else { 'expected ' + $f[2] + ', got ' + $f[3] }
      $checkLines.Add(('  [{0}] {1}  {2}' -f $(if ($pass) { ' ok ' } else { 'FAIL' }), $f[0], $detail))
    }
  } | Out-Null
  if ($checkLines.Count -lt 10) { throw ('the comparison produced only ' + $checkLines.Count + ' results') }
  $failed = @($checkLines | Where-Object { $_.StartsWith('  [FAIL]') }).Count
  if ($failed) {
    $first = ($checkLines | Where-Object { $_.StartsWith('  [FAIL]') } | Select-Object -First 1).Trim()
    if ($first -like '*schema*') { throw ('the drill database is missing columns the backup carries - its copy of the migrations is older than production. Run scripts\backup\install-backup.ps1 again. ' + $first) }
    throw ($failed.ToString() + ' of ' + $checkLines.Count + ' checks failed; first: ' + $first)
  }
  # A plain summary per business category: a category passes only if every
  # check naming one of its tables passed. Tables in no category (new ones)
  # are listed under their own heading, never left out.
  $cats = [System.IO.File]::ReadAllText((Join-Path $work 'categories.json')) | ConvertFrom-Json
  $script:categoryLines = foreach ($c in $cats.PSObject.Properties) {
    $tbls = @($c.Value)
    $mine = @($checkLines | Where-Object { $line = $_; @($tbls | Where-Object { $line -match (' ' + [regex]::Escape($_) + '([ .]|$)') }).Count -gt 0 })
    $bad = @($mine | Where-Object { $_.StartsWith('  [FAIL]') }).Count
    '  [{0}] {1}: {2} ({3} checks)' -f $(if ($bad) { 'FAIL' } else { ' ok ' }), $c.Name, ($tbls -join ', '), $mine.Count
  }
  $result = 'PASSED'
}
catch {
  $reason = $_.Exception.Message
  if ($reason.StartsWith('SKIP: ')) {
    # Not a failure of the backup: the drill simply could not run today.
    $result = 'SKIPPED'
    $reason = $reason.Substring(6)
  } else {
    $result = 'FAILED'
    $exitCode = 1
  }
}
finally {
  Remove-DrillContainer
  $gone = $true
  if ($work) {
    $o = Join-Path $work '_gone.out'; $e = Join-Path $work '_gone.err'
    $gone = (Invoke-BsNative $Docker @('container', 'inspect', $Container) $o $e $null) -ne 0
  }
}

# The report goes beside the backups, where it can be read later.
$stamp = (Get-Date).ToString('yyyy-MM-dd-HHmm', $script:Inv)
$nl = [Environment]::NewLine
$r = New-Object System.Text.StringBuilder
[void]$r.Append('BuildSupply restore drill - ' + $result + $nl + 'Run ' + (Format-BsDate $started) + ', took ' + [int]((Get-Date) - $started).TotalSeconds + 's' + $nl + $nl)
if ($backup) {
  [void]$r.Append('Backup tested : ' + $backup.Name + $nl)
  [void]$r.Append('                taken ' + (Format-BsDate $backup.TakenAt) + ', ' + $backup.Rows + ' rows, ' + $backup.Tables + ' tables, checksum OK' + $nl)
}
[void]$r.Append('Where         : a throwaway Postgres container with NO network (--network none).' + $nl)
[void]$r.Append('                The live database was never contacted. The container and everything in it' + $nl)
[void]$r.Append('                was destroyed afterwards' + $(if ($gone) { ' (confirmed).' } else { ' - COULD NOT CONFIRM, check Docker.' }) + $nl + $nl)
if ($steps.Count) { [void]$r.Append('Steps:' + $nl); foreach ($s in $steps) { [void]$r.Append($s + $nl) }; [void]$r.Append($nl) }
if ($result -ne 'PASSED') { [void]$r.Append('Why it ' + $(if ($result -eq 'SKIPPED') { 'was skipped' } else { 'failed' }) + ': ' + $reason + $nl + $nl) }
if ($script:verifiedLine) { [void]$r.Append('Backup contents : ' + ($script:verifiedLine -replace '^OK ', '') + ' - every file matched its SHA-256' + $nl + $nl) }
if ($script:categoryLines) {
  [void]$r.Append('Business data restored, by category:' + $nl)
  foreach ($c in $script:categoryLines) { [void]$r.Append($c + $nl) }
  [void]$r.Append($nl)
}
if ($checkLines.Count) {
  $passedCount = @($checkLines | Where-Object { $_.StartsWith('  [ ok ]') }).Count
  [void]$r.Append('Checks (' + $passedCount + ' of ' + $checkLines.Count + ' passed):' + $nl)
  foreach ($c in $checkLines) { [void]$r.Append($c + $nl) }
  [void]$r.Append($nl)
}
if ($accounts.Count -and $result -eq 'PASSED') {
  [void]$r.Append('Accounts restored with their original ids:' + $nl)
  foreach ($a in $accounts) { [void]$r.Append('  - ' + $a.business_name + '  <' + $a.email + '>  ' + $a.role + ', ' + $a.status + $nl) }
}
if ($result -ne 'SKIPPED') {
  $reportFile = Join-Path $script:DrillsDir ('drill-' + $stamp + '-' + $result + '.txt')
  [System.IO.File]::WriteAllText($reportFile, $r.ToString(), (New-Object System.Text.UTF8Encoding($true)))
}

$summary = if ($result -eq 'PASSED') { $backup.Name + ': ' + $checkLines.Count + ' of ' + $checkLines.Count + ' checks passed, ' + $backup.Rows + ' rows, ' + $accounts.Count + ' accounts' } else { $reason }
Write-BsHistory 'DRILL' $result $summary

if ($work) {
  try { Remove-BsTempDir $work } catch { $exitCode = 1; Write-BsHistory 'DRILL' 'FAILED' ('could not delete the working folder: ' + $_.Exception.Message) }
}
$mutex.ReleaseMutex()
if (-not $NoHealth) { try { [void](Update-BsHealth -Notify) } catch { Write-BsHistory 'HEALTH' 'FAILED' $_.Exception.Message } }
exit $exitCode
