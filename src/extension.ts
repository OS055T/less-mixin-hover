import * as vscode from "vscode";
import { CacheManager, messageUtils, userCustomObjArray } from "./utils/index";
const lookup = new Map<string, Record<string, commentTextoutput[] | undefined>>();
let currentFileContext: Record<string, commentTextoutput[] | undefined>;
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
    maxPercentage: 50,
    maxMixinCount: 10,
    troubleshootingMode: "strict",
};
// 2. 静态常量层 (Static Defaults - const ... as const)
const DEFAULT_CONFIG_MAP: mixinConfig = {
    searchMode: "map",
    syncMapOnOpen: true,
    syncMapOnSave: false,
    syncMapOnFocus: false,
    enableNotification: "logSilently",
} as const;
const DEFAULT_ADVANCED_CONFIG_MAP: advancedmixinConfig = {
    maxPercentage: 50,
    maxMixinCount: 10,
    troubleshootingMode: "strict",
} as const;
// 3. 接口定义层 (Interfaces)
interface mixinConfig {
    searchMode: string,
    syncMapOnOpen: boolean,
    syncMapOnSave: boolean,
    syncMapOnFocus: boolean,
    enableNotification: string,
};
interface advancedmixinConfig {
    maxPercentage: number,
    maxMixinCount: number,
    troubleshootingMode: string,
}
/**
 * @interface TaskContext
 * @description 【通用上下文数据包】用于在系统各层级间传递数据的标准化容器。
 *              所有的输入参数在进入 trigger() 之前，必须按照此结构进行组装。
 *
 * @packing_rules [打包准则 / Packing Protocol]
 * 1. **单一入口原则**：禁止向 trigger 传递零散参数（如 doc, line），必须在调用前封装为此对象。
 * 2. **字段职责分离**：
 *    - source: 专用于 map 模式，承载文档全文内容。
 *    - position: 专用于 realtime 模式，承载光标位置信息。
 * 3. **防御性打包**：如果不确定某个字段是否有值，请显式传入 undefined，不要省略键名。
 *
 * @property {string} [source] - [Map模式专用] 区分哪个监听器打开的
 * @property {vscode.Position} [position] - [Realtime模式专用] VS Code 原生位置对象。
 */
