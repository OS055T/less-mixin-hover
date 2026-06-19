import * as vscode from "vscode";
export class massageUtils {
    private static outputChannel = vscode.window.createOutputChannel("MixinHelper");

    static showInfo(massage:string) {
    const configs = vscode.workspace.getConfiguration("MixinHelper");
    const mode = configs.get<string>("enableNotification","logSilently");        
        if (mode !== "disableNotifications") {
            vscode.window.showInformationMessage(massage);
        }
    }
    private static serializeData(data:any):any{
        if (data instanceof Map) {return Object.fromEntries(data);}
        if (data instanceof Set) {return Array.from(data);}
        return data;
    }
    static logObejct(label:string,data:any) {
        const configs = vscode.workspace.getConfiguration("MixinHelper");
        const mode = configs.get<string>("enableNotification","logSilently");
        if (mode !== "disableNotifications" && mode !== "popupWithoutLog") {
            this.outputChannel.appendLine(`[${new Date().toLocaleDateString()} ${label}]`);
            const safeData = this.serializeData(data);
            this.outputChannel.appendLine(JSON.stringify(safeData,null,2));
            if (mode !== "showOutputOnLog") {return;}
            this.outputChannel.show(true);
        }
    }
}