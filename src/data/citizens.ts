// M2 migration and employment / education rules, GDD §7.2.
export const CITIZEN_RULES = {
  incomingAges: [6, 15, 32, 68],
  incomingAgeWeights: [20, 10, 55, 15],
  incomingEducationWeights: [40, 40, 15, 5],
  workingAge: [19, 64],
  initialHealth: 100,
  initialHappiness: 50,
  industrialShiftCount: 3,
  schoolMinAge: [6, 13, 19],
  schoolMaxAge: [12, 18, 24],
  schoolDaysToGraduate: [30, 30, 30],
  // Actual public-sector vacancies, per building; no staffing multiplier on capacity yet.
  publicJobs: {
    utility: [6, 4, 2, 0],
    police: [0, 8, 8, 0],
    fire: [4, 8, 4, 0],
    health: [0, 4, 8, 8],
    education: [0, 2, 4, 12],
    parks: [4, 2, 0, 0],
    deathcare: [4, 4, 2, 0],
    garbage: [8, 4, 0, 0],
    transit: [4, 8, 2, 0],
  },
} as const;
