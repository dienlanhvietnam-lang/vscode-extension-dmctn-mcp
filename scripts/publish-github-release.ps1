#Requires -Version 5.1
<#
.SYNOPSIS
  Publish local-coding-tools-mcp customer ZIP to GitHub Release (requires gh auth login).
#>
param(
  [string]$Version = "0.7.0",
  [string]$McpRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\local-coding-tools-mcp")).Path,
  [string]$Repo = "devgol/local-coding-tools-mcp"
)

$ErrorActionPreference = "Stop"
$zipName = "local-coding-tools-mcp-v$Version-customer.zip"
$zipPath = Join-Path $McpRoot "release\$zipName"
$tag = "v$Version"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "FAIL: gh CLI not found. Install: https://cli.github.com/" -ForegroundColor Red
  exit 1
}

if (-not $env:GH_TOKEN) {
  gh auth status 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: Not logged in. Run: gh auth login" -ForegroundColor Red
    Write-Host "      Or set GH_TOKEN with repo scope." -ForegroundColor Yellow
    exit 1
  }
}

if (-not (Test-Path $zipPath)) {
  Write-Host "Building customer ZIP..." -ForegroundColor Yellow
  & (Join-Path $McpRoot "scripts\package-customer-zip.ps1") -Version $Version -ProjectRoot $McpRoot
}

Write-Host "Creating release $tag with asset $zipName" -ForegroundColor Cyan
gh release create $tag $zipPath `
  --repo $Repo `
  --title "local-coding-tools-mcp $Version" `
  --notes-file (Join-Path $McpRoot "release\RELEASE_NOTES-v$Version.md") `
  2>&1

if ($LASTEXITCODE -ne 0) {
  Write-Host "Release may exist — uploading asset only..." -ForegroundColor Yellow
  gh release upload $tag $zipPath --repo $Repo --clobber
}

$url = "https://github.com/$Repo/releases/download/$tag/$zipName"
Write-Host ""
Write-Host "[PASS] Release URL:" -ForegroundColor Green
Write-Host "  $url"
Write-Host ""
Write-Host "Next: node scripts/sync-server-manifest.mjs"
