#!/usr/bin/env python3
"""Build the four Devpost thumbnail candidates.

Candidate A is the real product: a 2x-DPR screenshot of the live approval dialog,
captured by capture-thumb.mjs. Candidates B, C and D put the same text block over
Higgsfield artwork (Recraft V4.1, 3:2, 2k, brand palette) from gen/.

Writes cand-{A,B,C,D}.html; shootall.mjs renders them at 2x and downscales to
1800x1200, which is exactly 3:2 and well under Devpost's 5 MB cap.

Text is drawn here rather than generated because image models garble small UI
copy -- candidate B's own artwork contains "Respiratory' rate" and claims the
vitals were "recorded", which is the opposite of what this project does.
"""
import base64
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).parent
FONT_DIR = HERE.parent / "fonts"
WORK = HERE / "_work"


def b64(p: pathlib.Path) -> str:
    return base64.b64encode(p.read_bytes()).decode()


def font_faces() -> str:
    faces = "".join(
        f"@font-face{{font-family:Inter;font-style:normal;font-weight:{w};font-display:block;"
        f"src:url(data:font/woff2;base64,{b64(FONT_DIR / f'inter-{w}.woff2')}) format('woff2')}}"
        for w in (400, 600, 800)
    )
    return faces + (
        f"@font-face{{font-family:JBMono;font-weight:500;font-display:block;"
        f"src:url(data:font/woff2;base64,{b64(FONT_DIR / 'mono-500.woff2')}) format('woff2')}}"
    )


EYEBROW = "OpenAI WebMCP Challenge"
HEAD_W, HEAD_G = "A clinic your agent", "can actually use."
SUB = ("A working outpatient clinic as <b>20 WebMCP tools</b> — and every action "
       "that touches a patient's care stops and waits for a human click.")
STATS = [("20", "WebMCP tools"), ("4", "surfaces"), ("1", "click before anything is written")]
URL = "patiently-webmcp.vercel.app"

SHARED = """
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1800px;height:1200px}
body{font-family:Inter,system-ui,sans-serif;background:#0f172a;color:#f8fafc;
  overflow:hidden;position:relative}
.eyebrow{font-size:22px;font-weight:600;letter-spacing:.17em;text-transform:uppercase;color:#10b981}
h1 .g{color:#10b981}
.sub b{color:#f8fafc;font-weight:600}
.stat .n{font-weight:800;color:#10b981;line-height:1;font-variant-numeric:tabular-nums}
.stat .l{color:#94a3b8;line-height:1.3}
.url{font-family:JBMono,ui-monospace,monospace;font-weight:500;color:#10b981}
"""


def stats_html(n_size: int, l_size: int, gap: int, max_w: int) -> str:
    cells = "".join(
        f'<div class="stat"><div class="n" style="font-size:{n_size}px">{n}</div>'
        f'<div class="l" style="font-size:{l_size}px;max-width:{max_w}px;margin-top:9px">{l}</div></div>'
        for n, l in STATS
    )
    return f'<div class="stats" style="display:flex;gap:{gap}px">{cells}</div>'


def candidate_a() -> str:
    """Real product screenshot, set beside the copy rather than behind it."""
    dialog = b64(HERE / "dialog.png")
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
{font_faces()}{SHARED}
/* radial, not linear -- linear gradients band badly once this is re-encoded */
.glow{{position:absolute;inset:0;background:
  radial-gradient(1000px 720px at 6% -10%, rgba(16,185,129,.18), transparent 62%),
  radial-gradient(880px 680px at 102% 106%, rgba(14,130,101,.24), transparent 60%);}}
