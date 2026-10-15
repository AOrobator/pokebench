import { execFileSync } from "node:child_process";

// The process group a live pid belongs to, as ps prints it.
export const processGroup = (pid: number): string => execFileSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" }).trim();
