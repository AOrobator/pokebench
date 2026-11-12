import { renderDoc } from "../doc.js";
import { explainerImage, explainerLink, type Explainer, type ExplainerGroup } from "../explainers.js";
import { html, type Html } from "../html.js";
import { inlineHtml, plainText } from "../markdown.js";

// Summaries on the index sit one folder above the explainer pages.
function indexLink(githubUrl: string, what: string): (url: string) => string {
  const link = explainerLink(githubUrl, what, "readme");
  return (url) => {
    const to = link(url);
    return /^(?:https:|#)/.test(to) ? to : `explainers/${to}`;
  };
}

export function explainersIndex(githubUrl: string, groups: readonly ExplainerGroup[]): Html {
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const cards = groups.map((g) => {
    const o = { what: "explainers README", html: true, link: indexLink(githubUrl, "explainers README") };
    const items = g.items.map((i) => {
      const q = `${plainText(i.title)} ${plainText(i.summary)}`.toLowerCase();
      return html`<li data-q="${q}"><a href="explainers/${i.slug}.html">${inlineHtml(i.title, o)}</a><span class="sub">${inlineHtml(i.summary, o)}</span></li>`;
    });
    return html`<details class="card cat" open><summary><h2>${g.title.toUpperCase()} · ${String(g.items.length)}</h2></summary><p class="note">${g.about}</p><ul class="xlist">${items}</ul></details>`;
  });
  return html`<div class="win intro"><p>Every behavior the harness adds is a switch, and every switch has an explainer: what changes for the model, why it was added, where the facts come from in the game, and what is still unproven. ${String(total)} explainers in ${String(groups.length)} groups.</p></div>
<label class="search" hidden><span>FIND</span><input type="search" placeholder="e.g. navigation, battle, warp" aria-label="Filter explainers"></label>
<p class="note" data-count></p>
${cards}
<script src="explainers.js" defer></script>`;
}

export function explainerPage(githubUrl: string, e: Explainer): Html {
  const o = { what: e.file, html: true, link: explainerLink(githubUrl, e.file), image: explainerImage(e.file) };
  const kicker = e.kicker === undefined ? html`` : html`<p class="kicker">${inlineHtml(e.kicker, o)}</p>`;
  return html`<div class="btns xbar"><a class="pbtn" href="../explainers.html">◀ ALL EXPLAINERS</a></div>
<article class="card doc">
${kicker}
<h1>${inlineHtml(e.title, o)}</h1>
${renderDoc(e.blocks, o)}
</article>`;
}
