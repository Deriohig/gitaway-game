"""cat_sleeping.py -- the sleeping cat's rig: public/models/cat_sleeping.glb -> cat_sleeping_rig.glb (common.py does the work;
README.md has the workflow).
    art/blender/rigs/build.sh cat_sleeping

The cat lies curled up asleep, its eyes painted shut, and it stays a sleeper: no lids, no stride, and no clip leaves the curl.
It faces +X, so its left is -Z. The curl is a ring seen from above: the head on the +X/+Z side, the back round the -X side,
the rump on -Z, and the tail lying on the ground in front of the body (+X side) from the rump to the front paws.

Landmarks are glTF coordinates on the source, measured with orthographic renders, vertex queries, mesh shells and geodesic
walks from the tail tip:
  - the source's Head node (main shell, plus a patch of the left shoulder as its own shell and whisker shells) is joined to
    the body along a cut ring on the plane y 0.065 (the head rests on the forearms) and x 0 (the back of the head);
  - the head joint is the Head node's pivot (0, 0.16, 0.13), the back-top of the head, about which a chin-up tilt turns,
    moved 5 mm forward: the pivot lies exactly on the box centre's x, where AR3's facing test wants the head joint in front;
  - the ear tips are the head's highest vertices on each side, the ear bases the middle of each ear's base ring;
  - the spine runs on an arc of radius 0.14 round the curl's centre (0, -0.03) in the top view (rump 255 deg, mid-back
    187.5 deg, neck base 120 deg), at mid-body height;
  - the tail is the tube within 0.36 u (geodesic) of its tip vertex; its centre line comes from slices of that tube, cut in
    thirds of its 0.36 u length.

Weights: bone heat, then
  - the head: the Head node's main shell (in_part near an ear), blended over 10 cm into the head and 8 cm out of it from the
    cut ring, keeping the body's own bones outside (keep), so the chin can lift off the forearms without a crease;
  - the whiskers (eight loose shells): skin() hands each, whole, its root's final weights, so it stays on its patch of
    muzzle (ruling R23);
  - the ears and the tail: in_reach from their tips (each joins the head or body only at its root), blended at the root;
  - taper: the head keeps no weight outside its shell (bone heat reaches the forelegs through the head's open underside) and
    the neck none on the forelegs, which belong to the chest.
AR4 (stretch <= 1.6x) is the limit, measured joint by joint: the head lifts 15 deg (1.39x) or turns 20 deg (1.33x), but the
two add up at the chin's weld to the forearms (Peek's 15 deg lift with a 10 deg turn peaks at 1.51x); the neck 10 deg
(1.35x); an ear 25 deg (1.25-1.40x); a tail bone 25 deg (1.22x).

Clips: Sleep (loop), EarTwitch, TailFlick and Peek (once). The spine and neck stay within 15 deg, the head lift within 25.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
from mathutils import Vector  # noqa: E402

ID, FACING = 'cat_sleeping', '+X'
HEAD_JOINT = (0.005, 0.16, 0.13)              # the Head node's pivot, 5 mm forward (see above)
MUZZLE = (0.14, 0.09, 0.135)                  # inside the muzzle, behind the nose
EARS = {'L': ((0.042, 0.19, 0.033), (0.0257, 0.2265, 0.0154)), 'R': ((0.085, 0.182, 0.228), (0.0762, 0.2124, 0.2541))}
HIPS, BACK, NECK_BASE = (-0.036, 0.10, -0.165), (-0.139, 0.11, -0.048), (-0.07, 0.12, 0.091)
TAIL = [(0.05, 0.05, -0.193), (0.155, 0.033, -0.145), (0.183, 0.035, -0.03), (0.198, 0.03, 0.09)]   # root .. tip
TAIL_TIP = (0.2056, 0.0287, 0.0945)           # the tip vertex
ANCHOR = (0.18, 0.0, 0.13)                    # breathing's still point: the ground under the front paws


def _bone(name, head, tail, parent):
    return dict(name=name, head=head, tail=tail, parent=parent)


BONES = [_bone('root', (0, 0, 0), (0, 0.06, 0), None),
         _bone('spine', HIPS, BACK, 'root'),
         _bone('chest', BACK, NECK_BASE, 'spine'),
         _bone('neck', NECK_BASE, HEAD_JOINT, 'chest'),
         _bone('head', HEAD_JOINT, MUZZLE, 'neck'),
         _bone('ear_L', *EARS['L'], 'head'), _bone('ear_R', *EARS['R'], 'head'),
         _bone('tail_1', TAIL[0], TAIL[1], 'spine'), _bone('tail_2', TAIL[1], TAIL[2], 'tail_1'),
         _bone('tail_3', TAIL[2], TAIL[3], 'tail_2')]
LIVE = ['head', 'neck', 'ear_L', 'ear_R', 'tail_1', 'tail_2', 'tail_3']
# ruling R31: the game's live-look clamp (rigs.json look), measured on the built rig as rigs.test's lookPose applies it at rest:
# the largest whole 5 deg of yaw (pitch 0), then of pitch, whose ellipse keeps AR4 <= 1.6 on these bones. A sleeping cat looks
# only when it wakes (the game's tap: Peek); the head alone holds more than with the neck (yaw 25)
LOOK = dict(yaw=30, pitch=15, bones=['head'])     # yaw 35: 1.61x; pitch 20: 1.64x

HEAD_BAND = (0.10, 0.08)          # inset, outset of the head's blend from its cut ring
EAR_REACH = (0.040, 0.012, 0.010)  # length, inset, outset from each ear tip
TAIL_REACH = (0.36, 0.04, 0.03)   # from the tail tip
FORELEG = (-0.02, 0.03, 0.085, 0.06)   # the neck fades out over x -0.02..0.03 and y 0.085..0.06 (forelegs: x up, y down)
_HEAD = []                        # [predicate: on the head shell], set by region() for TAPER


def _smooth(a, b, x):
    u = min(max((x - a) / (b - a), 0.0), 1.0)
    return u * u * (3 - 2 * u)


def region(mesh):
    """The head shell banded from its cut ring; each ear and the tail by reach from its tip. The whiskers are loose shells,
    which skin() hands their root's weights (ruling R23)."""
    _HEAD[:] = [common.in_part(mesh, 'Head', near=EARS['L'][1])]
    return {'head': common.in_part(mesh, 'Head', *HEAD_BAND, keep=True, near=EARS['L'][1]),
            'ear_L': common.in_reach(mesh, EARS['L'][1], *EAR_REACH), 'ear_R': common.in_reach(mesh, EARS['R'][1], *EAR_REACH),
            'tail_1': common.in_reach(mesh, TAIL_TIP, *TAIL_REACH)}


