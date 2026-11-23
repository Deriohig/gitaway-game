"""common.py -- the rig toolkit the animal scripts share (art/blender/rigs/<id>.py; README.md has the workflow).

An animal script holds its landmarks and pose functions as data and ends with `common.run(sys.modules[__name__])`:
    blender -b --factory-startup --python-exit-code 1 --python art/blender/rigs/dog.py -- --source public/models/dog.glb --out <dir>
run() writes <dir>/<id>.glb (the raw export), <dir>/<id>.json (its rigs.json entry) and <dir>/<id>.probe.json (AR7's probe);
build.sh finalizes them (art/scripts/rig-finalize.mjs) into public/models/<id>_rig.glb and rigs.json.

What run() reads from the animal module (glTF coordinates throughout: Y up, metres of the source model):
    ID, FACING ('+Z' or '+X'), BONES [dict(name, head, tail, parent)], LIVE [bone names], REST_CHANGED [bone names, default []]
    LOOK dict(yaw, pitch, bones)                                     optional: rigs.json's look, the game's live-look clamp (R31)
    EYES {side: dict(top, centre, radius[, shift, dome])}, FUR_UV {side: (u, v)}, LID_SIDES
                                                                     optional: eyelid caps on lid_<side> (in BONES; add_lids)
    SKIN 'auto' | 'distance'                                         optional (default 'auto'): skin()'s method
    region(mesh) -> {bone: predicate}                                optional: skin()'s region (in_part, in_shell, in_reach
                                                                     build the predicates)
    TAPER {bone: f(glTF xyz) -> 0..1}                                optional: skin()'s taper
    JOINTS {bone: half width | (half width, normal)}                 optional: skin()'s joint ramps
    weights(mesh, arm)                                               optional: adjusts skin()'s weights (before the lids)
    rest(mesh, arm)                                                  optional: re-poses the default pose (apply_rest)
    clips(arm) -> [(name, kind, duration, pose_fn)]                  kind 'loop' | 'hold' | 'once'; a 'Walk' gets a stride

A pose function maps t (seconds) to {bone: dict(rot=(x, y, z), loc=(x, y, z), scale=s)}, every key optional:
    rot    degrees about the glTF axes as they lie at the default pose, relative to the parent bone; applied z (roll) first,
           then x (pitch), then y (yaw)
    loc    offset of the bone's head in glTF axes, in its parent's frame (each child of root, hips or the cat's spine, within
           0.05 in x and z and -0.20..+0.10 in y, rulings R15 and R19; root is never keyed, the game moves the object)
    scale  uniform; a lid_* bone is open at 0 (its default) and closed at 1, every other bone defaults to 1
merge() combines pose dicts, inflate() scales one bone alone (breathing), gait() poses the legs of a walk, fk() evaluates a
pose dict, reach() plants a leg on a point (two-bone IK under a posed body), ease() is the smoothstep of once / hold clips.
Feet(arm, mesh) holds what paw planting needs (each leg's ground point and skinned vertices): its held() turns the body about
the shoulders, planted() puts paws on targets without sinking them, ahead() and under() find ground targets for a posed leg,
lowest() / at() / points() measure how low a leg or any bones' vertices go (ruling R25: nothing sinks into the ground),
checked() wraps a clip so a final pose that still sinks is logged, and gait(..., feet=) keeps a walking paw's sole on the
ground.
Pose-function helpers moved out of the chicken and duck scripts (R33), which the goat, sheep and hare scripts use too: X, Y, Z
(the glTF axes), rot() and euler() (axis-angle matrix, matrix to a pose's rot), turn() (pitch, yaw, roll), pose() (matrices to
pose entries), bump() and ramp() (smooth envelopes), settle() and jerks() (a head that snaps and settles, from a spring `snap`),
in_plane() and in_wing() (skin() region predicates).
Bone names follow the plan: root, hips, spine, chest, neck, head, jaw, ear_L/R, lid_L/R, tail_1..3 (the dog's tail_1..4:
23 bones), leg_FL_1/2 (FR, BL, BR), leg_L_1/2 (birds), wing_L/R. skin() leaves root and lid_* unweighted; measure_stride()
reads the feet off leg_*_2.
"""
import bmesh
import bpy
import heapq
import json
import math
import os
import sys
from contextlib import contextmanager

from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

FPS = 30
QUADRUPED = {'BL': 0.0, 'FL': 0.25, 'BR': 0.5, 'FR': 0.75}    # gait phases
BIPED = {'L': 0.0, 'R': 0.5}
WELD = 1e-5      # vertices this close share their weights: UV seams and joined cut rings stay closed (AR4, ruling R9)
PROUD = 0.002    # eyelid caps float this far off the head
BLEND = 0.03     # a region bone's weight fades out over this distance beyond its region (skin)
LOOSE = 32       # loose shells up to this size (whiskers) take their root's final weights (skin, R23); AR4 uses the same
# glTF exporter settings, every name checked against bpy.ops.export_scene.gltf's RNA by export(). keep_anim_armature=False:
# a bone no clip keys (root) gets no channel at all (ruling R7); rest_position_armature: joint TRS = the default pose
EXPORT = dict(export_format='GLB', use_selection=True, export_yup=True, export_apply=False, export_image_format='AUTO',
              export_materials='EXPORT', export_cameras=False, export_lights=False, export_extras=False,
              export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_step=1,
              export_frame_range=False, export_optimize_animation_size=True,
              export_optimize_animation_keep_anim_armature=False, export_reset_pose_bones=True,
              export_rest_position_armature=True, export_def_bones=False, export_skins=True, export_influence_nb=4,
              export_morph=False)
FACING = {'+Z': Vector((0, 0, 1)), '+X': Vector((1, 0, 0))}
_G2B = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))


def g2b(p):
    """glTF (Y up, front +Z) -> Blender (Z up, front -Y)."""
    return Vector((p[0], -p[2], p[1]))


def b2g(v):
    return (v[0], v[2], -v[1])


def log(*a):
    print('[rig]', *a, flush=True)


def _select(objs, active):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


# ---- source and armature ----

