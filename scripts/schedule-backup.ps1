# Mendaftarkan backup otomatis setiap hari jam 22:00 di Windows (jalankan SEKALI).
# Cara: buka PowerShell di folder proyek, lalu:  powershell -ExecutionPolicy Bypass -File scripts\schedule-backup.ps1
# Bila komputer mati pada jam itu, backup dijalankan begitu komputer menyala (StartWhenAvailable). Akun Windows harus sedang login.
param([string]$Time = "22:00", [string]$Out = "backups", [int]$Keep = 14)
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute $node -Argument "scripts\backup.mjs --out=`"$Out`" --keep=$Keep" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "POS Backup Supabase" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Terdaftar: backup tiap hari $Time ke '$Out' (simpan $Keep). Cek hasil di $Out\backup.log"
Write-Host "Uji sekarang: Start-ScheduledTask -TaskName 'POS Backup Supabase'"
