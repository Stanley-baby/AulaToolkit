# Run by the uninstaller: undoes "Disable official AULA software" (exe names, autostart entries)
# and removes our own autostart entry. -DryRun just prints (used it to test before uninstalling for
# real), -ExesOnly is the elevated second pass.
param([switch]$DryRun, [switch]$ExesOnly)

$off = '.aulahub-off'
$hints = 'aula|oemdrv|devicedriver|bycombo|sc900'
$isOwn = { param($s) $s -match 'aula toolkit' }

function Act($what, [scriptblock]$do) {
  if ($DryRun) { Write-Output "would $what" } else { try { & $do; Write-Output $what } catch { Write-Output "failed: $what ($($_.Exception.Message))" } }
}

# renamed driver executables
$roots = @(${env:ProgramFiles(x86)}, $env:ProgramFiles, (Join-Path $env:LOCALAPPDATA 'Programs')) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
$exes = foreach ($root in $roots) {
  Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match $hints -and -not (& $isOwn $_.Name) } |
    ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -File -Filter "*$off" -ErrorAction SilentlyContinue }
}
$denied = @()
foreach ($f in $exes) {
  $name = $f.Name.Substring(0, $f.Name.Length - $off.Length)
  if ($DryRun) { Write-Output "would rename $($f.FullName) -> $name"; continue }
  try { Rename-Item -LiteralPath $f.FullName -NewName $name -ErrorAction Stop; Write-Output "renamed $($f.FullName) -> $name" }
  catch { $denied += $f.FullName }
}
if ($denied.Count -and -not $ExesOnly) {
  # needs admin; use the app's helper so the UAC prompt says AULA Toolkit
  $exe = Join-Path (Split-Path $PSScriptRoot -Parent) 'AULA Toolkit.exe'
  try {
    if (Test-Path -LiteralPath $exe) { Start-Process -FilePath $exe -ArgumentList '--vendor-exes=on' -Verb RunAs -Wait -WindowStyle Hidden }
    else { Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-ExesOnly') }
  } catch { Write-Output "administrator approval declined" }
}
if ($ExesOnly) { exit }

# HKCU Run
$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$key = Get-Item -LiteralPath $run -ErrorAction SilentlyContinue
if ($key) {
  foreach ($name in $key.GetValueNames()) {
    $value = [string]$key.GetValue($name)
    if (& $isOwn $value) {
      Act "remove AULA Toolkit autostart '$name'" { Remove-ItemProperty -LiteralPath $run -Name $name -ErrorAction Stop }
    } elseif ($name.StartsWith('AULAHUB_OFF_') -and $value -match $hints) {
      $orig = $name.Substring('AULAHUB_OFF_'.Length)
      Act "re-enable autostart '$orig'" {
        New-ItemProperty -LiteralPath $run -Name $orig -Value $value -PropertyType String -Force -ErrorAction Stop | Out-Null
        Remove-ItemProperty -LiteralPath $run -Name $name -ErrorAction Stop
      }
    }
  }
}

# Startup folder
$startup = [Environment]::GetFolderPath('Startup')
Get-ChildItem -LiteralPath $startup -File -Filter "*$off" -ErrorAction SilentlyContinue | Where-Object { $_.Name -match $hints } | ForEach-Object {
  $f = $_
  $name = $f.Name.Substring(0, $f.Name.Length - $off.Length)
  Act "re-enable startup shortcut '$name'" { Rename-Item -LiteralPath $f.FullName -NewName $name -ErrorAction Stop }
}
