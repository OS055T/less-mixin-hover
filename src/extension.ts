import * as vscode from "vscode";
// import less from 'postcss-less';
// import fs from 'fs';
import {
    CacheManager,
    messageUtils,
    userCustomObjArray
} from "./utils/index";
// 注释块
import {
    annotationLine,
    annotationBlock,
    FileAnnotationContext,
    workspaceAnnotationMap
} from "./utils/index";
// ===
import {
    annotationProcessingRequest,
    cachedCache
} from "./utils/index";
// ===
import {
    mixinConfig,
    advancedmixinConfig,
} from "./utils/index";
import {
    LogPerformance
} from "./utils/index";
// L3
const globalCache: workspaceAnnotationMap = new Map<string, FileAnnotationContext>();
// L2
let activeCache: FileAnnotationContext = {};
// L1
let cachedCache: cachedCache = {};
// ===
let featurePack: vscode.Disposable | undefined;
/**
 * 【注意事项】
 * - 严禁直接修改 `DEFAULT_..._MAP` 中的值，它们是只读的基准。
 * - 新增配置项时，需同步更新 Interface 和 Default Map，否则会导致 TS 编译报错或运行时丢失默认值。
 */
// 1. 运行时状态层 (Runtime State - let ...)
let config: mixinConfig = {
    searchMode: "map",
    syncMapOnOpen: true,
    syncMapOnSave: false,
    syncMapOnFocus: false,
    enableNotification: "logSilently",
};
let advancedConfig: advancedmixinConfig = {
    maxPercentage: 30,
    maxMixinCount: 10,
    troubleshootingMode: "strict",
};
let USER_JSDOS: userCustomObjArray = {};
// 2. 静态常量层 (Static Defaults - const ... as const)
const DEFAULT_CONFIG_MAP: mixinConfig = {
    searchMode: "map",
    syncMapOnOpen: true,
    syncMapOnSave: false,
    syncMapOnFocus: false,
    enableNotification: "logSilently",
} as const;
const DEFAULT_ADVANCED_CONFIG_MAP: advancedmixinConfig = {
    maxPercentage: 30,
    maxMixinCount: 10,
    troubleshootingMode: "strict",
} as const;
const DEFAULT_JSDOS: userCustomObjArray = {
    "default": ["italic", "raw"],
    "@param": ["italic", "code", "raw"],
    "@paramCode": ["italic", "code", "code", "raw"],
    "@return": ["italic", "code", "raw"],
    "@description": ["italic", "preLineBreak"],
    "@example": ["italic"]
} as const;
// 3. 接口定义层 (Interfaces)
interface taskConstext {
    source?: string;
    position?: vscode.Position;
    line?: number;
};
//================= 1. 关键函数入口 ================= //
export function activate(context: vscode.ExtensionContext) {
    const initialization = new pluginInitializer(context);
    initialization.trigger();
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            initialization.trigger();
        })
    );
    context.subscriptions.push(
        vscode.workspace.onDidGrantWorkspaceTrust(() => {
            initialization.trigger();
        })
    );
}
class pluginInitializer {
    private context: vscode.ExtensionContext;
    private cacheManager: CacheManager;  // 新增
    constructor(
        context: vscode.ExtensionContext,
    ) {
        this.context = context;
        this.cacheManager = new CacheManager(context);  // 实例化
    }
    trigger() {
        // console.log('[调试] NixinHelper 正在激活...');
        if (!vscode.workspace.isTrusted) {
            console.warn('[调试][error] 当前工作区未受信任,MixinHelper 将保持静默状态以确保安全。');
            return;
        }
        console.log("[调试] 环境就绪,开始同步 MAP...");
        configManager.trigger();
        const { maxMixinCount, maxPercentage, troubleshootingMode } = advancedConfig;
        console.log(`[调试] 基础设置 模式: ${config.searchMode},打开时同步:${config.syncMapOnOpen},保存时同步:${config.syncMapOnSave}`);
        console.log(`[调试] 高级设置 最大百分比: ${maxPercentage},最大Mixin数:${maxMixinCount},排查模式:${troubleshootingMode}`);
        //设置更改
        this.context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (!e.affectsConfiguration("MixinHelper")) { return; }
                console.log("[调试] 触发IV设置更改");
                if (e.affectsConfiguration("MixinHelper.advancedSettings")) {
                    configManager.updateAdvancedConfig();
                } else if (e.affectsConfiguration("MixinHelper.userCustomComments")) {
                    configManager.updateuserCustomComments();
                } else {
                    const keys = Object.keys(DEFAULT_CONFIG_MAP) as Array<keyof typeof DEFAULT_CONFIG_MAP>;
                    for (const key of keys) {
                        const fullKey = `MixinHelper.${key}`;
                        if (e.affectsConfiguration(fullKey)) {
                            configManager.updateConfig(key);
                            this.updateSubscriptions();
                            const configkey = config[key];
                            console.log(`[调试]配置项 ${key} 已变更，当前值为: ${configkey}`);
                            break;
                        }
                    }
                }
            })
        );
        //鼠标悬停
        this.context.subscriptions.push(
            vscode.languages.registerHoverProvider(("less"), {
                provideHover
            })
        );
        const handleCacheOperation = async (successMsg: string, error?: string) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }
            try {
                const { enableNotification } = config;
                const result = await this.handleDocumentUpdate(editor.document, "switch");
                if (result === "L3" || result === "L4") {
                    enableNotification !== "disableNotifications" && (
                        messageUtils.showInfo(successMsg),
                        enableNotification !== "popupWithoutLog" &&
                        messageUtils.logObejct("当前缓存内容", globalCache, enableNotification)
                    );
                } else if (result === null) {
                    enableNotification !== "disableNotifications" && messageUtils.showInfo(error!);
                }
            } catch (error) {
                messageUtils.showInfo(`${error}`);
            }
        };
        //F1
        this.context.subscriptions.push(
            // 刷新缓存
            vscode.commands.registerCommand("less-mixin-hover.refreshMapCache", async () => {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    const path = editor.document.uri.fsPath;
                    cleanupData.L2(path);
                    this.cacheManager.invalidateCache(path);
                    console.log(editor);
                    handleCacheOperation("", "已刷新缓存内容");
                }
            }),
            // 加载缓存
            vscode.commands.registerCommand('less-mixin-hover.loadCurrentFileCache', async () => {
                handleCacheOperation("当前文件缓存已加载", "当前文件好像没有缓存? 已启用刷新Map缓存");
            }),
            // 清空内存
            vscode.commands.registerCommand("less-mixin-hover.clearAllCache", async () => {
                cleanupData.All();
                this.cacheManager.clearAllCache();
                config.enableNotification !== "disableNotifications" && messageUtils.showInfo("所有缓存已清除");
            }),
            // 清理缓存
            vscode.commands.registerCommand("less-mixin-hover.clearL2Cache", async () => {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    const path = editor.document.uri.fsPath;
                    cleanupData.L2(path);
                    config.enableNotification !== "disableNotifications" && messageUtils.showInfo("当前缓存已清除");
                }
            }),
            // Debug
            vscode.commands.registerCommand("less-mixin-hover.Debug", async () => {
                // cleanupData.All();
                const editor = vscode.window.activeTextEditor;
                if (!editor) { return; }
                new utils(editor.document).CoarseFilterbeta();
                // this.handleDocumentUpdate(editor.document, "switch");
                // new searchExecutor(editor?.document).handleDocumentUpdate("switch", this.cacheManager);
                // console.log(activeCache);
                // const editor = vscode.window.activeTextEditor;
                // if (!editor) { return; }
                // const docId = editor.document.uri.fsPath;
                // // 读取 Less 文件内容
                // const lessCode = fs.readFileSync(docId, 'utf8');
                // // 解析代码生成 AST
                // const ast = less.parse(lessCode);
                // console.log(ast);
                // // 打印出 AST 的结构
                // // console.log(JSON.stringify(ast, null, 2));
                // // 遍历 AST 树
                // const a = [];
                // ast.walkComments(c => {
                //     a.push({
                //         t: c.text,
                //         s: c.source?.start?.line,
                //         e: c.source?.end?.line
                //     });
                // });
            }),
        );
        this.updateSubscriptions();
    }
    private updateSubscriptions() {
        // 1. 【关键步骤】先销毁并清空旧的动态监听器
        if (featurePack) { featurePack.dispose(); }

        const disposable: vscode.Disposable[] = [];
        // 2. 注册新的监听器
        //map订阅监听器    
        if (config.searchMode === "map") {
            //触发I打开文件
            if (config.syncMapOnOpen) {
                disposable.push(vscode.workspace.onDidOpenTextDocument((doc) => {
                    console.log("[调试] 触发I打开文件");
                    this.handleDocumentUpdate(doc, "open");
                }));
            }
            //触发II保存文件
            if (config.syncMapOnSave) {
                disposable.push(vscode.workspace.onDidSaveTextDocument((doc) => {
                    console.log("[调试] 触发II保存文件");
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        this.cacheManager.invalidateCache(editor.document.uri.fsPath);
                        this.handleDocumentUpdate(doc);
                    }
                }));
            }
            //触发III切换文件
            if (config.syncMapOnFocus) {
                disposable.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
                    if (editor && editor.document) {
                        console.log("[调试] 触发III切换文件");
                        this.handleDocumentUpdate(editor.document);
                    }
                }));
            }
        }
        console.log(`[调试] MAP准备订阅${disposable.length}个`);
        if (disposable.length > 0) {
            // 3. 存入临时池（用于下次更新时销毁）
            featurePack = vscode.Disposable.from(...disposable);
            // 4. 同时也推入 context（确保插件彻底卸载时也能被清理，双重保险）
            this.context.subscriptions.push(featurePack);
        } else {
            featurePack = undefined;
        }
    }
    /**
     * 统一的数据获取入口
     * @param doc 当前文档对象
     * @param source 'switch'第一次启动除外/'open'第一次启动
     */
    private async handleDocumentUpdate(doc: vscode.TextDocument, source: string = "switch") {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        let b = '';
        if (source === 'switch') { b = doc.languageId; }
        else if (source === 'open') { b = editor.document.languageId; }
        if (!['less'].includes(b)) { return; }
        let filePath = doc.uri.fsPath;
        if (source === 'open') {
            doc = editor.document;
            filePath = editor.document.fileName;
        }
        // 如果 L3 有，返回，顺便更新 L2 (当前激活缓存)
        if (globalCache.has(filePath)) {
            console.log("[调试][命中 L3] 从全局缓存恢复...");
            const data = globalCache.get(filePath);
            activeCache = data!; // 更新 L2 引用
            return "L3";
        }
        // === 2. 检查 L4 (本地数据库) ===
        let data = this.cacheManager.readCache(filePath);
        if (data) {
            console.log("[调试][命中 L4] 从磁盘读取成功，回填内存...");
            // 回填 L3
            globalCache.set(filePath, data);
            // 回填 L2
            activeCache = data;
            return "L4";
        } else {
            // === 3. L4 也没有 -> 重新扫描 (最坏情况) ===
            // console.log("[调试][未命中] 开始全量扫描文件...");
            data = new processors(doc).globalSearchbeta();
            if (data) {
                // 写入 L3
                globalCache.set(filePath, data);
                // 写入 L2
                activeCache = data;
                // 写入 L4 
                this.cacheManager.writeCache(filePath, data);
                return null;
            }
        }
    }
}
class configManager {
    private static _getRawConfig<T>(section: string): T | undefined {
        return vscode.workspace.getConfiguration("MixinHelper").get<T>(section);
    }
    static trigger() {
        this.updateConfig();
        this.updateAdvancedConfig();
        this.updateuserCustomComments();
    }
    static updateConfig<T extends keyof typeof DEFAULT_CONFIG_MAP>(
        target?: T,
    ) {
        const configs = vscode.workspace.getConfiguration("MixinHelper");
        const processKey = (key: keyof typeof DEFAULT_CONFIG_MAP) => {
            // 组装当前默认值
            const defaultVal = DEFAULT_CONFIG_MAP[key];
            // 获取VS code对应的当前值
            const defaultValue = configs.get<mixinConfig[T]>(key, defaultVal as any);
            // 写入自身全局变量
            (config as any)[key] = configs.get(key, defaultValue);
        };
        if (target) {
            processKey(target);
        } else {
            for (const key of Object.keys(DEFAULT_CONFIG_MAP) as Array<keyof typeof DEFAULT_CONFIG_MAP>) {
                // 这里复用了上面的逻辑直接调用
                processKey(key);
            }
        }
    }
    static updateAdvancedConfig<T extends keyof typeof DEFAULT_ADVANCED_CONFIG_MAP>(
        target?: T
    ) {
        // 获取VS code对应的当前项
        const rawAdvancedObj = this._getRawConfig("advancedSettings") as typeof DEFAULT_ADVANCED_CONFIG_MAP;
        const processKey = (key: keyof typeof DEFAULT_ADVANCED_CONFIG_MAP) => {
            // 尝试从用户配置中获取当前项
            const userValue = rawAdvancedObj[key];
            // 获取默认值作为兜底
            const defaultValue = DEFAULT_ADVANCED_CONFIG_MAP[key];
            // 写入全局变量
            (advancedConfig as any)[key] = userValue !== undefined ? userValue : defaultValue;
        };
        if (target) {
            // --- 场景 A：指定了目标（通常是配置变更监听触发） ---
            console.log(`[调试] 正在更新单项: ${String(target)}`);
            processKey(target);
        } else {
            // --- 场景 B：未指定目标（通常是插件启动时的初始化） ---
            // console.log("[Beta Init] 正在初始化所有高级配置...");
            // console.log("[调试] VS Code 返回的原始配置对象:", JSON.stringify(rawAdvancedObj, null, 2));
            for (const key of Object.keys(DEFAULT_ADVANCED_CONFIG_MAP) as Array<keyof typeof DEFAULT_ADVANCED_CONFIG_MAP>) {
                processKey(key);
            }
        }
    }
    static updateuserCustomComments() {
        const userObj: userCustomObjArray = JSON.parse(JSON.stringify(DEFAULT_JSDOS));
        const userConfigs = this._getRawConfig("userCustomComments") || {};
        for (const [trigger, rules] of Object.entries(userConfigs)) {
            if (!trigger.startsWith("@")) { continue; }
            if (rules) { userObj[trigger] = rules; }
        }
        // console.log(`[调试] ${JSON.stringify(userConfigs, null, 2)}`);
        USER_JSDOS = userObj;
    }
}
function provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
    const a = new dispatcher(new searchExecutor(document), config.searchMode);
    const commentContent = a.trigger({ position: position });
    if (commentContent) {
        return commentContent;
    } else {
        return undefined;
    }
}
//================= 2. 悬停的主要class区 ================= //
/** 纯工具函数：
 * 只管接收输入并稳定输出，绝不返回空值，输入啥奇怪东西就吐啥奇怪结果，不掺和业务逻辑。 */
