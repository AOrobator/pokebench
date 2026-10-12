# PokeBench

How far can a local vision-language model get in Pokémon Emerald when it is given a specialized harness?

- **Agent:** TypeScript on [pi](https://github.com/badlogic/pi-mono). LLM access goes through the local-inference-stack gateway (`http://inference.example/v1`).
- **Environment:** a native mGBA build on Apple Silicon. It drives the [continual-harness](https://github.com/sethkarten/continual-harness) game server (the PokéAgent Challenge starter kit), vendored unmodified at a pinned commit.
- **Observability:** a viewer shows the live game, button presses, thinking traces and tool calls.

You supply the ROM, Pokémon Emerald (USA, Europe), SHA-1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7`. It is never committed. Keep it at `~/.roms/pokemon-emerald.gba` and set `POKEBENCH_ROM` to that path in the gitignored `.env`.

See `CLAUDE.md` for workflow and `docs/worklogs/` for history.
