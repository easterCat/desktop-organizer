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
    # 其他文件类型，尝试 ExtractAssociatedIcon
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
}
