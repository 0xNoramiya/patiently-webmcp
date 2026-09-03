#!/usr/bin/env bash
# media/*.mp4 -> slots/*.mp4, cut to the scene windows in index.html.
#
# Three things happen here, and all three had to be learned the hard way.
#
# 1. SEEKING.  Every frame is a keyframe (-g 1).  The first cut of these files
#    had a single keyframe at t=0 and the renderer's seeks silently snapped back
#    to it -- scene 7 asked for the frame with the approval dialog on screen and
#    got the empty dashboard instead.  All-intra costs disk and buys exact seeks.
#
# 2. SLOWDOWN.  The scene windows are set by the narration, not by the footage,
#    so most clips are shorter than the slot they have to fill.  Rather than
#    freeze the last frame for nine seconds, each clip is slowed (up to MAXSLOW)
#    to cover the gap.  UI footage at 0.67x reads as deliberate, not broken.
#
# 3. FREEZE.  Whatever the slowdown cannot cover is held on the final frame.
#    Only scenes 3 and 4 need this, and index.html drifts the frame under them
#    so a held frame is never a dead one.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p slots
MAXSLOW=1.5

# name<TAB>slot seconds (must equal data-duration on the matching <video>)
while IFS=$'\t' read -r name dur; do
  src="media/$name.mp4"; out="slots/$name.mp4"
  raw=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
  ratio=$(awk -v d="$dur" -v r="$raw" -v m="$MAXSLOW" 'BEGIN{x=d/r; if(x<1)x=1; if(x>m)x=m; printf "%.5f", x}')
  ffmpeg -nostdin -v error -y -i "$src" \
    -vf "setpts=${ratio}*PTS,tpad=stop_mode=clone:stop_duration=60,fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2" \
    -t "$dur" \
    -c:v libx264 -preset slow -crf 16 -g 1 -keyint_min 1 -sc_threshold 0 \
    -pix_fmt yuv420p -movflags +faststart -an "$out"
  held=$(awk -v d="$dur" -v r="$raw" -v x="$ratio" 'BEGIN{h=d-r*x; if(h<0.01)h=0; printf "%.1f", h}')
  printf '%-32s %5.1fs  slow %sx  held %ss\n' "$out" "$dur" "$ratio" "$held"
done <<'SLOTS'
01-landing	10.4
02-patient-intake-id	16.8
03-patient-escalated	13.6
04-dashboard-queue	16.3
05-chart	14.4
06-vitals-gate	22.5
07-draft-and-sign	16.3
SLOTS
