"""duck.py -- the duck's rig: public/models/duck.glb -> duck_rig.glb (common.py does the work; README.md has the workflow).
    art/blender/rigs/build.sh duck

Landmarks are glTF coordinates on the source (the duck faces +Z, its left is +X), measured with orthographic renders,
vertex queries and texel lookups (Task 7 probes):
  - one welded piece (1299 vertices, no Head node, no cut): the body floats with its flat hull bottom at y -0.05 (the
    waterline is y 0), the head sits on a short, thick neck whose green meets the white body at a collar (y 0.10 at the
    throat, z 0.14; y 0.12 at the nape, z 0.036); the wings are moulded into the body's sides; there are no legs;
  - the head faces forward and level as modelled (ruling R29 needs no straightening, REST_CHANGED stays empty): the eye
    centres (dark texels mapped onto the head) lie at (0.0352, 0.2004, 0.1263) and (-0.0342, 0.1993, 0.1262), level to
    1.1 mm and square to +Z, the bill tip 1.3 mm off the midline (rigs.test checks the face on the rig);
  - the wings from the side view: each a tilted ellipse from its front tip (z 0.075, y 0.061) to its rear tip (z -0.164,
    y 0.144), standing 0.10-0.14 out from the midline;
  - the tail: the raised point at the back (its tip at z -0.19, y 0.19);
  - the green texel above each eye, read off the surface 1.8 cm above the eye centre (nearer texels are the eye's rim).

Weights: bone heat, then regions: the tail is banded across a plane at its root, each wing is an ellipse on the body's side
banded outward (chicken.py's). With no cut and a neck as thick as the head, the neck and head then take their shares from
smooth functions of position (neck_shares, weights()): the neck column fades in up from the breast and out across the
shoulders and the back, the head's share rises up the column from under the collar to above the bill's base (the bill and
the eyes ride the head alone, rigs.test checks it), so a turn twists the whole green neck instead of shearing it at one
ring. The neck joint sits at the collar's centre, the head joint at the back of the skull's base; both were placed and the
shares tuned by measuring the stretch (AR4) of a preen-sized turn (90-100 deg) and a dabble-sized nod over a grid of values.

The body's pivot. The hips joint sits low at the front of the hull (HIPS), under the breast, so a forward tip (Dabble)
turns about the breast and lifts the tail without driving hips' loc past AR2's 0.05 in z; _body() turns hips about any
pivot. Every clip's frames go through _afloat(), which lifts hips by however much the lowest body vertex (any not dominated
by the neck or head) would sink below FLOOR (ruling R32: the duck floats, nothing under its rest hull bottom - 0.01).

Clips: Idle and Paddle (loops), Preen, Dabble and Shake (once). The head snaps to a new look and settles (common.jerks); the body
bobs on the water; the tail waggles and lags the body; the moulded wings lift at most 10.0 deg (the limit is 12).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
from mathutils import Vector  # noqa: E402

ID, FACING = 'duck', '+Z'
HULL = -0.05                                    # the rest hull bottom (the waterline is y 0)
FLOOR = HULL - 0.007                            # _afloat keeps every body vertex above this (R32 allows HULL - 0.01)
HIPS, HIPS_TAIL = (0.0, -0.02, 0.11), (0.0, 0.08, -0.15)   # the pivot low under the breast; the bone runs back through it
NECK_BASE, HEAD_JOINT, BILL = (0.0, 0.11, 0.088), (0.0, 0.145, 0.085), (0.0, 0.15, 0.20)
TAIL_ROOT, TAIL_END = (0.0, 0.10, -0.165), (0.0, 0.185, -0.205)
WINGS = {'L': ((0.11, 0.10, 0.06), (0.11, 0.14, -0.16)),      # shoulder (the wing's front top), tip
         'R': ((-0.11, 0.10, 0.06), (-0.11, 0.14, -0.16))}
EYES = {'L': dict(centre=(0.0352, 0.2004, 0.1263), top=(0.0352, 0.2105, 0.1263), radius=(0.0105, 0.0105), dome=0.003),
        'R': dict(centre=(-0.0342, 0.1993, 0.1262), top=(-0.0342, 0.2094, 0.1262), radius=(0.0105, 0.0105), dome=0.003)}
LID_SIDES = 10
FUR_UV = {'L': (0.3574, 0.4807), 'R': (0.0922, 0.5271)}     # the green texel 1.8 cm above each eye (Blender UV)
SKULL = (0.0, 0.19, 0.095)


def _bone(name, head, tail, parent):
    return dict(name=name, head=head, tail=tail, parent=parent)


def _lid(side):
    top = Vector(EYES[side]['top'])
    return _bone('lid_' + side, tuple(top), tuple(top + (top - Vector(SKULL)).normalized() * 0.01), 'head')


BONES = [_bone('root', (0, 0, 0), (0, 0.06, 0), None),
         _bone('hips', HIPS, HIPS_TAIL, 'root'),
         _bone('neck', NECK_BASE, HEAD_JOINT, 'hips'),
         _bone('head', HEAD_JOINT, BILL, 'neck'),
         _lid('L'), _lid('R'),
         _bone('tail_1', TAIL_ROOT, TAIL_END, 'hips'),
         _bone('wing_L', *WINGS['L'], 'hips'), _bone('wing_R', *WINGS['R'], 'hips')]
LIVE = ['head', 'neck', 'lid_L', 'lid_R', 'tail_1']
LOOK = dict(yaw=60, pitch=55, bones=['neck', 'head'])
REST_CHANGED = []

# ---- weights ----

NECK_AXIS = (0.0, 0.966, 0.259)    # the neck column's direction (15 deg forward of vertical)
TAIL_PLANE = ((0.0, 0.11, -0.17), (0.0, 0.8, -0.6))     # a point on the tail's root and the normal into the tail
TAIL_BAND = (0.03, 0.04)
WING_ELLIPSE = dict(centre=(-0.045, 0.095), axes=(0.127, 0.047), tilt=-19.0, xmin=0.075, band=(0.6, 1.4))   # side view
TAPER = {}                         # region() fills it


def region(mesh):
    """The tail beyond TAIL_PLANE and each wing in its ellipse, banded; the wing bands keep the rest of their weight on the
    vertex's own bones (the neck and head come after, in weights()). Fills TAPER (see below)."""
    r = {'tail_1': common.in_plane(*TAIL_PLANE, *TAIL_BAND, ((-0.12, 0.0, -0.25), (0.12, 0.25, -0.08))),
         'wing_L': common.in_wing('L', WING_ELLIPSE), 'wing_R': common.in_wing('R', WING_ELLIPSE)}
    # bone heat may hand parts of the lower flanks to the wings alone: what a banded bone holds off its region and band
    # goes to hips instead, so no vertex is left to the nearest bone whole
    for b, f in r.items():
        TAPER[b] = (lambda f: lambda p: 1.0 if f(p) or f.blend(p) is not None else 0.0)(f)
    return r


