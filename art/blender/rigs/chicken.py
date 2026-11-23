"""chicken.py -- the chicken's rig: public/models/chicken.glb -> chicken_rig.glb (common.py does the work; README.md has the
workflow).
    art/blender/rigs/build.sh chicken

Landmarks are glTF coordinates on the source (the chicken faces +Z, its left is +X), measured with orthographic renders,
vertex queries and texel lookups (Task 6 probes):
  - the body is one welded piece with the source's Head node (the head, comb, wattle, beak and the hackles down to a tilted
    cut ring, y 0.24-0.32); the wings are moulded into the body's sides, so they have no shell of their own;
  - the head faces forward and level as modelled (ruling R29 needs no straightening, REST_CHANGED stays empty): the eye
    centres (dark texels mapped onto the head) lie at (+-0.0374, 0.359, 0.158), level to 0.2 mm and square to +Z, the beak
    tip 2.6 mm off the midline; measured on the rig the face points 0.1 deg left, rolled 0.1 deg, the beak 30 deg below the
    eyes (rigs.test checks it);
  - the feet: each shank's bottom centre from slices of its leg's vertices, the right foot set 1.6 cm ahead of the left (kept:
    the goat's hind hooves stand 3.3 cm apart); each foot's toes reach 8.8 cm forward and 5.7 cm back, the leg 11.5 cm up to
    the drumstick's pivot: the foot is as long as the leg, which shapes the leg code below (_planted, _legs);
  - the inner toes of the two feet come within 1 cm of each other across the midline (the left foot's reaches x -0.0047, the
    right's -0.016): FEET_SPLIT keeps each leg's region to its own foot;
  - the comb, wattle and beak from their red and orange texels: all of them lie above y 0.38 or in front of z 0.15 above y
    0.28, inside the head's pure region (rigs.test checks every vertex there rides the head alone);
  - the fur texel above each eye, read off the surface 1.8 cm above the eye centre (cream; nearer texels are the eye ring).

Weights: bone heat, then regions. The head is a band across the neck (HEAD_BAND, along NECK_AXIS: square to the neck and tilted
so the comb's back and the wattle's bottom, the two lowest parts that must ride the head, lie at the same height in it), the
rest of each band vertex's weight kept on the bones bone heat gave it; then weights() smooths the hips / neck / head share
over the neck. The tail is banded across a plane at its root, each wing is an ellipse on the body's side banded outward (its
rest kept), each leg a region walked from its sole up the shank and banded into the belly feathers, the knee ramped
(JOINTS). A taper hands what the wings and legs hold off their regions to hips (bone heat gives the lower flanks to them
alone).

Clips: Idle and Walk (loops), Peck, Scratch, Flap and Fluff (once). The head stays still in space while the body moves (head
stabilisation, _head_at) in Idle, Walk, Flap and Scratch; it jerks and holds (common.jerks); pecks snap down and settle; the tail
lags the body.
"""
import heapq
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

ID, FACING = 'chicken', '+Z'
PAWS = {'L': (0.053, 0.022, 0.0), 'R': (-0.061, 0.022, 0.016)}      # each shank's bottom centre (leg_*_2's tail)
# legs: the drumstick (leg_*_1) from its pivot inside the body straight down to the knee in the shank, the shank (leg_*_2)
# from there down and 1.2 cm forward to the foot: a bird's knee (its ankle) behind the foot
KNEE_BACK, TOP_Y, KNEE_Y = 0.012, 0.115, 0.045
LEGS = {leg: ((p[0], TOP_Y, p[2] - KNEE_BACK), (p[0], KNEE_Y, p[2] - KNEE_BACK)) for leg, p in PAWS.items()}
HIPS, NECK_BASE = (0.0, 0.125, -0.02), (0.0, 0.235, 0.055)
HEAD_JOINT, BEAK = (0.0, 0.315, 0.115), (0.0, 0.345, 0.20)      # the top of the neck, behind the eyes; inside the beak
TAIL_ROOT, TAIL_END = (0.0, 0.275, -0.14), (0.0, 0.37, -0.20)
WINGS = {'L': ((0.10, 0.255, 0.085), (0.125, 0.175, -0.10)),        # shoulder (the wing's front top), tip
         'R': ((-0.10, 0.255, 0.085), (-0.125, 0.175, -0.10))}
