import { CommandDispatcher } from '../../src/sim/commands';
import type { SimEvent } from '../../src/bridge/protocol';
import { describe, it, expect } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { WorldMirror } from '../../src/bridge/mirror';
import { lerp } from '../../src/core/math';
import {
  signalGroups,
  greenGroup,
  pickIntersection,
} from '../../src/world/intersections';
import { serialize, deserialize } from '../../src/save/serializer';
import { roadArms } from '../../src/render/roads/geometry';
import { IntersectionProps } from '../../src/render/roads/signals';
import { InstancedMesh, Color } from 'three';
const settings = {
  seed: 1,
  mapId: 'valley',
  cityName: 'Junction',
  mode: 'normal' as const,
};
const draft = (ax: number, az: number, bx: number, bz: number) => {
  const start = { x: ax, z: az },
    end = { x: bx, z: bz };
  return {
    start,
    end,
    c1: lerp(start, end, 1 / 3),
    c2: lerp(start, end, 2 / 3),
    elevated: false,
  };
};
function setup() {
  const initial = new Simulation(settings).snapshot();
  initial.terrain.heights.fill(60);
  initial.unlocked = [0, 1, 2];
  const sim = new Simulation(settings, undefined, initial);
  expect(sim.buildRoad('road_medium', draft(-160, 0, 160, 0)).ok).toBe(true);
  expect(sim.buildRoad('road_medium', draft(0, -160, 0, 160)).ok).toBe(true);
  return sim;
}
describe('intersection control', () => {
  it('groups opposing approaches into alternating twelve-second phases', () => {
    const s = setup().snapshot(),
      n = pickIntersection(s.nodes, { x: 0, z: 0 })!,
      g = signalGroups(n, s.segments, s.nodes);
    expect(n.control).toBe('lights');
    expect(g.map((x) => x.length)).toEqual([2, 2]);
    expect(greenGroup(g, 0)).toEqual(g[0]);
    expect(greenGroup(g, 11.999)).toEqual(g[0]);
    expect(greenGroup(g, 12)).toEqual(g[1]);
    expect(greenGroup(g, 24)).toEqual(g[0]);
    expect(signalGroups(n, [...s.segments].reverse(), s.nodes)).toEqual(g);
    expect(pickIntersection(s.nodes, { x: 80, z: 80 })).toBeUndefined();
  });
  it('preserves manual signals and left-turn restriction across road editing, mirroring and persistence', async () => {
    const s = setup().snapshot(),
      mirror = new WorldMirror();
    mirror.apply({ t: 'ready', reqId: 1, snapshot: s });
    const sim = new Simulation(settings, (e) => mirror.apply(e), s),
      n = pickIntersection(s.nodes, { x: 0, z: 0 })!;
    expect(sim.setIntersection(n.id, 'stop', true)).toEqual({
      ok: true,
      cost: 0,
    });
    expect(
      mirror.readRoadWorld()!.nodes.find((r) => r.id === n.id),
    ).toMatchObject({ control: 'stop', banLeft: true, manualControl: true });
    expect(sim.upgradeRoad(n.segments[0]!, 'road_small').ok).toBe(true);
    expect(sim.buildRoad('road_small', draft(80, 0, 80, 100)).ok).toBe(true);
    const saved = await deserialize(await serialize(sim.snapshot()));
    expect(saved.nodes.find((r) => r.id === n.id)).toMatchObject({
      control: 'stop',
      banLeft: true,
      manualControl: true,
    });
  });
  it('rejects pre-unlock changes and endpoints without mutating the city', () => {
    const s = setup().snapshot();
    s.unlocked = [0];
    const sim = new Simulation(settings, undefined, s),
      n = pickIntersection(s.nodes, { x: 0, z: 0 })!;
    const before = sim.snapshot();
    expect(sim.setIntersection(n.id, 'stop', false).reason).toBe('err.locked');
    expect(sim.snapshot()).toEqual(before);
    const unlocked = setup();
    expect(unlocked.setIntersection(-1, 'lights', false).reason).toBe(
      'err.invalidCommand',
    );
    expect(
      unlocked.setIntersection(
        s.nodes.find((n) => n.segments.length === 1)!.id,
        'lights',
        false,
      ).reason,
    ).toBe('err.invalidCommand');
  });
  it('renders four signal approaches and changes lamp colors without rebuilding meshes', () => {
    const s = setup().snapshot(),
      w = { ...s, heights: s.terrain.heights, mode: s.settings.mode },
      props = new IntersectionProps(w, roadArms(s.nodes, s.segments));
    expect(props.count).toBe(4);
    const lamps = props.group.children.find(
      (m) => m instanceof InstancedMesh,
    ) as InstancedMesh;
    const first = new Color(),
      next = new Color();
    lamps.getColorAt(0, first);
    props.update(12);
    lamps.getColorAt(0, next);
    expect(first.equals(next)).toBe(false);
    expect(lamps.count).toBe(8);
    props.dispose();
  });
});

it('dispatches junction commands through the actual Worker boundary and rejects malformed input', () => {
  const events: SimEvent[] = [],
    d = new CommandDispatcher((e) => events.push(e));
  d.handle({
    t: 'init',
    reqId: 1,
    ...settings,
    seed: 20261006,
    mode: 'sandbox',
  });
  d.handle({
    t: 'buildRoad',
    reqId: 2,
    type: 'road_medium',
    points: draft(-160, 0, 160, 0),
  });
  d.handle({
    t: 'buildRoad',
    reqId: 3,
    type: 'road_medium',
    points: draft(0, -160, 0, 160),
  });
  expect(events.at(-1)).toMatchObject({ t: 'result', ok: true });
  const nodes = events.flatMap((e) => (e.t === 'roadsChanged' ? e.nodes : [])),
    n = nodes.find((n) => n.segments.length === 4)!;
  expect(n).toBeDefined();
  d.handle({
    t: 'setIntersection',
    reqId: 4,
    node: n.id,
    control: 'stop',
    banLeft: true,
  });
  expect(events.at(-1)).toMatchObject({ t: 'result', ok: true });
  expect(events.at(-2)).toMatchObject({
    t: 'roadsChanged',
    nodes: [{ id: n.id, control: 'stop', banLeft: true }],
  });
  d.handle({
    t: 'setIntersection',
    reqId: 5,
    node: n.id,
    control: 'stop',
    banLeft: 1,
  });
  expect(events.at(-1)).toMatchObject({
    ok: false,
    reason: 'err.invalidCommand',
  });
});