# the neck and head shares as smooth functions of where a vertex lies about the neck (weights()): u its height over the
# throat's collar along U_NORMAL, tilted 30 deg forward so the bill's base (u 0.021) rides higher than the collar at the nape
# (u -0.033), and r its distance from the neck column's axis (NECK_AXIS through NECK_C)
THROAT, U_NORMAL = (0.0, 0.10, 0.14), (0.0, 0.866, 0.5)
NECK_C = (0.0, 0.11, 0.088)            # the neck column's centre at the collar
NECK_W = dict(head=(-0.05, 0.06),      # the head's share of the neck column rises from 0 to 1 over this u
              neck=(-0.09, -0.02),     # the neck column's share (neck + head) rises from 0 to 1 over this u
              radius=(0.05, 0.15),     # and falls from 1 to 0 over this r (the collar is 0.05 from the axis)
              crown=(0.0, 0.03),       # above this u the falloff fades out: the bill and the whole head are the head's
              bill=((0.15, 0.18), (0.08, 0.11)))   # and the head's share rises to 1 forward over this z, above this y


def _ss(x):
    return common.ease(x)


def neck_shares(p):
    """(neck, head) weights at p (glTF) by NECK_W."""
    a_ = Vector(NECK_AXIS).normalized()
    u = (Vector(p) - Vector(THROAT)).dot(Vector(U_NORMAL).normalized())
    d = Vector(p) - Vector(NECK_C)
    r = (d - a_ * d.dot(a_)).length
    up = lambda x, span: _ss((x - span[0]) / (span[1] - span[0]))
    rf = 1 - up(r, NECK_W['radius'])
    rf += (1 - rf) * up(u, NECK_W['crown'])
    s = rf * up(u, NECK_W['neck'])
    (bz, by) = NECK_W['bill']
    h = 1 - (1 - up(u, NECK_W['head'])) * (1 - up(p[2], bz) * up(p[1], by))
    return s * (1 - h), s * h


