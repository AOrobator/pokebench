import {SERVER_FEATURES, serverFeatureEnv, type FeatureSet, type SwitchableFeature} from "../src/features.js";

// The game server's off list for these features, one id per entry.
export function serverOff(features:FeatureSet):string[]{
 const off=serverFeatureEnv(features).POKEBENCH_FEATURES_OFF;
 return off===""?[]:off.split(",");
}

// What `base` sends once a test switches the named server switches off or on: base's own off list with exactly those
// ids added or removed, in SERVER_FEATURES order. Tests pin their own change without restating every registered switch.
export function serverOffWith(base:FeatureSet,{off=[],on=[]}:{off?:readonly SwitchableFeature[];on?:readonly SwitchableFeature[]}):string[]{
 for(const id of [...off,...on])if(!SERVER_FEATURES.includes(id))throw new Error(`${id} is not a server switch`);
 const ids=new Set(serverOff(base));
 for(const id of off){if(ids.has(id))throw new Error(`${id} is already off in the base`);ids.add(id);}
 for(const id of on){if(!ids.delete(id))throw new Error(`${id} is already on in the base`);}
 return SERVER_FEATURES.filter(id=>ids.has(id));
}
