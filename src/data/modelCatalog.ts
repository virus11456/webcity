/** ART §7.3. Original catalog recipes; lots not listed retain the procedural fallback. */
export const MODEL_CATALOG = {
  RL: {
    levels: 5,
    lots: [
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
    ],
    variants: 3,
  },
  RH: {
    levels: 5,
    lots: [
      [2, 2],
      [3, 3],
      [4, 4],
    ],
    variants: 2,
  },
  CL: {
    levels: 3,
    lots: [
      [1, 1],
      [1, 2],
      [2, 2],
      [2, 3],
    ],
    variants: 3,
  },
  CH: {
    levels: 3,
    lots: [
      [2, 2],
      [3, 3],
      [4, 4],
    ],
    variants: 2,
  },
  I: {
    levels: 3,
    lots: [
      [2, 2],
      [3, 3],
      [4, 4],
    ],
    variants: 3,
  },
  O: {
    levels: 3,
    lots: [
      [2, 2],
      [3, 3],
      [4, 4],
    ],
    variants: 2,
  },
} as const;