def weights(mesh, arm):
    """The neck and the head take their shares from neck_shares() (smooth in position, so a turn or a nod spreads over the
    whole neck column and down into the breast and shoulders, never across a seam of bone heat's), the vertex's other bones
    (bone heat's, after the regions) the rest in their own proportions; hips the rest of a vertex that had no other."""
    V = mesh.data.vertices
    names = {g.index: g.name for g in mesh.vertex_groups}
    groups = {g.name: g for g in mesh.vertex_groups}
    for v in V:
        if any(names[g.group].startswith('lid_') for g in v.groups):     # an eyelid cap (none yet when run() calls this)
            continue
        w = {names[g.group]: g.weight for g in v.groups if g.weight > 0 and names[g.group] not in ('neck', 'head')}
        nk, hd = neck_shares(common.b2g(v.co))
        rest = 1.0 - nk - hd
        t = sum(w.values())
        w = {b: rest * x / t for b, x in w.items()} if t > 1e-9 else {'hips': rest}
        w.update({'neck': nk, 'head': hd})
        top = sorted(((b, x) for b, x in w.items() if x > 1e-6), key=lambda kv: (-kv[1], kv[0]))[:4]
        s = sum(x for _, x in top)
        for g in list(v.groups):
            groups[names[g.group]].remove([v.index])
        for b, x in top:
            groups[b].add([v.index], x / s, 'REPLACE')


# ---- axes and small helpers ----

X, Y, Z = common.X, common.Y, common.Z


SNAP = dict(w=22.0, zeta=0.75)    # a head turn's spring: rad/s and damping (rises in about 0.08 s, overshoots 5 %)


def _body(R, pivot=None, lift=0.0):
    """hips' pose entry: turned by R about `pivot` (glTF; default the hips joint) and raised by lift."""
    h = Vector(HIPS)
    q = h if pivot is None else Vector(pivot)
    loc = (q - h) - R @ (q - h) + Vector((0.0, lift, 0.0))
    return {'rot': common.euler(R), 'loc': tuple(loc)}


def _wing(side, out=0.0, up=0.0):
    """A wing's lift: `out` deg swinging its lower edge away from the body about its top edge, then `up` deg raising its
    tips about the shoulder's left axis."""
    sg = 1 if side == 'L' else -1
    return common.rot(X, up) @ common.rot(Z, sg * out)


def _tail(lift=0.0, side=0.0):
    """tail_1's turn: lift (positive: up) about X, side (positive: the tail's tip toward the duck's left) about the up
    axis, as a duck waggles its tail."""
    return common.rot(X, lift) @ common.rot(Y, -side)


class Float:
    """The body's vertices (every vertex not dominated by the neck, the head or a lid) for _afloat."""

    def __init__(self, arm, mesh):
        self.arm = arm
        names = {g.index: g.name for g in mesh.vertex_groups}
        self.body = []
        for v in mesh.data.vertices:
            b = names[max(v.groups, key=lambda g: g.weight).group]
            if b in ('neck', 'head') or b.startswith('lid_'):
                continue
            ws = tuple((names[g.group], g.weight) for g in v.groups if g.weight > 0)
            self.body.append((b, ws, Vector(common.b2g(v.co))))

    def low(self, P):
        return common.Feet.at(common.fk(self.arm, P), self.body)

    def afloat(self, P):
        """P with hips raised by however much its lowest body vertex lies under FLOOR (a translation of hips moves every
        vertex alike, so this is exact and as smooth as the motion)."""
        d = FLOOR - self.low(P)
        return common.merge(P, {'hips': {'loc': (0.0, d, 0.0)}}) if d > 0 else P


# ---- clips ----

FRONT = (0.0, HULL, 0.13)     # the hull's front bottom edge: Dabble and Paddle tip the body about it
MID = (0.0, 0.0, -0.03)       # the waterline under the body's middle: Idle, Preen and Shake rock it about there