def load_source(path, id):
    """A fresh scene holding the source GLB as one mesh object named `id`, transforms applied. Which source node each
    vertex came from is kept in mesh['parts'] for in_part()."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps, sc.render.fps_base = FPS, 1.0
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in sc.objects if o.type == 'MESH']
    for o in meshes:
        o.vertex_groups.new(name='_part_' + o.name).add(range(len(o.data.vertices)), 1.0, 'REPLACE')
    root = next(o for o in meshes if o.parent not in meshes)
    _select(meshes, root)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    mw = ob.matrix_world.copy()
    for o in [o for o in sc.objects if o is not ob]:
        bpy.data.objects.remove(o)
    bpy.context.view_layer.update()
    ob.parent = None
    ob.matrix_world = mw
    _select([ob], ob)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.name = ob.data.name = id
    groups = [g for g in ob.vertex_groups if g.name.startswith('_part_')]
    parts = {g.name[6:]: [] for g in groups}
    names = {g.index: g.name[6:] for g in groups}
    for v in ob.data.vertices:
        for ge in v.groups:
            if ge.group in names:
                parts[names[ge.group]].append(v.index)
    for g in groups:
        ob.vertex_groups.remove(g)
    ob['parts'] = parts
    _set_vertex_normals(ob.data, _vertex_normals(ob.data))
    return ob


def in_part(mesh, part, inset=0.0, outset=None, keep=False, near=None):
    """A skin() region predicate: True where a vertex of the source node `part` sits (the cut ring it shares counts). With
    `inset` > 0 the predicate holds only farther than inset u inside the part from its cut ring (where it meets another
    part), and its `blend(p)` covers the band from inset u inside the ring to `outset` u (default: inset) outside it: (where
    p lies across the band, 0 at its outer edge to 1 at its inner one; True if p is in the part) or None off the band.
    skin() then bends the joint across the band instead of at the ring. keep: across the band the rest of each vertex's
    weight stays on the bones it had there instead of going wholly to the bone's parent, so the band's outer edge meets
    the weights beyond it without a step (the cat's short neck, where the body under the head belongs to the chest).
    near (glTF): only the shell of the part holding the vertex nearest it counts as the part (in_shell's shell; the cat's
    Head node also holds a patch of its left shoulder)."""
    V = mesh.data.vertices
    ids = _shell(mesh, near, part) if near is not None else list(mesh['parts'][part])
    whole = _kdtree([V[i].co for i in ids])
    if inset <= 0:
        return lambda p: whole.find(g2b(p))[2] <= WELD
    outset = inset if outset is None else outset
    mine = set(ids)
    others = _kdtree([V[i].co for i in range(len(V)) if i not in mine])
    ring = _kdtree([V[i].co for i in ids if others.find(V[i].co)[2] <= WELD])

    def f(p):
        q = g2b(p)
        return whole.find(q)[2] <= WELD and ring.find(q)[2] > inset

    def blend(p):
        q = g2b(p)
        within = whole.find(q)[2] <= WELD
        s = ring.find(q)[2] * (1 if within else -1)
        if not -outset <= s < inset:
            return None
        return (s + outset) / (inset + outset), within

    f.blend, f.keep = blend, keep
    return f


def in_reach(mesh, tip, length, inset=0.0, outset=None, keep=False):
    """A skin() region predicate for a limb that only joins the rest of the mesh at its root (the cat's tail lying against its
    body, an ear moulded on a head): True within `length` u of the vertex nearest `tip` (glTF), walking the mesh's edges
    with coincident vertices joined, so a vertex that only touches the limb is never in it. With `inset` > 0 it holds only
    within length - inset, and its `blend(p)` covers length - inset .. length + `outset` (default: inset) as in_part's does,
    True for the part within `length`; keep as in_part."""
    V = mesh.data.vertices
    kd = _kdtree([v.co for v in V])
    adj = [set() for _ in V]
    for e in mesh.data.edges:
        a, b = e.vertices
        adj[a].add(b)
        adj[b].add(a)
    for v in V:
        for _, j, _ in kd.find_range(v.co, WELD):
            if j != v.index:
                adj[v.index].add(j)
                adj[j].add(v.index)
    start = kd.find(g2b(tip))[1]
    dist, todo = {start: 0.0}, [(0.0, start)]
    while todo:
        d, i = heapq.heappop(todo)
        if d > dist[i]:
            continue
        for j in sorted(adj[i]):
            nd = d + (V[i].co - V[j].co).length
            if nd < dist.get(j, math.inf):
                dist[j] = nd
                heapq.heappush(todo, (nd, j))
    geo = lambda p: dist.get(kd.find(g2b(p))[1], math.inf)
    outset = inset if outset is None else outset

    def f(p):
        return geo(p) < length - max(inset, 0.0)

    if inset > 0:
        def blend(p):
            d = geo(p)
            if not length - inset <= d < length + outset:
                return None
            return (length + outset - d) / (inset + outset), d < length

        f.blend, f.keep = blend, keep
    return f


def in_shell(mesh, near, part):
    """A skin() region predicate: True on the closed shell (vertices joined by edges, coincident ones counted as one) of the
    source node `part` that holds the vertex nearest `near` (glTF). A part moulded from several shells, such as an ear on a
    head, can then move rigidly with its own bone."""
    V = mesh.data.vertices
    shell = _kdtree([V[i].co for i in _shell(mesh, near, part)])
    return lambda p: shell.find(g2b(p))[2] <= WELD


def _shell(mesh, near, part):
    """The vertices of in_shell's shell."""
    V, ids = mesh.data.vertices, list(mesh['parts'][part])
    piece = _components(mesh.data, ids, weld=True)
    seed = piece[ids[_kdtree([V[i].co for i in ids]).find(g2b(near))[1]]]
    return [i for i in ids if piece[i] == seed]


def _components(me, ids=None, weld=False):
    """{vertex: its piece} over the vertices `ids` of mesh `me` (default all): joined by the edges between them and, with
    weld, by being within WELD of each other."""
    ids = list(range(len(me.vertices))) if ids is None else list(ids)
    mine, par = set(ids), {i: i for i in ids}

    def find(i):
        while par[i] != i:
            par[i] = par[par[i]]
            i = par[i]
        return i

    for e in me.edges:
        a, b = e.vertices
        if a in mine and b in mine:
            par[find(a)] = find(b)
    if weld:
        kd = _kdtree([me.vertices[i].co for i in ids])
        for i in ids:
            for _, j, _ in kd.find_range(me.vertices[i].co, WELD):
                par[find(ids[j])] = find(i)
    return {i: find(i) for i in ids}


def build_armature(mesh, bones):
    """An armature object 'rig' from [dict(name, head, tail, parent)] (glTF), parenting `mesh` with an Armature modifier."""
    arm = bpy.data.objects.new('rig', bpy.data.armatures.new('rig'))
    bpy.context.scene.collection.objects.link(arm)
    _select([arm], arm)
    bpy.ops.object.mode_set(mode='EDIT')
    for b in bones:
        eb = arm.data.edit_bones.new(b['name'])
        eb.head, eb.tail = g2b(b['head']), g2b(b['tail'])
    for b in bones:
        if b['parent']:
            arm.data.edit_bones[b['name']].parent = arm.data.edit_bones[b['parent']]
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    mesh.parent = arm
    mesh.modifiers.new('Armature', 'ARMATURE').object = arm
    return arm


# ---- weights ----

def skin(mesh, arm, method='auto', region=None, taper=None, joints=None):
    """Weights every vertex of `mesh` to at most 4 bones (root and lid_* get none).

    method 'auto' is Blender's automatic (bone heat) weights; a loose shell of at most LOOSE vertices it skips (whiskers)
    takes the weights of the nearest weighted vertex, and if any other vertex or a bone ends up without weight, it falls back
    to 'distance': inverse distance to each bone segment, smoothed twice over the mesh edges. Weights are solved on a welded copy
    (vertices within WELD merged, the inner caps of joined parts dropped) and copied to every vertex at that position, so
    coincident vertices (UV seams, cut rings) always move together.

    region {bone: predicate(glTF Vector) -> bool}: a vertex a predicate accepts is weighted only to that bone's subtree (the
    deepest such bone if several accept it). Outside its region a region bone's weight fades to nothing over BLEND u (so the
    joint at the region's edge bends smoothly) and the bones below it weigh nothing, except inside a region of their own.
    A predicate from in_part(..., inset) or in_reach(..., inset) blends instead: across the band its `blend(p)` gives, the
    bone's share rises smoothly from 0 to 1 (shared with its subtree as bone heat has them) and its parent takes the rest (bone
    heat also hands the legs some of the dog's throat and tail root, which this keeps off them), or with `keep` the bones the
    vertex had besides. A band also applies inside the region of an ancestor of its bone (an ear's band in the head; where
    the two overlap the outer band rules). Bands of unrelated bones that overlap (two legs' in the crotch) take together the
    larger of their shares, split in proportion, so the body's weight does not step twice as fast where both fade.

    taper {bone: f(glTF Vector) -> 0..1}: the bone keeps f of its bone-heat weight (before the rules above) and its nearest
    untapered ancestor takes the rest; a smooth f keeps neighbouring vertices alike (the dog's neck, kept off its bib).

    joints {bone: h}: after the rules above, the bone and its parent split the weight the two hold at each vertex along a
    smoothstep ramp across the plane through the bone's head, square to the mean of the two bones' directions, from all
    parent h u on the parent's side to all bone h u on the bone's (bone heat bends a knee across a single edge of a low-poly
    leg; the ramp spreads it, and a tail bends in a curve instead of kinking at each joint). {bone: (h, normal)} sets the
    plane square to `normal` (glTF) instead: the goat's neck leaves its base nearly level, so the mean direction would stand
    the plane upright and hand the neck the whole bib in front of it; tilted up, the ramp crosses the neck's root.

    Last, each loose shell of at most LOOSE vertices (whiskers) takes, whole, the final weights of its root, the nearest vertex
    of the rest of the mesh, unless its bones dominate nothing else (ruling R23; _glue_loose)."""
    region, taper = region or {}, taper or {}
    bones = arm.data.bones
    weighted = [b.name for b in bones if b.name != 'root' and not b.name.startswith('lid_')]
    wob, wmap = _welded_copy(mesh)
    W = _heat_weights(wob, arm, weighted) if method == 'auto' else None
    if W is None:
        if method == 'auto':
            log('automatic weights failed; using distance weights')
        W = _distance_weights(wob.data, arm, weighted)
    depth = {b.name: len(b.parent_recursive) for b in bones}
    sub = {b.name: {b.name} | {c.name for c in b.children_recursive} for b in bones}
    verts = wob.data.vertices
    inside = {r: [f(b2g(v.co)) for v in verts] for r, f in region.items()}
    share = {r: [f.blend(b2g(v.co)) for v in verts] for r, f in region.items() if hasattr(f, 'blend')}
    empty = [r for r in region if not any(inside[r])]
    if empty:
        raise ValueError(f'skin: the region of {empty} holds no vertex')
    near = {r: _kdtree([v.co for v, ok in zip(verts, inside[r]) if ok]) for r in region}
    TW = [_tapered(w, b2g(v.co), taper, bones) for w, v in zip(W, verts)]   # W itself is overwritten below
    HITS = [[r for r in region if inside[r][i]] for i in range(len(W))]
    OWN = [sub[max(h, key=depth.get)] if h else set() for h in HITS]
    # a band applies off every region, or inside the region of one of its ancestors (the cat's ear band in its head)
    applies = lambda r, i: share[r][i] is not None and (not HITS[i] or (r in OWN[i] and r not in HITS[i]))
    # keep bands: the band's vertices outside the part, whose own weights the vertices inside the part borrow
    outer = {r: [j for j, s in enumerate(share[r]) if applies(r, j) and not s[1]]
             for r in share if getattr(region[r], 'keep', False)}
    outer = {r: (js, _kdtree([verts[j].co for j in js])) for r, js in outer.items() if js}
    ramps = {}
    for b, h in (joints or {}).items():     # the plane through the joint, square to the mean of the two bones' directions
        J, P = bones[b].head_local, bones[b].parent
        if isinstance(h, tuple):            # (h, normal): the plane square to a given glTF direction instead
            h, n = h[0], g2b(h[1]).normalized()
        else:
            n = ((J - P.head_local).normalized() + (bones[b].tail_local - J).normalized()).normalized()
        ramps[b] = (J.copy(), n, h, P.name)
    for i in range(len(W)):
        w, hits, own = TW[i], HITS[i], OWN[i]
        allowed = set(own or weighted)
        w = dict(w)
        for r in region:
            if not inside[r][i]:
                allowed -= sub[r] - {r} - own      # a region nested in r's subtree (an ear in the head) keeps its own
                if r in w:
                    w[r] = 0.0 if r in share else w[r] * max(0.0, 1.0 - near[r].find(verts[i].co)[2] / BLEND)
        zone = [(r, share[r][i]) for r in share if applies(r, i)]
        if any(a in sub[b] or b in sub[a] for k, (a, _) in enumerate(zone) for b, _ in zone[k + 1:]):
            zone = zone[:1]     # nested bands (the cat's ear band inside its head's): the first, the outer one, rules
        if len(zone) > 1:   # bands that overlap (two legs' in the crotch): together they take the largest share, split in
            # proportion (a sum would double the step where both fade); the vertex's other bones (else the first's parent)
            # take the rest
            xs = {r: u * u * (3 - 2 * u) for r, (u, _) in zone}
            k = max(xs.values()) / sum(xs.values())
            subs = set().union(*(sub[r] for r in xs))
            rest = {b: y for b, y in w.items() if b not in subs and b in allowed and y > 0}
            rest = rest or {bones[zone[0][0]].parent.name: 1.0}
            n = sum(rest.values())
            out = {b: (1 - k * sum(xs.values())) * y / n for b, y in rest.items()}
            for r, (u, within) in zone:
                mine = {b: W[i].get(r, 0) if b == r else y for b, y in w.items() if b in sub[r]} if within else {}
                mine = {b: y for b, y in mine.items() if y > 0} or {r: 1.0}
                m = sum(mine.values())
                for b, y in mine.items():
                    out[b] = out.get(b, 0.0) + k * xs[r] * y / m
            w = out
            allowed |= set(w)
        elif zone:      # across an inset cut: the bone's share rises, its parent (keep: the vertex's other bones) takes the rest
            r, (u, within) = zone[0]
            x = u * u * (3 - 2 * u)
            mine = {b: W[i].get(r, 0) if b == r else y for b, y in w.items() if b in sub[r]} if within else {}
            mine = {b: y for b, y in mine.items() if y > 0} or {r: 1.0}
            m = sum(mine.values())
            rest = {}
            if r in outer:  # keep: the other bones the vertex has, inside the part those of the nearest band vertex outside it
                js, kd = outer[r]
                src = {b: y for b, y in TW[js[kd.find(verts[i].co)[1]]].items() if b not in region} if within else w
                rest = {b: y for b, y in src.items() if b not in sub[r] and b in allowed and y > 0}
            rest = rest or {bones[r].parent.name: 1.0}
            n = sum(rest.values())
            w = {**{b: x * y / m for b, y in mine.items()}, **{b: (1 - x) * y / n for b, y in rest.items()}}
            allowed |= set(w)
        w = {b: x for b, x in w.items() if b in allowed and x > 0}
        for b, (J, n, h, par) in ramps.items():     # the bone and its parent split their weight along a smooth ramp
            s = w.get(b, 0.0) + w.get(par, 0.0)
            if s > 0 and b in allowed and par in allowed:
                x = min(max(((verts[i].co - J).dot(n) + h) / (2 * h), 0.0), 1.0)
                x = x * x * (3 - 2 * x)
                w = {c: y for c, y in {**w, b: s * x, par: s * (1 - x)}.items() if y > 0}
        if not w:   # nothing allowed reached it: the nearest allowed bone takes it whole
            co = wob.data.vertices[i].co
            w = {min(allowed & set(weighted), key=lambda b: _seg_dist(co, bones[b].head_local, bones[b].tail_local)): 1.0}
        top = sorted(w.items(), key=lambda kv: (-kv[1], kv[0]))[:4]
        s = sum(x for _, x in top)
        W[i] = {b: x / s for b, x in top}
    _glue_loose(wob.data, W)
    bpy.data.objects.remove(wob)
    for g in list(mesh.vertex_groups):
        mesh.vertex_groups.remove(g)
    groups = {b.name: mesh.vertex_groups.new(name=b.name) for b in bones}
    for v in mesh.data.vertices:
        for b, x in W[wmap[v.index]].items():
            groups[b].add([v.index], x, 'REPLACE')


def _glue_loose(me, W):
    """Ruling R23: each loose shell of welded mesh `me` (a piece of at most LOOSE vertices joined to nothing, such as a whisker)
    takes, whole, the final weights W of its root, the nearest vertex of the rest of the mesh, so it moves rigidly with the skin
    it sits on. A piece whose dominant bones dominate none of the rest is a part modelled apart that moves on its own: kept."""
    pieces = _small_shells(me, LOOSE)
    main = [i for i in range(len(W)) if i not in pieces]
    if not pieces or not main:
        return
    top = lambda w: min(w, key=lambda b: (-w[b], b))     # the dominant bone
    carried = {top(W[i]) for i in main}
    V, kd, root, shells = me.vertices, _kdtree([me.vertices[i].co for i in main]), {}, {}
    for i, p in sorted(pieces.items()):
        _, k, d = kd.find(V[i].co)
        root[p] = min(root.get(p, (d, main[k])), (d, main[k]))
        shells.setdefault(p, []).append(i)
    glued = [p for p, ids in shells.items() if any(top(W[i]) in carried for i in ids)]
    for p in glued:
        for i in shells[p]:
            W[i] = dict(W[root[p][1]])
    log(f'loose shells: {len(glued)} of {len(shells)} take their root\'s weights (R23)')


def _tapered(w, p, taper, bones):
    """Weights w at p (glTF) after taper: each tapered bone keeps f of its weight, its nearest untapered ancestor the rest."""
    w = dict(w)
    for b in [b for b in w if b in taper]:
        f, up = taper[b](p), bones[b].parent
        while up.name in taper:
            up = up.parent
        w[up.name] = w.get(up.name, 0.0) + w[b] * (1 - f)
        w[b] *= f
    return w


def _welded_copy(mesh):
    """(object, map): mesh welded at WELD, without the faces that lie wholly on a ring where two source parts were joined
    (each part's cap over its cut, now inside); map[i] = the welded vertex of mesh vertex i."""
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    part_of = {}
    for name, ids in mesh.get('parts', {}).items():
        for i in ids:
            part_of[i] = name
    co = [v.co.copy() for v in bm.verts]
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=WELD)
    kd = _kdtree([v.co for v in bm.verts])
    seen = [set() for _ in bm.verts]
    for i, c in enumerate(co):
        seen[kd.find(c)[1]].add(part_of.get(i))
    bm.verts.ensure_lookup_table()
    ring = {i for i, s in enumerate(seen) if len(s) > 1}
    caps = [f for f in bm.faces if all(v.index in ring for v in f.verts)]
    bmesh.ops.delete(bm, geom=caps, context='FACES')
    me = bpy.data.meshes.new('_welded')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('_welded', me)
    bpy.context.scene.collection.objects.link(ob)
    kd = _kdtree([v.co for v in me.vertices])
    return ob, [kd.find(v.co)[1] for v in mesh.data.vertices]


