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
    # 其他文件类型（.lnk, .cmd, .bat 等）：先尝试 ExtractAssociatedIcon
    $gotIcon = $false
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
            $gotIcon = $true
        }
    } catch {}

    # 提取失败时，使用 SHGetFileInfo 获取 Windows Shell 图标
    # 对 .lnk/.cmd/.bat 等无内嵌图标的文件类型有效
    if (-not $gotIcon) {
        try {
            # 使用字符串拼接代替 here-string，避免 UTF-8 无 BOM 时 PowerShell 解析失败
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
                $ms.Dispose()
                $bmp.Dispose()
                $clone.Dispose()
            }
        } catch {}
    }
}