IDLE = dict(duration=3.0, bob=(0.0045, 0.002),
            yaw=[(0.0, 0.0), (0.35, 28.0), (1.1, -22.0), (1.9, 10.0), (2.5, 0.0)],
            pitch=[(0.0, 0.0), (0.35, -4.0), (1.1, 6.0), (1.9, -3.0), (2.5, 0.0)],
            roll=[(0.0, 0.0), (0.35, -10.0), (1.1, 8.0), (1.9, 0.0), (2.5, 0.0)])


def idle(t, fl):
    """3.0 s loop: the body bobs on the water (hips 4.5 mm either side of 2 mm up, twice a loop: the hull stays clear of
    FLOOR) and rocks a little; the head snaps to
    look left, right, then a glance up and back (each snapped by a spring and held), tilting to look with one eye; one
    blink; the tail waggles after the second look; a wing settles."""
    D, I = IDLE['duration'], IDLE
    w = 2 * math.pi * t / D
    bob = I['bob'][0] * math.sin(2 * w) + I['bob'][1]
    R = common.rot(X, 0.7 * math.sin(2 * w - 0.8)) @ common.rot(Z, 0.8 * math.sin(w))
    yaw = common.jerks(t, I['yaw'], D, SNAP)
    wag = common.bump(t, 1.3, 1.9)
    blink = common.bump(t, 2.05, 2.2)
    ruffle = common.bump(t, 2.55, 2.85)
    P = common.pose({'neck': common.turn(yaw=0.35 * yaw),      # the neck takes a third of each look, the head the rest
                     'head': common.turn(pitch=common.jerks(t, I['pitch'], D, SNAP), yaw=0.65 * yaw, roll=common.jerks(t, I['roll'], D, SNAP)),
                     'tail_1': _tail(side=12 * math.sin(2 * math.pi * 5.0 * (t - 1.3)) * wag + 2 * math.sin(w - 0.5)),
                     'wing_L': _wing('L', out=4 * ruffle), 'wing_R': _wing('R', out=1.5 * ruffle)},
                    {'lid_L': {'scale': blink}, 'lid_R': {'scale': blink}})
    P['hips'] = _body(R, MID, bob)
    return fl.afloat(P)


PADDLE = dict(duration=1.0, lean=5.0)


def paddle(t, fl):
    """1.0 s loop: swimming on: the body leans a little forward about the hull's front (5 deg) and rocks with each foot's
    stroke (twice a loop, a little yaw and roll), bobbing; the tail waggles side to side with the strokes, a beat behind;
    the neck reaches forward and the head holds level."""
    D, K = PADDLE['duration'], PADDLE
    w = 2 * math.pi * t / D
    R = common.rot(Y, 2.0 * math.sin(w)) @ common.rot(X, K['lean'] + 0.8 * math.sin(2 * w)) @ common.rot(Z, 1.5 * math.sin(w))
    P = common.pose({'neck': common.turn(pitch=8.0 + 1.0 * math.sin(2 * w - 0.6), yaw=-1.5 * math.sin(w - 0.3)),
                     'head': common.turn(pitch=-K['lean'] - 8.0 - 1.5 * math.sin(2 * w - 0.9), yaw=-1.0 * math.sin(w - 0.5)),
                     'tail_1': _tail(side=12 * math.sin(w - 1.2), lift=2 + 2 * math.sin(2 * w - 1.0))})
    P['hips'] = _body(R, FRONT, 0.003 * math.sin(2 * w + 0.5))
    return fl.afloat(P)


PREEN = dict(duration=2.0, side='L', neck_yaw=38.0, head_yaw=52.0, head_pitch=15.0, head_roll=-15.0)


def preen(t, fl):
    """2.0 s once: the duck turns its head back over its left shoulder to the wing (neck and head share the turn), nibbles
    at the feathers three times with its eyes half shut while the wing lifts a little to meet it, then turns back."""
    K = PREEN
    k = common.ramp(t, 0.0, 0.35) * (1 - common.ramp(t, 1.55, 1.95))
    nib = sum(common.bump(t, a, a + 0.22) for a in (0.5, 0.78, 1.06))
    sg = 1 if K['side'] == 'L' else -1
    P = common.pose({'neck': common.turn(pitch=8 * k, yaw=sg * K['neck_yaw'] * k),
                     'head': common.turn(pitch=K['head_pitch'] * k + 6 * nib, yaw=sg * K['head_yaw'] * k, roll=sg * K['head_roll'] * k),
                     'tail_1': _tail(side=-sg * 6 * k + 5 * common.bump(t, 1.4, 1.9)),
                     'wing_L': _wing('L', out=8 * k * (sg > 0) + 2 * nib * (sg > 0)),
                     'wing_R': _wing('R', out=8 * k * (sg < 0) + 2 * nib * (sg < 0))},
                    {'lid_L': {'scale': 0.6 * nib}, 'lid_R': {'scale': 0.6 * nib}})
    P['hips'] = _body(common.rot(Z, sg * 4 * k), MID)
    return fl.afloat(P)


