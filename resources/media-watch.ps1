# Prints `playing` / `stopped` from the Windows media controls (Spotify, browsers, most players).
# Polls every second, prints only changes.
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } |
  Select-Object -First 1
$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$task = $asTask.MakeGenericMethod($managerType).Invoke($null, @($managerType::RequestAsync()))
$null = $task.Wait(-1)
$manager = $task.Result
$playingStatus = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing

$last = ''
while ($true) {
  $state = 'stopped'
  try {
    foreach ($session in $manager.GetSessions()) {
      if ($session.GetPlaybackInfo().PlaybackStatus -eq $playingStatus) { $state = 'playing'; break }
    }
  } catch { }
  if ($state -ne $last) {
    [Console]::Out.WriteLine($state)
    [Console]::Out.Flush()
    $last = $state
  }
  Start-Sleep -Milliseconds 1000
}
