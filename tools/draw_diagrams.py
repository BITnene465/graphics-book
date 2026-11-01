"""生成教材原创 SVG 示意图。只用标准库；uv run python tools/draw_diagrams.py。"""
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'courses/graphics-foundations/modules'
GREEN, RED, BLUE, GRAY = '#386c50', '#c85f4e', '#507fac', '#9dad9d'


def text(x, y, value, color='#304b3b', size=19, anchor='start'):
    return f'<text x="{x}" y="{y}" fill="{color}" font-size="{size}" text-anchor="{anchor}">{escape(value)}</text>'


def line(x1, y1, x2, y2, color=GRAY, width=2, dash=False, arrow=False):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{width}"' + (' stroke-dasharray="7 6"' if dash else '') + (' marker-end="url(#arrow)"' if arrow else '') + '/>'


def dot(x, y, color=GREEN, r=6):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}" stroke="#fcfcf7" stroke-width="2"/>'


def polygon(points, color=GREEN, alpha=.12):
    return f'<polygon points="{" ".join(f"{x},{y}" for x,y in points)}" fill="{color}" fill-opacity="{alpha}" stroke="{color}" stroke-width="2"/>'


def save(chapter, name, title, body, height=390):
    folder = ROOT / chapter / 'figures'
    folder.mkdir(parents=True, exist_ok=True)
    content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 {height}" role="img" aria-labelledby="title">
<title id="title">{escape(title)}</title>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs>
<rect width="880" height="{height}" fill="#f5f7ee" rx="8"/>
<g font-family="system-ui, PingFang SC, sans-serif">{body}</g></svg>'''
    (folder / name).write_text(content)


# 01：像素显示范围、中心样本与面积内多个样本不是同一个对象。
b = text(54, 38, '一个显示区域，三种不同的量', size=23)
for offset, label, count in [(70, '像素显示范围', 0), (340, '中心取样 · 1 次', 1), (610, '子像素取样 · 16 次', 4)]:
    for i in range(4):
        b += line(offset + i*60, 100, offset+i*60, 280)
        b += line(offset, 100+i*60, offset+180, 100+i*60)
    b += polygon([(offset+60,160),(offset+120,160),(offset+120,220),(offset+60,220)], GREEN, .2)
    if count:
        for i in range(count):
            for j in range(count):
                b += dot(offset+60+(i+.5)*60/count, 160+(j+.5)*60/count, RED, 4 if count>1 else 7)
    b += text(offset+90, 326, label, anchor='middle', size=18)
    b += text(offset+90, 354, '几何面积' if not count else '场景在这些位置被求值', anchor='middle', size=15, color='#6c7e6e')
save('01-images-and-space/01-pixels','samples.svg','像素范围、中心采样与多重采样',b)

# 02：p=(1,0), R=逆时针90°, T=(2,0)，同一缩放比例的两个图。
b = text(54, 38, '同一个点，同两次操作，不同的顺序', size=23)
for origin, order, mid, end, formula in [(130,'先 R，再 T',(0,1),(2,1),'T R p = (2, 1)'),(565,'先 T，再 R',(3,0),(0,3),'R T p = (0, 3)')]:
    def at(p): return origin+p[0]*55, 275-p[1]*55
    b += line(origin-45,275,origin+200,275,arrow=True)+line(origin,300,origin,74,arrow=True)
    b += text(origin+198,299,'x',size=16)+text(origin-23,83,'y',size=16)
    p=at((1,0)); m=at(mid); e=at(end)
    b += line(*p,*m,GRAY,dash=True,arrow=True)+line(*m,*e,GREEN,3,arrow=True)
    b += dot(*p,BLUE)+dot(*m,GRAY)+dot(*e,GREEN)
    b += text(p[0]+9,p[1]+24,'p',BLUE,size=17)+text(e[0]+9,e[1]-10,'结果',GREEN,size=17)
    b += text(origin-45,330,order,size=19)+text(origin-45,360,formula,size=18)
save('01-images-and-space/02-transforms','order.svg','先旋转后平移与先平移后旋转',b)

# 03：把虚拟成像平面放到眼前，距离用正数 d=-z。
b = text(54,38,'相似三角形，把深度变成缩放',size=23)
b += line(100,270,800,270,arrow=True)+text(725,300,'d = −z',size=19)
b += line(120,300,120,74,arrow=True)+text(92,80,'y',size=19)
b += line(350,90,350,320,GREEN,3)+text(350,348,'虚拟成像平面 d = f',anchor='middle',size=18)
b += line(120,270,730,95,BLUE,2)+line(730,95,730,270,GRAY,dash=True)
b += polygon([(120,270),(350,270),(350,204)],GREEN,.13)
b += dot(120,270,GRAY)+text(85,324,'相机 O',size=18)
b += dot(730,95,BLUE)+text(718,75,'P = (x, y, −d)',BLUE,size=18)
b += dot(350,204,GREEN)+text(368,207,'y′',GREEN,size=21)
b += text(550,340,'y′ / f = y / d',size=23)+text(550,368,'y′ = f y / d',GREEN,size=23)
save('01-images-and-space/03-camera','projection.svg','虚拟成像平面与透视相似三角形',b,410)

# 04：固定手算场景 A(0,0),B(2,0),C(0,2),P(.5,.5)。
a,bb,c,p=(100,315),(420,315),(100,75),(180,255)
b = text(54,38,'对面面积，决定这个顶点的权重',size=23)
for pts,color in [([p,bb,c],RED),([p,c,a],GREEN),([p,a,bb],BLUE)]: b += polygon(pts,color,.2)
for point,label,color in [(a,'A',RED),(bb,'B',GREEN),(c,'C',BLUE),(p,'P',GREEN)]:
    b += dot(*point,color)+text(point[0]+10,point[1]-10,label,color,size=21)
b += text(505,120,'λA = S(PBC) / S(ABC) = 1/2',RED,size=20)
b += text(505,177,'λB = S(PCA) / S(ABC) = 1/4',GREEN,size=20)
b += text(505,234,'λC = S(PAB) / S(ABC) = 1/4',BLUE,size=20)
b += text(505,303,'权重之和 = 1',size=21)+text(100,358,'P = 0.5 A + 0.25 B + 0.25 C',size=20)
save('02-rasterization/04-barycentric','areas.svg','重心坐标的对面有向面积分解',b)
print('Generated 4 original SVG diagrams.')
