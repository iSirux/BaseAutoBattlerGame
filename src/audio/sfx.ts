// Procedural sound effects using zzfx
// Sound parameters designed in https://killedbyapixel.github.io/ZzFX/
//
// zzfx signature: zzfx(volume, randomness, frequency, attack, sustain, release,
//   shape, shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime,
//   noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter)

import { zzfx } from 'zzfx';

export const SFX = {
  /** UI click / selection */
  click: () => zzfx(...[, , 1e3, , .03, .02, 1, 2, , , , , , , , , , .5]),

  /** Place a building */
  build: () => zzfx(...[, , 200, .05, .1, .15, 1, 1.5, , , , , , , , , , .6]),

  /** Unit trained */
  train: () => zzfx(...[, , 400, .02, .08, .1, 1, 1, , , 50, .05, , , , , , .5]),

  /** Melee hit */
  hit: () => zzfx(...[, , 150, , .03, .02, 4, 2, , , , , , 3, , , , .5]),

  /** Ranged shot */
  shoot: () => zzfx(...[, , 800, , .02, .01, 1, 2, -20, , , , , , , , , .3]),

  /** Unit death */
  death: () => zzfx(...[, , 100, .03, .08, .15, 4, 1, , , , , , 5, , , , .4]),

  /** Battle won */
  victory: () => zzfx(...[, , 500, .05, .2, .3, 1, 1, , , 100, .1, .05, , , , , .6]),

  /** Battle lost */
  defeat: () => zzfx(...[, , 200, .1, .3, .4, 3, 1, -5, , , , , 3, , , , .4]),

  /** Card reward reveal */
  cardReveal: () => zzfx(...[, , 600, .02, .05, .1, 1, 2, , , 200, .08, , , , , , .5]),

  /** Collect resource */
  collect: () => zzfx(...[, , 300, , .05, .08, 1, 1.5, 10, , , , , , , , , .4]),
} as const;
