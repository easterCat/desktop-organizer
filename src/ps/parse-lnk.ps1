param([string]$Arg)
$sh = New-Object -ComObject WScript.Shell
try {
    $lnk = $sh.CreateShortcut($Arg)
    Write-Output "$($lnk.TargetPath)|$($lnk.IconLocation)|$($lnk.WorkingDirectory)|$($lnk.Arguments)"
} finally {
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($sh) | Out-Null
}
