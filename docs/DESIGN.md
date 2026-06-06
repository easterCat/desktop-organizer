# Desktop Organizer — 界面设计规范 v2.4

> 基于 v1.0 风格意向稿，经 v2.0 补全间距/排版/交互状态/兼容性/无障碍，v2.1 修复变量冲突、数值矛盾和遗漏细节，v2.2 完善变量清单完整性、drop 动画/错误状态实现细节、响应式断点、无障碍合规，v2.3 修正数值不一致、统一焦点环变量引用、重组语义色编号，v2.4 补全浮动窗口 --text-accent 定义。
> 所有数值均从现有代码中提取并归一化，确保规范与实现一致。

---

## 1. 设计原则

| 原则 | 含义 |
|------|------|
| **Glassmorphism** | 磨砂玻璃质感，多层透明叠加创造纵深感 |
| **层次分明** | 通过透明度、模糊度、阴影区分前景/中景/背景 |
| **克制留白** | 内容紧凑但不拥挤，间距统一有节奏 |
| **暗色优先** | 深色背景降低视觉疲劳，适合长时间使用 |
| **系统字体** | 优先使用系统原生字体，保证渲染性能和本地化支持 |

---

## 2. 色彩体系

### 2.1 背景色

| 变量 | 色值 | 用途 |
|------|------|------|
| `--bg-base` | `linear-gradient(160deg, #0e0e11 0%, #18181c 35%, #1f1f24 60%, #16161a 100%)` | 主窗口背景渐变 |
| `--bg-fallback` | `#1a1a2e` | Electron 窗口 backgroundColor（渲染启动前的底色） |
| `--bg-titlebar` | `rgba(14,14,17, 0.4)` | 标题栏背景 |
| `--bg-toolbar` | `rgba(14,14,17, 0.25)` | 工具栏背景 |
| `--bg-statusbar` | `rgba(14,14,17, 0.6)` | 状态栏背景 |
| `--bg-modal` | `rgba(28,28,32, 0.85)` | 模态框背景 |
| `--bg-ctx` | `rgba(24,24,28, 0.88)` | 右键菜单背景 |
| `--bg-toast` | `rgba(28,28,32, 0.85)` | Toast 提示背景 |

### 2.2 玻璃渐变层级（主窗口）

| 变量 | 色值 | 用途 |
|------|------|------|
| `--glass-1` | `rgba(255,255,255, 0.06)` | 最低层级（工具栏） |
| `--glass-2` | `rgba(255,255,255, 0.10)` | 基础面板背景 |
| `--glass-3` | `rgba(255,255,255, 0.14)` | 中间层级（卡片悬停） |
| `--glass-border-main` | `rgba(255,255,255, 0.09)` | 面板边框 |
| `--glass-highlight-main` | `rgba(255,255,255, 0.18)` | 高亮状态 |

### 2.3 玻璃渐变层级（浮动窗口）

| 变量 | 色值 | 用途 |
|------|------|------|
| `--glass-bg` | `rgba(20,20,26, 0.72)` | 浮动窗口主背景（含深色底） |
| `--glass-light-1` | `rgba(255,255,255, 0.08)` | 低层级叠加 |
| `--glass-light-2` | `rgba(255,255,255, 0.14)` | 中层级叠加 |
| `--glass-border-float` | `rgba(255,255,255, 0.12)` | 边框 |
| `--glass-highlight-float` | `rgba(255,255,255, 0.22)` | 高亮/悬停 |

### 2.4 文字颜色

| 变量 | 主窗口 | 浮动窗口 | 用途 |
|------|--------|----------|------|
| `--text-primary` | `rgba(255,255,255, 0.88)` | `rgba(255,255,255, 0.92)` | 主要文字（标题、名称） |
| `--text-secondary` | `rgba(255,255,255, 0.50)` | `rgba(255,255,255, 0.65)` | 次要文字（计数、描述） |
| `--text-tertiary` | `rgba(255,255,255, 0.22)` | `rgba(255,255,255, 0.35)` | 弱化文字（占位符、禁用） |
| `--text-accent` | `rgba(255,255,255, 0.75)` | — | 强调文字 |
| `--text-danger` | `#e05555` | `#e05555` | 危险操作文字 |

