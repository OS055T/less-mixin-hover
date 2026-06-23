import * as vscode from "vscode";
export type userCustomObjArray = Record<string, string[]>

// 3. 接口定义层 (Interfaces)
// config 设置
export interface mixinConfig {
    searchMode: string,
    syncMapOnOpen: boolean,
    syncMapOnSave: boolean,
    syncMapOnFocus: boolean,
    enableNotification: string,
};
export interface advancedmixinConfig {
    maxPercentage: number,
    maxMixinCount: number,
    troubleshootingMode: string,
}
// ==================
/** annotationLine 注释行 */
export interface annotationLine {
    text: string,
    type: string,
    rawLine?: number
}
/** annotationBlock 注释块 */
export type annotationBlock = annotationLine[]
/** FileAnnotationContext 文件注释 */
export type FileAnnotationContext = Record<string, annotationBlock[]>
/** workspaceAnnotationMap 工作区注释 */
export type workspaceAnnotationMap = Map<string, Record<string, FileAnnotationContext[] | undefined>>;
// ==================
export interface annotationContextbeta {
    currentMode: string,
    realtimetext?: annotationBlock | null,
    mapText?: annotationBlock[] | undefined
}
export interface annotationProcessingRequestbeta {
    position: vscode.Position,
    mixinName: string,
    annotationContext: annotationContextbeta,
}