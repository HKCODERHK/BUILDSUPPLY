# BuildSupply - is the backup system healthy?
#
# Run every 4 hours and at sign-in by the scheduled task "BuildSupply Backup
# Health Check", separately from the backup itself, so that a backup task
# that has stopped running - switched off, deleted, or failing before it can
# report anything - is still noticed.
#
# Judges from the backup files themselves, not from what the last run said:
#   - no verified backup for 48 hours, or the newest one fails its checksum
#   - the last backup attempt failed
#   - no restore drill has passed for 14 days, or the last one failed
#   - a scheduled task is missing or switched off
#   - the installed scripts have been changed since they were installed
#
# Rewrites STATUS.txt in the backup folder every time. While anything is
# wrong it also writes PROBLEM-READ-ME.txt and shows a Windows notification
# (again after 12 hours if it is still wrong, and at once if it changes).
# It reads and reports; it never deletes a backup or touches the database.

. (Join-Path $PSScriptRoot 'backup-lib.ps1')
Initialize-Bs
$n = Update-BsHealth -Notify
if ($n -gt 0) { Write-Host ('attention needed: ' + $n + ' problem(s) - see ' + $script:Problem) } else { Write-Host 'all good' }
exit ([int]($n -gt 0))
