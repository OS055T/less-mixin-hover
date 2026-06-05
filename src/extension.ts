import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 插件已激活！正在监听 .less 文件...');

// 核心逻辑函数
    const disposable = vscode.languages.registerHoverProvider('less', {
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
        provideHover(document, position, token) {
        // 注意：position.line 是当前行号
            const commentContent = startupfunction(document, position, position.line);
            if (commentContent) {
                // 假设 commentText 是你刚才通过 getDocCommentAbove 拿到的纯文本字符串
                // 1. 创建 Markdown 内容对象
                const hoverContent = new vscode.MarkdownString();
                // 2. 开启 HTML 支持（可选，但建议开启以支持更多样式）
                hoverContent.supportHtml = true;
                // 3. 将纯文本转换为 Markdown 格式
                // 使用 code block (```) 包裹可以保留注释中的缩进和换行，看起来更整齐
                // 也可以直接使用 appendText(commentText)
                hoverContent.appendCodeblock(commentContent, 'less');
                const range = document.lineAt(position.line).range; // 让提示框出现在当前行
                // 4. 创建 Hover 实例
                // 第一个参数是内容，第二个参数是显示的矩形范围（决定鼠标放哪里才显示）
                const hover = new vscode.Hover(hoverContent, range);
                // 5. 返回结果
                return hover;
            } else {
                return undefined;
            }
        }
    });
    context.subscriptions.push(disposable);
}



/** 核心业务逻辑：非map的函数逻辑 , 实时计算当前鼠标所在位置是否是 Mixin 调用，如果是则找到对应的定义行并提取注释内容
 * @param document 当前文档
 * @param position 当前鼠标位置
 * @param positionline 当前行号（用于排除自身定义的干扰）
 * @param map 是否开启增量更新 key=MixinName value=注释内容 保存后更新到map中
 * @returns 注释内容字符串，如果没有找到则返回 undefined
 */
function startupfunction (document: vscode.TextDocument, position: vscode.Position, positionline: number): string | undefined {
    // 1. 获取当前鼠标所在的单词范围
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) { return; }
    // 2. 【关键一步】预判：检查单词后面是不是 "("
    const nextChar = mixinProbabilityScreening(wordRange, document);
    // 3. 判断：如果是 Mixin (后面有括号)，才继续执行
    if (nextChar === '(') {
        // 1. 获取这个单词的文本
        const wordText = document.getText(wordRange);
        console.log(`🎯 发现 Mixin 调用: ${wordText}`);
        const definitionLineIndex = findMixinDefinition(document, wordText, positionline);
        if (definitionLineIndex !== undefined) {
            const commentContent = getDocCommentAbove(document, definitionLineIndex);
            if (commentContent) {
                console.log('📝 找到注释:', commentContent);
                return commentContent;
            } else {
                console.log('⚠️ 该 Mixin 没有文档注释');
                return undefined;
            }
        } else {
            console.log(`❌ 未找到该 Mixin 的定义`);
            return undefined;
        }
    }
    // 如果不是 Mixin（比如只是普通的 .class），什么都不做
    return undefined;  
}
function startupfunctionmap () {
    //占位,后续会改为GlobalSearch 
}
/** 全局查找 Mixin 名字的函数（未使用）, map版本的核心逻辑：扫描整个文档，找到所有可能的 Mixin 定义，并把它们的名字和注释内容存到一个 Map 里，key 是 Mixin 名字，value 是注释内容
 * @param document 当前文档
 */
function globalSearch() {
}
/** 预判函数：检查单词后面是否紧跟 "("，以此来判断它是否可能是 Mixin 调用
 * @param wordRange 当前单词的范围
 * @param document 当前文档对象
 * @returns 紧跟在单词后面的字符，如果是 "(" 则很可能是 Mixin 调用，否则不是
 */
