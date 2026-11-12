import { parseDoc, renderDoc } from "../doc.js";
import { html, type Html } from "../html.js";
import { InputError } from "../input.js";

function httpsOnly(url: string): string {
  if (/^https:\/\/[^\s"'<>]+$/.test(url)) return url;
  throw new InputError(`fonts NOTICE.md: link "${url}" must be https`);
}

export function credits(iconsLicence: string, fontsNotice: string): Html {
  const table = parseDoc(fontsNotice, "fonts NOTICE.md").filter((b) => b.kind === "table");
  if (table.length === 0) throw new InputError("fonts NOTICE.md: expected a table of the fonts");
  return html`<div class="win intro"><p>The icons on this site are <a href="https://github.com/halfmage/pixelarticons">pixelarticons</a> by Gerrit Halfmann, used under the MIT licence: home, trophy, robot, flag, mail, book-open, search, github and gamepad, recoloured here. The badge stars and the Hall of Fame crown are our own pixel art. The licence and copyright notice follow.</p></div>
<div class="card"><h2>PIXELARTICONS · MIT LICENCE</h2><pre class="licence">${iconsLicence.trimEnd()}</pre></div>
<div class="card spaced"><h2>FONTS</h2>${renderDoc(table, { what: "fonts NOTICE.md", html: true, link: httpsOnly })}<p>All three are under the SIL Open Font License 1.1, used unmodified and served from this site.</p></div>
<div class="card spaced"><h2>GAME ART</h2><p>No Nintendo or GAME FREAK artwork is used to decorate this site. Window frames and text colours are drawn in CSS after Pokémon Emerald's interface. The game frame in the turn diagram on the Method page is a screenshot from a recorded run, and some explainers show screenshots of the game as evidence. Pokémon is a trademark of Nintendo, Creatures and GAME FREAK; this project is not affiliated with them.</p></div>`;
}