class utils {
    private lines: string[];
    private static readonly DEFAULT_DICTIONARY = {
        "bold": (t: string) => `**${t}**`,
        "italic": (t: string) => `*${t}*`,
        "strikethrough": (t: string) => `~~${t}~~`,
        "boldAndItalic": (t: string) => `***${t}***`,
        "underline": (t: string) => `<ins>${t}</ins>`,
        // 好像等于 Tap?
        "quotingText": (t: string) => `> ${t}`,
        // 代码格式
        "code": (t: string) => `\`${t}\``,
        // 不改动
        "raw": (t: string) => `${t}`,
        // 换行前置 raw 的附属
        "preLineBreak": (t: string) => `\n\n${t}`,
        // 啥也没有
        "null": (t: string) => ""
    };
    constructor(
        document: vscode.TextDocument,
    ) {
        this.lines = this.line(document);
    }
    line(document: vscode.TextDocument) {
        return document.getText().split(/\r?\n/);
    }
    /**验证目标行号是否符合Mixin格式
     * @param  i - 目标行号
     * @returns 布尔值 */
    validateMixin(i: number): boolean {
        const lineText = this.lines[i].trim();
        if ((lineText.startsWith(".") || lineText.startsWith("#")) && lineText.includes("(")) {
            for (let i2 = i; i2 < this.lines.length; i2++) {
                const lineText = this.lines[i2].trim();
                if (lineText.includes(";")) { return false; }
                else if (lineText.includes("{") && lineText.includes(")")) { return true; }
                // else if (lineText.includes("{")) {return true;}
                // else if (lineText.includes("}")) {return false;}
            }
        }
        return false;
    }
    CoarseFilterbeta() {
        const taskMap = {
            // CoarseFilterMS
            'strict': (i: number) => {
                const lineText = this.lines[i].trim();
                if (lineText.includes("(") && !lineText.includes(";") && !lineText.includes(":")) {
                    return true;
                }
                return false;
            },
            // CoarseFilterML
            'losse': (i: number) => {
                const lineText = this.lines[i].trim();
                if (lineText.includes("(") && !lineText.includes(";")) {
                    return true;
                }
                return false;
            },
        };
        const { maxMixinCount, maxPercentage, troubleshootingMode } = advancedConfig;
        const task = taskMap[troubleshootingMode as keyof typeof taskMap];
        // const boo = task(1);
        const limit = maxPercentage !== 0
            ? Math.floor(this.lines.length * (Math.min(Math.max(maxPercentage, 0), 100) / 100))
            : this.lines.length;
        let phaseI = [];
        for (let i = 0, foundCount = 0;
            i < limit && (maxMixinCount === 0 || foundCount < maxMixinCount);
            i++
        ) {
            if (!task(i)) { continue; }
            const isValid = this.validateMixin(i);
            if (isValid) {
                phaseI.push(i);
                foundCount++;
            }
        }
        return phaseI;
    }
    /** 获取指定行上方的文档注释 (JSDoc 风格)
     * @param definitionLineIndex Mixin 定义所在的行号
     * @returns 提取出的纯文本注释内容，如果没有找到则返回 null
     */
    getJSDocCommentbeta(definitionLineIndex: number): string[] | undefined {
        // 1. 从定义行的上一行开始倒序遍历
        for (let i = definitionLineIndex - 1, limit = 0; i >= 0 && limit < 30; i--, limit++) {
            const lineText = this.lines[i].trim();
            // 2. 终止条件：如果遇到空行，或者遇到了代码符号（如 ';'），说明注释区域结束了
            if (lineText.endsWith(';')) { break; }
            if (lineText === '') { continue; }
            // 3. 识别结束标记 '*/'
            if (lineText.endsWith('*/')) {
                let phaseI: string[] = [];
                // 继续向上寻找开始的 '/*'
                for (let i2 = i, limit = 0; i2 >= 0 && limit < 30; i2--, limit++) {
                    const prevLine = this.lines[i2].trim();
                    phaseI.unshift(prevLine); // 放入数组头部，保持顺序
                    // 4. 识别开始标记 '/*'
                    if (prevLine.startsWith('/*')) {
                        // 5. 清洗数据：去掉 /*, */, * 以及首尾空格
                        const phaseII = phaseI
                            .map(line => line.replace(/\/\*|\*\/|\*/g, '').trim()) // 正则去除注释符号
                            .filter(Boolean);
                        return phaseII;
                    }
                }
            }
        }
        return undefined; // 没找到
    }
    static porcessRawDocsbeta(textBlock: annotationBlock[] | undefined, mixinName: string)/*: vscode.MarkdownString*/ {
        const consttxt = '貌似没有写备注哦';
        const md = new vscode.MarkdownString();
        md.supportHtml = true; // 开启 HTML 支持，用于微调样式
        md.isTrusted = true;   // 信任内容，允许运行部分安全指令
        // --- 1. 顶部标题 (Mixin 名字) ---
        md.appendMarkdown(`<h2 style="font-size:1.5em;">${mixinName}</h2>\n\n`);
        const mixinExecutor = {
            hendlers: {
                "@example": "handleexample",
            },
            mdAppendQueue: function (annotation: annotationBlock) {
                for (let i = 0; i < annotation.length; i++) {
                    const block = annotation[i];
                    const type = block.type;
                    if (this.hendlers[type as keyof typeof this.hendlers]) {
                        const metnodName = this.hendlers[type as keyof typeof this.hendlers];
                        i += (this as any)[metnodName](annotation, i);
                    } else {
                        md.appendMarkdown(block.text + '\n\n');
                    }
                }
            },
            handleexample: function (annotation: annotationBlock, i: number) {
                let a = 0;
                const annotationBlock = annotation[i];
                const parts = annotationBlock.text.split(" ", 2);
                let cleanCode = parts[1] || "";
                if (!cleanCode) {
                    if (annotation[i + 1] && !annotation[i + 1].text.endsWith("@")) {
                        cleanCode = annotation[i + 1].text.trim();
                        a++;
                    } else {
                        md.appendMarkdown(parts[0]);
                        return 1;
                    }
                }
                md.appendMarkdown(parts[0]);
                md.appendCodeblock(cleanCode, "less");
                return a;
            }
        };
        if (textBlock === undefined) {
            md.appendMarkdown(consttxt);
        } else if (textBlock && textBlock.length === 1) {
            textBlock.forEach(annotation => {
                mixinExecutor.mdAppendQueue(annotation);
            });
        } else {
            let count = 1;
            textBlock.forEach(annotation => {
                md.appendMarkdown(`### [这是同名的第 ${count++} 个注释]\n\n`);
                mixinExecutor.mdAppendQueue(annotation);
            });
        }
        const z = {
            text: md,
            value: md.value,
        };
        return z;
    }
    /**[纯工具] JSDoc 标签格式化器
     * @description
     * 将单行注释内容解析并组装为 Markdown 格式的悬停提示文本。
     * 内部通过字典映射规则，自动处理加粗、代码块等样式渲染。
     * @param rawCom 原始文本注释块
     * @returns 返回 格式化后的 Markdown annotationBlock 注释块
     */
    static formatJSDocLinebeta(rawCom: string[]) {
        let final: annotationBlock = [];
        const mixinExecutor = {
            trigger: function (part: string, userCustom: userCustomObjArray = DEFAULT_JSDOS) {
                if (!part.startsWith("@")) {
                    return this.combinedOutput(part, "plainText");
                }
                const parts = part ? part.trim().split(/\s+/) : [];
                // 如果 p0 = @param
                const p0 = parts[0];
                // 那么 activeRules 返回 ["italic", "code", "raw"]
                const activeRules: string[] | undefined = userCustom[p0];
                if (activeRules) {
                    return this.processParts(parts, activeRules, p0);
                } else {
                    // console.log(`[调试][error] 未找到标签 '${p0}'，使用 'default' 代替 `);
                    return this.processParts(parts, userCustom["default"], p0);
                }
            },
            processParts: function (parts: string[], rules: string[], label: string) {
                let phaseI: string[] = [];
                for (let i = 0; i < parts.length; i++) {
                    const text = parts[i];
                    const met = rules[i];
                    // console.log(`[调试] ${met}`);
                    if (met && met in utils.DEFAULT_DICTIONARY) {
                        const result = utils.DEFAULT_DICTIONARY[met as keyof typeof utils.DEFAULT_DICTIONARY](text);
                        phaseI.push(result);
                    } else {
                        phaseI.push(text);
                    }
                }
                const phaseII = phaseI
                    .filter(Boolean)
                    .join(' ');
                // console.log(`[调试] ${phaseII}`);
                return this.combinedOutput(phaseII, label);
            },
            combinedOutput: function (text: string, type: string) {
                return { text: text, type: type };
            }
        };
        rawCom.forEach(val => {
            const interim = mixinExecutor.trigger(val, USER_JSDOS);
            final.push(interim);
        });
        return final;
    }
}
/** 纯业务函数：
 * 干活的熟练工，专注处理核心业务逻辑，把复杂流程拆解成一个个原子级的小任务。 */