> **注意**: 浮动窗口文字透明度整体高于主窗口，因浮动窗口背景更暗（alpha 0.72 + blur 32px），需要更高不透明度才能保证可读性。

### 2.5 语义色

| 变量 | 色值 | 用途 |
|------|------|------|
| `--focus-ring` | `var(--text-accent)` | 所有交互元素的 Focus outline 颜色，与 `--text-accent` 同步 |
| `--danger` | `#e05555` | 危险操作（删除、关闭） |
| `--danger-hover` | `rgba(196,43,28, 0.85)` | 关闭按钮悬停 |
| `--danger-bg` | `rgba(224,85,85, 0.12)` | 危险操作背景 |
| `--danger-bg-hover` | `rgba(224,85,85, 0.15)` | 危险操作背景悬停 |
| `--batch` | `rgba(62,218,170, 0.65)` | 批量操作高亮 |
| `--batch-bg` | `rgba(62,218,170, 0.08)` | 批量选中背景 |

### 2.6 日志类型色

| 变量 | 色值 |
|------|------|
| `--log-success` | `#5ed` |
| `--log-info` | `#3da` |
| `--log-warning` | `#e90` |
| `--log-error` | `#d45` |
| `--log-action` | `#c3f` |

---

## 3. 圆角体系

| 变量 | 值 | 语义 | 用途 |
|------|-----|------|------|
| `--radius-panel` | `12px` | 面板/卡片 | 区域容器、模态框 |
| `--radius-control` | `8px` | 控件/输入框 | 按钮（次要）、输入框、搜索框、卡片 |
| `--radius-button` | `16px` | 按钮/胶囊 | 主要按钮、Toast |
| `--radius-small` | `6px` | 小元素 | 徽章、操作按钮、图标加载态 |
| `--radius-xs` | `4px` | 微小元素 | 品牌标记 |
| `--radius-dot` | `50%` | 圆形 | 模态框关闭按钮、开关旋钮 |

> **特殊值**: 滚动条 `2px`（极细）、toggle-switch `11px`（轨道）、box-count/section-count `10px`（计数胶囊）。

---

## 4. 间距系统

### 4.1 间距变量

| 变量 | 值 | 用途 |
|------|-----|------|
| `--space-xxs` | `2px` | 极小间距（边框偏移） |
| `--space-xs` | `5px` | 紧凑间距（图标与文字、控制按钮组） |
| `--space-sm` | `6px` | 网格列间距、表单字段间距 |
| `--space-md` | `8px` | 工具栏间距、按钮组间距 |
| `--space-lg` | `10px` | 标题栏拖拽区间距 |
| `--space-xl` | `12px` | 浮动窗口标题栏内边距 |
| `--space-xxl` | `14px` | 盒子容器间距 |
| `--space-3xl` | `16px` | 面板水平内边距 |
| `--space-4xl` | `18px` | 模态框垂直内边距 |
| `--space-5xl` | `20px` | 主内容区域内边距、模态框水平内边距 |
| `--space-6xl` | `22px` | 模态框底部内边距 |

### 4.2 内边距规范

| 区域 | padding | 说明 |
|------|---------|------|
| 主内容区 | `20px` | main-content |
| 未分类区域 | `16px 20px` | 顶部 16px，左右 20px |
| 盒子头部 | `12px 18px` | 标题栏 |
| 模态框头部/内容 | `18px 22px` | 标准模态框 |
| 模态框底部 | `18px 22px` | 按钮区域 |
| 工具栏 | `8px 14px` | 操作按钮行 |
| 输入框 | `8px 14px` | field-input |
| 浮动窗口标题 | `10px 12px` | glass-head |
| 浮动窗口内容 | `10px` | glass-body |

### 4.3 间距使用规范

| 场景 | gap | 说明 |
|------|-----|------|
| 图标网格 | `6px` | shortcuts-grid、glass-body |
| 搜索框内容 | `6px` | 内部元素 |
| 盒子标题区 | `6px` | 标题文字与操作按钮 |
| 表单字段 | `6px` | label 与 input |
| 工具栏按钮组 | `8px` | mode-group |
| 模态框底部 | `8px` | 按钮之间 |
| 标题栏 | `10px` | 图标与标题文字 |
| 盒子之间 | `14px` | boxes-container 垂直间距 |

---

## 5. 排版规范

### 5.1 字体族

