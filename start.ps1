param(
  [switch]$BootstrapPython,
  [switch]$Embedded,
  [switch]$Prod
)

$argsList = @("scripts/launch.mjs")
if ($BootstrapPython) { $argsList += "--bootstrap-python" }
if ($Embedded) { $argsList += "--embedded" }
if ($Prod) { $argsList += "--prod" } else { $argsList += "--dev" }

Write-Host "Clauset // Local-First Agent Memory & Policy Mesh" -ForegroundColor Cyan
node @argsList
