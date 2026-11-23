"""review_sheet.py -- the owner's review of every rigged animal at once (README.md, "Review").
    blender -b --factory-startup --python-exit-code 1 --python art/blender/rigs/review_sheet.py -- \
        --out art/blender/rigs/.build/review/owner [--models public/models]

Writes into --out:
  owner_sheet.png   one row per animal (build order), one cell per clip from the game camera (orthographic, azimuth 45,
                    elevation 28.88) at the clip's fullest frame: the frame whose pose is furthest from the default pose
                    (a hold clip: its last frame, which the game holds)
  owner_<id>.gif    all of the animal's clips back to back from the game camera at 192 px, each labelled; a hold clip
                    holds its last frame 0.5 s
  owner_calls.png   one panel per owner style call: three renders of the moment it shows, what the rig does now, the
                    option and how it was settled (all eight under ruling R37; CALLS below; the numbers in {braces} are
                    measured here)
The animals come from rigs.json in --models; each is loaded once and framed by its own box over every clip, as
render_clips.py does (its helpers are imported). The duck floats: its ground is a water-blue plane at the waterline, y 0,
which hides the hull under it as the game's water does. About 10 minutes for the seven animals.
"""
import bpy
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import textwrap

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_clips as rc     # noqa: E402  (scene, ground, bounds, camera, shot, ffmpeg)

ORDER = ['dog', 'cat_sleeping', 'goat', 'chicken', 'duck', 'sheep', 'hare']
GAME = (45, 28.88)
CELL, GIF, PANEL = 200, 192, 280
HOLD = 15                     # frames a hold clip's last frame is held in the GIF (0.5 s)
FONT, FPS = rc.FONT, rc.FPS
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
LEGS = ['leg_FL_2', 'leg_FR_2', 'leg_BL_2', 'leg_BR_2']
SHEEP_BOX = ((-0.42, -0.5, 0.0), (0.42, 0.5, 0.78))   # Blender coords: one fixed frame for today's sheep and the rig

