# Demo video

The 2:34 submission video. HTML is the source of truth: `index.html` is a
[HyperFrames](https://www.npmjs.com/package/hyperframes) composition, and the MP4
is a build product.

```
raw/      Playwright screen recordings of the deployed app (.webm)
media/    the same takes, trimmed to the useful span (.mp4)
slots/    media/ cut to the scene windows in index.html   <- built, gitignored
audio/vo/ one .wav per narration line, as generated
audio/narration.mp3  the mixed voice track                <- built
fonts/    Inter + JetBrains Mono, subset to woff2
index.html   the composition
script.md    the narration, as recorded
design.md    colours and type, taken from the product's Tailwind tokens
```

## Rebuilding

```bash
./build-vo.sh          # audio/vo/*.wav  -> audio/narration.mp3 (+ prints the timing table)
./build-slots.sh       # media/*.mp4     -> slots/*.mp4
npx hyperframes check .                              # lint + runtime + layout + contrast
npx hyperframes snapshot --at 5,17,30,45,60,75,88,97,112,128,146 --no-end -o snapshots .
npx hyperframes render . --output patiently-demo.mp4
```

`slots/` and the MP4 are not committed — `slots/` is all-intra H.264 and runs to
~250 MB, past GitHub's file limit. Both regenerate from `media/` and `audio/vo/`,
which are committed.

## Three things that were not obvious

**The video is cut to the narration, not the other way round.** `build-vo.sh`
measures each recorded line and prints the timing table that `index.html` has to
match. Every earlier attempt guessed how long a sentence takes, and every guess
was wrong by two to four seconds a scene.

**Encode the footage all-intra.** The first cut of `slots/` had one keyframe at
t=0, so the renderer's seeks silently snapped back to it: scene 7 asked for the
frame with the approval dialog on screen and got the empty dashboard. Nothing
errored — the video was just quietly showing the wrong moment. `-g 1` fixes it,
at the cost of the file sizes above.

**Check frames with `hyperframes snapshot`, not a hand-rolled Playwright script.**
The runtime owns media playback; assigning `video.currentTime` from outside it
gets clobbered, and the screenshot comes back off by seconds with no warning.
That is what hid the keyframe bug for two rounds.

## Narration

Generated with Higgsfield `seed_audio`, preset voice
`30fc8796-ceb6-4a66-b3a7-4a145ef7f346`, one job per line.

Every line was transcribed back with Whisper and diffed against `script.md`.
This was not paranoia: line 03 came back as fluent-sounding nonsense five times
in a row, always on the clause ending `"...to her own agent, in Indonesian."`
Two of those bad takes were the *right length*, so duration alone would have
passed them straight into the cut. The line was reworded; `script.md` records
what was actually said.
