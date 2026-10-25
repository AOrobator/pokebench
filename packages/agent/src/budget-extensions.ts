export const TIME_EXTENSIONS = {extend_30m:1800000,extend_60m:3600000,extend_120m:7200000,extend_240m:14400000} as const;
export const TURN_EXTENSIONS = {extend_1000t:1000,extend_2000t:2000} as const;
export type ExtensionAction = keyof typeof TIME_EXTENSIONS | keyof typeof TURN_EXTENSIONS;
export function isExtensionAction(action:string):action is ExtensionAction { return Object.hasOwn(TIME_EXTENSIONS,action)||Object.hasOwn(TURN_EXTENSIONS,action); }
export function isTimeExtension(action:string):action is keyof typeof TIME_EXTENSIONS { return Object.hasOwn(TIME_EXTENSIONS,action); }
export function extensionLabel(action:ExtensionAction):string { return isTimeExtension(action) ? ({extend_30m:"30 minutes",extend_60m:"1 hour",extend_120m:"2 hours",extend_240m:"4 hours"}[action]) : `${TURN_EXTENSIONS[action].toLocaleString("en-US")} turns`; }