```css
font-family: -apple-system, "SF Pro Display", "Segoe UI", "Microsoft YaHei", sans-serif;
```

- **代码/路径显示**: `monospace`
- **等宽数字**: `font-variant-numeric: tabular-nums`（状态栏时间、日志时间）

### 5.2 字号层级

| 变量 | 值 | 字重 | 用途 |
|------|-----|------|------|
| `--text-xs` | `9px` | 400 | 日志时间、计数标签（⚠️ 仅限 HiDPI/Retina 显示器，标准 DPI 下不可读。若需支持标准 DPI，建议提升至 `10px`） |
| `--text-sm` | `10px` | 400 | 快捷方式名称、盒子计数、切换按钮提示 |
| `--text-caption` | `10.5px` | 400 | 状态栏项目、Toast 文字 |
| `--text-body` | `11px` | 400 | 区域标签、字段标签、日志条目 |
| `--text-body-sm` | `11.5px` | 400 | 菜单项、模式选项、空状态提示 |
| `--text-base` | `12px` | 500 | 按钮文字、盒子标题、应用标题 |
| `--text-base-lg` | `12.5px` | 500 | 输入框文字、应用标题 |
| `--text-md` | `13px` | 600 | 模态框标题 |
| `--text-lg` | `14px` | 400 | 路径浏览按钮 |
| `--text-icon` | `24px` | 400 | 快捷方式图标（emoji/图片） |

### 5.3 字重

| 值 | 用途 |
|-----|------|
| `400` (Regular) | 正文、描述、标签 |
| `500` (Medium) | 标题、按钮文字 |
| `600` (SemiBold) | 区域标签、模态框标题、字段标签 |

### 5.4 行高

| 字号范围 | 期望行高 | 说明 |
|----------|----------|------|
| `9px` - `10.5px` | `1.4` | 小字号需要更大行高保证可读性 |
| `11px` - `12.5px` | `1.35` | 正文标准行高 |
| `13px` - `14px` | `1.3` | 标题类行高 |
| `24px`（图标） | `1` | 图标文字无需额外行间距 |

> **实现方式**: 建议在 `body` 设置 `line-height: 1.35` 作为全局基线，各组件按需覆盖。不依赖浏览器默认值（不同平台差异过大），统一显式声明。

---

## 6. 模糊层级

| 变量 | 值 | 用途 |
|------|-----|------|
| `--blur-xs` | `6px` | 工具栏、模态遮罩、批量操作栏 |
| `--blur-sm` | `8px` | 标题栏、按钮、状态栏 |
| `--blur-md` | `12px` | 面板卡片（未分类区域、盒子区域） |
| `--blur-toast` | `14px` - `16px` | Toast 提示（浮动窗口 14px，主窗口 16px） |
| `--blur-lg` | `20px` | 右键菜单 |
| `--blur-xl` | `24px` | 模态框 |
| `--blur-glass` | `32px saturate(1.6)` | 浮动窗口玻璃容器（最强模糊） |

---

## 7. 组件规范

### 7.1 管理面板 — 按钮

**创建按钮 `.btn-create`**

| 属性 | 值 |
|------|-----|
| 高度 | `30px` |
| 内边距 | `8px 14px` |
| 圆角 | `var(--radius-control)` (8px) |
| 背景 | `var(--glass-1)` |
| 模糊 | `var(--blur-sm)` (8px) |
| 边框 | `1px solid var(--glass-border-main)` |
| 字号 | `12px` / `font-weight: 500` |
| 颜色 | `var(--text-primary)` |

| 状态 | 样式变化 |
|------|----------|
| Hover | 背景 → `var(--glass-2)` |
| Active | 背景 → `var(--glass-3)`，scale(0.98) |
| Focus | `outline: 2px solid var(--focus-ring)`，`outline-offset: 2px` |
| Disabled | opacity 0.4，pointer-events none |

**功能按钮 `.btn-icon-only`**

| 属性 | 值 |
|------|-----|
| 尺寸 | `30px × 30px` |
| 圆角 | `var(--radius-control)` (8px) |
| 背景 | `transparent` |
| 颜色 | `var(--text-secondary)` |

| 状态 | 样式变化 |
|------|----------|
| Hover | 背景 → `var(--glass-2)`，颜色 → `var(--text-primary)` |
| Active | 背景 → `var(--glass-3)` |
| Focus | `outline: 2px solid var(--focus-ring)` |