class processors {
    private document: vscode.TextDocument;
    constructor(
        document: vscode.TextDocument,
    ) {
        this.document = document;
    }
    /** 基于行号的 Mixin 可能性筛查工具函数
     * @param line 目标行号
     * @returns {boolean} 如果该行看起来像 Mixin 定义，返回 true
     */
    mixinProbabilityScreening(
        line: number
    ): boolean {
        // 1. 获取行文本
        const text = this.document.lineAt(line).text.trim();
        if (!text) { return false; }
        // 2. 找到第一个左括号
        const PhaseI = text.indexOf('(');
        // 没有括号肯定不是函数调用
        if (PhaseI === -1) { return false; }
        const PhaseII = text.substring(0, PhaseI);
        // [.#]       -> 必须以 . 或 # 开头 (Mixin的特征)
        // [a-zA-Z0-9_\-@\s]+ -> 中间允许包含字母、数字、下划线、连字符、变量符(@)以及【空格】
        const match = PhaseII.match(/[.#][a-zA-Z0-9_\-\@\s]+$/);
        // 如果没匹配到以 . 或 # 开头的片段，说明这可能只是个普通的 CSS 函数 (如 calc, rgba)
        if (!match) { return false; }
        // 3. 获取匹配到的原始字符串并去除首尾空格
        // 比如 "background: .my-mixin" -> 提取出 ".my-mixin"
        // 比如 "background: . my-mixin" -> 提取出 ". my-mixin" -> trim后变成 ".my-mixin" (或者保留空格视需求而定)
        let PhaseIII = match[0].trim();
        // 4. 二次清洗（可选）：防止 ". my-mixin" 这种怪异情况
        // PhaseIII = PhaseIII.replace(/\s+/g, '');
        // 5. 排除纯 CSS 函数黑名单 (虽然上面的正则已经排除了大部分，但这层保险更稳)
        const cssFunctions = ['calc', 'var', 'rgb', 'rgba', 'hsl', 'url'];
        // 去掉开头的 . 或 # 后检查是否是纯函数名
        const PhaseIV = PhaseIII.replace(/^[.#]/, '');
        if (cssFunctions.includes(PhaseIV)) { return false; }
        // 6. 通过初筛
        console.log(`[调试] 可能是 Mixin: ${PhaseIII}`);
        return true;
    }
    /** 辅助函数：向上查找 Mixin 的定义,返回所在的行号
     * @param mixinName 需要查找的 Mixin 名字 (例如 ".border-radius")
     * @param currentLineIndex 当前鼠标所在的行号 (用于跳过自身)
     * @return 提取所在的行号，如果没找到则返回 undefined
     */
    findMixinDefinition(mixinName: string, currentLineIndex: number): annotationBlock[] | undefined {
        // 1. 构建正则：转义特殊字符，并匹配紧跟的左括号 (允许中间有空格)
        // 比如名字是 .box，正则会匹配 .box( 或 .box (
        const escapedName = mixinName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // 允许中间有任意字符（比如注释、奇怪的符号），只要最后是 ( 就行
        // .*? 表示“非贪婪匹配”，会尽快找到第一个 (
        const regex = new RegExp(`${escapedName}.*?\\(`);
        // 2. 从当前行的上一行开始，倒序遍历整个文档
        const util = new utils(this.document);
        for (let i = currentLineIndex; i >= 0; i--) {
            const lineText = this.document.lineAt(i).text.trim();
            // 3. 初步匹配：看这行有没有 "名字("
            if (regex.test(lineText)) {
                let existingLtem = false;
                for (let input = i; ;) {
                    const output = util.validateMixin(input);
                    if (output) { existingLtem = true; break; }
                    else { break; }
                }
                if (existingLtem) {
                    // 3.1 调用新工具函数，一行搞定参数提取
                    // const paramsString = this.extractMixinParams(i);
                    // console.log(`找到定义在第 ${i} 行，参数为: [${paramsString}]`);
                    // 3. 继续执行原本的注释搜索逻辑...
                    const rawCom = util.getJSDocCommentbeta(i);
                    if (!rawCom) { console.log(`[调试][error] 未找到该 Mixin 的定义`); return undefined; }
                    // let final: annotationLine[] = [];
                    const interim = utils.formatJSDocLinebeta(rawCom);
                    return interim.length >= 1 ? [interim] : undefined;
                }
            }
        }
        return undefined; // 没找到
    }
    /** 跨行提取 Mixin 参数的工具函数,提取到的参数字符串(未使用,但后续可以用来增强提示信息，比如显示参数列表)
     * @param startLineIndex 包含 Mixin 名称的起始行号/位置
     * @returns 提取到的参数字符串 (如 "@color, @size: 10px")，若未找到则返回空字符串
     */
    extractMixinParams(startLineIndex: number): string {
        let accumulatedText = ""; // 累积文本缓冲区
        let parenCount = 0;       // 括号计数器：用于追踪嵌套层级
        let hasOpenParen = false; // 标记是否已经遇到了左括号 "("
        const totalLines = this.document.lineCount;
        // 开启向下扫描循环
        for (let i = startLineIndex; i < totalLines; i++) {
            // 获取当前行文本并去除首尾空白
            const lineText = this.document.lineAt(i).text.trim();
            // 【防御性拦截】：如果遇到大括号 "}"，说明出去了函数体，参数部分结束
            if (lineText.includes("}")) {
                break;
            }
            // 累加当前行内容到缓冲区
            accumulatedText += lineText;
            // 【核心算法】：逐字符统计括号平衡
            for (const char of lineText) {
                if (char === "(") {
                    parenCount++;
                    hasOpenParen = true;
                } else if (char === ")") {
                    parenCount--;
                }
            }
            // 【终止条件】：
            // 1. 必须遇到过左括号 (hasOpenParen)
            // 2. 括号计数归零 (parenCount === 0)，说明找到了闭合的 ")"
            if (hasOpenParen && parenCount === 0) {
                // 提取括号内的内容
                const openIndex = accumulatedText.indexOf("(");
                const closeIndex = accumulatedText.lastIndexOf(")");
                if (openIndex !== -1 && closeIndex !== -1) {
                    const paramsContent = accumulatedText.substring(openIndex + 1, closeIndex).trim();
                    return paramsContent;
                }
                break; // 理论上走到这里就该结束了
            }
        }
        // 兜底：如果没有找到完整的参数对，返回空字符串或原始累积文本供后续判断
        return "";
    }
    // ================
    /** 全局查找 Mixin 名字的函数map版本  
     * 核心逻辑：扫描整个文档，找到所有可能的 Mixin 定义，并把它们的名字和注释内容存到一个 Map 里
     * @param document 当前文档
     * @returns key 是 Mixin 名字，value 是注释内容
     */
    globalSearchbeta(): FileAnnotationContext | undefined {
        const util = new utils(this.document);
        const phaseI = util.CoarseFilterbeta();
        if (phaseI.length === 0) { return; }
        const map: FileAnnotationContext = {};
        phaseI.forEach(i => {
            const rawCom = util.getJSDocCommentbeta(i);
            if (!rawCom) { return; }
            const final = utils.formatJSDocLinebeta(rawCom);
            const lineText = this.document.lineAt(i).text;
            // const match = lineText.match(/^\.?([a-zA-Z0-9_-]+)\s*\(/);
            const match = lineText.match(/[.#]([^\(\s]+)\s*\(/);
            const key = match ? match[1] : lineText.trim();
            if (!map[key]) {
                map[key] = [final];
            } else {
                map[key].push(final);
            }
        });
        // console.log(JSON.stringify(map, null, 2));
        console.log(map);
        return map;
    }
    /**
     * @description 将杂乱的输入源清洗并融合...
     * @param input.position - 光标位置
     * @param input.text - 注释文本内容
     * @returns {vscode.Hover} - 返回最后组装好的内容
     */
    createHoverObjectbeta(input: annotationProcessingRequest): vscode.Hover {
        // console.log('[调试] 当前注释:', input.docText);
        const phaseI = utils.porcessRawDocsbeta(input.annotationContext, input.mixinName);
        cachedCache[input.mixinName] = phaseI.value;
        const range = this.document.lineAt(input.position.line).range;
        // 4. 创建 Hover 实例
        // 第一个参数是内容，第二个参数是显示的矩形范围（决定鼠标放哪里才显示）
        const hover = new vscode.Hover(phaseI.text, range);
        // 5. 返回结果
        return hover;
    }
    createHoverObjectdgamma(input: annotationProcessingRequest): vscode.Hover {
        const md = new vscode.MarkdownString();
        md.supportHtml = true;
        md.appendMarkdown(input.cachedCacheContext!);
        const range = this.document.lineAt(input.position.line).range;
        const hover = new vscode.Hover(md, range);
        return hover;
    }
}
/** 事务处理器
 * 包工头，负责把大目标拆成几个小步骤，按顺序挨个调用底层任务，并兜底返回最终结果。 */
class searchExecutor {
    private document: vscode.TextDocument;
    constructor(
        document: vscode.TextDocument,
    ) {
        this.document = document;
    }
    mapbeta(position: vscode.Position): vscode.Hover | undefined {
        const processor = new processors(this.document);
        const phase = processor.mixinProbabilityScreening(position.line);
        if (!phase) { return undefined; }
        const phaseI = this.document.lineAt(position.line).text;
        // const match = phaseI.match(/\b([a-zA-Z0-9_-]+)\b/);
        // const key = match?.[1];
        // 使用新的正则
        const match = phaseI.match(/[.#]([^()\s]+)/);
        if (!match) { return undefined; }
        // match[0] 是 ".className" (包含前缀)
        // match[1] 是 "className" (纯名字)
        // 既然你要构建完整的 Key，建议直接用 match[0]，或者手动拼接
        const key = match[1];
        if (!key) { return undefined; }
        const finalText = this.L1(key, position, processor);
        return finalText;//Phase 3
    }
    /** 核心业务逻辑：非map的函数逻辑
     *  实时计算当前鼠标所在位置是否是 Mixin 调用，如果是则找到对应的定义行并提取注释内容
     * @param position 当前鼠标位置
     * @returns 注释内容字符串，如果没有找到则返回 undefined
     */
    startupfunction(position: vscode.Position): vscode.Hover | undefined {
        try {
            // 1. 获取当前鼠标所在的单词范围
            const wordRange = this.document.getWordRangeAtPosition(position);
            if (!wordRange) { return; }
            const processor = new processors(this.document);
            // 2. 【关键一步】预判：检查单词后面是不是 "("
            const nextChar = processor.mixinProbabilityScreening(position.line);
            // 3. 判断：如果是 Mixin (后面有括号)，才继续执行
            if (!nextChar) { return undefined; }
            // 1. 获取这个单词的文本
            const wordText = this.document.getText(wordRange);
            if (!cachedCache[wordText]) {
                const rawCom = processor.findMixinDefinition(wordText, position.line);
                rawCom ? activeCache[wordText] = rawCom : null;
            }
            return this.L1(wordText, position, processor);
        } catch (error) {
            console.error("错误堆栈", error);
        }
    }
    L1(name: string, position: vscode.Position, processor: processors): vscode.Hover {
        if (cachedCache[name]) {
            const APR: annotationProcessingRequest = {
                position: position,
                mixinName: name,
                cachedCacheContext: cachedCache[name]
            };
            return processor.createHoverObjectdgamma(APR);
        } else {
            const phaseIII = activeCache?.[name];
            const APR: annotationProcessingRequest = {
                position: position,
                mixinName: name,
                annotationContext: phaseIII
            };
            return processor.createHoverObjectbeta(APR);
        }
    }
}
/** 核心调度器 
 * 负责管理业务逻辑分发与状态控制。
 * @class dispatcher
 * @description 作为系统的“指挥官”，它不直接处理具体数据，而是根据当前配置将任务路由给对应的执行器。
 *
 * @property {SearchExecutor} executionGoals - [执行目标]
 *   持有具体的业务执行实例（如 SearchExecutor）。
 *   用于判断并指向实际干活的 Class，是底层能力的提供者。
 *
 * @property {string} currentMode - [当前模式]
 *   标识系统当前的运行状态（例如 'map' 或 'realtime'）。
 *   用于在 trigger 触发时，决定调用执行器中的哪一个具体方法。
 *
 * @method trigger(context:TaskContext):string|undefined
 *   统一入口函数。
 *   ⚠️ 【高危操作区】在此处完成数据包的拆解与参数映射。
 */
class dispatcher {
    private executionGoals: searchExecutor;
    private currentMode: string;
    constructor(
        executionGoals: searchExecutor,
        initialMode: string,
    ) {
        this.executionGoals = executionGoals;
        this.currentMode = initialMode;
    }
    trigger(context: taskConstext): undefined | vscode.Hover {
        // ==========================================
        // ⚠️ 【高危警告 / HIGH RISK WARNING】 ⚠️
        // ==========================================
        // 1. 严禁在执行器 (SearchExecutor) 内部直接访问 context 对象进行拆包！
        // 2. 所有的参数提取、类型转换必须在此处 (Driver层) 完成。
        // 3. 原因：执行器应保持纯粹，只接收明确类型的参数。若在执行器内拆包，
        //    会导致耦合度极高，一旦 Context 结构变更，所有底层逻辑都会崩溃。
        // ==========================================
        const taskMap = {
            'realtime': (ctx: taskConstext) => {
                const a = this.executionGoals.startupfunction(ctx.position!);
                return a;
            },
            'map': (ctx: taskConstext) => {
                const a = this.executionGoals.mapbeta(ctx.position!);
                return a;
            },
        };
        const task = taskMap[this.currentMode as keyof typeof taskMap];
        if (task) {
            return task(context);
        }
        console.log("[调试][error] 未知模式: " + this.currentMode);
        return undefined;
    }
}
class cleanupData {
    static All() {
        // L3
        globalCache?.clear();
        // L2
        activeCache = {};
        // L1
        cachedCache = {};
    }
    static L2(path?: string) {
        // L3
        path ? globalCache.delete(path) : null;
        // L2
        activeCache = {};
        // L1
        cachedCache = {};
    }
}
export function deactivate() {
    cleanupData.All();
}