function mixinProbabilityScreening(wordRange: vscode.Range, document: vscode.TextDocument) {
    // 我们构建一个范围：从单词结束位置开始，往后取 1 个字符
    const nextCharPos = new vscode.Position(
        wordRange.end.line,
        // line 行号不变，character 字符位置往后移 1
        wordRange.end.character
    );
    const nextCharRange = new vscode.Range(nextCharPos, nextCharPos.translate(0, 1));
    const nextChar = document.getText(nextCharRange);
    console.log(`预判结果: ${nextChar === '(' ? '可能是 Mixin' : '不是 Mixin'}`);
    return nextChar;
}
/** 辅助函数：向上查找 Mixin 的定义,返回所在的行号
 * @param document 当前文档对象
 * @param mixinName 需要查找的 Mixin 名字 (例如 ".border-radius")
 * @param currentLineIndex 当前鼠标所在的行号 (用于跳过自身)
 * @return 提取所在的行号，如果没找到则返回 undefined
 */
function findMixinDefinition(document: vscode.TextDocument, mixinName: string, currentLineIndex: number): number | undefined {
    // 1. 构建正则：转义特殊字符，并匹配紧跟的左括号 (允许中间有空格)
    // 比如名字是 .box，正则会匹配 .box( 或 .box (
    const escapedName = mixinName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 允许中间有任意字符（比如注释、奇怪的符号），只要最后是 ( 就行
    // .*? 表示“非贪婪匹配”，会尽快找到第一个 (
    const regex = new RegExp(`${escapedName}.*?\\(`);
    // 2. 从当前行的上一行开始，倒序遍历整个文档
    for (let i = currentLineIndex; i >= 0; i--) {
        const lineText = document.lineAt(i).text.trim();
        // 3. 初步匹配：看这行有没有 "名字("
        if (regex.test(lineText)) {
            // 3.1 调用新工具函数，一行搞定参数提取
            const paramsString = extractMixinParams(document, i);
            console.log(`找到定义在第 ${i} 行，参数为: [${paramsString}]`);
            // 3. 继续执行原本的注释搜索逻辑...
            return i;
        }
    }
    return undefined; // 没找到
}
/** 跨行提取 Mixin 参数的工具函数,提取到的参数字符串(未使用,但后续可以用来增强提示信息，比如显示参数列表)
 * @param document 当前文档对象
 * @param startLineIndex 包含 Mixin 名称的起始行号/位置
 * @returns 提取到的参数字符串 (如 "@color, @size: 10px")，若未找到则返回空字符串
 */
function extractMixinParams(document: vscode.TextDocument, startLineIndex: number): string {
    let accumulatedText = ""; // 累积文本缓冲区
    let parenCount = 0;       // 括号计数器：用于追踪嵌套层级
    let hasOpenParen = false; // 标记是否已经遇到了左括号 "("
    const totalLines = document.lineCount;
    // 开启向下扫描循环
    for (let i = startLineIndex; i < totalLines; i++) {
        // 获取当前行文本并去除首尾空白
        const lineText = document.lineAt(i).text.trim();
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
                if (paramsContent.includes('@') || paramsContent.trim() === '') {
                    return paramsContent;
                }
            }
            break; // 理论上走到这里就该结束了
        }
    }
    // 兜底：如果没有找到完整的参数对，返回空字符串或原始累积文本供后续判断
    return "";
}
/** 获取指定行上方的文档注释 (JSDoc 风格)
 * @param document 当前文档对象
 * @param definitionLineIndex Mixin 定义所在的行号
 * @returns 提取出的纯文本注释内容，如果没有找到则返回 null
 */
function getDocCommentAbove(document: vscode.TextDocument, definitionLineIndex: number): string | null {
    // 1. 从定义行的上一行开始倒序遍历
    for (let i = definitionLineIndex - 1; i >= 0; i--) {
        const lineText = document.lineAt(i).text.trim();

        // 2. 终止条件：如果遇到空行，或者遇到了代码符号（如 '}'），说明注释区域结束了
        if (lineText === '' || lineText.startsWith('}') || lineText.startsWith('.')) {
            break;
        }

        // 3. 识别结束标记 '*/'
        if (lineText.endsWith('*/')) {
            let commentLines: string[] = [];
            // 继续向上寻找开始的 '/*'
            for (let j = i; j >= 0; j--) {
                const prevLine = document.lineAt(j).text.trim();
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
export function deactivate() {}