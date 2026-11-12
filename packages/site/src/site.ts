import { problems, type Output } from "./check.js";
import { html } from "./html.js";
import { parseChartData, parsePoints, parseSiteData } from "./input.js";
import { page, type Shell } from "./layout.js";
import { home } from "./pages/home.js";
import { standings } from "./standings.js";

export class SiteError extends Error {}

export interface SiteInputs {
  readonly chartData: unknown;
  readonly points: unknown;
  readonly site: unknown;
  // Files copied into the site unchanged, keyed by their path in the built site.
  readonly assets: ReadonlyMap<string, Uint8Array>;
}

const PLAIN_PATH = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/i;

export function buildSite(inputs: SiteInputs): Map<string, Output> {
  const site = parseSiteData(inputs.site);
  const points = parsePoints(inputs.points);
  const st = standings(parseChartData(inputs.chartData), points, site);
  const shell: Shell = {
    sections: ["home"],
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
  const decoded = new Map<string, Output>([...out].map(([k, v]) => [k, k.endsWith(".css") && typeof v !== "string" ? new TextDecoder().decode(v) : v]));
  const found = problems(decoded);
  if (found.length > 0) throw new SiteError(`the built site has problems:\n${found.join("\n")}`);
  return out;
}
