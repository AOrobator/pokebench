# Clickable explainer links

The operator requested clickable explainer links and a skill update after the prior report required copying an open command.

Updated the existing feature-explainer skill to require descriptive absolute-path Markdown links to retained canonical HTML artifacts. Terminal commands are only an explicitly requested or unavailable-link fallback. No new feature, runtime, benchmark source, serving process or frozen run configuration changed. Validation: skill-creator quick_validate and git diff --check. This is a narrow documentation correction, not a behavioral milestone or benchmark result.

## Expanded memory format explainer — operator approved

The operator approved landing after reviewing the expanded navigation-memory explainer. Existing skill link changes already landed in55e5a25; runtime navigation change already landed in2c46415. The local HTML at `/Users/user/dev/pokebench/runs/explainers/navigation-evidence-memory-v1.html` now includes the verbatim native probe navigation_context#93, section/retention semantics, run-local evidence IDs, optional destination-tool schema and labeled illustrative call, in-process storage and recorded-event wrapper. SHA256:4651c8dba7a59e5e3d4cb1d56ab2d197f459b82394e9430d5c0ae916475a7979. Exact payload checked against retained probe events. The HTML remains gitignored/local per the feature-explainer skill; this tracked receipt identifies its final reviewed version. No runtime, frozen experiment, model prompt or serving process changes.
