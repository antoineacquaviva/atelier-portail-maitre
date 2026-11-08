#requires -Version 7.2
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../../scripts/Get-OraclePreparation.ps1')
$script:realReceiver = (Get-Command Receive-PreparationFile).ScriptBlock
$root = Join-Path ([IO.Path]::GetTempPath()) ('oracle-ps-fixtures-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$script:existing = '/home/opc/atelier-preparation-1c2-20261108-184942'
$script:workspace = '/home/opc/atelier-preparation-1c3-fixture'
$script:remote = Join-Path $root 'remote'
New-Item -ItemType Directory -Path $script:remote | Out-Null

function Assert-True([bool]$Condition, [string]$Label) {
    if (-not $Condition) { throw "ASSERTION: $Label" }
}
function Assert-Refused([scriptblock]$Body, [string]$Code) {
    $refused = $false
    try { & $Body | Out-Null } catch { $refused = $_.Exception.Message -eq $Code }
    Assert-True $refused $Code
}
function Make-Bundle([string]$Folder, [string[]]$Names, [string]$AbsoluteBase='') {
    New-Item -ItemType Directory -Path $Folder | Out-Null
    $lines = @()
    foreach ($name in $Names) {
        $file = Join-Path $Folder $name
        [IO.File]::WriteAllText($file, "fixture private SECRET_SENTINEL $name")
        $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
        $entry = if ($AbsoluteBase) { "$AbsoluteBase/$name" } else { $name }
        $lines += "$hash  $entry"
    }
    [IO.File]::WriteAllText((Join-Path $Folder 'SHA256SUMS'), ($lines -join "`n") + "`n")
}

# Fixture-only transport replaces scp; the production entry has no mock flag.
function Receive-PreparationFile {
    param([string]$RemotePath, [string]$LocalPath, [hashtable]$Connection)
    if (Test-Path -LiteralPath $LocalPath) { throw 'LOCAL_FILE_EXISTS' }
    if ($RemotePath.StartsWith($script:existing + '/')) {
        $source = Join-Path $script:remote ('old/' + $RemotePath.Substring($script:existing.Length+1))
    } elseif ($RemotePath.StartsWith($script:workspace + '/')) {
        $source = Join-Path $script:remote ('new/' + $RemotePath.Substring($script:workspace.Length+1))
    } else { throw 'REMOTE_PATH' }
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'TRANSFER_FAILED' }
    [IO.File]::Copy($source, $LocalPath, $false)
}

try {
    Make-Bundle (Join-Path $script:remote 'old') @('applications.tar','configurations.tar','registre.json') $script:existing
    New-Item -ItemType Directory -Path (Join-Path $script:remote 'new') | Out-Null
    Make-Bundle (Join-Path $script:remote 'new/export-00000') @('report.json','report.txt','preparation.tar')
    $pointer = Join-Path $script:remote 'new/latest-export.json'
    [IO.File]::WriteAllText($pointer, '{"directory":"export-00000"}')
    $destination = Join-Path $root 'downloaded'
    $output = @(Invoke-PreparationDownload 'fixture.invalid' 'opc' 22 '' $script:workspace $destination)
    Assert-True (($output -join "`n") -notmatch 'SECRET_SENTINEL') 'no secret in output'
    Assert-True ((Get-ChildItem -LiteralPath (Join-Path $destination 'sauvegarde-existante') -File).Count -eq 4) 'old archive plus checksums'
    Assert-True ((Get-ChildItem -LiteralPath (Join-Path $destination 'preparation') -File).Count -eq 4) 'new outputs plus checksums'
    Write-Output 'PASS: actual PowerShell copy orchestration and SHA256 checks, absolute/relative manifests, private destination, no secret output'
    $before = (Get-FileHash -LiteralPath (Join-Path $destination 'sauvegarde-existante/applications.tar')).Hash
    Assert-Refused { Invoke-PreparationDownload 'fixture.invalid' 'opc' 22 '' $script:workspace $destination } 'DESTINATION_EXISTS'
    Assert-True ($before -eq (Get-FileHash -LiteralPath (Join-Path $destination 'sauvegarde-existante/applications.tar')).Hash) 'existing file unchanged'
    Write-Output 'PASS: existing Windows destination refused without overwriting'
    [IO.File]::WriteAllText((Join-Path $script:remote 'old/applications.tar'), 'tampered')
    Assert-Refused { Invoke-PreparationDownload 'fixture.invalid' 'opc' 22 '' $script:workspace (Join-Path $root 'tampered') } 'CHECKSUM_MISMATCH'
    Write-Output 'PASS: checksum failure stops recovery'
    Make-Bundle (Join-Path $script:remote 'replacement') @('applications.tar','configurations.tar','registre.json') $script:existing
    foreach ($name in @('applications.tar','configurations.tar','registre.json','SHA256SUMS')) {
        Copy-Item -LiteralPath (Join-Path $script:remote "replacement/$name") -Destination (Join-Path $script:remote "old/$name") -Force
    }
    [IO.File]::WriteAllText($pointer, '{"directory":"../escape"}')
    Assert-Refused { Invoke-PreparationDownload 'fixture.invalid' 'opc' 22 '' $script:workspace (Join-Path $root 'bad-pointer') } 'EXPORT_POINTER'
    Write-Output 'PASS: export pointer traversal refused'
    [IO.File]::WriteAllText((Join-Path $script:remote 'old/SHA256SUMS'), ('a'*64) + '  ../escape' + "`n")
    Assert-Refused { Invoke-PreparationDownload 'fixture.invalid' 'opc' 22 '' $script:workspace (Join-Path $root 'bad-manifest') } 'MANIFEST_MEMBERS'
    Write-Output 'PASS: manifest traversal refused'
    Assert-Refused { Invoke-PreparationDownload '-unsafe' 'opc' 22 '' $script:workspace (Join-Path $root 'bad-host') } 'CONNECTION_PARAMETERS'
    Assert-Refused { Invoke-PreparationDownload 'fixture.invalid' 'opc' 22 '' '/etc' (Join-Path $root 'bad-workspace') } 'WORKSPACE_PARAMETERS'
    Write-Output 'PASS: unsafe connection/workspace parameters refused'
    function scp {
        $script:scpArguments = @($args)
        [IO.File]::Copy((Join-Path $script:remote 'old/registre.json'), [string]$args[-1], $false)
        $global:LASTEXITCODE = 0
    }
    $received = Join-Path $root 'scp-wrapper-test.json'
    & $script:realReceiver "$script:existing/registre.json" $received @{HostName='fixture.invalid';User='opc';Port=22;IdentityFile=''}
    Assert-True ($script:scpArguments -contains 'StrictHostKeyChecking=yes') 'strict host key'
    Assert-True ($script:scpArguments -contains 'BatchMode=yes') 'no password argument'
    Assert-True ($script:scpArguments -contains "opc@fixture.invalid:$script:existing/registre.json") 'exact remote argument'
    Assert-Refused { & $script:realReceiver "$script:existing/registre.json" $received @{HostName='fixture.invalid';User='opc';Port=22;IdentityFile=''} } 'LOCAL_FILE_EXISTS'
    Write-Output 'PASS: production scp wrapper arguments and no-overwrite checked with fake scp executable'
    Write-Output 'PowerShell fixtures: 7 groups passed. scp/SSH transport mocked; Windows ACL branch requires a Windows host.'
} finally {
    # Delete only this test's generated fixture directory, never user data.
    Remove-Item -LiteralPath $root -Recurse -Force
}
