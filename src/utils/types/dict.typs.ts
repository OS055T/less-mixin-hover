export interface ruleItim {
    trigger: string;
    tules: string[];
}
// export interface globalDictMap<T extends  string = string> {
//     [key:T]:ruleItim;
// }
export type globalDictMap<K extends string = string> = Map<K,ruleItim>
