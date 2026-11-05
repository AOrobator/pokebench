// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Log, START, state } from "../test-support/events.js";
import { RunView } from "./model.js";
import { cardHtml, gymHtml, parseTrainerPageData, runHtml, trainerFacts, type Gym } from "./trainer-page.js";

const bare = (): Log => { const log = new Log(); log.add(0, START); return log; };
const view = (log: Log): RunView => { const v = new RunView(); for (const event of log.events) v.apply(event); return v; };
const GYM: Gym = { badge: "STONE", title: "Stone Badge", city: "RUSTBORO CITY", leader: "ROXANNE", type: "ROCK", tm: "Rock Tomb", sprite: "leader-roxanne.png", team: [{ name: "GEODUDE", level: 12, icon: 74 }] };
const GYMS: readonly Gym[] = [GYM, { ...GYM, badge: "KNUCKLE", title: "Knuckle <Badge>", leader: "BRAWLY" }];

describe("parseTrainerPageData", () => {
  it("accepts the built table and refuses anything malformed", () => {
    const good = { version: 1, gyms: GYMS };
    expect(parseTrainerPageData(good)?.gyms).toHaveLength(2);
    for (const bad of [null, {}, { version: 2, gyms: GYMS }, { version: 1, gyms: [{ ...GYM, team: [{ name: "X" }] }] }, { version: 1, gyms: [{ ...GYM, sprite: "../x.png" }] }, { version: 1, gyms: [{ ...GYM, leader: 1 }] }]) expect(parseTrainerPageData(bad)).toBeNull();
  });
});

describe("trainerFacts", () => {
  const facts = (log: Log, seconds = 3725) => trainerFacts(view(log), seconds);

  it("reads the card from the game: ID from the OT, money, play time, badges", () => {
    const log = bare();
    log.add(1, state({ name: "A", money: 2623, play_time_s: 19_089, badges: ["STONE"], location: "ROUTE112", party: [{ species: "MARSHTOMP", species_id: 284, level: 30, hp: 80, max_hp: 89, ot_id: 3_558_151_034, ot_gender: "female" }] }));
    const f = facts(log);
    expect(f).toMatchObject({ gender: "female", name: "A", id: "04986", money: "¥2623", time: "5:18", turn: "1", runTime: "1:02:05", map: "ROUTE 112", badges: ["STONE"] });
    expect(f.party).toEqual([{ icon: 284, level: 30, hp: expect.closeTo(89.9, 1) }]);
  });

  it("shows blanks, not guesses, before the game starts", () => {
    const log = bare();
    log.add(1, state({ started: false, name: null, money: null, play_time_s: null, location: null, party: [], badges: [] }));
    expect(facts(log)).toMatchObject({ gender: "male", name: "---", id: "-----", money: "---", time: "---", map: "---", badges: [], party: [] });
  });

  it("dates a badge from its milestone", () => {
    const log = bare();
    log.add(1, state({ badges: ["STONE"] }));
    const v = view(log);
    v.milestones.push({ name: "STONE_BADGE", ms: (v.startMs ?? 0) + 65_000, seq: 2 });
    expect(trainerFacts(v, 100).earnedAt.get("STONE")).toBe("0:01:05");
  });
});

describe("page html", () => {
  const log = bare(); log.add(1, state({ name: "<A>", money: 5, badges: ["STONE"], play_time_s: 60 }));
  const facts = trainerFacts(view(log), 10);

  it("draws the card with real art, earned badges and a button for all eight gyms", () => {
    const root = document.createElement("div"); root.innerHTML = cardHtml(facts, GYMS);
    expect(root.querySelector<HTMLImageElement>(".tp-card-art")?.getAttribute("src")).toBe("/sprites/page/card-male.png");
    expect(root.querySelectorAll("[data-tp-badge]")).toHaveLength(2);
    expect(root.querySelectorAll(".tp-badge-art")).toHaveLength(1);
    expect(root.querySelector("[data-tp-badge='0']")?.getAttribute("aria-label")).toBe("Stone Badge, ROXANNE, earned");
    expect(root.querySelector("[data-tp-badge='1']")?.getAttribute("aria-label")).toContain("not earned");
    expect(root.querySelector("think")).toBeNull();
    expect(root.innerHTML).toContain("NAME: &lt;A&gt;");
    expect(root.innerHTML).toContain("POKéDEX");
  });

  it("keeps interface and control rows off the page", () => {
    const html = runHtml(facts);
    for (const label of ["MODEL", "THINKING", "TURN", "RUN TIME", "MAP"]) expect(html).toContain(`data-gt="${label}"`);
    expect(html).not.toContain("INTERFACE");
    expect(html).not.toContain("CONTROLS");
  });

  it("tells the gym's story and whether this run has the badge", () => {
    const earned = gymHtml(GYM, facts);
    for (const text of ["STONE BADGE", "ROXANNE", "RUSTBORO CITY", "ROCK · TM Rock Tomb", "Earned"]) expect(earned).toContain(text);
    expect(earned).toContain("/sprites/page/leader-roxanne.png");
    expect(earned).toContain("/sprites/icons/74.png");
    const missing = gymHtml(GYMS[1] as Gym, facts);
    expect(missing).toContain("Not earned yet");
    expect(missing).toContain("KNUCKLE &lt;BADGE&gt;");
  });
});
