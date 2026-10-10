import { previewRoadPipes } from '../../src/world/waterUtility';
import { CommandDispatcher } from '../../src/sim/commands';
import type { SimEvent } from '../../src/bridge/protocol';
import { describe, it, expect } from 'vitest';
import { createState } from '../../src/sim/state';
import { MAP_PRESETS } from '../../src/data/terrain';
import { MAP_SIZE, TILE_SIZE } from '../../src/data/config';
import { weeklyAccounts } from '../../src/sim/systems/economy';
import { serialize, deserialize } from '../../src/save/serializer';
import { Simulation } from '../../src/sim/simulation';
describe('prefabricated regional access', () => {
  for (const map of MAP_PRESETS)
    it(`provides deterministic usable ramps and two entrances on ${map.id}`, async () => {
      const settings = {
        seed: map.seed,
        mapId: map.id,
        mode: 'normal' as const,
        cityName: 'Starter',
        starterRoads: true,
      };
      const s = createState(settings);
      expect(s.money).toBe(70000);
      expect(
        s.nodes.filter((n) => Math.abs(n.pos.z) === MAP_SIZE / 2),
      ).toHaveLength(4);
      const ramps = s.segments.filter((r) => r.type === 'highway_ramp');
      expect(ramps.length).toBeGreaterThanOrEqual(2);
      expect(s.zoneBlocks).toHaveLength(0);
      const ids = [...s.nodes, ...s.segments].map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(s.nextId).toBeGreaterThan(Math.max(...ids));
      expect(s.segments.filter((r) => r.regional)).toHaveLength(4);
      expect(weeklyAccounts(s).upkeep.roads).toBeLessThan(200);
      for (const n of s.nodes.filter((n) => Math.abs(n.pos.z) < TILE_SIZE / 2))
        expect(
          Math.abs(n.height - s.terrain.heightAt(n.pos.x, n.pos.z)),
        ).toBeLessThan(0.5);
      const pipes = previewRoadPipes({
        ...s,
        heights: s.terrain.heights,
        mode: s.settings.mode,
        networks: [],
      });
      expect(pipes.valid, pipes.reason ?? undefined).toBe(true);
      const events: SimEvent[] = [];
      new CommandDispatcher((e) => events.push(e)).handle({
        t: 'init',
        reqId: 1,
        ...settings,
      });
      const ready = events.find((e) => e.t === 'ready');
      expect(ready?.t === 'ready' && ready.snapshot.segments.length).toBe(
        s.segments.length,
      );
      const sim = new Simulation(settings);
      const snapshot = sim.snapshot();
      expect(await deserialize(await serialize(snapshot))).toEqual(snapshot);
      const empty = createState({ ...settings, starterRoads: false });
      expect(empty.segments).toHaveLength(0);
    });
});
