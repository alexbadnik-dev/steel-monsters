# Анимированная иконка для «Экрана запуска» в кабинете ВК.
# Запуск: python tools/vk-lottie.py   → ВК/оформление/launch-icon.json
# Требования ВК: Lottie JSON, 96×96, не больше 24 КБ.
# Рисуем тот же танк, что на иконке, вид сверху; башня медленно водит стволом
# из стороны в сторону — это и есть «состояние загрузки». Цвета сняты пипеткой
# с icon-512.png, чтобы анимация и статичная иконка были одним и тем же танком.
import json, os, sys

try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'ВК', 'оформление', 'launch-icon.json')

def rgb(h):
    h = h.lstrip('#')
    return [round(int(h[i:i+2], 16)/255, 4) for i in (0, 2, 4)] + [1]

ZELEN  = rgb('#6EDE8C')   # корпус
TEMNY  = rgb('#1F7A40')   # гусеницы и ствол
ZOLOTO = rgb('#FFD84D')   # дуло
BELY   = rgb('#FFFFFF')   # глаза
ZRACHOK= rgb('#14181C')   # зрачки

FR, DUR = 30, 60          # 30 кадров в секунду, петля на две секунды

def tr(p=(0, 0)):
    return {"ty": "tr", "p": {"a": 0, "k": list(p)}, "a": {"a": 0, "k": [0, 0]},
            "s": {"a": 0, "k": [100, 100]}, "r": {"a": 0, "k": 0},
            "o": {"a": 0, "k": 100}, "sk": {"a": 0, "k": 0}, "sa": {"a": 0, "k": 0}}

def rect(size, pos, radius):
    return {"ty": "rc", "d": 1, "s": {"a": 0, "k": list(size)},
            "p": {"a": 0, "k": list(pos)}, "r": {"a": 0, "k": radius}}

def circle(d, pos):
    return {"ty": "el", "d": 1, "s": {"a": 0, "k": [d, d]}, "p": {"a": 0, "k": list(pos)}}

def fill(color):
    return {"ty": "fl", "c": {"a": 0, "k": color}, "o": {"a": 0, "k": 100}, "r": 1}

def group(shapes, color):
    return {"ty": "gr", "it": shapes + [fill(color), tr()]}

# танк нарисован от середины корпуса, а ствол торчит вверх — поэтому середина
# рисунка смещена вверх; опускаем слой и ужимаем, иначе дуло срезает верхний край
CENTR, MASHTAB = [48, 58, 0], 95

def layer(ind, name, shapes, rot=None):
    r = {"a": 0, "k": 0} if rot is None else rot
    return {"ddd": 0, "ind": ind, "ty": 4, "nm": name, "sr": 1, "ao": 0,
            "ks": {"o": {"a": 0, "k": 100}, "r": r,
                   "p": {"a": 0, "k": CENTR}, "a": {"a": 0, "k": [0, 0, 0]},
                   "s": {"a": 0, "k": [MASHTAB, MASHTAB, 100]}},
            "shapes": shapes, "ip": 0, "op": DUR, "st": 0, "bm": 0}

# ствол ведёт влево-вправо и возвращается — петля без рывка на стыке
EASE_I, EASE_O = {"x": [0.4], "y": [1]}, {"x": [0.6], "y": [0]}
SWEEP = {"a": 1, "k": [
    {"t": 0,      "s": [-24], "i": EASE_I, "o": EASE_O},
    {"t": DUR//2, "s": [24],  "i": EASE_I, "o": EASE_O},
    {"t": DUR,    "s": [-24]},
]}

# в Lottie первая фигура в списке лежит СВЕРХУ, поэтому зрачки идут раньше белков
glaza  = layer(1, 'глаза', [
    group([circle(7, (-6, -5)),  circle(7, (10, -5))], ZRACHOK),
    group([circle(15, (-8, -7)), circle(15, (8, -7))], BELY),
])
bashnya = layer(2, 'башня', [
    group([rect((11, 40), (0, -26), 5)], TEMNY),
    group([circle(11, (0, -46))], ZOLOTO),
], rot=SWEEP)
korpus = layer(3, 'корпус', [group([rect((36, 58), (0, 2), 13)], ZELEN)])
guseni = layer(4, 'гусеницы', [
    group([rect((12, 58), (-17, 2), 5), rect((12, 58), (17, 2), 5)], TEMNY),
])

doc = {"v": "5.7.4", "fr": FR, "ip": 0, "op": DUR, "w": 96, "h": 96,
       "nm": "zhestyanki-launch", "ddd": 0, "assets": [],
       "layers": [glaza, bashnya, korpus, guseni]}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(doc, f, separators=(',', ':'), ensure_ascii=False)

size = os.path.getsize(OUT)
print(f'launch-icon.json  96x96  {size/1024:.1f} КБ  (лимит ВК 24 КБ) — {"ок" if size < 24*1024 else "СЛИШКОМ БОЛЬШОЙ"}')
