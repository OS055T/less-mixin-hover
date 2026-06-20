import * as vscode from "vscode";
export class messageUtils {
    private static outputChannel = vscode.window.createOutputChannel("MixinHelper");

    static showInfo(massage:string) {
        vscode.window.showInformationMessage(massage);
    }
    private static serializeData(data:any):any{
        if (data instanceof Map) {return Object.fromEntries(data);}
        if (data instanceof Set) {return Array.from(data);}
        return data;
    }
    static logObejct(label:string,data:any,enableNotification?:string) {
        this.outputChannel.appendLine(`[${new Date().toLocaleDateString()} ${label}]`);
        const safeData = this.serializeData(data);
        this.outputChannel.appendLine(JSON.stringify(safeData,null,2));
        if (enableNotification !== "showOutputOnLog") {return;}
        this.outputChannel.show(true);
    }
}