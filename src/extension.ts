import * as vscode from "vscode";
const lookup = new Map<string,Record<string, string[]| undefined> >();
let featurePack: vscode.Disposable | undefined;
let config:mixinConfig = {
    searchMode:"map",
    troubleshootingMode:"strict",
    syncMapOnOpen:true,
    syncMapOnSave:false,
};
export function activate(context: vscode.ExtensionContext) {
    initialize(context);
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            initialize(context);
        })
    );
    context.subscriptions.push(
        vscode.workspace.onDidGrantWorkspaceTrust(() => {
            initialize(context);
        })
    );
}
function initialize(context: vscode.ExtensionContext) {
    console.log('NixinHelper 正在激活...');
    if (!vscode.workspace.isTrusted) {
        console.warn('⚠️ 当前工作区未受信任,MixinHelper 将保持静默状态以确保安全。');
        return;
    }
    console.log("环境就绪,开始同步 MAP...");
    updateConfig();
    console.log(`模式: ${config.searchMode},排查:${config.troubleshootingMode},打开时同步MAP:${config.syncMapOnOpen},保存时同步MAP:${config.syncMapOnSave}`);
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (!e.affectsConfiguration("MixinHelper")) {return;}
            console.log("触发IV设置更改");
            if (e.affectsConfiguration("MixinHelper.searchMode")) {
                const currentsearchMode = config.searchMode;
                updateConfig("searchMode");
                if(currentsearchMode !=="map" && config.searchMode === "map") {
                    console.log(`模式: ${config.searchMode}`);
                    updateSubscriptions(context,config);
                    const doc = vscode.window.activeTextEditor;
                    if(doc && doc.document) {
                        const a = new dispatcher(new searchExecutor(doc.document),"mapDisposable");
                        a.trigger({source:"switch"});
                    }
                }
            } else {
                const targetkey = [
                    "troubleshootingMode",
                    "syncMapOnOpen",
                    "syncMapOnSave",
                ];
                for (const key of targetkey) {
                    const fullkey = `MixinHelper.${key}`;
                    const configkey = config[key as keyof mixinConfig];
                    if (e.affectsConfiguration(fullkey)) {
                        updateConfig(key);
                        updateSubscriptions(context,config);
                        console.log(`配置项${key}以变更,当前值为:${configkey}`);
                        break;
                    }
                };                
            }
        })
    );
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(("less"),{
            provideHover
        })
    );
    updateSubscriptions(context,config);
}
function updateSubscriptions(context: vscode.ExtensionContext,configs:mixinConfig) {
    // 1. 【关键步骤】先销毁并清空旧的动态监听器
    if (featurePack) {featurePack.dispose();}
    const config = configs;
    const disposable: vscode.Disposable[] = [];
    // 2. 注册新的监听器
    //map订阅监听器    
    if (config.searchMode === "map") {
        //触发I打开文件
        if(config.syncMapOnOpen){
        disposable.push(vscode.workspace.onDidOpenTextDocument((doc) => {
            if(config.searchMode !== "map") {return;};
            const a = new dispatcher(new searchExecutor(doc),"mapDisposable");
            a.trigger({source:"open"});
            console.log("触发I打开文件");
        }));}
        //触发II保存文件
        if(config.syncMapOnSave){
        disposable.push( vscode.workspace.onDidSaveTextDocument((doc) => {
            if(config.searchMode !== "map") {return;};
            const a = new dispatcher(new searchExecutor(doc),"mapDisposable");
            a.trigger({source:"switch"});
            console.log("触发II保存文件");
        }));}
        //触发III切换文件
        disposable.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
            if(config.searchMode !== "map") {return;};
            if(editor && editor.document) {
                const path = editor.document.uri.fsPath;
                if(!lookup.has(path)) {
                    const a = new dispatcher(new searchExecutor(editor.document),"mapDisposable");
                    a.trigger({source:"switch"});
                    console.log("触发III切换文件");
                }
            }
        }));
    }
    console.log(`准备订阅${disposable.length}个`);
    if(disposable.length > 0) {
        // 3. 存入临时池（用于下次更新时销毁）
        featurePack = vscode.Disposable.from(...disposable);
        // 4. 同时也推入 context（确保插件彻底卸载时也能被清理，双重保险）
        context.subscriptions.push(featurePack);
    } else {
        featurePack = undefined;
    }
}
function updateConfig(target?:string){
    const configs = vscode.workspace.getConfiguration("MixinHelper");
    if(target === "searchMode"){config[target] = configs.get<string>(target,"map");}
    else if(target === "troubleshootingMode"){config[target] = configs.get<string>(target,"strict");}
    else if(target === "syncMapOnOpen"){config[target] = configs.get<boolean>(target,true);}
    else if(target === "syncMapOnSave"){config[target] = configs.get<boolean>(target,false);}
    else {
        config.searchMode = configs.get<string>("searchMode","map");
        config.troubleshootingMode = configs.get<string>("troubleshootingMode","strict");
        config.syncMapOnOpen = configs.get<boolean>("syncMapOnOpen",true);
        config.syncMapOnSave = configs.get<boolean>("syncMapOnSave",false);
    }
}
/**
 * 提供悬停提示
 * @param document 【变量1】 document (文档对象)
 * 含义：代表当前用户正在编辑的这个 .less 文件的全部内容。
 * 作用：它是你的“数据库”。你需要通过它来获取文本内容（getText）、获取行数、或者扫描整个文件查找 Mixin 定义。
 * @param position 
 * 【变量2】 position (光标位置)
 * 含义：代表鼠标悬停时的那个精确坐标点（第几行，第几个字符）。
 * 作用：它是你的“瞄准镜”。VS Code 告诉你鼠标在哪，你才能知道用户想看哪个单词的解释。
 * @param token 
 * 【变量3】 token (取消令牌)
 * 含义：这是一个由 VS Code 内核管理的信号标志。
 * 作用：它是“紧急刹车”。如果用户鼠标移得太快，VS Code 觉得刚才那个请求没必要了，就会通过这个 token 通知你：“别算了，停下！”（防止插件卡顿）。
 */
function provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
    const a = new dispatcher(new searchExecutor(document),config.searchMode);
    const commentContent = a.trigger({position:position});
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
    constructor(
        document: vscode.TextDocument,
    ){
        this.document = document;
    }
    /**验证目标行号是否符合Mixin格式
     * 
     * @param  i - 目标行号
     * @returns 布尔值 */
    validateMixin(i:number):boolean {
        const lineText = this.document.lineAt(i).text.trim();
        if ((lineText.startsWith(".") || lineText.startsWith("#")) && lineText.includes("(")) {
            for(let i2 = i; i2 < this.document.lineCount ; i2++) {
                const lineText = this.document.lineAt(i2).text.trim();
                if (lineText.includes(";")) {return false;} 
                else if (lineText.includes("{") && lineText.includes(")")) {return true;} 
                // else if (lineText.includes("{")) {return true;}
                // else if (lineText.includes("}")) {return false;}
            }
        }
        return false;
    }
    CoarseFilterMS(i:number):boolean {
        const lineText = this.document.lineAt(i).text.trim();
        if(lineText.includes("(") && !lineText.includes(";") &&!lineText.includes(":")){
            return true;
        }
        return false;
    }
    CoarseFilterML(i:number):boolean {
        const lineText = this.document.lineAt(i).text.trim();
        if(lineText.includes("(") && !lineText.includes(";")){
            return true;
        }
        return false;
    }
}
class strategySplitter{
    private executionGoals:utils;
    private currentMode:string;
    constructor(
        executionGoals: utils,
        initialMode:string,
    ){
        this.executionGoals = executionGoals;
        this.currentMode = initialMode;
    }
    trigger(context:taskConstext) {
        const taskMap = {
            'strict':(ctx:taskConstext) => {
                if(ctx.line !== undefined) {
                    const a = this.executionGoals.CoarseFilterMS(ctx.line);
                    return a;
                } else {
                    console.log("⚠️ losse模式缺少必要参数: line");
                    return;
                }
            },
            'losse': (ctx:taskConstext) => {
                if(ctx.line !== undefined) {
                    const a = this.executionGoals.CoarseFilterML(ctx.line);
                    return a;
                } else {
                    console.log("⚠️ losse模式缺少必要参数: line");
                    return;
                }
            },
        };
        const task = taskMap[this.currentMode as keyof typeof taskMap];
        if (task) {
            return task(context);
        }
        console.log("❌ 未知模式: " + this.currentMode);
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
    ){
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
        if (!text) {return false;}
        // 2. 找到第一个左括号
        const lastOpenParenIndex = text.indexOf('(');
        if (lastOpenParenIndex === -1) {return false;} // 没有括号肯定不是函数调用
        // 3. 提取括号前的内容（向后截取直到遇到非单词字符）
        // 比如 "background: .my-mixin(red);" -> 提取出 "my-mixin"
        let nameEnd = lastOpenParenIndex;
        let nameStart = lastOpenParenIndex;
        // 向前遍历寻找函数名的起始位置
        while (nameStart > 0 && /[a-zA-Z0-9_.\.\-\#\$@]/.test(text[nameStart - 1])) {
            nameStart--;
        }
        // 比如 "background: .my-mixin(red)" -> 排除可能的冒号"background':' .my-mixin(red)"
        if (nameStart > 0 && text[nameStart -1] === ":" || text[nameStart -2] === ":") {
            return false;
        }    
        const potentialName = text.substring(nameStart, nameEnd).trim();
        // 4. 核心判断：这个名字看起来像 Mixin 吗？
        // 排除纯数字、排除常见 CSS 函数 (黑名单)
        // const cssFunctions = ['url', 'rgb', 'rgba', 'calc', 'var', 'translate', 'rotate'];
        // if (!potentialName || cssFunctions.includes(potentialName)) {return false;}
        if (!potentialName) {return false;}
        // 5. 通过初筛
        // console.log(`可能是 Mixin: ${potentialName}`);
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
            for(let input = i; ; ) {
                const output = new utils(this.document).validateMixin(input);
                if (output) {existingLtem = true;break;}
                else {break;}
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
     */
    getDocCommentAbove(definitionLineIndex: number): string | null {
        // 1. 从定义行的上一行开始倒序遍历
        for (let i = definitionLineIndex - 1; i >= 0; i--) {
            const lineText = this.document.lineAt(i).text.trim();
            // 2. 终止条件：如果遇到空行，或者遇到了代码符号（如 '}'），说明注释区域结束了
            if (lineText === '' || lineText.startsWith('}')) {
                break;
            }
            // 3. 识别结束标记 '*/'
            if (lineText.endsWith('*/')) {
                let commentLines: string[] = [];
                // 继续向上寻找开始的 '/*'
                for (let j = i; j >= 0; j--) {
                    const prevLine = this.document.lineAt(j).text.trim();
                    commentLines.unshift(prevLine); // 放入数组头部，保持顺序
                    // 4. 识别开始标记 '/*'
                    if (prevLine.startsWith('/*')) {
                        // 5. 清洗数据：去掉 /*, */, * 以及首尾空格
                        const cleanContent = commentLines
                            .map(line => line.replace(/\/\*|\*\/|\*/g, '').trim()) // 正则去除注释符号
                            .filter(line => line !== '') // 过滤掉空行
                            .join('\n'); // 用换行符拼接
                        return cleanContent;
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
    globalSearch(): Record<string, string[] | undefined> | undefined {
    const a = this.document.lineCount;
    const util = new utils(this.document);
    const udispatcher = new strategySplitter(util,config.troubleshootingMode);
    let b = [];
    // console.log(a);
    for(let i = 0 ; i < a ; i++ ) {
        const z = udispatcher.trigger({line:i});
        if(z){b.push(i);}
    }
    // console.log(b);
    if (!b){return undefined;}
    let d:number[] = [];    
    b.forEach(input => {
        const output = util.validateMixin(input);
        if (output) {d.push(input);}
    });
    if (!d){return undefined;}
    console.log(d);
    const map: Record<string, string[] | undefined> = {};
    const Toolkit = new processor(this.document);
    d.forEach(e => {
        const lineText = this.document.lineAt(e).text;
        const match = lineText.match(/^\.?([a-zA-Z0-9_-]+)\s*\(/);
        const key = match ? match[1] : lineText.trim();
        const val = Toolkit.getDocCommentAbove(e);
        if(val){
            if (!map[key]) {
                map[key] = [val];
            } else {
                map[key].push(val);
            }
        }
    });
    console.log(map);
    return map;
    }
    /**
     * @description 将杂乱的输入源清洗并融合...
     * @param input - 输入配置对象
     * @param input.position - 光标位置
     * @param input.currentMode - 当前模式 1 | 2
     * @param input.inputText1 - 可选文本1
     * @param input.inputText2 - 可选文本数组
     * @returns {vscode.Hover} - 返回最后组装好的内容
     * @example
     * const md = normalizeHoverContent({position:a,currentMode:1,inputtext2:b})
     */
    normalizeHoverContent(input:{
        position:vscode.Position,
        currentMode:string,
        inputtext1?:string | null,
        inputtext2?:string[] | undefined
    }):vscode.Hover {
        let txt = '';
        const consttxt = '貌似没有写备注哦';
        if (input.currentMode === '2') {
            if (input.inputtext2 === undefined) {
            txt = consttxt;
            } else if (input.inputtext2 && input.inputtext2.length === 1) {
                txt = input.inputtext2[0];
            } else if (input.inputtext2 && input.inputtext2.length > 1) {
                let count = 1;
                for(const item of input.inputtext2) {
                    if (txt !=='') {
                        txt += '\n\n';
                    }
                    txt += `[这是同名的第 ${count++} 个注释]\n${item}`;
                }
            } 
        } else if (input.currentMode === '1') {
            if (input.inputtext1 === null) {
                txt = consttxt;
            } else if (input.inputtext1) {
                txt = input.inputtext1;
            }             
        }
        //console.log('📝 当前注释:', txt);
        // 1. 创建 Markdown 内容对象
        const hoverContent = new vscode.MarkdownString();
        // 2. 开启 HTML 支持（可选，但建议开启以支持更多样式）
        hoverContent.supportHtml = true;
        // 3. 将纯文本转换为 Markdown 格式
        // 使用 code block (```) 包裹可以保留注释中的缩进和换行，看起来更整齐
        // 也可以直接使用 appendText(commentText)
        hoverContent.appendCodeblock(txt,'less');
        const range = this.document.lineAt(input.position.line).range;
        // 4. 创建 Hover 实例
        // 第一个参数是内容，第二个参数是显示的矩形范围（决定鼠标放哪里才显示）
        const hover = new vscode.Hover(hoverContent, range);
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
    ){
        this.document = document;
    }
    handleDocumentUpdate(source:string) {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {return;}
            let b = '';
            if (source === 'switch') {b = this.document.languageId;}
            else if (source === 'open') {b = editor.document.languageId;}
            if (!['less','css','scss'].includes(b)) {return;}
            let docId = '';
            let doc: vscode.TextDocument = this.document;
            if (source === 'switch') {
                b = this.document.languageId;
                doc = this.document;
                docId = this.document.uri.fsPath;
            } else if (source === 'open') {
                b = editor.document.languageId;
                doc = editor.document;
                docId = editor.document.fileName;
            }
            // 更新 Map
            const Toolkit = new processor(doc);
            const map = Toolkit.globalSearch();
            // const map = globalSearch(doc);
            if(map) {lookup.set(docId,map);}
        } catch(error) {console.error("错误堆栈",error);}
    }
    /** 核心业务逻辑：非map的函数逻辑
     *  实时计算当前鼠标所在位置是否是 Mixin 调用，如果是则找到对应的定义行并提取注释内容
     * @param position 当前鼠标位置
     * @param positionline 当前行号（用于排除自身定义的干扰）
     * @returns 注释内容字符串，如果没有找到则返回 undefined
     */
    startupfunction(position: vscode.Position): vscode.Hover | undefined {
        try {
            // 1. 获取当前鼠标所在的单词范围
            const wordRange = this.document.getWordRangeAtPosition(position);
            if (!wordRange) { return; };
            const toolkit = new processor(this.document);
            // 2. 【关键一步】预判：检查单词后面是不是 "("
            const nextChar = toolkit.mixinProbabilityScreening(position.line);
            // 3. 判断：如果是 Mixin (后面有括号)，才继续执行
            if (nextChar) {
                // 1. 获取这个单词的文本
                const wordText = this.document.getText(wordRange);
                const definitionLineIndex = toolkit.findMixinDefinition(wordText, position.line);
                if (definitionLineIndex !== undefined) {
                    const commenttext = toolkit.getDocCommentAbove(definitionLineIndex);
                    const commentContent = toolkit.normalizeHoverContent({position:position,currentMode:'1',inputtext1:commenttext});
                    return commentContent;
                } else {
                    console.log(`❌ 未找到该 Mixin 的定义`);
                    return undefined;
                }
            }
            // 如果不是 Mixin（比如只是普通的 .class），什么都不做
            return undefined;
        } catch(error) {
            console.error("错误堆栈",error);
        }
    }
    map(position: vscode.Position):vscode.Hover | undefined {
        /** 
         * Phase 1-1 ID ↘
         *   Phase 2-1 set 方式 val ↘
         *     Phase 3-1 数组的最终层 ←
         *     Phase 3-2 数组的第2个 val
         *   Phase 2-2 Phase 3的 key
         * Phase 1-2 ID
         */
        const toolkit = new processor(this.document);   
        const phase = toolkit.mixinProbabilityScreening(position.line);
        if (phase) {
            const lineText = this.document.lineAt(position.line).text;
            const match = lineText.match(/\b([a-zA-Z0-9_-]+)\b/);
            const key = match?.[1];
            if (key) {
                const docId = this.document.uri.fsPath;
                const phaseI = lookup.get(docId);// Phase 1
                if(phaseI) {
                    const phaseII = phaseI[key];//Phase 2
                    const phaseIII = toolkit.normalizeHoverContent({position:position,currentMode:'2',inputtext2:phaseII});
                    return phaseIII;//Phase 3
                }
            }
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
class dispatcher{
    private executionGoals:searchExecutor;
    private currentMode:string;
    constructor(
        executionGoals: searchExecutor,
        initialMode:string,
    ){
        this.executionGoals = executionGoals;
        this.currentMode = initialMode;
    }
    trigger(context:taskConstext):undefined | vscode.Hover {
        // ==========================================
        // ⚠️ 【高危警告 / HIGH RISK WARNING】 ⚠️
        // ==========================================
        // 1. 严禁在执行器 (SearchExecutor) 内部直接访问 context 对象进行拆包！
        // 2. 所有的参数提取、类型转换必须在此处 (Driver层) 完成。
        // 3. 原因：执行器应保持纯粹，只接收明确类型的参数。若在执行器内拆包，
        //    会导致耦合度极高，一旦 Context 结构变更，所有底层逻辑都会崩溃。
        // ==========================================
        const taskMap = {
            'mapDisposable':(ctx:taskConstext) => {
                // 在这里拆包：只取 source
                if(ctx.source !== undefined) {
                    // ✅ 正确：传递明确的 string 参数
                    this.executionGoals.handleDocumentUpdate(ctx.source);
                    return undefined;
                } else {
                    console.log("⚠️ Map初始化缺少必要参数: source");
                    return;
                }
            },
            'realtime': (ctx:taskConstext) => {
                if(ctx.position !== undefined) {
                    const a = this.executionGoals.startupfunction(ctx.position);
                    return a;
                } else {
                    console.log("⚠️ Realtime模式缺少必要参数: position");
                    return;
                }
            },
            'map': (ctx:taskConstext) => {
                if(ctx.position !== undefined) {
                    const a = this.executionGoals.map(ctx.position);
                    return a;
                } else {
                    console.log("⚠️ Map模式缺少必要参数: position");
                    return;
                }
            }, 
        };
        const task = taskMap[this.currentMode as keyof typeof taskMap];
        if (task) {
            return task(context);
        }
        console.log("❌ 未知模式: " + this.currentMode);
        return undefined;
    }
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
    source?:string;
    position?: vscode.Position;
    line?:number;
}
interface mixinConfig {
    searchMode:string,
    troubleshootingMode:string,
    syncMapOnOpen:boolean,
    syncMapOnSave:boolean,
}
export function deactivate() {}