"""render_clips.py -- review renders of one rigged animal (README.md has the workflow).
    blender -b --factory-startup --python-exit-code 1 --python art/blender/rigs/render_clips.py -- \
        --rig public/models/dog_rig.glb --out art/blender/rigs/.build/review [--pair Lie:Sleep ...]

Writes into --out:
  <id>_sheet.png      every clip at 6 evenly spaced frames, each row one view: front, left side, back right (orbit angles,
                      turned with the animal's facing) and the game camera (azimuth 45, elevation 28.88)
                      then, for each --pair A:B, two rows with A's last frame above B's first frame in those four views
                      (columns 1-4): a clip the game plays on from another's held end must start where it ends
  <id>_<clip>.gif     the clip from the game camera at 96 px (phone zoom) beside 192 px (desktop max zoom)
All views are orthographic and keep one framing per view across clips. Workbench renders them (studio light, the atlas,
shadows): about 0.5 s a frame against 12 s for EEVEE, measured on the dog. The ground is a 0.1 u checker; for a clip with
a stride (rigs.json next to the rig) it scrolls back at stride / duration, so a planted foot stays put on it. ffmpeg
(on PATH) labels the sheet and makes the GIFs (palettegen / paletteuse).
"""
import bpy
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile

from mathutils import Matrix, Vector

FPS = 30
VIEWS = [('front', 0, 8), ('left side', 90, 8), ('back right', -135, 24), ('game camera', 45, 28.88)]   # name, az, el
TURN = {'+Z': 0, '+X': 90}      # the orbit views turn with the animal's facing (rigs.json); the game camera stays put
CELL, GIF = 200, 192
BG = (0.93, 0.92, 0.88)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def g2b(p):
    return Vector((p[0], -p[2], p[1]))


def args():
    a = sys.argv[sys.argv.index('--') + 1:]
    out, pairs = {}, []
    for k, v in zip(a[::2], a[1::2]):
        if k == '--pair' and ':' in v:
            pairs.append(tuple(v.split(':', 1)))
        elif k in ('--rig', '--out') and k not in out:
            out[k] = v
        else:
            raise SystemExit('usage: -- --rig <id>_rig.glb --out <dir> [--pair <clip>:<clip> ...]')
    if len(a) % 2 or sorted(out) != ['--out', '--rig']:
        raise SystemExit('usage: -- --rig <id>_rig.glb --out <dir> [--pair <clip>:<clip> ...]')
    return out['--rig'], out['--out'], pairs


def scene(rig):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=rig)
    sc = bpy.context.scene
    arm = next(o for o in sc.objects if o.type == 'ARMATURE')
    mesh = next(o for o in sc.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers))
    for o in [o for o in sc.objects if o not in (arm, mesh)]:     # the importer's bone shapes
        bpy.data.objects.remove(o)
    bpy.context.view_layer.update()
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light, sh.color_type, sh.show_shadows, sh.shadow_intensity = 'STUDIO', 'TEXTURE', True, 0.35
    sc.display.light_direction = (0.45, -0.35, 0.82)
    sc.view_settings.view_transform, sc.view_settings.exposure = 'Standard', 0.8
    sc.world = bpy.data.worlds.new('bg')
    sc.world.color = BG
    sc.render.film_transparent = False
    sc.render.fps = FPS
    arm.animation_data_create().use_nla = False
    return sc, arm, mesh


