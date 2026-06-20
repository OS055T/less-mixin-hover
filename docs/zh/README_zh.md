**其他语言版本: [English](../../README.md) | [中文](README_zh.md)**

为 Less 文件中的 Mixin 调用提供鼠标悬停提示，自动显示定义上方的文档注释，支持 Markdown 格式，提升代码可读性与开发效率。

## 插件简介

- **悬停即时显示注释**：在当前文件中，鼠标悬停在任意 Less Mixin 上即可查看其关联注释。
- **轻量极速**：专为单文件查找优化，确保开发过程中几乎不影响性能。

## 安装方法

*(从 GitHub Releases 页面下载 `.vsix` 文件并手动安装。)*

---

## 如何使用

在 `.less` 文件中将鼠标悬停在 Mixin 调用处，插件会自动解析对应 Mixin 定义，并显示其上方注释内容。

### 手动控制与缓存管理

虽然插件会自动处理大部分逻辑，但如果你遇到了极端情况（比如文件移动了但缓存没更新），可以使用以下命令：

- **刷新 Map 缓存** ( less-mixin-hover.refreshMapCache )：强制重新扫描当前工作区，重建 Mixin 索引。
- **加载当前文件缓存** ( less-mixin-hover.loadCurrentFileCache )：仅针对当前打开的文件加载缓存。
- **清空所有缓存** ( less-mixin-hover.clearAllCache )：核弹级选项。当提示内容完全错乱时，用它重置一切。

如果你闲得无聊，你甚至可以去你的  
AppData\Roaming\Code\User\globalStorage\less-mixin-hover\mixin-cache  目录下翻翻看。那里躺着你所有的缓存文件。

### 注释规范 (Comment Syntax)

本插件通过解析 **JSDoc 风格**的块注释来生成悬浮提示。请确保将注释放置在目标 Mixin 定义的**正上方**。

- **注释格式**：必须使用 `/** ... */` 或 `/* ... */` 包裹。
- **支持标签**：内部支持标准的 JSDoc 标识符，例如 `@param`、`@description` 等。
- **自定义标签**：目前功能处于开发阶段，支持的自定义标签类型正在逐步扩展中。

**示例代码**

```less
/**
 * @description 这是一个标准的圆角设置 Mixin
 * @param Number radius - 圆角的半径值
 * @return Style border-radius 属性
 * @example .border-radius(10px);
 */
.border-radius(
    @radius: 5px
) {
    -webkit-border-radius: @radius;
    border-radius: @radius;
}

.container {
    .border-radius(10px);
}
```

---

## 基础配置

插件提供多种扫描方式，可根据项目大小和使用习惯选择最适合的策略。打开 VS Code 设置，搜索 `MixinHelper` 即可修改以下配置。

### 1. 扫描模式 (Search Mode)
- **配置项**：`MixinHelper.searchMode`
- **默认值**：`map`
  - **map（高性能）**：在文件打开或保存时构建索引，悬停时直接查表，响应最快。
  - **realtime（兼容模式）**：每次悬停时实时解析代码，适合调试或超小文件。

### 2. 同步触发器 (Sync Triggers)
- **打开时扫描**：`MixinHelper.syncMapOnOpen`（默认：`true`）
  - 开启后，打开 `.less` 文件时自动扫描并更新索引。
- **保存时扫描**：`MixinHelper.syncMapOnSave`（默认：`false`）
  - 开启后，保存文件时立即刷新索引，保证提示内容与当前文件一致。
- **聚焦时扫描**：`MixinHelper.syncMapOnFocus`（默认：`false`）
  - 开启后，从其他窗口切回 VS Code 时触发扫描，适合频繁切换窗口的场景。  
  此操作不会覆盖原有数据，若已有对应数据则不会再次创建！

### 3. 日志与通知控制
- **配置项**：`MixinHelper.enableNotification`
- **默认值**：`logSilently`
- 决定插件运行时的反馈方式。

| 选项值 | 行为描述 |
| :--- | :--- |
| `showOutputOnLog` | 记录日志并自动打开 Output 面板，适合排查问题。 |
| `popupWithoutLog` | 仅显示通知，不写入日志。 |
| `logSilently` | 静默记录日志，不自动弹出 Output 面板。 |
| `disableNotifications` | 关闭通知和日志。 |

---

## 进阶配置

> **注意**：此部分需直接在 `settings.json` 中编辑。  
> **核心技巧**：`maxPercentage`（读取限制）与 `maxMixinCount`（数量限制）  **支持叠加使用**。两者配合能对超大文件产生极致的优化效果，防止插件卡顿
### `MixinHelper.advancedSettings`

| 参数名 | 默认值 | 作用说明 |
| :--- | :--- | :--- |
| `maxPercentage` | `50` | **读取截断**：限制扫描文件的比例，例如 `50` 表示只扫描前半部分，忽略后续代码以节省资源。 |
| `maxMixinCount` | `10` | **结果截断**：最多收集指定数量的 Mixin，超过后停止扫描，避免无效计算。 |
| `troubleshootingMode` | `strict` | **匹配策略**：决定是否将包含 `:` 的行识别为 Mixin 调用。 |

#### `troubleshootingMode` 说明

| 模式 | 行为描述 |
| :--- | :--- |
| `strict` | 严格匹配：遇到 `:` 的行会被排除，避免误判为 CSS 属性。 |
| `losse` | 宽松匹配：即使包含 `:`，也会尝试识别为 Mixin 引用。 |
##### 示例
```less
// 在 strict 模式下，并非和变量在同一行，该行会被记录
.border-radius(
    @radius: 5px
) {...}
// 在 strict 模式下，因为存在冒号，该行会被跳过。
.border-radius(@radius: 5px) {...}
```
### 示例配置

```json
{
    "maxPercentage": 50,
    "maxMixinCount": 10,
    "troubleshootingMode": "strict"
}
```
---

(Changelog)

## [更新日志](./CHANGELOG_zh.md)
