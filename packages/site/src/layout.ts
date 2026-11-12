import { html, type Html } from "./html.js";

export type Section = "home" | "results" | "models" | "runs" | "updates" | "explainers" | "method";

interface SectionInfo {
  readonly label: string;
  readonly href: string;
  readonly icon: string;
}

export const SECTIONS: Readonly<Record<Section, SectionInfo>> = {
  home: { label: "HOME", href: "index.html", icon: "home" },
  results: { label: "RESULTS", href: "results.html", icon: "trophy" },
  models: { label: "MODELS", href: "models.html", icon: "robot" },
  runs: { label: "RUNS", href: "runs.html", icon: "flag" },
  updates: { label: "UPDATES", href: "updates.html", icon: "mail" },
  explainers: { label: "EXPLAINERS", href: "explainers.html", icon: "book-open" },
  method: { label: "METHOD", href: "method.html", icon: "search" },
};

export interface PageSpec {
  readonly title: string;
  readonly description: string;
  readonly section: Section;
  // Crumbs after POKéBENCH, e.g. ["MODELS", "Claude Opus 5.5"].
  readonly crumbs: readonly string[];
  // How many folders below the site root the page sits, so links stay relative.
  readonly depth: number;
  readonly body: Html;
}

export interface Shell {
  readonly sections: readonly Section[];
  readonly githubUrl: string;
  readonly footer: Html;
}

function menu(shell: Shell, current: Section, root: string): Html {
  const items = shell.sections.map((s) => {
    const info = SECTIONS[s];
    const icon = html`<span class="icw"><i class="ic ic-${info.icon}" aria-hidden="true"></i></span><span>${info.label}</span>`;
    return s === current
      ? html`<a class="m-${s}" href="${root + info.href}" aria-current="page">${icon}</a>`
      : html`<a class="m-${s}" href="${root + info.href}">${icon}</a>`;
  });
  const github = html`<a class="ext" href="${shell.githubUrl}"><span class="icw"><i class="ic ic-github" aria-hidden="true"></i></span><span>GITHUB</span></a>`;
  return html`<nav class="menu" aria-label="Site">${items}${github}</nav>`;
}

export function page(shell: Shell, spec: PageSpec): string {
  const root = "../".repeat(spec.depth);
  const crumbs = spec.crumbs.map((c) => html`<span class="sep" aria-hidden="true">·</span><span>${c}</span>`);
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${spec.title}</title>
<meta name="description" content="${spec.description}">
<link rel="icon" type="image/svg+xml" href="${root}icons/gamepad.svg">
<link rel="stylesheet" href="${root}site.css">
<link rel="alternate" type="application/rss+xml" title="PokéBench updates" href="${root}feed.xml">
</head>
<body>
<header class="navhead"><a href="${root}index.html" class="mark" aria-label="PokéBench home"><i class="ic ic-gamepad" aria-hidden="true"></i></a><p class="crumbs"><b>POKéBENCH</b>${crumbs}</p></header>
<div class="navbody">
${menu(shell, spec.section, root)}
<main class="scrn">
${spec.body}
</main>
</div>
<footer>${shell.footer}</footer>
</body>
</html>
`.value;
}