EYES = {'L': dict(centre=(0.0376, 0.3591, 0.158), top=(0.0376, 0.3688, 0.158), radius=(0.0095, 0.0105), dome=0.003),
        'R': dict(centre=(-0.0372, 0.3589, 0.158), top=(-0.0372, 0.369, 0.158), radius=(0.0095, 0.0105), dome=0.003)}
LID_SIDES = 10
FUR_UV = {'L': (0.8776, 0.0819), 'R': (0.2045, 0.7895)}     # the cream texel 1.8 cm above each eye (Blender UV)
SKULL = (0.0, 0.36, 0.12)


def _bone(name, head, tail, parent):
    return dict(name=name, head=head, tail=tail, parent=parent)


def _lid(side):
    top = Vector(EYES[side]['top'])
    return _bone('lid_' + side, tuple(top), tuple(top + (top - Vector(SKULL)).normalized() * 0.01), 'head')


BONES = [_bone('root', (0, 0, 0), (0, 0.06, 0), None),
         _bone('hips', HIPS, NECK_BASE, 'root'),
         _bone('neck', NECK_BASE, HEAD_JOINT, 'hips'),
         _bone('head', HEAD_JOINT, BEAK, 'neck'),
         _lid('L'), _lid('R'),
         _bone('tail_1', TAIL_ROOT, TAIL_END, 'hips'),
         _bone('wing_L', *WINGS['L'], 'hips'), _bone('wing_R', *WINGS['R'], 'hips')]
for _leg in ('L', 'R'):
    BONES += [_bone(f'leg_{_leg}_1', LEGS[_leg][0], LEGS[_leg][1], 'hips'),
              _bone(f'leg_{_leg}_2', LEGS[_leg][1], PAWS[_leg], f'leg_{_leg}_1')]
LIVE = ['head', 'lid_L', 'lid_R', 'tail_1']    # R31: not the brief's neck: driving it shrinks the look clamp (yaw 25 deg)
# ruling R31: the game's live-look clamp (rigs.json look), measured on the built rig as rigs.test's lookPose applies it at rest:
# the largest whole 5 deg of yaw (pitch 0), then of pitch, whose ellipse keeps AR4 <= 1.6 on these bones
LOOK = dict(yaw=30, pitch=10, bones=['head'])     # yaw 35: 1.63x; pitch 15: 1.603x; neck + head: yaw only 25
REST_CHANGED = []

# ---- weights ----

NECK_AXIS = (0.0, 0.784, 0.621)   # the neck's direction: the comb's back and the wattle's bottom lie 13 mm up it from
                                   # HEAD_JOINT
HEAD_BAND = (0.008, 0.008, 0.06)   # the head alone above a (u along NECK_AXIS from HEAD_JOINT; 5 mm under those two), banded
                                   # inset b above and outset c below (6.8 cm: the back of the neck, the throat, the breast's top)
TAIL_PLANE = ((0.0, 0.265, -0.135), (0.0, 0.45, -0.89))   # a point on the tail's root and the normal into the tail
TAIL_BAND = (0.02, 0.025)
WING_ELLIPSE = dict(centre=(0.0, 0.225), axes=(0.118, 0.068), tilt=8.0, xmin=0.075, band=(0.6, 1.4))   # in the side view (z, y)
FEET_SPLIT = -0.010                # x between the feet: the left foot's inner toe reaches -0.0047, the right's -0.016
LEG_REACH = (0.085, 0.025, 0.08)   # walked from the soles: length (the shank's top, y 0.075), inset, outset (into the belly)
JOINTS = {'leg_L_2': 0.015, 'leg_R_2': 0.015}
TAPER = {}                         # region() fills it


