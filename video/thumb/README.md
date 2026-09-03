# Devpost thumbnail

`patiently-thumbnail.png` / `.jpg` — 1800x1200, exactly 3:2, well under the
5 MB cap. Use the JPG (196 KB) unless the PNG is wanted.

The frame tells the whole story: the clinician's chart running behind, dimmed
and set back in perspective, and the approval gate lit and square-on in front of
it. Agents do the work; the gate is the thing worth looking at.

Both screenshots are the real deployed app at 2x DPR. Nothing is generated
artwork — an earlier round used Higgsfield (Recraft V4.1) for the imagery and it
had to be dropped: the model rendered a convincing but fake clinical dialog
reading "Respiratory' rate" and titled "Vital signs recorded", which is the
exact opposite of what this project does. Generated UI text cannot be trusted to
say something true about the software it is advertising. Those rounds are in git
history at ea2c088.

## Rebuilding

```bash
export CHROME_PATH=~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome

node ../capture-thumb.mjs        # -> _dialog-vitals.png (opens the gate, shoots it, declines)
ffmpeg -i _dialog-vitals.png -vf "crop=1024:804:1408:676" -y dialog.png

node capture-hero.mjs            # -> hero-dash.png (read-only; selects a patient)

python3 build-hero.py            # -> cand-H.html
node shoothero.mjs H             # -> _cand-H@2x.png
ffmpeg -i _cand-H@2x.png -vf "scale=1800:1200:flags=lanczos" -y patiently-thumbnail.png
ffmpeg -i _cand-H@2x.png -vf "scale=1800:1200:flags=lanczos" -q:v 2 -y patiently-thumbnail.jpg
```

`capture-thumb.mjs` clicks **Decline** after photographing the dialog, so
generating the thumbnail never writes to the live demo data.

## One thing that will bite you again

The floor reflection's mask is authored upside-down on purpose. CSS applies a
mask to the element *before* its transform, so `scaleY(-1)` flips the fade along
with the pixels — writing the gradient the intuitive way put the opaque end at
the bottom and left legible mirrored text sitting in the dark.
