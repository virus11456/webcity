/** ART §4. Distances in metres; blur radius in CSS pixels. */
export const POSTFX = {
  tiltStartM: 60,
  tiltFullM: 150,
  tiltFadeM: 600,
  tiltEndM: 1200,
  tiltRadiusPx: 2.5,
  focusY: 0.45,
  focusHalfBand: 0.2,
  aoRadiusM: 4,
  aoStrength: 0.6,
  aoBias: 0.1,
  bloomThreshold: 0.9,
  bloomStrength: 0.6,
  bloomRadius: 0.2,
  // Weight the wide mip halos down so dense window grids retain facade contrast.
  bloomMipWeights: [0.5, 0.25, 0.12, 0.06, 0.03],
} as const;