def _in_foot_reach(mesh, side, length, inset, outset, keep=True):
    """common.in_reach walked from every sole vertex of one foot (y < 0.012 on its side) at once."""
    V = mesh.data.vertices
    kd = common._kdtree([v.co for v in V])
    adj = [set() for _ in V]
    for e in mesh.data.edges:
        a, b = e.vertices
        adj[a].add(b)
        adj[b].add(a)
    for v in V:
        for _, j, _ in kd.find_range(v.co, common.WELD):
            if j != v.index:
                adj[v.index].add(j)
                adj[j].add(v.index)
    sg = 1 if side == 'L' else -1
    mine = lambda i: (common.b2g(V[i].co)[0] - FEET_SPLIT) * sg > 0     # each walk keeps to its own side of the feet
    adj = [{j for j in a if mine(j)} if mine(i) else set() for i, a in enumerate(adj)]
    seeds = [v.index for v in V if common.b2g(v.co)[1] < 0.012 and mine(v.index)]
    dist, todo = {i: 0.0 for i in seeds}, [(0.0, i) for i in sorted(seeds)]
    heapq.heapify(todo)
    while todo:
        d, i = heapq.heappop(todo)
        if d > dist[i]:
            continue
        for j in sorted(adj[i]):
            nd = d + (V[i].co - V[j].co).length
            if nd < dist.get(j, math.inf):
                dist[j] = nd
                heapq.heappush(todo, (nd, j))
    geo = lambda p: dist.get(kd.find(common.g2b(p))[1], math.inf)

    def f(p):
        return geo(p) < length - inset

    def blend(p):
        d = geo(p)
        if not length - inset <= d < length + outset:
            return None
        return (length + outset - d) / (inset + outset), d < length

    f.blend, f.keep = blend, keep
    return f


def region(mesh):
    """The head across the neck band (HEAD_BAND), the tail beyond TAIL_PLANE, each wing in its ellipse, each leg walked up
    from its sole (LEG_REACH), all banded; the wing, head and leg bands keep the rest of their weight on the vertex's own
    bones. Fills TAPER (see below)."""
    a, inset, outset = HEAD_BAND
    n = Vector(NECK_AXIS).normalized()
    r = {'head': common.in_plane(tuple(Vector(HEAD_JOINT) + n * (a - inset)), NECK_AXIS, inset, outset,
                                 ((-0.2, 0.17, -0.03), (0.2, 0.47, 0.24)), keep=True),
         'tail_1': common.in_plane(*TAIL_PLANE, *TAIL_BAND, ((-0.08, 0.19, -0.25), (0.08, 0.45, -0.09))),
         'wing_L': common.in_wing('L', WING_ELLIPSE), 'wing_R': common.in_wing('R', WING_ELLIPSE)}
    for leg in 'LR':
        r[f'leg_{leg}_1'] = _in_foot_reach(mesh, leg, *LEG_REACH)
    # bone heat hands the lower flanks to the wings and legs alone (hips runs down the middle): what each banded bone (and
    # a leg's shank) holds off its region and band goes to hips instead, so no vertex is left to the nearest bone whole
    for b, f in r.items():
        if b != 'head':
            TAPER[b] = (lambda f: lambda p: 1.0 if f(p) or f.blend(p) is not None else 0.0)(f)
    for leg in 'LR':
        TAPER[f'leg_{leg}_2'] = TAPER[f'leg_{leg}_1']
    return r


SMOOTH = dict(bones=('hips', 'neck', 'head'), passes=6, radius=0.025, below=-0.07,
              box=((-0.2, 0.17, -0.06), (0.2, 0.47, 0.25)))


def weights(mesh, arm):
    """Smooths how hips, neck and head share each vertex's weight over the neck: `passes` times, each vertex takes the
    Gaussian-weighted mean share of the vertices within `radius` u (by position, so the head's cut ring, whose two sides lie
    0.6-3 mm apart on different edges, keeps one share). Only the vertices above `below` u along NECK_AXIS from HEAD_JOINT
    and inside `box` move, and only their share of these three bones (a wing band's own weight stays); every vertex the head
    carries alone (the comb, wattle, beak and skull) and everything else stay put. This chicken's head sits on its body:
    the plane band and bone heat's bumps in the split tore the side of the neck at 1.65x for a 20 deg head turn (1.35x
    smoothed)."""
    V, S = mesh.data.vertices, SMOOTH
    names = {g.index: g.name for g in mesh.vertex_groups}
    P = [Vector(common.b2g(v.co)) for v in V]
    kd = common._kdtree([v.co for v in V])
    W = [{names[g.group]: g.weight for g in v.groups if g.weight > 0} for v in V]
    bones, n = set(S['bones']), Vector(NECK_AXIS).normalized()
    share = lambda w: {b: x for b, x in w.items() if b in bones}
    lo, hi = S['box']
    zone = lambda p: (p - Vector(HEAD_JOINT)).dot(n) > S['below'] and all(lo[k] <= p[k] <= hi[k] for k in range(3))
    free = [i for i, w in enumerate(W) if sum(share(w).values()) > 1e-6 and w.get('head', 0.0) < 0.999 and zone(P[i])]
    common.log(f'weights: smoothing the neck share of {len(free)} vertices')
    near = {i: [(j, math.exp(-0.5 * (d / (S['radius'] / 2)) ** 2)) for _, j, d in kd.find_range(V[i].co, S['radius'])]
            for i in free}
    for _ in range(S['passes']):
        new = {}
        for i in free:
            acc, m = {}, 0.0
            for j, k in sorted(near[i]):
                s = share(W[j])
                t = sum(s.values())
                if t > 1e-6:
                    m += k
                    for b, x in s.items():
                        acc[b] = acc.get(b, 0.0) + k * x / t
            tot = sum(share(W[i]).values())
            new[i] = {b: tot * acc.get(b, 0.0) / m for b in sorted(bones)}
        for i, w in new.items():
            W[i] = {**{b: x for b, x in W[i].items() if b not in bones}, **{b: x for b, x in w.items() if x > 1e-6}}
    groups = {g.name: g for g in mesh.vertex_groups}
    for i in free:
        top = sorted(W[i].items(), key=lambda kv: (-kv[1], kv[0]))[:4]
        s = sum(x for _, x in top)
        for g in list(V[i].groups):
            groups[names[g.group]].remove([i])
        for b, x in top:
            groups[b].add([i], x / s, 'REPLACE')


