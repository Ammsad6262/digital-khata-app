# Publishes the freshly built Android APK to the website so the "Download for
# Android" button serves it.
#
# Run after `bubblewrap build` succeeds:
#   powershell -ExecutionPolicy Bypass -File scripts/android-publish-apk.ps1
#
# It copies the signed APK into public/app/dukhata.apk (the stable URL the
# button points at) and prints the size and SHA-256 so the release can be
# recorded. Committing and pushing that file is what actually ships it, because
# Vercel serves public/ verbatim.

param(
    [string]$ApkPath = "C:\Users\user\dukhata-android\app-release-signed.apk",
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ApkPath)) {
    Write-Error "APK not found at $ApkPath - run `bubblewrap build` first."
    exit 1
}

$destDir = Join-Path $RepoRoot "public\app"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$dest = Join-Path $destDir "dukhata.apk"

Copy-Item $ApkPath $dest -Force

$size = [Math]::Round((Get-Item $dest).Length / 1MB, 2)
$sha = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower()

Write-Output "published: $dest"
Write-Output "size:      $size MB"
Write-Output "sha256:    $sha"
Write-Output ""
Write-Output "Next: git add public/app/dukhata.apk && git commit && git push"
