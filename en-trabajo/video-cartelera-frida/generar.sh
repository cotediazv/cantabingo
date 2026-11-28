#!/bin/bash
# Video de la pantalla horizontal de Frida con la cartelera nueva (Code 2, 28 nov, pedido de Cote por Code 0).
# Uso: ./generar.sh <video original de frida-h> <carpeta de trabajo> '<filas lámina 1 en JSON>' '<filas lámina 2 en JSON>'
# El video original y las bases NO van al repositorio (pesan). Se baja de https://cantabingo.onrender.com/vertical/frida-h.mp4
set -e
ORIG="$1"; W="$2"; L1="$3"; L2="$4"; AQUI="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$W"; cd "$W"
# 1) cuadros base de las dos láminas (sin las letras viejas)
ffmpeg -v error -y -ss 78 -i "$ORIG" -frames:v 1 cart1.png
ffmpeg -v error -y -ss 105 -i "$ORIG" -frames:v 1 cart2.png
python3 "$AQUI/borrar.py"
# 2) láminas nuevas
node "$AQUI/lamina.js" "$W/l1.png" "$L1"
node "$AQUI/lamina.js" "$W/l2.png" "$L2"
# 3) se pegan en el lugar de las viejas (71,433–88,467 s y 100,133–120,233 s), todo lo demás igual
ffmpeg -v error -y -i "$ORIG" -loop 1 -t 17.033 -framerate 30 -i l1.png -loop 1 -t 20.1 -framerate 30 -i l2.png -filter_complex "\
[0:v]trim=0:71.433,setpts=PTS-STARTPTS,fps=30,scale=1280:720,setsar=1[a];\
[1:v]scale=1280:720,setsar=1,format=yuv420p[b];\
[0:v]trim=88.467:100.133,setpts=PTS-STARTPTS,fps=30,scale=1280:720,setsar=1[c];\
[2:v]scale=1280:720,setsar=1,format=yuv420p[d];\
[0:v]trim=120.233,setpts=PTS-STARTPTS,fps=30,scale=1280:720,setsar=1[e];\
[a][b][c][d][e]concat=n=5:v=1:a=0,format=yuv420p[v]" -map "[v]" -an -c:v libx264 -preset slow -crf 27 -maxrate 900k -bufsize 1800k -movflags +faststart frida-horizontal-cartelera.mp4
ls -la frida-horizontal-cartelera.mp4