**胶囊按钮 `.btn-ghost` / `.btn-solid`**

| 属性 | 值 |
|------|-----|
| 高度 | `32px` |
| 内边距 | `0 16px` |
| 圆角 | `var(--radius-button)` (16px) |
| 字号 | `12px` |

| 状态 | 样式变化 |
|------|----------|
| Hover | 亮度提升（brightness 1.15） |
| Active | brightness 0.9，scale(0.98) |
| Focus | `outline: 2px solid var(--focus-ring)` |
| Disabled | opacity 0.35，cursor not-allowed |

### 7.2 管理面板 — 卡片

**快捷方式卡片 `.shortcut-card`**

| 属性 | 值 |
|------|-----|
| 宽度 | `minmax(84px, 1fr)` 网格自适应 |
| 内边距 | `10px 4px 8px` |
| 圆角 | `var(--radius-control)` (8px) |
| 背景 | `transparent` |
| 对齐 | `text-align: center` |

| 状态 | 样式变化 |
|------|----------|
| Hover | 背景 → `var(--glass-2)` (rgba(255,255,255,0.10)) |
| Selected | 背景 → `rgba(62,218,170, 0.15)`，边框 → `1.5px solid var(--batch)` |
| Dragging (自身) | opacity 0.5，scale(0.95) |
| Dragover (目标) | 背景 → `var(--glass-3)`，边框 → `2px dashed var(--batch)`，scale(1.02) |
| Drop 完成 | 背景 flash → `var(--glass-highlight-main)`，持续 `0.3s ease-out` 后淡出回透明（详见 §10.2） |

**区域卡片 `.box-section` / `.unassigned-section`**

| 属性 | 值 |
|------|-----|
| 圆角 | `var(--radius-panel)` (12px) |
| 背景 | `var(--glass-2)` |
| 模糊 | `var(--blur-md)` (12px) |
| 边框 | `1px solid var(--glass-border-main)` |

### 7.3 管理面板 — 输入框

| 属性 | 值 |
|------|-----|
| 高度 | `30px` |
| 内边距 | `8px 14px` |
| 圆角 | `var(--radius-control)` (8px) |
| 背景 | `var(--glass-1)` |
| 边框 | `1px solid var(--glass-border-main)` |
| 字号 | `12.5px` |
| 颜色 | `var(--text-primary)` |

| 状态 | 样式变化 |
|------|----------|
| Focus | 边框 → `var(--glass-highlight-main)`，背景 → `var(--glass-2)` |
| Disabled | opacity 0.4，cursor not-allowed |

### 7.4 浮动窗口

**玻璃容器 `.glass`**

| 属性 | 值 |
|------|-----|
| 背景 | `var(--glass-bg)` (rgba(20,20,26, 0.72)) |
| 叠加 | `var(--glass-light-1)` |
| 模糊 | `var(--blur-glass)` (32px saturate(1.6)) |
| 圆角 | `16px` |
| 阴影 | `0 8px 32px rgba(0,0,0, 0.4)` |
| 最小宽度 | `200px` |
| 最小高度 | `80px`（折叠态） |
| 默认尺寸 | `260px × 320px` |

**标题栏 `.glass-head`**

| 属性 | 值 |
|------|-----|
| 内边距 | `10px 12px` |
| 间距 | `gap: 8px` |
| 拖拽 | `app-region: drag` |

**图标网格 `.glass-body`**

| 属性 | 值 |
|------|-----|
| 内边距 | `10px` |
| 间距 | `gap: 6px` |
| 列宽 | `minmax(68px, 1fr)` |
| 拖拽区域 | `app-region: no-drag` |

**悬浮操作按钮 `.dot`**

| 属性 | 值 |
|------|-----|
| 尺寸 | `24px × 24px` |
| 圆角 | `var(--radius-dot)` (50%) |
| 背景 | `var(--glass-light-2)` |
| 悬停放大 | `scale(1.1)` |

### 7.5 模态框

| 属性 | 值 |
|------|-----|
| 宽度 | `380px` |
| 圆角 | `var(--radius-panel)` (12px) |
| 背景 | `var(--bg-modal)` (rgba(28,28,32, 0.85)) |
| 模糊 | `var(--blur-xl)` (24px) |
| z-index | `var(--z-modal)` |

