# BuildSupply — daily database backup.
#
# Exports every public table as JSON, verifies each file parses, zips the lot
# into OneDrive so it leaves this machine, and prunes old archives.
#
# Run by Windows Task Scheduler once a day. Nothing here needs Claude, and
# nothing here needs the database password: it goes through the Supabase CLI's
# stored login, the same route used interactively.
#
#   Set it up   : powershell -ExecutionPolicy Bypass -File scripts\install-backup-task.ps1
#   Run by hand : powershell -ExecutionPolicy Bypass -File scripts\backup.ps1

$ErrorActionPreference = 'Stop'

$ProjectRef = 'pefarymejlfdsmwusbbq'
$RepoRoot   = Split-Path -Parent $PSScriptRoot
$Extractor  = Join-Path $PSScriptRoot 'extract-rows.js'
$OutRoot    = Join-Path $env:USERPROFILE 'OneDrive\BuildSupply Backups'
$LogFile    = Join-Path $OutRoot 'backup-log.txt'
$KeepCopies = 14

# Avast re-signs TLS on this machine, so Node rejects every HTTPS call unless
# it trusts the Windows certificate store. Without this the script fails at the
# first query with "unable to verify the first certificate".
$env:NODE_OPTIONS = '--use-system-ca'

# The globally installed CLI, called directly — never through npx.
#
# npx re-fetches the package when it is not installed locally, and prints a
# progress box while it does. Interactively that is a live-updating terminal
# widget; with no TTY it writes every frame to stdout, which under Task
# Scheduler produced 9.7MB of box-drawing characters where the JSON should
# have been. The CLI exited 0 throughout, so it looked like an empty result
# rather than an error. Install it with `npm install -g supabase`.
$Cli = Join-Path $env:APPDATA 'npm\supabase.cmd'
if (-not (Test-Path $Cli)) {
  $fallback = Get-Command supabase.cmd -ErrorAction SilentlyContinue
  if ($fallback) {
    $Cli = $fallback.Source
  } else {
    throw 'supabase CLI not found — install it with: npm install -g supabase'
  }
}

# The tables are read from the database at the start of every run, not listed
# here. A hand-typed list silently missed payment_allocations and
# client_requests when migration 024 added them — the backup kept reporting
# "OK" while leaving out which bill every payment had paid.
#
# These must always be there; if the list comes back without one of them,
# something is wrong with the query, and a backup that quietly skipped them
# would look complete while being useless.
$MustHave = @('customers', 'invoices', 'invoice_items', 'payments', 'payment_allocations', 'suppliers')

function Write-Log($message) {
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding utf8
}

New-Item -ItemType Directory -Force -Path $OutRoot | Out-Null

$stamp   = Get-Date -Format 'yyyy-MM-dd-HHmm'
$workDir = Join-Path $env:TEMP ('buildsupply-backup-' + $stamp)
New-Item -ItemType Directory -Force -Path $workDir | Out-Null

$script:Succeeded = $false

$sqlFile = Join-Path $workDir '_query.sql'
$outFile = Join-Path $workDir '_stdout.txt'
$errFile = Join-Path $workDir '_stderr.txt'

# Runs one query and writes its `data` array to $target; returns the row count.
function Export-Rows([string]$label, [string]$sql, [string]$target) {
  Set-Content -Path $sqlFile -Value $sql -Encoding utf8

  # Start-Process rather than the call operator, because PowerShell 5.1's
  # `2>` redirects its own *error stream*: native stderr arrives wrapped in
  # error records, which both corrupts the captured text and — under
  # ErrorActionPreference = Stop — turns the CLI's harmless "Initialising
  # login role..." progress line into a fatal error. Start-Process redirects
  # the real handles to files, so stdout stays clean JSON and stderr stays
  # readable. This is the difference between the script working by hand and
  # failing under Task Scheduler.
  #
  # --output-format json explicitly. It defaults to *text*, which renders the
  # result as an ASCII table sized to the terminal — and with no terminal to
  # measure, a 3,767-row table came out as 9.7MB of box-drawing characters
  # with the CLI still exiting 0. An interactive shell happens to get JSON,
  # which is why this only ever failed when scheduled.
  $cliArgs = @('db', 'query', '--file', $sqlFile, '--project-ref', $ProjectRef, '--linked', '--output-format', 'json')
  # -WorkingDirectory explicitly: Start-Process does not inherit PowerShell's
  # current location, so Push-Location above does not reach it. Under Task
  # Scheduler the process starts in C:\Windows\System32, where the CLI finds
  # no linked project and returns nothing on stdout while still exiting 0 —
  # which is why this failed only when scheduled.
  $proc = Start-Process -FilePath $Cli -ArgumentList $cliArgs -NoNewWindow -Wait -PassThru `
            -WorkingDirectory $RepoRoot `
            -RedirectStandardOutput $outFile -RedirectStandardError $errFile
  $cliExit = $proc.ExitCode

  $raw = if (Test-Path $outFile) { Get-Content $outFile -Raw } else { '' }
  $count = $raw | & node $Extractor $target

  if ($LASTEXITCODE -ne 0) {
    $why = if (Test-Path $errFile) { (Get-Content $errFile -Raw).Trim() } else { '' }
    if (-not $why) { $why = $count }
    throw ('export failed for ' + $label + ' (cli exit ' + $cliExit + '): ' + $why)
  }
  return [int]$count
}

