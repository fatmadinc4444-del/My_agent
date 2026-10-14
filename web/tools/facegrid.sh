#!/bin/bash
# renders the face bench for several states into one grid
files=()
i=0
for q in "still=30" "still=34&say=Merhaba%20bug%C3%BCn%20nas%C4%B1ls%C4%B1n" "still=40&say=Pamuk%20%C3%A7ok%20uykulu" "still=30&emotion=happy" "still=30&emotion=sad" "still=30&emotion=surprised"; do
  node tools/shot.mjs "http://localhost:5173/?view=face&$q" /tmp/claude-0/fc_$i.png 420 420 10 | grep -a "face\]\|rror" | grep -v 404
  files+=(/tmp/claude-0/fc_$i.png); i=$((i+1))
done
python3 - "${files[@]}" <<'PY'
import sys
from PIL import Image
c=Image.new('RGB',(1260,840))
for i,f in enumerate(sys.argv[1:]): c.paste(Image.open(f),((i%3)*420,(i//3)*420))
c.save('/tmp/claude-0/fc_grid.png')
PY