# Each call: a title, three cells and two captions. A cell: the animal (or 'static' for today's sheep.glb), the clip, the
# frame ('rest', 'fullest', 'last', 'lowest' / 'highest' (of the vertices of the bones in 'by', default head and jaw), 'touch' / 'touch+1' (the Walk
# key where a paw drops furthest, and the next), 'lift+1' (the key after a paw rises furthest)), the view (azimuth and
# elevation in the animal's own frame, 'game' for the game camera), and the focus: bones whose vertices fill the cell
# (one box per call and animal over its cells' frames, so a call's close-ups share a scale), None for the whole animal.
# Every call is settled (ruling R37, 2026-10-26: the owner saw the sheets): each is kept as built, the sheep's tris approved as a
# named exception; the owner can overturn any. `settled` says how, under the option.
KEPT = 'kept as built (R37); the owner can overturn it.'
CALLS = [
    dict(title='1  Walk touchdown snap and paw pop (R27; every quadruped walk: dog, goat, sheep)',
         cells=[dict(id='dog', clip='Walk', frame='touch', view=(90, 8), focus=LEGS, label='key {tf}: {dpaw} paw {drop} mm up'),
                dict(id='dog', clip='Walk', frame='touch+1', view=(90, 8), focus=LEGS, label='key {tf1}: planted'),
                dict(id='dog', clip='Walk', frame='lift+1', view=(90, 8), focus=LEGS, label='key {lf1}: {rpaw} paw up {rise} mm')],
         now='Each walk sets a paw down within one key (1/30 s): the dog\'s drops {drop} mm between two keys, and at swing '
             'start a paw lifts {rise} mm in one key (ruling R8 keeps every swinging foot 2 cm up). The step reads brisk, '
             'a little prancing. The pop check exempts the walks\' legs for this alone.',
         option='A gait rework for all the quadrupeds: ease each paw off and onto the ground over 2-3 keys. Your call: '
                'keep the brisk step, or fund the rework.',
         settled=KEPT),
    dict(title='2  A lower Graze (goat, sheep; R30, R34)',
         cells=[dict(id='goat', clip='Graze', frame='lowest', view=(90, 8), focus=None, label='goat Graze, side'),
                dict(id='sheep', clip='Graze', frame='lowest', view=(90, 8), focus=None, label='sheep Graze, side'),
                dict(id='goat', clip='Graze', frame='lowest', view='game', focus=None, label='goat Graze, game camera')],
         now='Graze reads as grazing at the game camera, but the nose stops about 8 cm (goat) and 7 cm (sheep) above the '
             'grass: neither neck bends further without tearing (stretch over 1.6x).',
         option='A kneeling graze (the front legs fold, as the dog lies down), or a neck and back weighting rework so the '
                'head reaches the grass.',
         settled=KEPT),
    dict(title='3  The sheep\'s 1,568 tris, over the 1,500 animal cap (R36)',
         cells=[dict(id='static', file='sheep.glb', view='game', label='today: sheep.glb (stand-in)'),
                dict(id='sheep', clip='Graze', frame='rest', view='game', focus='fixed', label='sheep_rig.glb, rest'),
                dict(id='sheep', clip='Graze', frame='rest', view=(90, 8), focus=None, label='sheep_rig.glb, side')],
         now='sheep_rig.glb is the Meshy sheep you picked (1,544 tris) plus 24 eyelid tris. The asset contract checks it '
             'against its source (+40) and against the animal cap, where it is approved as a named exception (R37). The '
             'game still draws today\'s stand-in (left, same scale): the rig is slimmer.',
         option='Add the sheep to your tris exception list (as the dog\'s 1,918), or ask for a lighter Meshy sheep (a new '
                'rig pass).',
         settled='approved as a named tris exception, sheep_meshy_sized 1,568 (R37); the owner can overturn it.'),
    dict(title='4  The hare\'s Groom stops at the chin and muzzle',
         cells=[dict(id='hare', clip='Groom', frame='rest', view=(20, 10), focus=['head', 'leg_FL_2', 'leg_FR_2'], label='rest'),
                dict(id='hare', clip='Groom', frame='highest', by=['leg_FL_2', 'leg_FR_2'], view=(20, 10), focus=['head', 'leg_FL_2', 'leg_FR_2'], label='Groom, top of a stroke'),
                dict(id='hare', clip='Groom', frame='highest', by=['leg_FL_2', 'leg_FR_2'], view=(90, 8), focus=['head', 'leg_FL_2', 'leg_FR_2'], label='the same, side')],
         now='The forepaws come within 8 mm of the face, but rub the underside of the chin and muzzle, about 7 cm below '
             'the eyes: the forelimbs are welded together and to the belly, and rise no higher without tearing.',
         option='A forelimb rework (the paws parted on the midline, a wrist bone, the belly strip re-cut) so the strokes '
                'reach up over the eyes.',
         settled=KEPT),
    dict(title='5  The cat\'s Peek amplitude',
         cells=[dict(id='cat_sleeping', clip='Peek', frame='rest', view=(0, 8), focus=None, label='rest, front (the porch)'),
                dict(id='cat_sleeping', clip='Peek', frame='fullest', view=(0, 8), focus=None, label='Peek, front'),
                dict(id='cat_sleeping', clip='Peek', frame='fullest', view='game', focus=None, label='Peek, game camera')],
         now='Peek lifts the head 15 deg and looks round 10 deg, inside the curl (the cat never leaves it).',
         option='A mid-head joint: a 20 deg lift and an 18 deg look (measured at 1.53x stretch, under the 1.6 limit).',
         settled=KEPT),
    dict(title='6  EarTwitch flinch strength (the cat)',
         cells=[dict(id='cat_sleeping', clip='EarTwitch', frame='rest', view=(0, 20), focus=['head', 'ear_L', 'ear_R'], label='rest, front'),
                dict(id='cat_sleeping', clip='EarTwitch', frame='fullest', view=(0, 20), focus=['head', 'ear_L', 'ear_R'], label='EarTwitch, front'),
                dict(id='cat_sleeping', clip='EarTwitch', frame='fullest', view='game', focus=['head', 'ear_L', 'ear_R'], label='EarTwitch, game camera')],
         now='The ear flicks out and back twice and the head flinches 7 deg away from it. The ear alone changes about 4 '
             'pixels of the 96 px game view; with the flinch about 50.',
         option='Ear only (no flinch: barely visible at game size), or a smaller flinch.',
         settled=KEPT),
    dict(title='7  The sheep\'s throat crease',
         cells=[dict(id='sheep', clip='Bleat', frame='rest', view=(30, 0), focus=['neck', 'jaw'], label='rest, throat'),
                dict(id='sheep', clip='Bleat', frame='fullest', view=(30, 0), focus=['neck', 'jaw'], label='Bleat, throat'),
                dict(id='sheep', clip='Bleat', frame='fullest', view='game', focus=None, label='Bleat, game camera')],
         now='Turning the Meshy sheep\'s head to face forward (R29) baked a crease into the fleece under the throat. It '
             'shows in close-ups at rest and when Bleat lifts the head; at the game camera it hides.',
         option='Re-bake the rest pose with a softer collar falloff, or accept it (it hides at game zoom).',
         settled=KEPT),
    dict(title='8  The dog\'s Scratch: the paw rests on the ear flap',
         cells=[dict(id='dog', clip='Scratch', frame='fullest', view=(90, 8), focus=['head', 'ear_L', 'leg_BL_2'], label='Scratch, left side'),
                dict(id='dog', clip='Scratch', frame='fullest', view=(135, 20), focus=['head', 'ear_L', 'leg_BL_2'], label='Scratch, back left'),
                dict(id='dog', clip='Scratch', frame='fullest', view='game', focus=None, label='Scratch, game camera')],
         now='The left hind paw comes up to 2.2 cm from the ear root, but passes into the ear flap (up to 21 mm), so it '
             'reads as resting on the ear more than scratching behind it.',
         option='A clearance floor: the paw strokes 1.5-3 cm behind the ear without entering it (a pose search with the '
                'ear as an obstacle).',
         settled=KEPT),
]


