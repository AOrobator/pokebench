![PokéBench, harness engineering for long-horizon game agents](docs/images/pokebench-header.png)

# PokeBench

How far can a local vision-language model get in Pokémon Emerald when it is given a specialized harness?

- **Agent:** TypeScript on [pi](https://github.com/badlogic/pi-mono). It plays through an OpenAI-compatible model endpoint you configure (a local llama.cpp or vLLM server, or a gateway that reports each model's limits); there is no built-in one. See [Connect a model](docs/connect-a-model.md) for local servers, gateways, Hermes, Claude and Codex.
- **Environment:** a native mGBA build on Apple Silicon. It drives the [continual-harness](https://github.com/sethkarten/continual-harness) game server (the starter kit for the [PokéAgent Challenge](https://pokeagent.github.io/), a NeurIPS 2025 competition), vendored unmodified at a pinned commit.
- **Observability:** a viewer shows the live game, button presses, thinking traces and tool calls.

You supply the ROM, Pokémon Emerald (USA, Europe), SHA-1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7`. It is never committed. Keep it at `~/.roms/pokemon-emerald.gba` and set `POKEBENCH_ROM` to that path in the gitignored `.env`.

See `CLAUDE.md` for workflow and `docs/worklogs/` for history.

## About this repository

PokeBench is a research project. This is its public copy, published from a private working repository, with its full development history. Values such as `/Users/user`, `*.example` hosts and IDs beginning `00000000-` are placeholders. References to the local inference stack and to some other tooling point at private setups that are not included.

## Licence and notices

The project's own code and documentation are under the [MIT License](LICENSE). See `CITATION.cff` to cite it. Bundled fonts keep their own licence, listed in `packages/viewer/static/fonts/NOTICE.md`, and `env/vendor/continual-harness` is a separate project under its own licence.

The MIT License does not cover Pokémon names, game text, images or other game-derived material in this repository. Those belong to their respective owners and appear here for research purposes only. Pokémon is a trademark of Nintendo, Creatures Inc. and GAME FREAK inc. This project is not affiliated with or endorsed by them. No ROM is included.
