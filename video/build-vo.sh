#!/usr/bin/env bash
# audio/vo/NN.wav -> audio/narration.mp3, and print the timing table index.html must match.
#
# The video is audio-led: the narration is generated first, measured, and the
# scenes are then cut to it.  Doing it the other way round meant guessing how
# long a sentence takes, and every guess was wrong.
#
# Gaps are the silence BEFORE each line.  Line 7 (the approval gate) gets a
# longer one because the point needs a beat to land.
set -euo pipefail
cd "$(dirname "$0")"

GAPS=(0.5 0.6 0.65 0.6 0.6 0.6 1.0 0.6 0.6 0.75)
NAMES=(01 02 03 04 05 06 07 08 09 10)

t=0; inputs=(); filters=(); mixin=""
for i in "${!NAMES[@]}"; do
  n="${NAMES[$i]}"
  t=$(awk -v a="$t" -v g="${GAPS[$i]}" 'BEGIN{printf "%.3f", a+g}')
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "audio/vo/$n.wav")
  ms=$(awk -v x="$t" 'BEGIN{printf "%d", x*1000}')
  inputs+=(-i "audio/vo/$n.wav")
  filters+=("[$i:a]adelay=${ms}|${ms}[d$i];")
  mixin="${mixin}[d$i]"
  printf 'line %s  start %7.2f  dur %6.2f  end %7.2f\n' "$n" "$t" "$d" "$(awk -v a="$t" -v b="$d" 'BEGIN{printf "%.2f", a+b}')"
  t=$(awk -v a="$t" -v b="$d" 'BEGIN{printf "%.3f", a+b}')
done
echo "--- narration ends at ${t}s ---"

ffmpeg -nostdin -v error -y "${inputs[@]}" \
  -filter_complex "${filters[*]}${mixin}amix=inputs=${#NAMES[@]}:normalize=0:dropout_transition=0[m];[m]loudnorm=I=-16:TP=-1.5:LRA=11[o]" \
  -map "[o]" -c:a libmp3lame -b:a 192k -ar 48000 audio/narration.mp3
printf 'audio/narration.mp3  %.2fs\n' "$(ffprobe -v error -show_entries format=duration -of csv=p=0 audio/narration.mp3)"
