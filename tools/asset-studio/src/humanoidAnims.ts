// Keyframed humanoid animations. Frame counts / timings follow the art spec;
// events (impact, cast, footstep) are emitted as metadata for the engine.
import { POSE0, type Pose } from './humanoid';

export interface AnimDef {
  name: string;
  frames: number;
  frameMs: number;
  loop: boolean;
  events: { frame: number; event: 'footstep' | 'impact' | 'cast' | 'release' | 'land' }[];
  pose: (f: number) => Pose;
}

const P = (o: Partial<Pose>): Pose => ({ ...POSE0, ...o, footN: { ...POSE0.footN, ...o.footN }, footF: { ...POSE0.footF, ...o.footF }, handN: { ...POSE0.handN, ...o.handN }, handF: { ...POSE0.handF, ...o.handF } });

export const HUMANOID_ANIMS: AnimDef[] = [
  {
    name: 'idle', frames: 5, frameMs: 160, loop: true, events: [],
    pose: (f) => {
      // Breathing + small arm drift + a blink on the last frame: every frame distinct.
      const bob = [0, 1, 1, 0, 0][f], arm = [0, 0, 1, 2, 1][f];
      return P({ bob, handN: { fwd: arm, up: 0 }, handF: { fwd: arm, up: 0 }, eyes: f === 4 ? 'closed' : 'open', weaponAng: Math.PI * 0.35 + arm * 0.1 });
    },
  },
  {
    name: 'walk', frames: 8, frameMs: 90, loop: true, events: [{ frame: 0, event: 'footstep' }, { frame: 4, event: 'footstep' }],
    pose: (f) => {
      const t = (f / 8) * Math.PI * 2;
      const s = Math.cos(t);              // +1: near foot forward
      const lift = Math.sin(t);           // >0: far foot passing, <0: near foot passing
      return P({
        bob: Math.abs(lift) > 0.6 ? -1 : 0,
        footN: { stride: Math.round(s * 5), lift: lift < -0.3 ? Math.round(-lift * 3) : 0 },
        footF: { stride: Math.round(-s * 5), lift: lift > 0.3 ? Math.round(lift * 3) : 0 },
        handN: { fwd: Math.round(-s * 3), up: Math.abs(s) > 0.6 ? 1 : 0 },
        handF: { fwd: Math.round(s * 3), up: Math.abs(s) > 0.6 ? 1 : 0 },
        weaponAng: Math.PI * 0.35 - s * 0.2,
      });
    },
  },
  {
    name: 'attack', frames: 6, frameMs: 75, loop: false, events: [{ frame: 2, event: 'impact' }],
    pose: (f) => [
      // anticipation: lean back, pull the blade back
      P({ lean: -1, handN: { fwd: -3, up: 5 }, weaponAng: -2.4, footN: { stride: 1, lift: 0 }, footF: { stride: -2, lift: 0 } }),
      // wind-up apex
      P({ lean: -2, bob: -1, handN: { fwd: -2, up: 9 }, weaponAng: -1.9, footN: { stride: 2, lift: 1 }, footF: { stride: -2, lift: 0 } }),
      // strike (impact)
      P({ lean: 2, handN: { fwd: 9, up: 4 }, weaponAng: 0.2, footN: { stride: 4, lift: 0 }, footF: { stride: -3, lift: 0 }, handF: { fwd: -3, up: 1 } }),
      // follow-through
      P({ lean: 2, bob: 1, handN: { fwd: 8, up: 0 }, weaponAng: 0.9, footN: { stride: 4, lift: 0 }, footF: { stride: -3, lift: 0 }, handF: { fwd: -3, up: 0 } }),
      // recover
      P({ lean: 1, handN: { fwd: 4, up: 1 }, weaponAng: 0.8, footN: { stride: 2, lift: 0 }, footF: { stride: -1, lift: 0 } }),
      P({ lean: 0, handN: { fwd: 1, up: 0 }, weaponAng: 0.6 }),
    ][f],
  },
  {
    name: 'cast', frames: 6, frameMs: 100, loop: false, events: [{ frame: 4, event: 'cast' }],
    pose: (f) => [
      P({ handN: { fwd: 2, up: 2 }, handF: { fwd: 2, up: 2 }, weaponAng: 0.2 }),
      P({ bob: -1, handN: { fwd: 4, up: 4 }, handF: { fwd: 4, up: 4 }, weaponAng: -0.2 }),
      P({ bob: -1, handN: { fwd: 5, up: 5 }, handF: { fwd: 5, up: 5 }, weaponAng: -0.4, eyes: 'closed' }),
      P({ bob: 0, handN: { fwd: 5, up: 5 }, handF: { fwd: 5, up: 5 }, weaponAng: -0.4, eyes: 'closed' }),
      P({ lean: 1, handN: { fwd: 8, up: 4 }, handF: { fwd: 8, up: 4 }, weaponAng: 0 }),
      P({ lean: 0, handN: { fwd: 3, up: 1 }, handF: { fwd: 3, up: 1 }, weaponAng: 0.3 }),
    ][f],
  },
  {
    name: 'hit', frames: 3, frameMs: 90, loop: false, events: [],
    pose: (f) => [
      P({ lean: -2, eyes: 'hurt', handN: { fwd: -2, up: 3 }, handF: { fwd: -2, up: 3 }, footN: { stride: -1, lift: 0 } }),
      P({ lean: -3, bob: 1, eyes: 'hurt', handN: { fwd: -3, up: 4 }, handF: { fwd: -3, up: 4 }, footN: { stride: -2, lift: 0 }, headDy: 1 }),
      P({ lean: -1, eyes: 'open', handN: { fwd: -1, up: 1 }, handF: { fwd: -1, up: 1 } }),
    ][f],
  },
  {
    name: 'death', frames: 8, frameMs: 110, loop: false, events: [{ frame: 6, event: 'land' }],
    pose: (f) => [
      P({ lean: -2, eyes: 'hurt', handN: { fwd: -2, up: 3 }, handF: { fwd: -2, up: 3 } }),
      P({ lean: -1, crouch: 2, eyes: 'hurt', handN: { fwd: 0, up: 1 }, handF: { fwd: 0, up: 1 } }),
      P({ lean: 1, crouch: 5, headDy: 1, eyes: 'closed', handN: { fwd: 1, up: -1 }, handF: { fwd: 1, up: -1 }, weaponShow: true, weaponAng: 1.3 }),
      P({ lean: 2, crouch: 7, headDy: 2, eyes: 'closed', handN: { fwd: 2, up: -2 }, handF: { fwd: 1, up: -2 }, weaponShow: false }),
      P({ lean: 2, crouch: 7, headDy: 2, eyes: 'closed', shear: 0.3, weaponShow: false }),
      P({ eyes: 'closed', lying: true, crouch: 5, weaponShow: false, bob: 2 }),
      P({ eyes: 'closed', lying: true, crouch: 5, weaponShow: false, bob: 1 }),
      P({ eyes: 'closed', lying: true, crouch: 5, weaponShow: false, bob: 0 }),
    ][f],
  },
];