# ---- axes and small helpers ----

X, Y, Z = common.X, common.Y, common.Z
I3 = Matrix.Identity(3)


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


SNAP = dict(w=26.0, zeta=0.75)    # a head jerk's spring: rad/s and damping (rises in about 0.07 s, overshoots 5 %)


def _head_at(arm, P, R=I3, d=(0.0, 0.0, 0.0), neck_follow=0.5):
    """P with the head placed in the model's space, whatever the body does: turned by R about its joint and the joint moved
    by d from its default place (a bird's head stabilisation: the head holds still while the body moves under it). The neck
    turns neck_follow of the way toward the head's new place (pitch and yaw), the head bone takes the exact rest by its own
    rotation and loc."""
    B = arm.data.bones
    h0, n0 = Vector(HEAD_JOINT), Vector(NECK_BASE)
    target = h0 + Vector(d)
    P = dict(P)
    if neck_follow:
        M = common.fk(arm, P)
        base = M['hips'] @ n0
        R_par = M['hips'].to_3x3()
        u = R_par.inverted() @ (target - base)       # the target direction in the neck's parent frame
        v = h0 - n0
        yaw = math.degrees(math.atan2(u.x, u.z) - math.atan2(v.x, v.z))
        pitch = math.degrees(math.atan2(v.y, math.hypot(v.x, v.z)) - math.atan2(u.y, math.hypot(u.x, u.z)))
        P = common.merge(P, {'neck': {'rot': (neck_follow * pitch, neck_follow * yaw, 0.0)}})
    M = common.fk(arm, P)
    Mn = M[B['head'].parent.name]
    want = Matrix.Translation(target) @ R.to_4x4() @ Matrix.Translation(-h0)
    L = Mn.inverted() @ want
    E = L.to_3x3()
    loc = L.to_translation() - h0 + E @ h0
    P['head'] = {'rot': common.euler(E), 'loc': tuple(loc)}
    return P


def _wing(side, out=0.0, up=0.0):
    """A wing's lift: `out` deg swinging its lower edge away from the body about its top edge (a fore-aft line through the
    shoulder), then `up` deg raising its tips about the shoulder's left axis."""
    sg = 1 if side == 'L' else -1
    return common.rot(X, up) @ common.rot(Z, sg * out)


TAIL_D = (Vector(TAIL_END) - Vector(TAIL_ROOT)).normalized()


def _tail(lift=0.0, side=0.0, twist=0.0):
    """tail_1's turn: lift (positive: the fan up and forward over the back) about X, side (positive: toward the chicken's
    left) about the axis square to the tail in its upright plane, twist about the tail's own length."""
    return common.rot(X, lift) @ common.rot(TAIL_D.cross(X).normalized(), -side) @ common.rot(TAIL_D, twist)


