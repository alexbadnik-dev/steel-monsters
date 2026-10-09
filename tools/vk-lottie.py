# Анимированная иконка для «Экрана запуска» в кабинете ВК.
# Запуск: python tools/vk-lottie.py [вариант] [куда.json]
#   по умолчанию: вариант «глаза» → ВК/оформление/launch-icon.json
# Требования ВК: Lottie JSON, 96×96, не больше 24 КБ.
# Рисуем тот же танк, что на иконке, вид сверху; цвета сняты пипеткой с icon-512.png,
# чтобы анимация и статичная иконка были одним и тем же танком.
#
# Варианты движения:
#   глаза — зрачки бегают из стороны в сторону, танк тихо дышит. Ствол неподвижен:
#           игра детская, 6+, и водящее стволом орудие на экране загрузки — лишнее.
#   круг  — танк медленно поворачивается кругом, как радар.
#   ствол — башня водит стволом; первый вариант, оставлен для сравнения.
import json, os, sys

try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VARIANT = sys.argv[1] if len(sys.argv) > 1 else 'глаза'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'ВК', 'оформление', 'launch-icon.json')
if VARIANT not in ('глаза', 'круг', 'ствол'):
    sys.exit('вариант: глаза | круг | ствол')

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

def layer(ind, name, shapes, rot=None, pos=None, scale=None):
    return {"ddd": 0, "ind": ind, "ty": 4, "nm": name, "sr": 1, "ao": 0,
            "ks": {"o": {"a": 0, "k": 100},
                   "r": rot or {"a": 0, "k": 0},
                   "p": pos or {"a": 0, "k": CENTR},
                   "a": {"a": 0, "k": [0, 0, 0]},
                   "s": scale or {"a": 0, "k": [MASHTAB, MASHTAB, 100]}},
            "shapes": shapes, "ip": 0, "op": DUR, "st": 0, "bm": 0}

# петли строим так, чтобы последний кадр совпадал с первым — иначе на стыке рывок
EASE_I, EASE_O = {"x": [0.4], "y": [1]}, {"x": [0.6], "y": [0]}

def tuda_syuda(a, b, key='s'):
    """Туда и обратно за петлю, с замедлением на краях."""
    return {"a": 1, "k": [
        {"t": 0,      key: list(a), "i": EASE_I, "o": EASE_O},
        {"t": DUR//2, key: list(b), "i": EASE_I, "o": EASE_O},
        {"t": DUR,    key: list(a)},
    ]}

SWEEP = tuda_syuda([-24], [24])                                  # ствол влево-вправо
KRUG  = {"a": 1, "k": [{"t": 0, "s": [0], "i": {"x": [0.5], "y": [0.5]},
                        "o": {"x": [0.5], "y": [0.5]}}, {"t": DUR, "s": [360]}]}
VZGLYAD = tuda_syuda([CENTR[0] - 3.5, CENTR[1], 0], [CENTR[0] + 3.5, CENTR[1], 0])
DYSHIT  = tuda_syuda([MASHTAB - 3, MASHTAB - 3, 100], [MASHTAB, MASHTAB, 100])

rot_vse  = KRUG if VARIANT == 'круг' else None                   # крутится весь танк
rot_stvl = SWEEP if VARIANT == 'ствол' else rot_vse
dyshit   = DYSHIT if VARIANT == 'глаза' else None
vzglyad  = VZGLYAD if VARIANT == 'глаза' else None

# в Lottie первая фигура в списке лежит СВЕРХУ, поэтому зрачки идут раньше белков
zrachki = layer(1, 'зрачки', [group([circle(7, (-6, -5)), circle(7, (10, -5))], ZRACHOK)],
                rot=rot_vse, pos=vzglyad, scale=dyshit)
belki   = layer(2, 'белки',  [group([circle(15, (-8, -7)), circle(15, (8, -7))], BELY)],
                rot=rot_vse, scale=dyshit)
bashnya = layer(3, 'башня', [
    group([rect((11, 40), (0, -26), 5)], TEMNY),
    group([circle(11, (0, -46))], ZOLOTO),
], rot=rot_stvl, scale=dyshit)
korpus = layer(4, 'корпус', [group([rect((36, 58), (0, 2), 13)], ZELEN)],
               rot=rot_vse, scale=dyshit)
guseni = layer(5, 'гусеницы', [
    group([rect((12, 58), (-17, 2), 5), rect((12, 58), (17, 2), 5)], TEMNY),
], rot=rot_vse, scale=dyshit)

doc = {"v": "5.7.4", "fr": FR, "ip": 0, "op": DUR, "w": 96, "h": 96,
       "nm": "zhestyanki-launch-" + VARIANT, "ddd": 0, "assets": [],
       "layers": [zrachki, belki, bashnya, korpus, guseni]}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(doc, f, separators=(',', ':'), ensure_ascii=False)

size = os.path.getsize(OUT)
print(f'{os.path.basename(OUT):22} вариант «{VARIANT}»  96x96  {size/1024:.1f} КБ '
      f'(лимит ВК 24 КБ) — {"ок" if size < 24*1024 else "СЛИШКОМ БОЛЬШОЙ"}')
