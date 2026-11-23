"""hare.py -- the brown hare's rig: public/models/visitor_hare.glb -> hare_rig.glb (common.py does the work; README.md has the
workflow).
    art/blender/rigs/build.sh hare

The source is the Meshy brown hare the owner picked (concept B, art/shelter-hare, spec art/specs/2026-10-25-shelter-hare-design.md
section 3; ruling R28): sitting up, paws tucked, facing +Z, base on y 0, 0.209 x 0.450 x 0.265, one welded shell of 1,647
vertices, mirror-symmetric about x 0 to within half a millimetre. build.sh passes it as this rig's --source (it is the model
the game places today, under its own id).

Landmarks are glTF coordinates on that source (the hare faces +Z, its left is +X), measured with orthographic renders, vertex
queries, ray casts into the texture and geodesic walks (Task 8b probes):
  - the head faces straight ahead and level as modelled (the nose tip on x 0, the eyes at one height), so ruling R29 needs no
    straightening: no rest(), REST_CHANGED stays empty. The ears splay out about 31 deg from the vertical and lean back 17
    deg, the left one turned a little more open (concept B): kept as modelled;
  - the eyes from a ray-cast grid square onto each painted eye, classed by texel colour: a dark-ringed eye 2.3 x 1.9 cm, its
    top 9.5 mm above its centre, in a cream ring; the lid takes the brown fur texel just above the ring (FUR_UV);
  - the ears: walked from each tip, the walk widens onto the skull at 0.13 u; two segments split at the ear's middle;
  - the forelegs stand straight under the chest, the paws together at the midline (their inner faces are welded there, and
    a strip of skin joins the forearms' backs to the belly at y 0.07-0.11): each walked from its paw's front to 0.11 u. The
    elbow (leg_F*_2's head) sits where that strip meets the forearm (y 0.105), so a forearm raised to the face turns about
    the strip instead of tearing it (at y 0.125 the strip stretched 2.3x in Groom);
  - the hind legs are folded in the sit: each long hind foot lies flat along the ground from the heel (z -0.06, under the
    haunch) to the toes (z 0.085); leg_B*_1 runs from the hip to the hock (the heel), leg_B*_2 along the foot;
  - the tail is a short tuft at the back, on the ground (walked from its tip to its root at 0.05 u).

Weights: bone heat with regions (each ear walked from its tip, its tip segment split from its root segment by a joint ramp; the
head above a plane through the nape and the throat, banded 2 cm either side; each foreleg walked from its paw, banded into
the chest with the rest of the band kept on the body bones; each hind foot taken by height (_foot_region), so the haunch above
it stays on the body; the tail by reach), then made mirror-symmetric (weights()): each vertex averages its own weights with
its mirror vertex's, left and right swapped, so the paws' welded midline splits evenly between the two forelegs and a
symmetric pose deforms both sides alike.

Clips: Idle (loop), Look, EarTwitch, Groom, Hop and Alert (once). Overlapping action throughout: the head leads a look and the
neck follows; each ear's tip segment trails its root segment; after the body moves, the head, ears and tail lag it.
"""
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

ID, FACING = 'hare', '+Z'
X, Y, Z = common.X, common.Y, common.Z

# ---- landmarks (glTF, on the source) ----
HIPS, BACK, NECK_BASE = (0.0, 0.075, -0.045), (0.0, 0.155, -0.025), (0.0, 0.222, 0.032)
HEAD_JOINT, MUZZLE = (0.0, 0.272, 0.045), (0.0, 0.29, 0.112)
SKULL = (0.0, 0.31, 0.06)
EARS = {'L': ((0.033, 0.347, 0.038), (0.064, 0.398, 0.020), (0.095, 0.449, 0.006))}     # root, middle, tip
EAR_TIPS = {'L': (0.0947, 0.45, 0.0093)}
TAIL_ROOT, TAIL_END, TAIL_TIP = (0.0, 0.030, -0.097), (0.0, 0.042, -0.130), (0.0001, 0.048, -0.1323)
LEGS = {   # top, knee, paw (the leg_*_2 tail; its ground point lies under it)
    'FL': ((0.024, 0.195, 0.042), (0.022, 0.105, 0.042), (0.015, 0.015, 0.072)),
    'BL': ((0.046, 0.088, -0.035), (0.040, 0.022, -0.062), (0.049, 0.003, 0.080))}