def _planted(feet, P, targets=None):
    """P with each leg's foot flat on its target (glTF; default: its rest place on the ground): the shank keeps its rest
    angle in the model's space, the drumstick (leg_*_1) turns from its top to the knee's place over that foot and slides along
    its length (loc) by however much the distance differs from its own length (a few mm as the body shifts: the leg draws
    into or out of the feathers). A chicken's foot is as long as its leg and rigid with its shank: two-bone IK on the
    ground point (Feet.planted) tips it, and raising the tipped foot until its toes clear folds the near-straight leg further."""
    arm, B, out = feet.arm, feet.arm.data.bones, dict(P)
    M = common.fk(arm, P)
    for leg, g in (targets or {leg: feet.ground[leg] for leg in LEGS}).items():
        T, K, F = (Vector(c) for c in feet.chains[leg])
        par = M[B[f'leg_{leg}_1'].parent.name]
        knee = par.inverted() @ (Vector(g) + K - Vector((F.x, 0.0, F.z)))     # in the parent's default-pose frame
        d0, d1 = K - T, knee - T
        E = d0.rotation_difference(d1).to_matrix()
        out[f'leg_{leg}_1'] = {'rot': common.euler(E), 'loc': tuple((d1.length - d0.length) * d1.normalized())}
        out[f'leg_{leg}_2'] = {'rot': common.euler((par.to_3x3().normalized() @ E).inverted())}
    return out


def _reach_x(feet, leg, swing_deg):
    """How far a walking foot's ground point goes either side of its rest place, as gait() works it out."""
    T, _, F = feet.chains[leg]
    return math.hypot(T[1], T[2] - F[2]) * math.sin(math.radians(swing_deg))


# ---- clips ----

IDLE = dict(duration=2.4,
            yaw=[(0.0, 0.0), (0.25, 15.0), (0.85, -13.0), (1.45, -4.0), (2.05, 0.0)],
            roll=[(0.0, 0.0), (0.25, -8.0), (0.85, 7.0), (1.45, 3.0), (2.05, 0.0)],
            pitch=[(0.0, 0.0), (0.25, -3.0), (0.85, -6.0), (1.45, 9.0), (2.05, 0.0)],
            reach=[(0.0, 0.0), (0.25, 0.0), (0.85, -0.002), (1.45, 0.006), (2.05, 0.0)])


def idle(t, feet):
    """2.4 s loop: the head jerks four times (left, right, down and back, each snapped by a spring in about 0.1 s with a
    small overshoot, then held), turning and tilting to look with one eye; the head holds still in space while the body
    breathes and shifts its weight over planted feet (head stabilisation); one blink; the tail flicks once after the weight
    shift; a wing settles."""
    D, I = IDLE['duration'], IDLE
    w = 2 * math.pi * t / D
    breath = 0.5 - 0.5 * math.cos(2 * w)
    roll, dx = 1.2 * math.sin(w), 0.003 * math.sin(w)
    R = {'hips': common.rot(Z, roll) @ common.rot(X, 0.8 * breath)}
    R['tail_1'] = _tail(lift=2 * breath, side=6 * common.bump(t, 0.95, 1.35) - 3 * common.bump(t, 1.3, 1.6) + 1.5 * math.sin(w - 0.6))
    ruffle = common.bump(t, 1.9, 2.15)
    R['wing_L'], R['wing_R'] = _wing('L', out=5 * ruffle), _wing('R', out=1.5 * ruffle)
    blink = common.bump(t, 1.52, 1.68)
    P = common.pose(R, {'hips': {'loc': (dx, 0.0015 * breath, 0.0)}, 'lid_L': {'scale': blink}, 'lid_R': {'scale': blink}})
    H = common.turn(pitch=common.jerks(t, I['pitch'], D, SNAP), yaw=common.jerks(t, I['yaw'], D, SNAP), roll=common.jerks(t, I['roll'], D, SNAP))
    P = _head_at(feet.arm, P, H, (0.0, 0.0, common.jerks(t, I['reach'], D, SNAP)))
    return _planted(feet, P)


WALK = dict(duration=0.5, swing_deg=13, lift=0.028, hold=0.55)
STANCE = 0.5       # each foot's share of the cycle on the ground: one foot down at a time (see _legs)


def _stance(feet, leg, dz):
    """A planted leg with its foot dz along from its rest place, flat: (drumstick turn deg, the body's dip u)."""
    T, K, _ = (Vector(c) for c in feet.chains[leg])
    l1 = (K - T).length
    bob = math.sqrt(l1 * l1 - dz * dz) - l1
    return math.degrees(common._turn_x(K - T, K + Vector((0, 0, dz)) - (T + Vector((0, bob, 0))))), bob


