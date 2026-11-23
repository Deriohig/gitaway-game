# fixtures.py -- the Blender half of the rig checker's fixtures (art/scripts/tests/fixtures/rigs, tests/rigs.test.mjs Part A).
#   blender -b --factory-startup --python fixtures.py -- --out <fixtures dir> --raw <scratch dir>      (run by fixtures.sh)
# A bar creature 0.4 u long facing +Z (glTF axes) with a JPEG atlas. --out gets source.glb (unrigged), each fixture's entry
# (<name>.json, the rigs.json schema), bad_slide.json and good.probe.json. --raw gets the rigged exports (<name>.glb) for
# rig-finalize.mjs and bad_lid.finalize.json. good: joints root, hips, neck, head, lid_L/R, leg_L/R_1/2; clips Idle (loop 1.0 s),
# Walk (loop 0.5 s, biped gait, stride measured here), Sit (hold 0.5 s), Wave (once 0.8 s). Each bad_* breaks one rule.
# Standalone on purpose (ruling R1): the checker's proof does not lean on the rig toolkit it later judges.
import bpy, json, math, os, sys
from mathutils import Matrix, Vector

FPS = 30
LIDS = ('lid_L', 'lid_R')
# glTF exporter settings, verified against bpy.ops.export_scene.gltf's RNA on Blender 5.2.3. keep_anim_armature=False drops
# the channels of bones no clip keys (root): its default True would write two constant keys for every bone in every clip
COMMON = dict(export_format='GLB', use_selection=True, export_yup=True, export_apply=False, export_image_format='AUTO',
              export_materials='EXPORT', export_cameras=False, export_lights=False, export_extras=False)
RIGGED = dict(export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_step=1,
              export_frame_range=False, export_optimize_animation_size=True, export_optimize_animation_keep_anim_armature=False,
              export_reset_pose_bones=True, export_rest_position_armature=True, export_def_bones=False, export_skins=True,
              export_influence_nb=4, export_morph=False)


def g2b(p): return Vector((p[0], -p[2], p[1]))     # glTF (Y up, +Z forward) -> Blender (Z up, -Y forward)
def b2g(v): return [v.x, v.z, -v.y]


def args():
    a = sys.argv[sys.argv.index('--') + 1:]
    return a[a.index('--out') + 1], a[a.index('--raw') + 1]


def bones(v):   # name, head, tail (glTF), parent
    s = -1 if v == 'bad_side' else 1    # bad_side: lid_L sits on the right (-X), lid_R on the left
    B = [('root', (0, 0, 0), (0, 0.05, 0), None),
         ('hips', (0, 0.17, -0.04), (0, 0.17, 0.06), 'root'),
         ('neck', (0, 0.17, 0.08), (0, 0.17, 0.14), 'hips'),
         ('head', (0, 0.17, 0.14), (0, 0.17, 0.2), 'neck'),
         ('lid_L', (s * 0.025, 0.197, 0.202), (s * 0.025, 0.197, 0.212), 'head'),
         ('lid_R', (-s * 0.025, 0.197, 0.202), (-s * 0.025, 0.197, 0.212), 'head')]
    for side, x in (('L', 0.03), ('R', -0.03)):
        B += [(f'leg_{side}_1', (x, 0.12, -0.04), (x, 0.06, -0.04), 'hips'), (f'leg_{side}_2', (x, 0.06, -0.04), (x, 0, -0.04), f'leg_{side}_1')]
    if v == 'bad_names':
        B.append(('ear.L', (0.03, 0.22, 0.17), (0.03, 0.26, 0.17), 'head'))    # a dot in a joint name
    return B


