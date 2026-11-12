// A small, valid set of site inputs. Tests copy and change it; nothing here touches disk.

export interface FixtureInputs {
  chartData: Record<string, unknown>;
  points: Record<string, unknown>;
  site: Record<string, unknown>;
  runs: Record<string, unknown>;
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
        { label: "Model A", color: "#111111", assisted: false, runs: ["run-aa01", "run-aa02"], cost: { kind: "pinned", usd: 50, source: "s" } },
        { label: "Model A, lane*", color: "#222222", assisted: true, runs: ["run-ab07"], cost: { kind: "pinned", usd: 70, source: "s" } },
        { label: "Model B", color: "#333333", dark_color: "#444444", assisted: false, runs: ["run-b001"], cost: { kind: "events", price: "b", estimated: true } },
        { label: "Model C", color: "#555555", assisted: false, runs: ["run-c001"], cost: { kind: "events", price: "c" } },
      ],
      pages: {},
    },
    points: {
      prices_as_of: "2026-11-11",
      series: [
        { label: "Model A", runs: ["run-aa01", "run-aa02"], milestones: { STONE_BADGE: 10, KNUCKLE_BADGE: 20, DYNAMO_BADGE: 30, HEAT_BADGE: 40, BALANCE_BADGE: 50, FEATHER_BADGE: 60, MIND_BADGE: 70, RAIN_BADGE: 80, ELITE_FOUR_SIDNEY_DEFEATED: 90 }, furthest: "ELITE_FOUR_SIDNEY_DEFEATED", cost_usd: 50, cost_kind: "pinned", price: null },
        { label: "Model A, lane*", runs: ["run-ab07"], milestones: { STONE_BADGE: 5, KNUCKLE_BADGE: 30, DYNAMO_BADGE: 30, HEAT_BADGE: 40, BALANCE_BADGE: 50, FEATHER_BADGE: 60, MIND_BADGE: 70, RAIN_BADGE: 80, ELITE_FOUR_SIDNEY_DEFEATED: 90, ELITE_FOUR_PHOEBE_DEFEATED: 91, ELITE_FOUR_GLACIA_DEFEATED: 92, ELITE_FOUR_DRAKE_DEFEATED: 93, WALLACE_DEFEATED: 94, GAME_CLEAR_CONFIRMED: 3725 }, furthest: "GAME_CLEAR_CONFIRMED", cost_usd: 70, cost_kind: "pinned", price: null },
        { label: "Model B", runs: ["run-b001"], milestones: { KNUCKLE_BADGE: 15, STONE_BADGE: 25, DYNAMO_BADGE: 35, HEAT_BADGE: 45, BALANCE_BADGE: 55 }, furthest: "BALANCE_BADGE", cost_usd: 2.5, cost_kind: "events", price: "b" },
        { label: "Model C", runs: ["run-c001"], milestones: { STONE_BADGE: 5, KNUCKLE_BADGE: 6, DYNAMO_BADGE: 7, HEAT_BADGE: 8, BALANCE_BADGE: 9 }, furthest: "BALANCE_BADGE", cost_usd: 1234.5, cost_kind: "events", price: "c" },
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
      models: [
        { slug: "model-a", name: "Model A", kind: "cloud", effort: "medium", context: 262144 },
        { slug: "model-b", name: "Model B", kind: "local", effort: "medium", context: 65536 },
        { slug: "model-c", name: "Model C", kind: "cloud", effort: "off", context: 32768 },
      ],
    },
    runs: {
      runs: [
        { id: "run-aa01", started: "2026-11-01T02:00:00-05:00", start: "a new game at power-on", result: "3 gym badges; stopped at its 4-hour limit", turns: 800, preset: "a-4h", code: "aaaaaaaa1", linked: "1 of 2" },
        { id: "run-aa02", started: "2026-11-01T08:00:00.500-05:00", start: "run aa01's save", result: "Beat Sidney; stopped at its limit", turns: 1200, preset: "a-continuation", code: "aaaaaaaa1", linked: "2 of 2" },
        {
          id: "run-ab07", started: "2026-11-10T15:38:09-05:00", start: "a new game at power-on", result: "Hall of Fame; the run ended on its own", turns: 4124, preset: "a-lane", code: "bbbbbbbb2",
          release: {
            tag: "model-a-lane-ab07",
            kicker: "HEAVILY ASSISTED · RELEASED FOR CHECKING",
            title: "Model A, from power-on to the Hall of Fame",
            started_text: "Started 2026-11-10 at 15:38 from a new game.",
            ended_text: "Ended 2026-11-11 at 08:54, when the game was beaten.",
            facts: [{ label: "HELP", text: "Two hints." }, { label: "CODE VERSION", text: "commit `bbbbbbbb2`, with no local changes" }],
            verify: "just verify-release <folder>",
            team: [{ species: "RAYQUAZA", level: 74, hp: "251/251", moves: "Fly, Outrage", item: "none", caught: "Sky Pillar, level 70" }],
            team_note: "Read from the run's final game state.",
            check: [{ title: "WITH THE REPOSITORY", steps: ["Run `just setup`.", "Run `just verify-release <this folder>`."] }],
            notes: [{ title: "INDEPENDENT REPLAY", text: "Every snapshot matched." }],
            assets: [
              { name: "events-ab07.tar.xz", bytes: 11811008, about: "The harness event log", open_with: "tar -xf" },
              { name: "SHA256SUMS", bytes: 783, about: "Checksums of every file above", open_with: "shasum -a 256 -c" },
            ],
            assets_note: "Edited for publication.",
          },
        },
        { id: "run-b001", started: "2026-10-24T19:32:42-04:00", start: "the title-screen save", result: "5 gym badges; stopped by the operator", turns: 7248, preset: "b-24h", code: "ccccccccc" },
        { id: "run-c001", started: "2026-10-25T10:51:18-04:00", start: "a new game at power-on", result: "5 gym badges; ended on a model error", turns: 2741, preset: "c-probe", code: "ddddddddd" },
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
      ["img/badges-for-the-money.png", bytes("png")],
      ["img/badges-for-the-money-dark.png", bytes("png")],
    ]),
  };
}
