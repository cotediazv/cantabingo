# Borra solo las letras viejas de las láminas (flores, marco, logo y separadores quedan iguales)
from PIL import Image, ImageFilter
import numpy as np
for src, dst, rows in [('cart1.png', 'base3.png', [(338, 532), (578, 772), (813, 1008)]), ('cart2.png', 'base2.png', [(343, 602), (653, 907)])]:
    im = np.asarray(Image.open(src).convert('RGB')).astype(int); r, g, b = im[..., 0], im[..., 1], im[..., 2]
    blanco = (r > 120) & (g > 110) & (b > 100) & (abs(r - g) < 40) & (abs(g - b) < 45)
    rosa = (r > 150) & (b > 60) & (g < 120)
    zona = np.zeros(r.shape, bool); zonaw = np.zeros(r.shape, bool)
    for y0, y1 in rows:
        zona[y0:y1, 288:592] = True; zona[y0:y1, 662:1726] = True; zonaw[y0:y1, 1726:1752] = True
    t = (((blanco | rosa) & zona) | (blanco & zonaw))
    m = np.asarray(Image.fromarray((t * 255).astype('uint8')).filter(ImageFilter.MaxFilter(9))) > 0
    out = im.copy().astype(float); out[m] = [2, 2, 2]
    # donde la letra vieja tapaba flores (borde derecho), se rellena con lo que la rodea en vez de negro
    flor = m.copy(); flor[:, :1640] = False
    if flor.any():
        w = (~m).astype(float); img = im.astype(float) * w[..., None]
        for _ in range(6):
            wb = np.asarray(Image.fromarray((w * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(6))).astype(float) / 255
            ib = np.stack([np.asarray(Image.fromarray(np.clip(img[..., k], 0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(6))).astype(float) for k in range(3)], -1)
            rel = ib / np.maximum(wb[..., None], 1e-3)
            img = np.where(m[..., None], rel * np.minimum(wb[..., None] * 4, 1), img); w = np.maximum(w, np.minimum(wb * 4, 1))
        out[flor] = rel[flor]
    Image.fromarray(np.clip(out, 0, 255).astype('uint8')).save(dst)
