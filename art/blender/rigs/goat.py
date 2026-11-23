"""goat.py -- the goat's rig: public/models/goat.glb -> goat_rig.glb (common.py does the work; README.md has the workflow).
    art/blender/rigs/build.sh goat

Landmarks are glTF coordinates on the source (the goat faces +Z, its left is +X), measured with orthographic renders,
vertex queries and geodesic walks from the tips (Task 5 probes):
  - hooves from the vertices below y 0.03 (centres; the toes are each hoof's front), the legs from slices every 3 cm (each
    forearm leaves the body's lower edge at y 0.19-0.20), the hocks from the side view (the hind leg's back bend at y 0.15);
  - the source's Head node holds the head, both horns, both ears and the beard, welded to the body along a nape-to-throat
    cut ring (66 vertices, centre (-0.003, 0.428, 0.156)): the head joint is that centre, as the dog's;
  - the head is modelled turned 51 deg to the goat's left, 32 deg down and rolled a little (from the eyes and the nose
    tip); rest() straightens it (ruling R29: the rest pose is neutral and symmetric, the head facing forward): the face
    looks down +Z, PITCH deg down, the nose tip on the midline (the neck swings 10 deg, as the cut ring sits off the
    skull's middle plane); head, jaw and ear turns are made in the head's own axes (HEAD_AXES) so a nod is a nod;
  - the horns, ears and beard are one welded shell with the head, so each ear and the beard are found by walking the
    mesh's edges from their tips (common.in_reach), the ears to 0.10 u (each flap's root, where the walk widens onto the
    skull at 0.09-0.10), the beard to 0.13 u (beard 0.09, then the chin and lower lip; the nose lies at 0.168);
  - the horns: within 0.14 u of each horn tip; the nearest ear's walk reaches them only at 0.158-0.175 u, so no ear band
    touches a horn and the head region carries them alone (rest() checks every horn vertex ends up wholly on `head`);
  - the eyes from close-ups square onto each painted eye (ray-cast onto the surface), the fur texels just above them;
  - the tail is a short tuft on the rump: the attach line runs from (z -0.265, y 0.412) to (z -0.3125, y 0.374) in the side
    view, so its region is the side of the plane through that line facing up and back (TAIL_PLANE), banded across it.

Weights follow the README's quadruped weighting recipe, except that the front knee is a goat's carpus: at forearm height
(y 0.15; at the elbow, Hop's planted take-off tore the joint at 1.74x) and 3 cm in front of the shoulder-hoof line, so the
knee folds forward and the hoof back, as a goat's does (review I2; gait() bends a knee the way it bends at rest, and closer
than 3 cm the leg is too near straight for the stride). Each leg is a region walked from its hoof front (LEG_REACH; the
forelegs' band reaches 0.16 out, so the armpit's bend spreads: 0.12-0.14 out tore it at 1.6-1.65x in Walk). Joint ramps,
the neck's tilted 37 deg up and 16 cm either side of a low neck base (NECK_BASE at the withers' root, so Graze can bring the
head down: JOINTS); the neck kept off the bib; the head banded at its cut ring, the ears and the jaw at their roots.

Clips: Idle, Walk, Graze and Chew (loops), Hop and HeadShake (once). Overlapping action throughout: the head leads a look
and the neck follows; after the body moves the head, ears, beard (jaw) and tail lag it; chewing is never regular (each chew
its own size, length and sideways grind); every loop holds whole cycles of everything in it.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

ID, FACING = 'goat', '+Z'
MID = -0.008                                   # the body's midline x: between the left and right hoof centres
PAWS = {'FL': (0.069, 0.015, 0.100), 'FR': (-0.084, 0.015, 0.108), 'BL': (0.072, 0.015, -0.251), 'BR': (-0.094, 0.015, -0.218)}
TOES = {'FL': (0.069, 0.0, 0.142), 'FR': (-0.084, 0.0, 0.148), 'BL': (0.072, 0.0, -0.214), 'BR': (-0.094, 0.0, -0.183)}
LEGS = {   # top, knee. Front: the shoulder straight above the hoof, the knee (a carpus) at forearm height, 3 cm in front of
    # the shoulder-hoof line. Hind: the hip up and 2 cm forward of the hoof, the hock behind the leg's line (y 0.15)
    'FL': ((0.069, 0.32, 0.100), (0.070, 0.15, 0.130)), 'FR': ((-0.084, 0.32, 0.108), (-0.085, 0.15, 0.138)),
    'BL': ((0.068, 0.32, -0.231), (0.070, 0.15, -0.285)), 'BR': ((-0.092, 0.32, -0.198), (-0.090, 0.15, -0.252))}
HIPS, BACK, NECK_BASE = (MID, 0.33, -0.22), (MID, 0.345, -0.06), (MID, 0.36, 0.06)
HEAD_JOINT = (-0.003, 0.428, 0.156)           # centre of the Head cut ring
MUZZLE = (0.11, 0.49, 0.305)                  # inside the muzzle, between the eyes and the nose
NOSE = (0.1471, 0.4812, 0.3301)               # the nose tip vertex
JAW_HINGE, CHIN = (0.05, 0.462, 0.25), (0.115, 0.435, 0.315)
BEARD_TIP = (0.0933, 0.3427, 0.269)           # the lowest vertex of the head
EARS = {'L': ((0.085, 0.575, 0.145), (0.1246, 0.6075, 0.0828)), 'R': ((-0.04, 0.56, 0.31), (-0.0838, 0.5808, 0.3751))}
HORN_TIPS = {'L': (-0.0132, 0.664, 0.063), 'R': (-0.1555, 0.6399, 0.2477)}
TAIL_ROOT, TAIL_END = (MID, 0.41, -0.285), (-0.008, 0.49, -0.34)
TAIL_PLANE = ((MID, 0.393, -0.289), (0.0, 0.781, -0.625))   # a point on the tail's attach line and the normal into the tail
EYES = {'L': dict(centre=(0.119, 0.5399, 0.2339), top=(0.1191, 0.5556, 0.2339), radius=(0.022, 0.019),
                 shift=(-0.002, 0.0), dome=0.005),
        'R': dict(centre=(0.0352, 0.5279, 0.3257), top=(0.0349, 0.5419, 0.3275), radius=(0.024, 0.018),
                 shift=(-0.003, 0.0), dome=0.005)}
LID_SIDES = 12
FUR_UV = {'L': (0.73396, 0.86196), 'R': (0.8827, 0.76421)}     # the brown patch texel just above each eye (Blender UV)
SKULL = (0.06, 0.55, 0.25)


def _bone(name, head, tail, parent):
    return dict(name=name, head=head, tail=tail, parent=parent)


def _lid(side):
    top = Vector(EYES[side]['top'])
    return _bone('lid_' + side, tuple(top), tuple(top + (top - Vector(SKULL)).normalized() * 0.01), 'head')


BONES = [_bone('root', (0, 0, 0), (0, 0.06, 0), None),
         _bone('hips', HIPS, BACK, 'root'),
         _bone('spine', BACK, NECK_BASE, 'hips'),
         _bone('neck', NECK_BASE, HEAD_JOINT, 'spine'),
         _bone('head', HEAD_JOINT, MUZZLE, 'neck'),
         _bone('jaw', JAW_HINGE, CHIN, 'head'),
         _bone('ear_L', *EARS['L'], 'head'), _bone('ear_R', *EARS['R'], 'head'),
         _lid('L'), _lid('R'),
         _bone('tail_1', TAIL_ROOT, TAIL_END, 'hips')]
for _leg in ('FL', 'FR', 'BL', 'BR'):
    BONES += [_bone(f'leg_{_leg}_1', LEGS[_leg][0], LEGS[_leg][1], 'spine' if _leg[0] == 'F' else 'hips'),
              _bone(f'leg_{_leg}_2', LEGS[_leg][1], PAWS[_leg], f'leg_{_leg}_1')]
LIVE = ['head', 'neck', 'lid_L', 'lid_R', 'ear_L', 'ear_R', 'tail_1']
# ruling R31: the game's live-look clamp (rigs.json look), measured on the built rig as rigs.test's lookPose applies it at rest:
# the largest whole 5 deg of yaw (pitch 0), then of pitch, whose ellipse keeps AR4 <= 1.6 on these bones
LOOK = dict(yaw=60, pitch=45, bones=['neck', 'head'])     # yaw at the spec's 60 (65 still holds: 1.59x); pitch 50: 1.63x
REST_CHANGED = ['neck', 'head', 'jaw', 'ear_L', 'ear_R', 'lid_L', 'lid_R']   # rest() straightens the head (R29)


# ---- weights ----

INSET = {'Head': (0.08, 0.025)}                  # the head's blend band into and out of its cut ring
EAR_REACH = (0.10, 0.02, 0.03)                   # length, inset, outset from each ear tip
JAW_REACH = (0.13, 0.03, 0.03)                   # from the beard tip: the beard and the chin wholly, the lower lip banded
TAIL_BAND = (0.03, 0.025)                        # inset, outset about TAIL_PLANE
HORN_REACH = 0.14                                # each horn: within this of its tip (region()'s check)
LEG_REACH = {'F': (0.24, 0.06, 0.16), 'B': (0.28, 0.07, 0.10)}
JOINTS = {**{f'leg_{leg}_2': 0.05 for leg in LEGS},    # knees and hocks: ramps 10 cm long
          'spine': 0.08, 'neck': (0.16, (0.0, 0.6, 0.8))}    # the neck's ramp tilted 37 deg up, 32 cm long (common.skin)


def _rising(y0, y1):
    """A taper factor: 0 below y0, 1 above y1, smooth between."""
    def f(p):
        x = min(max((p[1] - y0) / (y1 - y0), 0.0), 1.0)
        return x * x * (3 - 2 * x)
    return f


TAPER = {'neck': _rising(0.30, 0.40)}     # the neck keeps none of the bib below its base: the spine carries it


_HORNS = []   # [predicate: on a horn], set by region()


def region(mesh):
    """The Head node's vertices go to the head subtree, banded at the cut ring; each ear and the jaw (beard and chin) by
    reach from their tips, banded at their roots; the tail beyond TAIL_PLANE; each leg as LEG_REACH says, the rest of its
    band's weight kept on the body bones each vertex had. The horns take no band of their own: they lie 0.158 u or more
    (geodesic) from the ear tips, past every ear band, so the head region carries them alone (checked in rest())."""
    _HORNS[:] = [common.in_reach(mesh, HORN_TIPS[s], HORN_REACH) for s in 'LR']
    r = {'head': common.in_part(mesh, 'Head', *INSET['Head']),
         'ear_L': common.in_reach(mesh, EARS['L'][1], *EAR_REACH), 'ear_R': common.in_reach(mesh, EARS['R'][1], *EAR_REACH),
         'jaw': common.in_reach(mesh, BEARD_TIP, *JAW_REACH),
         'tail_1': common.in_plane(*TAIL_PLANE, *TAIL_BAND, ((-0.12, 0.33, -0.40), (0.12, 0.56, -0.24)))}
    for leg, tip in TOES.items():
        r[f'leg_{leg}_1'] = common.in_reach(mesh, tip, *LEG_REACH[leg[0]], keep=True)
    return r


def rest(mesh, arm):
    """Checks the horns ride the head alone (every vertex within HORN_REACH of a horn tip weighs at least 0.999 on `head`:
    the brief's horns stay rigid), then straightens the head (ruling R29): the face turns by REST_TURN to look down +Z,
    level, PITCH deg down, with the nose tip on the midline (`neck` swings NECK_SWING deg, `head` takes the rest of the
    turn); both are baked into the mesh and the bones (common.apply_rest). Needs region() to have run first (common.run calls
    it before rest): it fills _HORNS."""
    if not _HORNS:
        raise RuntimeError('goat.rest: no horn predicates (region() must run before rest(): it fills _HORNS, and without them '
                           'the horn check would pass on no vertices)')
    names = {g.index: g.name for g in mesh.vertex_groups}
    soft = []
    for v in mesh.data.vertices:
        p = common.b2g(v.co)
        if any(h(p) for h in _HORNS):
            w = sum(g.weight for g in v.groups if names[g.group] == 'head')
            if w < 0.999:
                soft.append((v.index, round(w, 3)))
    if soft:
        raise ValueError(f'horn vertices not wholly on head: {soft[:8]} ({len(soft)})')
    common.log(f'horns: every vertex within {HORN_REACH} u of a horn tip rides the head alone')
    fwd = _frame()[2]
    common.log(f'head modelled turned: yaw {math.degrees(math.atan2(fwd.x, fwd.z)):.1f} deg (to its left), pitch '
               f'{math.degrees(math.asin(-fwd.y)):.1f} deg down; straightened by {tuple(round(a, 1) for a in common.euler(REST_TURN))} '
               f'(x, y, z deg) to face +Z, {PITCH} deg down, the neck swung {NECK_SWING:.1f} deg')
    nose = min(range(len(mesh.data.vertices)), key=lambda i: (mesh.data.vertices[i].co - common.g2b(NOSE)).length)
    N = common.rot(Y, NECK_SWING)
    common.apply_rest(mesh, arm, {'neck': common.euler(N), 'head': common.euler(N.transposed() @ REST_TURN)})
    x = common.b2g(mesh.data.vertices[nose].co)[0]
    common.log(f'straightened: nose tip x {x:.4f} vs midline {MID}')
    if abs(x - MID) > 0.002:
        raise ValueError(f'nose tip x {x:.4f} is {abs(x - MID):.4f} off the midline {MID}')


# ---- axes and small helpers ----

def _frame():
    """The head's axes as modelled (glTF): left from the right eye to the left one, up square to it and the line from
    between the eyes to the nose tip, forward = left x up."""
    eL, eR, tip = Vector(EYES['L']['centre']), Vector(EYES['R']['centre']), Vector(NOSE)
    left = (eL - eR).normalized()
    up = (tip - (eL + eR) / 2).cross(left).normalized()
    return left, up, left.cross(up)


PITCH = 8.0    # the face's pitch at rest, deg down, measured as _frame measures it (eye centres to the nose tip)


def _straighten():
    """The rotation that turns the modelled head's axes (_frame: about 51 deg to its left, 32 down, a little rolled) onto
    +X left and forward along +Z, PITCH deg down."""
    p = math.radians(PITCH)
    left, fwd = Vector((1, 0, 0)), Vector((0, -math.sin(p), math.cos(p)))
    return Matrix((left, fwd.cross(left), fwd)).transposed() @ Matrix(_frame())


X, Y, Z = common.X, common.Y, common.Z


REST_TURN = _straighten()
HEAD_AXES = tuple(REST_TURN @ a for a in _frame())    # the head's axes at the (straightened) default pose


def _neck_swing():
    """The neck's yaw (deg) that carries the straightened head so the nose tip lies on the midline: the Head node's cut
    ring, the head joint, sits off the skull's own middle plane, so turning the head alone about it leaves the face 1.7 cm
    to the right. The neck swings the head joint across (as the dog's does) and the head turns as much less."""
    J, B = Vector(HEAD_JOINT), Vector(NECK_BASE)
    off = REST_TURN @ (Vector(NOSE) - J)
    lo, hi = -30.0, 30.0
    for _ in range(50):     # the nose's x rises with the swing: halve to the midline
        m = (lo + hi) / 2
        lo, hi = (m, hi) if (B + common.rot(Y, m) @ (J - B) + off).x < MID else (lo, m)
    return (lo + hi) / 2


NECK_SWING = _neck_swing()


def rested(p):
    """Where a point the head carries (glTF, as modelled) lies at the straightened default pose."""
    J, B = Vector(HEAD_JOINT), Vector(NECK_BASE)
    return tuple(B + common.rot(Y, NECK_SWING) @ (J - B) + REST_TURN @ (Vector(p) - J))


def _head_turn(pitch=0.0, yaw=0.0, roll=0.0):
    """A rotation in the head's own axes: pitch about its left (positive: nose down), yaw about its up (positive: to its
    left), roll about its forward (positive: left side up); roll first, then pitch, then yaw."""
    left, up, fwd = HEAD_AXES
    return common.rot(up, yaw) @ common.rot(left, pitch) @ common.rot(fwd, roll)


def _ear_turn(side, lift=0.0, fwd=0.0):
    """An ear's rotation: lift (positive: tip up) about the axis square to the ear and the head's up, then fwd (positive:
    tip swivels toward the face) about the head's up."""
    root, tip = (Vector(rested(p)) for p in EARS[side])
    d, up = (tip - root).normalized(), HEAD_AXES[1]
    return common.rot(up, fwd if side == 'R' else -fwd) @ common.rot(d.cross(up).normalized(), lift)


_TAIL_D = (Vector(TAIL_END) - Vector(TAIL_ROOT)).normalized()


def _tail_turn(side=0.0, lift=0.0):
    """tail_1's rotation: side (positive: the tuft swings to the goat's left) about the axis square to the tail in its
    upright plane, lift (positive: up and over toward the back) about X."""
    return common.rot(X, lift) @ common.rot(_TAIL_D.cross(X).normalized(), side)


def _add(R, bone, M):
    R[bone] = M @ R.get(bone, Matrix.Identity(3))


def _flicks(t, bursts):
    """A goat's tail flicks: each burst (start, length, hz, deg) a quick side-to-side, rising and dying away."""
    return sum(deg * math.sin(math.pi * (t - a) / n) * math.sin(2 * math.pi * hz * (t - a)) for a, n, hz, deg in bursts
               if a < t < a + n)


def _chews(t, chews):
    """Jaw (open deg, grind deg) at t for chews [(start, length, open, grind)]: each opens and closes once (sin^2), grinding
    to one side as it opens and back as it closes."""
    o = g = 0.0
    for a, n, op, gr in chews:
        if a < t < a + n:
            u = (t - a) / n
            o += op * math.sin(math.pi * u) ** 2
            g += gr * math.sin(2 * math.pi * u) * math.sin(math.pi * u)
    return o, g


def _planted(feet, P):
    return feet.planted(P, {leg: feet.ground[leg] for leg in LEGS})


# ---- clips ----

IDLE = dict(duration=3.0)


def idle(t, feet):
    """3 s loop: two breaths, a slow weight shift over planted hooves, a look round (the head leads, the neck follows), an
    ear flick each side at different times, two bursts of tail flicks, one blink, and a short ruminating chew."""
    D = IDLE['duration']
    w = 2 * math.pi * t / D
    breath = 0.5 - 0.5 * math.cos(2 * w)
    dx, roll = 0.005 * math.sin(w), 1.2 * math.sin(w)
    look = 12 * (common.ramp(t, 0.25, 0.75) - common.ramp(t, 1.35, 1.9)) - 7 * (common.ramp(t, 2.1, 2.45) - common.ramp(t, 2.6, 2.95))
    neck_look = 12 * (common.ramp(t, 0.35, 0.95) - common.ramp(t, 1.45, 2.05)) - 7 * (common.ramp(t, 2.15, 2.55) - common.ramp(t, 2.6, 2.98))
    R = {}
    _add(R, 'hips', common.rot(Z, roll))
    _add(R, 'spine', common.rot(X, -0.8 * breath))
    _add(R, 'neck', common.rot(Y, 0.55 * neck_look) @ common.rot(X, 0.6 * breath))
    _add(R, 'head', _head_turn(pitch=-0.6 * breath + 2 * common.bump(t, 1.2, 1.7), yaw=0.45 * look,
                               roll=-2.5 * (common.ramp(t, 0.3, 0.8) - common.ramp(t, 1.4, 1.9))))
    o, g = _chews(t, [(2.35, 0.24, 3.5, 1.2), (2.62, 0.26, 2.8, -1.0)])
    _add(R, 'jaw', _head_turn(pitch=o, yaw=g))
    flickR = common.bump(t, 1.05, 1.25) + 0.6 * common.bump(t, 1.3, 1.45)
    flickL = common.bump(t, 2.25, 2.42)
    sway = 3 * (common.ramp(t, 0.35, 0.85) - common.ramp(t, 1.45, 1.95))      # the ears trail the look a little
    _add(R, 'ear_L', _ear_turn('L', lift=18 * flickL + 1.5 * breath, fwd=-14 * flickL + sway))
    _add(R, 'ear_R', _ear_turn('R', lift=16 * flickR + 1.5 * breath, fwd=-12 * flickR - sway))
    _add(R, 'tail_1', _tail_turn(side=_flicks(t, [(0.45, 0.5, 5.0, 12), (1.95, 0.4, 5.0, 9)]), lift=2 * breath))
    blink = common.bump(t, 1.62, 1.8)
    P = common.pose(R, {'hips': {'loc': (dx, 0.0015 * breath, 0)}, 'lid_L': {'scale': blink}, 'lid_R': {'scale': blink}})
    return _planted(feet, P)


WALK = dict(duration=0.8, swing_deg=12, lift=0.033)


def walk(t, feet):
    """0.8 s quadruped walk: gait() legs with the hooves planted on the ground; the head nods twice a stride (the neck
    counters half), the ears bounce a beat behind the nod, the tail bobs and flicks once a stride."""
    D, w = WALK['duration'], 2 * math.pi * t / WALK['duration']
    nod = 3.0 * math.sin(2 * w)
    R = {}
    _add(R, 'neck', common.rot(X, -0.5 * nod))
    _add(R, 'head', _head_turn(pitch=nod, roll=1.5 * math.sin(w)))
    bounce = math.sin(2 * w - 1.2)          # the ears trail the nod
    _add(R, 'ear_L', _ear_turn('L', lift=-5 * bounce))
    _add(R, 'ear_R', _ear_turn('R', lift=-5 * bounce))
    _add(R, 'tail_1', _tail_turn(side=9 * math.sin(w - 0.8), lift=4 * math.sin(2 * w - 1.6)))
    return common.merge(common.gait(t, D, common.QUADRUPED, WALK['swing_deg'], WALK['lift'], legs=feet.chains, feet=feet),
                        common.pose(R))


# the head down at the grass, the face forward and about 83 deg down (review I1), the nose 8 cm up and 13 cm in front of the
# forehooves: the whole body tips `hips` deg and sinks `drop` u, the neck turns down `neck` deg about its low base and the
# head turns back up `head` deg so the face does not pass the vertical, the forehooves step `reach` forward and `splay` out
# (the knees then fold forward some 45 deg). This goat's neck is short for its legs: a deeper reach tears the back at the
# neck ramp's far end (drop -0.045: 1.66x), so 0.08 u is the best reach within AR4, against the review's 0.03
GRAZE = dict(duration=2.4, hips=5, drop=-0.03, shift=0.0, spine=0, neck=100, head=-37, reach=0.05, splay=0.05,
             chews=[(0.05, 0.3, 7.0, 2.6), (0.38, 0.27, 5.6, -2.2), (0.68, 0.33, 7.4, 2.9), (1.06, 0.25, 4.8, -1.8),
                    (1.72, 0.3, 6.6, 2.4), (2.05, 0.29, 5.9, -2.5)])


def graze(t, feet):
    """2.4 s loop: head down at the grass (spine, neck and head pitched), chewing six times, each chew its own size, length
    and grind (jaw within 7.9 deg), a tug at the grass at 1.35 s (the head jerks sideways, the ears flick a beat later),
    the head sweeping slowly left and back, the tail flicking once."""
    G, D = GRAZE, GRAZE['duration']
    w = 2 * math.pi * t / D
    tug = common.bump(t, 1.32, 1.62)
    tug_lag = common.bump(t, 1.4, 1.75)
    sweep = math.sin(w)
    R = {}
    _add(R, 'hips', common.rot(X, G['hips']))
    _add(R, 'spine', common.rot(X, G['spine']))
    _add(R, 'neck', common.rot(Y, 4 * sweep + 5 * tug) @ common.rot(X, G['neck']))
    _add(R, 'head', _head_turn(pitch=G['head'] + 1.2 * math.sin(3 * w), yaw=4 * math.sin(w - 0.5) - 6 * tug, roll=6 * tug))
    o, g = _chews(t, G['chews'])
    _add(R, 'jaw', _head_turn(pitch=o, yaw=g))
    _add(R, 'ear_L', _ear_turn('L', lift=-8 + 12 * tug_lag, fwd=6 - 6 * tug_lag))
    _add(R, 'ear_R', _ear_turn('R', lift=-8 + 10 * tug_lag + 3 * math.sin(w + 1), fwd=6))
    _add(R, 'tail_1', _tail_turn(side=_flicks(t, [(0.7, 0.5, 5.0, 12)]), lift=-3))
    P = common.pose(R, {'hips': {'loc': (0, G['drop'], G['shift'])}})
    g = feet.ground
    return feet.planted(P, {'FL': (g['FL'][0] + G['splay'], 0.0, g['FL'][2] + G['reach']),
                            'FR': (g['FR'][0] - G['splay'], 0.0, g['FR'][2] + G['reach']), 'BL': g['BL'], 'BR': g['BR']})


CHEW = dict(duration=1.2, chews=[(0.0, 0.29, 6.8, 2.8), (0.3, 0.27, 5.2, -2.1), (0.58, 0.31, 7.2, 2.4), (0.9, 0.28, 5.8, -2.6)])


def chew(t, feet):
    """1.2 s loop: a standing, ruminating chew: four chews of different sizes and grinds, the head bobbing a little with
    each (a beat behind the jaw), the ears relaxed and one swivelling, a slow breath."""
    C, D = CHEW, CHEW['duration']
    w = 2 * math.pi * t / D
    o, g = _chews(t, C['chews'])
    lo, lg = _chews((t - 0.05) % D, C['chews'])
    R = {}
    _add(R, 'jaw', _head_turn(pitch=o, yaw=g))
    _add(R, 'head', _head_turn(pitch=-0.25 * lo, roll=0.3 * lg))
    _add(R, 'neck', common.rot(X, 0.8 * math.sin(w)))
    _add(R, 'ear_L', _ear_turn('L', lift=-4 + 2 * math.sin(w), fwd=2))
    _add(R, 'ear_R', _ear_turn('R', lift=-4 + 7 * common.bump(t, 0.6, 0.95), fwd=2 + 8 * common.bump(t, 0.6, 0.95)))
    _add(R, 'tail_1', _tail_turn(side=2 * math.sin(w), lift=1.5 * math.sin(w)))
    return common.pose(R)


# the body's height: a crouch to `crouch` at `low` s, the launch (leaving at `lift` u at `off` s), a parabola topping out at
# `apex`, the landing at `land` s: at the top, with the legs folded, the whole goat is 67 mm off the ground (the brief: <= 0.08)
HOP = dict(duration=0.9, crouch=-0.018, low=0.15, off=0.32, land=0.52, lift=0.045, apex=0.066)


def _hermite(t, keys):
    """A C1 curve through keys [(t, y, slope)] (cubic Hermite), flat before the first and after the last."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, y0, m0), (t1, y1, m1) in zip(keys, keys[1:]):
        if t <= t1:
            h = t1 - t0
            u = (t - t0) / h
            return ((2 * u ** 3 - 3 * u ** 2 + 1) * y0 + (u ** 3 - 2 * u ** 2 + u) * h * m0 +
                    (-2 * u ** 3 + 3 * u ** 2) * y1 + (u ** 3 - u ** 2) * h * m1)
    return keys[-1][1]


def _flight(t0, y0, v0, apex, t):
    """y on a parabola leaving y0 at t0 with speed v0 that tops out at `apex`."""
    g = v0 * v0 / (2 * (apex - y0))
    return y0 + v0 * (t - t0) - g * (t - t0) ** 2 / 2


def _hop_y(t):
    """The body's height through the hop: crouch, launch, a parabola in the air, a landing that gives, a settle."""
    H = HOP
    v0 = 2 * (H['apex'] - H['lift']) / ((H['land'] - H['off']) / 2)
    if t < H['off']:
        return _hermite(t, [(0.0, 0.0, 0.0), (H['low'], H['crouch'], 0.0), (H['off'], H['lift'], v0)])
    if t < H['land']:
        return _flight(H['off'], H['lift'], v0, H['apex'], t)
    return _hermite(t, [(H['land'], H['lift'], -v0), (0.64, -0.016, 0.0), (0.74, 0.003, 0.0), (0.81, 0.0, 0.0)])


SLACK, SOFT = 0.008, 0.012    # how far a leg's top may rise before its hoof leaves the ground (u); the take-off's softness


def _hop_targets(feet, P):
    """Each hoof's ground target under the hop's body P: on the ground while its leg's top has risen less than SLACK, then
    rising with it, the two joined by a smooth max (a softplus SOFT wide). The knee stays bent, so the IK never runs out of
    reach: a leg snapping straight as the body passes its full reach flicked the hoof 40 mm in one key (ruling R26)."""
    M, B, out = common.fk(feet.arm, P), feet.arm.data.bones, {}
    soft = lambda x: (x + math.sqrt(x * x + SOFT * SOFT)) / 2
    for leg, (top, _, _) in feet.chains.items():
        rise = (M[B[f'leg_{leg}_1'].parent.name] @ Vector(top)).y - top[1]
        g = feet.ground[leg]
        out[leg] = (g[0], max(0.0, soft(rise - SLACK) - soft(-SLACK)), g[2])
    return out


def hop(t, feet):
    """0.9 s once: a playful buck. A crouch (0.15 s, the head dipping), the launch, a flight that tops out with the rear
    kicked up and the body twisting (the hind legs kick back, the forelegs reach forward), a landing that gives and settles.
    The head, ears, beard and tail lag the body throughout. The hooves stay planted (IK, _hop_targets) until the body lifts
    them, and blend to the air pose (A) only while off the ground."""
    y = _hop_y(t)
    air = common.bump(t, 0.24, 0.62)              # the legs' share of the air pose
    kick = common.bump(t, 0.28, 0.6)
    twist = 18 * common.bump(t, 0.28, 0.66)
    lagh = lambda dt: _hop_y(t - dt) if t - dt > 0 else 0.0
    R = {}
    _add(R, 'hips', common.rot(Y, twist) @ common.rot(X, -18 * kick))
    _add(R, 'spine', common.rot(Y, -0.8 * twist) @ common.rot(X, 11 * kick))
    head_up = -160 * (lagh(0.06) - y)          # the head trails the body's rise and fall
    _add(R, 'neck', common.rot(X, 10 * common.bump(t, 0.0, 0.3) + 0.5 * head_up + 4 * kick))
    _add(R, 'head', _head_turn(pitch=0.5 * head_up, roll=-6 * common.bump(t, 0.32, 0.7)))
    flop = -200 * (lagh(0.09) - y)             # the ears trail further
    _add(R, 'ear_L', _ear_turn('L', lift=max(-22, min(22, flop)), fwd=-6 * common.bump(t, 0.0, 0.3)))
    _add(R, 'ear_R', _ear_turn('R', lift=max(-22, min(22, flop)), fwd=-6 * common.bump(t, 0.0, 0.3)))
    _add(R, 'jaw', _head_turn(pitch=4 * common.bump(t, 0.35, 0.75)))   # the beard swings after the head
    _add(R, 'tail_1', _tail_turn(side=_flicks(t, [(0.55, 0.3, 5.0, 9)]), lift=12 * common.bump(t, 0.15, 0.75)))
    P = common.pose(R, {'hips': {'loc': (0, y, 0)}})
    G = feet.planted(P, _hop_targets(feet, P))
    A = {'leg_FL_1': (-16, 0, 0), 'leg_FL_2': (14, 0, 0), 'leg_FR_1': (-18, 0, 0), 'leg_FR_2': (16, 0, 0),
         'leg_BL_1': (14, 0, 0), 'leg_BL_2': (-10, 0, 0), 'leg_BR_1': (13, 0, 0), 'leg_BR_2': (-10, 0, 0)}
    out = dict(G)
    for b, a in A.items():
        g = G[b]['rot']
        out[b] = {'rot': tuple((1 - air) * p + air * q for p, q in zip(g, a))}
    return out


SHAKE = dict(duration=0.8)


def head_shake(t, feet):
    """0.8 s once: shakes the head about its own long axis, four swings dying away (the neck turning a little with it), the
    eyes squeezed shut while it shakes; the ears and the beard flop a beat behind the head, the tail flicks after."""
    D = SHAKE['duration']
    end = common.ramp(D - t, 0.0, 0.2)            # everything, lagging parts too, is back at rest by the end
    s = lambda tt: math.sin(2 * math.pi * 4.2 * max(tt - 0.05, 0.0)) * math.exp(-2.2 * max(tt - 0.05, 0.0))
    e = lambda tt: common.ramp(tt, 0.0, 0.1) * end
    env = e(t)
    R = {}
    _add(R, 'neck', common.rot(Y, 5 * env * s(t - 0.03)) @ common.rot(Z, 4 * env * s(t - 0.03)))
    _add(R, 'head', _head_turn(roll=20 * env * s(t), yaw=6 * env * s(t)))
    flop = e(t - 0.07) * s(t - 0.07)
    _add(R, 'ear_L', _ear_turn('L', lift=22 * flop))
    _add(R, 'ear_R', _ear_turn('R', lift=-22 * flop))
    _add(R, 'jaw', _head_turn(yaw=-6 * e(t - 0.06) * s(t - 0.06)))
    _add(R, 'tail_1', _tail_turn(side=_flicks(t, [(0.42, 0.36, 5.0, 10)])))
    shut = common.ramp(t, 0.04, 0.12) * common.ramp(0.62 - t, 0.0, 0.1)
    P = common.pose(R, {'lid_L': {'scale': shut}, 'lid_R': {'scale': shut}})
    return _planted(feet, P)


def clips(arm):
    """The goat's six clips; every frame goes through feet.check(), which logs a clip whose final pose still sinks into the
    ground (ruling R25)."""
    feet = common.Feet(arm, next(c for c in arm.children if c.type == 'MESH'))
    fns = [('Idle', 'loop', IDLE['duration'], lambda t: idle(t, feet)), ('Walk', 'loop', WALK['duration'], lambda t: walk(t, feet)),
           ('Graze', 'loop', GRAZE['duration'], lambda t: graze(t, feet)), ('Chew', 'loop', CHEW['duration'], lambda t: chew(t, feet)),
           ('Hop', 'once', HOP['duration'], lambda t: hop(t, feet)), ('HeadShake', 'once', SHAKE['duration'], lambda t: head_shake(t, feet))]
    return [(name, kind, d, feet.checked(name, fn)) for name, kind, d, fn in fns]


if __name__ == '__main__':
    common.run(sys.modules[__name__])
