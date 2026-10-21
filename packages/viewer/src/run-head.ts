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

export function sheetHtml(): string {
  return '<h4>RUNS · TAP TO WATCH</h4><p class="rs-empty" data-card-loading>Loading trainer cards…</p><div class="rs-cards"></div>';
}