def _kdtree(points):
    kd = KDTree(len(points))
    for i, p in enumerate(points):
        kd.insert(p, i)
    kd.balance()
    return kd


def _heat_weights(ob, arm, weighted):
    """Blender's automatic weights on `ob` for the bones in `weighted`: [{bone: w}] per vertex, or None when bone heat left a
    bone, or a vertex outside a loose shell of at most LOOSE vertices, without weight (it reports 'failed to find solution'
    and leaves them empty). A small loose shell it skipped (the cat's whiskers) takes, whole, the weights of the weighted vertex
    nearest to it."""
    for b in arm.data.bones:
        b.use_deform = b.name in weighted
    _select([ob, arm], arm)
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    for b in arm.data.bones:
        b.use_deform = True
    names = {g.index: g.name for g in ob.vertex_groups}
    W = [{names[g.group]: g.weight for g in v.groups if g.weight > 0} for v in ob.data.vertices]
    empty = [i for i, w in enumerate(W) if not w]
    unused = sorted(set(weighted) - {b for w in W for b in w})
    loose = _small_shells(ob.data, LOOSE) if empty else {}
    if unused or any(i not in loose for i in empty):
        log(f'bone heat: {len(empty)} vertices without weight, bones without vertices: {unused}')
        return None
    if empty:
        V, full = ob.data.vertices, [i for i, w in enumerate(W) if w]
        kd = _kdtree([V[i].co for i in full])
        near = {}
        for i in empty:     # per shell: (distance, weighted vertex) of the closest pair
            _, k, d = kd.find(V[i].co)
            near[loose[i]] = min(near.get(loose[i], (d, full[k])), (d, full[k]))
        for i in empty:
            W[i] = dict(W[near[loose[i]][1]])
        log(f'bone heat: {len(near)} loose shells ({len(empty)} vertices) take the weights of the weighted vertex nearest each')
    return W