def _legs(t, feet):
    """The walk's legs and the body's bob: (leg poses, hips height).

    A chicken's toes are as long as its leg and rigid with its shank, so a planted foot stays flat only while its shank keeps
    its rest angle: in its stance (half the cycle, BIPED phases, one foot down at a time) each foot slides back flat along
    the ground (its ground point as gait() moves it: 2 x over the stance), only its drumstick (leg_*_1, straight above the
    knee at rest) turning, and the body rides on that leg as on a stilt, dipping sqrt(l1^2 - dz^2) - l1 as the foot leaves
    the place under it (5 mm at the ends: the bob of a walking bird, the same for both legs, so it runs on smoothly when the
    feet change). gait()'s planting cannot be used: its two-bone IK tips a foot as the foot slides, and raising the tipped
    foot until its long heel or toes clear the ground (feet=) folds the near-straight leg, which tips the foot further: the
    fold ran away to 66-106 deg.
    The swinging foot stays flat too and comes forward on gait()'s path (-x cos(pi s)), the drumstick turning as in a
    stance, while the whole leg draws up into the body's feathers (leg_*_1 loc): `lift` mid-swing and 0.75 of it from the
    first swing frame to the last (ruling R8 lifts each swing frame clear of AR5's stance band). Folding the leg to lift the
    foot cannot clear the ground: the fold tips the foot 36-93 deg toes up and its long heel still dips."""
    D, W, legs = WALK['duration'], WALK, {}
    phase = {leg: (t / D + ph) % 1.0 for leg, ph in common.BIPED.items()}
    x = {leg: _reach_x(feet, leg, W['swing_deg']) for leg in phase}
    bob = 0.0
    for leg, p in phase.items():
        if p < STANCE:
            a1, bob = _stance(feet, leg, x[leg] * (1 - 2 * p / STANCE))
            legs.update({f'leg_{leg}_1': {'rot': (a1, 0.0, 0.0)}, f'leg_{leg}_2': {'rot': (-a1, 0.0, 0.0)}})
    for leg, p in phase.items():
        if p >= STANCE:
            s = (p - STANCE) / (1 - STANCE)
            a1, own = _stance(feet, leg, -x[leg] * math.cos(math.pi * s))
            up = W['lift'] * (0.75 + 0.25 * math.sin(math.pi * s)) + own - bob     # the foot's height above the ground
            legs.update({f'leg_{leg}_1': {'rot': (a1, 0.0, 0.0), 'loc': (0.0, up, 0.0)},
                         f'leg_{leg}_2': {'rot': (-a1, 0.0, 0.0)}})
    return legs, bob


def walk(t, feet):
    """0.5 s biped walk: one foot down at a time, each sliding back flat on the ground in its stance while the body rides on
    it and bobs twice a stride (_legs); the head holds still in space while the body walks on under it, then thrusts
    forward, once a step (head stabilisation: the game moves the chicken at stride / duration); the tail swings a beat
    behind."""
    D, W = WALK['duration'], WALK
    w = 2 * math.pi * t / D
    v = 2 * sum(_reach_x(feet, leg, W['swing_deg']) for leg in LEGS) / len(LEGS) / (STANCE * D)    # the feet's speed
    Ts = D / 2
    A = v * W['hold'] * Ts                   # how far the body walks under the held head in one step
    u = (t / Ts) % 1.0
    if u < W['hold']:
        z = A * (0.5 - u / W['hold'])
    else:
        z = _hermite(u * Ts, [(W['hold'] * Ts, -A / 2, -v), (Ts, A / 2, -v)])
    dip = -0.004 * common.bump(u, W['hold'], 1.0)
    R = {'tail_1': _tail(side=-7 * math.sin(w - 1.0), lift=2 * math.sin(2 * w - 1.2))}
    legs, bob = _legs(t, feet)
    P = common.merge(legs, common.pose(R, {'hips': {'loc': (0.0, bob, 0.0)}}))
    return _head_at(feet.arm, P, I3, (0.0, dip, z))


# the body tips `tilt` deg forward about the leg tops (the tail rising), the neck and the head add theirs; each strike adds
# strike_* deg more and moves the head by `reach` u (in the neck's frame): from 1-3 cm over the ground the beak strikes it
PECK = dict(duration=0.9, tilt=45.0, neck=16.0, head=2.0, strike_tilt=6.0, strike_neck=4.0, strike_head=9.0,
            strikes=[0.24, 0.43, 0.62], reach=(0.0, -0.015, 0.012))