TOES = {'FL': (0.0103, 0.0215, 0.077), 'BL': (0.0472, 0.003, 0.0853)}    # where each leg's walk starts: the paw front, the toes
EYES = {'L': dict(centre=(0.0317, 0.3131, 0.0895), top=(0.0299, 0.3226, 0.0890), radius=(0.0125, 0.0105), dome=0.003)}
FUR_UV = {'L': (0.04957, 0.78784), 'R': (0.41465, 0.35494)}
LID_SIDES = 10


def _mirror(p):
    return (-p[0], p[1], p[2])


for _d in (EARS, EAR_TIPS, EYES, TOES, LEGS):
    for _k in [k for k in _d if k.endswith('L')]:
        _v = _d[_k]
        _m = (tuple(_mirror(p) for p in _v) if isinstance(_v, tuple) and isinstance(_v[0], tuple) else
              _mirror(_v) if isinstance(_v, tuple) else
              {**_v, 'centre': _mirror(_v['centre']), 'top': _mirror(_v['top'])})
        _d[_k[:-1] + 'R'] = _m


def _bone(name, head, tail, parent):
    return dict(name=name, head=head, tail=tail, parent=parent)


def _lid(side):
    top = Vector(EYES[side]['top'])
    return _bone('lid_' + side, tuple(top), tuple(top + (top - Vector(SKULL)).normalized() * 0.01), 'head')


BONES = [_bone('root', (0, 0, 0), (0, 0.04, 0), None),
         _bone('hips', HIPS, BACK, 'root'),
         _bone('spine', BACK, NECK_BASE, 'hips'),
         _bone('neck', NECK_BASE, HEAD_JOINT, 'spine'),
         _bone('head', HEAD_JOINT, MUZZLE, 'neck')]
for _s in 'LR':
    BONES += [_bone(f'ear_{_s}_1', EARS[_s][0], EARS[_s][1], 'head'), _bone(f'ear_{_s}_2', EARS[_s][1], EARS[_s][2], f'ear_{_s}_1')]
BONES += [_lid('L'), _lid('R')]
for _leg in ('FL', 'FR', 'BL', 'BR'):
    BONES += [_bone(f'leg_{_leg}_1', LEGS[_leg][0], LEGS[_leg][1], 'spine' if _leg[0] == 'F' else 'hips'),
              _bone(f'leg_{_leg}_2', LEGS[_leg][1], LEGS[_leg][2], f'leg_{_leg}_1')]
BONES += [_bone('tail_1', TAIL_ROOT, TAIL_END, 'hips')]
LIVE = ['head', 'neck', 'lid_L', 'lid_R', 'ear_L_1', 'ear_R_1']
# ruling R31: the game's live-look clamp, measured on the built rig as rigs.test's lookPose applies it at rest: yaw at the
# spec's cap of 60 (65 would still hold: 1.56x), pitch 40 (the ellipse 1.580x; 45: 1.62x). The head alone: yaw 40, pitch 15
LOOK = dict(yaw=60, pitch=40, bones=['neck', 'head'])
REST_CHANGED = []       # the source faces forward, level and symmetric (ruling R29): nothing to straighten

# ---- weights ----

HEAD_PLANE = ((0.0, 0.262, 0.045), (0.0, 0.959, 0.282))   # through the nape (y 0.27, z 0.015) and the throat (0.245, 0.10)
HEAD_BAND = (0.02, 0.02)
EAR_REACH = (0.125, 0.012, 0.012)
TAIL_REACH = (0.05, 0.012, 0.015)
LEG_REACH = (0.11, 0.02, 0.08)       # each foreleg walked from its paw front: length (the elbow, y 0.12), inset, outset
JOINTS = {**{f'leg_{leg}_2': 0.03 if leg[0] == 'F' else 0.02 for leg in LEGS},
          'ear_L_2': 0.015, 'ear_R_2': 0.015, 'spine': 0.04, 'neck': 0.03}
TAPER = {}     # region() fills it: the legs'


def _sided(f, sx):
    """f restricted to the leg's own side of the midline (x 0 itself counts for both: weights() splits it)."""
    g = lambda p: p[0] * sx >= -1e-4 and f(p)
    g.blend = lambda p: f.blend(p) if p[0] * sx >= -1e-4 else None
    g.keep = getattr(f, 'keep', False)
    return g