def _small_shells(me, n):
    """{vertex: its piece} for the connected pieces of welded mesh `me` (by edges) that have at most n vertices."""
    piece, size = _components(me), {}
    for p in piece.values():
        size[p] = size.get(p, 0) + 1
    return {i: p for i, p in piece.items() if size[p] <= n}


def _seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - (a + ab * t)).length


def _distance_weights(me, arm, weighted):
    bones = arm.data.bones
    W = []
    for v in me.vertices:
        d = sorted((_seg_dist(v.co, bones[b].head_local, bones[b].tail_local), b) for b in weighted)[:4]
        w = {b: 1.0 / max(x, 1e-4) ** 4 for x, b in d}
        s = sum(w.values())
        W.append({b: x / s for b, x in w.items()})
    nbr = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        nbr[a].append(b)
        nbr[b].append(a)
    for _ in range(2):
        out = []
        for i, w in enumerate(W):
            acc = {b: 0.5 * x for b, x in w.items()}
            for j in nbr[i]:
                for b, x in W[j].items():
                    acc[b] = acc.get(b, 0.0) + 0.5 * x / len(nbr[i])
            out.append(acc if nbr[i] else w)
        W = out
    return W


def dominant(mesh):
    """Per vertex: the name of the bone with its largest weight (None if unweighted)."""
    names = {g.index: g.name for g in mesh.vertex_groups}
    return [names[max(v.groups, key=lambda g: g.weight).group] if len(v.groups) else None for v in mesh.data.vertices]


# ---- eyelids ----

