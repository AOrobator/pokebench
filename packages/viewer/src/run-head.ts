// The phone header (design Q, runs/mockups/viewer-header-phone/q-compact-experiment-first.html):
// experiment and arm first, the trial quiet, the time once; the sheet behind it
// shows what you are watching, then the other live runs.
import { esc } from "./format.js";
import type { RunView } from "./model.js";
import type { Cohort } from "./runs.js";

export interface OtherRun {
  readonly id: string;
  readonly model?: string | null;
  readonly started?: string | null;
  readonly cohort?: Cohort;
}

export interface HeadInput {
  readonly view: RunView;
  readonly runId: string | null;
  readonly label: { readonly cls: string; readonly text: string };
  // Live and not paused: the state is drawn as a blinking dot instead of a word.
  readonly running: boolean;
  readonly time: string;
  readonly others: readonly OtherRun[];
}

export function headTitle(view: RunView, runId: string | null): string {
  const evaluation = view.start?.evaluation;
  if (evaluation?.experiment !== undefined) return evaluation.experiment.id;
  if (evaluation !== undefined) return `preset ${evaluation.preset_id}`;
  return view.start?.model.id ?? runId ?? "NO RUN";
}

function cohortOf(view: RunView): Cohort | null {
  return view.start?.evaluation?.experiment ?? null;
}

const armBadge = (arm: string): string => `<span class="arm${arm === "control" ? " control" : ""}">${esc(arm.toUpperCase())}</span>`;
const trial = (cohort: Cohort): string => `trial ${String(cohort.trial)}/${String(cohort.of)}`;

function state(input: HeadInput): string {
  return input.running
    ? `<span class="rh-state dot" role="img" aria-label="${esc(input.label.text)}"></span>`
    : `<span class="rh-state ${esc(input.label.cls)}">${esc(input.label.text)}</span>`;
}

export function headHtml(input: HeadInput): string {
  const cohort = cohortOf(input.view);
  const more = input.others.length === 0 ? "" : `<span class="rh-more">+${String(input.others.length)} LIVE</span>`;
  const meta = cohort === null ? "" : `${armBadge(cohort.arm)}<span class="rh-trial">${trial(cohort)}</span>`;
  return `<span class="rh-l1">${state(input)}<span class="rh-title">${esc(headTitle(input.view, input.runId))}</span>${more}</span>`
    + `<span class="rh-l2">${meta}<span class="rh-time">${esc(input.time)}</span></span>`;
}

export function sheetHtml(input: HeadInput, startedAt: (iso: string) => string): string {
  const { view } = input;
  const cohort = cohortOf(view);
  const pill = `<span class="rs-pill ${input.running ? "live" : esc(input.label.cls)}">${esc(input.label.text)}</span>`;
  const now = `<div class="rs-now"><div class="rs-tag"><span>YOU'RE WATCHING</span>${pill}</div>`
    + `<div class="rs-title">${esc(headTitle(view, input.runId))}</div>`
    + `<div class="rs-row">${cohort === null ? "" : `${armBadge(cohort.arm)}<span class="rh-trial">${trial(cohort)}</span>`}<span class="rh-time">${esc(input.time)}</span></div>`
    + (view.start === null ? "" : `<div class="rs-where">Turn ${String(view.turn)}</div>`)
    + `</div>`;
  const others = input.others.length === 0
    ? `<p class="rs-empty">No other run is live right now.</p>`
    : input.others.map((run) => {
      const started = run.started == null ? "" : `started ${startedAt(run.started)}`;
      // A run in the watched run's experiment would carry the same title, so it leads with what differs: its arm and trial.
      if (run.cohort !== undefined && run.cohort.id === cohort?.id) {
        const line = ["same experiment", started].filter((part) => part !== "").join(" · ");
        return `<button type="button" class="rs-other" data-watch="${esc(run.id)}"><span class="rs-other-title rs-row">${armBadge(run.cohort.arm)}<span class="rh-trial">${trial(run.cohort)}</span></span>`
          + `<span class="rs-row"><span class="rh-trial">${esc(line)}</span></span><span class="rs-go">WATCH ▸</span></button>`;
      }
      const title = run.cohort?.id ?? run.model ?? run.id;
      const line = [run.cohort === undefined ? "" : trial(run.cohort), started].filter((part) => part !== "").join(" · ");
      return `<button type="button" class="rs-other" data-watch="${esc(run.id)}"><span class="rs-other-title">${esc(title)}</span>`
        + `<span class="rs-row">${run.cohort === undefined ? "" : armBadge(run.cohort.arm)}<span class="rh-trial">${esc(line)}</span></span><span class="rs-go">WATCH ▸</span></button>`;
    }).join("");
  const start = view.start;
  const details = start === null ? "" : `<h4>RUN DETAILS</h4><dl class="rs-details"><dt>Model</dt><dd>${esc(start.model.id)}</dd><dt>Thinking</dt><dd>${esc(start.sampling.thinking_level)}</dd><dt>Run</dt><dd>${esc(input.runId ?? start.run)}</dd></dl>`;
  return `${now}<h4>OTHER LIVE RUNS · TAP TO WATCH</h4><div class="rs-others">${others}</div>${details}`;
}
