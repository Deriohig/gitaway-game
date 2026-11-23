"""sheep.py -- the sheep's rig: public/models/sheep_meshy_sized.glb -> sheep_rig.glb (common.py does the work; README.md has the
workflow).
    art/blender/rigs/build.sh sheep

The source is the owner's pick after the Blender pilot, "Meshy, resized and rigged": the Meshy sheep (art/meshy-garden's
public/models/sheep_meshy.glb, sha256 1afbb36b...) fitted to today's sheep.glb size template by art/scripts/rig-fit-source.mjs
(one uniform scale, 0.997209, fitting the template's 0.74 height and 0.81 length together; its hooves' footprint centred where
today's stand; base on y 0; atlas bytes untouched). build.sh passes it as this rig's --source.

Landmarks are glTF coordinates on that source (the sheep faces +Z, its left is +X), measured with orthographic renders,
vertex queries, ray casts and geodesic walks (Task 8 probes):
  - hooves from the vertices below y 0.012 (centres; the toes are each hoof's front). The legs show only 12-13 cm below the
    fleece (a ring at y 0.05, the fleece's lower edge at y 0.12-0.14), so the knees sit in that short visible leg;
  - the source's Head node holds the face, the ears and the wool topknot, welded to the fleece along a cut ring (94
    vertices, centre (0.0483, 0.5274, 0.2349)): the head joint is that centre, as the goat's;
  - the head is modelled turned 43.5 deg to the sheep's left (from the eyes and the nose tip), level (roll 1 deg); its face
    slopes 35 deg from the eyes down to the nose, which is the face's shape, not a nod (the eyes and the face front look
    level: their surface normals lie within 3 deg of level). rest() straightens the yaw and roll (ruling R29: the rest pose is
    neutral and symmetric, the head facing forward) and keeps that slope (PITCH): the neck swings NECK_SWING deg so the nose
    lands on the midline, the head turns the rest; head, jaw and ear turns are made in the head's own axes (HEAD_AXES);
  - the eyes from close-ups square onto each painted eye (ray-cast onto the surface): 4 cm cartoon eyes, the right one at a
    UV seam; the fur texel above each from a uniform patch of the face's brown just above it;
  - the ears stick out sideways, welded to the head: each is walked from its tip (common.in_reach) to 0.11 u, where the walk
    reaches the side of the skull;
  - there is no modelled mouth, only a painted smile: the jaw is the lower muzzle below that line (_jaw_region, a band across
    the mouth line in the face's own axes);
  - the tail is a separate tuft (174 vertices) 8 mm off the rump: its own shell (common.in_shell) rides tail_1, hinged at the
    point nearest the rump. It sits 6 cm left of the midline as modelled, kept (a tuft, not a turned head).

Weights follow the README's quadruped weighting recipe and the goat's lessons, bent to a sheep that is a ball of fleece on
13 cm of leg with its head set on the front of it:
  - legs: each leg's top sits just above the fleece's lower edge (TOP_Y 0.21, not inside the body's middle), so a stepping or
    folding leg drags the fleece skirt round it 2 cm instead of 4 (Walk 1.97x with the top at 0.30, 1.33x now); the front
    knee is a carpus in front of the shoulder-hoof line, so it folds forward (the goat's lesson); each leg is pure leg up its
    visible length (LEG_REACH: the walk from the hoof front reaches the fleece at 0.17-0.21 u) and banded 12 cm into the
    fleece, the rest of the band's weight kept on the body bones; off its band a leg hands what bone heat gave it to its parent
    (TAPER), as the chicken's do;
  - the neck is a collar of fleece round the head (weights(), neck_share): all of the body weight within 5 cm of the head's
    cut ring, none beyond 42 cm, none on the chest and the legs' tops, so a nod spreads over the fleece (bone heat and a joint
    ramp ended the neck 10 cm behind the head, beside the hips: a 30 deg nod tore the back at 1.94x);
  - the head banded at its cut ring (12 cm in, 6 cm out: the 29 deg the head turns at rest squeezes a narrower band on one
    side), the ears at their roots, the jaw across the mouth line, the tail tuft rigid.

Clips: Idle, Walk and Graze (loops), Hop and Bleat (once). Overlapping action throughout: the head leads a look and the neck
follows; after the body moves, the head, ears and tail lag it; chewing is never regular (each chew its own size, length and
sideways grind); every loop holds whole cycles of everything in it.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

ID, FACING = 'sheep', '+Z'
MID = 0.0                                      # the body's midline x: the hooves' footprint centre (rig-fit-source)
PAWS = {'FL': (0.0859, 0.015, 0.1543), 'FR': (-0.0834, 0.015, 0.1621), 'BL': (0.0969, 0.015, -0.1801),
        'BR': (-0.0994, 0.015, -0.1364)}
TOES = {'FL': (0.0859, 0.0, 0.1942), 'FR': (-0.0834, 0.0, 0.2047), 'BL': (0.0969, 0.0, -0.1368), 'BR': (-0.0994, 0.0, -0.0973)}
TOP_Y, KNEE_Y, KNEE_FWD, HIP_FWD, HOCK_BACK = 0.21, 0.08, 0.035, 0.02, 0.03


def _legs():
    """top, knee per leg. Front: the shoulder straight above the hoof, the knee (a carpus) KNEE_FWD in front of the
    shoulder-hoof line at KNEE_Y. Hind: the hip HIP_FWD forward of the hoof, the hock HOCK_BACK behind it at KNEE_Y."""
    out = {}
    for leg, (x, _, z) in PAWS.items():
        if leg[0] == 'F':
            out[leg] = ((x, TOP_Y, z), (x, KNEE_Y, z + KNEE_FWD))
        else:
            out[leg] = ((x, TOP_Y, z + HIP_FWD), (x, KNEE_Y, z - HOCK_BACK))
    return out


LEGS = _legs()
HIPS, BACK, NECK_BASE = (MID, 0.34, -0.20), (MID, 0.37, -0.02), (MID, 0.40, 0.08)
HEAD_JOINT = (0.0483, 0.5274, 0.2349)          # centre of the Head cut ring
NOSE = (0.1758, 0.4823, 0.3873)                # the nose tip vertex (the head's front-most along its own forward)
EYES = {'L': dict(centre=(0.1645, 0.5383, 0.2908), top=(0.1635, 0.5588, 0.2909), radius=(0.022, 0.020), dome=0.005),
        'R': dict(centre=(0.0746, 0.5362, 0.3741), top=(0.0747, 0.5577, 0.3736), radius=(0.024, 0.021), dome=0.005)}
LID_SIDES = 12
FUR_UV = {'L': (0.769, 0.39584), 'R': (0.85854, 0.33554)}     # the brown texel just above each eye (Blender UV)
EAR_TIPS = {'L': (0.2452, 0.5201, 0.1345), 'R': (-0.0811, 0.5171, 0.441)}
EAR_ROOTS = {'L': (0.170, 0.540, 0.183), 'R': (-0.034, 0.543, 0.375)}
TAIL_ROOT, TAIL_END = (0.07, 0.37, -0.298), (0.056, 0.39, -0.39)
TAIL_SHELL = (0.056, 0.39, -0.394)             # the tuft's back: on its own shell


def _bone(name, head, tail, parent):
    return dict(name=name, head=head, tail=tail, parent=parent)


# ---- the head's axes as modelled ----

def _frame():
    """The head's axes as modelled (glTF): left from the right eye to the left one, up square to it and the line from
    between the eyes to the nose tip, forward = left x up."""
    eL, eR, tip = Vector(EYES['L']['centre']), Vector(EYES['R']['centre']), Vector(NOSE)
    left = (eL - eR).normalized()
    up = (tip - (eL + eR) / 2).cross(left).normalized()
    return left, up, left.cross(up)


EYE_MID = tuple((Vector(EYES['L']['centre']) + Vector(EYES['R']['centre'])) / 2)
PITCH = math.degrees(math.asin(-_frame()[2].y))    # the face's slope as modelled, kept at rest (35.0 deg)


def _local(p):
    """p (glTF, as modelled) in the face's axes: (left, up, forward) from between the eyes."""
    d = Vector(p) - Vector(EYE_MID)
    return tuple(d.dot(a) for a in _frame())


