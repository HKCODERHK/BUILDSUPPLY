# BuildSupply - take one verified backup of the live database.
#
# Run by the scheduled task "BuildSupply Backup" from the INSTALLED copy in
# C:\Users\<you>\BuildSupply Backup System\program, never from the Git tree - so
# switching branches can never change what runs. Install or update with
# scripts\backup\install-backup.ps1.
#
# What one run does, in order, stopping at the first thing that is wrong:
#   1. Reads what the database holds: every table in every schema, the
#      logins' shape, the uploaded files and the scheduled jobs.
#   2. Reads every table in ONE read-only statement - one consistent moment.
#      Postgres itself refuses any write inside it.
#   3. Checks that a string of special characters (em-dash, bullet, rupee,
#      Devanagari) survived the trip byte for byte.
#   4. Downloads every uploaded file, then writes one file per table plus a
#      manifest with row counts, SHA-256s and the COVERAGE of every data
#      source (coverage.js). Anything not covered makes the backup INCOMPLETE:
#      still saved, but recorded as such, notified and raised by the health
#      check - never a clean success.
#   5. Verifies the files, zips them, unzips the zip again and verifies THAT.
#   6. Copies the zip into OneDrive under a temporary name, checks the copy's
#      SHA-256, and only then gives it its real name, with its .sha256 and
#      .manifest.json beside it. A zip without those two is never counted as a
#      backup, so a half-written file can never pass for a good one.
#   7. Deletes the working folder (plaintext customer data) - always, whether
#      the run succeeded or failed.
#
# It never deletes, renames or overwrites an existing backup.
#
#   powershell -ExecutionPolicy Bypass -File run-backup.ps1

param(
  # For testing the failure path only: a project that does not exist makes
  # every step after the first fail, exactly as a real outage would.
  [string]$ProjectRef,
  [switch]$NoHealth
)

. (Join-Path $PSScriptRoot 'backup-lib.ps1')
Initialize-Bs
if ($ProjectRef) { $script:Cfg.ProjectRef = $ProjectRef }

$mutex = New-Object System.Threading.Mutex($false, 'Local\BuildSupplyBackupRun')
if (-not $mutex.WaitOne(0)) {
  Write-BsHistory 'BACKUP' 'SKIPPED' 'another backup was already running'
  exit 0
}

