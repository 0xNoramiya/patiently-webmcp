# Patiently — demo narration

Target ~2:25. Read plainly, unhurried. Full stops are pauses.

## 01 · Title (~12s)
A clinic gives each patient eight minutes. The doctor meets them cold, and writes
the note at six in the evening. Patiently hands that clinic to the agents people
already have.

## 02 · Front door (~10s)
This is the front door. Open it in ChatGPT's browser and it already has tools —
the page installs the runtime itself, so nothing needs enabling.

## 03 · Patient intake, Indonesian (16.2s)
A woman in the waiting room describes her symptoms to the agent on her own phone.
Chest tightness since this morning, spreading into her left arm. She isn't filling
in a form. She's talking, in her own language, to the assistant she already uses.

> Recorded as two takes joined by a 0.35s breath. The original opening clause
> ended on "...to her own agent, in Indonesian." and the voice model garbled every
> attempt at it — five takes came back as fluent-sounding nonsense. Whisper caught
> it; duration alone did not, because two of the bad takes were the right length.
> "Indonesian" is fine mid-sentence, which is why line 04 still says it.

## 04 · Triage escalates (~12s)
A separate triage classifier reads that same Indonesian message, and fires a
cardiac red flag. The queue reorders on the server. Her agent tells her to find
staff now.

## 05 · Clinician dashboard (~12s)
Across the clinic, the doctor's dashboard. Eleven tools, registered in the tab
she is already signed into. No API key. No second server holding a copy of the
clinic's login.

## 06 · The chart, fenced (~15s)
She asks for the chart. It is already written. The patient's own words come back
fenced — marked as data, never instructions — because someone could type anything
into that box, and it still has to reach the doctor.

## 07 · The gate (~21s)
Now she dictates the vitals. And the agent stops. This is the part that matters.
The tool's own execute call is parked on a promise that only a click resolves, so
the write does not exist on the un-approved branch. Not a rule the model is asked
to follow. A branch it cannot reach.

## 08 · Draft and sign (~14s)
It drafts the note and the prescriptions — unsigned, and screened for
interactions. Signing opens a second gate, and the interaction warning is shown
at the moment of signature, not buried in a panel somewhere.

## 09 · What it cannot do (~19s)
There is no tool that changes a queue priority. A patient can describe symptoms
honestly; they cannot argue their way to the front. And when the classifier is
unreachable, the chart says the screening did not run — rather than showing an
empty list that reads like an all-clear.

## 10 · Close (~10s)
Twenty WebMCP tools across four surfaces, all on document dot modelContext.
Everything a person is accountable for still waits for a person. Patiently.