.wrap{{position:relative;height:100%;display:flex;align-items:center;gap:54px;padding:0 74px 0 90px}}
.left{{width:826px;flex:none}}
.eyebrow{{margin-bottom:24px}}
h1{{font-size:73px;font-weight:800;line-height:1.04;letter-spacing:-.034em;white-space:nowrap}}
h1 .g{{display:block}}
.sub{{margin-top:28px;font-size:28px;line-height:1.44;color:#94a3b8;max-width:770px}}
.stats{{margin-top:40px}}
.url{{margin-top:42px;font-size:23px}}
.right{{flex:1;display:flex;flex-direction:column;align-items:flex-start;gap:22px}}
.pin{{display:flex;align-items:center;gap:11px;background:#0c6b54;color:#fff;border-radius:999px;
  padding:14px 26px;font-size:23px;font-weight:600;box-shadow:0 16px 36px rgba(0,0,0,.42)}}
.pin i{{width:11px;height:11px;border-radius:999px;background:#6ee7b7;display:block}}
.shot{{width:100%;border-radius:24px;display:block;box-shadow:0 46px 100px rgba(0,0,0,.55);
  outline:1px solid rgba(226,232,240,.14);outline-offset:-1px}}
</style></head><body>
<div class="glow"></div>
<div class="wrap">
  <div class="left">
    <div class="eyebrow">{EYEBROW}</div>
    <h1>{HEAD_W}<span class="g">{HEAD_G}</span></h1>
    <div class="sub">{SUB}</div>
    {stats_html(56, 20, 52, 180)}
    <div class="url">{URL}</div>
  </div>
  <div class="right">
    <div class="pin"><i></i>The agent stops here</div>
    <img class="shot" src="data:image/png;base64,{dialog}">
  </div>
</div></body></html>"""


def candidate_over_art(src: pathlib.Path) -> str:
    """Higgsfield artwork with the copy scrimmed over the lower half."""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
{font_faces()}{SHARED}
.bg{{position:absolute;inset:0;background-image:url(data:image/png;base64,{b64(src)});
  background-size:cover;background-position:center}}
/* the art has to survive text on top of it, so scrim hard from the bottom */
.scrim{{position:absolute;inset:0;background:
  linear-gradient(to top, rgba(15,23,42,.985) 30%, rgba(15,23,42,.86) 46%,
    rgba(15,23,42,.18) 68%, rgba(15,23,42,0) 82%),
  linear-gradient(to right, rgba(15,23,42,.72) 0%, rgba(15,23,42,.10) 46%,
    rgba(15,23,42,0) 70%);}}
.pad{{position:absolute;left:86px;right:86px;bottom:74px}}
.eyebrow{{margin-bottom:20px}}
h1{{font-size:76px;font-weight:800;line-height:1.03;letter-spacing:-.034em;white-space:nowrap}}
.sub{{margin-top:22px;font-size:27px;line-height:1.42;color:#cbd5e1;max-width:1020px}}
.row{{margin-top:34px;display:flex;align-items:flex-end;justify-content:space-between}}
.url{{font-size:23px;padding-bottom:6px}}
</style></head><body>
<div class="bg"></div><div class="scrim"></div>
<div class="pad">
  <div class="eyebrow">{EYEBROW}</div>
  <h1>{HEAD_W} <span class="g">{HEAD_G}</span></h1>
  <div class="sub">{SUB}</div>
  <div class="row">{stats_html(52, 19, 50, 170)}<div class="url">{URL}</div></div>
</div></body></html>"""


def normalise(src: pathlib.Path, dst: pathlib.Path) -> None:
    """Higgsfield returns 2560x1664 (1.538:1); centre-crop to an exact 3:2."""
    subprocess.run([
        "ffmpeg", "-nostdin", "-v", "error", "-i", str(src),
        "-vf", "scale=1800:1200:force_original_aspect_ratio=increase,crop=1800:1200",
        "-y", str(dst),
    ], check=True)


def main() -> int:
    WORK.mkdir(exist_ok=True)
    (HERE / "cand-A.html").write_text(candidate_a())
    for tag, art in (("B", "g1"), ("C", "g4"), ("D", "g5")):
        src = HERE / "gen" / f"{art}.png"
        if not src.exists():
            print(f"missing {src} — rerun the Higgsfield batch", file=sys.stderr)
            return 1
        norm = WORK / f"{art}-3x2.png"
        normalise(src, norm)
        (HERE / f"cand-{tag}.html").write_text(candidate_over_art(norm))
    print("wrote cand-A.html cand-B.html cand-C.html cand-D.html")
    print("now: CHROME_PATH=... node shootall.mjs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