def add_lids(mesh, arm, eyes, fur_uv, sides=8):
    """An eyelid cap over each painted eye: a fan of `sides` triangles (6-12) around eyes[side]['centre'] (moved by the
    optional 'shift', (across, up) u in the eye's plane) of 'radius' u, or (across, up) radii for an oval. Each rim vertex
    sits on the head surface + PROUD with a normal halfway between the surface's there and the cap's, so the cap shades
    round like the face around it; the centre vertex stands the optional 'dome' u further out. All UVs on fur_uv[side] (one
    fur texel); weighted wholly to lid_<side>, whose head is moved to the cap's hinge (the eye top on the surface). At scale
    0 the cap shrinks into the hinge (open)."""
    me = mesh.data
    normals = _vertex_normals(me)
    bm = bmesh.new()
    bm.from_mesh(me)
    bvh = BVHTree.FromBMesh(bm)
    uvl = bm.loops.layers.uv.active
    caps, hinges = {}, {}
    for side, e in eyes.items():
        c, r = g2b(e['centre']), e['radius']
        ra, ru = (r, r) if isinstance(r, (int, float)) else r
        n = Vector()
        for k in range(27):     # the surface normal averaged over a cube of samples around the eye
            q = c + Vector(((k % 3) - 1, (k // 3 % 3) - 1, (k // 9) - 1)) * (max(ra, ru) / 2)
            n += bvh.find_nearest(q)[1]
        n.normalize()
        up = g2b(e['top']) - c
        up = (up - n * up.dot(n)).normalized()
        across = up.cross(n)
        sa, su = e.get('shift', (0.0, 0.0))
        c = c + sa * across + su * up
        mid, _ = _surface(bvh, c, n)
        pts, nors = [mid + n * (PROUD + e.get('dome', 0.0))], [n]
        for a in (2 * math.pi * k / sides for k in range(sides)):
            p, nr = _surface(bvh, c + ra * math.cos(a) * across + ru * math.sin(a) * up, n)
            pts.append(p + nr * PROUD)
            nors.append((nr + n).normalized())     # halfway to the cap's normal: rounded, without a faceted fan
        vs = [bm.verts.new(p) for p in pts]
        for k in range(sides):
            f = bm.faces.new((vs[0], vs[1 + k], vs[1 + (k + 1) % sides]))
            f.normal_update()
            if f.normal.dot(n) < 0:
                f.normal_flip()
            for lp in f.loops:
                lp[uvl].uv = fur_uv[side]
        caps[side] = vs
        normals += nors
        hinges[side] = (_on_surface(bvh, g2b(e['top']), n), n)
    bm.verts.index_update()
    ids = {side: [v.index for v in vs] for side, vs in caps.items()}
    bm.to_mesh(me)
    bm.free()
    _set_vertex_normals(me, normals)
    for side, vids in ids.items():
        mesh.vertex_groups['lid_' + side].add(vids, 1.0, 'REPLACE')
    _select([arm], arm)
    bpy.ops.object.mode_set(mode='EDIT')
    for side, (h, n) in hinges.items():
        eb = arm.data.edit_bones['lid_' + side]
        eb.head, eb.tail = h, h + n * 0.01
    bpy.ops.object.mode_set(mode='OBJECT')


def _vertex_normals(me):
    """One normal per vertex: the mean of its corners' (the glTF import keeps every glTF vertex apart, so they agree but
    for encoding noise)."""
    acc = [Vector() for _ in me.vertices]
    for lp, n in zip(me.loops, me.corner_normals):
        acc[lp.vertex_index] += n.vector
    return [a.normalized() for a in acc]


def _set_vertex_normals(me, normals):
    """Custom normals per vertex on all-smooth faces, so every corner of a vertex decodes to the same normal and the
    exporter (which rounds normals to compare them) never splits a vertex the source GLB kept whole."""
    me.shade_smooth()
    me.normals_split_custom_set_from_vertices(normals)


def _surface(bvh, q, n):
    """(point, normal) where the head surface lies under q along -n (the nearest surface point if the ray misses)."""
    loc, nor, _, _ = bvh.ray_cast(q + n * 0.02, -n, 0.05)
    if loc is None:
        loc, nor, _, _ = bvh.find_nearest(q)
    return loc, nor.normalized()


def _on_surface(bvh, q, n):
    loc, nor = _surface(bvh, q, n)
    return loc + nor * PROUD


# ---- poses ----

def _basis(arm, P, lid_scale=0.0):
    """{pose bone: (quaternion, location, scale)} for pose dict P, in each bone's rest frame (see the module docstring)."""
    out = {}
    for pb in arm.pose.bones:
        p = P.get(pb.name, {})
        M = pb.bone.matrix_local.to_3x3()
        R = _G2B @ Euler([math.radians(a) for a in p.get('rot', (0, 0, 0))], 'ZXY').to_matrix() @ _G2B.transposed()
        s = p.get('scale', lid_scale if pb.name.startswith('lid_') else 1.0)
        out[pb] = ((M.inverted() @ R @ M).to_quaternion(), M.inverted() @ g2b(p.get('loc', (0, 0, 0))), s)
    return out


def set_pose(arm, P, lid_scale=0.0):
    for pb, (q, loc, s) in _basis(arm, P, lid_scale).items():
        pb.rotation_quaternion, pb.location, pb.scale = q, loc, (s, s, s)
    bpy.context.view_layer.update()


def merge(*poses):
    """One pose dict from several: rotations add per axis (fine for the small angles clips use), locs add, scales multiply."""
    out = {}
    for P in poses:
        for b, p in P.items():
            q = out.setdefault(b, {})
            for k, v in p.items():
                q[k] = q.get(k, 1.0) * v if k == 'scale' else tuple(a + c for a, c in zip(q.get(k, (0, 0, 0)), v))
    return out


def inflate(arm, bone, s):
    """Pose entries that scale `bone` by s about its head while its children keep their size and place (breathing, a
    chicken's fluff): {bone: scale s, each child: scale 1/s and the loc that cancels the parent's scaling of its offset}."""
    b = arm.data.bones[bone]
    out = {bone: {'scale': s}}
    for c in b.children:
        off = b2g(c.head_local - b.head_local)
        out[c.name] = {'scale': 1 / s, 'loc': tuple(x * (1 / s - 1) for x in off)}
    return out


def _pose_gap(arm, A, B):
    """The largest difference between two pose dicts: rotation (degrees), location and scale, compared as one number."""
    a, b = _basis(arm, A), _basis(arm, B)
    return max(max(math.degrees(qa.rotation_difference(qb).angle), (la - lb).length * 100, abs(sa - sb) * 100)
               for (qa, la, sa), (qb, lb, sb) in ((a[pb], b[pb]) for pb in a))


def apply_rest(mesh, arm, pose):
    """Bakes pose {bone: (rx, ry, rz) degrees} into the mesh (positions and normals) and makes it the armature's rest pose,
    so it becomes the default pose three.js shows (the dog's straightened head). List the moved bones in REST_CHANGED."""
    set_pose(arm, {b: {'rot': r} for b, r in pose.items()}, lid_scale=1.0)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg)
    em = ev.to_mesh()
    co = [v.co.copy() for v in em.vertices]
    normals = _vertex_normals(em)      # the armature modifier turns custom normals with the bones
    ev.to_mesh_clear()
    me = mesh.data
    for v, p in zip(me.vertices, co):
        v.co = p
    me.update()
    _set_vertex_normals(me, normals)
    _select([arm], arm)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    set_pose(arm, {})


# ---- clips ----

def key_clip(arm, name, kind, duration, pose_fn):
    """Keys pose_fn every 1/30 s from 0 to `duration` into action `name` on its own NLA track. Every bone except root gets
    rotation, location and scale keys on every frame (a bone pose_fn leaves out is keyed at its default; lids at scale 0).
    A loop's last frame is keyed from t = 0; once / hold clips must start (once: and end) at the default pose."""
    n = round(duration * FPS)
    if kind not in ('loop', 'hold', 'once') or abs(n / FPS - duration) > 1e-9:
        raise ValueError(f'{name}: kind {kind} / duration {duration} (want loop, hold or once and whole 1/30 s frames)')
    first = pose_fn(0.0)
    checks = {'loop': [('ends', _pose_gap(arm, first, pose_fn(duration)))],
              'hold': [('starts', _pose_gap(arm, first, {}))],
              'once': [('starts', _pose_gap(arm, first, {})), ('ends', _pose_gap(arm, pose_fn(duration), {}))]}[kind]
    for what, gap in checks:
        if gap > 1e-3:
            raise ValueError(f'{name} ({kind}) {what} {gap:.4f} off {"its first frame" if kind == "loop" else "the default pose"}')
    ad = arm.animation_data or arm.animation_data_create()
    ad.use_nla = False      # until export(): the clip being keyed (or played) alone drives the pose
    act = bpy.data.actions.new(name)
    ad.action = act
    keyed = [pb for pb in arm.pose.bones if pb.name != 'root']
    for f in range(n + 1):
        set_pose(arm, first if kind == 'loop' and f == n else pose_fn(f / FPS))
        for pb in keyed:
            for path in ('rotation_quaternion', 'location', 'scale'):
                pb.keyframe_insert(path, frame=f)
    track = ad.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, act)
    ad.action = None
    set_pose(arm, {})


@contextmanager
def playing(arm, clip):
    """Makes `clip` the armature's action for the block (the NLA stays off until export) and yields its last frame; the
    default pose is back afterwards."""
    ad = arm.animation_data
    ad.action = bpy.data.actions[clip]
    try:
        yield round(ad.action.frame_range[1])
    finally:
        ad.action = None
        bpy.context.scene.frame_set(0)
        set_pose(arm, {})


def leg_chains(arm):
    """{leg: (top, knee, paw)} at the default pose (glTF), from leg_<leg>_1's head and tail and leg_<leg>_2's tail."""
    B = arm.data.bones
    return {b.name[4:-2]: (b2g(b.head_local), b2g(b.tail_local), b2g(B[b.name[:-1] + '2'].tail_local))
            for b in B if b.name.startswith('leg_') and b.name.endswith('_1')}


def ease(x):
    """Smoothstep on 0..1 (clamped): the ease of once and hold clips, flat at both ends."""
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


# ---- pose-function helpers the animal scripts share (from chicken and duck, R33; goat, sheep and hare use them too) ----

X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))      # the glTF axes


def rot(axis, deg):
    """The 3x3 rotation of `deg` degrees about `axis` (a glTF vector)."""
    return Matrix.Rotation(math.radians(deg), 3, Vector(axis))


def euler(M):
    """A rotation matrix as the pose's rot (degrees, applied z then x then y: the module docstring's convention)."""
    return tuple(math.degrees(a) for a in M.to_euler('ZXY'))


def turn(pitch=0.0, yaw=0.0, roll=0.0):
    """A rotation of a bird's head or body in the model's axes: pitch about +X (positive: nose down), yaw about +Y (positive:
    to the animal's left), roll about +Z (positive: the left side up); roll first, then pitch, then yaw. A head that faces +Z
    level at rest has these as its own axes too."""
    return rot(Y, yaw) @ rot(X, pitch) @ rot(Z, roll)


def pose(R, extra=None):
    """Pose entries {bone: {'rot': ...}} from {bone: rotation matrix} plus `extra` pose entries (locs, scales) merged in."""
    out = {b: {'rot': euler(M)} for b, M in R.items()}
    for b, p in (extra or {}).items():
        out.setdefault(b, {}).update(p)
    return out


def bump(t, a, b):
    """A smooth pulse: 0 outside a..b, sin^2 up to 1 at the middle."""
    return math.sin(math.pi * (t - a) / (b - a)) ** 2 if a < t < b else 0.0


def ramp(t, a, b):
    """ease() across a..b: 0 before a, 1 after b."""
    return ease((t - a) / (b - a))


def settle(u, snap):
    """A damped spring's step response at u s after the step (0 before it), less 1: -1 at the step, flat there (zero speed),
    overshooting a little and dying away. `snap` is the spring, dict(w=rad/s, zeta=damping)."""
    if u < 0:
        return 0.0
    w, z = snap['w'], snap['zeta']
    wd = w * math.sqrt(1 - z * z)
    return -math.exp(-z * w * u) * (math.cos(wd * u) + z * w / wd * math.sin(wd * u))


