// A small, valid set of site inputs. Tests copy and change it; nothing here touches disk.

export interface FixtureInputs {
  chartData: Record<string, unknown>;
  points: Record<string, unknown>;
  site: Record<string, unknown>;
  assets: Map<string, Uint8Array>;
}

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

export const FIXTURE_CSS = [
  "@font-face { font-family: 'Press Start 2P'; src: url(fonts/press-start-2p.woff2) format('woff2'); }",
  ".ic-home { --i: url(icons/home.svg); }",
].join("\n");

export function fixture(): FixtureInputs {
  return {
    chartData: {
      _about: "fixture",
      human: { label: "Human: Speedy (world record)", color: "#d83a3a", source: "video", splits_seconds: [100, 200, 300, 400, 500, 600, 700, 800, null, null, null, null, 900, 950] },
      series: [
        { label: "Model A", color: "#111111", assisted: false, runs: ["r-a1"], cost: { kind: "pinned", usd: 50, source: "s" } },
        { label: "Model A, lane*", color: "#222222", assisted: true, runs: ["r-a2"], cost: { kind: "pinned", usd: 70, source: "s" } },
        { label: "Model B", color: "#333333", dark_color: "#444444", assisted: false, runs: ["r-b1"], cost: { kind: "events", price: "b", estimated: true } },
        { label: "Model C", color: "#555555", assisted: false, runs: ["r-c1"], cost: { kind: "events", price: "c" } },
      ],
      pages: {},
    },
    points: {
      prices_as_of: "2026-11-11",
      series: [
        { label: "Model A", runs: ["r-a1"], milestones: { STONE_BADGE: 10, KNUCKLE_BADGE: 20, DYNAMO_BADGE: 30, HEAT_BADGE: 40, BALANCE_BADGE: 50, FEATHER_BADGE: 60, MIND_BADGE: 70, RAIN_BADGE: 80, ELITE_FOUR_SIDNEY_DEFEATED: 90 }, furthest: "ELITE_FOUR_SIDNEY_DEFEATED", cost_usd: 50, cost_kind: "pinned", price: null },
        { label: "Model A, lane*", runs: ["r-a2"], milestones: { STONE_BADGE: 10, KNUCKLE_BADGE: 20, DYNAMO_BADGE: 30, HEAT_BADGE: 40, BALANCE_BADGE: 50, FEATHER_BADGE: 60, MIND_BADGE: 70, RAIN_BADGE: 80, ELITE_FOUR_SIDNEY_DEFEATED: 90, ELITE_FOUR_PHOEBE_DEFEATED: 91, ELITE_FOUR_GLACIA_DEFEATED: 92, ELITE_FOUR_DRAKE_DEFEATED: 93, WALLACE_DEFEATED: 94, GAME_CLEAR_CONFIRMED: 3725 }, furthest: "GAME_CLEAR_CONFIRMED", cost_usd: 70, cost_kind: "pinned", price: null },
        { label: "Model B", runs: ["r-b1"], milestones: { KNUCKLE_BADGE: 15, STONE_BADGE: 25, DYNAMO_BADGE: 35, HEAT_BADGE: 45, BALANCE_BADGE: 55 }, furthest: "BALANCE_BADGE", cost_usd: 2.5, cost_kind: "events", price: "b" },
        { label: "Model C", runs: ["r-c1"], milestones: { STONE_BADGE: 5, KNUCKLE_BADGE: 6, DYNAMO_BADGE: 7, HEAT_BADGE: 8, BALANCE_BADGE: 9 }, furthest: "BALANCE_BADGE", cost_usd: 1234.5, cost_kind: "events", price: "c" },
      ],
    },
    site: {
      github_url: "https://github.com/example/pokebench",
      data_date: "2026-11-11",
      cheapest_badges: 5,
      human: { name: "Speedy", note: "for reference" },
      series: [
        { chart_label: "Model A", model: "Model A", slug: "model-a", local: false, note: "linked runs" },
        { chart_label: "Model A, lane*", model: "Model A", slug: "model-a", local: false, help: "two hints" },
        { chart_label: "Model B", model: "Model B", slug: "model-b", local: true },
        { chart_label: "Model C", model: "Model C", slug: "model-c", local: false },
      ],
    },
    assets: new Map<string, Uint8Array>([
      ["site.css", bytes(FIXTURE_CSS)],
      ["fonts/press-start-2p.woff2", bytes("font")],
      ["icons/home.svg", bytes("<svg/>")],
      ["icons/trophy.svg", bytes("<svg/>")],
      ["icons/gamepad.svg", bytes("<svg/>")],
      ["icons/github.svg", bytes("<svg/>")],
      ["img/badges-over-time.png", bytes("png")],
      ["img/badges-over-time-dark.png", bytes("png")],
    ]),
  };
}
