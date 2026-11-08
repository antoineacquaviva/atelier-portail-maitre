#requires -Version 7.2
[CmdletBinding()]
param(
    [string]$HostName,
    [string]$User = 'opc',
    [int]$Port = 22,
    [string]$IdentityFile,
    [string]$RemoteWorkspace,
    [string]$Destination
)
$ErrorActionPreference = 'Stop'

function Assert-PrivateDestination([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'DESTINATION_LINK' }
    if ($IsWindows) {
        $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl = Get-Acl -LiteralPath $Path
        $acl.SetAccessRuleProtection($true, $false)
        $rule = [Security.AccessControl.FileSystemAccessRule]::new(
            $sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
        Set-Acl -LiteralPath $Path -AclObject $acl
    } else {
        # Permits executing the fixture tests on PowerShell/Linux as well.
        & chmod 700 -- $Path
        if ($LASTEXITCODE -ne 0) { throw 'DESTINATION_PERMISSIONS' }
    }
}

function Receive-PreparationFile {
    param([string]$RemotePath, [string]$LocalPath, [hashtable]$Connection)
    if (Test-Path -LiteralPath $LocalPath) { throw 'LOCAL_FILE_EXISTS' }
    if ($RemotePath -notmatch '^/[A-Za-z0-9_./-]+$' -or $RemotePath.Contains('..')) { throw 'REMOTE_PATH' }
    $scpArgs = @('-q', '-P', [string]$Connection.Port,
        '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes')
    if ($Connection.IdentityFile) { $scpArgs += @('-i', $Connection.IdentityFile) }
    $scpArgs += @('--', "$($Connection.User)@$($Connection.HostName):$RemotePath", $LocalPath)
    & scp @scpArgs 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'TRANSFER_FAILED' }
    if (-not (Test-Path -LiteralPath $LocalPath -PathType Leaf)) { throw 'TRANSFER_MISSING' }
}

function Read-PreparationChecksums {
    param([string]$Manifest, [string]$RemoteBase, [string[]]$Expected)
    $entries = @{}
    foreach ($line in [IO.File]::ReadAllLines($Manifest)) {
        if ($line -notmatch '^([a-fA-F0-9]{64}) [ *](.+)$') { throw 'MANIFEST_FORMAT' }
        $hash = $Matches[1].ToLowerInvariant()
        $name = $Matches[2]
        if ($name.StartsWith('./', [StringComparison]::Ordinal)) { $name = $name.Substring(2) }
        if ($name.StartsWith('/')) {
            $prefix = $RemoteBase.TrimEnd('/') + '/'
            if (-not $name.StartsWith($prefix, [StringComparison]::Ordinal)) { throw 'MANIFEST_PATH' }
            $name = $name.Substring($prefix.Length)
        }
        if ($name -notin $Expected -or $entries.ContainsKey($name)) { throw 'MANIFEST_MEMBERS' }
        $entries[$name] = $hash
    }
    if ($entries.Count -ne $Expected.Count) { throw 'MANIFEST_INCOMPLETE' }
    return $entries
}

function Receive-PreparationBundle {
    param([string]$RemoteBase, [string]$LocalDirectory, [string[]]$Expected, [hashtable]$Connection)
    New-Item -ItemType Directory -Path $LocalDirectory -ErrorAction Stop | Out-Null
    $manifest = Join-Path $LocalDirectory 'SHA256SUMS'
    Receive-PreparationFile "$RemoteBase/SHA256SUMS" $manifest $Connection
    $entries = Read-PreparationChecksums $manifest $RemoteBase $Expected
    foreach ($name in $Expected) {
        $path = Join-Path $LocalDirectory $name
        Receive-PreparationFile "$RemoteBase/$name" $path $Connection
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entries[$name]) {
            throw 'CHECKSUM_MISMATCH'
        }
    }
}

function Invoke-PreparationDownload {
    param([string]$HostName, [string]$User, [int]$Port, [string]$IdentityFile,
          [string]$RemoteWorkspace, [string]$Destination)
    if ($HostName -notmatch '^[A-Za-z0-9][A-Za-z0-9.-]*$' -or $User -notmatch '^[a-z][a-z0-9_-]*$' -or
        $Port -lt 1 -or $Port -gt 65535) { throw 'CONNECTION_PARAMETERS' }
    if ($RemoteWorkspace -notmatch '^/home/opc/atelier-preparation-1c3-[A-Za-z0-9-]+$') { throw 'WORKSPACE_PARAMETERS' }
    if ([string]::IsNullOrWhiteSpace($Destination)) { throw 'DESTINATION_REQUIRED' }
    $full = [IO.Path]::GetFullPath($Destination)
    if (Test-Path -LiteralPath $full) { throw 'DESTINATION_EXISTS' }
    $parent = [IO.Directory]::GetParent($full)
    if ($null -eq $parent -or -not $parent.Exists) { throw 'DESTINATION_PARENT' }
    $current = $parent
    while ($null -ne $current) {
        if ($current.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'DESTINATION_LINK' }
        $current = $current.Parent
    }
    if ($IdentityFile -and -not (Test-Path -LiteralPath $IdentityFile -PathType Leaf)) { throw 'IDENTITY_FILE' }
    New-Item -ItemType Directory -Path $full -ErrorAction Stop | Out-Null
    Assert-PrivateDestination $full
    $connection = @{HostName=$HostName; User=$User; Port=$Port; IdentityFile=$IdentityFile}
    $old = '/home/opc/atelier-preparation-1c2-20261108-184942'
    Receive-PreparationBundle $old (Join-Path $full 'sauvegarde-existante') @('applications.tar','configurations.tar','registre.json') $connection
    $pointer = Join-Path $full 'latest-export.json'
    Receive-PreparationFile "$RemoteWorkspace/latest-export.json" $pointer $connection
    $data = Get-Content -LiteralPath $pointer -Raw | ConvertFrom-Json
    if (@($data.PSObject.Properties.Name).Count -ne 1 -or $data.directory -notmatch '^export-[0-9]{5}$') { throw 'EXPORT_POINTER' }
    Receive-PreparationBundle "$RemoteWorkspace/$($data.directory)" (Join-Path $full 'preparation') @('report.json','report.txt','preparation.tar') $connection
    Write-Output 'Deux ensembles téléchargés et SHA-256 vérifiés. Aucun fichier préexistant écrasé.'
    Write-Output 'Les archives peuvent contenir des configurations privées : conserver ce dossier privé, hors GitHub.'
}

# Dot-sourcing loads only functions for fixture tests; it never connects.
if ($MyInvocation.InvocationName -ne '.') {
    try {
        Invoke-PreparationDownload $HostName $User $Port $IdentityFile $RemoteWorkspace $Destination
    } catch {
        # Do not print raw SSH/scp errors, endpoints, key paths or payloads.
        [Console]::Error.WriteLine('Récupération arrêtée. Aucun ensemble incomplet ne doit être utilisé ; consulter la notice.')
        exit 1
    }
}