def _peck_strike(t):
    """0..1: each peck snaps down in 0.04 s, holds a beat at the ground and lifts back over 0.1 s."""
    s = 0.0
    for a in PECK['strikes']:
        s = max(s, _hermite(t, [(a - 0.05, 0.0, 0.0), (a, 1.0, 0.0), (a + 0.03, 1.0, 0.0), (a + 0.13, 0.0, 0.0)]))
    return s


def peck(t, feet):
    """0.9 s once: the chicken tips forward over planted feet (the tail rising high), the neck and head reach down and the
    beak strikes the ground three times, each a quick snap of the whole body down, a beat, and a lift; the tail and wings
    lag; then it straightens up. This chicken's head sits on its body (no neck to stretch down), so the body tips 51 deg at
    each strike; the neck and head bend 20 and 11 deg more within AR4, the head nose-down so the beak tip leads the throat
    to the ground (4.7-6.6 mm at the strikes in three.js)."""
    K = PECK
    k = common.ramp(t, 0.0, 0.2) * (1 - common.ramp(t, 0.7, 0.9))
    s = _peck_strike(t)
    lag = common.ramp(t, 0.05, 0.28) * (1 - common.ramp(t, 0.72, 0.9))
    R = {'hips': common.rot(X, K['tilt'] * k + K['strike_tilt'] * s), 'neck': common.rot(X, K['neck'] * k + K['strike_neck'] * s),
         'head': common.rot(X, K['head'] * k + K['strike_head'] * s), 'tail_1': _tail(lift=10 * lag - 3 * s),
         'wing_L': _wing('L', out=3 * lag), 'wing_R': _wing('R', out=3 * lag)}
    P = feet.held(common.pose(R), legs=('L', 'R'), limit=0.045)
    P = common.merge(P, {'head': {'loc': tuple(c * s for c in K['reach'])}})
    return _planted(feet, P)


SCRATCH = dict(duration=1.2, leg='R', shift=0.008, fwd=0.03, back=-0.04, lift=0.025)


def _scrape(t):
    """The scratching foot's offset (z, y) from its ground point: up and forward, down, dragged back along the ground,
    twice, then back home; C1 throughout."""
    S = SCRATCH
    f, b, h = S['fwd'], S['back'], S['lift']
    zk = [(0.12, 0.0, 0.0), (0.24, f, 0.0), (0.27, f, -0.15), (0.40, b, 0.0), (0.52, f, 0.0), (0.55, f, -0.15), (0.68, b, 0.0),
          (0.82, 0.0, 0.0)]
    yk = [(0.12, 0.0, 0.0), (0.18, h, 0.0), (0.25, 0.0, 0.0), (0.40, 0.0, 0.0), (0.46, h, 0.0), (0.53, 0.0, 0.0), (0.68, 0.0, 0.0),
          (0.75, h * 0.8, 0.0), (0.82, 0.0, 0.0)]
    return _hermite(t, zk), _hermite(t, yk)


def scratch(t, feet):
    """1.2 s once: the chicken shifts its weight onto its left foot and the right foot scrapes back along the ground twice
    (each time lifted forward, set down and dragged back), the body rocking with each drag; then it looks down at the
    scratched ground, head tilted to bring one eye to it, and straightens up."""
    S = SCRATCH
    shift = common.ramp(t, 0.0, 0.14) * (1 - common.ramp(t, 0.78, 0.95))
    look = common.ramp(t, 0.78, 0.98) * (1 - common.ramp(t, 1.04, 1.2))
    drag = common.bump(t, 0.27, 0.40) + common.bump(t, 0.55, 0.68)
    R = {'hips': common.rot(Z, -3 * shift) @ common.rot(X, 4 * drag + 10 * look),
         'tail_1': _tail(side=5 * common.bump(t, 0.3, 0.5) + 5 * common.bump(t, 0.58, 0.78), lift=4 * look),
         'wing_L': _wing('L', out=3 * drag), 'wing_R': _wing('R', out=3 * drag)}
    P = feet.held(common.pose(R, {'hips': {'loc': (S['shift'] * shift, 0.0, 0.0)}}), legs=('L', 'R'), axes='yz')
    H = common.turn(pitch=22 * look + 4 * drag, yaw=-10 * look, roll=-14 * look)
    P = _head_at(feet.arm, P, H, (0.0, -0.015 * look, 0.01 * look))
    dz, dy = _scrape(t)
    g = feet.ground
    leg = S['leg']
    other = 'L' if leg == 'R' else 'R'
    return _planted(feet, P, {other: g[other], leg: (g[leg][0], dy, g[leg][2] + dz)})


