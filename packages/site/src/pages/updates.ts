import { postPath } from "../feed.js";
import { html, type Html } from "../html.js";
import { renderBlocks, renderInline } from "../markdown.js";
import type { Post } from "../posts.js";
import { modelHref, type ModelGroup } from "./common.js";

export function updatesIndex(posts: readonly Post[]): Html {
  const cards = posts.map((p) => html`<article class="card post"><span class="date">${p.date}</span><h2><a href="${postPath(p)}">${p.title}</a></h2><p>${renderInline(p.first, "", p.name)}</p><a class="pbtn" href="${postPath(p)}">READ</a></article>`);
  return html`<div class="win intro"><p>New models, harness versions and released runs, newest first. Follow them with the <a href="feed.xml">RSS feed</a>.</p></div>
${posts.length === 0 ? html`<p class="note">No updates yet.</p>` : cards}`;
}

export function postPage(p: Post, groups: readonly ModelGroup[]): Html {
  const chips = groups.filter((g) => p.models.includes(g.meta.slug)).map((g) => html`<a class="pbtn chip" href="${modelHref("../", g.meta.slug)}">${g.meta.name}</a>`);
  return html`<article class="card post full"><span class="date">${p.date}</span>
<h1>${p.title}</h1>
${chips.length === 0 ? html`` : html`<p class="chips">${chips}</p>`}
${renderBlocks(p.blocks, "../", p.name)}
</article>
<div class="btns"><a class="pbtn" href="../updates.html">ALL UPDATES</a></div>`;
}

export function latestCard(p: Post): Html {
  return html`<article class="card post"><span class="date">${p.date} · LATEST UPDATE</span><h2>${p.title}</h2><p>${renderInline(p.first, "", p.name)}</p><a class="pbtn" href="${postPath(p)}">READ THE UPDATE</a></article>`;
}