def _smooth(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


# a hind foot: below y top[1] (fading in from top[0] down), outside x side[0] of the midline (fading in to side[1]: the cream
# belly between the feet stays on the body), in front of z back[0] (fading in to back[1], under the haunch's back)
FOOT = dict(top=(0.036, 0.024), side=(0.016, 0.026), back=(-0.09, -0.075))


def _foot_region(sx):
    """A skin() region predicate for a hind foot, banded on all three sides as sheep's _jaw_region: the long foot lies flat
    under the haunch, so a walk from the toes would climb the haunch's side and cut it off sideways; this takes the foot by
    height, and the haunch above it stays on the body."""
    F = FOOT

    def share(p):
        return (_smooth((F['top'][0] - p[1]) / (F['top'][0] - F['top'][1])) *
                _smooth((p[0] * sx - F['side'][0]) / (F['side'][1] - F['side'][0])) *
                _smooth((p[2] - F['back'][0]) / (F['back'][1] - F['back'][0])))

    def f(p):
        return share(p) >= 1.0

    def blend(p):
        s = share(p)
        return (s, s >= 0.5) if 0.0 < s < 1.0 else None

    f.blend, f.keep = blend, False
    return f


def region(mesh):
    r = {'head': common.in_plane(*HEAD_PLANE, *HEAD_BAND, ((-0.13, 0.19, -0.06), (0.13, 0.47, 0.16)))}
    for s in 'LR':
        r[f'ear_{s}_1'] = common.in_reach(mesh, EAR_TIPS[s], *EAR_REACH)
    r['tail_1'] = common.in_reach(mesh, TAIL_TIP, *TAIL_REACH)
    for leg, tip in TOES.items():
        sx = 1 if leg[1] == 'L' else -1
        f = r[f'leg_{leg}_1'] = (_sided(common.in_reach(mesh, tip, *LEG_REACH, keep=True), sx) if leg[0] == 'F' else
                                 _foot_region(sx))
        TAPER[f'leg_{leg}_1'] = TAPER[f'leg_{leg}_2'] = (lambda f: lambda p: 1.0 if f(p) or f.blend(p) is not None else 0.0)(f)
    return r


def _swap(b):
    return re.sub(r'(?<=_)([FB]?)([LR])(?=_|$)', lambda m: m.group(1) + ('R' if m.group(2) == 'L' else 'L'), b)


MIRROR_TOL, MIDLINE, PAW_TOP = 0.003, 0.0025, 0.07


def weights(mesh, arm):
    """Mirror-symmetric weights: each vertex takes the mean of its own weights and its mirror vertex's (the nearest vertex to
    (-x, y, z), within MIRROR_TOL) with left and right swapped, at most 4 bones. The forepaws are welded together along the
    midline below PAW_TOP, where the walks reach only part of it (the rest fell to hips and tore 25x when the paws rose):
    there a midline vertex takes its nearest off-midline neighbour's weights, half as they are and half mirrored."""
    names = {g.index: g.name for g in mesh.vertex_groups}
    G = {g.name: g for g in mesh.vertex_groups}
    V = mesh.data.vertices
    W = [{names[g.group]: g.weight for g in v.groups if g.weight > 0} for v in V]
    kd = common._kdtree([v.co for v in V])
    off = [i for i, v in enumerate(V) if common.b2g(v.co)[0] >= MIDLINE]
    side = common._kdtree([V[i].co for i in off])
    paired = 0
    for v in V:
        p = common.b2g(v.co)
        if abs(p[0]) < MIDLINE and p[1] < PAW_TOP:     # between the paws: its nearest neighbour off the midline, mirrored
            j = off[side.find(v.co)[1]]
            src = [(W[j], False), (W[j], True)]
        else:
            _, j, d = kd.find(common.g2b(_mirror(p)))
            if d > MIRROR_TOL:
                continue
            src = [(W[v.index], False), (W[j], True)]
        paired += 1
        w = {}
        for ws, sw in src:
            for b, x in ws.items():
                b = _swap(b) if sw else b
                w[b] = w.get(b, 0.0) + 0.5 * x
        top = dict(sorted(((b, x) for b, x in w.items() if x > 1e-6), key=lambda kv: (-kv[1], kv[0]))[:4])
        k = sum(top.values())
        have = {g.group for g in v.groups}
        for b in sorted(set(w) | set(W[v.index])):     # sorted: set order follows Python's per-run string hashes
            if b in top:
                G[b].add([v.index], top[b] / k, 'REPLACE')
            elif G[b].index in have:
                G[b].remove([v.index])
    common.log(f'weights mirrored on {paired} of {len(V)} vertices')


# ---- pose helpers ----

I3 = Matrix.Identity(3)


def _add(R, bone, M):
    R[bone] = M @ R.get(bone, I3)


_EAR_D = {s: [(Vector(EARS[s][k + 1]) - Vector(EARS[s][k])).normalized() for k in (0, 1)] for s in 'LR'}


def _ear(side, k, up=0.0, back=0.0, twist=0.0):
    """ear_<side>_<k + 1>'s rotation: up (positive: the tip swings in toward the vertical), back (positive: the tip leans
    back), twist (positive: the opening turns outward) about the segment's own length; twist first, then up, then back."""
    sg = 1 if side == 'L' else -1
    return common.rot(X, -back) @ common.rot(Z, sg * up) @ common.rot(_EAR_D[side][k], sg * twist)


REAR = (0.0, 0.0, -0.125)      # the back of the haunch on the ground: the sit rocks about it


def _rock(R, pitch, pivot=REAR):
    """hips pitched `pitch` deg (positive: nose down) about `pivot` (glTF): its rotation added to R, and the loc that keeps
    the pivot in place."""
    M = common.rot(X, pitch)
    _add(R, 'hips', M)
    q = Vector(pivot) - Vector(HIPS)
    return tuple(q - M @ q)


def _planted(feet, P, legs=('FL', 'FR', 'BL', 'BR')):
    return feet.planted(P, {leg: feet.ground[leg] for leg in legs})


def _twitch(t, bursts, hz=6.5):
    """A nose twitch: bursts [(start, end)] of a quick small nod (sin at hz), each rising and dying away."""
    return sum(common.bump(t, a, b) * math.sin(2 * math.pi * hz * (t - a)) for a, b in bursts)


def _merge_loc(*locs):
    return tuple(sum(c) for c in zip(*locs))


# ---- clips ----

IDLE = dict(duration=3.0)


def idle(t, feet):
    """3 s loop: three breaths (the chest swells and lifts), two bursts of nose twitching (quick small nods of the head), a slow
    glance (the head leads, the neck follows), the ears settling (each tip segment trailing its root segment), one ear
    swivelling, one blink, a tail flick."""
    D = IDLE['duration']
    w = 2 * math.pi * t / D
    breath = 0.5 - 0.5 * math.cos(3 * w)
    tw = _twitch(t, [(0.35, 1.05), (1.85, 2.45)])
    look = math.sin(w)
    R = {}
    _add(R, 'spine', common.rot(X, -0.7 * breath))
    _add(R, 'neck', common.rot(Y, 1.0 * math.sin(w - 0.35)) @ common.rot(X, 0.5 * breath))
    _add(R, 'head', common.rot(Y, 1.5 * look) @ common.rot(X, -0.4 * breath + 1.0 * tw) @ common.rot(Z, -0.6 * look))
    for s, ph in (('L', 0.0), ('R', 1.3)):
        _add(R, f'ear_{s}_1', _ear(s, 0, up=1.5 * math.sin(2 * w + ph), back=2.0 * math.sin(w + ph) + 1.2 * breath))
        _add(R, f'ear_{s}_2', _ear(s, 1, up=2.0 * math.sin(2 * w + ph - 0.6), back=2.5 * math.sin(w + ph - 0.5)))
    swivel = common.bump(t, 1.95, 2.55)
    _add(R, 'ear_R_1', _ear('R', 0, twist=10 * swivel, back=3 * swivel))
    _add(R, 'ear_R_2', _ear('R', 1, twist=4 * common.bump(t, 2.03, 2.68)))
    _add(R, 'tail_1', common.rot(X, -8 * common.bump(t, 1.3, 1.55)))
    blink = common.bump(t, 2.62, 2.8)
    P = common.merge(common.inflate(feet.arm, 'spine', 1 + 0.012 * breath),
                     common.pose(R, {'hips': {'loc': (0, 0.0008 * breath, 0)}, 'lid_L': {'scale': blink}, 'lid_R': {'scale': blink}}))
    return _planted(feet, P)


LOOK_CLIP = dict(duration=1.6, yaw=38)


def look(t, feet):
    """1.6 s once: the head turns to the hare's left and holds, the neck follows a beat later and the chest a little; it blinks
    as the head starts to turn, the ears swivel toward the look and trail it; a small tilt of curiosity at the hold; back."""
    L = LOOK_CLIP
    lead = common.ramp(t, 0.1, 0.45) * (1 - common.ramp(t, 1.05, 1.42))
    follow = common.ramp(t, 0.18, 0.58) * (1 - common.ramp(t, 1.12, 1.52))
    tilt = common.bump(t, 0.5, 1.1)
    R = {}
    _add(R, 'spine', common.rot(Y, 0.1 * L['yaw'] * follow))
    _add(R, 'neck', common.rot(Y, 0.35 * L['yaw'] * follow))
    _add(R, 'head', common.rot(Y, 0.55 * L['yaw'] * lead) @ common.rot(X, -4 * lead) @ common.rot(Z, 3 * tilt))
    ears = common.ramp(t, 0.16, 0.5) * (1 - common.ramp(t, 1.08, 1.45))
    ears2 = common.ramp(t, 0.24, 0.6) * (1 - common.ramp(t, 1.16, 1.55))
    _add(R, 'ear_L_1', _ear('L', 0, twist=10 * ears, back=-3 * ears))
    _add(R, 'ear_L_2', _ear('L', 1, twist=5 * ears2, back=2 * ears2))
    _add(R, 'ear_R_1', _ear('R', 0, twist=-6 * ears, up=4 * ears))
    _add(R, 'ear_R_2', _ear('R', 1, twist=-3 * ears2, up=2 * ears2))
    blink = common.bump(t, 0.08, 0.26)
    P = common.pose(R, {'lid_L': {'scale': blink}, 'lid_R': {'scale': blink}})
    return _planted(feet, P)


EAR_TWITCH = dict(duration=0.6)


def ear_twitch(t, feet):
    """0.6 s once: the right ear flicks back and out and swings back up past its rest; its tip segment follows a beat later and
    further (follow-through), then both settle; the head gives a tiny shake toward it."""
    a = common.bump(t, 0.04, 0.3)
    over = common.bump(t, 0.3, 0.5)
    b = common.bump(t, 0.09, 0.38)
    over2 = common.bump(t, 0.38, 0.58)
    R = {}
    _add(R, 'ear_R_1', _ear('R', 0, up=-10 * a + 3 * over, back=14 * a - 4 * over, twist=8 * a))
    _add(R, 'ear_R_2', _ear('R', 1, up=-6 * b + 3 * over2, back=12 * b - 5 * over2, twist=4 * b))
    _add(R, 'head', common.rot(Z, -2.0 * common.bump(t, 0.02, 0.22)))
    P = common.pose(R)
    return _planted(feet, P)


# the forelegs by joint angle (deg about X; negative: forward and up): the upper arm `arm`, the forearm `fore` against it, and
# what each adds at the top of a stroke. By angle, not by IK on a face target: the bowed face lies so near the shoulder that
# two-bone IK folds the elbow to its limit and swings the upper arm back and forth (to +77 deg) as the head moves, and
# common.reach's sideways roll, measured as if the paw hung below the shoulder, turns a paw raised above it half a turn.
# The upper arm stays small (-15 deg): it drags the flank behind the elbow (-18 already 1.62x there)
GROOM = dict(duration=2.2, arm=-15, arm_stroke=-4, fore=-115, fore_stroke=-12, neck=21, head=30)


def groom(t, feet):
    """2.2 s once: the hare rocks back a little on its haunch, lifts both forepaws to its face and bows its head deep to meet
    them, washes: the paws rub the underside of the chin and muzzle twice, the head tipping up against each stroke (the eyes
    half shut, the ears laid back, the tips trailing), then sets the paws down and settles. The paws come within 8 mm of the
    chin and muzzle and stay under them, about 7 cm below the eyes: a stroke over the eyes needs a forelimb rework (an owner
    option on the T9 sheet)."""
    lift = common.ramp(t, 0.1, 0.5) * (1 - common.ramp(t, 1.65, 2.05))
    bow = common.ramp(t, 0.2, 0.55) * (1 - common.ramp(t, 1.6, 1.95))
    strokes = sum(common.bump(t, a, a + 0.5) for a in (0.55, 1.08))     # 0 paws at rest under the chin, 1 the top of a stroke
    R = {}
    loc = _rock(R, -2 * lift)
    _add(R, 'spine', common.rot(X, -3 * lift))
    _add(R, 'neck', common.rot(X, GROOM['neck'] * bow))
    _add(R, 'head', common.rot(X, GROOM['head'] * bow - 6 * strokes * bow))
    for s in 'LR':
        _add(R, f'ear_{s}_1', _ear(s, 0, back=12 * bow, up=-4 * bow))
        _add(R, f'ear_{s}_2', _ear(s, 1, back=6 * common.ramp(t, 0.3, 0.7) * (1 - common.ramp(t, 1.7, 2.1))))
    _add(R, 'tail_1', common.rot(X, -4 * lift))
    squint = 0.55 * bow * (0.6 + 0.4 * strokes)
    P = common.pose(R, {'hips': {'loc': loc}, 'lid_L': {'scale': squint}, 'lid_R': {'scale': squint}})
    out = feet.planted(P, {leg: feet.ground[leg] for leg in ('BL', 'BR')})
    A = GROOM
    for leg in ('FL', 'FR'):     # the forelegs by joint angle: the paws swing up on an arc and stroke over the face
        out[f'leg_{leg}_1'] = {'rot': (lift * (A['arm'] + A['arm_stroke'] * strokes), 0, 0)}
        out[f'leg_{leg}_2'] = {'rot': (lift * (A['fore'] + A['fore_stroke'] * strokes), 0, 0)}
    return out


HOP = dict(duration=0.9, crouch=0.0, low=0.14, off=0.30, land=0.52, lift=0.02, apex=0.045, dip=0.0)


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


def _hop_y(t):
    """The body's height through the hop: crouch, launch, a parabola in the air, a landing that gives, a settle."""
    H = HOP
    v0 = 2 * (H['apex'] - H['lift']) / ((H['land'] - H['off']) / 2)
    if t < H['off']:
        return _hermite(t, [(0.0, 0.0, 0.0), (H['low'], H['crouch'], 0.0), (H['off'], H['lift'], v0)])
    if t < H['land']:
        g = v0 * v0 / (2 * (H['apex'] - H['lift']))
        return H['lift'] + v0 * (t - H['off']) - g * (t - H['off']) ** 2 / 2
    return _hermite(t, [(H['land'], H['lift'], -v0), (0.62, H['dip'], 0.0), (0.7, 0.002, 0.0), (0.78, 0.0, 0.0)])


SLACK, SOFT = 0.006, 0.014
HOP_PIVOT = (0.0, 0.005, -0.01)     # the body pitches about the middle of its seat, so neither end sinks


def _hop_targets(feet, P):
    """Each paw's ground target under the hop's body P: on the ground while its leg's top has risen less than SLACK, then
    rising with it, joined by a smooth max (a softplus SOFT wide), so the paw lifts smoothly (ruling R26)."""
    M, B, out = common.fk(feet.arm, P), feet.arm.data.bones, {}
    soft = lambda x: (x + math.sqrt(x * x + SOFT * SOFT)) / 2
    for leg, (top, _, _) in feet.chains.items():
        rise = (M[B[f'leg_{leg}_1'].parent.name] @ Vector(top)).y - top[1]
        g = feet.ground[leg]
        out[leg] = (g[0], max(0.0, soft(rise - SLACK) - soft(-SLACK)), g[2])
    return out


HOP_AIR = {'leg_FL_1': (-18, 0, 0), 'leg_FL_2': (12, 0, 0), 'leg_FR_1': (-18, 0, 0), 'leg_FR_2': (12, 0, 0),
           'leg_BL_1': (3, 0, 0), 'leg_BL_2': (-6, 0, 0), 'leg_BR_1': (3, 0, 0), 'leg_BR_2': (-6, 0, 0)}


def hop(t, feet):
    """0.9 s once: one short hop in place (the game moves the hare): a crouch with the head dipping, the push off the hind feet
    (planted until the body lifts them), a flight with the forelegs reaching forward and the hind feet tucked, the forepaws
    down first, a landing that gives and settles back into the sit. The head, ears and tail lag the body."""
    H = HOP
    y = _hop_y(t)
    air = common.bump(t, 0.22, 0.58)
    pitch = 8 * common.bump(t, 0.08, 0.42) + 5 * common.bump(t, 0.4, 0.68)
    lagh = lambda dt: _hop_y(t - dt) if t - dt > 0 else 0.0
    R = {}
    loc = _rock(R, pitch, HOP_PIVOT)
    _add(R, 'spine', common.rot(X, -3 * common.bump(t, 0.25, 0.55)))
    head_up = -150 * (lagh(0.05) - y)
    _add(R, 'neck', common.rot(X, 6 * common.bump(t, 0.0, 0.26) + 0.4 * head_up))
    _add(R, 'head', common.rot(X, -0.6 * pitch + 0.4 * head_up))
    flop = -260 * (lagh(0.08) - y)
    flop2 = -260 * (lagh(0.13) - y)
    for s in 'LR':
        _add(R, f'ear_{s}_1', _ear(s, 0, back=max(-20, min(20, -flop)) + 6 * common.bump(t, 0.1, 0.4)))
        _add(R, f'ear_{s}_2', _ear(s, 1, back=max(-20, min(20, -flop2))))
    _add(R, 'tail_1', common.rot(X, -10 * common.bump(t, 0.15, 0.7)))
    P = common.pose(R, {'hips': {'loc': _merge_loc(loc, (0, y, 0))}})
    G = feet.planted(P, _hop_targets(feet, P))
    out = dict(G)
    for b, a in HOP_AIR.items():
        g = G[b]['rot']
        out[b] = {'rot': tuple((1 - air) * p + air * q for p, q in zip(g, a))}
    return out


ALERT = dict(duration=1.4)


def alert(t, feet):
    """1.4 s once: something heard: the hare rocks back onto its haunch and straightens up tall, the head lifting, the ears
    swinging up to the vertical and turning their openings forward (the tips a beat later); it holds, scanning a little with a
    twitch of the nose, then settles back into the sit."""
    up = common.ramp(t, 0.06, 0.36) * (1 - common.ramp(t, 0.95, 1.32))
    lag = common.ramp(t, 0.12, 0.44) * (1 - common.ramp(t, 1.0, 1.36))
    ears = common.ramp(t, 0.04, 0.24) * (1 - common.ramp(t, 1.0, 1.3))
    ears2 = common.ramp(t, 0.1, 0.32) * (1 - common.ramp(t, 1.06, 1.36))
    scan = common.bump(t, 0.45, 1.0)
    tw = _twitch(t, [(0.5, 0.95)])
    R = {}
    loc = _rock(R, -2 * up, HIPS)
    _add(R, 'spine', common.rot(X, -12 * up))
    _add(R, 'neck', common.rot(X, -4 * lag) @ common.rot(Y, 6 * scan))
    _add(R, 'head', common.rot(Y, 8 * scan) @ common.rot(X, 6 * lag + 0.8 * tw))
    for s in 'LR':
        _add(R, f'ear_{s}_1', _ear(s, 0, up=20 * ears, back=-4 * ears, twist=-6 * ears))
        _add(R, f'ear_{s}_2', _ear(s, 1, up=8 * ears2))
    _add(R, 'tail_1', common.rot(X, -8 * up))
    P = common.pose(R, {'hips': {'loc': _merge_loc(loc, (0, 0.002 * up, 0))}})
    return _planted(feet, P)


def clips(arm):
    """The hare's six clips; every frame goes through feet.check(), which logs a clip whose final pose still sinks into the
    ground (ruling R25)."""
    feet = common.Feet(arm, next(c for c in arm.children if c.type == 'MESH'))
    fns = [('Idle', 'loop', IDLE['duration'], lambda t: idle(t, feet)),
           ('Look', 'once', LOOK_CLIP['duration'], lambda t: look(t, feet)),
           ('EarTwitch', 'once', EAR_TWITCH['duration'], lambda t: ear_twitch(t, feet)),
           ('Groom', 'once', GROOM['duration'], lambda t: groom(t, feet)),
           ('Hop', 'once', HOP['duration'], lambda t: hop(t, feet)),
           ('Alert', 'once', ALERT['duration'], lambda t: alert(t, feet))]
    return [(name, kind, d, feet.checked(name, fn)) for name, kind, d, fn in fns]


if __name__ == '__main__':
    common.run(sys.modules[__name__])