FLAP = dict(duration=0.8, out=13.0, up=5.0, hz=3.75)


def flap(t, feet):
    """0.8 s once: the chicken leans back and flaps its wings three times (each a quick lift, 13 deg out and 5 up, 14 deg in
    all: the motion limit is 20, and the moulded wing's band stretches 1.5x there), the tail fanning up; its head keeps still
    in space and rises a little."""
    F = FLAP
    env = common.ramp(t, 0.0, 0.12) * (1 - common.ramp(t, 0.6, 0.8))
    beat = 0.5 - 0.5 * math.cos(2 * math.pi * F['hz'] * t)
    a = env * beat
    lagged = env * (0.5 - 0.5 * math.cos(2 * math.pi * F['hz'] * max(t - 0.04, 0.0)))
    R = {'hips': common.rot(X, -3 * env), 'wing_L': _wing('L', out=F['out'] * a, up=F['up'] * a),
         'wing_R': _wing('R', out=F['out'] * a, up=F['up'] * a), 'tail_1': _tail(lift=8 * env + 4 * lagged)}
    P = feet.held(common.pose(R), legs=('L', 'R'), limit=0.045)
    P = _head_at(feet.arm, P, common.turn(pitch=-6 * env), (0.0, 0.012 * env, 0.0))
    return _planted(feet, P)


FLUFF = dict(duration=1.0, puff=1.07, hz=6.5)


def fluff(t, feet):
    """1.0 s once: the body puffs up (hips scaled up to 7 %, the brief's limit is 8 %, the legs, head and tail kept their
    size), then a shake runs through it: the body rolls quickly side to side, dying away, the head shaking a beat later with
    the eyes shut, the wings and tail ruffling; it settles back."""
    F = FLUFF
    puff = common.ramp(t, 0.0, 0.3) * (1 - common.ramp(t, 0.72, 0.98))
    s = lambda tt: math.sin(2 * math.pi * F['hz'] * max(tt - 0.32, 0.0)) * math.exp(-3.0 * max(tt - 0.32, 0.0))
    env = lambda tt: common.ramp(tt, 0.3, 0.38) * (1 - common.ramp(tt, 0.8, 0.95))
    body = env(t) * s(t)
    R = {'hips': common.rot(Z, 4 * body) @ common.rot(Y, 6 * body), 'tail_1': _tail(side=-10 * env(t - 0.05) * s(t - 0.05), lift=5 * puff),
         'wing_L': _wing('L', out=4 * puff + 4 * abs(body)), 'wing_R': _wing('R', out=4 * puff + 4 * abs(body))}
    head = env(t - 0.04) * s(t - 0.04)
    P = _head_at(feet.arm, common.pose(R), common.turn(roll=-14 * head, yaw=6 * head), (0.0, 0.0, 0.0), neck_follow=0.3)
    shut = common.ramp(t, 0.32, 0.38) * (1 - common.ramp(t, 0.8, 0.88))
    P = _planted(feet, common.merge(P, {'lid_L': {'scale': shut}, 'lid_R': {'scale': shut}}))
    # the puff last: inflate() gives each child of hips the scale and loc that cancel the body's, so the planted legs, the
    # placed head and the tail stay exactly where they are while the body swells about the hips joint
    return common.merge(P, common.inflate(feet.arm, 'hips', 1 + (F['puff'] - 1) * puff))


def clips(arm):
    """The chicken's six clips; every frame goes through feet.check(), which logs a clip whose final pose still sinks into
    the ground (ruling R25)."""
    feet = common.Feet(arm, next(c for c in arm.children if c.type == 'MESH'))
    fns = [('Idle', 'loop', IDLE['duration'], idle), ('Walk', 'loop', WALK['duration'], walk),
           ('Peck', 'once', PECK['duration'], peck), ('Scratch', 'once', SCRATCH['duration'], scratch),
           ('Flap', 'once', FLAP['duration'], flap), ('Fluff', 'once', FLUFF['duration'], fluff)]
    return [(name, kind, d, feet.checked(name, (lambda f: lambda t: f(t, feet))(fn))) for name, kind, d, fn in fns]


if __name__ == '__main__':
    common.run(sys.modules[__name__])
