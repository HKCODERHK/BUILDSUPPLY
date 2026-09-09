# Registers the daily BuildSupply backup with Windows Task Scheduler.
#
#   powershell -ExecutionPolicy Bypass -File scripts\install-backup-task.ps1
#
# Re-running is safe — it replaces the existing task rather than adding a
# second one. To stop it:
#
#   Unregister-ScheduledTask -TaskName 'BuildSupply Daily Backup' -Confirm:$false

$ErrorActionPreference = 'Stop'

$TaskName = 'BuildSupply Daily Backup'
$Script   = Join-Path $PSScriptRoot 'backup.ps1'
$RunAt    = '9:00PM'

if (-not (Test-Path $Script)) { throw "backup.ps1 not found beside this script" }

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Script + '"')

$trigger = New-ScheduledTaskTrigger -Daily -At $RunAt

# StartWhenAvailable is the setting that matters: a laptop is often shut at
# nine, and without it a missed run is simply skipped rather than caught up on
# the next boot. The rest keeps it from running on battery, which is when a
# machine is least likely to have a connection anyway.
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
  -MultipleInstances IgnoreNew

# Runs as the signed-in user, so no password has to be stored anywhere. The
# cost is that it only runs while that user is logged in — which is the right
# trade for a personal laptop.
Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Exports the BuildSupply database to OneDrive each evening. See scripts/backup.ps1.' `
  -Force | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName

'registered : {0}' -f $task.TaskName
'state      : {0}' -f $task.State
'runs       : daily at {0}' -f $RunAt
'next run   : {0}' -f $info.NextRunTime
'writes to  : {0}' -f (Join-Path $env:USERPROFILE 'OneDrive\BuildSupply Backups')
''
'Run it once now to confirm:'
'  Start-ScheduledTask -TaskName "{0}"' -f $TaskName