DABBLE = dict(duration=2.2, tip=65.0, neck=40.0, head=20.0, tail=15.0)


def dabble(t, fl):
    """2.2 s once: a tip-up: the body pitches forward about the breast (65 deg) so the tail stands up out of the water and
    the neck and head reach down under it; held a moment with the tail waggling and the body bobbing as the duck feeds,
    then it rights itself and settles with a little bob."""
    K = DABBLE
    k = common.ramp(t, 0.0, 0.55) * (1 - common.ramp(t, 1.5, 2.05))
    lag = common.ramp(t, 0.1, 0.65) * (1 - common.ramp(t, 1.55, 2.1))
    feed = common.bump(t, 0.6, 1.5)
    wag = math.sin(2 * math.pi * 3.0 * (t - 0.6)) * feed
    P = common.pose({'neck': common.turn(pitch=K['neck'] * lag),
                     'head': common.turn(pitch=K['head'] * lag + 6 * feed * math.sin(2 * math.pi * 2.0 * (t - 0.6))),
                     'tail_1': _tail(lift=K['tail'] * lag, side=15 * wag),
                     'wing_L': _wing('L', out=4 * k), 'wing_R': _wing('R', out=4 * k)})
    settle = 0.006 * common.bump(t, 1.9, 2.2)
    P['hips'] = _body(common.rot(X, K['tip'] * k + 3 * feed * math.sin(2 * math.pi * 1.5 * (t - 0.6))), FRONT, settle)
    return fl.afloat(P)


SHAKE = dict(duration=0.8, hz=5.0)


def shake(t, fl):
    """0.8 s once: a shake that ripples from the head to the tail: the head shakes side to side first (eyes shut), the body
    rolls a beat later with the wings ruffling out, the tail waggles last; each dies away."""
    F = SHAKE
    s = lambda tt, a, r: (math.sin(2 * math.pi * F['hz'] * (tt - a)) * math.exp(-2.5 * max(tt - a, 0.0))
                          * common.ramp(tt, a, a + r) * (1 - common.ramp(tt, 0.6, 0.8)) if tt > a else 0.0)
    head, body, tail = s(t, 0.0, 0.08), s(t, 0.12, 0.12), s(t, 0.24, 0.12)
    shut = common.ramp(t, 0.02, 0.08) * (1 - common.ramp(t, 0.42, 0.52))
    ruff = common.bump(t, 0.12, 0.6)
    P = common.pose({'neck': common.turn(yaw=12 * head, roll=-6 * head),
                     'head': common.turn(yaw=25 * head, roll=-14 * head),
                     'tail_1': _tail(side=20 * tail, lift=4 * ruff),
                     'wing_L': _wing('L', out=7 * ruff + 3 * body * body), 'wing_R': _wing('R', out=7 * ruff + 3 * body * body)},
                    {'lid_L': {'scale': shut}, 'lid_R': {'scale': shut}})
    P['hips'] = _body(common.rot(Z, 6 * body) @ common.rot(Y, 4 * body), MID)
    return fl.afloat(P)


def clips(arm):
    """The duck's five clips; every frame floats (_afloat, ruling R32)."""
    fl = Float(arm, next(c for c in arm.children if c.type == 'MESH'))
    fns = [('Idle', 'loop', IDLE['duration'], idle), ('Paddle', 'loop', PADDLE['duration'], paddle),
           ('Preen', 'once', PREEN['duration'], preen), ('Dabble', 'once', DABBLE['duration'], dabble),
           ('Shake', 'once', SHAKE['duration'], shake)]
    return [(name, kind, d, (lambda f: lambda t: f(t, fl))(fn)) for name, kind, d, fn in fns]


if __name__ == '__main__':
    common.run(sys.modules[__name__])
