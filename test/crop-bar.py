from PIL import Image

im = Image.open("test/probe-brand.png")
crop = im.crop((0, 0, 780, 116))          # the header bar at 2x device pixels
crop = crop.resize((1170, 174), Image.LANCZOS)
crop.save("test/brand-bar.png")
print("wrote test/brand-bar.png", crop.size)