try {
  Push-Location $RepoRoot

  # Every table in the public schema, read fresh each run. Saved as .list so
  # it is neither verified as a backup file nor zipped with them.
  $listFile = Join-Path $workDir '_tables.list'
  Export-Rows 'the table list' ("select coalesce(json_agg(table_name::text order by table_name), '[]'::json) as data " +
    "from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE';") $listFile | Out-Null
  # Assigned first, then wrapped: PowerShell 5.1's ConvertFrom-Json emits a
  # JSON array as ONE object, so @(... | ConvertFrom-Json) made a one-item
  # list holding the whole array (caught by the check below on first run).
  $parsed = Get-Content $listFile -Raw | ConvertFrom-Json
  $Tables = @($parsed)
  $missing = @($MustHave | Where-Object { $Tables -notcontains $_ })
  if ($missing.Count -gt 0) {
    throw ('the table list came back without ' + ($missing -join ', ') + ' — got: ' + ($Tables -join ', '))
  }

  Write-Log ('start — ' + $Tables.Count + ' tables')
  $rowTotal = 0

  foreach ($table in $Tables) {
    $sql = 'select coalesce(json_agg(t),''[]''::json) as data from public.' + $table + ' t;'

    $count = Export-Rows $table $sql (Join-Path $workDir ($table + '.json'))
    $rowTotal += $count
    Write-Log ('  {0,6} rows  {1}' -f $count, $table)
  }

  # A backup nobody checked is not a backup. Every file must parse as an array
  # before this counts as a success.
  $bad = @()
  foreach ($f in Get-ChildItem $workDir -Filter *.json) {
    & node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); if(!Array.isArray(j)) process.exit(1)" $f.FullName
    if ($LASTEXITCODE -ne 0) { $bad += $f.Name }
  }
  if ($bad.Count -gt 0) { throw ('invalid JSON in: ' + ($bad -join ', ')) }

  $zip = Join-Path $OutRoot ('buildsupply-backup-' + $stamp + '.zip')
  Compress-Archive -Path (Join-Path $workDir '*.json') -DestinationPath $zip -CompressionLevel Optimal
  $sizeKb = [math]::Round((Get-Item $zip).Length / 1KB)
  Write-Log ('OK — ' + $rowTotal + ' rows across ' + $Tables.Count + ' tables, ' + $sizeKb + 'KB -> ' + (Split-Path -Leaf $zip))

  # Keep a fortnight. Older copies are exactly what you want when a problem is
  # noticed late, so this is deliberately not "keep the last two".
  $old = Get-ChildItem $OutRoot -Filter 'buildsupply-backup-*.zip' |
         Sort-Object Name -Descending | Select-Object -Skip $KeepCopies
  foreach ($o in $old) { Remove-Item $o.FullName -Force; Write-Log ('  pruned ' + $o.Name) }

  # Clear any previous alarm now that a run has succeeded.
  $alert = Join-Path $OutRoot 'BACKUP-FAILED-READ-ME.txt'
  if (Test-Path $alert) { Remove-Item $alert -Force }
  $script:Succeeded = $true
}
catch {
  # Loud, and left where it will be seen. A silent failure means finding out
  # months later that nothing has been backed up since April.
  Write-Log ('FAILED — ' + $_.Exception.Message)
  $alert = Join-Path $OutRoot 'BACKUP-FAILED-READ-ME.txt'
  $body  = 'The BuildSupply backup failed on ' + (Get-Date -Format 'dd MMM yyyy HH:mm') + '.' + [Environment]::NewLine +
           [Environment]::NewLine + '  ' + $_.Exception.Message + [Environment]::NewLine +
           [Environment]::NewLine + 'The usual cause is the Supabase CLI login having expired. Fix it with:' +
           [Environment]::NewLine + [Environment]::NewLine + '  npx supabase login' + [Environment]::NewLine +
           [Environment]::NewLine + 'then run scripts\backup.ps1 by hand to confirm, and delete this file.' +
           [Environment]::NewLine + 'Until then there are no new backups.'
  Set-Content -Path $alert -Value $body -Encoding utf8
  exit 1
}
finally {
  Pop-Location -ErrorAction SilentlyContinue
  # Kept on failure: the captured stdout and stderr are the only evidence of
  # why a scheduled run went wrong, and deleting them leaves nothing to look
  # at. Cleared on success, where there is nothing to learn.
  if ($script:Succeeded) {
    Remove-Item $workDir -Recurse -Force -ErrorAction SilentlyContinue
  } else {
    Write-Log ('  evidence kept in ' + $workDir)
  }
}
