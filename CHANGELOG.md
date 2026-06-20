# Changelog

This file records the important changes for the "less-mixin-hover" extension.

## [0.0.4.3] - 2026-06-20

### Docs

- **Improved documentation**: Added `README.md` and supplemented related explanations to improve localization and reading experience.
- **Minor adjustments**: Small fixes to `src/extension.ts` and `package.json`.

## [0.0.4.2] - 2026-06-20

### Optimized

- **Improved debugging experience**: Adjusted debug-related code and logging to make development-time troubleshooting easier.
- **Adjusted build/config files**: Updated `package.json` and `tsconfig.json` to improve development configuration compatibility.

## [0.0.4.1] - 2026-06-19

### Added

- **Cache management commands**: Added commands to manage extension cache directly from the extension.
- **Date format improvements**: Improved date formatting for logs and outputs.

## [0.0.4] - 2026-06-19

### Major

- **Cache mechanism enhancements**: Introduced a cache manager module (`src/utils/cacheManager.ts`) to improve read/write efficiency.
- **Extension cache support**: Refactored `src/extension.ts` to integrate cache logic and reduce redundant computation.
- **Project configuration updates**: Updated `package.json`, `package-lock.json`, and `tsconfig.json` to refine extension metadata and build configuration.

## [0.0.3.3] - 2026-06-19

### Improved

- **Refined initialization and setup**: Organized startup and configuration loading logic for greater stability.
- **Configuration and subscription fixes**: Optimized trust checks and settings-change listeners to reduce unexpected triggers.

## [0.0.3.2] - 2026-06-18

### Major

- **Refactored Initialization**: Streamlined startup and config loading logic for better stability.
- **Added package.json Support**: Standardized metadata and build processes to prepare for future releases.
- **Fixed Workspace Trust & Events**: Optimized trust checks and event listeners to prevent unexpected triggers.

## [0.0.3.1] - 2026-06-15

### Optimized

- **Improved configuration management**: Enhanced how `MixinHelper` reads and applies settings.
- **Event subscription improvements**: Reduced unnecessary scans by improving listener accuracy.
- **Safer behavior in untrusted workspaces**: The extension is quieter and safer when the workspace is untrusted.

## [0.0.3] - 2026-06-15

### Major

- **Map-based full-file scan**: Packaged file-wide mixin scan results into a Map cached in memory to greatly speed up hover lookups.
- **Reduced runtime parsing overhead**: Rely on cache lookups instead of repeated parsing, improving performance on large files.

## [0.0.2.2] - 2026-06-07

### Optimized

- **Improved mixin pre-judgement logic**: Reduced false positives and increased efficiency in detecting mixin calls.
- **Better function parameter extraction**: More accurate parsing of parameters for documentation extraction.
- **Enhanced definition lookup**: Improved success rate when finding mixin definitions.

## [0.0.2.1] - 2026-06-05

### Optimized

- **Faster documentation extraction**: Optimized the comment extraction pipeline to avoid unnecessary parsing.
- **Added pre-judgement**: Early detection of mixin call characteristics to speed up extraction.

## [0.0.2] - 2024-06-04

### Fixed

- **Improved mixin definition lookup accuracy**: Rewrote the underlying scan logic so mixin names and parameter parentheses (`(`) do not need to be on the same line (supports multi-line definitions).
- **Fixed multi-line parsing issues**: Improved regex and parsing so hover suggestions remain reliable in complex Less syntax.

## [0.0.1] - 2024-06-02

### Added

- **Initial release of less-mixin-hover**: Implemented basic Less Mixin hover comments functionality.
- **Full-file scan mechanism**: Built an index on file open/save so hover lookups are millisecond-fast.
- **Basic hover support**: Show documentation comments when hovering over a mixin name.