### 7.6 右键菜单

| 属性 | 值 |
|------|-----|
| 最小宽度 | `130px` |
| 圆角 | `var(--radius-control)` (8px) |
| 背景 | `var(--bg-ctx)` (rgba(24,24,28, 0.88)) |
| 模糊 | `var(--blur-lg)` (20px) |
| z-index | `var(--z-context)` |

### 7.7 Toast 提示

| 属性 | 值 |
|------|-----|
| 圆角 | `var(--radius-button)` (16px) |
| 背景 | `var(--bg-toast)` |
| 模糊 | `var(--blur-toast)` (14-16px) |
| z-index | `var(--z-toast)` |

### 7.8 滚动条

| 属性 | 值 |
|------|-----|
| 宽度（默认） | `4px` |
| 宽度（悬停） | `6px` |
| 圆角 | `2px` |
| 颜色 | `var(--glass-2)` |
| 悬停颜色 | `var(--glass-3)` |
| 过渡 | `width 0.2s ease` |

---

## 8. 间距与布局规范

### 8.1 管理面板

| 区域 | 布局方式 | 说明 |
|------|----------|------|
| 标题栏 | Flex, gap `var(--space-lg)` | 高度 40px，纵向居中 |
| 工具栏 | Flex, gap `var(--space-md)` | 按钮组排列 |
| 搜索框 | Flex, gap `var(--space-sm)` | 图标 + 输入框 |
| 快捷方式网格 | `grid, repeat(auto-fill, minmax(84px, 1fr))` | gap `var(--space-sm)` (6px) |
| 盒子容器 | Flex column, gap `var(--space-xxl)` (14px) | 盒子之间垂直间距 |
| 盒子标题区 | Flex, gap `var(--space-sm)` | 标题 + 操作按钮 |
| 模态框 | Flex column, gap `var(--space-md)` | 头部/内容/底部分区 |

### 8.2 浮动窗口

| 区域 | 布局方式 | 说明 |
|------|----------|------|
| 标题栏 | Flex, gap `var(--space-lg)` | 高度自适应 |
| 图标网格 | `grid, repeat(auto-fill, minmax(68px, 1fr))` | gap `var(--space-sm)` (6px) |
| 控制按钮组 | Flex, gap `var(--space-xs)` (5px) | 右侧操作区 |

---

## 9. z-index 层级

| 层级 | z-index | 变量 | 元素 |
|------|---------|------|------|
| 基础层 | `0` | — | 主窗口背景、标题栏、工具栏 |
| 内容层 | `1` | — | 面板卡片、网格内容 |
| 悬浮层 | `100` | — | 滚动条、操作按钮 |
| 拖拽层 | `500` | — | 拖拽预览元素 |
| 模态层 | `1000` | `--z-modal` | 模态框遮罩 + 内容 |
| 菜单层 | `2000` | `--z-context` | 右键菜单 |
| 提示层 | `3000` | `--z-toast` | Toast 提示 |

> **浮动窗口**: 因为每个浮动窗口是独立的 BrowserWindow，不存在跨窗口 z-index 冲突。窗口间层级由 Electron 的 `alwaysOnTop` 和窗口创建顺序决定。

---

## 10. 交互状态规范

### 10.1 按钮状态矩阵

| 状态 | 视觉表现 | 过渡 |
|------|----------|------|
| **Default** | 基础背景 + 边框 | — |
| **Hover** | 背景亮度提升（brightness 1.15 或 glass 层级 +1） | `background 0.15s ease` |
| **Active** | 背景亮度降低（brightness 0.9）+ `scale(0.98)` | `transform 0.1s ease` |
| **Focus** | `outline: 2px solid var(--focus-ring)`，`outline-offset: 2px` | `outline 0.15s ease` |
| **Disabled** | `opacity: 0.35`，`cursor: not-allowed` | — |

### 10.2 卡片状态矩阵

