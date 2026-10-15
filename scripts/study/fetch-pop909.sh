#!/bin/sh
# Fetches the POP909 dataset's MIDI files (909 pop songs: MELODY, BRIDGE, PIANO tracks) for private study.
# Usage: sh scripts/study/fetch-pop909.sh [outdir]   (default: study-data/pop909, git-ignored, never committed)
# Source: https://github.com/music-x-lab/POP909-Dataset (Wang et al., ISMIR 2020)
OUT=${1:-study-data/pop909}
mkdir -p "$OUT"
seq -f '%03g' 1 909 | xargs -P 16 -I{} sh -c "mkdir -p $OUT/{} && curl -sL -m 30 -o $OUT/{}/{}.mid https://raw.githubusercontent.com/music-x-lab/POP909-Dataset/master/POP909/{}/{}.mid"
ls "$OUT" | wc -l
