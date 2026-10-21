#!/usr/bin/env python3
"""Render a normalized evidence payload as a self-contained PokéBench report."""
from __future__ import annotations

import argparse
import html
import json
import math
from pathlib import Path


def escape(value: object) -> str:
    return html.escape('N/A' if value is None else str(value), quote=True)


def load_object(path: Path) -> dict[str, object]:
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError(f'{path}: expected an object')
    return value


def objects(value: object, field: str) -> list[dict[str, object]]:
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise ValueError(f'{field}: expected a list of objects')
    return value


def table(spec: dict[str, object]) -> str:
    columns = spec.get('columns')
    rows = spec.get('rows')
    if not isinstance(columns, list) or not all(isinstance(c, str) for c in columns):
        raise ValueError('table columns must be strings')
    if not isinstance(rows, list) or not all(isinstance(r, list) and len(r) == len(columns) for r in rows):
        raise ValueError('table rows must match the column count')
    head = ''.join(f'<th scope="col">{escape(c)}</th>' for c in columns)
    body = ''.join('<tr>' + ''.join(f'<td data-label="{escape(c)}">{escape(v)}</td>' for c, v in zip(columns, row)) + '</tr>' for row in rows)
    return f'<h3>{escape(spec.get("title", ""))}</h3><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table><p class="caption">{escape(spec.get("note", ""))}</p>'


