param([string]$Arg)
Add-Type -AssemblyName System.Drawing

# 判断文件类型
$ext = [System.IO.Path]::GetExtension($Arg).ToLower()

if ($ext -eq '.ico') {
    # 直接读取 .ico 文件
    try {
        $icon = New-Object System.Drawing.Icon($Arg)
        $bmp = $icon.ToBitmap()
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        [Convert]::ToBase64String($ms.ToArray())
        $ms.Dispose()
        $bmp.Dispose()
        $icon.Dispose()
    } catch {
        # 尝试用 Image.FromFile 读取
        try {
            $img = [System.Drawing.Image]::FromFile($Arg)
            $ms = New-Object System.IO.MemoryStream
            $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
            [Convert]::ToBase64String($ms.ToArray())
            $ms.Dispose()
            $img.Dispose()
        } catch {}
    }
} elseif ($ext -eq '.exe' -or $ext -eq '.dll') {
    # 从 exe/dll 提取关联图标
    try {
        $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($Arg)
        if ($icon) {
            $bmp = $icon.ToBitmap()
            $ms = New-Object System.IO.MemoryStream
            $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
            [Convert]::ToBase64String($ms.ToArray())
            $ms.Dispose()
            $bmp.Dispose()
            $icon.Dispose()
        }
    } catch {}
} else {
    # 其他文件类型（.lnk, .cmd, .bat 等）
    # 对 .lnk 文件：先通过 WScript.Shell COM 解析快捷方式获取目标路径，
    # 再从目标可执行文件提取图标，这比直接对 .lnk 调用 ExtractAssociatedIcon 更可靠
    $gotIcon = $false

    if ($ext -eq '.lnk') {
        try {
            $wsh = New-Object -ComObject WScript.Shell
            $lnk = $wsh.CreateShortcut($Arg)
            $targetPath = $lnk.TargetPath
            $iconLocation = $lnk.IconLocation
            [System.Runtime.InteropServices.Marshal]::ReleaseComObject($lnk) | Out-Null
            [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wsh) | Out-Null

            # 优先从 IconLocation 指定的路径提取
            $extractPath = $null
            if ($iconLocation -and $iconLocation.Trim() -ne '') {
                $parts = $iconLocation.Split(',')
                $p = $parts[0].Trim()
                if ($p -ne '' -and (Test-Path $p)) { $extractPath = $p }
            }
            # 回退到目标路径
            if (-not $extractPath -and $targetPath -and (Test-Path $targetPath)) {
                $extractPath = $targetPath
            }

            if ($extractPath) {
                $pExt = [System.IO.Path]::GetExtension($extractPath).ToLower()
                if ($pExt -eq '.ico') {
                    $icon = New-Object System.Drawing.Icon($extractPath)
                    $bmp = $icon.ToBitmap()
                    $ms = New-Object System.IO.MemoryStream
                    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                    [Convert]::ToBase64String($ms.ToArray())
                    $ms.Dispose(); $bmp.Dispose(); $icon.Dispose()
                    $gotIcon = $true
                } else {
                    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($extractPath)
                    if ($icon) {
                        $bmp = $icon.ToBitmap()
                        $ms = New-Object System.IO.MemoryStream
                        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                        [Convert]::ToBase64String($ms.ToArray())
                        $ms.Dispose(); $bmp.Dispose(); $icon.Dispose()
                        $gotIcon = $true
                    }
                }
            }
        } catch {}
    }

    # 非 .lnk 文件或 .lnk 解析失败时，回退到原有逻辑
    if (-not $gotIcon) {
        try {
            $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($Arg)
            if ($icon) {
                $bmp = $icon.ToBitmap()
                $ms = New-Object System.IO.MemoryStream
                $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                [Convert]::ToBase64String($ms.ToArray())
                $ms.Dispose(); $bmp.Dispose(); $icon.Dispose()
                $gotIcon = $true
            }
        } catch {}
    }

    # 最终回退：使用 SHGetFileInfo 获取 Windows Shell 图标
    if (-not $gotIcon) {
        try {
            $csLines = @(
                'using System;'
                'using System.Runtime.InteropServices;'
                'using System.Drawing;'
                'public class ShellIconHelper {'
                '    [DllImport("shell32.dll", CharSet = CharSet.Auto)]'
                '    public static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes, ref SHFILEINFO psfi, uint cbFileInfo, uint uFlags);'
                '    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]'
                '    public struct SHFILEINFO {'
                '        public IntPtr hIcon;'
                '        public int iIcon;'
                '        public uint dwAttributes;'
                '        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]'
                '        public string szDisplayName;'
                '        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]'
                '        public string szTypeName;'
                '    }'
                '    [DllImport("user32.dll")]'
                '    public static extern bool DestroyIcon(IntPtr handle);'
                '    public const uint SHGFI_ICON = 0x100;'
                '    public const uint SHGFI_SMALLICON = 0x1;'
                '}'
            )
            $csCode = $csLines -join "`n"
            Add-Type -TypeDefinition $csCode -ErrorAction SilentlyContinue
            $info = New-Object ShellIconHelper+SHFILEINFO
            $flags = [ShellIconHelper]::SHGFI_ICON -bor [ShellIconHelper]::SHGFI_SMALLICON
            $result = [ShellIconHelper]::SHGetFileInfo($Arg, 0, [ref]$info, [System.Runtime.InteropServices.Marshal]::SizeOf([type][ShellIconHelper+SHFILEINFO]), $flags)
            if ($result -ne [IntPtr]::Zero -and $info.hIcon -ne [IntPtr]::Zero) {
                $icon = [System.Drawing.Icon]::FromHandle($info.hIcon)
                $clone = $icon.Clone()
                [ShellIconHelper]::DestroyIcon($info.hIcon)
                $bmp = $clone.ToBitmap()
                $ms = New-Object System.IO.MemoryStream
                $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                [Convert]::ToBase64String($ms.ToArray())
                $ms.Dispose(); $bmp.Dispose(); $clone.Dispose()
            }
        } catch {}
    }
}