def jerks(t, keys, period, snap):
    """A bird's head jerks in a loop of `period` s: the value holds keys [(t, value)] (the first value is also the last) and
    snaps from each to the next with settle()'s spring `snap` (the snap and settle of a bird's head; C1, periodic)."""
    held = [v for k, v in keys if k <= t]
    out = held[-1] if held else keys[-1][1]
    for (t0, v0), (t1, v1) in zip(keys[-1:] + keys[:-1], keys):
        out += (v1 - v0) * (settle(t - t1, snap) + settle(t - t1 + period, snap))
    return out


def in_plane(point, normal, inset, outset, box, keep=False):
    """A skin() region predicate on the side of the plane through `point` that `normal` faces (glTF), within `box`
    ((lo, hi) corners), banded as in_part's: True farther than inset inside; blend(p) from outset outside to inset inside;
    keep as in_part's."""
    q, n = Vector(point), Vector(normal).normalized()
    lo, hi = box
    inbox = lambda p: all(lo[k] <= p[k] <= hi[k] for k in range(3))
    s = lambda p: (Vector(p) - q).dot(n)

    def f(p):
        return inbox(p) and s(p) > inset

    def blend(p):
        if not inbox(p):
            return None
        d = s(p)
        if not -outset <= d < inset:
            return None
        return (d + outset) / (inset + outset), d >= 0

    f.blend, f.keep = blend, keep
    return f


def in_wing(side, ellipse):
    """A skin() region predicate for a wing moulded on the body ('L' or 'R'): on its side (|x| past ellipse['xmin']), inside
    the ellipse the side view draws (dict(centre=(z, y), axes, tilt degrees, xmin, band=(lo, hi))); the wing alone within
    band[0] of the ellipse's size, banded out to band[1] (the moulded wing's edge lies at 1), the rest of the band's weight
    kept on the bones the vertex had (the neck's at the shoulder)."""
    E = ellipse
    sg = 1 if side == 'L' else -1
    (cz, cy), (a, b), th = E['centre'], E['axes'], math.radians(E['tilt'])
    lo, hi = E['band']

    def rho(p):
        dz, dy = p[2] - cz, p[1] - cy
        u, v = dz * math.cos(th) + dy * math.sin(th), -dz * math.sin(th) + dy * math.cos(th)
        return math.hypot(u / a, v / b)

    side_ok = lambda p: p[0] * sg > E['xmin']

    def f(p):
        return side_ok(p) and rho(p) < lo

    def blend(p):
        if not side_ok(p):
            return None
        r = rho(p)
        if not lo <= r < hi:
            return None
        return (hi - r) / (hi - lo), r < 1.0

    f.blend, f.keep = blend, True
    return f


def fk(arm, P):
    """{bone: 4x4 Matrix} for pose dict P, without Blender evaluating anything: each maps a default-pose point (glTF) that
    the bone carries to where P puts it, by the convention in the module docstring. For IK in pose functions."""
    out = {}

    def world(b):
        if b.name not in out:
            p = P.get(b.name, {})
            h = Vector(b2g(b.head_local))
            s = p.get('scale', 0.0 if b.name.startswith('lid_') else 1.0)
            E = Euler([math.radians(a) for a in p.get('rot', (0, 0, 0))], 'ZXY').to_matrix().to_4x4()
            L = Matrix.Translation(h + Vector(p.get('loc', (0, 0, 0)))) @ Matrix.Diagonal((s, s, s, 1)) @ E @ Matrix.Translation(-h)
            out[b.name] = world(b.parent) @ L if b.parent else L
        return out[b.name]

    for b in arm.data.bones:
        world(b)
    return out


def reach(arm, P, leg, target, M=None):
    """Pose entries {leg_<leg>_1, leg_<leg>_2} that put the leg's ground point (y 0 under its paw at the default pose) on
    `target` (glTF, model space) while the leg's parent is posed by P: gait()'s two-bone IK, solved in the leg's side plane
    of the parent's default-pose frame with the knee bending the way it bends at rest, the whole leg then rolled about the
    top (z) to carry the paw sideways. M: fk(arm, P) if known. A target out of reach gets the leg straight toward it."""
    T, K, F = (Vector(p) for p in leg_chains(arm)[leg])
    F = Vector((F.x, 0.0, F.z))
    M = M or fk(arm, P)
    G = M[arm.data.bones[f'leg_{leg}_1'].parent.name].inverted() @ Vector(target)
    roll = math.atan2(G.x - T.x, T.y - G.y) - math.atan2(F.x - T.x, T.y - F.y)
    Rz = Matrix.Rotation(roll, 3, 'Z')
    G = T + Rz.transposed() @ (G - T)          # the target turned back into the leg's own plane
    K2 = _knee(T, K, F, G)
    a1 = _turn_x(K - T, K2 - T)
    a2 = _turn_x(F - K, G - K2) - a1
    r1 = tuple(math.degrees(a) for a in (Rz @ Matrix.Rotation(a1, 3, 'X')).to_euler('ZXY'))
    return {f'leg_{leg}_1': {'rot': r1}, f'leg_{leg}_2': {'rot': (math.degrees(a2), 0, 0)}}


SINK = 0.01      # ruling R25: how far a vertex may go under the ground (u), the same in rigs.test