interface taskConstext {
    source?: string;
    position?: vscode.Position;
    line?: number;
};
//==================
interface commentTextoutput {
    text: string,
    example?: string
}
interface annotationContext {
    currentMode: string,
    realtimetext?: commentTextoutput | null,
    mapText?: commentTextoutput[] | undefined
}
interface annotationProcessingRequest {
    position: vscode.Position,
    mixinName: string,
    annotationContext: annotationContext,
}
// function log(target: any, key: string, descriptor: PropertyDescriptor) {
//     const a = descriptor.value;
//     descriptor.value = function (...atgs: any[]) {
//         console.log(`[调试][log] 调用方法${key},参数:`, atgs);
//         const b = a.apply(this, atgs);
//         console.log(`[调试][log] 返回`, b);
//         return b;
//     };
//     return descriptor;
// }
//================= 1. 关键函数入口 ================= //
export function activate(context: vscode.ExtensionContext) {
    const initialization = new initialize(context);
    // utils.formatJSDocLine("@example 1");
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
class initialize {
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
        this.updateConfig();
        this.updateConfigBeta();
        // const { maxMixinCount, maxPercentage, troubleshootingMode } = advancedConfig;
        // console.log(`[调试] 基础设置 模式: ${config.searchMode},打开时同步:${config.syncMapOnOpen},保存时同步:${config.syncMapOnSave}`);
        // console.log(`[调试] 高级设置 最大百分比: ${maxPercentage},最大Mixin数:${maxMixinCount},排查模式:${troubleshootingMode}`);
        //设置更改
        this.context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (!e.affectsConfiguration("MixinHelper")) { return; }
                console.log("[调试]触发IV设置更改");
                if (e.affectsConfiguration("MixinHelper.advancedSettings")) {
                    this.updateConfigBeta();
                } else {
                    const keys = Object.keys(DEFAULT_CONFIG_MAP) as Array<keyof typeof DEFAULT_CONFIG_MAP>;
                    for (const key of keys) {
                        const fullKey = `MixinHelper.${key}`;
                        if (e.affectsConfiguration(fullKey)) {
                            this.updateConfig(key);
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
        //F1
        this.context.subscriptions.push(
            vscode.commands.registerCommand("less-mixin-hover.refreshMapCache", async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) { return; }
                try {
                    const { enableNotification } = config;
                    const docId = editor.document.uri.fsPath;
                    this.cacheManager.invalidateCache(docId);
                    await new searchExecutor(editor.document).handleDocumentUpdate("switch", this.cacheManager);
                    enableNotification !== "disableNotifications" && (
                        messageUtils.showInfo("加载完成"),
                        enableNotification !== "popupWithoutLog" &&
                        messageUtils.logObejct("当前缓存内容", lookup, enableNotification)
                    );
                } catch (error) {
                    messageUtils.showInfo(`${error}`);
                }
            }),
            // 加载缓存
            vscode.commands.registerCommand('less-mixin-hover.loadCurrentFileCache', async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) { return; }
                try {
                    const { enableNotification } = config;
                    const docId = editor.document.uri.fsPath;
                    const map = this.cacheManager.readCache(docId);
                    if (map) {
                        lookup.set(docId, map);
                        currentFileContext = map;
                        enableNotification !== "disableNotifications" && (
                            messageUtils.showInfo("当前文件缓存已加载"),
                            enableNotification !== "popupWithoutLog" &&
                            messageUtils.logObejct("当前文件缓存", lookup, enableNotification)
                        );
                    } else {
                        await new searchExecutor(editor.document).handleDocumentUpdate("switch", this.cacheManager);
                        enableNotification !== "disableNotifications" && messageUtils.showInfo("当前文件好像没有缓存? 已启用刷新Map缓存");
                    }
                } catch (error) {
                    messageUtils.showInfo(`${error}`);
                }
            }),
            // 清空内存
            vscode.commands.registerCommand("less-mixin-hover.clearAllCache", async () => {
                this.cacheManager.clearAllCache();
                lookup.clear();
                config.enableNotification !== "disableNotifications" && messageUtils.showInfo("所有缓存已清除");
            }),
            vscode.commands.registerCommand("less-mixin-hover.Debug", async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) { return; }
                new processor(editor.document).globalSearchbeta();
            })
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
            const handleMapTrigger = (doc: vscode.TextDocument, sourceType: string = "switch") => {
                new searchExecutor(doc).handleDocumentUpdate(sourceType, this.cacheManager);
            };
            //触发I打开文件
            if (config.syncMapOnOpen) {
                disposable.push(vscode.workspace.onDidOpenTextDocument((doc) => {
                    if (config.searchMode !== "map") { return; };
                    console.log("[调试] 触发I打开文件");
                    handleMapTrigger(doc, "open");
                }));
            }
            //触发II保存文件
            if (config.syncMapOnSave) {
                disposable.push(vscode.workspace.onDidSaveTextDocument((doc) => {
                    console.log("[调试] 触发II保存文件");
                    handleMapTrigger(doc);
                }));
            }
            //触发III切换文件
            if (config.syncMapOnFocus) {
                disposable.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
                    if (config.searchMode !== "map") { return; };
                    if (editor && editor.document) {
                        console.log("[调试] 触发III切换文件");
                        const path = editor.document.uri.fsPath;
                        if (!lookup.has(path)) {
                            handleMapTrigger(editor.document);
                        } else {
                            currentFileContext = lookup.get(path) ?? {} as any;
                        }
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
    private updateConfig<T extends keyof typeof DEFAULT_CONFIG_MAP>(
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
    private updateConfigBeta<T extends keyof typeof DEFAULT_ADVANCED_CONFIG_MAP>(
        target?: T
    ) {
        const configs = vscode.workspace.getConfiguration("MixinHelper");
        // 获取VS code对应的当前项
        const rawAdvancedObj = configs.get("advancedSettings") as any;
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
    private document: vscode.TextDocument;
    private static DEFAULT_DICTIONARY = {
        "bold": (t: string) => `**${t}**`,
        "italic": (t: string) => `*${t}*`,
        "strikethrough": (t: string) => `~~${t}~~`,
        "allBoldAndItalic": (t: string) => `***${t}***`,
        "underline": (t: string) => `<ins>${t}</ins>`,
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
    private static DEFAULT_JSDOS: userCustomObjArray = {
        "default": ["italic", "raw"],
        "@param": ["italic", "code", "raw"],
        "@paramCode": ["italic", "code", "code", "raw"],
        "@return": ["italic", "code", "raw"],
        "@description": ["italic", "preLineBreak"],
        "@example": ["italic", "null"]
    };
    constructor(
        document: vscode.TextDocument,
    ) {
        this.document = document;
    }
    /**验证目标行号是否符合Mixin格式
     * @param  i - 目标行号
     * @returns 布尔值 */
    validateMixin(i: number): boolean {
        const lineText = this.document.lineAt(i).text.trim();
        if ((lineText.startsWith(".") || lineText.startsWith("#")) && lineText.includes("(")) {
            for (let i2 = i; i2 < this.document.lineCount; i2++) {
                const lineText = this.document.lineAt(i2).text.trim();
                if (lineText.includes(";")) { return false; }
                else if (lineText.includes("{") && lineText.includes(")")) { return true; }
                // else if (lineText.includes("{")) {return true;}
                // else if (lineText.includes("}")) {return false;}
            }
        }
        return false;
    }
    CoarseFilterMS(i: number): boolean {
        const lineText = this.document.lineAt(i).text.trim();
        if (lineText.includes("(") && !lineText.includes(";") && !lineText.includes(":")) {
            return true;
        }
        return false;
    }
    CoarseFilterML(i: number): boolean {
        const lineText = this.document.lineAt(i).text.trim();
        if (lineText.includes("(") && !lineText.includes(";")) {
            return true;
        }
        return false;
    }
    getJSDocCommentbeta(definitionLineIndex: number): string[] | null {
        // 1. 从定义行的上一行开始倒序遍历
        for (let i = definitionLineIndex - 1; i >= 0; i--) {
            const lineText = this.document.lineAt(i).text.trim();
            // 2. 终止条件：如果遇到空行，或者遇到了代码符号（如 '}'），说明注释区域结束了
            if (lineText.startsWith('}')) { break; }
            if (lineText === '') { continue; }
            // 3. 识别结束标记 '*/'
            if (lineText.endsWith('*/')) {
                let phaseI: string[] = [];
                // 继续向上寻找开始的 '/*'
                for (let i2 = i; i2 >= 0; i2--) {
                    const prevLine = this.document.lineAt(i2).text.trim();
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
        return null; // 没找到
    }
    /** 
     * @deprecated
     */
    static formatDocStringToMd(input: string): commentTextoutput {
        // const example = input.match(/[\s\S]*@example\s*([\s\S*])/i);
        const example = input.match(/.+@example\s+(.*)/is);
        const phaseI = input.replace(/@param\s+(\w+)\s+(.*)/g, '*@param* `$1`: $2') // 转换 @param 为列表项
            .replace(/@returns?\s+(.*)/g, '*@returns*: $1')    // 转换 @return
            .replace(/@description\s+(.*)/g, '$1')             // 去掉 @description 标签只留内容
            .replace(/@example/g, '*@Example:*\n\n');             // 强调 Example
        const phaseII: commentTextoutput = { text: phaseI, example: example?.[1] };
        return phaseII;
    }
    static porcessRawDocs(input: annotationContext, mixinName: string): vscode.MarkdownString {
        let text = '';
        let example: undefined | string = '';
        const consttxt = '貌似没有写备注哦';
        const md = new vscode.MarkdownString();
        md.supportHtml = true; // 开启 HTML 支持，用于微调样式
        md.isTrusted = true;   // 信任内容，允许运行部分安全指令
        // --- 1. 顶部标题 (Mixin 名字) ---
        md.appendMarkdown(`<h2 style="font-size:1.5em;">${mixinName}</h2>\n\n`);
        if (input.currentMode === '2') {
            if (input.mapText === undefined) {
                text = consttxt;
            } else if (input.mapText && input.mapText.length === 1) {
                md.appendMarkdown(`${input.mapText[0].text}` + '\n\n');
                example = input.mapText[0]?.example;
                example && md.appendCodeblock(example, 'less');
            } else if (input.mapText && input.mapText.length > 1) {
                let count = 1;
                for (const item of input.mapText) {
                    md.appendMarkdown(`### [这是同名的第 ${count++} 个注释]\n\n${item.text}` + '\n\n');
                    if (item.example) {
                        example += `${item.example}\n`;
                        md.appendCodeblock(item.example, 'less');
                    }
                }
            }
        } else if (input.currentMode === '1') {
            if (input.realtimetext === null) {
                text = consttxt;
            } else if (input.realtimetext) {
                text = input.realtimetext.text;
                example = input.realtimetext.example;
            }
        }
        return md;
    }
    static createStyledHover(mixinName: string, docText: string | null, codeSnippet?: string): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = true; // 开启 HTML 支持，用于微调样式
        md.isTrusted = true;   // 信任内容，允许运行部分安全指令
        // --- 1. 顶部标题 (Mixin 名字) ---
        md.appendMarkdown(`<h2 style="font-size:1.5em;">${mixinName}</h2>\n\n`);
        // --- 2. 处理 JSDoc 文本 (解析并美化) ---
        if (docText) {
            md.appendMarkdown(docText + '\n\n');
        }
        // --- 3. 底部源码片段 (可选) ---
        // 只有当你确实想展示 Mixin 的定义代码时才加这一段
        // 使用 'scss' 或 'less' 语言标识符来获得语法高亮
        if (codeSnippet) {
            md.appendCodeblock(codeSnippet, 'less');
        }
        return md;
    }
    static getUserCustomSetings() {
        const userObj: userCustomObjArray = this.DEFAULT_JSDOS;
        const userConfigs = vscode.workspace.getConfiguration("MixinHelper").get("userCustomComments") || {};
        for (const [trigger, rules] of Object.entries(userConfigs)) {
            if (!trigger.startsWith("@")) { continue; }
            if (!userObj[trigger]) { userObj[trigger] = []; }
            userObj[trigger] = [...rules];

        }
        // console.log(`[调试] ${JSON.stringify(userObj, null, 2)}`);
        return userObj;
    }
    /**
     * [纯工具] JSDoc 标签格式化器
     * @description
     * 将单行注释内容解析并组装为 Markdown 格式的悬停提示文本。
     * 内部通过字典映射规则，自动处理加粗、代码块等样式渲染。
     * ⚠️ 【高危警告】输入约束
     * 本函数仅接受 **单行字符**。
     * 严禁传入多行文本或完整文档块！
     * @internal
     * @usage 请在调用此函数前，务必在业务层完成换行符分割与分流逻辑。
     * @param {string} part - 待格式化的单行文本片段
     * @returns {string} 格式化后的 Markdown 字符串
     */
    static formatJSDocLine(part: string, userCustom: userCustomObjArray = utils.DEFAULT_JSDOS) {
        const processParts = (parts: string[], rules: string[]) => {
            let phaseI: string[] = [];
            for (let i = 0; i < parts.length; i++) {
                const text = parts[i];
                const met = parts[0] === "@example" && i > 0
                    ? "null"
                    : rules[i];
                // console.log(`[调试] ${met}`);
                if (met && met in utils.DEFAULT_DICTIONARY) {
                    const result = utils.DEFAULT_DICTIONARY[met as keyof typeof utils.DEFAULT_DICTIONARY](text);
                    phaseI.push(result);
                } else {
                    phaseI.push(text);
                }
            }
            const phaseII = phaseI
                .join(' ');
            console.log(`[调试] ${phaseII}`);
            return phaseII;
        };
        const parts = part ? part.trim().split(/\s+/) : [];
        const p0 = parts[0];
        // formatRulse 返回 @param 
        let activeRules: string[] | undefined = userCustom[p0];
        if (!activeRules && p0.startsWith("@")) {
            console.log(`[调试][error] 未找到标签 '${p0}'，使用 'default' 代替 `);
            activeRules = userCustom["default"];
        }
        if (activeRules) {
            return processParts(parts, activeRules);
        } else {
            return part;
        }
    }

}
class strategySplitter {
    private executionGoals: utils;
    private currentMode: string;
    constructor(
        executionGoals: utils,
        initialMode: string,
    ) {
        this.executionGoals = executionGoals;
        this.currentMode = initialMode;
    }
    trigger(context: taskConstext) {
        const taskMap = {
            'strict': (ctx: taskConstext) => {
                if (ctx.line !== undefined) {
                    const a = this.executionGoals.CoarseFilterMS(ctx.line);
                    return a;
                } else {
                    console.log("[调试][error] losse模式缺少必要参数: line");
                    return;
                }
            },
            'losse': (ctx: taskConstext) => {
                if (ctx.line !== undefined) {
                    const a = this.executionGoals.CoarseFilterML(ctx.line);
                    return a;
                } else {
                    console.log("[调试][error] losse模式缺少必要参数: line");
                    return;
                }
            },
        };
        const task = taskMap[this.currentMode as keyof typeof taskMap];
        if (task) {
            return task(context);
        }
        console.log("[调试][error] 未知模式: " + this.currentMode);
        return;
    }
}
/** 纯业务函数：
 * 干活的熟练工，专注处理核心业务逻辑，把复杂流程拆解成一个个原子级的小任务。 */
class processor {
    /** Mixin 智能搜索与解析工具包  纯业务函数
     * 核心功能：
     * 1. 概率筛查：通过语法特征（如括号匹配）快速过滤非 Mixin 调用。
     * 2. 定义定位：向上回溯查找 Mixin 的具体定义行。
     * 3. 信息提取：获取 Mixin 的参数列表及上方的文档注释 (JSDoc)。
     * @note 实例化时传入 Document 对象后，内部方法将自动共享该上下文，无需重复传参。
     */
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
    findMixinDefinition(mixinName: string, currentLineIndex: number): number | undefined {
        // 1. 构建正则：转义特殊字符，并匹配紧跟的左括号 (允许中间有空格)
        // 比如名字是 .box，正则会匹配 .box( 或 .box (
        const escapedName = mixinName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // 允许中间有任意字符（比如注释、奇怪的符号），只要最后是 ( 就行
        // .*? 表示“非贪婪匹配”，会尽快找到第一个 (
        const regex = new RegExp(`${escapedName}.*?\\(`);
        // 2. 从当前行的上一行开始，倒序遍历整个文档
        for (let i = currentLineIndex; i >= 0; i--) {
            const lineText = this.document.lineAt(i).text.trim();
            // 3. 初步匹配：看这行有没有 "名字("
            if (regex.test(lineText)) {
                let existingLtem = false;
                for (let input = i; ;) {
                    const output = new utils(this.document).validateMixin(input);
                    if (output) { existingLtem = true; break; }
                    else { break; }
                }
                if (existingLtem) {
                    // 3.1 调用新工具函数，一行搞定参数提取
                    // const paramsString = this.extractMixinParams(i);
                    // console.log(`找到定义在第 ${i} 行，参数为: [${paramsString}]`);
                    // 3. 继续执行原本的注释搜索逻辑...
                    return i;
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
    /** 获取指定行上方的文档注释 (JSDoc 风格)
     * @param definitionLineIndex Mixin 定义所在的行号
     * @returns 提取出的纯文本注释内容，如果没有找到则返回 null
     * @example getDocCommentAbove()
     */
    getDocCommentAbove(definitionLineIndex: number): commentTextoutput | null {
        // 1. 从定义行的上一行开始倒序遍历
        for (let i = definitionLineIndex - 1; i >= 0; i--) {
            const lineText = this.document.lineAt(i).text.trim();
            // 2. 终止条件：如果遇到空行，或者遇到了代码符号（如 '}'），说明注释区域结束了
            if (lineText === '' || lineText.startsWith('}')) { break; }
            // 3. 识别结束标记 '*/'
            if (lineText.endsWith('*/')) {
                let phaseI: string[] = [];
                // 继续向上寻找开始的 '/*'
                for (let j = i; j >= 0; j--) {
                    const prevLine = this.document.lineAt(j).text.trim();
                    phaseI.unshift(prevLine); // 放入数组头部，保持顺序
                    // 4. 识别开始标记 '/*'
                    if (prevLine.startsWith('/*')) {
                        // 5. 清洗数据：去掉 /*, */, * 以及首尾空格
                        const phaseII = phaseI
                            .map(line => line.replace(/\/\*|\*\/|\*/g, '').trim()) // 正则去除注释符号
                            .filter(line => line !== '') // 过滤掉空行
                            .join('\n\n'); // 用换行符拼接
                        const phaseIII = utils.formatDocStringToMd(phaseII);
                        return phaseIII;
                    }
                }
            }
        }
        return null; // 没找到
    }
    /** 全局查找 Mixin 名字的函数map版本  
     * 核心逻辑：扫描整个文档，找到所有可能的 Mixin 定义，并把它们的名字和注释内容存到一个 Map 里
     * @param document 当前文档
     * @returns key 是 Mixin 名字，value 是注释内容
     */
    globalSearch(): Record<string, commentTextoutput[] | undefined> | undefined {
        const a = this.document.lineCount;
        const util = new utils(this.document);
        const { maxMixinCount, maxPercentage, troubleshootingMode } = advancedConfig;
        const percent = Math.min(Math.max(maxPercentage, 0), 100);
        const limit = percent !== 0
            ? Math.floor(a * (percent / 100))
            : a;
        const scanLimit = maxMixinCount;
        const utilspatcher = new strategySplitter(util, troubleshootingMode);
        let phaseI = [];
        // console.log(a);
        for (let i = 0, foundCount = 0;
            i < limit && (scanLimit === 0 || foundCount < scanLimit);
            i++
        ) {
            const phaseII = utilspatcher.trigger({ line: i });
            if (!phaseII) { continue; }
            const output = util.validateMixin(i);
            if (output) {
                phaseI.push(i);
                foundCount++;
            }
        }
        //console.log(phaseI);
        const map: Record<string, commentTextoutput[] | undefined> = {};
        phaseI.forEach(i => {
            const lineText = this.document.lineAt(i).text;
            const match = lineText.match(/^\.?([a-zA-Z0-9_-]+)\s*\(/);
            const key = match ? match[1] : lineText.trim();
            const output: commentTextoutput | null = this.getDocCommentAbove(i);
            if (!output) { return; }
            const val: commentTextoutput = {
                text: output.text,
                example: output?.example || undefined
            };
            if (!map[key]) {
                map[key] = [val];
            } else {
                map[key].push(val);
            }
        });
        console.log(map);
        // map ===================
        // 2-1 key ↘
        //   3-1 数组的最终层val ←
        //   3-2 数组的第2个 val
        return map;
    }
    globalSearchbeta()/*: Record<string, commentTextoutput[] | undefined> | undefined */ {
        const a = this.document.lineCount;
        const util = new utils(this.document);
        const { maxMixinCount, maxPercentage, troubleshootingMode } = advancedConfig;
        const percent = Math.min(Math.max(maxPercentage, 0), 100);
        const limit = percent !== 0
            ? Math.floor(a * (percent / 100))
            : a;
        const scanLimit = maxMixinCount;
        const utilspatcher = new strategySplitter(util, troubleshootingMode);
        let phaseI = [];
        // console.log(a);
        for (let i = 0, foundCount = 0;
            i < limit && (scanLimit === 0 || foundCount < scanLimit);
            i++
        ) {
            const phaseII = utilspatcher.trigger({ line: i });
            if (!phaseII) { continue; }
            const output = util.validateMixin(i);
            if (output) {
                phaseI.push(i);
                foundCount++;
            }
        }
        const map: Record<string, commentTextoutput[] | undefined> = {};
        const aa = utils.getUserCustomSetings();
        phaseI.forEach(i => {
            let final = [];
            let l = "";
            const rawCom = util.getJSDocCommentbeta(i);
            if (!rawCom) { return; }
            for (let i = 0; i < rawCom.length; i++) {
                const parsed = rawCom[i];
                if (parsed.startsWith("@example")) {
                    // final.push("@example");
                    const nextLine = rawCom[i + 1];
                    if (nextLine && !nextLine.trim().startsWith("@")) {
                        l = nextLine.trim();
                        i++;
                    } else {
                        l = parsed.substring("@example".length).trimStart();
                    }
                    // continue;
                }
                const interim = utils.formatJSDocLine(parsed,aa);
                final.push(interim);
            }
            const resultText = final.join('\n\n');
            const lineText = this.document.lineAt(i).text;
            const match = lineText.match(/^\.?([a-zA-Z0-9_-]+)\s*\(/);
            const key = match ? match[1] : lineText.trim();
            const val: commentTextoutput = {
                text: resultText,
                example: l || undefined
            };
            if (!map[key]) {
                map[key] = [val];
            } else {
                map[key].push(val);
            }
        });
        console.log(map);
        // return map;
        currentFileContext = map;
    }
    /**
     * @description 将杂乱的输入源清洗并融合...
     * @param input.position - 光标位置
     * @param input.text - 注释文本内容
     * @returns {vscode.Hover} - 返回最后组装好的内容
     */
    createHoverObject(input: annotationProcessingRequest): vscode.Hover {
        // console.log('[调试] 当前注释:', input.docText);
        const phaseI = utils.porcessRawDocs(input.annotationContext, input.mixinName);
        // const phaseII = utils.createStyledHover(input.mixinName, phaseI.text, phaseI.example);
        const range = this.document.lineAt(input.position.line).range;
        // 4. 创建 Hover 实例
        // 第一个参数是内容，第二个参数是显示的矩形范围（决定鼠标放哪里才显示）
        const hover = new vscode.Hover(phaseI, range);
        // 5. 返回结果
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
    // @log
    map(position: vscode.Position): vscode.Hover | undefined {
        // PhaseI 1-1 ID ↘
        // PhaseII  2-1 set 方式 val ↘
        // PhaseIII   3-1 数组的最终层 ←
        // PhaseIII   3-2 数组的第2个 val
        // PhaseII  2-2 Phase 3的 key
        // PhaseI 1-2 ID  
        const toolkit = new processor(this.document);
        const phase = toolkit.mixinProbabilityScreening(position.line);
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
        const phaseIII = currentFileContext?.[key];// Phase 1
        if (!phaseIII) { return undefined; }
        const APR: annotationProcessingRequest = {
            position: position,
            mixinName: `.${key}`,
            annotationContext: {
                currentMode: '2',
                mapText: phaseIII
            }
        };
        const finalText = toolkit.createHoverObject(APR);
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
            const toolkit = new processor(this.document);
            // 2. 【关键一步】预判：检查单词后面是不是 "("
            const nextChar = toolkit.mixinProbabilityScreening(position.line);
            // 3. 判断：如果是 Mixin (后面有括号)，才继续执行
            if (!nextChar) { return undefined; }
            // 1. 获取这个单词的文本
            const wordText = this.document.getText(wordRange);
            const definitionLineIndex = toolkit.findMixinDefinition(wordText, position.line);
            if (definitionLineIndex !== undefined) {
                const phaseI = toolkit.getDocCommentAbove(definitionLineIndex);
                const APR: annotationProcessingRequest = {
                    position: position,
                    mixinName: wordText,
                    annotationContext: {
                        currentMode: '1',
                        realtimetext: phaseI
                    }
                };
                const commentContent = toolkit.createHoverObject(APR);
                return commentContent;
            } else {
                console.log(`[调试][error] 未找到该 Mixin 的定义`);
                return undefined;
            }
        } catch (error) {
            console.error("错误堆栈", error);
        }
    }
    handleDocumentUpdate(source: string, cacheManager: CacheManager) {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }
            let b = '';
            if (source === 'switch') { b = this.document.languageId; }
            else if (source === 'open') { b = editor.document.languageId; }
            if (!['less', 'css', 'scss'].includes(b)) { return; }
            let doc: vscode.TextDocument = this.document;
            let docId = '';
            if (source === 'switch') {
                doc = this.document;
                docId = this.document.uri.fsPath;
            } else if (source === 'open') {
                doc = editor.document;
                docId = editor.document.fileName;
            }
            // 0.0.3.4? 还是 0.0.4?新增 先尝试读取缓存
            let map = cacheManager.readCache(docId);
            const Toolkit = new processor(doc);
            if (!map) {
                // 更新 Map
                console.log(`[调试] 执行全量扫描...`);
                map = Toolkit.globalSearch();
                if (map) {
                    lookup.set(docId, map);
                    currentFileContext = map;
                    cacheManager.writeCache(docId, map);
                }
            } else { lookup.set(docId, map); currentFileContext = map; }
        } catch (error) { console.error("错误堆栈", error); }
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
                if (ctx.position !== undefined) {
                    const a = this.executionGoals.startupfunction(ctx.position);
                    return a;
                } else {
                    console.log("[调试][error] Realtime模式缺少必要参数: position");
                    return;
                }
            },
            'map': (ctx: taskConstext) => {
                if (ctx.position !== undefined) {
                    const a = this.executionGoals.map(ctx.position);
                    return a;
                } else {
                    console.log("[调试][error] Map模式缺少必要参数: position");
                    return;
                }
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

function cleanupLookup() {
    lookup?.clear();
}
export function deactivate() {
    cleanupLookup();
}