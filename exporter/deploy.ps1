param(
    [string]$OniManagedDir = "C:\Program Files (x86)\Steam\steamapps\common\OxygenNotIncluded\OxygenNotIncluded_Data\Managed",
    [string]$OutputJson = (Join-Path $PSScriptRoot "out\raw_export.json"),
    [string]$IconManifest = (Join-Path $PSScriptRoot "out\icon_manifest.json"),
    [string]$IconsOutputDir = (Join-Path (Split-Path $PSScriptRoot -Parent) "images"),
    [string]$IconReportPath = (Join-Path $PSScriptRoot "out\icon_export_report.json")
)

$ErrorActionPreference = "Stop"

$proj = Join-Path $PSScriptRoot "OniGuideExporter.csproj"
Write-Host "Building OniGuideExporter..."
dotnet build $proj -c Release -p:OniManagedDir="$OniManagedDir"
if ($LASTEXITCODE -ne 0) {
    throw "dotnet build failed with exit code $LASTEXITCODE"
}

$dllPath = Join-Path $PSScriptRoot "bin\Release\net48\OniGuideExporter.dll"
if (-not (Test-Path $dllPath)) {
    throw "Built DLL not found at $dllPath"
}

$docs = [Environment]::GetFolderPath("MyDocuments")
$modTargetDir = Join-Path $docs "Klei\OxygenNotIncluded\mods\Dev\OniGuideExporter"
New-Item -ItemType Directory -Force -Path $modTargetDir | Out-Null

Copy-Item -Force $dllPath (Join-Path $modTargetDir "OniGuideExporter.dll")
Copy-Item -Force (Join-Path $PSScriptRoot "mod.yaml") (Join-Path $modTargetDir "mod.yaml")
Copy-Item -Force (Join-Path $PSScriptRoot "mod_info.yaml") (Join-Path $modTargetDir "mod_info.yaml")

$cfg = @{
    outputPath       = $OutputJson
    iconManifestPath = $IconManifest
    iconsOutputDir   = $IconsOutputDir
    iconReportPath   = $IconReportPath
} | ConvertTo-Json -Depth 2
Set-Content -Encoding UTF8 -Path (Join-Path $modTargetDir "exporter_config.json") -Value $cfg

Write-Host ""
Write-Host "Deployed mod to: $modTargetDir" -ForegroundColor Green
Write-Host "Export will be written to: $OutputJson" -ForegroundColor Cyan
Write-Host "Missing icons will be exported to: $IconsOutputDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Launch Oxygen Not Included."
Write-Host "  2. Open Mods -> enable 'ONI.guide Data Exporter' (if first time) -> Restart when prompted."
Write-Host "  3. Once the Main Menu loads, the JSON export is written automatically."