def _from_local(left, up, fwd):
    L, U, F = _frame()
    return tuple(Vector(EYE_MID) + L * left + U * up + F * fwd)


MUZZLE = _from_local(0.0, -0.02, 0.06)         # the head bone's tail: inside the muzzle
SKULL = _from_local(0.0, 0.0, -0.06)
JAW_HINGE, CHIN = _from_local(0.0, -0.06, 0.02), _from_local(0.0, -0.085, 0.09)


def _lid(side):
    top = Vector(EYES[side]['top'])
    return _bone('lid_' + side, tuple(top), tuple(top + (top - Vector(SKULL)).normalized() * 0.01), 'head')


BONES = [_bone('root', (0, 0, 0), (0, 0.06, 0), None),
         _bone('hips', HIPS, BACK, 'root'),
         _bone('spine', BACK, NECK_BASE, 'hips'),
         _bone('neck', NECK_BASE, HEAD_JOINT, 'spine'),
         _bone('head', HEAD_JOINT, MUZZLE, 'neck'),
         _bone('jaw', JAW_HINGE, CHIN, 'head'),
         _bone('ear_L', EAR_ROOTS['L'], EAR_TIPS['L'], 'head'), _bone('ear_R', EAR_ROOTS['R'], EAR_TIPS['R'], 'head'),
         _lid('L'), _lid('R'),
         _bone('tail_1', TAIL_ROOT, TAIL_END, 'hips')]
