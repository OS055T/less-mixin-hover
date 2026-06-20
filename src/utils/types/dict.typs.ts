// export interface globalDictMap<T extends  string = string> {
//     [key:T]:ruleItim;
// }
export type globalDictMap<K extends string = string> = Map<K, string[]>
export type userCustomObjArray = Record<string, string[]>
// export type formatName = 
// 'bold' |