def args():
    a = sys.argv[sys.argv.index('--') + 1:]
    opts = dict(zip(a[::2], a[1::2]))
    if len(a) % 2 or '--out' not in opts or set(opts) - {'--out', '--models', '--only'}:
        raise SystemExit('usage: -- --out <dir> [--models <public/models>] [--only <id>,<id>]')
    only = opts['--only'].split(',') if '--only' in opts else None
    return opts['--out'], opts.get('--models', os.path.join(ROOT, 'public', 'models')), only


def water():
    """The duck's ground: the checker turned water blue (the duck floats with its hull 0.05 under y 0)."""
    a, b = (0.55, 0.70, 0.78, 1), (0.50, 0.65, 0.74, 1)
    bpy.data.images['checker'].pixels[:] = a + b + b + a


def coords(sc, mesh, f):
    sc.frame_set(f)
    ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    em = ev.to_mesh()
    out = [mesh.matrix_world @ v.co for v in em.vertices]
    ev.to_mesh_clear()
    return out


def verts_of(mesh, bones):
    """Indices of the vertices whose largest weight is on one of bones."""
    names = {g.index: g.name for g in mesh.vertex_groups}
    return [v.index for v in mesh.data.vertices if v.groups and names[max(v.groups, key=lambda g: g.weight).group] in bones]


def fullest(sc, arm, n, c):
    """The clip's frame furthest from the default pose (summed joint turn plus 10x the body's move); a hold's last frame."""
    if c['type'] == 'hold':
        return n
    best = (-1, 0)
    for f in range(n + 1):
        sc.frame_set(f)
        s = 0.0
        for pb in arm.pose.bones:
            a = pb.rotation_quaternion.angle
            s += min(a, 2 * math.pi - a) + 10 * pb.location.length
        best = max(best, (s, -f))
    return -best[1]


def legs_steps(sc, mesh, n):
    """For a walk: the key where a paw's lowest vertex drops furthest into the next, and where one rises furthest (m)."""
    sets = [verts_of(mesh, [leg]) for leg in LEGS]
    low = [[min(P[i].z for i in s) for s in sets if s] for P in (coords(sc, mesh, f) for f in range(n + 1))]
    drop = max((low[f][k] - low[f + 1][k], f, k) for f in range(n) for k in range(len(low[0])))
    rise = max((low[f + 1][k] - low[f][k], f, k) for f in range(n) for k in range(len(low[0])))
    return drop, rise