for _leg in ('FL', 'FR', 'BL', 'BR'):
    BONES += [_bone(f'leg_{_leg}_1', LEGS[_leg][0], LEGS[_leg][1], 'spine' if _leg[0] == 'F' else 'hips'),
              _bone(f'leg_{_leg}_2', LEGS[_leg][1], PAWS[_leg], f'leg_{_leg}_1')]
LIVE = ['head', 'neck', 'lid_L', 'lid_R', 'ear_L', 'ear_R', 'tail_1']
# ruling R31: the game's live-look clamp (rigs.json look), measured on the built rig as rigs.test's lookPose applies it at rest:
# the largest whole 5 deg of yaw (pitch 0), then of pitch, whose ellipse keeps AR4 <= 1.6 on these bones
LOOK = dict(yaw=25, pitch=25, bones=['neck', 'head'])
REST_CHANGED = ['neck', 'head', 'jaw', 'ear_L', 'ear_R', 'lid_L', 'lid_R']   # rest() straightens the head (R29)


# ---- weights ----

INSET = {'Head': (0.12, 0.06)}                   # the head's blend band into and out of its cut ring
EAR_REACH = (0.11, 0.02, 0.03)                   # length, inset, outset from each ear tip
JAW_BAND = dict(mouth=-0.047, inset=0.012, outset=0.012, side=(0.06, 0.085), low=(-0.135, -0.11), front=(0.0, 0.03))
LEG_REACH = {'F': (0.21, 0.04, 0.12), 'B': (0.21, 0.04, 0.12)}
JOINTS = {**{f'leg_{leg}_2': 0.045 for leg in LEGS},    # knees and hocks: ramps 9 cm long
          'spine': 0.08}


TAPER = {}     # region() fills it: the legs'


