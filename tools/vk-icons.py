# Иконки для вкладки «Оформление» в кабинете ВК.
# Запуск: python tools/vk-icons.py   → ВК/оформление/*.png
# Источник — icon-512.png, та же иконка, что в PWA и в сторах: один танк во всех магазинах.
# Размеры диктует ВК: 576 универсальная, 278 каталог и сниппеты, 150 маленькая, 32 фавикон.
import os, sys
from PIL import Image

# консоль Windows отдаёт cp1251 и давится на «×» и кириллице в выводе
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'ВК', 'оформление')
os.makedirs(OUT, exist_ok=True)

src = Image.open(os.path.join(ROOT, 'icon-512.png')).convert('RGBA')

SIZES = [
    (576, 'icon-576.png', 'универсальная'),
    (278, 'icon-278.png', 'каталог и сниппеты'),
    (150, 'icon-150.png', 'маленькая, она же экран запуска'),
    (32,  'favicon-32.png', 'фавикон, лимит 50 КБ'),
]

for size, name, what in SIZES:
    img = src.resize((size, size), Image.LANCZOS)
    # ВК берёт JPG/PNG без прозрачности — кладём на тот же тёмный фон, что в самой иконке
    flat = Image.new('RGB', (size, size), (19, 23, 27))
    flat.paste(img, mask=img.split()[3])
    path = os.path.join(OUT, name)
    flat.save(path, 'PNG', optimize=True)
    print(f'{name:16} {size}×{size:<4} {os.path.getsize(path)/1024:6.1f} КБ   {what}')
