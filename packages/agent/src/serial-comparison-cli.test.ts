import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const command=vi.hoisted(()=>vi.fn<(args:string[])=>Promise<string>>());
vi.mock("./serial-comparison.js",()=>({comparisonCommand:command}));

// This file owns the CLI's process argv/exit status and console globals.
// Every test restores them; isolated Vitest workers keep this owner separate
// from other files. No child, game server or model is started here.
const originalArgv=process.argv;
const originalExitCode=process.exitCode;
beforeEach(()=>{
 vi.resetModules();command.mockReset();process.exitCode=undefined;
 vi.spyOn(console,"log").mockImplementation(()=>{});
 vi.spyOn(console,"error").mockImplementation(()=>{});
});
afterEach(()=>{process.argv=originalArgv;process.exitCode=originalExitCode;vi.restoreAllMocks();});

async function importEntrypoint(args:string[]):Promise<void>{
 process.argv=["/node","/repo/packages/agent/dist/serial-comparison-cli.js",...args];
 await import("./serial-comparison-cli.js");
 await Promise.resolve();
}
describe("actual comparison CLI adapter",()=>{
 it.each(["prepare","execute"])("forwards %s argv and reports the helper result",async mode=>{
  command.mockResolvedValue("prepared without gameplay");
  await importEntrypoint([mode,"/receipt folder/manifest.json"]);
  expect(command).toHaveBeenCalledExactlyOnceWith([mode,"/receipt folder/manifest.json"]);
  expect(console.log).toHaveBeenCalledExactlyOnceWith("prepared without gameplay");
  expect(console.error).not.toHaveBeenCalled();expect(process.exitCode).toBeUndefined();
 });
 it("makes an actual adapter rejection visible and returns nonzero status",async()=>{
  command.mockRejectedValue(new Error("frozen manifest mismatch"));
  await importEntrypoint(["execute","/manifest.json"]);
  expect(command).toHaveBeenCalledExactlyOnceWith(["execute","/manifest.json"]);
  expect(console.error).toHaveBeenCalledExactlyOnceWith("Error: frozen manifest mismatch");
  expect(console.log).not.toHaveBeenCalled();expect(process.exitCode).toBe(1);
 });
});
