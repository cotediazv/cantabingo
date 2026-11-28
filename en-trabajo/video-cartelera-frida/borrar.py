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
    out = im.copy(); out[m] = [2, 2, 2]
    Image.fromarray(out.astype('uint8')).save(dst)
