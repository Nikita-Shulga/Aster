"""Build the original angular A monogram. Pillow is a development dependency."""
from pathlib import Path
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
scale=4
im=Image.new('RGBA',(1024*scale,1024*scale))
d=ImageDraw.Draw(im)
d.rounded_rectangle((48*scale,48*scale,976*scale,976*scale),radius=216*scale,fill='#232725')
def polygon(points, color):
 d.polygon([(int((144+x*11.5)*scale),int((144+y*11.5)*scale)) for x,y in points],fill=color)
polygon([(8,54),(26,10),(34,10),(20,54)], '#f3f0e8')
polygon([(30,10),(38,10),(56,54),(44,54)], '#f3f0e8')
polygon([(22,36),(42,36),(46,45),(18,45)], '#c99746')
im=im.resize((1024,1024),Image.Resampling.LANCZOS)
im.save(ROOT/'assets/icon.png')
im.save(ROOT/'assets/icon.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
im.save(ROOT/'assets/icon.icns')
print('Built angular A monogram: PNG, ICO and ICNS')
