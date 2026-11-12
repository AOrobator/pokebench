import { describe, expect, it } from "vitest";
import { esc, html, join, raw } from "./html.js";

describe("html", () => {
  it("escapes interpolated text", () => {
    expect(html`<p>${"<b>&\"'"}</p>`.value).toBe("<p>&lt;b&gt;&amp;&quot;&#39;</p>");
  });

  it("keeps nested html and arrays of html as they are", () => {
    const inner = html`<i>${"x"}</i>`;
    expect(html`<p>${inner}${[html`<b>1</b>`, html`<b>2</b>`]}</p>`.value).toBe("<p><i>x</i><b>1</b><b>2</b></p>");
  });

  it("writes numbers as text", () => {
    expect(html`<p>${42}</p>`.value).toBe("<p>42</p>");
  });

  it("joins with a separator", () => {
    expect(join([html`<a>`, html`<b>`], " · ").value).toBe("<a> · <b>");
  });

  it("marks trusted markup as raw only when asked", () => {
    expect(raw("<br>").value).toBe("<br>");
    expect(esc("<br>")).toBe("&lt;br&gt;");
  });
});
