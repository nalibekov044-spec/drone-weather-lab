$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$output = Join-Path $project 'artifacts'
node (Join-Path $project 'scripts\embed-simulator.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Could not embed the simulator.' }
$finder = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$installation = & $finder -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $installation) { throw 'MSVC build tools are missing on the build machine.' }
$environment = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$exe = Join-Path $output 'Drone-Weather-Lab-0.9-Beta.exe'
$source = Join-Path $project 'desktop\Launcher.c'
$object = Join-Path $output 'launcher.obj'
$command = 'call "' + $environment + '" && cl /nologo /O2 /GS- /Zl /utf-8 /std:c11 /TC /I"' + $output + '" /Fo"' + $object + '" /Fe"' + $exe + '" "' + $source + '" /link /entry:LauncherStart /subsystem:windows /nodefaultlib kernel32.lib shell32.lib user32.lib'
cmd /c $command
if ($LASTEXITCODE -ne 0) { throw 'The Windows build failed.' }
$process = Start-Process -FilePath $exe -ArgumentList '--extract-only' -Wait -PassThru
if ($process.ExitCode -ne 0) { throw 'The Windows extraction check failed.' }
$extracted = Join-Path $env:TEMP 'DroneWeatherLab-0.9-Beta\Drone-Weather-Lab-0.9-Beta.html'
$html = Join-Path $project 'Drone-Weather-Lab-0.9-Beta.html'
if ((Get-FileHash $extracted).Hash -ne (Get-FileHash $html).Hash) { throw 'The embedded HTML does not match.' }
Write-Output "Built and checked $exe"
