**Read this in other languages: [English](README.md) | [中文](docs/zh/README_zh.md)**

# Less Mixin Hover Comment

A lightweight VS Code extension that shows Less Mixin documentation comments on hover.

## Features

- **Instant Hover Comments**: Hover over any Less Mixin call in the current `.less` file to view its associated documentation.
- **Lightweight & Fast**: Optimized for single-file lookup, with minimal performance impact during development.

## Installation

*(Download the `.vsix` file from the GitHub Releases page and install it manually.)*

## How to Use

Open a `.less` file and hover your mouse over a Less Mixin call. The extension automatically parses the mixin definition and displays the comments written above it.

### Manual Control & Cache Management

While the extension handles most logic automatically, use these commands for edge cases (e.g., file relocation without cache update):

- **Refresh Map Cache** ( less-mixin-hover.refreshMapCache ): Force re-scan of the current workspace to rebuild the Mixin index.

- **Load Current File Cache** ( less-mixin-hover.loadCurrentFileCache ): Parse and load cache specifically for the active file.

- **Clear All Cache** ( less-mixin-hover.clearAllCache ): Nuclear option. Resets all stored data. Use this if hover content becomes desynchronized or corrupted.

Curius?  
If you're bored and want to peek under the hood, go check out your  AppData\Roaming\Code\User\globalStorage\less-mixin-hover\mixin-cache  directory. That's where all your cached files are lying around.

### Comment Syntax

This extension generates hover documentation by parsing **JSDoc-style** block comments. Please ensure the comment is placed **immediately above** the target Mixin definition.

- **Format**: Must be wrapped in `/** ... */` or `/* ... */`.
- **Supported Tags**: Supports standard JSDoc identifiers such as `@param`, `@description`, etc.
 **Custom Tags**: Currently under development; supported custom tag types are being expanded.

**Example**

```less
/**
 * @description This is a standard border-radius mixin.
 * @param Number radius - The radius value.
 * @return Style border-radius property.
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

## Basic Settings

The extension provides flexible scan behavior for different development scenarios. Search for `MixinHelper` in VS Code settings to adjust the following options.

### 1. Search Mode
- **Setting**: `MixinHelper.searchMode`
- **Default**: `map`
  - **map (recommended)**: Build an index when a file opens or saves, then use that index for instant hover lookup.
  - **realtime**: Parse code on every hover, which may be slower and only supports lookups above the current position.

### 2. Sync Triggers
- **Open file scan**: `MixinHelper.syncMapOnOpen` (default: `true`)
  - Automatically rebuilds the mixin index when opening a `.less` file.
- **Save file scan**: `MixinHelper.syncMapOnSave` (default: `false`)
  - Refreshes the index on save so hover data stays up to date.
- **Focus scan**: `MixinHelper.syncMapOnFocus` (default: `false`)
  - Updates the index when switching back to VS Code from another window.

### 3. Notification & Log
- **Setting**: `MixinHelper.enableNotification`
- **Default**: `logSilently`
- Controls how the extension reports status and logs.

| Value | Behavior |
| :--- | :--- |
| `showOutputOnLog` | Log messages and automatically open the Output panel. |
| `popupWithoutLog` | Show notifications without writing logs. |
| `logSilently` | Log silently in the background without opening the Output panel. |
| `disableNotifications` | Disable notifications and logging. |

## Advanced Settings

> **Note**: These settings must be edited in `settings.json`.

### `MixinHelper.advancedSettings`

| Property | Default | Description |
| :--- | :--- | :--- |
| `maxPercentage` | `50` | Limits how much of the file is scanned. For example, `50` scans only the first half of the file. |
| `maxMixinCount` | `10` | Stops collecting mixins after the given count, regardless of file length. |
| `troubleshootingMode` | `strict` | Controls how lines containing `:` are interpreted during mixin detection. |


#### `troubleshootingMode` options

| Mode | Behavior |
| :--- | :--- |
| `strict` | Treat lines containing `:` as non-mixin lines in map mode, avoiding false matches. |
| `losse` | Allow lines with `:` to be considered mixin references in map mode. |

```less
// Exclude lines containing : to prevent false matches (e.g., CSS properties).
.border-radius(
@radius: 5px
) {...}
// Allow lines with : to be treated as mixin references.
.border-radius(@radius: 5px) {...}
```

### Example

```json
{
    "maxPercentage": 50,
    "maxMixinCount": 10,
    "troubleshootingMode": "strict"
}
```
## [Changelog](./docs/en/CHANGELOG.md)