TAPER = {'head': lambda p: 1.0 if _HEAD[0](p) else 0.0,
         'neck': lambda p: 1.0 - _smooth(FORELEG[0], FORELEG[1], p[0]) * _smooth(FORELEG[2], FORELEG[3], p[1])}


def _pulse(t, a, b, c):
    """0 until a, eased up to 1 at b, eased back to 0 at c."""
    return common.ease((t - a) / (b - a)) * common.ease((c - t) / (c - b))


def _scaled(k, R):
    return {b: {'rot': tuple(k * a for a in r)} for b, r in R.items()}


def breathe(arm, s):
    """Pose entries that swell the chest by s about ANCHOR, so the front paws stay put; the neck and head keep their place."""
    b = arm.data.bones['chest']
    loc = (1 - s) * (Vector(ANCHOR) - Vector(common.b2g(b.head_local)))
    P = common.inflate(arm, 'chest', s)
    P['chest']['loc'] = tuple(loc)
    for c in b.children:        # the child's offset already undoes the chest's scaling; it also undoes the chest's move
        P[c.name]['loc'] = tuple(Vector(P[c.name]['loc']) - loc / s)
    return P


SLEEP = dict(duration=4.0, breath=0.04)


def sleep(t, arm):
    """4 s loop: one slow breath, the chest swelling and settling by +-4 % (the old breathing's 1 +- 0.04)."""
    return breathe(arm, 1 + SLEEP['breath'] * math.sin(2 * math.pi * t / SLEEP['duration']))


EAR_TWITCH = dict(duration=0.6, ear=(19, -11, 7), flinch=(-6, 3, 2))   # ear: out, swivelled and tipped back (23.6 deg)


def ear_twitch(t):
    """0.6 s once: the right ear (nearer the game camera) flicks out and back twice, the second time half as far, and the
    head flinches 7 deg away from it with the first flick: the ear alone is a few pixels at game size (it changed 4 pixels
    of the 96 px game-camera GIF; with the flinch about 50, and about 175 seen from the front, as the porch shows the cat)."""
    return {**_scaled(_pulse(t, 0.0, 0.067, 0.25) + 0.55 * _pulse(t, 0.3, 0.367, 0.52), {'ear_R': EAR_TWITCH['ear']}),
            **_scaled(_pulse(t, 0.0, 0.1, 0.4), {'head': EAR_TWITCH['flinch']})}


TAIL_FLICK = dict(duration=1.0, tail={'tail_1': (-2, 2, 0), 'tail_2': (-8, 6, 0), 'tail_3': (-20, 16, 0)})


def tail_flick(t):
    """1 s once: the tail's end curls up and out, away from the paws and the face (0.3 s), settles (0.75 s) with a last
    small flick."""
    return _scaled(_pulse(t, 0.0, 0.3, 0.75) + 0.25 * _pulse(t, 0.7, 0.82, 1.0), TAIL_FLICK['tail'])


PEEK = dict(duration=3.0, head=(-3, -10, 12), neck=(0, 0, 3), ears=(0, 0, -6))


def peek(t):
    """3 s once: the head lifts chin up (12 deg, the neck 3 more; 0.7 s), turns toward the camera side (10 deg to its right,
    tilting 3 deg; 0.5-1.1 s), looks, turns back (by 2.3 s) and lays the chin back down on the paws (by 3 s), the ears
    pricked forward while it is up."""
    up = common.ease(t / 0.7) * common.ease((PEEK['duration'] - t) / 0.8)
    look = common.ease((t - 0.5) / 0.6) * common.ease((2.3 - t) / 0.7)
    h = PEEK['head']
    return {'head': {'rot': (h[0] * look, h[1] * look, h[2] * up)}, **_scaled(up, {'neck': PEEK['neck']}),
            **_scaled(up, {'ear_L': PEEK['ears'], 'ear_R': PEEK['ears']})}


def clips(arm):
    return [('Sleep', 'loop', SLEEP['duration'], lambda t: sleep(t, arm)),
            ('EarTwitch', 'once', EAR_TWITCH['duration'], ear_twitch),
            ('TailFlick', 'once', TAIL_FLICK['duration'], tail_flick),
            ('Peek', 'once', PEEK['duration'], peek)]


if __name__ == '__main__':
    common.run(sys.modules[__name__])
