[CmdletBinding()]
param(
    [switch] $Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$pluginFolderName = 'My-Blocks-Launcher'
$projectRoot = $PSScriptRoot
$pluginFileName = 'my-favorite-blocks.php'
$pluginFile = Join-Path $projectRoot $pluginFileName
$releaseDirectory = Join-Path $projectRoot 'release'
$temporaryRoot = $null

$excludedDirectoryNames = @(
    '.git',
    '.github',
    'docs',
    'release',
    'node_modules',
    'dist'
)

$excludedFileNames = @(
    '.gitattributes',
    '.gitignore',
    'AGENTS.md',
    'PROJECT-BRIEF.md',
    'COPY-EXISTING-FILES-HERE.md',
    'build-release.ps1',
    'README.md',
    '.env',
    'desktop.ini',
    'Thumbs.db',
    '.DS_Store'
)

function Get-ProjectRelativePath {
    param(
        [Parameter(Mandatory)]
        [string] $FullPath
    )

    $rootWithSeparator = $projectRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    if (-not $FullPath.StartsWith($rootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside the project root: $FullPath"
    }

    return $FullPath.Substring($rootWithSeparator.Length)
}

function Test-ExcludedPath {
    param(
        [Parameter(Mandatory)]
        [System.IO.FileSystemInfo] $Item
    )

    $relativePath = Get-ProjectRelativePath -FullPath $Item.FullName
    $segments = $relativePath -split '[\\/]'

    foreach ($segment in $segments) {
        if ($excludedDirectoryNames -contains $segment) {
            return $true
        }
    }

    if (-not $Item.PSIsContainer) {
        if ($excludedFileNames -contains $Item.Name) {
            return $true
        }

        if ($Item.Name -like '.env.*' -or $Item.Name -like '*.zip' -or $Item.Name -like '*.log') {
            return $true
        }
    }

    return $false
}

function New-ReleaseArchive {
    param(
        [Parameter(Mandatory)]
        [string] $SourceDirectory,

        [Parameter(Mandatory)]
        [string] $ZipPath
    )

    $sourceRootWithSeparator = $SourceDirectory.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    $archive = [System.IO.Compression.ZipFile]::Open(
        $ZipPath,
        [System.IO.Compression.ZipArchiveMode]::Create
    )
    try {
        $sourceFiles = Get-ChildItem -LiteralPath $SourceDirectory -Recurse -Force -File
        foreach ($sourceFile in $sourceFiles) {
            $entryName = $sourceFile.FullName.Substring($sourceRootWithSeparator.Length).Replace('\', '/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive,
                $sourceFile.FullName,
                $entryName,
                [System.IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
    }
    finally {
        $archive.Dispose()
    }
}

function Assert-ReleaseArchive {
    param(
        [Parameter(Mandatory)]
        [string] $ZipPath,

        [Parameter(Mandatory)]
        [string] $ExpectedVersion,

        [Parameter(Mandatory)]
        [string] $ExpectedUpdateUri
    )

    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        $rawEntryPaths = @($archive.Entries | ForEach-Object { $_.FullName })

        $pluginEntryPath = "$pluginFolderName/$pluginFileName"
        $pluginEntry = $archive.Entries | Where-Object {
            $_.FullName.Replace('\', '/') -ceq $pluginEntryPath
        } | Select-Object -First 1

        if ($null -eq $pluginEntry) {
            throw "$pluginFileName is missing from the release ZIP."
        }

        $reader = [System.IO.StreamReader]::new($pluginEntry.Open())
        try {
            $archivedPluginSource = $reader.ReadToEnd()
        }
        finally {
            $reader.Dispose()
        }
    }
    finally {
        $archive.Dispose()
    }

    $invalidSeparators = @($rawEntryPaths | Where-Object { $_.Contains('\') })
    if ($invalidSeparators.Count -gt 0) {
        throw "ZIP entry paths must use forward slashes. Invalid entry: $($invalidSeparators[0])"
    }

    $entryPaths = @($rawEntryPaths | ForEach-Object { $_.Replace('\', '/') })

    if ($entryPaths.Count -eq 0) {
        throw 'The release ZIP is empty.'
    }

    $topLevelPrefix = "$pluginFolderName/"
    $invalidTopLevelEntries = @(
        $entryPaths | Where-Object {
            $_ -and
            -not $_.Equals($topLevelPrefix, [System.StringComparison]::Ordinal) -and
            -not $_.StartsWith($topLevelPrefix, [System.StringComparison]::Ordinal)
        }
    )
    if ($invalidTopLevelEntries.Count -gt 0) {
        throw "The top-level folder must be $pluginFolderName. Invalid entry: $($invalidTopLevelEntries[0])"
    }

    $requiredPluginEntry = "$pluginFolderName/$pluginFileName"
    if (-not ($entryPaths -ccontains $requiredPluginEntry)) {
        throw "$pluginFileName is missing from the release ZIP."
    }

    $requiredUpdaterEntry = "$pluginFolderName/includes/updater/class-github-release-updater.php"
    if (-not ($entryPaths -ccontains $requiredUpdaterEntry)) {
        throw 'The GitHub Release updater is missing from the release ZIP.'
    }

    $archivedVersionMatch = [regex]::Match(
        $archivedPluginSource,
        '(?mi)^\s*\*?\s*Version:\s*(?<version>[^\r\n]+?)\s*$'
    )
    if (-not $archivedVersionMatch.Success) {
        throw "Could not find the Version header in the archived $pluginFileName."
    }
    $archivedVersion = $archivedVersionMatch.Groups['version'].Value.Trim()
    if (-not $archivedVersion.Equals($ExpectedVersion, [System.StringComparison]::Ordinal)) {
        throw "Archived plugin Version mismatch. Expected $ExpectedVersion, found $archivedVersion."
    }

    $archivedUpdateUriMatch = [regex]::Match(
        $archivedPluginSource,
        '(?mi)^\s*\*?\s*Update URI:\s*(?<uri>[^\r\n]+?)\s*$'
    )
    if (-not $archivedUpdateUriMatch.Success) {
        throw "Could not find the Update URI header in the archived $pluginFileName."
    }
    $archivedUpdateUri = $archivedUpdateUriMatch.Groups['uri'].Value.Trim().TrimEnd('/')
    if (-not $archivedUpdateUri.Equals($ExpectedUpdateUri.TrimEnd('/'), [System.StringComparison]::Ordinal)) {
        throw "Archived plugin Update URI mismatch. Expected $ExpectedUpdateUri, found $archivedUpdateUri."
    }

    foreach ($entryPath in $entryPaths) {
        if (-not $entryPath.StartsWith($topLevelPrefix, [System.StringComparison]::Ordinal)) {
            continue
        }

        $relativeEntryPath = $entryPath.Substring($topLevelPrefix.Length).TrimEnd('/')
        if (-not $relativeEntryPath) {
            continue
        }

        $segments = $relativeEntryPath -split '/'
        foreach ($segment in $segments) {
            if ($excludedDirectoryNames -contains $segment) {
                throw "A forbidden directory is included in the release ZIP: $entryPath"
            }
        }

        $entryFileName = $segments[-1]
        if (
            $excludedFileNames -contains $entryFileName -or
            $entryFileName -like '.env.*' -or
            $entryFileName -like '*.zip' -or
            $entryFileName -like '*.log'
        ) {
            throw "A forbidden file is included in the release ZIP: $entryPath"
        }

        $duplicatedFolderPrefix = "$pluginFolderName/$pluginFolderName/"
        if ($entryPath.StartsWith($duplicatedFolderPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "A duplicated $pluginFolderName/$pluginFolderName structure was detected: $entryPath"
        }
    }

    Write-Host "  [OK] Top-level folder: $pluginFolderName" -ForegroundColor Green
    Write-Host "  [OK] Required file: $requiredPluginEntry" -ForegroundColor Green
    Write-Host "  [OK] Required updater: $requiredUpdaterEntry" -ForegroundColor Green
    Write-Host "  [OK] Version header: $ExpectedVersion" -ForegroundColor Green
    Write-Host "  [OK] Update URI: $ExpectedUpdateUri" -ForegroundColor Green
    Write-Host '  [OK] Forbidden development files are excluded' -ForegroundColor Green
    Write-Host "  [OK] No duplicated $pluginFolderName/$pluginFolderName structure" -ForegroundColor Green
}

try {
    if (-not (Test-Path -LiteralPath $pluginFile -PathType Leaf)) {
        throw "Plugin file was not found: $pluginFile"
    }

    $pluginSource = Get-Content -LiteralPath $pluginFile -Raw -Encoding UTF8
    $versionMatch = [regex]::Match(
        $pluginSource,
        '(?mi)^\s*\*?\s*Version:\s*(?<version>[^\r\n]+?)\s*$'
    )

    if (-not $versionMatch.Success) {
        throw "Could not find the Version header in $pluginFileName."
    }

    $version = $versionMatch.Groups['version'].Value.Trim()
    if ($version -notmatch '^[0-9A-Za-z][0-9A-Za-z._-]*$') {
        throw "The Version header contains characters that cannot be used safely in a ZIP filename: $version"
    }

    $updateUriMatch = [regex]::Match(
        $pluginSource,
        '(?mi)^\s*\*?\s*Update URI:\s*(?<uri>[^\r\n]+?)\s*$'
    )
    if (-not $updateUriMatch.Success) {
        throw "Could not find the Update URI header in $pluginFileName."
    }
    $updateUri = $updateUriMatch.Groups['uri'].Value.Trim()

    New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
    $zipPath = Join-Path $releaseDirectory "$pluginFolderName-$version.zip"

    if ((Test-Path -LiteralPath $zipPath) -and -not $Force) {
        throw "The release ZIP already exists: $zipPath. Use -Force only when overwriting it is intentional."
    }

    $temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("my-blocks-launcher-release-" + [guid]::NewGuid().ToString('N'))
    $stagingRoot = Join-Path $temporaryRoot 'staging'
    $stagingPluginRoot = Join-Path $stagingRoot $pluginFolderName
    $candidateZipPath = Join-Path $temporaryRoot "$pluginFolderName-$version.zip"
    New-Item -ItemType Directory -Path $stagingPluginRoot -Force | Out-Null

    $items = Get-ChildItem -LiteralPath $projectRoot -Recurse -Force
    foreach ($item in $items) {
        if (Test-ExcludedPath -Item $item) {
            continue
        }

        $relativePath = Get-ProjectRelativePath -FullPath $item.FullName
        $destination = Join-Path $stagingPluginRoot $relativePath

        if ($item.PSIsContainer) {
            New-Item -ItemType Directory -Path $destination -Force | Out-Null
        }
        else {
            $destinationDirectory = Split-Path -Parent $destination
            New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
            Copy-Item -LiteralPath $item.FullName -Destination $destination -Force
        }
    }

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    New-ReleaseArchive -SourceDirectory $stagingRoot -ZipPath $candidateZipPath

    Assert-ReleaseArchive -ZipPath $candidateZipPath -ExpectedVersion $version -ExpectedUpdateUri $updateUri

    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }
    Move-Item -LiteralPath $candidateZipPath -Destination $zipPath

    Write-Host 'Release ZIP validation completed successfully.' -ForegroundColor Green
    Write-Host "Release ZIP created successfully: $zipPath" -ForegroundColor Green
}
catch {
    Write-Error "Failed to build the release ZIP. $($_.Exception.Message)"
    exit 1
}
finally {
    if ($temporaryRoot -and (Test-Path -LiteralPath $temporaryRoot)) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