# ---- geometry (glTF coordinates): a body bar on two legs, eyelid caps on the face ----
def geometry(v, lids):
    V, W, F = [], [], []    # positions, {bone: weight} per vertex, (indices, uv quadrant) per face

    def vert(p, w):
        V.append(p); W.append(w); return len(V) - 1

    def face(ix, quad, out):    # wound so its normal points along `out` (the face centre minus its island's centre)
        P = [Vector(V[i]) for i in ix]
        if (P[1] - P[0]).cross(P[2] - P[1]).dot(out) < 0: ix = ix[::-1]
        F.append((ix, quad))

    # body: x +-0.05, y 0.12..0.22, rings every 0.04 along z; hips to z 0.08, neck at 0.12, head from 0.16 (bad_tear: on leg_L_2)
    head_bone = 'leg_L_2' if v == 'bad_tear' else 'head'
    zs = [round(-0.2 + 0.04 * i, 4) for i in range(11)]
    rings = []
    for z in zs:
        w = {'hips': 1.0} if z <= 0.08 else {'neck': 1.0} if z <= 0.12 else {head_bone: 1.0}
        rings.append([vert((x, y, z), w) for x, y in ((-0.05, 0.12), (0.05, 0.12), (0.05, 0.22), (-0.05, 0.22))])
    c = Vector((0, 0.17, 0))
    for r0, r1, z in zip(rings, rings[1:], zs):
        for k in range(4):
            ix = [r0[k], r0[(k + 1) % 4], r1[(k + 1) % 4], r1[k]]
            face(ix, 1 if z >= 0.12 else 0, sum((Vector(V[i]) for i in ix), Vector()) / 4 - c)
    face(rings[0], 0, Vector((0, 0, -1))); face(rings[-1], 1, Vector((0, 0, 1)))
    # legs: a 0.02 square post from y 0.13 (inside the body) to the knee at 0.06, then a point at the foot (y 0)
    for side, x in (('L', 0.03), ('R', -0.03)):
        top = [vert((x + dx, 0.13, -0.04 + dz), {f'leg_{side}_1': 1.0}) for dx, dz in ((-0.01, -0.01), (0.01, -0.01), (0.01, 0.01), (-0.01, 0.01))]
        knee = [vert((x + dx, 0.06, -0.04 + dz), {f'leg_{side}_1': 0.5, f'leg_{side}_2': 0.5}) for dx, dz in ((-0.01, -0.01), (0.01, -0.01), (0.01, 0.01), (-0.01, 0.01))]
        foot = vert((x, 0, -0.04), {f'leg_{side}_2': 1.0})
        lc = Vector((x, 0.07, -0.04))
        for k in range(4):
            for ix in ([top[k], top[(k + 1) % 4], knee[(k + 1) % 4], knee[k]], [knee[k], knee[(k + 1) % 4], foot]):
                face(ix, 2, sum((Vector(V[i]) for i in ix), Vector()) / len(ix) - lc)
        face(top, 2, Vector((0, 1, 0)))
    if lids:   # a 6-triangle cap over each painted eye, 0.002 proud of the face, weighted to its lid joint (hinge at the eye top)
        for name, head, _, _ in bones(v):
            if name not in LIDS: continue
            cx, cy = head[0], 0.185
            mid = vert((cx, cy, 0.202), {name: 1.0})
            rim = [vert((cx + 0.012 * math.cos(a), cy + 0.012 * math.sin(a), 0.202), {name: 1.0}) for a in (math.pi * k / 3 for k in range(6))]
            for k in range(6): face([mid, rim[k], rim[(k + 1) % 6]], 3, Vector((0, 0, 1)))
    return V, W, F


def make_atlas(path):   # 64 px, one block per part (body, head, legs, fur), checkered so the JPEG is not flat
    n, cols = 64, [(0.55, 0.35, 0.2), (0.8, 0.6, 0.4), (0.3, 0.2, 0.12), (0.7, 0.5, 0.3)]
    img, px = bpy.data.images.new('atlas_px', n, n), []
    for y in range(n):
        for x in range(n):
            q, k = (x >= n // 2) + 2 * (y >= n // 2), 0.08 * ((x // 4 + y // 4) % 2)
            px += [min(1.0, ch + k) for ch in cols[q]] + [1.0]
    img.pixels[:] = px
    img.file_format = 'JPEG'
    img.save(filepath=path, quality=90)
    bpy.data.images.remove(img)
    return bpy.data.images.load(path)


def reset():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.armatures, bpy.data.actions, bpy.data.materials):
        for d in list(coll): coll.remove(d)