def _smooth(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def _jaw_region(mesh):
    """The lower muzzle in the face's own axes, on the Head node only: below the painted mouth line (local up < mouth,
    banded `inset` above and `outset` below it), within side[0] of the midline (banded out to side[1]), above the throat
    (banded between low[0] and low[1]) and in front of the eyes (banded between front[0] and front[1]), so the jaw never
    reaches the cut ring under the head. A skin() predicate with a blend, as in_plane's."""
    B, on_head = JAW_BAND, common.in_part(mesh, 'Head')

    def share(p):
        if not on_head(p):
            return 0.0
        left, up, fwd = _local(p)
        a = _smooth((B['mouth'] + B['outset'] - up) / (B['inset'] + B['outset']))
        b = _smooth((B['side'][1] - abs(left)) / (B['side'][1] - B['side'][0]))
        c = _smooth((up - B['low'][0]) / (B['low'][1] - B['low'][0]))
        d = _smooth((fwd - B['front'][0]) / (B['front'][1] - B['front'][0]))
        return a * b * c * d

    def f(p):
        return share(p) >= 1.0

    def blend(p):
        s = share(p)
        return (s, s >= 0.5) if 0.0 < s < 1.0 else None

    f.blend, f.keep = blend, False
    return f


def region(mesh):
    """The Head node's vertices go to the head subtree, banded at the cut ring; each ear by reach from its tip, banded at its
    root; the jaw across the mouth line; the tail tuft's own shell; each leg as LEG_REACH says, the rest of its band's
    weight kept on the body bones each vertex had."""
    r = {'head': common.in_part(mesh, 'Head', *INSET['Head']),
         'ear_L': common.in_reach(mesh, EAR_TIPS['L'], *EAR_REACH), 'ear_R': common.in_reach(mesh, EAR_TIPS['R'], *EAR_REACH),
         'jaw': _jaw_region(mesh),
         'tail_1': common.in_shell(mesh, TAIL_SHELL, 'sheep')}
    for leg, tip in TOES.items():
        f = r[f'leg_{leg}_1'] = common.in_reach(mesh, tip, *LEG_REACH[leg[0]], keep=True)
        # bone heat gives the legs some of the fleece's sides beyond their bands, and with that zeroed and nothing else left
        # there the nearest bone, a leg, took those vertices whole (1.97x at the shoulder's skirt in Walk): off its region and
        # band each leg hands what bone heat gave it to its parent, as the chicken's do
        TAPER[f'leg_{leg}_1'] = TAPER[f'leg_{leg}_2'] = (lambda f: lambda p: 1.0 if f(p) or f.blend(p) is not None else 0.0)(f)
    return r


NECK_W = dict(near=0.05, far=0.42, low=(0.32, 0.46), tilt=0.5, z0=0.1)
REST_POW = 3


def neck_share(d, p):
    """The neck's share of a fleece vertex's body weight (hips + spine + neck), from its distance d to the head's cut ring and
    its place p (glTF): all of it within NECK_W near of the ring, none beyond far (a smooth fall between), and none below
    low[0] (the chest and the legs' tops stay on the spine), all from low[1] up, the height h = y + tilt (z - z0) measured
    above a plane that slopes down to the front, so the throat under the head goes with the neck and the shoulders do not."""
    W = NECK_W
    h = p[1] + W['tilt'] * (p[2] - W['z0'])
    return _smooth((W['far'] - d) / (W['far'] - W['near'])) * _smooth((h - W['low'][0]) / (W['low'][1] - W['low'][0]))


def weights(mesh, arm):
    """Replaces how skin() split each vertex's body weight between hips, spine and neck: the neck takes neck_share() of it, a
    collar of fleece round the head that thins out over 37 cm, and hips and spine the rest in the proportion they had. The
    sheep has no neck to speak of (its head sits on the fleece), so the neck's bend has to spread over the fleece: bone heat
    and a joint ramp ended the neck 10 cm behind the head on top, beside the hips, and a 30 deg nod tore the back at 1.94x."""
    V, head = mesh.data.vertices, set(mesh['parts']['Head'])
    body = common._kdtree([V[i].co for i in range(len(V)) if i not in head])
    ring = common._kdtree([V[i].co for i in head if body.find(V[i].co)[2] <= common.WELD])
    names = {g.index: g.name for g in mesh.vertex_groups}
    _COLLAR.clear()
    for v in V:
        w = {names[g.group]: g.weight for g in v.groups}
        T = sum(w.get(b, 0.0) for b in ('hips', 'spine', 'neck'))
        if T > 0:
            hs = w.get('hips', 0.0) + w.get('spine', 0.0)
            _COLLAR[v.index] = (neck_share(ring.find(v.co)[2], common.b2g(v.co)), T, w.get('hips', 0.0) / hs if hs > 0 else 0.0,
                                {b: x for b, x in w.items() if b not in ('hips', 'spine', 'neck')})
    _collar(mesh, lambda s: s)


_COLLAR = {}    # vertex: (its neck share, its body weight, hips' part of hips + spine, its other bones' weights), from weights()


def _collar(mesh, f):
    """Sets each fleece vertex's neck weight to f(share) of its body weight (hips and spine the rest, as they had it), its
    other bones as they were; at most 4 bones, the smallest dropped."""
    G = {g.name: g for g in mesh.vertex_groups}
    V = mesh.data.vertices
    for i, (s, T, hip, other) in _COLLAR.items():
        n = f(s)
        w = {**other, 'neck': n * T, 'hips': (1 - n) * T * hip, 'spine': (1 - n) * T * (1 - hip)}
        top = dict(sorted(((b, x) for b, x in w.items() if x > 1e-6), key=lambda kv: (-kv[1], kv[0]))[:4])
        k = sum(top.values())
        have = {g.group for g in V[i].groups}
        for b in w:
            if b in top:
                G[b].add([i], top[b] / k, 'REPLACE')
            elif G[b].index in have:
                G[b].remove([i])


def rest(mesh, arm):
    """Straightens the head (ruling R29): the face turns by REST_TURN to look down +Z with its eyes level and its modelled
    slope (PITCH), the nose tip on the midline (`neck` swings NECK_SWING deg, `head` takes the rest of the turn); both are
    baked into the mesh and the bones (common.apply_rest). Needs weights() to have run first (common.run calls it before
    rest): the bake swings the collar with the shares weights() keeps."""
    if not _COLLAR:
        raise RuntimeError('sheep.rest: no collar shares (weights() must run before rest(): the bake swings the collar with '
                           'them, and without them the neck swing would bake into the mesh with bone heat\'s neck)')
    fwd = _frame()[2]
    common.log(f'head modelled turned: yaw {math.degrees(math.atan2(fwd.x, fwd.z)):.1f} deg (to its left), pitch '
               f'{math.degrees(math.asin(-fwd.y)):.1f} deg down (its face\'s slope, kept); straightened by '
               f'{tuple(round(a, 1) for a in common.euler(REST_TURN))} (x, y, z deg), the neck swung {NECK_SWING:.1f} deg')
    nose = min(range(len(mesh.data.vertices)), key=lambda i: (mesh.data.vertices[i].co - common.g2b(NOSE)).length)
    N = common.rot(Y, NECK_SWING)
    # the bake is a sculpt, not the skinning: it swings the collar with share^REST_POW, so the collar's thin outer fringe
    # (shares under 0.2, which AR3 still checks against the source, ruling R10) moves under a millimetre, while the inner
    # collar carries the swing; the skin keeps the full collar shares afterwards
    _collar(mesh, lambda s: s ** REST_POW)
    common.apply_rest(mesh, arm, {'neck': common.euler(N), 'head': common.euler(N.transposed() @ REST_TURN)})
    _collar(mesh, lambda s: s)
    x = common.b2g(mesh.data.vertices[nose].co)[0]
    common.log(f'straightened: nose tip x {x:.4f} vs midline {MID}')
    if abs(x - MID) > 0.002:
        raise ValueError(f'nose tip x {x:.4f} is {abs(x - MID):.4f} off the midline {MID}')


X, Y, Z = common.X, common.Y, common.Z


def _straighten():
    """The rotation that turns the modelled head's axes (_frame: 43.5 deg to its left, rolled 1 deg) onto +X left and forward
    along +Z, PITCH deg down (its own slope)."""
    p = math.radians(PITCH)
    left, fwd = Vector((1, 0, 0)), Vector((0, -math.sin(p), math.cos(p)))
    return Matrix((left, fwd.cross(left), fwd)).transposed() @ Matrix(_frame())


REST_TURN = _straighten()
HEAD_AXES = tuple(REST_TURN @ a for a in _frame())    # the head's axes at the (straightened) default pose


def _neck_swing():
    """The neck's yaw (deg) that carries the straightened head so the nose tip lies on the midline: the cut ring, the head
    joint, sits 4.8 cm left of it (the head turned with it), so turning the head alone about it leaves the nose off the
    midline. The neck swings the head joint across and the head turns as much less."""
    J, B = Vector(HEAD_JOINT), Vector(NECK_BASE)
    off = REST_TURN @ (Vector(NOSE) - J)
    lo, hi = -40.0, 40.0
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
    root, tip = (Vector(rested(p)) for p in (EAR_ROOTS[side], EAR_TIPS[side]))
    d, up = (tip - root).normalized(), HEAD_AXES[1]
    a = d.cross(up).normalized()
    if side == 'R':
        a = -a
    return common.rot(up, fwd if side == 'R' else -fwd) @ common.rot(a, lift)


_TAIL_D = (Vector(TAIL_END) - Vector(TAIL_ROOT)).normalized()


def _tail_turn(side=0.0, lift=0.0):
    """tail_1's rotation: side (positive: the tuft swings to the sheep's left) about the axis square to the tail in its
    upright plane, lift (positive: up) about X."""
    return common.rot(X, lift) @ common.rot(_TAIL_D.cross(X).normalized(), side)


def _add(R, bone, M):
    R[bone] = M @ R.get(bone, Matrix.Identity(3))


def _wags(t, bursts):
    """Tail wags: each burst (start, length, hz, deg) a quick side-to-side, rising and dying away."""
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
    """3 s loop: two breaths (the fleece rises), a slow weight shift over planted hooves, a look round (the head leads, the
    neck follows), an ear flick each side at different times, a tail wag, one blink, and a short chew."""
    D = IDLE['duration']
    w = 2 * math.pi * t / D
    breath = 0.5 - 0.5 * math.cos(2 * w)
    dx, roll = 0.004 * math.sin(w), 1.0 * math.sin(w)
    look = 14 * (common.ramp(t, 0.3, 0.8) - common.ramp(t, 1.4, 1.95)) - 8 * (common.ramp(t, 2.1, 2.45) - common.ramp(t, 2.6, 2.95))
    neck_look = 14 * (common.ramp(t, 0.4, 1.0) - common.ramp(t, 1.5, 2.1)) - 8 * (common.ramp(t, 2.15, 2.55) - common.ramp(t, 2.6, 2.98))
    R = {}
    _add(R, 'hips', common.rot(Z, roll))
    _add(R, 'spine', common.rot(X, -0.8 * breath))
    _add(R, 'neck', common.rot(Y, 0.5 * neck_look) @ common.rot(X, 0.6 * breath))
    _add(R, 'head', _head_turn(pitch=-0.6 * breath + 2 * common.bump(t, 1.2, 1.7), yaw=0.5 * look,
                               roll=-3 * (common.ramp(t, 0.35, 0.85) - common.ramp(t, 1.45, 1.95))))
    o, g = _chews(t, [(2.3, 0.26, 3.6, 1.1), (2.6, 0.24, 2.6, -0.9)])
    _add(R, 'jaw', _head_turn(pitch=o, yaw=g))
    flickR = common.bump(t, 1.0, 1.2) + 0.6 * common.bump(t, 1.25, 1.4)
    flickL = common.bump(t, 2.2, 2.38)
    sway = 3 * (common.ramp(t, 0.4, 0.9) - common.ramp(t, 1.5, 2.0))      # the ears trail the look a little
    _add(R, 'ear_L', _ear_turn('L', lift=13 * flickL + 1.5 * breath, fwd=-10 * flickL + sway))
    _add(R, 'ear_R', _ear_turn('R', lift=12 * flickR + 1.5 * breath, fwd=-9 * flickR - sway))
    _add(R, 'tail_1', _tail_turn(side=_wags(t, [(0.5, 0.45, 4.5, 14), (1.9, 0.4, 4.5, 10)]), lift=2 * breath))
    blink = common.bump(t, 1.62, 1.8)
    P = common.pose(R, {'hips': {'loc': (dx, 0.0015 * breath, 0)}, 'lid_L': {'scale': blink}, 'lid_R': {'scale': blink}})
    return _planted(feet, P)


WALK = dict(duration=0.9, swing_deg=15, lift=0.03)


def walk(t, feet):
    """0.9 s quadruped walk: gait() legs with the hooves planted on the ground; the body rolls a little with each step, the
    head nods twice a stride (the neck counters half), the ears bounce a beat behind the nod, the tail sways once a stride."""
    D, w = WALK['duration'], 2 * math.pi * t / WALK['duration']
    nod = 2.5 * math.sin(2 * w)
    R = {}
    _add(R, 'hips', common.rot(Z, 1.2 * math.sin(w)))
    _add(R, 'neck', common.rot(X, -0.5 * nod))
    _add(R, 'head', _head_turn(pitch=nod, roll=-1.2 * math.sin(w)))
    bounce = math.sin(2 * w - 1.2)          # the ears trail the nod
    _add(R, 'ear_L', _ear_turn('L', lift=-6 * bounce))
    _add(R, 'ear_R', _ear_turn('R', lift=-6 * bounce))
    _add(R, 'tail_1', _tail_turn(side=8 * math.sin(w - 0.8), lift=3 * math.sin(2 * w - 1.6)))
    return common.merge(common.gait(t, D, common.QUADRUPED, WALK['swing_deg'], WALK['lift'], legs=feet.chains, feet=feet),
                        common.pose(R))


# the head down at the grass, the face forward and 80-84 deg down: the whole body sinks `drop` u on its folding legs and
# tips `hips` deg, the fleece collar (the neck) nods `neck` deg about its base and slides `neck_loc` down and forward (the
# collar is wide, NECK_W, so the slide spreads over the fleece), the head turns `head` deg. The face may not pass the vertical
# (rigs.test), which caps the nod at about 45 deg all told, and the legs show only 13 cm, so the sinking body (the forelegs'
# junction with the fleece) and the collar's slide are what bring the nose down: to 70-77 mm off the ground, 22 cm in front of
# the forehooves, at 1.53x (rigs.test's Graze check; the goat reached 80-86 mm)
GRAZE = dict(duration=2.4, hips=2, drop=-0.06, shift=0.0, neck=36, neck_loc=(0.0, -0.10, 0.02), head=0, reach=0.0, splay=0.0,
             chews=[(0.05, 0.3, 6.8, 2.4), (0.38, 0.26, 5.4, -2.0), (0.68, 0.32, 7.2, 2.7), (1.05, 0.25, 4.6, -1.7),
                    (1.72, 0.3, 6.4, 2.2), (2.05, 0.29, 5.8, -2.4)])


def graze(t, feet):
    """2.4 s loop: head down at the grass (the body sinks and tips forward, the collar and the head pitched down), chewing six
    times, each chew its own size, length and grind (jaw within 7.2 deg), a tug at the grass at 1.35 s (the head jerks
    sideways, the ears flick a beat later), the head sweeping slowly left and back, the tail swishing once."""
    G, D = GRAZE, GRAZE['duration']
    w = 2 * math.pi * t / D
    tug = common.bump(t, 1.32, 1.62)
    tug_lag = common.bump(t, 1.4, 1.75)
    sweep = math.sin(w)
    R = {}
    _add(R, 'hips', common.rot(X, G['hips']))
    _add(R, 'neck', common.rot(Y, 3 * sweep + 3 * tug) @ common.rot(X, G['neck']))
    _add(R, 'head', _head_turn(pitch=G['head'] + 1.2 * math.sin(3 * w), yaw=3 * math.sin(w - 0.5) - 4 * tug, roll=4 * tug))
    o, g = _chews(t, G['chews'])
    _add(R, 'jaw', _head_turn(pitch=o, yaw=g))
    _add(R, 'ear_L', _ear_turn('L', lift=-8 + 12 * tug_lag, fwd=5 - 5 * tug_lag))
    _add(R, 'ear_R', _ear_turn('R', lift=-8 + 10 * tug_lag + 3 * math.sin(w + 1), fwd=5))
    _add(R, 'tail_1', _tail_turn(side=_wags(t, [(0.7, 0.5, 4.5, 12)]), lift=-2))
    P = common.pose(R, {'hips': {'loc': (0, G['drop'], G['shift'])}, 'neck': {'loc': G['neck_loc']}})
    g = feet.ground
    return feet.planted(P, {'FL': (g['FL'][0] + G['splay'], 0.0, g['FL'][2] + G['reach']),
                            'FR': (g['FR'][0] - G['splay'], 0.0, g['FR'][2] + G['reach']), 'BL': g['BL'], 'BR': g['BR']})


# the body's height: a crouch to `crouch` at `low` s, the launch (leaving at `lift` u at `off` s), a parabola topping out at
# `apex`, the landing at `land` s: at the top, with the legs tucked, the whole sheep is 51 mm off the ground (the brief: <= 0.06)
HOP = dict(duration=0.8, crouch=-0.008, low=0.13, off=0.28, land=0.46, lift=0.028, apex=0.042, dip=-0.007)


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
    return _hermite(t, [(H['land'], H['lift'], -v0), (0.55, H['dip'], 0.0), (0.62, 0.002, 0.0), (0.68, 0.0, 0.0)])


SLACK, SOFT = 0.006, 0.016    # how far a leg's top may rise before its hoof leaves the ground (u); the take-off's softness


def _hop_targets(feet, P):
    """Each hoof's ground target under the hop's body P: on the ground while its leg's top has risen less than SLACK, then
    rising with it, the two joined by a smooth max (a softplus SOFT wide), so the hoof lifts smoothly (ruling R26)."""
    M, B, out = common.fk(feet.arm, P), feet.arm.data.bones, {}
    soft = lambda x: (x + math.sqrt(x * x + SOFT * SOFT)) / 2
    for leg, (top, _, _) in feet.chains.items():
        rise = (M[B[f'leg_{leg}_1'].parent.name] @ Vector(top)).y - top[1]
        g = feet.ground[leg]
        out[leg] = (g[0], max(0.0, soft(rise - SLACK) - soft(-SLACK)), g[2])
    return out


def hop(t, feet):
    """0.8 s once: a springy bounce on stiff legs (a sheep's pronk, small). A crouch (the head dipping), the launch, a flight
    with the back arched a little and the legs tucked, a landing that gives and settles. The head, ears and tail lag the
    body throughout. The hooves stay planted (IK, _hop_targets) until the body lifts them, and blend to the air pose (A)
    only while off the ground."""
    y = _hop_y(t)
    air = common.bump(t, 0.2, 0.52)               # the legs' share of the air pose
    arch = common.bump(t, 0.24, 0.54)
    lagh = lambda dt: _hop_y(t - dt) if t - dt > 0 else 0.0
    R = {}
    _add(R, 'hips', common.rot(X, -6 * arch) @ common.rot(Y, 5 * arch))
    _add(R, 'spine', common.rot(X, 5 * arch) @ common.rot(Y, -4 * arch))
    head_up = -160 * (lagh(0.06) - y)          # the head trails the body's rise and fall
    _add(R, 'neck', common.rot(X, 8 * common.bump(t, 0.0, 0.28) + 0.5 * head_up))
    _add(R, 'head', _head_turn(pitch=0.5 * head_up, roll=-4 * common.bump(t, 0.3, 0.64)))
    flop = -220 * (lagh(0.09) - y)             # the ears trail further
    _add(R, 'ear_L', _ear_turn('L', lift=max(-22, min(22, flop)), fwd=-5 * common.bump(t, 0.0, 0.28)))
    _add(R, 'ear_R', _ear_turn('R', lift=max(-22, min(22, flop)), fwd=-5 * common.bump(t, 0.0, 0.28)))
    _add(R, 'jaw', _head_turn(pitch=2.5 * common.bump(t, 0.32, 0.7)))
    _add(R, 'tail_1', _tail_turn(side=_wags(t, [(0.5, 0.28, 5.0, 10)]), lift=10 * common.bump(t, 0.13, 0.68)))
    P = common.pose(R, {'hips': {'loc': (0, y, 0)}})
    G = feet.planted(P, _hop_targets(feet, P))
    A = {'leg_FL_1': (-10, 0, 0), 'leg_FL_2': (14, 0, 0), 'leg_FR_1': (-11, 0, 0), 'leg_FR_2': (15, 0, 0),
         'leg_BL_1': (10, 0, 0), 'leg_BL_2': (-12, 0, 0), 'leg_BR_1': (9, 0, 0), 'leg_BR_2': (-12, 0, 0)}
    out = dict(G)
    for b, a in A.items():
        g = G[b]['rot']
        out[b] = {'rot': tuple((1 - air) * p + air * q for p, q in zip(g, a))}
    return out


BLEAT = dict(duration=1.2, jaw=8.0)


def bleat(t, feet):
    """1.2 s once: a call. The head comes up (the neck lifts, the head tips up a beat later), the jaw opens to 8 deg and
    trembles three times as the call wavers ("baa-a-a"), the eyes half close, the ears swing back and down, the body
    braces (spine) with the call and the tail flicks after it; everything settles back to the default pose."""
    D = BLEAT['duration']
    up = common.ramp(t, 0.05, 0.32) * (1 - common.ramp(t, 0.82, 1.12))
    up_lag = common.ramp(t, 0.1, 0.38) * (1 - common.ramp(t, 0.86, 1.16))
    call = common.ramp(t, 0.28, 0.4) * (1 - common.ramp(t, 0.74, 0.86))
    tremble = 1 - 0.18 * math.sin(math.pi * min(max((t - 0.4) / 0.34, 0.0), 1.0) * 3) ** 2
    R = {}
    _add(R, 'spine', common.rot(X, -2 * call))
    _add(R, 'neck', common.rot(X, -8 * up))
    _add(R, 'head', _head_turn(pitch=-22 * up_lag + 1.5 * call * math.sin(2 * math.pi * 8.8 * t)))
    _add(R, 'jaw', _head_turn(pitch=BLEAT['jaw'] * call * tremble))
    ears = common.ramp(t, 0.18, 0.4) * (1 - common.ramp(t, 0.85, 1.15))
    _add(R, 'ear_L', _ear_turn('L', lift=-14 * ears, fwd=-10 * ears))
    _add(R, 'ear_R', _ear_turn('R', lift=-14 * ears, fwd=-10 * ears))
    _add(R, 'tail_1', _tail_turn(side=_wags(t, [(0.8, 0.32, 5.0, 10)])))
    squint = 0.45 * call
    P = common.pose(R, {'lid_L': {'scale': squint}, 'lid_R': {'scale': squint}})
    return _planted(feet, P)


def clips(arm):
    """The sheep's five clips; every frame goes through feet.check(), which logs a clip whose final pose still sinks into the
    ground (ruling R25)."""
    feet = common.Feet(arm, next(c for c in arm.children if c.type == 'MESH'))
    fns = [('Idle', 'loop', IDLE['duration'], lambda t: idle(t, feet)), ('Walk', 'loop', WALK['duration'], lambda t: walk(t, feet)),
           ('Graze', 'loop', GRAZE['duration'], lambda t: graze(t, feet)), ('Hop', 'once', HOP['duration'], lambda t: hop(t, feet)),
           ('Bleat', 'once', BLEAT['duration'], lambda t: bleat(t, feet))]
    return [(name, kind, d, feet.checked(name, fn)) for name, kind, d, fn in fns]


if __name__ == '__main__':
    common.run(sys.modules[__name__])