def ground():
    """A 4 x 4 u plane at y 0 with a 0.1 u checker (one texel per square, nearest filtering)."""
    img = bpy.data.images.new('checker', 2, 2)
    a, b = (0.80, 0.78, 0.72, 1), (0.70, 0.68, 0.62, 1)
    img.pixels[:] = a + b + b + a
    me = bpy.data.meshes.new('ground')
    me.from_pydata([(-2, -2, 0), (2, -2, 0), (2, 2, 0), (-2, 2, 0)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new()
    for lp, c in zip(uv.data, ((0, 0), (20, 0), (20, 20), (0, 20))):
        lp.uv = c
    mat = bpy.data.materials.new('ground')
    mat.use_nodes = True
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image, tex.interpolation = img, 'Closest'
    mat.node_tree.links.new(tex.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    me.materials.append(mat)
    ob = bpy.data.objects.new('ground', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def bounds(sc, arm, mesh, clips):
    """World-space box of the animal over 6 frames of every clip."""
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for name, n, _ in clips:
        arm.animation_data.action = bpy.data.actions[name]
        for f in sorted({round(k * n / 5) for k in range(6)}):
            sc.frame_set(f)
            ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
            em = ev.to_mesh()
            for v in em.vertices:
                p = mesh.matrix_world @ v.co
                lo = Vector(map(min, lo, p))
                hi = Vector(map(max, hi, p))
            ev.to_mesh_clear()
    return lo, hi


def camera(sc, lo, hi, az, el):
    d = g2b((math.sin(math.radians(az)) * math.cos(math.radians(el)), math.sin(math.radians(el)),
             math.cos(math.radians(az)) * math.cos(math.radians(el))))
    z = d.normalized()
    x = Vector((0, 0, 1)).cross(z).normalized()
    y = z.cross(x)
    c = (lo + hi) / 2
    corners = [Vector((a, b, e)) for a in (lo.x, hi.x) for b in (lo.y, hi.y) for e in (lo.z, hi.z)]
    us, vs = [(p - c).dot(x) for p in corners], [(p - c).dot(y) for p in corners]
    c = c + x * (max(us) + min(us)) / 2 + y * (max(vs) + min(vs)) / 2
    cam = sc.camera or bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    if not sc.camera:
        sc.collection.objects.link(cam)
        sc.camera = cam
    cam.data.type, cam.data.clip_end = 'ORTHO', 50
    cam.data.ortho_scale = 1.12 * max(max(us) - min(us), max(vs) - min(vs))
    cam.matrix_world = Matrix.Translation(c + z * 10) @ Matrix((x, y, z)).transposed().to_4x4()


def shot(sc, gnd, speed, frame, path, size):
    sc.frame_set(frame)
    gnd.location.y = (speed * frame / FPS) % 0.2       # Blender +Y is glTF -Z: the ground runs back under the walk
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def ffmpeg(*a):
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *a], check=True)


def main():
    rig, out, pairs = args()
    os.makedirs(out, exist_ok=True)
    rigs = json.load(open(os.path.join(os.path.dirname(os.path.abspath(rig)), 'rigs.json')))
    id, entry = next((k, e) for k, e in rigs['animals'].items() if e['file'] == os.path.basename(rig))
    views = [(v, az + (TURN[entry['facing']] if v != 'game camera' else 0), el) for v, az, el in VIEWS]
    sc, arm, mesh = scene(rig)
    gnd = ground()
    clips = [(name, round(c['duration'] * FPS), c) for name, c in entry['clips'].items()]
    lo, hi = bounds(sc, arm, mesh, clips)
    tmp = tempfile.mkdtemp()
    cells, labels = [], []
    for name, n, c in clips:
        arm.animation_data.action = bpy.data.actions[name]
        speed = c.get('stride', 0) / c['duration']
        frames = [round(k * n / (6 if c['type'] == 'loop' else 5)) for k in range(6)]
        for view, az, el in views:
            camera(sc, lo, hi, az, el)
            labels.append(f'{name}  {view}')
            for f in frames:
                cells.append(os.path.join(tmp, f'cell_{len(cells):03d}.png'))
                shot(sc, gnd, speed, f, cells[-1], CELL)
        camera(sc, lo, hi, *views[-1][1:])
        hold = 15 if c['type'] == 'hold' else 0     # the game holds a hold clip's last frame
        seq = list(range(n if c['type'] == 'loop' else n + 1)) + [n] * hold
        gdir = os.path.join(tmp, name)
        os.makedirs(gdir)
        for k, f in enumerate(seq):
            shot(sc, gnd, speed, f, os.path.join(gdir, f'f_{k:03d}.png'), GIF)
        ffmpeg('-framerate', str(FPS), '-i', os.path.join(gdir, 'f_%03d.png'), '-filter_complex',
               f'[0]split[a][b];[a]scale=96:96:flags=lanczos,pad=96:{GIF}:0:{(GIF - 96) // 2}:color=white[s];'
               f'[s][b]hstack,split[x][y];[x]palettegen=stats_mode=full[p];[y][p]paletteuse=dither=bayer:bayer_scale=4',
               '-loop', '0', os.path.join(out, f'{id}_{name}.gif'))
    # pairs: A's last frame above B's first frame, one view per column, the last two columns blank
    blank = os.path.join(tmp, 'blank.png')
    ffmpeg('-f', 'lavfi', '-i', f'color=c=white:s={CELL}x{CELL}', '-frames:v', '1', '-pix_fmt', 'rgba', blank)   # as the cells
    by = {name: (n, c) for name, n, c in clips}
    for a, b in pairs:
        if a not in by or b not in by:
            raise SystemExit(f'--pair {a}:{b}: no such clip')
        for name, frame, lab in ((a, by[a][0], f'{a} last frame'), (b, 0, f'{b} first frame')):
            arm.animation_data.action = bpy.data.actions[name]
            labels.append(lab)
            for view, az, el in views:
                camera(sc, lo, hi, az, el)
                cells.append(os.path.join(tmp, f'cell_{len(cells):03d}.png'))
                shot(sc, gnd, 0.0, frame, cells[-1], CELL)
            for _ in range(6 - len(views)):
                cells.append(os.path.join(tmp, f'cell_{len(cells):03d}.png'))
                shutil.copy(blank, cells[-1])
    # the sheet: 6 columns, one row per clip x view; labels down the left and the frame times across the top
    left, top, pad = 190, 34, 4
    rows = len(cells) // 6
    filt = [f'tile=6x{rows}:padding={pad}:margin={pad}:color=white', f'pad=iw+{left}:ih+{top}:{left}:{top}:white']
    esc = lambda s: s.replace(':', r'\:').replace("'", '')
    for r, lab in enumerate(labels):
        filt.append(f"drawtext=fontfile={FONT}:fontsize=15:fontcolor=black:x=8:y={top + pad + r * (CELL + pad) + CELL // 2 - 8}:text='{esc(lab)}'")
    for k in range(6):
        filt.append(f"drawtext=fontfile={FONT}:fontsize=14:fontcolor=0x555555:x={left + pad + k * (CELL + pad) + 8}:y=10:text='frame {k + 1} of 6'")
    with open(os.path.join(tmp, 'sheet.txt'), 'w') as f:
        f.write(',\n'.join(filt))
    ffmpeg('-i', os.path.join(tmp, 'cell_%03d.png'), '-filter_script:v', os.path.join(tmp, 'sheet.txt'), '-frames:v', '1',
           os.path.join(out, f'{id}_sheet.png'))
    shutil.rmtree(tmp)
    print(f'[render] {id}: {out}/{id}_sheet.png ({rows} rows) and {len(clips)} GIFs')


if __name__ == '__main__':     # review_sheet.py imports the helpers above
    main()
