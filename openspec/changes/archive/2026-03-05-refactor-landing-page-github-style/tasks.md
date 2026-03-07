## 1. 环境设置

- [x] 1.1 更新 `web/tailwind.config.ts` 以包含 GitHub 深色主题颜色 (`canvas-default`, `canvas-subtle`, `border-default`, `accent-emphasis`, `fg-default`, `fg-muted`)。

## 2. 全局样式

- [x] 2.1 更新 `web/app/globals.css` 将默认背景颜色设置为 `#0d1117`，文本颜色设置为 `#c9d1d9`。
- [x] 2.2 确保通过 `web/app/layout.tsx` 或 `web/app/globals.css` 全局应用系统字体栈。

## 3. 着陆页重构

- [x] 3.1 重构 `web/app/page.tsx` 主容器：移除现有的渐变，应用 `bg-canvas-default`。
- [x] 3.2 重构 Hero 部分：更新文本颜色为 `text-fg-default` 和 `text-fg-muted`。
- [x] 3.3 重构卡片：移除重阴影，添加带有 `border-border-default` 的 `border`，设置背景为 `bg-canvas-subtle`。
- [x] 3.4 重构按钮：更新“进入仪表板”按钮以使用 `bg-accent-emphasis` 和白色文本。更新次要按钮以使用柔和样式。
- [x] 3.5 重构图标：更新图标颜色以匹配新主题（例如，使用 `text-fg-default` 或需要的特定强调色）。

## 4. 验证

- [x] 4.1 验证着陆页是否符合 GitHub 深色主题美学。
- [x] 4.2 确保文本对比度符合可访问性标准。
- [x] 4.3 检查移动端和桌面的响应式设计。
