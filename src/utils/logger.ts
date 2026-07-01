import * as vscode from "vscode";
export class messageUtils {
    private static outputChannel: vscode.OutputChannel | undefined;

    static showInfo(massage:string) {
        try {
            vscode.window.showInformationMessage(massage);
        } catch (error) {
            console.warn("[MixinHelper] showInformationMessage failed:", error);
        }
    }

    private static serializeData(data:any):any{
        if (data instanceof Map) {return Object.fromEntries(data);}
        if (data instanceof Set) {return Array.from(data);}
        return data;
    }

    private static ensureOutputChannel(): vscode.OutputChannel | undefined {
        if (this.outputChannel) {
            return this.outputChannel;
        }
        try {
            this.outputChannel = vscode.window.createOutputChannel("MixinHelper");
        } catch (error) {
            console.warn("[MixinHelper] createOutputChannel failed:", error);
            this.outputChannel = undefined;
        }
        return this.outputChannel;
    }

    static logObejct(label:string,data:any,enableNotification?:string) {
        const outputChannel = this.ensureOutputChannel();
        if (!outputChannel) { return; }

        outputChannel.appendLine(`[${new Date().toLocaleDateString()} ${label}]`);
        const safeData = this.serializeData(data);
        outputChannel.appendLine(JSON.stringify(safeData,null,2));
        if (enableNotification !== "showOutputOnLog") {return;}
        outputChannel.show(true);
    }

    static dispose() {
        if (this.outputChannel) {
            try {
                this.outputChannel.dispose();
            } catch (error) {
                console.warn("[MixinHelper] dispose output channel failed:", error);
            }
        }
        this.outputChannel = undefined;
    }
}