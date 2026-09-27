$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $projectRoot ".node-runtime"
$nodeExe = Join-Path $runtimeDir "node.exe"

if (Test-Path $nodeExe) {
    Write-Host "Node.js portabil este deja pregatit."
    exit 0
}

Write-Host "Descarc automat Node.js LTS portabil..."
$releases = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
$release = $releases |
    Where-Object { $_.lts -and ($_.files -contains "win-x64-zip") } |
    Select-Object -First 1

if (-not $release) {
    throw "Nu am gasit o versiune Node.js LTS pentru Windows x64."
}

$version = $release.version
$archiveName = "node-$version-win-x64.zip"
$downloadUrl = "https://nodejs.org/dist/$version/$archiveName"
$archivePath = Join-Path $projectRoot $archiveName
$extractRoot = Join-Path $projectRoot ".node-extract"
$extractedDir = Join-Path $extractRoot "node-$version-win-x64"

Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath

if (Test-Path $extractRoot) {
    Remove-Item -LiteralPath $extractRoot -Recurse -Force
}

Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot -Force
Move-Item -LiteralPath $extractedDir -Destination $runtimeDir
Remove-Item -LiteralPath $extractRoot -Recurse -Force
Remove-Item -LiteralPath $archivePath -Force

if (-not (Test-Path $nodeExe)) {
    throw "Node.js portabil nu a putut fi pregatit."
}

Write-Host "Node.js $version este pregatit."