$exitCode = 0
$work = $null
try {
  Clear-BsStaleTemp
  $bad = @(Test-BsInstallIntegrity)
  if ($bad.Count) { throw ('installed files have changed since they were installed: ' + ($bad -join ', ')) }
  $work = New-BsTempDir 'run'

  # 1. What the database holds: every table in every schema, the logins'
  #    shape, the uploaded files and the scheduled jobs - one read-only query.
  $catSql = Join-Path $work 'catalog.sql'
  Invoke-BsTool $work @('catalog-sql', $catSql) | Out-Null
  Invoke-BsQuery $catSql (Join-Path $work 'catalog.out') 'the table list'
  $catalog = Join-Path $work 'catalog.json'
  Invoke-BsTool $work @('catalog', (Join-Path $work 'catalog.out'), $catalog) | Out-Null

  # 2 + 3. Every table in one read-only statement, then the encoding check.
  $snapSql = Join-Path $work 'snapshot.sql'
  Invoke-BsTool $work @('snapshot-sql', $catalog, $snapSql) | Out-Null
  Invoke-BsQuery $snapSql (Join-Path $work 'snapshot.out') 'the tables'

  # 4. Every uploaded file, downloaded by its public address (a read), then
  #    one file per table, the manifest and the coverage of every data source.
  $data = Join-Path $work 'data'
  $projectUrl = if ($script:Cfg.ProjectUrl) { $script:Cfg.ProjectUrl } else { 'https://' + $script:Cfg.ProjectRef + '.supabase.co' }
  Invoke-BsTool $work @('files', $catalog, $data, $projectUrl) | Out-Null
  $summary = Invoke-BsTool $work @('split', (Join-Path $work 'snapshot.out'), $catalog, $data, $script:Cfg.ProjectRef)
  Remove-Item -LiteralPath (Join-Path $work 'snapshot.out') -Force

  # 5. Verify, zip, unzip, verify again.
  Invoke-BsTool $work @('verify', $data) | Out-Null
  $zipTmp = Join-Path $work 'archive.zip'
  [System.IO.Compression.ZipFile]::CreateFromDirectory($data, $zipTmp, [System.IO.Compression.CompressionLevel]::Optimal, $false)
  $check = Join-Path $work 'check'
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zipTmp, $check)
  $verified = Invoke-BsTool $work @('verify', $check)
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipTmp).Hash.ToLower()

  # The backup before this one, for the comparison below.
  $previous = @(Get-BsVerifiedBackups) | Select-Object -First 1

  # 6. Into OneDrive, under a name nothing else has. A backup with coverage
  #    problems is still saved - what it does cover is protected, and losing
  #    that too would help nobody - but it is recorded as INCOMPLETE below.
  $stamp = (Get-Date).ToString('yyyy-MM-dd-HHmm', $script:Inv)
  $destDir = Join-Path $script:BackupsDir ((Get-Date).ToString('yyyy-MM', $script:Inv))
  if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
  $name = 'buildsupply-' + $stamp + '.zip'
  if (Test-Path (Join-Path $destDir $name)) { $name = 'buildsupply-' + $stamp + (Get-Date).ToString('ss', $script:Inv) + '.zip' }
  $final = Join-Path $destDir $name
  if (Test-Path $final) { throw ('a backup named ' + $name + ' already exists; not overwriting it') }
  $partial = $final + '.partial'
  Copy-Item -LiteralPath $zipTmp -Destination $partial
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $partial).Hash.ToLower() -ne $hash) {
    Remove-Item -LiteralPath $partial -Force
    throw 'the copy in OneDrive does not match the verified backup'
  }
  Move-Item -LiteralPath $partial -Destination $final
  [System.IO.File]::WriteAllText(($final + '.sha256'), ($hash + '  ' + $name + "`n"))
  Copy-Item -LiteralPath (Join-Path $data 'manifest.json') -Destination ([System.IO.Path]::ChangeExtension($final, '.manifest.json'))

  $now = [System.IO.File]::ReadAllText((Join-Path $data 'manifest.json'), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  $kb = [math]::Round((Get-Item $final).Length / 1KB)
  $line = ($summary -replace '^OK ', '') + ', ' + $kb + ' KB, ' + ($verified -replace '^OK ', '') + ' -> ' + $name
  $problems = @($now.problems)
  if ($problems.Count) {
    # Coverage problems: something in the database is not protected. Saved,
    # but never recorded as a clean success - the health check raises it.
    $exitCode = 2
    Write-BsHistory 'BACKUP' 'INCOMPLETE' ($line + ' | NOT COVERED: ' + ($problems -join ' | '))
    [void](Show-BsToast 'BuildSupply backup is INCOMPLETE' ($problems[0]))
  } else {
    Write-BsHistory 'BACKUP' 'OK' $line
  }

  # Changes worth saying out loud, compared with the previous backup:
  #  - records going DOWN in tables whose rows are never supposed to vanish
  #    in normal use (bills are cancelled, receipts kept forever). Fewer of
  #    them is exactly the kind of loss that goes unnoticed for weeks; it can
  #    be legitimate - deleting a test customer, or the admin removing a whole
  #    supplier - so it is a notice, not an alarm. (client_requests is left
  #    out: the app clears it after 7 days by design.)
  #  - uploaded files going down, and tables appearing or disappearing.
  if ($previous) {
    $watch = @('suppliers', 'customers', 'invoices', 'invoice_items', 'payments', 'payment_allocations',
               'quotations', 'quotation_items', 'materials', 'order_requests', 'stock_logs', 'drivers')
    $drops = @()
    foreach ($t in $watch) {
      $was = $previous.Manifest.tables.$t
      $is = $now.tables.$t
      if ($was -and $is -and $is.rows -lt $was.rows) { $drops += ($t + ' ' + $was.rows + ' -> ' + $is.rows) }
    }
    foreach ($p in $previous.Manifest.tables.PSObject.Properties) {
      # A table deliberately excluded now (a security secret) is not "gone":
      # it is still in production and simply no longer copied.
      $isExcluded = $now.PSObject.Properties['excluded'] -and $now.excluded -and $now.excluded.PSObject.Properties[$p.Name]
      if (-not $now.tables.($p.Name) -and -not $isExcluded) { $drops += ($p.Name + ' is gone entirely') }
    }
    if ($previous.Manifest.PSObject.Properties['storage'] -and $previous.Manifest.storage -and $now.storage -and
        $now.storage.files -lt $previous.Manifest.storage.files) {
      $drops += ('uploaded files ' + $previous.Manifest.storage.files + ' -> ' + $now.storage.files)
    }
    if ($drops.Count) {
      $msg = 'fewer records than the backup of ' + (Format-BsDate $previous.TakenAt) + ': ' + ($drops -join ', ') +
             '. If nobody deleted these on purpose, the earlier backups still hold them - do not restore anything yourself, ask first.'
      Write-BsHistory 'BACKUP' 'NOTICE' $msg
      [void](Show-BsToast 'BuildSupply: records went down since the last backup' ($drops -join ', '))
    }
    $added = @($now.tables.PSObject.Properties.Name | Where-Object { -not $previous.Manifest.tables.$_ })
    if ($added.Count) {
      Write-BsHistory 'BACKUP' 'NOTICE' ('new table(s) found and now backed up automatically: ' + ($added -join ', ') +
        '. The weekly restore drill will prove they restore; if they need a place in the restore order, add them to restore-from-backup.mjs.')
    }
  }
}
catch {
  $exitCode = 1
  Write-BsHistory 'BACKUP' 'FAILED' $_.Exception.Message
}
finally {
  # 7. Always. A failed run must not leave customer data lying in %TEMP%.
  if ($work) {
    try { Remove-BsTempDir $work }
    catch { $exitCode = 1; Write-BsHistory 'BACKUP' 'FAILED' ('could not delete the working folder: ' + $_.Exception.Message) }
  }
  $mutex.ReleaseMutex()
  if (-not $NoHealth) { try { [void](Update-BsHealth -Notify) } catch { Write-BsHistory 'HEALTH' 'FAILED' $_.Exception.Message } }
}
exit $exitCode
