#!/usr/bin/env python3
"""Promotional hero thumbnail. 1800x1200 (3:2).

The story in one frame: the clinician's chart running behind, dimmed and set
back in perspective, and the approval gate lit and square-on in front of it.
The product does the work; the gate is the thing worth looking at.

Both screenshots are the real deployed app at 2x DPR (capture-hero.mjs and
capture-thumb.mjs). Nothing here is generated artwork.

Render with shoothero.mjs.
"""
import base64
import pathlib

HERE = pathlib.Path(__file__).parent
FONT_DIR = HERE.parent / "fonts"

HEAD_A = "Agents do the work."
HEAD_B = "A person signs it."
SUB = ("An outpatient clinic, exposed as <b>20 WebMCP tools</b> — and every action "
       "that touches patient care stops and waits for a human click.")
PILL = "OpenAI WebMCP Challenge"
URL = "patiently-webmcp.vercel.app"


def b64(p: pathlib.Path) -> str:
    return base64.b64encode(p.read_bytes()).decode()


def faces() -> str:
    out = "".join(
        f"@font-face{{font-family:Inter;font-style:normal;font-weight:{w};font-display:block;"
        f"src:url(data:font/woff2;base64,{b64(FONT_DIR / f'inter-{w}.woff2')}) format('woff2')}}"
        for w in (400, 500, 600, 700, 800)
    )
    return out + (
        f"@font-face{{font-family:JBMono;font-weight:500;font-display:block;"
        f"src:url(data:font/woff2;base64,{b64(FONT_DIR / 'mono-500.woff2')}) format('woff2')}}"
    )


def build() -> str:
    dash = b64(HERE / "hero-dash.png")
    dialog = b64(HERE / "dialog.png")
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
{faces()}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:1800px;height:1200px}}
body{{font-family:Inter,system-ui,sans-serif;background:#0a1220;color:#f8fafc;
  overflow:hidden;position:relative;-webkit-font-smoothing:antialiased}}

/* ground: cool ink, warmed by one emerald key light behind the gate */
.ground{{position:absolute;inset:0;background:
  radial-gradient(760px 620px at 62% 44%, rgba(52,211,153,.34), transparent 62%),
  radial-gradient(1500px 1000px at 74% 48%, rgba(16,185,129,.30), transparent 58%),
  radial-gradient(900px 700px at 6% 8%, rgba(14,130,101,.16), transparent 62%),
  linear-gradient(140deg,#04211a 0%,#08182a 42%,#0b1322 100%);}}
/* keeps the headline off the brightest part of the key light */
.scrimL{{position:absolute;inset:0;background:
  linear-gradient(to right, rgba(6,14,26,.90) 0%, rgba(6,14,26,.55) 34%, rgba(6,14,26,0) 56%);}}
.vig{{position:absolute;inset:0;box-shadow:inset 0 0 300px 90px rgba(4,10,20,.72)}}

.copy{{position:absolute;left:96px;top:50%;transform:translateY(-50%);width:652px;z-index:5}}
.pill{{display:inline-flex;align-items:center;gap:10px;border:1px solid rgba(16,185,129,.42);
  background:rgba(16,185,129,.10);border-radius:999px;padding:11px 21px;
  font-size:18px;font-weight:600;letter-spacing:.10em;text-transform:uppercase;color:#6ee7b7}}
.pill i{{width:10px;height:10px;border-radius:999px;background:#10b981;display:block;
  box-shadow:0 0 14px 3px rgba(16,185,129,.85)}}
h1{{margin:32px 0 0;font-size:64px;font-weight:800;line-height:1.08;
  letter-spacing:-.04em;white-space:nowrap;text-shadow:0 4px 30px rgba(0,0,0,.45)}}
h1 .g{{display:block;color:#34d399}}
.sub{{margin-top:26px;font-size:25px;line-height:1.52;color:#a9bbd0;max-width:640px}}
.sub b{{color:#f1f5f9;font-weight:600}}
.url{{margin-top:38px;font-family:JBMono,ui-monospace,monospace;font-weight:500;
  font-size:22px;color:#34d399}}

/* product cluster: chart set back and dimmed, gate forward and lit */
.stage{{position:absolute;right:-190px;top:50%;transform:translateY(-54%);
  width:1200px;height:960px;perspective:2300px;z-index:3}}
.dash{{position:absolute;right:0;top:20px;width:1150px;border-radius:20px;display:block;
  transform:rotateY(-20deg) rotateX(7deg);transform-origin:right center;
  filter:saturate(.72) brightness(.62) contrast(.95);
  box-shadow:0 70px 130px rgba(0,0,0,.62);
  border:1px solid rgba(226,232,240,.10)}}
.gatewrap{{position:absolute;left:-12px;top:190px;width:684px;
  transform:rotateY(-9deg) rotateX(3deg)}}
/* the emerald bloom sits behind the card, never over its text */
.gatewrap::before{{content:"";position:absolute;inset:-40px;border-radius:44px;
  background:radial-gradient(closest-side, rgba(16,185,129,.55), transparent 72%);
  filter:blur(26px);z-index:0}}
.gate{{position:relative;z-index:1;width:100%;border-radius:18px;display:block;
  box-shadow:0 46px 96px rgba(0,0,0,.66), 0 0 0 1px rgba(255,255,255,.10);}}
/* the mask is authored upside-down on purpose: CSS masks the element before
   the transform, so scaleY(-1) flips the fade along with the pixels */
.refl{{position:absolute;left:0;top:100%;margin-top:10px;width:100%;border-radius:18px;
  display:block;transform:scaleY(-1);opacity:.11;pointer-events:none;filter:blur(2.5px);
  -webkit-mask-image:linear-gradient(to bottom, transparent 62%, rgba(0,0,0,.95) 100%);
  mask-image:linear-gradient(to bottom, transparent 62%, rgba(0,0,0,.95) 100%)}}
.tag{{position:absolute;z-index:2;left:-30px;top:-64px;display:flex;align-items:center;gap:11px;
  background:#0e8265;color:#fff;border-radius:999px;padding:14px 26px;
  font-size:22px;font-weight:700;letter-spacing:-.01em;
  box-shadow:0 20px 44px rgba(0,0,0,.55)}}
.tag i{{width:11px;height:11px;border-radius:999px;background:#a7f3d0;display:block}}
</style></head><body>
<div class="ground"></div>
<div class="stage">
  <img class="dash" src="data:image/png;base64,{dash}">
  <div class="gatewrap">
    <div class="tag"><i></i>The agent stops here</div>
    <img class="gate" src="data:image/png;base64,{dialog}">
    <img class="refl" src="data:image/png;base64,{dialog}">
  </div>
</div>
<div class="scrimL"></div><div class="vig"></div>
<div class="copy">
  <div class="pill"><i></i>{PILL}</div>
  <h1>{HEAD_A}<span class="g">{HEAD_B}</span></h1>
  <div class="sub">{SUB}</div>
  <div class="url">{URL}</div>
</div>
</body></html>"""


if __name__ == "__main__":
    (HERE / "cand-H.html").write_text(build())
    print("wrote cand-H.html")
