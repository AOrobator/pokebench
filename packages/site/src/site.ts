import { catalog } from "./catalog.js";
import { problems, type Output } from "./check.js";
import { html } from "./html.js";
import { parseChartData, parsePoints, parseRuns, parseSiteData } from "./input.js";
import { page, type Shell } from "./layout.js";
import { groupModels, type SiteView } from "./pages/common.js";
import { home } from "./pages/home.js";
import { modelPage, modelsIndex } from "./pages/models.js";
import { results } from "./pages/results.js";
import { runPage, runsIndex } from "./pages/runs.js";
import { standings } from "./standings.js";

export class SiteError extends Error {}

export interface SiteInputs {
  readonly chartData: unknown;
  readonly points: unknown;
  readonly site: unknown;
  readonly runs: unknown;
  // Files copied into the site unchanged, keyed by their path in the built site.
  readonly assets: ReadonlyMap<string, Uint8Array>;
}

const PLAIN_PATH = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/i;

export function buildSite(inputs: SiteInputs): Map<string, Output> {
  const site = parseSiteData(inputs.site);
  const points = parsePoints(inputs.points);
  const st = standings(parseChartData(inputs.chartData), points, site);
  const cat = catalog(st.entries, parseRuns(inputs.runs));
  const view: SiteView = { st, cat, groups: groupModels(site.models, [...cat.bySeries.values()]), githubUrl: site.githubUrl };
  const shell: Shell = {
    sections: ["home", "results", "models", "runs"],
    githubUrl: site.githubUrl,
    footer: html`<p class="foot">DATA FROM THE RESULTS, ${site.dataDate} · PRICES AS OF ${points.pricesAsOf}</p>
<p class="credits">Icons: <a href="https://github.com/halfmage/pixelarticons">pixelarticons</a> © 2019 Gerrit Halfmann, MIT licence. Fonts: Press Start 2P, Inter and JetBrains Mono, SIL Open Font License 1.1.</p>`,
  };
  const out = new Map<string, Output>();
  for (const [path, body] of inputs.assets) {
    if (!PLAIN_PATH.test(path) || path.split("/").some((seg) => seg === "." || seg === "..")) {
      throw new SiteError(`asset path "${path}" must be a plain relative path`);
    }
    out.set(path, body);
  }
  out.set("index.html", page(shell, {
    title: "PokéBench",
    description: "How far vision-language models get in Pokémon Emerald through a harness: results, models, runs and method.",
    section: "home",
    crumbs: ["HOME"],
    depth: 0,
    body: home(st),
  }));
  out.set("results.html", page(shell, {
    title: "Results · PokéBench",
    description: "Every model's best run in Pokémon Emerald: how far it got, how long it took and what it would have cost.",
    section: "results",
    crumbs: ["RESULTS"],
    depth: 0,
    body: results(view),
  }));
  out.set("models.html", page(shell, {
    title: "Models · PokéBench",
    description: "Every model run through the PokéBench harness, with its best run with and without help.",
    section: "models",
    crumbs: ["MODELS"],
    depth: 0,
    body: modelsIndex(view.groups),
  }));
  for (const g of view.groups) {
    out.set(`models/${g.meta.slug}.html`, page(shell, {
      title: `${g.meta.name} · PokéBench`,
      description: `${g.meta.name} in Pokémon Emerald: every run, with and without help.`,
      section: "models",
      crumbs: ["MODELS", g.meta.name],
      depth: 1,
      body: modelPage(site.githubUrl, g),
    }));
  }
  out.set("runs.html", page(shell, {
    title: "Runs · PokéBench",
    description: "Every PokéBench run on the leaderboard, newest first, with the released ones linked.",
    section: "runs",
    crumbs: ["RUNS"],
    depth: 0,
    body: runsIndex(site.githubUrl, view.groups),
  }));
  for (const g of view.groups) {
    for (const s of g.series) {
      for (const run of s.all) {
        if (run.release === undefined) continue;
        out.set(`runs/${run.short}.html`, page(shell, {
          title: `Run ${run.short} · PokéBench`,
          description: run.release.title,
          section: "runs",
          crumbs: ["RUNS", run.short],
          depth: 1,
          body: runPage(site.githubUrl, g, s, run, run.release),
        }));
      }
    }
  }
  const decoded = new Map<string, Output>([...out].map(([k, v]) => [k, k.endsWith(".css") && typeof v !== "string" ? new TextDecoder().decode(v) : v]));
  const found = problems(decoded);
  if (found.length > 0) throw new SiteError(`the built site has problems:\n${found.join("\n")}`);
  return out;
}
