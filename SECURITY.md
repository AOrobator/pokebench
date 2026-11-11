# Security

PokeBench is a local research tool. It runs a game emulator, a game server, a viewer and a model client on your machine, and it reads your ROM and your model endpoint settings.

## What listens where

- **The game server** binds `127.0.0.1` only. The vendored server hardcodes `0.0.0.0`; PokeBench pins the host without modifying it. Each run starts its own server in its own folder, and a run accepts only an `http://127.0.0.1:<port>` server.
- **The viewer** binds `127.0.0.1:8790` and answers only loopback hosts plus the https origins you list in `POKEBENCH_VIEWER_ORIGINS`. If you publish it, put an authenticating proxy in front; the viewer has no accounts.
- **Local pages** from `just pages` bind `127.0.0.1:8791`.
- **Model endpoint files** (`POKEBENCH_ENDPOINT_FILE`) must name an `http://127.0.0.1:<port>` `base_url`; the harness refuses anything else, so an endpoint file never sends your key or game off this machine. A hosted API goes behind a proxy you run and point `POKEBENCH_GATEWAY_URL` at.

## Secrets and private files

- Keep keys and paths in the gitignored `.env`; `.env.example` holds placeholders only.
- The ROM is referenced by `POKEBENCH_ROM`, symlinked into each run and never copied or committed. The pre-commit hook refuses ROMs, saves and save states.
- Run folders (`runs/`) are gitignored. They hold screenshots, thinking traces and RAM snapshots of your play; check them before you share one.
- A downloaded release folder is untrusted. `just verify-release` reads it read-only, streams and hashes each file once, and extracts nothing.

## Report a vulnerability

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** (a private security advisory). Please do not open a public issue for it. Include what you found, how to reproduce it, and what it exposes. You will get an acknowledgement, and a fix or an explanation, in the advisory thread.
