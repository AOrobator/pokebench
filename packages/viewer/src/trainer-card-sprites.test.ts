import { Window } from "happy-dom";
import { expect, it } from "vitest";
import { cardHtml, type CardInput, type CardKind } from "./trainer-card.js";

it.each<CardKind>(["wide", "mini"])("renders %s party sprites as decorative images for Safari's nearest-neighbor image path", kind => {
  const input: CardInput = {
    runId: "sprite-rendering", title: "Sprite rendering", arm: null, trial: null, trainer: "may", status: "live",
    facts: { live: true, elapsed: 0, reached: null, level: 0, total: 203, recovered: false, fresh: false, cap: null },
    card: { name: "RED", location: "Route 104", party: [{ speciesId: 281, level: 15, egg: false }, { speciesId: 288, level: 4, egg: true }] },
  };
  const document = new Window().document;
  document.body.innerHTML = cardHtml(input, { trainers: ["may"], icons: new Set([281, 412]), egg: 412 }, kind);
  const sprites = Array.from(document.querySelectorAll(".tc-mon"));
  expect(sprites.map(sprite => ({
    source: sprite.querySelector("img")?.getAttribute("src"),
    alt: sprite.querySelector("img")?.getAttribute("alt"),
    title: sprite.getAttribute("title"),
    background: sprite.getAttribute("style"),
  }))).toEqual((kind === "wide" ? [
    { source: "/sprites/icons/281.png", alt: "", title: "Lv15", background: null },
    { source: "/sprites/icons/412.png", alt: "", title: "Egg", background: null },
  ] : [{ source: "/sprites/icons/281.png", alt: "", title: "Lv15", background: null }]));
});
