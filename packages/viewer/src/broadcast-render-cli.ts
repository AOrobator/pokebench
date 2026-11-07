// Thin entrypoint for `just broadcast-render`: a private viewer on a free port, a headless page, and ffmpeg.
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";
import { parseBroadcast } from "./broadcast-feed.js";
import { parseRenderArgs, renderClip, type Encoder, type RenderPage } from "./broadcast-render.js";
import { startViewer } from "./server.js";

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

function encoder(args: string[]): Encoder {
  const child = spawn("nice", ["-n", "10", "ffmpeg", ...args], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise<void>((finish, fail) => {
    child.on("error", fail);
    child.on("close", code => { if (code === 0) finish(); else fail(new Error(`ffmpeg exited ${String(code)}`)); });
  });
  done.catch(() => undefined);
  // ffmpeg stops reading once it has -t seconds; a last frame or two can arrive after that.
  child.stdin.on("error", () => undefined);
  return {
    write: frame => new Promise((ready, fail) => {
      if (child.stdin.write(frame)) ready();
      else { child.stdin.once("drain", ready); done.then(ready, fail); }
    }),
    finish: () => { child.stdin.end(); return done; },
    // ffmpeg blocked on stdin ignores SIGTERM until the pipe closes.
    abort: () => { child.stdin.destroy(); child.kill(); },
  };
}

// The page's own background with nothing on it, as a file for ffmpeg to lay under the game.
async function backdropFile(page: Page, folder: string): Promise<string> {
  const path = join(folder, "backdrop.png");
  await page.evaluate(() => {
    document.documentElement.classList.remove("transparent");
    for (const el of document.querySelectorAll<HTMLElement>("#stage > *")) el.style.visibility = "hidden";
  });
  writeFileSync(path, await page.screenshot());
  await page.evaluate(() => {
    document.documentElement.classList.add("transparent");
    for (const el of document.querySelectorAll<HTMLElement>("#stage > *")) el.style.visibility = "";
  });
  return path;
}

async function main(): Promise<void> {
  const args = parseRenderArgs(process.argv.slice(2));
  const runsRoot = resolve(process.env.POKEBENCH_RUNS ?? "runs");
  const viewer = await startViewer({ runsRoot, staticDir: here("../static"), appDir: here("./"), port: 0 });
  const browser = await chromium.launch();
  const folder = mkdtempSync(join(tmpdir(), "broadcast-render-"));
  try {
    await renderClip({
      started: async run => {
        const response = await fetch(`${viewer.url}api/runs/${encodeURIComponent(run)}/broadcast?after=0`);
        if (!response.ok) throw new Error(`run ${run}: HTTP ${String(response.status)}`);
        return Date.parse(parseBroadcast(await response.json()).header.started) / 1000;
      },
      readText: path => { try { return readFileSync(path, "utf8"); } catch { return null; } },
      commentaryFolder: run => join(runsRoot, "broadcast", run),
      listFiles: path => readdirSync(path),
      openPage: async (path, transparent): Promise<RenderPage> => {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await page.goto(new URL(path, viewer.url).href);
        await page.waitForFunction(() => window.broadcastReady || window.broadcastError !== null, null, { timeout: 300_000 });
        const problem = await page.evaluate(() => window.broadcastError);
        if (problem !== null) throw new Error(problem);
        return {
          setTime: t => page.evaluate(moment => window.broadcastSetTime(moment), t),
          shot: () => page.screenshot({ type: "png", omitBackground: transparent }),
          backdrop: () => backdropFile(page, folder),
          close: () => page.close(),
        };
      },
      encode: encoder,
      log: line => { console.error(line); },
    }, args);
    console.error(`wrote ${args.out}`);
  } finally {
    rmSync(folder, { recursive: true, force: true });
    await browser.close();
    await viewer.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
