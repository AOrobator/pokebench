# Clickable explainer links

The operator requested clickable explainer links and a skill update after the prior report required copying an open command.

Updated the existing feature-explainer skill to require descriptive absolute-path Markdown links to retained canonical HTML artifacts. Terminal commands are only an explicitly requested or unavailable-link fallback. No new feature, runtime, benchmark source, serving process or frozen run configuration changed. Validation: skill-creator quick_validate and git diff --check. This is a narrow documentation correction, not a behavioral milestone or benchmark result.

## Expanded memory format explainer — operator approved

The operator approved landing after reviewing the expanded navigation-memory explainer. Existing skill link changes already landed in55e5a25; runtime navigation change already landed in2c46415. The local HTML at `/Users/user/dev/pokebench/runs/explainers/navigation-evidence-memory-v1.html` now includes the verbatim native probe navigation_context#93, section/retention semantics, run-local evidence IDs, optional destination-tool schema and labeled illustrative call, in-process storage and recorded-event wrapper. SHA256:4651c8dba7a59e5e3d4cb1d56ab2d197f459b82394e9430d5c0ae916475a7979. Exact payload checked against retained probe events. The HTML remains gitignored/local per the feature-explainer skill; this tracked receipt identifies its final reviewed version. No runtime, frozen experiment, model prompt or serving process changes.

## Tracked documentation correction

The operator explicitly required explainers to be preserved in Git. Copied all seven existing HTML explainers byte-for-byte into docs/explainers/ and added a local index. Kept ignored originals so existing links remain usable. Updated the skill to require tracked HTML, index entries and clickable canonical documentation links, plus actual interface formats grounded in source/recorded examples. Prior ignored-only storage instruction is superseded. No benchmark source/configuration/service changes. Validation: copy hashes, skill quick_validate, tracked-file/index checks and git diff --check.

## Project-thread delivery

The operator asked again why explainer reports lack clickable links. The chair thread (bbe91f8) added a SendUserFile delivery rule to the skill; this follow-up corrects its path, since SendUserFile adds a `-<timestamp>-<id>` suffix (ledge thread: `/mnt/project-files/ledge-hops-v1-20261014T190912-579b.html`), so replies must use the reported path. It merges the three delivery bullets into one rule (thread link plus attachment, absolute-path link elsewhere, `open` only as a fallback after the link) and adds the same rule to CLAUDE.md. COMMIT: `docs: require clickable explainer links in project threads` (0ae8b5e). Docs only; no code, runtime or configuration changed. Validation: git diff --check.
