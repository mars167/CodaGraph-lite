## 背景 (Context)

当前的着陆页使用了通用的渐变设计。我们的目标是采用 GitHub 的深色主题美学来吸引开发者。实施将集中在 `web` 目录，特别是 `app/page.tsx` 和全局样式。

## 目标 / 非目标 (Goals / Non-Goals)

**目标:**
- 实现 GitHub 的深色配色方案（背景、边框、文本）。
- 更新 UI 组件（卡片、按钮）以匹配 GitHub 的设计语言（扁平、边框、微妙）。
- 确保高对比度和可读性。

**非目标:**
- 更改网站的内容或文案。
- 如果尚未完全支持，则不实施亮/暗切换（此次重构主要关注深色美学）。
- 重构整个应用程序（仪表板等）- 最初范围仅限于着陆页，尽管全局样式可能会影响其他页面。

## 决策 (Decisions)

### Tailwind 配置
我们将使用 GitHub 特定的颜色标记扩展 `tailwind.config.ts`。这为样式提供了语义层。
- `canvas-default`: `#0d1117`
- `canvas-subtle`: `#161b22`
- `border-default`: `#30363d`
- `accent-emphasis`: `#238636` (绿色按钮)

### 组件样式
- **卡片**: 移除重阴影。使用 `border-default` 和 `canvas-subtle` 背景。
- **排版**: 使用系统字体 (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI` 等) 来模仿 GitHub 的原生感觉。
- **图标**: 确保 SVG 图标使用与文本层级匹配的适当填充/描边颜色 (`fg-default`, `fg-muted`)。

## 风险 / 权衡 (Risks / Trade-offs)

- **风险**: 全局样式更改可能会影响仪表板。
- **缓解措施**: 尽可能将更改范围限制在 `web/app/page.tsx`，或使用特定类。如果修改了 `globals.css`，请验证仪表板页面。
