$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$toolsRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.local-tools"))
New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null

function Get-VerifiedArchive($uri, $destination, $checksum) {
    if (-not (Test-Path -LiteralPath $destination)) {
        Invoke-WebRequest -Uri $uri -OutFile $destination
    }
    $actual = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $checksum.ToLowerInvariant()) {
        throw "The downloaded archive checksum did not match the official release."
    }
}

$javaInfo = Invoke-RestMethod -Uri "https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jre&os=windows"
$javaPackage = $javaInfo[0].binary.package
$javaArchive = Join-Path $toolsRoot "java17.zip"
Get-VerifiedArchive $javaPackage.link $javaArchive $javaPackage.checksum
$javaDirectory = Join-Path $toolsRoot "java17"
if (-not (Test-Path -LiteralPath $javaDirectory)) {
    Expand-Archive -LiteralPath $javaArchive -DestinationPath $javaDirectory
}

$release = Invoke-RestMethod -Uri "https://api.github.com/repos/zaproxy/zaproxy/releases/tags/v2.17.0"
$assetName = "ZAP_2.17.0_Crossplatform.zip"
$zapAsset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
if (-not $zapAsset) { throw "The official ZAP archive was not found." }
$zapChecksum = $null
if ($zapAsset.digest -match '^sha256:([a-f0-9]{64})$') {
    $zapChecksum = $Matches[1]
} else {
    $escaped = [regex]::Escape($assetName)
    $checksumMatch = [regex]::Match($release.body, "$escaped[^\r\n]*?([a-fA-F0-9]{64})")
    if ($checksumMatch.Success) { $zapChecksum = $checksumMatch.Groups[1].Value }
}
if (-not $zapChecksum) { throw "The official ZAP checksum could not be determined." }
$zapArchive = Join-Path $toolsRoot "zap.zip"
Get-VerifiedArchive $zapAsset.browser_download_url $zapArchive $zapChecksum
$zapDirectory = Join-Path $toolsRoot "zap"
if (-not (Test-Path -LiteralPath $zapDirectory)) {
    Expand-Archive -LiteralPath $zapArchive -DestinationPath $zapDirectory
}

Write-Output "The verified Java 17 and ZAP packages are ready in .local-tools."
