import { expect, it } from 'vitest';
import { Scene, Color } from 'three';
import {
  roadTrafficBand,
  summarizeRoadTraffic,
  savedRoadTraffic,
} from '../../src/world/roadTraffic';
import { TrafficOverlay, trafficColor } from '../../src/render/trafficOverlay';
import { trafficCity } from '../fixtures/trafficCity';
import { deserialize } from '../../src/save/serializer';
import { Simulation } from '../../src/sim/simulation';
import { createState } from '../../src/sim/state';
import { RoadGraph } from '../../src/world/roadGraph';
import type { SimEvent } from '../../src/bridge/protocol';
it('uses actual mean motor speed against road speed limit, excludes pedestrians and classifies exact thresholds', () => {
  const g = new RoadGraph();
  g.addRoad({
    start: { x: 0, z: 0 },
    end: { x: 100, z: 0 },
    type: 'road_small',
    builtDay: 0,
    startHeight: 60,
    endHeight: 60,
  });
  const s = g.snapshot().segments,
    id = s[0]!.id;
  const q = summarizeRoadTraffic(s, [
    { segment: id, kind: 0, speed: 0 },
    { segment: id, kind: 1, speed: 4 },
    { segment: id, kind: 8, speed: 100 },
    { segment: 0, kind: 0, speed: 100 },
  ])[0]!;
  expect(q).toEqual({ id, count: 2, speedKmh: 7.2, ratio: 0.18 });
  expect(summarizeRoadTraffic(s, [])[0]).toMatchObject({ count: 0, ratio: 1 });
  expect([0, 0.399, 0.4, 0.7, 0.701, 1].map(roadTrafficBand)).toEqual([
    'blocked',
    'blocked',
    'slow',
    'slow',
    'good',
    'good',
  ]);
});
it('restores measured queues while paused, refreshes Worker road inspection and sends bounded samples', async () => {
  const f = await trafficCity(50),
    snapshot = await deserialize(new Uint8Array(f.data).buffer);
  const events: SimEvent[] = [],
    sim = new Simulation(f.settings, (e) => events.push(e), snapshot);
  const flows = savedRoadTraffic(snapshot.segments, snapshot.traffic),
    queued = flows.find((v) => v.count > 0)!;
  expect(queued.ratio).toBe(0);
  expect(queued.count).toBeGreaterThan(0);
  expect(sim.inspect('segment', queued.id)).toMatchObject({
    value: { traffic: queued },
  });
  sim.setSpeed(1);
  for (let i = 0; i < 10; i++) sim.tick();
  expect(events.filter((e) => e.t === 'roadTraffic').length).toBeGreaterThan(0);
  const event = events.filter((e) => e.t === 'roadTraffic').at(-1)!;
  expect(event.roads).toEqual([...sim.traffic.roadFlow.values()]);
  expect(event.roads.every((v) => v.ratio >= 0 && v.ratio <= 1)).toBe(true);
});
it('colors road decks including bridges, updates only colors, removes demolished roads and disposes', () => {
  const state = createState({
      seed: 1,
      mapId: 'valley',
      mode: 'sandbox',
      cityName: 'test',
    }),
    g = new RoadGraph();
  g.addRoad({
    start: { x: 0, z: 0 },
    end: { x: 100, z: 0 },
    type: 'road_small',
    builtDay: 0,
    startHeight: 72,
    endHeight: 80,
    elevated: true,
  });
  Object.assign(state, g.snapshot());
  const scene = new Scene(),
    o = new TrafficOverlay(scene),
    id = state.segments[0]!.id;
  o.accept({ t: 'ready', reqId: 0, snapshot: state });
  o.set(true);
  o.update();
  const geometry = o.mesh.geometry;
  expect(geometry.getAttribute('position').getY(0)).toBeGreaterThan(72);
  o.accept({
    t: 'roadTraffic',
    roads: [{ id, count: 10, ratio: 0.1, speedKmh: 4 }],
  });
  o.update();
  expect(o.mesh.geometry).toBe(geometry);
  const c = new Color(trafficColor(0.1)),
    attr = geometry.getAttribute('color');
  expect(attr.getX(0)).toBeCloseTo(c.r);
  expect(attr.getY(0)).toBeCloseTo(c.g);
  o.accept({
    t: 'roadsChanged',
    added: [],
    removed: [id],
    nodes: [],
    removedNodes: [],
  });
  o.update();
  expect(o.mesh.geometry.getAttribute('position').count).toBe(0);
  o.set(false);
  expect(o.mesh.visible).toBe(false);
  o.dispose();
  expect(scene.children).toHaveLength(0);
});
