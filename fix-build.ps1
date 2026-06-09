# 修复 Electron 打包缺少依赖的问题
# 用法: 在 desktop-organizer 目录下运行 .\fix-build.ps1

Write-Host "=== 修复 desktop-organizer 打包问题 ===" -ForegroundColor Cyan

# 检查当前目录
$packageJson = Join-Path $PWD "package.json"
if (-not (Test-Path $packageJson)) {
    Write-Host "错误: 请在 desktop-organizer 项目根目录运行此脚本" -ForegroundColor Red
    exit 1
}

# 读取项目名
$project = (Get-Content $packageJson | ConvertFrom-Json).name
Write-Host "项目: $project" -ForegroundColor Yellow

# Step 1: 清理旧构建
Write-Host "`n[1/4] 清理旧构建..." -ForegroundColor Green
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
    Write-Host "  已删除 dist/"
}

# Step 2: 清理 node_modules
Write-Host "`n[2/4] 清理 node_modules..." -ForegroundColor Green
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules"
    Write-Host "  已删除 node_modules/"
}

# Step 3: 重新安装依赖
Write-Host "`n[3/4] 安装依赖..." -ForegroundColor Green
if (Test-Path "pnpm-lock.yaml") {
    Write-Host "  使用 pnpm 安装..."
    pnpm install
} else {
    Write-Host "  使用 npm 安装..."
    npm install
}

# Step 4: 验证关键依赖
Write-Host "`n[4/4] 验证依赖..." -ForegroundColor Green
$requiredDeps = @("fs-extra", "universalify")
$allGood = $true

foreach ($dep in $requiredDeps) {
    $depPath = Join-Path "node_modules" $dep
    if (Test-Path $depPath) {
        Write-Host "  ✓ $dep" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $dep 缺失!" -ForegroundColor Red
        $allGood = $false
    }
}

if (-not $allGood) {
    Write-Host "`n错误: 依赖验证失败，请检查 package.json" -ForegroundColor Red
    exit 1
}

# Step 5: 打包
Write-Host "`n=== 开始打包 ===" -ForegroundColor Cyan
Write-Host "运行 electron-builder..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ 打包成功！" -ForegroundColor Green
    Write-Host "输出目录: dist/" -ForegroundColor Yellow
} else {
    Write-Host "`n✗ 打包失败，请检查错误信息" -ForegroundColor Red
    exit 1
}
