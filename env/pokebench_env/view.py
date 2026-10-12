"""Owned spectator routes. The vendor viewer and emulator stay pristine."""

from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse, Response

from pokebench_env.audio import AudioTape, EmulatorLike, install_tap

BROWSER_MODULE = Path(__file__).resolve().parents[2] / "packages/agent/dist/spectator.js"

VIEW_HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>PokeBench spectator</title><style>
html,body { margin:0; width:100%; height:100%; overflow:hidden; background:#101014; color:#eee;
font:14px system-ui,sans-serif; } header {height:44px; display:flex; align-items:center;
gap:16px; padding:0 12px; box-sizing:border-box;} button {padding:6px 12px; cursor:pointer;}
#screen {position:absolute; top:44px; left:0; width:1920px; height:1080px;
transform-origin:top left;} iframe {width:100%; height:100%; border:0;}
</style></head><body><header><button id="audio" aria-pressed="false" disabled>Unmute audio</button>
<span>Live spectator · audio follows game speed (pitch changes; stale sound dropped)</span>
</header><div id="screen"><iframe src="/stream" title="Live game"></iframe></div>
<script type="module">
const button = document.getElementById('audio');
const screen = document.getElementById('screen');
function fit() {
  const scale = Math.min(innerWidth / 1920, Math.max(0, innerHeight - 44) / 1080);
  screen.style.transform = `scale(${scale})`;
}
addEventListener('resize', fit); fit();
try {
  const { AudioFollower } = await import('/spectator.js');
  let context;
  const follower = new AudioFollower({
    unlock: async () => {
      context ??= new AudioContext({sampleRate:48000});
      await context.resume();
      if (context.state !== 'running') throw new Error('Audio context blocked');
    },
    fetch: (url, options) => fetch(url, options),
    play: (pcm, rate) => {
      const buffer = context.createBuffer(2, pcm.length / 2, 48000);
      for (let channel = 0; channel < 2; ++channel) {
        const samples = buffer.getChannelData(channel);
        for (let i = 0; i < samples.length; ++i) samples[i] = pcm[i * 2 + channel] / 32768;
      }
      const source = context.createBufferSource();
      source.buffer = buffer; source.playbackRate.value = rate;
      source.connect(context.destination); source.start();
      return () => { source.stop(); source.disconnect(); };
    },
    status: text => {
      button.textContent = text;
      button.setAttribute('aria-pressed', String(!follower.muted));
    }
  });
  button.disabled = false;
  button.addEventListener('click', () => { void follower.toggle(); });
  const mute = () => { if (!follower.muted) void follower.toggle(); };
  addEventListener('pagehide', mute);
  document.addEventListener('visibilitychange', () => { if (document.hidden) mute(); });
} catch {
  button.textContent = 'Audio unavailable — run just build';
}
</script></body></html>"""


def install_spectator(app: FastAPI, emulator_class: type[EmulatorLike]) -> AudioTape:
    tape = AudioTape()
    install_tap(emulator_class, tape)

    @app.get("/audio.wav")
    def audio_wav(
        since: Annotated[int, Query(ge=-1)] = -1,
        max_frames: Annotated[int, Query(ge=1, le=12000)] = 12000,
    ) -> Response:
        segment = tape.segment(since, max_frames)
        return Response(
            segment.wav,
            media_type="audio/wav",
            headers={
                "Cache-Control": "no-store",
                "X-Audio-Next": str(segment.next_frame),
                "X-Audio-Skipped": str(segment.skipped),
                "X-Audio-Epoch": str(segment.epoch),
            },
        )

    @app.get("/view")
    def view() -> HTMLResponse:
        return HTMLResponse(VIEW_HTML, headers={"Cache-Control": "no-store"})

    @app.get("/spectator.js")
    def browser_module() -> Response:
        try:
            content = BROWSER_MODULE.read_bytes()
        except FileNotFoundError:
            return Response("Run just build before serving audio", status_code=503)
        return Response(
            content, media_type="text/javascript", headers={"Cache-Control": "no-store"}
        )

    return tape
