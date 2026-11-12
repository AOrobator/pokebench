import { html, type Html } from "../html.js";

export function method(explainers: number, contributingUrl: string | undefined): Html {
  const contributing = contributingUrl === undefined
    ? html``
    : html`<div class="card"><h2>SUBMIT A RUN</h2><p>Record it with the harness from a clean checkout, list every limit you set, package the event log, save states and final memory with checksums, and open an issue. Never include the game file.</p><a class="pbtn" href="${contributingUrl}">CONTRIBUTING.md</a></div>`;
  return html`<div class="dialog small"><p>A model plays Pokémon Emerald through a harness, one turn at a time. We record everything and rank how far it gets.</p></div>
<h2 class="sect">HOW A TURN WORKS</h2>
<div class="split even">
  <div class="card"><ol class="steps">
    <li>The harness reads the game's memory and turns it into a text readout: where the player is, the exits, the people nearby, the battle.</li>
    <li>The model sees the readout and the screen, and calls tools such as <code>navigate_to_target</code> and <code>battle_action</code>.</li>
    <li>The harness presses the buttons, reports what happened, and the next turn starts.</li>
    <li>Progress (badges, the Elite Four, beating the game) comes from flags the game itself sets.</li></ol></div>
  <figure class="chart"><picture><source media="(prefers-color-scheme: dark)" srcset="img/harness-loop-dark.webp"><img src="img/harness-loop.webp" alt="One turn: the game, what the model sees, what it decides, and what the harness does" width="2400" height="1094"></picture></figure>
</div>
<h2 class="sect">WITH AND WITHOUT HELP</h2>
<div class="split even">
  <div class="card"><h2>UNASSISTED RUNS</h2><p>The standard harness and the model as served, with no game knowledge added. Runs start from power-on, or from a save at the title screen where the results say so.</p></div>
  <div class="card"><h2>ASSISTED RUNS</h2><p>Any run with extra help: a model whose weights we edited, a custom experiment, or a switch that adds game knowledge (hints, guides, extra tools). Assisted runs are ranked in the same list, each marked (assisted) with the help it had.</p></div>
</div>
<h2 class="sect">FEATURES AND RULES</h2>
<div class="split even">
  <div class="card"><h2>EXPLAINERS</h2><p>Every harness behavior sits behind a switch whose off state is the old behavior, and each switch has an explainer page with diagrams.</p><a class="pbtn" href="explainers.html">BROWSE ALL ${String(explainers)}</a></div>
  ${contributing}
</div>`;
}