class Feet:
    """Paw planting for an animal's legs (the leg_<leg>_1 / leg_<leg>_2 chains), its state held here rather than in module
    globals. Build one per armature after skin() and rest() (clips(arm) is the place) and hand it to the pose functions:
        feet = common.Feet(arm, mesh)        # mesh: the skinned mesh
    chains  leg_chains(arm): {leg: (top, knee, paw)} at the default pose (glTF)
    ground  {leg: (x, 0, z)}: each leg's ground point, under its paw
    sole    {leg: [(bone, ((bone, weight), ...), glTF Vector)]}: the leg's vertices below `below` u at the default pose that
            its own two bones dominate, with the dominant bone and all the vertex's weights (lowest() skins them as the
            armature does; a leg without any is an error)
    limb    likewise every vertex the leg's two bones dominate (lowest(..., whole=True), at(): a forearm lying down)
    points(bones) gives the same entries for the vertices any of `bones` dominates (a tail kept on the ground). A helper that
    cannot meet its goal (a paw still under the ground) leaves a note(); checked(clip, fn) wraps a clip so each frame's final
    pose is checked against the ground (ruling R25) and the notes are logged only when it still sinks, never for the
    intermediate states later clamps put right."""

    def __init__(self, arm, mesh, below=0.12):
        self.arm, self.chains = arm, leg_chains(arm)
        self.ground = {leg: (p[0], 0.0, p[2]) for leg, (_, _, p) in self.chains.items()}
        names = {g.index: g.name for g in mesh.vertex_groups}
        self.sole, self.limb = {leg: [] for leg in self.chains}, {leg: [] for leg in self.chains}
        self._all, self.notes, self._sunk = [], [], set()
        for v in mesh.data.vertices:
            if not v.groups:
                continue
            b, p = names[max(v.groups, key=lambda g: g.weight).group], Vector(b2g(v.co))
            entry = (b, tuple((names[g.group], g.weight) for g in v.groups if g.weight > 0), p)
            self._all.append(entry)
            leg = b[4:-2] if b.startswith('leg_') else None
            if leg in self.limb:
                self.limb[leg].append(entry)
                if p.y < below:
                    self.sole[leg].append(entry)
        empty = sorted(leg for leg, vs in self.sole.items() if not vs)
        if empty:
            raise ValueError(f'Feet: no vertex below {below} u is dominated by the bones of legs {empty}')

    def points(self, bones):
        """Entries (as sole's) for the vertices any of `bones` dominates."""
        return [e for e in self._all if e[0] in bones]

    def note(self, msg):
        """Keeps msg (a helper fell short of its goal) for check() to log if the frame's final pose still sinks."""
        self.notes.append(msg)

    def check(self, clip, t, P, sink=SINK):
        """P unchanged, after logging (once per clip) when any vertex of it lies more than `sink` u under the ground (ruling
        R25), with the notes the helpers left on the way. The notes are cleared for the next frame."""
        low = self.at(fk(self.arm, P), self._all)
        if low < -sink and clip not in self._sunk:
            self._sunk.add(clip)
            why = '; '.join(dict.fromkeys(self.notes))
            log(f'feet: {clip} at {t:.3f} s still sinks {-1000 * low:.0f} mm under the ground' + (f' ({why})' if why else ''))
        self.notes.clear()
        return P

    def checked(self, clip, fn):
        """The clip function fn(t) with every frame's final pose check()ed."""
        def run(t):
            self.notes.clear()
            return self.check(clip, t, fn(t))
        return run

    @staticmethod
    def at(M, entries):
        """The lowest y of Feet entries skinned (linear blend of their weights) under fk matrices M."""
        return min(sum(w * (M[b] @ p).y for b, w in ws) for _, ws, p in entries)

    def lowest(self, M, leg, whole=False):
        """The lowest y of the leg's sole vertices (whole: of all its vertices) under fk matrices M."""
        return self.at(M, (self.limb if whole else self.sole)[leg])

    def held(self, P, at=None, legs=('FL', 'FR'), axes='xyz', limit=None):
        """P with the body (root's child: hips) moved along `axes` so the midpoint of `legs`' tops, carried by their parent,
        lands on `at` (glTF; default: where it is at the default pose): the body turns about those tops (the shoulders for
        a sit). axes='yz' leaves a sideways shift to the planted legs; limit caps the shift in x and z (AR2 allows 0.05),
        the planted legs taking up the rest."""
        M, B = fk(self.arm, P), self.arm.data.bones
        top = lambda leg: Vector(self.chains[leg][0])
        rest = sum((top(leg) for leg in legs), Vector()) / len(legs)
        now = sum((M[B[f'leg_{leg}_1'].parent.name] @ top(leg) for leg in legs), Vector()) / len(legs)
        body = next(c.name for c in B['root'].children)
        d = (rest if at is None else Vector(at)) - now
        cap = (lambda a, x: x if limit is None or a == 'y' else max(-limit, min(limit, x)))
        return merge(P, {body: {'loc': tuple(cap(a, x) if a in axes else 0.0 for a, x in zip('xyz', d))}})

    def planted(self, P, targets):
        """P with each listed leg's ground point put on its target (glTF) by IK, raised where the leg would dip below the
        ground (a turned paw)."""
        M = fk(self.arm, P)
        out = dict(P)
        for leg, g in targets.items():
            g = Vector(g)
            for _ in range(6):
                out.update(reach(self.arm, P, leg, g, M))
                low = self.lowest(fk(self.arm, out), leg)
                if low >= -1e-4:
                    break
                g = g + Vector((0, -low, 0))
            else:
                self.note(f'planted: leg {leg} still dips {-1000 * low:.0f} mm under the ground (out of reach)')
        return out

    def under(self, P, leg, k=1.0):
        """A ground target k of the way from the leg's rest ground point to the ground under its top as P poses it: a paw
        that steps under a body that has leaned or curled, so the leg stays near straight."""
        top = fk(self.arm, P)[self.arm.data.bones[f'leg_{leg}_1'].parent.name] @ Vector(self.chains[leg][0])
        return tuple(Vector(self.ground[leg]).lerp(Vector((top.x, 0.0, top.z)), k))

    def ahead(self, P, leg, d, k):
        """A ground target in front of the leg's posed top, blended from the leg's rest ground point by k: d in front, or as
        much further (the leg stretching out forward) as keeps its folded knee out of the ground."""
        T = Vector(self.chains[leg][0])
        top = fk(self.arm, P)[f'leg_{leg}_1'] @ T
        for j in range(16):
            g = tuple(Vector(self.ground[leg]).lerp(Vector((top.x, 0.0, top.z + d + 0.01 * j)), k))
            Q = dict(P)
            Q.update(reach(self.arm, P, leg, g))
            low = self.lowest(fk(self.arm, Q), leg)
            if low >= -0.004:
                break
        else:
            self.note(f'ahead: leg {leg} still dips {-1000 * low:.0f} mm under the ground at {d + 0.15:.2f} u ahead')
        return g


def gait(t, duration, phases, swing_deg, lift, stance=0.6, *, legs, feet=None):
    """Leg poses at time t of a walk cycle of `duration`, for a +Z-facing animal: {leg_<leg>_1, leg_<leg>_2} per leg.

    phases {leg: phase}: QUADRUPED or BIPED; legs: leg_chains(arm). Each paw's ground point (y 0 beneath leg_<leg>_2's
    tail) follows a path and both bones are solved for it (two-bone IK in the leg's side plane, the knee bending the way it
    bends at rest):
      stance, the first `stance` of the leg's cycle: the point slides back along the ground at a steady speed, from in
        front of its rest place to behind it, swing_deg either side as seen from the leg's top;
      swing: it comes forward (eased), lifted by 0.75 x `lift` u at both ends and `lift` mid-swing, so every swing frame
        clears the AR5 stance band (ruling R8: > 0.02 u above its lowest; measure_stride checks it).
    The paw tilts with the leg, so without `feet` its toes or heel dip under the ground at the ends of the stance (the
    dog's: 12 mm). feet (a Feet): the path then carries the sole's lowest vertex instead, raising the paw by however far
    the tilt would push it under, so a planted paw rolls heel to toe on the ground (and a swinging one keeps its lift).
    A leg whose top is straight above its paw at rest walks evenly; the knee must leave the leg room to reach both ends."""
    out = {}
    for leg, ph in phases.items():
        T, K, F = (Vector(p) for p in legs[leg])
        F = Vector((F.x, 0.0, F.z))
        x = math.hypot(F.y - T.y, F.z - T.z) * math.sin(math.radians(swing_deg))
        p = (t / duration + ph) % 1.0
        if p < stance:
            dz, dy = x * (1 - 2 * p / stance), 0.0
        else:
            s = (p - stance) / (1 - stance)
            dz, dy = -x * math.cos(math.pi * s), lift * (0.75 + 0.25 * math.sin(math.pi * s))
        def solve(h):       # the leg's pose with its ground point h above the path, and its sole's lowest vertex
            F2 = F + Vector((0, dy + h, dz))
            K2 = _knee(T, K, F, F2)
            a1 = _turn_x(K - T, K2 - T)
            a2 = _turn_x(F - K, F2 - K2) - a1
            pose = {f'leg_{leg}_1': {'rot': (math.degrees(a1), 0, 0)}, f'leg_{leg}_2': {'rot': (math.degrees(a2), 0, 0)}}
            return pose, (feet.lowest(fk(feet.arm, pose), leg) - dy if feet else 0.0)

        pose, fa = solve(0.0)
        if abs(fa) > 1e-6:
            # bracket the height h that puts the sole's lowest vertex on the path, then halve the bracket: near full
            # stretch the paw's tilt changes fast with h, so a plain step (h -= off) overshoots and never settles
            a, b = 0.0, -fa
            fb = solve(b)[1]
            while fa * fb > 0:
                if abs(b) > 0.1:
                    raise ValueError(f'gait: leg {leg} at t {t:.3f} finds no height that puts its sole on its path')
                b *= 2
                fb = solve(b)[1]
            for _ in range(40):
                m = (a + b) / 2
                pose, fm = solve(m)
                if abs(fm) < 1e-6:
                    break
                a, fa, b, fb = (m, fm, b, fb) if (fm < 0) == (fa < 0) else (a, fa, m, fm)
        out.update(pose)
    return out


def _turn_x(a, b):
    """The rotation about +X (radians, in -pi..pi) that turns a's YZ direction into b's."""
    d = math.atan2(b.z, b.y) - math.atan2(a.z, a.y)
    return (d + math.pi) % (2 * math.pi) - math.pi


def _knee(T, K, F, F2):
    """Where the knee goes when the paw moves from F to F2 with the top T fixed: lengths kept in the YZ plane, the knee on
    the side of the top-paw line it has at rest. A paw out of reach gets the leg straight toward it."""
    l1, l2 = math.hypot(K.y - T.y, K.z - T.z), math.hypot(F.y - K.y, F.z - K.z)
    side = math.copysign(1.0, (F.y - T.y) * (K.z - T.z) - (F.z - T.z) * (K.y - T.y))
    dy, dz = F2.y - T.y, F2.z - T.z
    d = min(max(math.hypot(dy, dz), abs(l1 - l2) + 1e-9), l1 + l2 - 1e-9)
    uy, uz = dy / math.hypot(dy, dz), dz / math.hypot(dy, dz)
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    return Vector((K.x, T.y + a * uy - side * h * uz, T.z + a * uz + side * h * uy))


