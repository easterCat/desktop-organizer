# 检查并启用开发者模式（允许创建符号链接）
$regPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock"
$regName = "AllowDevelopmentWithoutDevLicense"

try {
    $currentValue = Get-ItemProperty -Path $regPath -Name $regName -ErrorAction SilentlyContinue
    if ($currentValue.$regName -ne 1) {
        Write-Host "正在启用开发者模式..."
        Set-ItemProperty -Path $regPath -Name $regName -Value 1
        Write-Host "开发者模式已启用，可能需要重启才能生效"
    } else {
        Write-Host "开发者模式已启用"
    }
} catch {
    Write-Host "无法修改注册表（需要管理员权限）: $_"
}

# 设置环境变量并运行打包
Write-Host "开始打包..."
$env:ELECTRON_BUILDER_CACHE = "$env:LOCALAPPDATA"
cd "$PSScriptRoot"
npm run build
