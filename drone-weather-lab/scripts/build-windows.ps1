$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $compiler)) { throw 'The .NET Framework C# compiler is not available on this build machine.' }
$html = Join-Path $project 'Drone-Weather-Lab-0.85-Beta.html'
if (-not (Test-Path $html)) { throw 'Build the standalone HTML first.' }
$output = Join-Path $project 'artifacts'
New-Item -ItemType Directory -Force $output | Out-Null
$exe = Join-Path $output 'Drone-Weather-Lab-0.85-Beta.exe'
& $compiler /nologo /target:winexe /optimize+ /platform:anycpu "/out:$exe" "/resource:$html,Simulator" /reference:System.Windows.Forms.dll (Join-Path $project 'desktop\Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'The Windows launcher build failed.' }
$check = Join-Path $output 'launcher-check'
$process = Start-Process -FilePath $exe -ArgumentList @('--extract-to', ('"' + $check + '"')) -Wait -PassThru
if ($process.ExitCode -ne 0) { throw 'The launcher extraction check failed.' }
$extracted = Join-Path $check 'Drone-Weather-Lab-0.85-Beta.html'
if ((Get-FileHash $extracted).Hash -ne (Get-FileHash $html).Hash) { throw 'The embedded simulator does not match the HTML build.' }
Remove-Item -Recurse -Force $check
Write-Output "Built and checked $exe"
