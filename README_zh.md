**其他语言版本: [English](README.md) | [中文](README_zh.md)**

为 Less 文件中的 Mixin 调用提供鼠标悬停提示，自动显示定义上方的文档注释，支持 Markdown 格式，提升代码可读性与开发效率。

## 插件简介

- **悬停即时显示注释**：在当前文件中，鼠标悬停在任意 Less Mixin 上即可查看其关联注释。
- **轻量极速**：专为单文件查找优化，确保开发过程中几乎不影响性能。

## 安装方法

*(从 GitHub Releases 页面下载 `.vsix` 文件并手动安装。)*

## 如何使用

在 `.less` 文件中将鼠标悬停在 Mixin 调用处，插件会自动解析对应 Mixin 定义，并显示其上方注释内容。

### 示例

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

## 进阶配置

> **注意**：此部分需直接在 `settings.json` 中编辑。

### `MixinHelper.advancedSettings`

| 参数名 | 默认值 | 作用说明 |
| :--- | :--- | :--- |
| `maxPercentage` | `50` | **读取截断**：限制扫描文件的比例，例如 `50` 表示只扫描前半部分。 |
| `maxMixinCount` | `10` | **结果截断**：最多收集指定数量的 Mixin，超过后停止扫描。 |
| `troubleshootingMode` | `strict` | **匹配策略**：决定是否将包含 `:` 的行识别为 Mixin 调用。 |

#### `troubleshootingMode` 说明

| 模式 | 行为描述 |
| :--- | :--- |
| `strict` | 严格匹配：遇到 `:` 的行会被排除，避免误判为 CSS 属性。 |
| `losse` | 宽松匹配：即使包含 `:`，也会尝试识别为 Mixin 引用。 |

### 示例配置

```json
{
    "maxPercentage": 50,
    "maxMixinCount": 10,
    "troubleshootingMode": "strict"
}
```
