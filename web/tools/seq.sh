#!/bin/bash
# usage: tools/seq.sh "<query>" out_prefix frame1 frame2 ...
q="$1"; out="$2"; shift 2
files=()
for f in "$@"; do
  node tools/shot.mjs "http://localhost:5173/?still=$f&simdt=0.033&$q" "/tmp/claude-0/${out}_$f.png" 640 360 50 | grep -a "rror" | grep -v 404
  files+=("/tmp/claude-0/${out}_$f.png")
done
python3 - "$out" "${files[@]}" <<'PY'
import sys
from PIL import Image
out=sys.argv[1]; fs=sys.argv[2:]
ims=[Image.open(f) for f in fs]
cols=2; rows=(len(ims)+1)//2
c=Image.new('RGB',(640*cols,360*rows))
for i,im in enumerate(ims): c.paste(im,((i%cols)*640,(i//cols)*360))
c.save(f'/tmp/claude-0/{out}_grid.png')
PY
