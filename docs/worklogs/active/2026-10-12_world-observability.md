# World observability

Started 2026-10-12. Own checkout codex/world-observability, based on m5b 8c7bc6b. Scope authorized through navigation/observation sub-agent: consistent world grid, authoritative live player position/facing, complete map targets, and evidence-qualified press feedback. No solver, pathing, objectives or system prompt changes. Parent's uncommitted atomic observation/screen/state/serve/viewer fixes remain owned by parent and must be reconciled at integration. No landing authorization.

Source: pristine pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881; exact US ROM identity is existing f3ae088181bf583e55daf962a92bb46f4f1d07b7 contract. Existing proven globals gMapHeader/gObjectEvents/gPlayerAvatar are reused. Event layout struct offsets from global.fieldmap.h and field_control_avatar.c; no guessed symbol addresses. Targets are event definitions and live objects with scripts, conditional rather than a promise of availability. Arbitrary decorations are not targets. Coordinate triggers and warps activate by stepping; background events activate with A and kind-specific facing. Hidden-item/secret-base availability remains conditional.

RED: synthetic event-layout tests added before reader implementation; expected import failure. Gates/review/live evidence pending. Worklog required per commit.