def mesh_object(name, V, F, atlas):
    me = bpy.data.meshes.new(name)
    me.from_pydata([g2b(p) for p in V], [], [ix for ix, _ in F])
    uv = me.uv_layers.new(name='UVMap')
    corners = [(0.1, 0.1), (0.9, 0.1), (0.9, 0.9), (0.1, 0.9)]
    for poly, (_, q) in zip(me.polygons, F):
        for j, li in enumerate(poly.loop_indices):
            if q == 3: u = (0.75, 0.75)     # lid caps: one fur texel
            else: u = ((q % 2 + corners[j][0]) / 2, (q // 2 + corners[j][1]) / 2)
            uv.data[li].uv = u
    me.update()
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = atlas
    nt.links.new(tex.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def export(path, objs, **extra):
    for o in bpy.context.scene.objects: o.select_set(o in objs)
    bpy.ops.export_scene.gltf(filepath=path, **COMMON, **extra)


# ---- clips: pose functions of t -> {bone: {rot: [(axis, deg)...], loc: (x, y, z), scale: s}} in glTF axes ----
def gait(t, T, phase, A=20.0, K=70.0, stance=0.6):    # one leg: straight in stance (foot +A forward -> -A back), knee up in swing
    p = (t / T + phase) % 1.0
    if p <= stance: return A * (1 - 2 * p / stance), 0.0
    s = (p - stance) / (1 - stance)     # the knee snaps up and stays up, so every swing frame clears the stance band (+0.01)
    return -A * math.cos(math.pi * s), K * min(1.0, s / 0.08, (1 - s) / 0.08)


def idle(t):
    w = 2 * math.pi * t
    return {'hips': {'loc': (0, 0.004 * math.sin(w), 0)}, 'neck': {'rot': [((1, 0, 0), 4 * math.sin(w))]},
            'head': {'rot': [((0, 1, 0), 6 * math.sin(w + 1.0))]}}


def walk(t):
    P = {'neck': {'rot': [((1, 0, 0), 3 * math.sin(4 * math.pi * t / 0.5))]}}
    for side, ph in (('L', 0.0), ('R', 0.5)):
        a, k = gait(t, 0.5, ph)
        P[f'leg_{side}_1'] = {'rot': [((1, 0, 0), -a)]}    # -X rotation swings the foot forward (+Z)
        P[f'leg_{side}_2'] = {'rot': [((1, 0, 0), k)]}
    return P


def sit(t):
    e = min(1.0, t / 0.5); e = e * e * (3 - 2 * e)     # eases in over the whole 0.5 s
    P = {'hips': {'loc': (0, -0.03 * e, 0), 'rot': [((1, 0, 0), -15 * e)]}, 'neck': {'rot': [((1, 0, 0), 10 * e)]}}
    for side in 'LR': P[f'leg_{side}_1'] = {'rot': [((1, 0, 0), -50 * e)]}; P[f'leg_{side}_2'] = {'rot': [((1, 0, 0), 80 * e)]}
    return P


def wave(t):
    b = math.sin(math.pi * t / 0.8) ** 2
    return {'leg_R_1': {'rot': [((1, 0, 0), -45 * b)]}, 'leg_R_2': {'rot': [((1, 0, 0), 30 * b)]},
            'head': {'rot': [((0, 1, 0), 15 * math.sin(4 * math.pi * t / 0.8))]}}


CLIPS = [('Idle', 'loop', 1.0, idle), ('Walk', 'loop', 0.5, walk), ('Sit', 'hold', 0.5, sit), ('Wave', 'once', 0.8, wave)]


def set_pose(arm, P, keyed, frame=None):
    for pb in arm.pose.bones:
        if pb.name not in keyed: continue
        p, M = P.get(pb.name, {}), pb.bone.matrix_local.to_3x3()
        if pb.name in LIDS:     # open (scale 0) unless the clip closes it
            s = p.get('scale', 0.0); pb.scale = (s, s, s)
            if frame is not None: pb.keyframe_insert('scale', frame=frame)
            continue
        R = Matrix.Identity(3)
        for axis, deg in p.get('rot', []): R = Matrix.Rotation(math.radians(deg), 3, g2b(axis)) @ R
        pb.rotation_quaternion = (M.inverted() @ R @ M).to_quaternion()     # the rest-axes rotation about the bone's head
        if frame is not None: pb.keyframe_insert('rotation_quaternion', frame=frame)
        if pb.name in ('hips', 'root'):
            pb.location = M.inverted() @ g2b(p.get('loc', (0, 0, 0)))
            if frame is not None: pb.keyframe_insert('location', frame=frame)


def evaluated(ob, idx):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg); me = ev.to_mesh()
    out = [b2g(ob.matrix_world @ me.vertices[i].co) for i in idx]
    ev.to_mesh_clear()
    return out


def build(v, atlas, raw):
    """One rigged variant: mesh + armature + clips, exported to <raw>/<v>.glb. Returns its joint names, probe and Walk stride."""
    reset()
    sc = bpy.context.scene
    sc.render.fps, sc.render.fps_base = FPS, 1.0
    V, W, F = geometry(v, lids=True)
    ob = mesh_object(v, V, F, atlas)
    arm = bpy.data.objects.new('Armature', bpy.data.armatures.new('Armature'))
    sc.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for name, h, t, parent in bones(v):
        eb = arm.data.edit_bones.new(name); eb.head, eb.tail = g2b(h), g2b(t)
        if parent: eb.parent = arm.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for name, *_ in bones(v): ob.vertex_groups.new(name=name)
    for i, w in enumerate(W):
        for b, x in w.items(): ob.vertex_groups[b].add([i], x, 'REPLACE')
    ob.parent = arm
    ob.modifiers.new('Armature', 'ARMATURE').object = arm

    keyed = {n for n, *_ in bones(v)} - {'root', 'ear.L'}
    ad = arm.animation_data_create(); ad.use_nla = False
    set_pose(arm, {}, keyed)    # the default pose: rest, lids open (scale 0)
    lid_of = lambda i: max(W[i], key=W[i].get) in LIDS
    probe_ix = [i for i in range(len(V)) if not lid_of(i)]     # a lid cap collapses to a point, so it cannot be matched by position
    probe_ix = [probe_ix[round(k * (len(probe_ix) - 1) / 15)] for k in range(16)]
    feet = {s: min((i for i, w in enumerate(W) if max(w, key=w.get) == f'leg_{s}_2'), key=lambda i: V[i][1]) for s in 'LR'}
    probe = {'times': {}, 'points': [{'rest': p, 'posed': {}} for p in evaluated(ob, probe_ix)]}
    stride = None
    for name, _, dur, fn in CLIPS:
        act = bpy.data.actions.new(name); ad.action = act
        n = round(dur * FPS)
        for f in range(n + 1):
            P = fn(f / FPS)
            if v == 'bad_loop' and name == 'Idle' and f == n:     # Idle's last frame off: the neck 8 deg past its first
                P['neck']['rot'].append(((1, 0, 0), 8.0))
            set_pose(arm, P, keyed, f)
            if v == 'bad_rootmotion' and name == 'Idle':          # root keyed (Idle only): the drift the game would snap on
                set_pose(arm, {'root': {'loc': (0, 0, 0.02 * math.sin(2 * math.pi * f / n))}}, {'root'}, f)
        frames = [0, n // 2, n]
        probe['times'][name] = [round(f / FPS, 6) for f in frames]
        for f in frames:
            sc.frame_set(f)
            for pt, p in zip(probe['points'], evaluated(ob, probe_ix)): pt['posed'].setdefault(name, []).append(p)
        if name == 'Walk':      # mean backward foot speed over the stance frames (foot y <= its lowest + 0.01), x the duration
            speeds = []
            for s in 'LR':
                track = []
                for f in range(n + 1): sc.frame_set(f); track.append(evaluated(ob, [feet[s]])[0])
                lo = min(p[1] for p in track)
                st = [p[1] <= lo + 0.01 for p in track]
                vs = [-(track[k + 1][2] - track[k][2]) * FPS for k in range(n) if st[k] and st[k + 1]]
                speeds.append(sum(vs) / len(vs))
            stride = sum(speeds) / len(speeds) * dur
        tr = ad.nla_tracks.new(); tr.name = name
        tr.strips.new(name, 0, act)
        ad.action = None
        set_pose(arm, {}, keyed | {'root'})
    ad.use_nla = True
    sc.frame_set(0)
    export(os.path.join(raw, v + '.glb'), [ob, arm], **RIGGED)
    names = [n for n, *_ in bones(v)]
    for pt in probe['points']:
        pt['rest'] = [round(x, 6) for x in pt['rest']]
        pt['posed'] = {k: [[round(x, 6) for x in p] for p in ps] for k, ps in pt['posed'].items()}
    return names, probe, stride


def write_json(path, obj):
    with open(path, 'w') as f: f.write(json.dumps(obj, indent=2, sort_keys=True) + '\n')


def entry(file, names, stride):
    return {'file': file, 'source': 'source.glb', 'facing': '+Z', 'bones': names, 'live': ['head', 'neck', 'lid_L', 'lid_R'],
            'lids': list(LIDS), 'restChanged': [],
            'clips': {n: dict({'type': k, 'duration': d}, **({'stride': round(stride, 4)} if n == 'Walk' else {})) for n, k, d, _ in CLIPS}}


def main():
    out, raw = args()
    os.makedirs(out, exist_ok=True); os.makedirs(raw, exist_ok=True)
    atlas = make_atlas(os.path.join(raw, 'atlas.jpg'))
    reset()
    V, W, F = geometry('good', lids=False)
    export(os.path.join(out, 'source.glb'), [mesh_object('creature', V, F, atlas)], export_animations=False, export_skins=False)
    # from here on Blender re-encodes the atlas on export, as a real rig build may: rig-finalize.mjs must put the source bytes back
    atlas.pixels[0] = atlas.pixels[0]
    names, probe, stride = build('good', atlas, raw)
    write_json(os.path.join(out, 'good.json'), entry('good.glb', names, stride))
    write_json(os.path.join(out, 'good.probe.json'), probe)
    slide = entry('good.glb', names, stride); slide['clips']['Walk']['stride'] = round(2 * stride, 4)
    write_json(os.path.join(out, 'bad_slide.json'), slide)          # pairs with good.glb: the walk would slide its feet
    for v in ('bad_names', 'bad_loop', 'bad_rootmotion', 'bad_tear', 'bad_side'):
        n, _, _ = build(v, atlas, raw)
        write_json(os.path.join(out, v + '.json'), entry(v + '.glb', n, stride))
    # bad_lid and bad_atlas are good's export finalized wrongly (fixtures.sh): without its lids / without the source image
    write_json(os.path.join(out, 'bad_lid.json'), entry('bad_lid.glb', names, stride))
    write_json(os.path.join(raw, 'bad_lid.finalize.json'), dict(entry('bad_lid.glb', names, stride), lids=[]))
    write_json(os.path.join(out, 'bad_atlas.json'), entry('bad_atlas.glb', names, stride))
    print('FIXTURES stride %.4f' % stride)


main()
