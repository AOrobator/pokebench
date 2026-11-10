# Operator-authorized run limits

On the post-Juan Opus Max run, the operator authorized 600 turns or two hours. A scheduler fallback was incorrectly translated into a local $40 API-equivalent stop. Update the existing launch and coordination skills to require independent recording of run authorization, shared reservations, and telemetry. Preflight checks the effective preset and supervisor before launch. This is prose only and does not modify any run.

Independent review caught that the launcher writes its own receipt after startup. Keep the preflight comparison in a separate durable receipt and include gateway and wrapper stops.

Landed at `f277fda77`. Both skills validated on main. Claude, GPT, and the distinct Astra fallback approved the frozen prose patch. Grok was unavailable and the standing operator waiver applied.