def _positions(mesh):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg)
    em = ev.to_mesh()
    out = [b2g(mesh.matrix_world @ v.co) for v in em.vertices]
    ev.to_mesh_clear()
    return out


def measure_stride(arm, mesh, clip):
    """Distance the body travels per cycle of the loop `clip` with the feet planted. A foot is AR5's: the lowest
    default-pose vertex mostly on a leg_*_2 (every vertex within 1e-4 of that height counts, since a tie may resolve either
    way in three.js); it moves back over its stance frames (y <= its lowest + 0.01). stride = the feet's mean speed x
    duration. Raises if a foot's speed is more than 8 % off the mean (AR5 allows 10 %) or a foot is not more than 0.02 above
    its lowest on a swing frame (ruling R8; a swing frame lifts the leg_*_2 tail more than half its highest)."""
    dom, rest = dominant(mesh), _positions(mesh)
    fwd = FACING[arm.get('facing', '+Z')]
    legs = sorted({b for b in dom if b and b.startswith('leg_') and b.endswith('_2')})
    lowest = {leg: min(rest[i][1] for i, b in enumerate(dom) if b == leg) for leg in legs}
    feet = [(b, i) for i, b in enumerate(dom) if b in lowest and rest[i][1] <= lowest[b] + 1e-4]
    with playing(arm, clip) as n:
        frames, paws = [], []
        for f in range(n + 1):
            bpy.context.scene.frame_set(f)
            frames.append(_positions(mesh))
            paws.append({leg: (arm.matrix_world @ arm.pose.bones[leg].tail).z for leg in legs})
    speeds, problems = [], []
    for leg, i in feet:
        y = [P[i][1] for P in frames]
        z = [Vector(P[i]).dot(fwd) for P in frames]
        lo = min(y)
        v = [-(z[k + 1] - z[k]) * FPS for k in range(n) if y[k] <= lo + 0.01 and y[k + 1] <= lo + 0.01]
        if not v:
            raise ValueError(f'{clip}: {leg} foot (vertex {i}) never stays planted for two frames')
        speeds.append((leg, i, sum(v) / len(v)))
        up = [p[leg] for p in paws]
        low = [k for k in range(n + 1) if up[k] - min(up) > 0.5 * (max(up) - min(up)) and y[k] - lo <= 0.02]
        if low:
            problems.append(f'{leg} foot (vertex {i}) within 0.02 u of its lowest on swing frames {low}')
    mean = sum(s for _, _, s in speeds) / len(speeds)
    problems += [f'{leg} foot (vertex {i}) {s:.3f} u/s vs the mean {mean:.3f}' for leg, i, s in speeds if abs(s / mean - 1) > 0.08]
    log(f'{clip} foot speeds {min(s for *_, s in speeds):.3f}-{max(s for *_, s in speeds):.3f} u/s over {len(feet)} sole '
        f'vertices of {len(legs)} feet, stride {mean * n / FPS:.4f}')
    if problems:
        raise ValueError(f'{clip}: ' + '; '.join(problems))
    return mean * n / FPS


# ---- export ----

def export(arm, mesh, raw_path, sidecar, probe_path):
    """Writes raw_path (the GLB, every clip its own animation), raw_path's .json (sidecar, the rigs.json entry) and the AR7
    probe at probe_path: >= 16 non-lid vertices' Blender positions at the default pose and at frames 0, n/4, n/2, 3n/4 and
    n (floored) of every clip, every frame of a clip of 10 frames or fewer (ruling R14), in glTF space."""
    rna = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    missing = sorted(set(EXPORT) - rna)
    if missing:
        raise RuntimeError(f'glTF exporter lacks {missing} (Blender {bpy.app.version_string})')
    probe = _probe(arm, mesh, list(sidecar['clips']))
    arm.animation_data.action = None
    arm.animation_data.use_nla = True
    set_pose(arm, {})
    bpy.context.scene.frame_set(0)
    _select([mesh, arm], arm)
    bpy.ops.export_scene.gltf(filepath=raw_path, **EXPORT)
    _write_json(os.path.splitext(raw_path)[0] + '.json', sidecar)
    _write_json(probe_path, probe)


def _probe(arm, mesh, clips):
    """One vertex per weighted bone (the one farthest from the bone's head among those it dominates), topped up to 24 with
    evenly spaced vertices; lid vertices are left out (a cap collapses to a point at the default pose)."""
    dom, rest = dominant(mesh), _positions(mesh)
    bones = arm.data.bones
    ok = [i for i, b in enumerate(dom) if b and not b.startswith('lid_')]
    idx = []
    for b in bones:
        own = [i for i in ok if dom[i] == b.name]
        if own:
            h = Vector(b2g(b.head_local))
            idx.append(max(own, key=lambda i: ((Vector(rest[i]) - h).length, -i)))
    for k in range(24):
        i = ok[round(k * (len(ok) - 1) / 23)]
        if len(idx) < 24 and i not in idx:
            idx.append(i)
    r6 = lambda p: [round(x, 6) for x in p]
    probe = {'times': {}, 'points': [{'rest': r6(rest[i]), 'posed': {}} for i in idx]}
    for clip in clips:
        with playing(arm, clip) as n:     # ruling R14: quarters, so a phase that is 0 at the ends and middle still shows
            frames = list(range(n + 1)) if n <= 10 else [k * n // 4 for k in range(5)]
            probe['times'][clip] = [round(f / FPS, 6) for f in frames]
            for f in frames:
                bpy.context.scene.frame_set(f)
                P = _positions(mesh)
                for pt, i in zip(probe['points'], idx):
                    pt['posed'].setdefault(clip, []).append(r6(P[i]))
    return probe


def _write_json(path, obj):
    with open(path, 'w') as f:
        f.write(json.dumps(obj, indent=2, sort_keys=True) + '\n')


# ---- entry point ----

def _args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {}
    while a:
        k = a.pop(0)
        if k not in ('--source', '--out') or not a:
            raise SystemExit(f'usage: -- --source <glb> --out <dir> (got {k})')
        out[k[2:]] = a.pop(0)
    if set(out) != {'source', 'out'}:
        raise SystemExit('usage: -- --source <glb> --out <dir>')
    return out


def run(animal):
    """The CLI every animal script calls: `-- --source <glb> --out <dir>` (see the module docstring)."""
    a = _args()
    mesh = load_source(a['source'], animal.ID)
    arm = build_armature(mesh, animal.BONES)
    arm['facing'] = animal.FACING
    skin(mesh, arm, getattr(animal, 'SKIN', 'auto'), animal.region(mesh) if hasattr(animal, 'region') else None,
         getattr(animal, 'TAPER', None), getattr(animal, 'JOINTS', None))
    if hasattr(animal, 'weights'):
        animal.weights(mesh, arm)
    if getattr(animal, 'EYES', None):
        add_lids(mesh, arm, animal.EYES, animal.FUR_UV, getattr(animal, 'LID_SIDES', 8))
    if hasattr(animal, 'rest'):
        animal.rest(mesh, arm)
    entry = {'file': f'{animal.ID}_rig.glb', 'source': os.path.basename(a['source']), 'facing': animal.FACING,
             'bones': [b['name'] for b in animal.BONES], 'live': list(animal.LIVE),
             'lids': [f'lid_{s}' for s in getattr(animal, 'EYES', {}) or {}],
             'restChanged': list(getattr(animal, 'REST_CHANGED', [])), 'clips': {}}
    if hasattr(animal, 'LOOK'):     # ruling R31: the game's live-look clamp
        entry['look'] = {'yaw': animal.LOOK['yaw'], 'pitch': animal.LOOK['pitch'], 'bones': list(animal.LOOK['bones'])}
    for name, kind, duration, fn in animal.clips(arm):
        key_clip(arm, name, kind, duration, fn)
        entry['clips'][name] = {'type': kind, 'duration': duration}
    if 'Walk' in entry['clips']:
        entry['clips']['Walk']['stride'] = round(measure_stride(arm, mesh, 'Walk'), 4)
    os.makedirs(a['out'], exist_ok=True)
    export(arm, mesh, os.path.join(a['out'], animal.ID + '.glb'), entry, os.path.join(a['out'], animal.ID + '.probe.json'))
    log(f'{animal.ID}: {len(mesh.data.polygons)} faces, {len(entry["bones"])} bones, clips {list(entry["clips"])}')