def frame_of(spec, sc, arm, mesh, n, c, by, meas, cache):
    if spec == 'rest':
        return 0, True
    if spec == 'last':
        return n, False
    if spec == 'fullest':
        return fullest(sc, arm, n, c), False
    if spec in ('lowest', 'highest'):
        idx = verts_of(mesh, by)
        hs = [(min if spec == 'lowest' else max)(P[i].z for i in idx) for P in (coords(sc, mesh, f) for f in range(n + 1))]
        return (min if spec == 'lowest' else max)(range(n + 1), key=lambda f: hs[f]), False
    if 'steps' not in cache:
        cache['steps'] = legs_steps(sc, mesh, n)
    (dv, df, dk), (rv, rf, rk) = cache['steps']
    paw = lambda k: {'FL': 'front left', 'FR': 'front right', 'BL': 'hind left', 'BR': 'hind right'}[LEGS[k][4:6]]
    meas.update(drop=round(dv * 1000), tf=df, tf1=df + 1, rise=round(rv * 1000), lf1=rf + 1, dpaw=paw(dk), rpaw=paw(rk))
    return {'touch': df, 'touch+1': df + 1, 'lift+1': rf + 1}[spec], False


def default_pose(arm):
    """Detach the action: the joints at their default (rest) TRS."""
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.location, pb.rotation_quaternion, pb.scale = (0, 0, 0), (1, 0, 0, 0), (1, 1, 1)
    bpy.context.view_layer.update()


def az_of(view, turn):
    return GAME if view == 'game' else (view[0] + turn, view[1])


def box(points, grow=1.15, least=0.08):
    lo = Vector(map(min, *points)) if len(points) > 1 else points[0].copy()
    hi = Vector(map(max, *points)) if len(points) > 1 else points[0].copy()
    c, h = (lo + hi) / 2, (hi - lo) / 2 * grow
    h = Vector([max(x, least / 2) for x in h])
    return c - h, c + h


def animal(models, id, entry, tmp, rows, gifs, shots, meas):
    sc, arm, mesh = rc.scene(os.path.join(models, entry['file']))
    gnd = rc.ground()
    if id == 'duck':
        water()
    turn = rc.TURN[entry['facing']]
    clips = [(name, round(c['duration'] * FPS), c) for name, c in entry['clips'].items()]
    lo, hi = rc.bounds(sc, arm, mesh, clips)
    speed = {name: c.get('stride', 0) / c['duration'] for name, n, c in clips}
    # the sheet's row
    rc.camera(sc, lo, hi, *GAME)
    cells = []
    for name, n, c in clips:
        arm.animation_data.action = bpy.data.actions[name]
        f = fullest(sc, arm, n, c)
        path = os.path.join(tmp, f'sheet_{id}_{name}.png')
        rc.shot(sc, gnd, speed[name], f, path, CELL)
        cells.append((path, f'{name}  ({c["type"]})'))
    rows.append((id, entry, cells))
    # the GIF: every clip back to back, labelled
    gdir = os.path.join(tmp, f'gif_{id}')
    os.makedirs(gdir)
    k, spans = 0, []
    for name, n, c in clips:
        arm.animation_data.action = bpy.data.actions[name]
        seq = list(range(n if c['type'] == 'loop' else n + 1)) + ([n] * HOLD if c['type'] == 'hold' else [])
        spans.append((name, k, k + len(seq) - 1))
        for f in seq:
            rc.shot(sc, gnd, speed[name], f, os.path.join(gdir, f'f_{k:04d}.png'), GIF)
            k += 1
    gifs.append((id, gdir, spans))
    # the style calls' cells for this animal
    for ci, call in enumerate(CALLS):
        mine = [(j, cell) for j, cell in enumerate(call['cells']) if cell['id'] == id]
        if not mine:
            continue
        cache, plan = {}, []
        for j, cell in mine:
            name = cell['clip']
            n, c = next((n, c) for nm, n, c in clips if nm == name)
            arm.animation_data.action = bpy.data.actions[name]
            f, rest = frame_of(cell['frame'], sc, arm, mesh, n, c, cell.get('by', ['head', 'jaw']), meas.setdefault(ci, {}), cache)
            plan.append((j, cell, name, f, rest))
        focus = {}
        for j, cell, name, f, rest in plan:     # one box per focus over the call's frames
            key = cell['focus'] if not isinstance(cell['focus'], list) else tuple(cell['focus'])
            if isinstance(cell['focus'], list):
                idx = verts_of(mesh, cell['focus'])
                if rest:
                    default_pose(arm)
                else:
                    arm.animation_data.action = bpy.data.actions[name]
                focus.setdefault(key, []).extend(coords(sc, mesh, f)[i] for i in idx)
        for j, cell, name, f, rest in plan:
            key = cell['focus'] if not isinstance(cell['focus'], list) else tuple(cell['focus'])
            if key is None:
                blo, bhi = lo, hi
            elif key == 'fixed':
                blo, bhi = Vector(SHEEP_BOX[0]), Vector(SHEEP_BOX[1])
            else:
                blo, bhi = box(focus[key])
            rc.camera(sc, blo, bhi, *az_of(cell['view'], turn))
            if rest:
                default_pose(arm)
            else:
                arm.animation_data.action = bpy.data.actions[name]
            path = os.path.join(tmp, f'call_{ci}_{j}.png')
            rc.shot(sc, gnd, 0.0 if rest else speed[name], f, path, PANEL)
            shots[(ci, j)] = path
    print(f'[review] {id}: {len(clips)} clips, {k} GIF frames')