| 状态 | 视觉表现 |
|------|----------|
| **Default** | 透明背景 |
| **Hover** | 背景 → `var(--glass-2)` |
| **Selected** | 背景 → `rgba(62,218,170, 0.15)`，边框 → `1.5px solid var(--batch)` |
| **Dragging** | opacity 0.5，scale(0.95)，显示拖拽预览 |
| **Dragover** | 背景 → `var(--glass-3)`，边框 → `2px dashed var(--batch)`，scale(1.02) |
| **Drop** | 背景 flash → `var(--glass-highlight-main)`，`0.3s ease-out` 淡出。动画时序：`background-color: var(--glass-highlight-main)` 立即生效，`0.15s ease-in` 保持高亮，`0.15s ease-out` 淡出至 `transparent`。整个过程无需 JS 干预，纯 CSS `transition` 实现。 |

### 10.3 输入框状态矩阵

| 状态 | 视觉表现 |
|------|----------|
| **Default** | 边框 `var(--glass-border-main)` |
| **Focus** | 边框 → `var(--glass-highlight-main)`，背景 → `var(--glass-2)` |
| **Disabled** | opacity 0.4，cursor not-allowed |
| **Error** | 边框 → `1px solid var(--danger)`，背景不变。下方显示错误提示文字：字号 `var(--text-caption)` (10.5px)，颜色 `var(--danger)`，`margin-top: 4px`，行高 `1.4`。输入框左侧可选前置错误图标（`12px`，颜色 `var(--danger)`）。错误提示文字需有 `role="alert"` 以支持屏幕阅读器。 |

### 10.4 过渡规范

| 属性 | 时长 | 缓动 |
|------|------|------|
| 背景色变化 | `0.15s` | `ease` |
| 变换（scale/translate） | `0.1s` - `0.2s` | `ease` |
| outline 出现 | `0.15s` | `ease` |
| 滚动条宽度 | `0.2s` | `ease` |
| 阴影变化 | `0.2s` | `ease` |

---

## 11. 窗口尺寸规范

### 11.1 管理面板

| 属性 | 值 |
|------|-----|
| 默认尺寸 | `960px × 700px` |
| 最小尺寸 | `720px × 500px` |
| 最大尺寸 | 无限制（可全屏） |
| 可调整大小 | 是 |
| 窗口类型 | `frame: false`（无原生标题栏） |

### 11.2 浮动窗口

| 属性 | 值 |
|------|-----|
| 默认尺寸 | `260px × 320px` |
| 最小尺寸 | `200px × 80px` |
| 折叠态高度 | `80px` |
| 可调整大小 | 是 |
| 窗口类型 | `frame: false`, `transparent: true` |
| 始终置顶 | 是 |
| 任务栏显示 | 否（`skipTaskbar: true`） |

### 11.3 响应式行为

**管理面板**（快捷方式网格 `repeat(auto-fill, minmax(84px, 1fr))`）:

| 窗口宽度 | 内容区宽度（减去 40px 内边距） | 网格列数 | 说明 |
|----------|-------------------------------|----------|------|
| 960px（默认） | 920px | ~10 列 | 默认布局 |
| 880px | 840px | ~10 列 | 开始紧凑 |
| 800px | 760px | ~9 列 | 工具栏按钮可能折行 |
| 720px（最小） | 680px | ~8 列 | 最小宽度，盒子区域仍可滚动 |

> **说明**: 网格使用 `auto-fill`，列数由浏览器根据 `minmax(84px, 1fr)` 自动计算，无需显式断点。上表为参考值，实际列数取决于滚动条宽度（4-6px）和边框。

**浮动窗口**（图标网格 `repeat(auto-fill, minmax(68px, 1fr))`）:

| 窗口宽度 | 网格列数 | 说明 |
|----------|----------|------|
| 260px（默认） | 3 列 | 默认布局 |
| 200px（最小） | 2 列 | 最小可用状态 |
| < 200px | 1 列 | 不允许（minWidth 约束） |

- 内容区域超出最小高度（80px）时启用垂直滚动
- 折叠态（80px）仅显示标题栏，隐藏内容区域

**模态框**: 固定宽度 380px，不随窗口缩放。窗口宽度 < 380px 时模态框不可用（极端情况， minWidth 720px 保证不会出现）。

---

## 12. 兼容性与降级

### 12.1 backdrop-filter

`backdrop-filter` 是本设计的核心依赖，需要明确降级策略：

**支持情况**:
- Chrome/Edge: 完全支持（含 `-webkit-` 前缀）
- Safari: 完全支持（需 `-webkit-` 前缀）
- Firefox: v103+ 支持，之前需通过 `about:config` 手动启用

**降级策略**:

