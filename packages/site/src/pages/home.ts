import { hms, progress, usd } from "../format.js";
import { html, type Html } from "../html.js";
import type { Entry, Standings } from "../standings.js";

// "Model (local, assisted)": local runs ran on our own GPUs; assisted runs had extra help.
export function displayName(e: Entry): string {
  const tags = [...(e.local ? ["local"] : []), ...(e.assisted ? ["assisted"] : [])];
  return tags.length === 0 ? e.model : `${e.model} (${tags.join(", ")})`;
}

function stat(label: string, value: string, sub: string): Html {
  return html`<div class="win stat"><span class="lbl">${label}</span><b class="val">${value}</b><span class="sub">${sub}</span></div>`;
}

function hero(best: Entry): Html {
  const kicker = best.assisted ? "LEADING RUN · ASSISTED" : "LEADING RUN";
  const helped = best.help === undefined ? html`` : html`<p>The help it had: ${best.help}.</p>`;
  return html`<section class="dialog hero">
  <p class="t-red">${kicker}</p>
  <h1 class="headline">${displayName(best)}: ${progress(best.level)} in ${hms(best.seconds)}</h1>
  ${helped}
  <p class="facts"><span class="t-blue">${progress(best.level).toUpperCase()}</span><span class="t-blue">${hms(best.seconds)}</span><span class="t-blue">${usd(best.costUsd)} AT API PRICES</span></p>
</section>`;
}

export function home(st: Standings): Html {
  const leader = stat(st.best.assisted ? "BEST WITH HELP" : "BEST RUN", progress(st.best.level), `${displayName(st.best)} · ${hms(st.best.seconds)}`);
  const unhelped = st.bestUnhelped === undefined ? [] : [stat("BEST WITHOUT HELP", progress(st.bestUnhelped.level), `${displayName(st.bestUnhelped)} · ${hms(st.bestUnhelped.seconds)}`)];
  const cheapest = st.cheapest === undefined
    ? []
    : [stat(
      `CHEAPEST TO ${String(st.cheapestBadges)} GYM BADGES`,
      usd(st.cheapest.costUsd),
      `${displayName(st.cheapest)}; the whole run at API prices${st.cheapest.estimated ? ", an estimate" : ""}`,
    )];
  const record = stat("HUMAN WORLD RECORD", hms(st.human.seconds), `${st.human.name}, ${progress(st.human.level).toLowerCase()}`);
  return html`${hero(st.best)}
<div class="stats">${[leader, ...unhelped, ...cheapest, record]}</div>
<p class="note">Times are hours:minutes:seconds from the start of the run.</p>
<figure class="chart">
  <picture><source media="(prefers-color-scheme: dark)" srcset="img/badges-over-time-dark.png"><img src="img/badges-over-time.png" alt="Badges over time: each model's best run against the human world record" width="2676" height="2214"></picture>
  <figcaption>Every model's best run against the human world record. Dotted lines are heavily assisted runs.</figcaption>
</figure>
<div class="btns"><a class="go" href="results.html">SEE EVERY RESULT</a></div>`;
}
