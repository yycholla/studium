param([string]$DalamudHome = $env:DALAMUD_HOME)
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    if ($DalamudHome) { $env:DALAMUD_HOME = $DalamudHome }
    & cargo build --locked --release -p chatpendium-native --target x86_64-pc-windows-msvc
    if ($LASTEXITCODE -ne 0) { throw "Rust build failed." }
    & dotnet build plugin/Chatpendium/Chatpendium.csproj -c Release
    if ($LASTEXITCODE -ne 0) { throw "Dalamud adapter build failed." }
    $output = Join-Path $PSScriptRoot "Chatpendium/bin/Release"
    foreach ($file in @("Chatpendium.dll", "Chatpendium.json", "chatpendium_native.dll")) {
        if (!(Test-Path (Join-Path $output $file))) { throw "Build output is missing $file" }
    }
    Write-Host "Built Chatpendium. Add this DLL to Dalamud's Dev Plugin Locations:"
    Write-Host (Join-Path $output "Chatpendium.dll")
} finally {
    Pop-Location
}
