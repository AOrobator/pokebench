// The disk entrypoint: reads the site's inputs from the repo, builds in memory, writes site/dist.
// Usage: node packages/site/dist/cli.js <repo root>
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { buildSite } from "./site.js";

const root = resolve(process.argv[2] ?? ".");
const out = join(root, "site", "dist");

async function json(rel: string): Promise<unknown> {
  return JSON.parse(await readFile(join(root, rel), "utf8")) as unknown;
}

async function assets(): Promise<Map<string, Uint8Array>> {
  const files: [string, string][] = [
    ["site.css", "packages/site/assets/site.css"],
    ["fonts/press-start-2p.woff2", "packages/viewer/static/fonts/press-start-2p.woff2"],
    ["fonts/inter.woff2", "packages/viewer/static/fonts/inter.woff2"],
    ["fonts/jetbrains-mono.woff2", "packages/viewer/static/fonts/jetbrains-mono.woff2"],
    ["fonts/NOTICE.md", "packages/viewer/static/fonts/NOTICE.md"],
    ["img/badges-over-time.png", "docs/images/badges-over-time.png"],
    ["img/badges-over-time-dark.png", "docs/images/badges-over-time-dark.png"],
    ["img/badges-for-the-money.png", "docs/images/badges-for-the-money.png"],
    ["img/badges-for-the-money-dark.png", "docs/images/badges-for-the-money-dark.png"],
  ];
  for (const name of await readdir(join(root, "packages/site/assets/icons"))) files.push([`icons/${name}`, `packages/site/assets/icons/${name}`]);
  const map = new Map<string, Uint8Array>();
  for (const [to, from] of files) map.set(to, await readFile(join(root, from)));
  return map;
}

async function posts(): Promise<{ name: string; text: string }[]> {
  const dir = join(root, "site", "updates");
  const names = (await readdir(dir)).filter((n) => n.endsWith(".md")).sort();
  return Promise.all(names.map(async (name) => ({ name, text: await readFile(join(dir, name), "utf8") })));
}

const built = buildSite({
  chartData: await json("docs/images/charts/chart-data.json"),
  points: await json("docs/images/charts/chart-points.json"),
  site: await json("site/data/site.json"),
  runs: await json("site/data/runs.json"),
  posts: await posts(),
  assets: await assets(),
});
await rm(out, { recursive: true, force: true });
for (const [path, body] of built) {
  const target = join(out, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, body);
}
process.stdout.write(`wrote ${String(built.size)} files to ${out}\n`);