```css
/* 标准声明 */
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);

/* 降级：不支持 backdrop-filter 时，增加背景不透明度 */
@supports not (backdrop-filter: blur(1px)) {
  .glass-section {
    background: rgba(24, 24, 28, 0.85);  /* 更高的不透明度补偿 */
  }
  .glass-container {
    background: rgba(20, 20, 26, 0.92);  /* 浮动窗口降级 */
  }
}
```

**当前问题**: 主窗口 CSS 文件只使用了无前缀 `backdrop-filter`，未声明 `-webkit-backdrop-filter`。浮动窗口已正确声明两者。建议统一添加 `-webkit-` 前缀。

### 12.2 透明窗口

Electron 的 `transparent: true` 在 Linux 上可能有性能问题。浮动窗口使用透明背景，需注意：
- Linux 上关闭 `hasShadow: true` 以避免渲染异常
- Windows 上 `transparent: true` + `frame: false` 工作正常

### 12.3 字体回退

系统字体栈已包含主流平台：
- macOS: `-apple-system`, `SF Pro Display`
- Windows: `Segoe UI`, `Microsoft YaHei`
- 通用: `sans-serif`

---

## 13. 无障碍（Accessibility）

### 13.1 对比度分析

基于 WCAG 2.1 标准，当前设计的对比度情况：

| 文字层级 | 色值 | 实际背景（叠加 blur 后） | 预估对比度 | WCAG AA (4.5:1) |
|----------|------|--------------------------|------------|-----------------|
| 主窗口 `--text-primary` | `rgba(255,255,255, 0.88)` | ~`#2a2a30`（glass-2 + blur） | **~8.5:1** | ✅ 通过 |
| 主窗口 `--text-secondary` | `rgba(255,255,255, 0.50)` | ~`#2a2a30` | **~4.8:1** | ✅ 通过 |
| 浮动窗口 `--text-primary` | `rgba(255,255,255, 0.92)` | ~`#1a1a20`（glass-bg + blur 32px） | **~11:1** | ✅ 通过 |
| 浮动窗口 `--text-secondary` | `rgba(255,255,255, 0.65)` | ~`#1a1a20` | **~5.5:1** | ✅ 通过 |

### 13.2 无障碍策略

1. **主要文字** (`--text-primary`): 两级均通过 WCAG AA，无需调整
2. **次要文字** (`--text-secondary`):
   - 主窗口已提升至 `rgba(255,255,255, 0.50)`，预估对比度 ~4.8:1，达到 WCAG AA (4.5:1)
   - 浮动窗口 `rgba(255,255,255, 0.65)` 对比度 ~5.5:1，通过 AA
   - 计数、描述等文字承载实际信息，按 WCAG 定义属于"辅助信息"而非"装饰性"，需满足 AA 标准
3. **弱化文字** (`--text-tertiary`): 仅用于占位符和禁用态，不要求对比度
4. **交互元素**: 所有可点击元素提供 hover/active 视觉反馈，满足 WCAG 2.5.5 (Target Size)

### 13.3 键盘导航

- 所有按钮和交互元素需可通过 Tab 键聚焦
- Focus 状态使用 `outline: 2px solid var(--focus-ring)` 清晰标识
- 模态框内焦点锁定（Focus Trap）
- 右键菜单支持方向键导航

### 13.4 屏幕阅读器

- 按钮需有 `aria-label` 或可见文字
- 图标按钮必须有 `aria-label`
- 模态框需 `role="dialog"` 和 `aria-labelledby`
- 拖拽操作需提供替代操作方式（右键菜单）

---

## 14. CSS 变量完整清单

### 主窗口 (`src/renderer/styles.css`)