def numeric(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or value < 0:
        raise ValueError('chart values must be finite nonnegative numbers or null')
    return float(value)


def series_color(series: dict[str, object]) -> str:
    color = series.get('color', '#155a7a')
    if not isinstance(color, str) or len(color) != 7 or color[0] != '#' or any(c not in '0123456789abcdefABCDEF' for c in color[1:]):
        raise ValueError('series color must be #RRGGBB')
    return color


def chart(charts: dict[str, object], metric: str) -> str:
    milestones = objects(charts.get('milestones'), 'charts.milestones')
    series = objects(charts.get('series'), 'charts.series')
    if not milestones:
        return '<p>Validated cumulative chart unavailable for this pool.</p>'
    keys = [str(m['id']) for m in milestones]
    values = []
    for s in series:
        for p in objects(s.get('values'), 'series.values'):
            if p.get('milestone') not in keys:
                raise ValueError('chart point names an unknown milestone')
            v = numeric(p.get(metric))
            if v is not None:
                values.append(v)
    top = max(values, default=1) * 1.08 or 1
    x0, x1, y0, y1 = 70, 970, 25, 310
    xpos = {key: x0 + i * (x1 - x0) / max(1, len(keys) - 1) for i, key in enumerate(keys)}
    parts = [f'<svg viewBox="0 0 1000 430" role="img" aria-label="Cumulative {escape(metric)} by milestone; lower is faster">']
    for i in range(5):
        v = top * i / 4
        y = y1 - (y1-y0) * i / 4
        parts.append(f'<line x1="{x0}" x2="{x1}" y1="{y:.2f}" y2="{y:.2f}" stroke="#b6c8ce"/><text x="57" y="{y+5:.2f}" text-anchor="end" font-size="15">{v:,.0f}</text>')
    for index, (key, m) in enumerate(zip(keys, milestones)):
        x = xpos[key]
        parts.append(f'<text x="{x:.2f}" y="335" text-anchor="middle" font-size="14"><title>{escape(m["label"])}</title>{index+1 if index % 4 == 0 or index == len(keys)-1 else chr(183)}</text>')
    for s in series:
        color = series_color(s)
        by_key = {p['milestone']: p for p in objects(s.get('values'), 'series.values')}
        last = None
        for key in keys:
            p = by_key.get(key)
            val = numeric(p.get(metric)) if p else None
            if val is None:
                last = None
                continue
            x, y = xpos[key], y1 - (y1-y0) * val / top
            if last is not None:
                parts.append(f'<line x1="{last[0]:.2f}" y1="{last[1]:.2f}" x2="{x:.2f}" y2="{y:.2f}" stroke="{color}" stroke-width="3"/>')
            tip = f'{s["name"]}: {key}; {val:g}; reached {p.get("n", "?")}/{p.get("total", "?")}'
            parts.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="5" fill="{color}"><title>{escape(tip)}</title></circle>')
            last = (x,y)
    parts.append('</svg>')
    return ''.join(parts)


def render(data: dict[str, object], evidence: dict[str, object]) -> str:
    for field in ['title', 'snapshot', 'verdict', 'scope']:
        if not isinstance(data.get(field), str):
            raise ValueError(f'{field}: required text missing')
    charts = data.get('charts')
    if not isinstance(charts, dict):
        raise ValueError('charts: object required')
    kpis = ''.join(f'<div class="kpi"><span>{escape(k["label"])}</span><strong>{escape(k["value"])}</strong><small>{escape(k.get("note", ""))}</small></div>' for k in objects(data.get('kpis'), 'kpis'))
    series = objects(charts.get('series'), 'charts.series')
    legend = ''.join(f'<span><i style="background:{series_color(s)}"></i>{escape(s["name"])}</span>' for s in series)
    rows = []
    labels = {m['id']: m['label'] for m in objects(charts.get('milestones'), 'charts.milestones')}
    for s in series:
        for p in objects(s.get('values'), 'series.values'):
            rows.append([s['name'], labels[p['milestone']], p.get('turns'), p.get('activeMinutes'), f'{p.get("n", "?")}/{p.get("total", "?")}', f'{p.get("turnLow", "?")}–{p.get("turnHigh", "?")}'])
    chart_table = table({'title':'Precise cumulative values', 'columns':['Series','Checkpoint','Turns','Active minutes','Reached','Individual turn range'], 'rows':rows, 'note':'Survivor summaries are descriptive; the completer set can change at each checkpoint. Missing points break a line.'})
    checkpoint_options = ''.join(f'<option value="{escape(m["id"])}">{escape(m["label"])}</option>' for m in objects(charts.get('milestones'), 'charts.milestones'))
    chart_json = json.dumps(charts, ensure_ascii=False).replace('<', chr(92)+'u003c')
    sections = []
    for section in objects(data.get('sections'), 'sections'):
        ident = str(section.get('id', 'section'))
        if not all(c.isalnum() or c in '-_' for c in ident):
            raise ValueError('section id must be a simple identifier')
        content = [f'<section class="card" id="{ident}"><h2>{escape(section["title"])}</h2><p>{escape(section.get("intro", ""))}</p>']
        for para in section.get('paragraphs', []):
            content.append(f'<p>{escape(para)}</p>')
        if section.get('items'):
            content.append('<ul>'+''.join(f'<li>{escape(item)}</li>' for item in section['items'])+'</ul>')
        for spec in objects(section.get('tables', []), 'section.tables'):
            content.append(table(spec))
        for detail in objects(section.get('details', []), 'section.details'):
            content.append(f'<details><summary>{escape(detail["title"])}</summary><pre>{escape(detail["text"])}</pre></details>')
        content.append('</section>')
        sections.append(''.join(content))
    episodes = []
    for episode in objects(evidence.get('episodes'), 'evidence.episodes'):
        receipts = ''.join(f'<li>{escape(r)}</li>' for r in episode.get('receipts', []))
        episodes.append(f'<article class="episode"><p class="eyebrow">{escape(episode["model"])} · {escape(episode["classification"])}</p><h3>{escape(episode["title"])}</h3><p class="runid">{escape(episode["run"])}</p><p><b>Window:</b> {escape(episode["window"])}</p><p><b>Observed:</b> {escape(episode["observed"])}</p><p><b>Interpretation:</b> {escape(episode["interpretation"])}</p><p class="caption">{escape(episode["limitation"])}</p><details><summary>Event receipts</summary><ul>{receipts}</ul></details></article>')
    manifest = table({'title':'Frozen run manifest','columns':['Run / model','Arm / start','Pin / stop','Frontier','Turns / wall min','Notes'],'rows':[[f'{r["id"]} / {r["model"]}',f'{r["arm"]} / {r["start"]}',f'{r["pin"]} / {r["stop"]}',r['frontier'],f'{r["turns"]} / {r["minutes"]}',r.get('note','')] for r in objects(data.get('runs'), 'runs')],'note':'A moving-main exploratory series is not one frozen treatment. Full provenance is retained in the sidecars.'})
    references = ''.join(f'<li><b>{escape(r["label"])} — {escape(r["status"])}</b><br>{escape(r["note"])}</li>' for r in objects(data.get('references'), 'references'))
    caveats = ''.join(f'<li>{escape(c)}</li>' for c in data.get('caveats', []))
    reproducibility = ''.join(f'<li>{escape(r)}</li>' for r in data.get('reproducibility', []))
    appendix = escape(json.dumps(evidence, ensure_ascii=False, indent=2))
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{escape(data['title'])}</title><style>
*{{box-sizing:border-box}}body{{overflow-wrap:anywhere;margin:0;color:#15364b;background:#ddebf0;font:16px/1.55 system-ui,sans-serif}}main{{max-width:1240px;margin:auto;padding:22px}}h1{{font-size:clamp(23px,3.5vw,38px);line-height:1.25;margin:8px 0 14px}}h2{{font-size:24px;line-height:1.3}}h3{{font-size:18px}}p{{max-width:90ch}}.card{{background:#fff;border:2px solid #40657a;border-radius:12px;padding:24px;margin:22px 0;min-width:0}}.eyebrow{{text-transform:uppercase;font-weight:800;letter-spacing:.08em;font-size:12px}}.lead{{font-size:19px;font-weight:650}}.caption,small{{font-size:13px;color:#496273}}.kpis{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}}.kpi{{display:flex;flex-direction:column;border:2px solid #6b8fa0;background:#edf7ef;border-radius:8px;padding:12px}}.kpi strong{{font-size:25px;line-height:1.4}}.kpi span{{font-size:13px;font-weight:700}}.legend{{display:flex;flex-wrap:wrap;gap:10px 22px;font-size:13px}}.legend span{{display:inline-flex;align-items:center;gap:7px}}.legend i{{width:18px;height:6px;display:inline-block}}svg{{width:100%;height:auto;display:block;overflow:visible}}select{{font:inherit;padding:8px;border:2px solid #40657a;border-radius:5px;max-width:100%;background:white;color:#15364b}}table{{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;margin:14px 0}}th,td{{text-align:left;vertical-align:top;border-bottom:1px solid #c4d5dc;padding:9px;overflow-wrap:anywhere}}th{{background:#e5eef2}}details{{border:1px solid #a8bec8;border-radius:7px;margin:14px 0;padding:12px}}summary{{cursor:pointer;font-weight:700}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-height:650px;overflow:auto}}.episodes{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}}.episode{{border:1px solid #a8bec8;border-radius:8px;padding:18px;min-width:0}}.runid{{font-size:12px;overflow-wrap:anywhere}}li{{margin:8px 0}}a{{color:#035f98}}[hidden]{{display:none!important}}:focus-visible{{outline:3px solid #d47b11;outline-offset:3px}}
@media(max-width:650px){{main{{padding:10px}}.card{{padding:15px;margin:14px 0}}h2{{font-size:21px}}.lead{{font-size:17px}}.kpis{{gap:6px;grid-template-columns:1fr}}.kpi{{padding:8px;display:grid;grid-template-columns:1fr 1fr;align-items:center}}.kpi small{{display:none}}.scope{{display:none}}main section.card.journey h2{{margin-top:0!important}}main .kpis .kpi{{padding:6px 10px!important}}.kpi strong{{font-size:20px}}.kpi span,.kpi small{{font-size:11px}}.episodes{{grid-template-columns:1fr}}thead{{display:none}}table,tbody,tr,td{{display:block;width:100%}}tr{{border:1px solid #b7cbd3;margin:12px 0;border-radius:5px;padding:6px}}td{{display:grid;grid-template-columns:100px minmax(0,1fr);gap:10px;padding:7px;border:0}}td:before{{content:attr(data-label);font-weight:750;color:#34556a}}.legend{{font-size:12px;gap:8px}}}}
</style></head><body><main><header><p class="eyebrow">PokéBench field research · {escape(data['snapshot'])}</p><h1>{escape(data['title'])}</h1><p class="lead">{escape(data['verdict'])}</p><p class="caption scope">{escape(data['scope'])}</p></header><div class="kpis">{kpis}</div>
<section class="card journey"><h2>Journey through Hoenn</h2><p>All required checkpoints. Lower is faster; inspect exact values below.</p><label for="metric">Compare cumulative <select id="metric"><option value="turns">decision turns</option><option value="activeMinutes">active minutes</option></select></label><div id="chart-turns">{chart(charts,'turns')}</div><div id="chart-activeMinutes" hidden>{chart(charts,'activeMinutes')}</div><div class="legend">{legend}</div><p class="caption">On a phone, use the checkpoint readout below for legible exact values and reach counts. The full chart shows the overall shape; points summarize changing sets of completers.</p><label for="checkpoint">Inspect checkpoint <select id="checkpoint">{checkpoint_options}</select></label><div id="checkpoint-readout" aria-live="polite"></div><details><summary>Exact values and completion counts</summary>{chart_table}</details></section>
<section class="card"><h2>Read the badge case carefully</h2><ul>{caveats}</ul></section>
{''.join(sections)}<section class="card"><h2>Mistakes, loops and recoveries: trace cards</h2><p>Actions and game state support these episode judgments. A local interface recovery does not establish a successful strategy.</p><div class="episodes">{''.join(episodes)}</div></section>
<section class="card"><h2>Reference trainers</h2><ul>{references}</ul></section>
<section class="card"><h2>Run census and provenance</h2><details><summary>Open the complete frozen run manifest</summary>{manifest}</details><details><summary>Reproduce this report</summary><ul>{reproducibility}</ul></details><details><summary>Full evidence sidecar</summary><pre>{appendix}</pre></details></section>
<footer><p class="caption">A PokéBench execution measures a model, tools, harness and runtime together. It does not establish a general intelligence ranking.</p></footer></main>
<script type="application/json" id="chart-data">{chart_json}</script><script>const picker=document.getElementById('metric');picker.addEventListener('change',()=>{{for(const name of ['turns','activeMinutes'])document.getElementById('chart-'+name).hidden=name!==picker.value;}});const chartData=JSON.parse(document.getElementById('chart-data').textContent);const checkpoint=document.getElementById('checkpoint');const readout=document.getElementById('checkpoint-readout');function updateCheckpoint(){{readout.replaceChildren();const el=document.createElement('table');const head=document.createElement('thead');const header=document.createElement('tr');for(const label of ['Series','Turns','Active minutes','Reached','Individual turn range']){{const cell=document.createElement('th');cell.scope='col';cell.textContent=label;header.append(cell);}}head.append(header);el.append(head);const body=document.createElement('tbody');for(const series of chartData.series){{const point=series.values.find(p=>p.milestone===checkpoint.value);const row=document.createElement('tr');const fields=[['Series',series.name],['Turns',point?.turns??'N/A'],['Active minutes',point?.activeMinutes??'N/A'],['Reached',String(point?.n??0)+'/'+String(point?.total??'?')],['Individual turn range',point?.turnLow==null?'N/A':String(point.turnLow)+'–'+String(point.turnHigh)]];for(const [label,value] of fields){{const cell=document.createElement('td');cell.dataset.label=label;cell.textContent=String(value);row.append(cell);}}body.append(row);}}el.append(body);readout.append(el);}}checkpoint.addEventListener('change',updateCheckpoint);updateCheckpoint();</script></body></html>'''


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--metrics', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = render(load_object(args.metrics), load_object(args.evidence))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(result)
    print(args.output)


if __name__ == '__main__':
    main()
