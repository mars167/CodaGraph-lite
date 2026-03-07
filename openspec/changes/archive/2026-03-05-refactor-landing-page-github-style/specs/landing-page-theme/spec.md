## 新增需求 (ADDED Requirements)

### 需求: 应用 GitHub 深色主题颜色 (Requirement: Apply GitHub Dark Theme Colors)
着陆页必须 (SHALL) 使用源自 GitHub 深色模式（暗淡或高对比度）的颜色标记，以确保持所需的视觉美学一致性。
- 背景: `#0d1117` (canvas-default)
- 卡片背景: `#161b22` (canvas-subtle)
- 边框颜色: `#30363d` (border-default)
- 文本颜色: `#c9d1d9` (fg-default)
- 柔和文本颜色: `#8b949e` (fg-muted)

#### 场景: 验证背景颜色 (Scenario: Verify Background Colors)
- **当 (WHEN)** 加载着陆页时
- **那么 (THEN)** 主背景颜色为 `#0d1117`
- **且 (AND)** 卡片背景为 `#161b22`

#### 场景: 验证边框颜色 (Scenario: Verify Border Colors)
- **当 (WHEN)** 查看带有边框的卡片或部分时
- **那么 (THEN)** 边框颜色为 `#30363d`

### 需求: 使用系统字体 (Requirement: Use System Fonts)
着陆页排版必须 (SHALL) 使用系统字体栈以模仿 GitHub 的原生感觉。

#### 场景: 字体族检查 (Scenario: Font Family Check)
- **当 (WHEN)** 检查文本元素时
- **那么 (THEN)** font-family 栈包含 `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Helvetica`, `Arial`, `sans-serif`

### 需求: 组件样式 (Requirement: Component Styling)
交互元素必须 (SHALL) 匹配 GitHub 的按钮和链接样式。

#### 场景: 主要按钮样式 (Scenario: Primary Button Style)
- **当 (WHEN)** 查看“进入仪表板”按钮（如果已认证）时
- **那么 (THEN)** 按钮背景为 `#238636` (success-emphasis)
- **且 (AND)** 文本颜色为 `#ffffff`

#### 场景: 次要按钮样式 (Scenario: Secondary Button Style)
- **当 (WHEN)** 查看次要操作或链接时
- **那么 (THEN)** 它们使用柔和文本颜色 `#8b949e` 或标准链接颜色 `#58a6ff`
