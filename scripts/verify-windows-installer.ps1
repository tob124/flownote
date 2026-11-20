$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Run this installation check only on the disposable Windows CI runner.' }

$installer = @(Get-ChildItem -LiteralPath release -Filter '*Setup-x64.exe')
if ($installer.Count -ne 1) { throw 'Expected exactly one Windows installer' }
$directory = Join-Path $env:RUNNER_TEMP 'flownote-install-check'
$executable = Join-Path $directory 'FlowNote.exe'
$uninstaller = Join-Path $directory 'Uninstall FlowNote.exe'
$desktop = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'FlowNote.lnk'
$start = Join-Path ([Environment]::GetFolderPath('Programs')) 'FlowNote.lnk'
$shortcutShell = New-Object -ComObject WScript.Shell
$packageHash = (Get-FileHash -LiteralPath release/win-unpacked/FlowNote.exe).Hash

function Install-FlowNote([string] $installerPath) {
    $process = Start-Process -FilePath $installerPath -ArgumentList @('/S', "/D=$directory") -PassThru -Wait -WindowStyle Hidden
    if ($process.ExitCode -ne 0 -or !(Test-Path -LiteralPath $executable)) {
        throw "Install failed with exit code $($process.ExitCode)"
    }
}

function Assert-FlowNoteShortcuts {
    foreach ($location in @($desktop, $start)) {
        if (!(Test-Path -LiteralPath $location)) { throw "Missing shortcut $location" }
        $shortcut = $shortcutShell.CreateShortcut($location)
        if ($shortcut.TargetPath -ne $executable) { throw "Incorrect target for $location" }
        $iconSource = $shortcut.IconLocation -replace ',\s*-?\d+$', ''
        if ($iconSource -and $iconSource -ne $executable) { throw "Incorrect icon resource for $location" }
    }
    if ((Get-FileHash -LiteralPath $executable).Hash -ne $packageHash) { throw 'Installed FlowNote.exe differs from the packaged executable' }
    node scripts/assert-windows-icon.cjs $executable resources/icon.ico
    if ($LASTEXITCODE -ne 0) { throw 'Failed to verify the embedded Windows shortcut icon' }
}

Install-FlowNote $installer[0].FullName
Assert-FlowNoteShortcuts
Write-Output 'Fresh per-user install and both shortcut icons verified'

# Exercise upgrading from the currently published Windows version.
$previous = Join-Path $env:RUNNER_TEMP 'flownote-previous-release'
gh release download --repo $env:GITHUB_REPOSITORY --pattern '*Setup-x64.exe' --dir $previous
if ($LASTEXITCODE -eq 0) {
    $baseline = @(Get-ChildItem -LiteralPath $previous -Filter '*Setup-x64.exe')
    if ($baseline.Count -ne 1) { throw 'Expected one installer in the previous release' }
    $process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -PassThru -Wait -WindowStyle Hidden
    if ($process.ExitCode -ne 0) { throw 'Cannot prepare a fresh installation of the previous release' }
    Install-FlowNote $baseline[0].FullName
    Write-Output "Installed previous release $($baseline[0].Name)"
} else { throw 'Cannot download the previous published Windows installer for the upgrade test' }

$profileMarker = Join-Path $env:USERPROFILE '.flownote_config.json'
Set-Content -LiteralPath $profileMarker -Value '{"categories":["upgrade marker"]}'
Install-FlowNote $installer[0].FullName
Assert-FlowNoteShortcuts
if ((Get-Content -LiteralPath $profileMarker) -ne '{"categories":["upgrade marker"]}') { throw 'Existing settings changed during upgrade' }
Write-Output 'Overwrite upgrade and both shortcut icons verified'
"FLOWNOTE_TEST_EXECUTABLE=$executable" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