def static(models, cell, path):
    """Today's model (no rig), from the game camera in the fixed sheep frame."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(models, cell['file']))
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light, sh.color_type, sh.show_shadows, sh.shadow_intensity = 'STUDIO', 'MATERIAL', True, 0.35
    sc.display.light_direction = (0.45, -0.35, 0.82)
    sc.view_settings.view_transform, sc.view_settings.exposure = 'Standard', 0.8
    sc.world = bpy.data.worlds.new('bg')
    sc.world.color = rc.BG
    for m in bpy.data.materials:     # workbench's material colour is the viewport colour: take the glTF base colour
        bsdf = m.node_tree and m.node_tree.nodes.get('Principled BSDF')
        if bsdf:
            m.diffuse_color = tuple(bsdf.inputs['Base Color'].default_value)
    gnd = rc.ground()
    rc.camera(sc, Vector(SHEEP_BOX[0]), Vector(SHEEP_BOX[1]), *GAME)
    rc.shot(sc, gnd, 0.0, 0, path, PANEL)


def write(path, text):
    with open(path, 'w') as f:
        f.write(text)
    return path


def sheet(rows, tmp, out):
    cols = max(len(cells) for _, _, cells in rows)
    blank = os.path.join(tmp, 'blank.png')
    rc.ffmpeg('-f', 'lavfi', '-i', f'color=c=white:s={CELL}x{CELL}', '-frames:v', '1', '-pix_fmt', 'rgba', blank)
    seq, labels = [], []
    for r, (id, entry, cells) in enumerate(rows):
        for c in range(cols):
            p = os.path.join(tmp, f'tile_{len(seq):03d}.png')
            shutil.copy(cells[c][0] if c < len(cells) else blank, p)
            seq.append(p)
            if c < len(cells):
                labels.append((r, c, cells[c][1]))
    left, top, pad = 210, 40, 4
    filt = [f'tile={cols}x{len(rows)}:padding={pad}:margin={pad}:color=white', f'pad=iw+{left}:ih+{top}:{left}:{top}:white',
            f"drawtext=fontfile={FONT}:fontsize=18:fontcolor=black:x=10:y=10:textfile={write(os.path.join(tmp, 'h.txt'), 'Animal rigs: every clip at its fullest frame, from the game camera (hold clips: the held last frame)')}"]
    for r, (id, entry, cells) in enumerate(rows):
        y = top + pad + r * (CELL + pad)
        src = entry['source']
        info = f'{len(cells)} clips\n{len(entry["bones"])} bones\nsource {src}'
        filt.append(f"drawtext=fontfile={FONT}:fontsize=17:fontcolor=black:x=10:y={y + 60}:textfile={write(os.path.join(tmp, f'r{r}.txt'), id)}")
        filt.append(f"drawtext=fontfile={FONT}:fontsize=12:fontcolor=0x555555:x=10:y={y + 86}:line_spacing=4:textfile={write(os.path.join(tmp, f'ri{r}.txt'), info)}")
    for r, c, lab in labels:
        x, y = left + pad + c * (CELL + pad) + 4, top + pad + r * (CELL + pad) + 4
        filt.append(f"drawtext=fontfile={FONT}:fontsize=12:fontcolor=black:box=1:boxcolor=white@0.75:boxborderw=3:x={x}:y={y}:textfile={write(os.path.join(tmp, f'l{r}_{c}.txt'), lab)}")
    rc.ffmpeg('-i', os.path.join(tmp, 'tile_%03d.png'), '-filter_script:v', write(os.path.join(tmp, 'sheet.txt'), ',\n'.join(filt)),
              '-frames:v', '1', os.path.join(out, 'owner_sheet.png'))


def gif(id, gdir, spans, tmp, out):
    filt = [f"drawtext=fontfile={FONT}:fontsize=12:fontcolor=black:box=1:boxcolor=white@0.75:boxborderw=3:x=4:y=4:"
            f"textfile={write(os.path.join(tmp, f'g_{id}_{name}.txt'), f'{id}  {name}')}:enable='between(n,{a},{b})'" for name, a, b in spans]
    filt.append('split[x][y];[x]palettegen=stats_mode=full[p];[y][p]paletteuse=dither=bayer:bayer_scale=4')
    rc.ffmpeg('-framerate', str(FPS), '-i', os.path.join(gdir, 'f_%04d.png'), '-filter_complex_script',
              write(os.path.join(tmp, f'gif_{id}.txt'), ',\n'.join(filt)), '-loop', '0', os.path.join(out, f'owner_{id}.gif'))


def calls(shots, meas, tmp, out):
    pad, title, cap = 6, 40, 150
    w, h = 3 * PANEL + 4 * pad, title + PANEL + cap + pad
    panels = []
    for ci, call in enumerate(CALLS):
        if any((ci, j) not in shots for j in range(3)):     # --only left an animal out
            continue
        m = meas.get(ci, {})
        filt = [f'[0][1][2]hstack=3,pad={w}:{h}:{pad}:{title}:white']
        for j in range(3):
            filt[-1] += f",drawtext=fontfile={FONT}:fontsize=13:fontcolor=black:box=1:boxcolor=white@0.8:boxborderw=3:" \
                        f"x={pad + j * PANEL + 4}:y={title + 4}:textfile={write(os.path.join(tmp, f'c{ci}_{j}.txt'), call['cells'][j]['label'].format(**m))}"
        filt[-1] += f",drawtext=fontfile={FONT}:fontsize=17:fontcolor=black:x={pad}:y=12:textfile={write(os.path.join(tmp, f't{ci}.txt'), call['title'])}"
        body = '\n'.join(textwrap.wrap('Now: ' + call['now'].format(**m), 100) + [''] + textwrap.wrap('Option: ' + call['option'], 100)
                         + textwrap.wrap('Settled: ' + call['settled'], 100))
        filt[-1] += f",drawtext=fontfile={FONT}:fontsize=13:fontcolor=0x222222:line_spacing=4:x={pad}:y={title + PANEL + 10}:textfile={write(os.path.join(tmp, f'b{ci}.txt'), body)}"
        p = os.path.join(tmp, f'panel_{ci}.png')
        ins = [x for j in range(3) for x in ('-i', shots[(ci, j)])]
        rc.ffmpeg(*ins, '-filter_complex', filt[0], '-frames:v', '1', p)
        panels.append(p)
    if len(panels) < 2:
        return
    ins = [x for p in panels for x in ('-i', p)]
    layout = '|'.join(f'{(k % 2) * (w + 10)}_{(k // 2) * (h + 10)}' for k in range(len(panels)))
    rc.ffmpeg(*ins, '-filter_complex', f'xstack=inputs={len(panels)}:layout={layout}:fill=white,pad=iw+20:ih+20:10:10:white',
              '-frames:v', '1', os.path.join(out, 'owner_calls.png'))


def main():
    out, models, only = args()
    os.makedirs(out, exist_ok=True)
    rigs = json.load(open(os.path.join(models, 'rigs.json')))['animals']
    tmp = tempfile.mkdtemp()
    rows, gifs, shots, meas = [], [], {}, {}
    for id in [i for i in ORDER if i in rigs] + sorted(set(rigs) - set(ORDER)):
        if only is None or id in only:
            animal(models, id, rigs[id], tmp, rows, gifs, shots, meas)
    for ci, call in enumerate(CALLS):
        for j, cell in enumerate(call['cells']):
            if cell['id'] == 'static' and only is None:
                shots[(ci, j)] = os.path.join(tmp, f'call_{ci}_{j}.png')
                static(models, cell, shots[(ci, j)])
    sheet(rows, tmp, out)
    for g in gifs:
        gif(*g, tmp, out)
    calls(shots, meas, tmp, out)
    shutil.rmtree(tmp)
    print(f'[review] {out}: owner_sheet.png ({len(rows)} rows), {len(gifs)} GIFs, owner_calls.png ({len(CALLS)} calls)')


if __name__ == '__main__':
    main()