```css
:root {
  /* 背景 */
  --bg-base: linear-gradient(160deg, #0e0e11 0%, #18181c 35%, #1f1f24 60%, #16161a 100%);
  --bg-fallback: #1a1a2e;
  --bg-titlebar: rgba(14,14,17, 0.4);
  --bg-toolbar: rgba(14,14,17, 0.25);
  --bg-statusbar: rgba(14,14,17, 0.6);
  --bg-modal: rgba(28,28,32, 0.85);
  --bg-ctx: rgba(24,24,28, 0.88);
  --bg-toast: rgba(28,28,32, 0.85);

  /* 玻璃层级 */
  --glass-1: rgba(255,255,255, 0.06);
  --glass-2: rgba(255,255,255, 0.10);
  --glass-3: rgba(255,255,255, 0.14);
  --glass-border-main: rgba(255,255,255, 0.09);
  --glass-highlight-main: rgba(255,255,255, 0.18);

  /* 文字 */
  --text-primary: rgba(255,255,255, 0.88);
  --text-secondary: rgba(255,255,255, 0.50);
  --text-tertiary: rgba(255,255,255, 0.22);
  --text-accent: rgba(255,255,255, 0.75);

  /* 焦点环 */
  --focus-ring: var(--text-accent);

  /* 语义色 */
  --danger: #e05555;
  --danger-hover: rgba(196,43,28, 0.85);
  --danger-bg: rgba(224,85,85, 0.12);
  --danger-bg-hover: rgba(224,85,85, 0.15);
  --batch: rgba(62,218,170, 0.65);
  --batch-bg: rgba(62,218,170, 0.08);

  /* 日志类型色 */
  --log-success: #5ed;
  --log-info: #3da;
  --log-warning: #e90;
  --log-error: #d45;
  --log-action: #c3f;

  /* 圆角 */
  --radius-panel: 12px;
  --radius-control: 8px;
  --radius-button: 16px;
  --radius-small: 6px;
  --radius-xs: 4px;
  --radius-dot: 50%;

  /* 间距 */
  --space-xxs: 2px;
  --space-xs: 5px;
  --space-sm: 6px;
  --space-md: 8px;
  --space-lg: 10px;
  --space-xl: 12px;
  --space-xxl: 14px;
  --space-3xl: 16px;
  --space-4xl: 18px;
  --space-5xl: 20px;
  --space-6xl: 22px;

  /* 模糊 */
  --blur-xs: 6px;
  --blur-sm: 8px;
  --blur-md: 12px;
  --blur-toast: 16px;
  --blur-lg: 20px;
  --blur-xl: 24px;

  /* z-index */
  --z-modal: 1000;
  --z-context: 2000;
  --z-toast: 3000;
}
```

### 浮动窗口 (`src/desktop-box/style.css`)

```css
:root {
  /* 背景 */
  --glass-bg: rgba(20, 20, 26, 0.72);
  --glass-light-1: rgba(255,255,255, 0.08);
  --glass-light-2: rgba(255,255,255, 0.14);
  --glass-border-float: rgba(255,255,255, 0.12);
  --glass-highlight-float: rgba(255,255,255, 0.22);

  /* 文字 */
  --text-primary: rgba(255,255,255, 0.92);
  --text-secondary: rgba(255,255,255, 0.65);
  --text-tertiary: rgba(255,255,255, 0.35);
  --text-accent: rgba(255,255,255, 0.75);

  /* 焦点环 */
  --focus-ring: var(--text-accent);

  /* 语义色 */
  --danger: #e05555;

  /* 圆角（复用主窗口体系） */
  --radius-panel: 16px;   /* 浮动窗口外框更大 */
  --radius-control: 8px;
  --radius-button: 16px;
  --radius-small: 6px;
  --radius-dot: 50%;

  /* 模糊 */
  --blur-glass: 32px saturate(1.6);
  --blur-lg: 20px;
  --blur-toast: 14px;

  /* z-index */
  --z-context: 2000;
  --z-toast: 3000;
}
```

---

## 附录 A：现有问题与建议

| # | 问题 | 建议 |
|---|------|------|
| 1 | 两套 CSS 变量命名不统一 | 统一使用 `--glass-*` / `--text-*` 前缀体系 |
| 2 | 浮动窗口圆角全部硬编码 | 引入 `--radius-*` 变量并复用 |
| 3 | 颜色值大量硬编码 | 将所有 `rgba()` 背景色抽象为变量 |
| 4 | 主窗口缺少 `-webkit-backdrop-filter` | 统一添加 `-webkit-` 前缀 |
| 5 | 字号层级过细（9px/10px/10.5px） | 已评估，暂不调整。原因：每个层级对应明确的语义用途（日志时间/快捷方式名/状态栏），合并后会导致视觉层次模糊。若后续出现渲染问题再考虑精简 |
| 6 | `backgroundColor: '#1a1a2e'` 与 body 渐变不一致 | 保持一致或接受为渲染启动期的临时色 |
