"""dog.py -- the dog's rig: public/models/dog.glb -> dog_rig.glb (common.py does the work; README.md has the workflow).
    art/blender/rigs/build.sh dog
    blender -b --factory-startup --python-exit-code 1 --python art/blender/rigs/dog.py -- --source public/models/dog.glb --out <dir>

Landmarks are glTF coordinates on the source (the dog faces +Z, its left is +X), measured with orthographic renders and
vertex queries: paw centres from the vertices below y 0.035, leg lines and the elbows from cross-sections and wireframe
close-ups (each forearm leaves the body's lower edge at y 0.15), the cut-ring centres from the vertices the Head / Tail nodes
share with the body, the tail line from its slices (four bones on a smooth curve through them), the ears from their own
shells, the eyes from close-ups square onto each painted eye. The head is modelled turned to the dog's left and tilted;
rest() measures that from the eyes and the nose tip and straightens it (REST_CHANGED).

Weights follow the README's quadruped weighting recipe (Task 3b): the front knee at the elbow, each leg a region walked from
its paw, joint ramps, the neck kept off the bib.

Clips: Idle and Walk (loops), Sniff and Sleep (loops), Sit and Lie (holds), PlayBow, Scratch and Happy (once). The behaviour
clips are end poses blended in with common.ease: common.fk evaluates a pose, common.Feet plants the paws (IK), and the body
pivots where a dog's does (about the shoulders for a sit). Every pose stays inside AR4's 1.6x on this low-poly mesh (README:
the joint budgets). Sleep plays on from Lie's held last frame: its hips, spine, chest, legs and tail are that frame's, only
the head goes down onto the forearms, the lids close and the tail tip flicks. The tail wags with overlapping action (wag()).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

ID, FACING = 'dog', '+Z'
MID = -0.025                                  # the body's midline x: between the left and right paw centres
PAWS = {'FL': (0.0577, 0.013, 0.1977), 'FR': (-0.105, 0.012, 0.1941), 'BL': (0.0618, 0.015, -0.1825), 'BR': (-0.1141, 0.0136, -0.1256)}
LEGS = {   # top, knee. Front: the shoulder, straight above the paw (so the gait is even), and the elbow, inside the back of the
    # forearm where it leaves the body's lower edge (y 0.15): the forearm folds flat about it to lie or bow. Hind: the hip, up
    # and 2 cm forward of the paw where the thigh hinges, and the hock, behind the leg's line
    'FL': ((0.055, 0.25, 0.1977), (0.047, 0.15, 0.14)), 'FR': ((-0.105, 0.25, 0.1941), (-0.098, 0.15, 0.138)),
    'BL': ((0.050, 0.27, -0.1625), (0.061, 0.10, -0.21)), 'BR': ((-0.110, 0.27, -0.1056), (-0.097, 0.10, -0.152))}
TOES = {'FL': (0.058, 0.0, 0.235), 'FR': (-0.108, 0.0, 0.232), 'BL': (0.068, 0.0, -0.14), 'BR': (-0.118, 0.0, -0.078)}   # paw fronts
HIPS, SHOULDERS = (MID, 0.26, -0.15), (MID, 0.27, 0.04)      # the torso's centre line between the leg tops
NECK_BASE = (MID, 0.30, 0.13)
HEAD_JOINT = (0.0098, 0.3994, 0.2186)         # centre of the Head cut ring
SKULL = (0.0603, 0.458, 0.2567)
MUZZLE = (0.1105, 0.4478, 0.319)              # inside the upper muzzle, behind the nose
SNOUT = (0.1446, 0.4563, 0.3485)              # the nose tip vertex
JAW_HINGE, CHIN = (0.0553, 0.4143, 0.2672), (0.1038, 0.3777, 0.3372)
EARS = {'L': ((0.0872, 0.5213, 0.1966), (0.1109, 0.39, 0.1874)), 'R': ((0.0152, 0.5421, 0.2536), (-0.0324, 0.4371, 0.3196))}
TAIL = [(-0.0329, 0.3021, -0.2161), (-0.0315, 0.3402, -0.2779), (-0.0309, 0.3965, -0.3213), (-0.0311, 0.4621, -0.3085),
        (-0.0313, 0.5059, -0.2507)]   # base .. tip: the cut ring, then quarters of a smooth curve through the tail's slices
EYES = {'L': dict(centre=(0.1125, 0.4707, 0.2587), top=(0.1145, 0.482, 0.257), radius=(0.0185, 0.0175),
                 shift=(-0.002, -0.0025), dome=0.003),
        'R': dict(centre=(0.0626, 0.4878, 0.3019), top=(0.0645, 0.4989, 0.2991), radius=(0.0185, 0.0175),
                 shift=(0.002, -0.0025), dome=0.003)}
LID_SIDES = 12   # closed caps: oval and a little wider than the painted eye (its inner lower corner peeked out of a 1.65 cm
                 # circle), domed 3 mm, shaded with the face's normals so they read as lids rather than flat octagons
FUR_UV = {'L': (0.14746, 0.03613), 'R': (0.91699, 0.42480)}   # orange fur texels just above each eye (Blender UV)


def _bone(name, head, tail, parent):
    return dict(name=name, head=head, tail=tail, parent=parent)


def _lid(side):
    top = Vector(EYES[side]['top'])
    return _bone('lid_' + side, tuple(top), tuple(top + (top - Vector(SKULL)).normalized() * 0.01), 'head')


BONES = [_bone('root', (0, 0, 0), (0, 0.06, 0), None),
         _bone('hips', HIPS, (MID, 0.265, -0.05), 'root'),
         _bone('spine', (MID, 0.265, -0.05), SHOULDERS, 'hips'),
         _bone('chest', SHOULDERS, NECK_BASE, 'spine'),
         _bone('neck', NECK_BASE, HEAD_JOINT, 'chest'),
         _bone('head', HEAD_JOINT, MUZZLE, 'neck'),
         _bone('jaw', JAW_HINGE, CHIN, 'head'),
         _bone('ear_L', *EARS['L'], 'head'), _bone('ear_R', *EARS['R'], 'head'),
         _lid('L'), _lid('R')]
TAILS = [f'tail_{k}' for k in range(1, len(TAIL))]
BONES += [_bone(b, TAIL[k], TAIL[k + 1], TAILS[k - 1] if k else 'hips') for k, b in enumerate(TAILS)]
for _leg in ('FL', 'FR', 'BL', 'BR'):
    BONES += [_bone(f'leg_{_leg}_1', LEGS[_leg][0], LEGS[_leg][1], 'chest' if _leg[0] == 'F' else 'hips'),
              _bone(f'leg_{_leg}_2', LEGS[_leg][1], PAWS[_leg], f'leg_{_leg}_1')]
LIVE = ['head', 'neck', 'lid_L', 'lid_R', 'ear_L', 'ear_R'] + TAILS
# ruling R31: the game's live-look clamp (rigs.json look), measured on the built rig as rigs.test's lookPose applies it at rest:
# the largest whole 5 deg of yaw (pitch 0), then of pitch, whose ellipse keeps AR4 <= 1.6 on these bones
LOOK = dict(yaw=45, pitch=45, bones=['neck', 'head'])     # yaw 50: 1.65x; pitch 50: 1.65x; the head alone: yaw only 20
REST_CHANGED = ['neck', 'head', 'jaw', 'ear_L', 'ear_R', 'lid_L', 'lid_R']


# ---- weights: the quadruped weighting recipe (README) ----

INSET = {'Head': (0.08, 0.025), 'Tail': (0.025, 0.025)}   # blend bands into and out of the head and tail cut rings
# each leg is the part of the mesh within `length` u of its paw front, walking the edges (common.in_reach); its share fades
# out over (inset, outset) about that, so the front legs start at the elbow crease and blend across the armpit, and the hind
# legs take the thigh with a band spread over the flank. Bone heat gave the front legs up to 71 % of the bib: out of the
# band they keep none of it
LEG_REACH = {'F': (0.22, 0.05, 0.14), 'B': (0.25, 0.08, 0.14)}
JOINTS = {**{f'leg_{leg}_2': 0.05 if leg[0] == 'F' else 0.06 for leg in LEGS},   # elbows and hocks: ramps 10-12 cm long
          **{b: 0.08 for b in ('spine', 'chest', 'neck')},                         # the back and neck bend over 16 cm
          **{b: 0.03 for b in TAILS[1:]}}                                          # the tail bends in a curve


def _rising(y0, y1):
    """A taper factor: 0 below y0, 1 above y1, smooth between."""
    def f(p):
        x = min(max((p[1] - y0) / (y1 - y0), 0.0), 1.0)
        return x * x * (3 - 2 * x)
    return f


TAPER = {'neck': _rising(0.18, 0.36)}     # the neck keeps none of the bib below its base: the chest carries it to the elbows


def region(mesh):
    """The Head and Tail nodes' vertices go to the head and tail subtrees, blending across INSET at their cut rings; each
    ear's own shell goes wholly to its ear bone, so an ear turns rigidly; each leg as LEG_REACH says, the rest of its band's
    weight kept on the body bones each vertex had (keep)."""
    r = {'head': common.in_part(mesh, 'Head', *INSET['Head']), 'tail_1': common.in_part(mesh, 'Tail', *INSET['Tail']),
         'ear_L': common.in_shell(mesh, EARS['L'][1], 'Head'), 'ear_R': common.in_shell(mesh, EARS['R'][1], 'Head')}
    for leg, tip in TOES.items():
        r[f'leg_{leg}_1'] = common.in_reach(mesh, tip, *LEG_REACH[leg[0]], keep=True)
    return r


def rest(mesh, arm):
    """Straightens the head: `neck` swings the head joint over the midline, `head` takes the rest of the turn, so the face
    looks down +Z with its own pitch kept and the nose tip within 0.01 of the midline."""
    eL, eR, tip = Vector(EYES['L']['centre']), Vector(EYES['R']['centre']), Vector(SNOUT)
    left = (eL - eR).normalized()
    up = (tip - (eL + eR) / 2).cross(left).normalized()
    fwd = left.cross(up)
    yaw, pitch = math.degrees(math.atan2(fwd.x, fwd.z)), math.degrees(math.asin(-fwd.y))
    level = (Matrix.Rotation(math.radians(yaw), 3, 'Y') @ Matrix.Rotation(math.radians(pitch), 3, 'X')).inverted() @ left
    common.log(f'head modelled turned: yaw {yaw:.1f} deg (to its left), roll {math.degrees(math.atan2(level.y, level.x)):.1f} deg, '
               f'pitch {pitch:.1f} deg (kept)')
    S = Matrix.Rotation(math.radians(pitch), 3, 'X') @ Matrix((left, up, fwd))   # head axes -> square to +Z, same pitch
    B, J = Vector(NECK_BASE), Vector(HEAD_JOINT)
    J2 = Vector((MID, J.y, B.z + math.sqrt((J - B).length_squared - (J.y - B.y) ** 2)))
    N = (J - B).rotation_difference(J2 - B).to_matrix()
    deg = lambda M: tuple(math.degrees(a) for a in M.to_euler('ZXY'))
    nose = min(range(len(mesh.data.vertices)), key=lambda i: (mesh.data.vertices[i].co - common.g2b(SNOUT)).length)
    common.apply_rest(mesh, arm, {'neck': deg(N), 'head': deg(N.transposed() @ S)})
    x = common.b2g(mesh.data.vertices[nose].co)[0]
    common.log(f'straightened: neck {tuple(round(a, 1) for a in deg(N))}, head {tuple(round(a, 1) for a in deg(N.transposed() @ S))} '
               f'(x, y, z deg); nose tip x {x:.4f} vs midline {MID}')
    if abs(x - MID) > 0.01:
        raise ValueError(f'nose tip x {x:.4f} is {abs(x - MID):.4f} off the midline {MID}')


# ---- the tail: an overlapping-action wag ----

GROW = (0.55, 0.8, 1.0, 1.2)    # each tail segment's share of a wag's swing, base .. tip


def wag(t, hz, amp, lift=0.0, carry=0.0, lag=0.15, k=1.0):
    """Tail pose entries at time t: a wag of `hz` whose segments follow one another, each `lag` of a cycle behind the one
    before, each swinging amp x GROW[i] deg (the swing grows toward the tip, so the tail bends in a travelling S curve),
    lifting lift x GROW[i] deg at both ends of its swing and carried at `carry` deg of pitch (a number, or one per segment;
    positive lifts the tail), all scaled by k. A loop keeps hz x its duration whole."""
    out = {}
    for i, b in enumerate(TAILS):
        s = math.sin(2 * math.pi * (hz * t - lag * i))
        c = carry[i] if isinstance(carry, (tuple, list)) else carry
        out[b] = {'rot': (k * (c + lift * GROW[i] * s * s), k * amp * GROW[i] * s, 0)}
    return out


def idle(t, arm):
    """3 s: two breaths (chest +3 %), a slow weight shift over planted feet, a slow low wag (2 a loop, 0.67 Hz), a small look
    round."""
    w = 2 * math.pi * t / 3.0
    breath = 0.5 - 0.5 * math.cos(2 * w)
    dx, roll = 0.006 * math.sin(w), 1.0 * math.sin(w)              # hips move left and right, leaning with it
    legs = {f'leg_{leg}_1': {'rot': (0, 0, -roll - math.degrees(math.atan2(dx, LEGS[leg][0][1])))} for leg in LEGS}
    return common.merge(common.inflate(arm, 'chest', 1 + 0.03 * breath),
                        {'hips': {'loc': (dx, 0, 0), 'rot': (0, 0, roll)}}, legs, wag(t, 2 / 3.0, 11, lift=3, carry=-6),
                        {'neck': {'rot': (-1.5 * breath, 0, 0)}, 'head': {'rot': (1.5 * breath, 5 * math.sin(w + 1), 0)}})


WALK = dict(duration=0.6, swing_deg=12, lift=0.05)


def walk(t, feet):
    """0.6 s quadruped walk: gait() legs with the soles planted on the ground, a head bob (<= 4 deg, twice a cycle), a relaxed
    sway of the tail once a stride, the ears bouncing."""
    D, w = WALK['duration'], 2 * math.pi * t / WALK['duration']
    bob = 3 * math.sin(2 * w)
    return common.merge(common.gait(t, D, common.QUADRUPED, WALK['swing_deg'], WALK['lift'], legs=feet.chains, feet=feet),
                        {'head': {'rot': (bob, 0, 0)}, 'neck': {'rot': (-0.5 * bob, 0, 0)},
                         'ear_L': {'rot': (0, 0, -2 * math.sin(2 * w))}, 'ear_R': {'rot': (0, 0, 2 * math.sin(2 * w))}},
                        wag(t, 1 / D, 9, lift=2, carry=2))


# ---- behaviour clips: end poses built with fk() / reach(), blended in; the body pivots where a dog's would ----

BODY = ('hips', 'spine', 'chest') + tuple(TAILS) + tuple(f'leg_{leg}_{k}' for leg in LEGS for k in (1, 2))


def _rots(R, k=1.0):
    """{bone: (x, y, z)} -> pose entries turned k of the way."""
    return {b: {'rot': tuple(a * k for a in r)} for b, r in R.items()}


ELBOW = 45.0     # how far back (and so up) the upper arm may turn about the shoulder to keep a folded forearm out of the ground


def _forearms_down(feet, P, fold):
    """P with each front forearm folded `fold` deg forward (from the upper arm's rest line), the upper arm turned back about
    the shoulder, which lifts the elbow while the forearm keeps its slope, just far enough that no vertex of the forearm sinks
    below the ground: the forearms lie on it."""
    out = dict(P)
    for leg in ('FL', 'FR'):
        fore = [x for x in feet.limb[leg] if x[0] == f'leg_{leg}_2']
        pose = lambda e: {f'leg_{leg}_1': {'rot': (e, 0, 0)}, f'leg_{leg}_2': {'rot': (-fold - e, 0, 0)}}

        def low(e):
            return feet.at(common.fk(feet.arm, {**out, **pose(e)}), fore)
        a, b = 0.0, ELBOW
        if low(a) >= 0:
            b = a
        elif low(b) < 0:
            a = b
            feet.note(f'forearms: {leg} still dips {-1000 * low(b):.0f} mm with the upper arm {ELBOW:.0f} deg back')
        for _ in range(30):
            m = (a + b) / 2
            a, b = (m, b) if low(m) < 0 else (a, m)
        out.update(pose((a + b) / 2))
    return out


LEG_TUCK = 30.0    # how far a hind leg may fold further (hip flexion) to keep it out of the ground (deg)
TUCK_RATE = 90.0   # how fast that extra fold may change (deg/s; ruling R26: no one-frame pops)


def _folded(P, folds):
    """P with each leg in folds ({leg: deg}) folded that much further forward at the hip."""
    out = dict(P)
    for leg, e in folds.items():
        b = f'leg_{leg}_1'
        r = out.get(b, {}).get('rot', (0, 0, 0))
        out[b] = {'rot': (r[0] - e, r[1], r[2])}
    return out


def _fold_need(feet, P, leg, clear):
    """The least extra hip fold (deg, up to LEG_TUCK) that keeps every vertex of the leg at or above `clear` (ruling R25).
    It is scanned, not halved from the full range: a little fold can first push the paw deeper before the leg clears."""
    low = lambda e: feet.lowest(common.fk(feet.arm, _folded(P, {leg: e})), leg, whole=True) - clear
    if low(0.0) >= 0:
        return 0.0
    for e in range(2, int(LEG_TUCK) + 1, 2):
        if low(e) >= 0:
            lo, hi = e - 2.0, float(e)
            for _ in range(20):
                m = (lo + hi) / 2
                lo, hi = (m, hi) if low(m) < 0 else (lo, m)
            return hi
    feet.note(f'legs: {leg} still dips {-1000 * low(LEG_TUCK):.0f} mm folded {LEG_TUCK:.0f} deg further')
    return LEG_TUCK


class _Tuck:
    """A clip's extra hip folds for its hind legs, as continuous functions of time (rulings R25 and R26). raw(t) is the
    clip's pose before the clamp; every 1/120 s gets the least fold that keeps the leg at or above `clear`, and the curve is
    the upper envelope of those needs with slopes of at most `rate` deg/s: every sample still clears, and the fold never
    leaps between frames (a fold found frame by frame jumped 15-18 deg in one frame where a little fold made the dip worse).
    A leg's slope limit rises above `rate` only as far as it must for the fold to be 0 at t 0 (a hold starts at rest)."""

    def __init__(self, feet, raw, duration, legs=('BL', 'BR'), clear=-0.004, rate=TUCK_RATE, hz=120):
        self.ts = [min(k / hz, duration) for k in range(round(duration * hz) + 1)]
        self.need = {leg: [] for leg in legs}
        for t in self.ts:
            P = raw(t)
            for leg in legs:
                self.need[leg].append(_fold_need(feet, P, leg, clear))
        self.rate = {leg: max([rate] + [e / s for e, s in zip(es, self.ts) if s > 0]) for leg, es in self.need.items()}

    def __call__(self, t):
        return {leg: max(0.0, max(e - self.rate[leg] * abs(t - s) for e, s in zip(es, self.ts)))
                for leg, es in self.need.items()}


TAIL_LIFT = 60.0   # how far tail_1 may pitch up to keep a lowered tail on the ground rather than in it (deg)


def _tail_on_ground(feet, P, clear=0.002):
    """P with tail_1 pitched up just far enough that no vertex of the tail lies lower than `clear` (ruling R25: the tail of a
    sitting or lying dog rests on the ground, not in it)."""
    pts = feet.points(TAILS)
    low = lambda e: feet.at(common.fk(feet.arm, common.merge(P, {TAILS[0]: {'rot': (e, 0, 0)}})), pts) - clear
    a, b = 0.0, TAIL_LIFT
    if low(a) >= 0:
        return P
    if low(b) < 0:
        feet.note(f'tail: still {-1000 * low(b):.0f} mm under with tail_1 {TAIL_LIFT:.0f} deg up')
        a = b
    for _ in range(30):
        m = (a + b) / 2
        a, b = (m, b) if low(m) < 0 else (a, m)
    return common.merge(P, {TAILS[0]: {'rot': ((a + b) / 2, 0, 0)}})


SIT = dict(duration=0.6, tilt=44, sink=0.035, spine=0.3, chest=0.3, paw=0.14, carry=(-8, -10, -8, -4),
           curl=(-12, -16, -16, -14), sweep=12)
AR2_XZ = 0.045     # how far the body may shift sideways or along (AR2: 0.05)


def sit_pose(feet, k):
    """k of the way into the sit: the body tilted SIT['tilt'] tail-down about the shoulders and sunk SIT['sink'], so the
    rump rests on the ground; front legs straight on their paws, hind legs folded forward along the ground, head level.
    Before the hind legs' clamp (sit() adds the tuck: half way down the backs of the thighs would dip)."""
    th = SIT['tilt'] * k
    P = feet.held({'hips': {'rot': (-th, 0, 0)}, 'spine': {'rot': (SIT['spine'] * th, 0, 0)},
                   'chest': {'rot': (SIT['chest'] * th, 0, 0)}, 'head': {'rot': ((1 - SIT['spine'] - SIT['chest']) * th, 0, 0)}},
                  limit=AR2_XZ)
    P = common.merge(P, {'hips': {'loc': (0, -SIT['sink'] * k, 0)}})     # the elbows give a little
    return feet.planted(P, {'FL': feet.ground['FL'], 'FR': feet.ground['FR'],
                            'BL': feet.ahead(P, 'BL', SIT['paw'], k), 'BR': feet.ahead(P, 'BR', SIT['paw'], k)})


def sit(t, feet, tuck):
    """0.6 s hold: sits down, eased; the tail lowers to the ground with one lazy sweep out and back, and curls round.
    tuck: the clip's _Tuck (sit_tuck())."""
    u = t / SIT['duration']
    k = common.ease(u)
    sweep = SIT['sweep'] * math.sin(math.pi * k)          # out to the right and back while it lowers
    tail = {b: {'rot': (SIT['carry'][i] * k, SIT['curl'][i] * k + sweep * GROW[i], 0)} for i, b in enumerate(TAILS)}
    return _tail_on_ground(feet, common.merge(_folded(sit_pose(feet, k), tuck(t)), tail))


def sit_tuck(feet):
    return _Tuck(feet, lambda t: sit_pose(feet, common.ease(t / SIT['duration'])), SIT['duration'])


# the hind legs came from a search under ruling R25 (nothing below -0.005 u but the tail, solved after; the chest and belly
# underside at most 0.012 u off the ground; stretch under 1.57x), the body held where Sleep's head rests on the forearms:
# they fold about 69 deg, each turned its own way (the right hind leg is modelled a step forward)
LIE = dict(duration=0.8, drop=0.192, lead=10, hips=-25.04, spine=22.33, chest=5.96, fold=85, neck=-4, head=6,
           hind={'leg_BL_1': (-69.08, 4.83, -0.06), 'leg_BL_2': (3.65, 0, 0),
                 'leg_BR_1': (-68.73, 14.89, 15.0), 'leg_BR_2': (-16.86, 0, 0)},
           carry=(-30, -24, -16, -10), curl=(-4, -8, -12, -16))


def lie_body(t):
    """Lying down, belly to the ground, t s in, before the clamps: the front goes down first (pitched LIE['lead'] nose-down
    while it leads), the rear follows: the pelvis tilts tail-down LIE['hips'] and the spine and chest turn back level, the
    body drops LIE['drop'] so the chest, belly and rump rest on the ground; the hind legs tuck under the belly (LIE['hind'],
    a little ahead of the rear, so the paws lift rather than dig in on the way down); the head stays up."""
    L, u = LIE, t / LIE['duration']
    kf, kr, kh = common.ease(u / 0.8), common.ease((u - 0.15) / 0.85), common.ease((u - 0.05) / 0.7)
    return {'hips': {'loc': (0, -L['drop'] * kr, 0), 'rot': (L['lead'] * (kf - kr) + L['hips'] * kr, 0, 0)},
            'spine': {'rot': (L['spine'] * kr, 0, 0)}, 'chest': {'rot': (L['chest'] * kf, 0, 0)},
            'neck': {'rot': (L['neck'] * kf, 0, 0)}, 'head': {'rot': (L['head'] * kf - L['lead'] * (kf - kr), 0, 0)},
            **_rots(L['hind'], kh)}, kf, kr


def lie(t, feet, tuck):
    """0.8 s hold: lies down (lie_body), the hind legs folded clear of the ground by tuck (the clip's _Tuck: lie_tuck()), the
    forearms folded flat forward (LIE['fold'] at the elbow, resting on the ground), the tail settling onto the ground."""
    L = LIE
    P, kf, kr = lie_body(t)
    P = _forearms_down(feet, _folded(P, tuck(t)), L['fold'] * kf)
    P = common.merge(P, {b: {'rot': (L['carry'][i] * kr, L['curl'][i] * kr, 0)} for i, b in enumerate(TAILS)})
    return _tail_on_ground(feet, P)


def lie_tuck(feet):
    return _Tuck(feet, lambda t: lie_body(t)[0], LIE['duration'])


SLEEP = dict(duration=4.0, neck=(42, -12, 0), head=(22, -14, 10), flick=(2.5, 0.45, 20))


def sleep(t, feet, body):
    """4 s loop on Lie's last frame (`body`: its hips, spine, chest, legs and tail): head down onto the forearms, lids shut,
    two slow breaths, the tail still but for one flick of its tip (SLEEP['flick']: start, length, degrees)."""
    w = 2 * math.pi * t / SLEEP['duration']
    breath = 0.5 - 0.5 * math.cos(2 * w)
    t0, n, deg = SLEEP['flick']
    f = math.sin(math.pi * min(max((t - t0) / n, 0.0), 1.0)) ** 2
    flick = {TAILS[-2]: {'rot': (0.3 * deg * f, 0.4 * deg * f, 0)}, TAILS[-1]: {'rot': (0.5 * deg * f, deg * f, 0)}}
    return common.merge(body, common.inflate(feet.arm, 'chest', 1 + 0.04 * breath), flick,
                        {'hips': {'loc': (0, 0.003 * breath, 0)}, 'neck': {'rot': SLEEP['neck']},
                         'head': {'rot': tuple(a + (1.5 * breath if i == 0 else 0) for i, a in enumerate(SLEEP['head']))},
                         'ear_L': {'rot': (8, 0, -6)}, 'ear_R': {'rot': (8, 0, 6)}, 'lid_L': {'scale': 1.0}, 'lid_R': {'scale': 1.0}})


PLAYBOW = dict(duration=1.4, down=0.35, up=1.05, lift=0.02, hips=16, spine=9, chest=7, neck=-8, head=-22, fold=80,
               hz=4.0, amp=18, carry=(30, 14, 8, 4))


def playbow_pose(feet, k, dy=0.0):
    """k of the way into the bow: the chest pitched down about the hips until the forearms lie flat on the ground (folded
    PLAYBOW['fold'] at the elbows), the rear held up (hips raised PLAYBOW['lift'], plus dy: a bounce), hind legs straight on
    their paws, head low and looking up."""
    B = PLAYBOW
    P = {'hips': {'loc': (0, B['lift'] * k + dy, 0), 'rot': (B['hips'] * k, 0, 0)}, 'spine': {'rot': (B['spine'] * k, 0, 0)},
         'chest': {'rot': (B['chest'] * k, 0, 0)}, 'neck': {'rot': (B['neck'] * k, 0, 0)}, 'head': {'rot': (B['head'] * k, 0, 0)}}
    P = feet.planted(P, {'BL': feet.ground['BL'], 'BR': feet.ground['BR']})
    return _forearms_down(feet, P, B['fold'] * k)


def playbow(t, feet):
    """1.4 s once: bows down (0.35 s), bounces lightly with the tail high and fast (PLAYBOW['hz']), comes back up (0.35 s);
    the paws and forearms are placed after the bounce, so none sinks."""
    B = PLAYBOW
    D, d, u = B['duration'], B['down'], B['up']
    k = common.ease(t / d) * common.ease((D - t) / (D - u))
    bounce = math.sin(math.pi * min(max((t - d) / (u - d), 0), 1)) * math.sin(2 * math.pi * 3 * (t - d))
    return common.merge(playbow_pose(feet, k, 0.006 * bounce * k),
                        wag(t, B['hz'], B['amp'], lift=4, carry=B['carry'], k=k),
                        {'ear_L': {'rot': (-8 * k, 0, 6 * k)}, 'ear_R': {'rot': (-8 * k, 0, -6 * k)}})


SNIFF = dict(duration=2.0)


def sniff(t, feet):
    """2 s loop: nose down near the ground, the head sweeping left and right once, quick sniffing dips, ears forward, a
    slow wag (1 Hz)."""
    w = 2 * math.pi * t / SNIFF['duration']
    sweep, dip = math.sin(w), math.sin(6 * w) ** 2
    P = {'spine': {'rot': (3, 0, 0)}, 'chest': {'rot': (10, 0, 0)},
         'neck': {'rot': (38, 8 * sweep, 0)}, 'head': {'rot': (18 + 4 * dip, 10 * sweep, -4 * sweep)},
         'ear_L': {'rot': (-12, 0, 4)}, 'ear_R': {'rot': (-12, 0, -4)}}
    P = feet.planted(P, {leg: feet.ground[leg] for leg in LEGS})
    return common.merge(P, wag(t, 1.0, 10, lift=2, carry=6))


HAPPY = dict(duration=1.2, hz=10 / 3.0, wiggle=8, bounce=0.006, amp=24, carry=(14, 8, 4, 2))


def happy(t, feet):
    """1.2 s once: a fast wide wag (HAPPY['hz'], 4 a clip) with the rear swinging the other way about the shoulders
    (HAPPY['wiggle'] deg) and a little bounce on each swing, ears back, panting (jaw 0..8 deg), the head tilting."""
    H = HAPPY
    e = common.ease(t / 0.2) * common.ease((H['duration'] - t) / 0.25)
    s = math.sin(2 * math.pi * H['hz'] * t)
    phi = -H['wiggle'] * e * s
    P = feet.held({'hips': {'rot': (0, phi, 0)}, 'chest': {'rot': (0, -phi, 0)}, 'neck': {'rot': (0, -0.3 * phi, 0)}})
    P = common.merge(P, {'hips': {'loc': (0, H['bounce'] * e * s * s, 0)}})
    P = feet.planted(P, {leg: feet.ground[leg] for leg in LEGS})
    w = 2 * math.pi * t / H['duration']
    return common.merge(P, wag(t, H['hz'], H['amp'], lift=6, carry=H['carry'], k=e),
                        {'ear_L': {'rot': (18 * e, 0, 6 * e)}, 'ear_R': {'rot': (18 * e, 0, -6 * e)},
                         'jaw': {'rot': (8 * e * (0.5 - 0.5 * math.cos(6 * w)), 0, 0)},
                         'head': {'rot': (-3 * e * math.sin(6 * w), 0, 6 * e * math.sin(3 * w))}})


# found by a search (paw to ear root, with AR4's stretch held under 1.58), then refined so the paw rests 2.2 cm behind the ear
# root, 5 mm clear of the head: the rear sits back a little and swings out to the left, the back arches and curls left so
# the head comes round and down, and the left hind leg reaches up the left flank
SCRATCH = dict(duration=1.6, down=0.4, up=1.2, rate=5, stroke=14, step=0.5,
               hips=(-18.33, -18.61, 17.05), spine=(35, 35, 0), chest=(22.77, 11.83, -25), neck=(3.79, 1.86, -36.76),
               head=(-20.15, 3.25, -21.63), leg=(-26.76, -25.56, 50.84), hock=41.64)


def scratch(t, feet):
    """1.6 s once: sits back and curls round to the left (SCRATCH's hips, spine, chest), the head turning back and down
    with the left ear tilted toward the left hind paw, which comes up the flank to behind that ear and scratches fast at the
    hock (SCRATCH['rate'] strokes a second, SCRATCH['stroke'] deg), then stands. The front paws step half way under the
    leaning shoulders (SCRATCH['step']), the right hind leg folds forward as in the sit; the left paw leaves the ground
    before the body settles and lands after it rises."""
    S = SCRATCH
    D, d, u = S['duration'], S['down'], S['up']
    k = common.ease(t / d) * common.ease((D - t) / (D - u))
    lift = common.ease((t - 0.05) / (d - 0.05)) * common.ease((D - 0.05 - t) / (D - u - 0.05))
    s = math.sin(2 * math.pi * S['rate'] * (t - d)) if d < t < u else 0.0
    turn = lambda r: tuple(a * k for a in r)
    P = feet.held({'hips': {'rot': turn(S['hips'])}, 'spine': {'rot': turn(S['spine'])}, 'chest': {'rot': turn(S['chest'])},
                   'neck': {'rot': turn(S['neck'])}, 'head': {'rot': turn(S['head'])}, 'ear_L': {'rot': (6 * k * s, 0, 0)}},
                  axes='yz', limit=AR2_XZ)   # the curl's sideways shift stays in the legs (AR2)
    P = feet.planted(P, {'FL': feet.under(P, 'FL', S['step'] * k), 'FR': feet.under(P, 'FR', S['step'] * k),
                         'BL': feet.ground['BL'], 'BR': feet.ahead(P, 'BR', SIT['paw'], k)})
    up = {'leg_BL_1': S['leg'], 'leg_BL_2': (S['hock'] + S['stroke'] * s, 0, 0)}
    P = {**P, **{b: {'rot': tuple((1 - lift) * p + lift * q for p, q in zip(P[b]['rot'], r))} for b, r in up.items()}}
    return common.merge(P, wag(t, 2.5, 6, carry=-4, k=k))


def clips(arm):
    """The dog's nine clips; Sleep's body is Lie's last frame (rigs.json order is sorted, so the review sheet pairs them
    with render_clips.py --pair Lie:Sleep). Every frame goes through feet.check(), which logs a clip whose final pose
    still sinks into the ground (ruling R25)."""
    feet = common.Feet(arm, next(c for c in arm.children if c.type == 'MESH'))
    lt, st = lie_tuck(feet), sit_tuck(feet)
    lie_end = {b: p for b, p in lie(LIE['duration'], feet, lt).items() if b in BODY}
    fns = [('Idle', 'loop', 3.0, lambda t: idle(t, arm)), ('Walk', 'loop', WALK['duration'], lambda t: walk(t, feet)),
           ('Sniff', 'loop', SNIFF['duration'], lambda t: sniff(t, feet)),
           ('Sit', 'hold', SIT['duration'], lambda t: sit(t, feet, st)), ('Lie', 'hold', LIE['duration'], lambda t: lie(t, feet, lt)),
           ('Sleep', 'loop', SLEEP['duration'], lambda t: sleep(t, feet, lie_end)),
           ('PlayBow', 'once', PLAYBOW['duration'], lambda t: playbow(t, feet)),
           ('Scratch', 'once', SCRATCH['duration'], lambda t: scratch(t, feet)),
           ('Happy', 'once', HAPPY['duration'], lambda t: happy(t, feet))]
    return [(name, kind, d, feet.checked(name, fn)) for name, kind, d, fn in fns]


if __name__ == '__main__':
    common.run(sys.modules[__name__])
