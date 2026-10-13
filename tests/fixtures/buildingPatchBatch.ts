import type { BuildingPatch } from '../../src/world/snapshot';

/** Authored daily-style population, utility, service and reconciliation updates. */
export function buildingPatchBatch(count = 2128): BuildingPatch[] {
  const phases: BuildingPatch[][] = Array.from({ length: 8 }, () => []);
  for (let i = 0; i < count; i++) {
    const id = 10000 + i;
    phases[0]!.push({
      id,
      households: 20,
      residents: 100,
      jobs: i % 8,
      workers: i % 4,
      jobEducation: [1, 2, 3, 4],
      workerEducation: [0, 1, 2, 3],
      bodies: { pending: i % 3 },
    });
    phases[1]!.push({
      id,
      happiness: 40 + (i % 60),
      landValue: i % 100,
      parkBonus: i % 12,
    });
    phases[2]!.push({
      id,
      coverage: { police: 0.5, fire: 0.25, health: 0.75 },
      serviceStatus: {
        capacity: 300,
        radius: 600,
        demand: i,
        efficiency: 0.5,
        connected: true,
      },
    });
    phases[3]!.push({
      id,
      environment: { pollution: i % 10, noise: i % 20, waterPollution: 0 },
      health: { average: 80, residents: 100, sick: 3 },
      drinkingWaterPollution: 0,
    });
    phases[4]!.push({
      id,
      flags: i % 8,
      sewageDischarge: 2,
      crime: 4,
      crimeUpdatedDay: 10,
    });
    phases[5]!.push({
      id,
      state: 'active',
      stateTimer: 0,
      roadDisconnectedDay: undefined,
      enabled: true,
    });
    phases[6]!.push({
      id,
      education: { eligible: 20, enrolled: 18 },
      garbage: { stock: 3, lastDay: 10, generated: 2 },
      development: { lastDay: 10, lastCheckDay: 9 },
    });
    phases[7]!.push({
      id,
      happiness: 45 + (i % 50),
      residents: 99,
      coverage: { police: 0.75, fire: 0.5, health: 1 },
      bodies: undefined,
    });
  }
  return phases.flat();
}
