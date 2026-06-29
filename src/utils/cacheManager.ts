import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as vscode from "vscode";
import {
    annotationLine,
    annotationBlock,
    FileAnnotationContext,
    workspaceAnnotationMap
} from "./index";
interface CacheMetadata {
    docId: string;                      // 文件路径
    timeStamp: number;                  // 缓存生成时间    
    dateStamp: string;                    // 缓存格式版本
}

interface CacheEntry {
    data: Record<string, any>;
    metadata: CacheMetadata;
}

export class CacheManager {
    private cacheDir: string;

    constructor(context: vscode.ExtensionContext) {
        // 使用 VS Code 的持久化存储目录
        this.cacheDir = path.join(context.globalStorageUri.fsPath, 'mixin-cache');
        this.ensureCacheDir();
    }
    // 创建文件
    private ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }
    
    /**
     * 生成缓存文件路径
     * docId (文件路径) -> 安全的文件名
     */
    private getCachePath(docId: string): string {
        const hash = crypto.createHash('md5').update(docId).digest('hex');
        return path.join(this.cacheDir, `${hash}.json`);
    }

    /**
     * 获取 YYMMDDHHmm 格式的日期字符串
     * 例如: 2606191342 (代表 2026年6月19日 13点42分)
     */
    private getDateString(): string {
        const d = new Date();
        // 取年份后两位
        const year = String(d.getFullYear()).slice(-2);
        // 月份+1，补零
        const month = String(d.getMonth() + 1).padStart(2, '0');
        // 日期，补零
        const day = String(d.getDate()).padStart(2, '0');
        // 小时，补零
        const hour = String(d.getHours()).padStart(2, '0');
        // 分钟，补零
        const minute = String(d.getMinutes()).padStart(2, '0');
        return `${year}${month}${day}${hour}${minute}`;
    }

    /**
     * 读取缓存 (如果有效)
     * @returns 缓存数据或 null (缓存已失效)
     */
    public readCache(
        docId: string,
    ): FileAnnotationContext | undefined {
        try {
            const cachePath = this.getCachePath(docId);

            // 1. 检查缓存文件是否存在
            if (!fs.existsSync(cachePath)) {
                return undefined;
            }

            // 2. 读取并解析缓存
            const cacheContent = fs.readFileSync(cachePath, 'utf-8');
            const cacheEntry: CacheEntry = JSON.parse(cacheContent);

            // 4. 缓存有效 ✅
            console.log(`[调试] 缓存命中上次记录时间为${cacheEntry.metadata.dateStamp}`);
            return cacheEntry.data;

        } catch (error) {
            console.error(`[调试][error]缓存读取失败: ${error}`);
            return undefined;
        }
    }

    /**
     * 写入缓存
     */
    public writeCache(
        docId: string,
        mapData: Record<string, any>,
    ): boolean {
        try {
            const cachePath = this.getCachePath(docId);

            if (!fs.existsSync(this.cacheDir)) {
                this.ensureCacheDir();
            }
            
            const cacheEntry: CacheEntry = {
                data: mapData,
                metadata: {
                    docId: docId,
                    timeStamp: Date.now(),
                    dateStamp: this.getDateString()
                }
            };

            fs.writeFileSync(
                // 文件路径哈希
                cachePath,
                JSON.stringify(cacheEntry, null, 2),
                'utf-8'
            );

            // console.log(`[调试] 当前文件已保存缓存: ${docId}`);
            return true;

        } catch (error) {
            console.error(`[调试][error] 缓存写入失败: ${error}`);
            return false;
        }
    }

    /**
     * 清空单个缓存
     */
    public invalidateCache(docId: string): void {
        try {
            const cachePath = this.getCachePath(docId);
            if (fs.existsSync(cachePath)) {
                fs.unlinkSync(cachePath);
                // console.log(`[调试] 缓存已清除: ${docId}`);
            }
        } catch (error) {
            console.error(`[调试][error] 缓存清除失败: ${error}`);
        }
    }

    /**
     * 清空所有缓存 (用户手动刷新时)
     */
    public clearAllCache(): void {
        try {
            if (fs.existsSync(this.cacheDir)) {
                fs.rmSync(this.cacheDir, { recursive: true, force: true });
                this.ensureCacheDir();
                console.log(`[调试] 所有缓存已清除`);
            }
        } catch (error) {
            console.error(`[调试][error] 批量清除缓存失败: ${error}`);
        }
    }

    /**
     * 获取缓存统计信息 (用于调试)
     */
    public getCacheStats(): { totalSize: number; fileCount: number } {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                return { totalSize: 0, fileCount: 0 };
            }

            const files = fs.readdirSync(this.cacheDir);
            let totalSize = 0;

            files.forEach(file => {
                const filePath = path.join(this.cacheDir, file);
                const stats = fs.statSync(filePath);
                totalSize += stats.size;
            });

            return {
                totalSize,
                fileCount: files.length
            };
        } catch (error) {
            console.error(`获取缓存统计失败: ${error}`);
            return { totalSize: 0, fileCount: 0 };
        }
    }
}