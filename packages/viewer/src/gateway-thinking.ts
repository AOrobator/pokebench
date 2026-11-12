import type { RunEvent } from "@pokebench/agent/events";
export interface GatewayThinkingPorts {
 sources(): Promise<readonly { key: string; text: string }[]>;
 transcript(key: string, record: string): Promise<string | null>;
 now(): number;
}
export function createGatewayThinking(_ports: GatewayThinkingPorts) {
 return { event: (event: RunEvent): Promise<RunEvent> => Promise.resolve(event) };
}
