# Deploy Firestore security rules (and indexes) for Leap — run from repo root.
# Usage:  .\scripts\deploy-firestore-rules.ps1
#         .\scripts\deploy-firestore-rules.ps1 -ProjectId leap-e4cce

param(
  [string]$ProjectId = "leap-e4cce"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
  Write-Error "firebase CLI not found. Install: npm install -g firebase-tools"
}

Write-Host "Deploying Firestore rules + indexes to project: $ProjectId"
firebase deploy --only firestore:rules,firestore:indexes --project $ProjectId

if ($LASTEXITCODE -ne 0) {
  Write-Error "firebase deploy failed (exit $LASTEXITCODE)"
}

Write-Host "Done. Firestore rules are live for $ProjectId."
