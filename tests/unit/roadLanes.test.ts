import { describe, it, expect } from 'vitest';
import { Scene, InstancedMesh } from 'three';
import {
  generateRoadLanes,
  laneOffsets,
  roadCrossSection,
} from '../../src/world/roadLanes';
import { ROADS, type RoadTypeId } from '../../src/data/roads';
import { roadTypesCity } from '../fixtures/roadTypesCity';
import { RoadRenderer } from '../../src/render/roads/roadRenderer';
import {
  roadArms,
  segmentMesh,
  junctionMesh,
} from '../../src/render/roads/geometry';
describe('road types and lane geometry', () => {
  it('derives the specified lane counts, right-hand directions and speed limits for all eight types', () => {
    for (const type of Object.keys(ROADS) as RoadTypeId[]) {
      const offsets = laneOffsets(type),
        def = ROADS[type],
        section = roadCrossSection(type);
      expect(offsets.filter((l) => l.direction === 1)).toHaveLength(
        def.lanesForward,
      );
      expect(offsets.filter((l) => l.direction === -1)).toHaveLength(
        def.lanesBackward,
      );
      for (const l of offsets) {
        expect(Math.abs(l.offset) + section.laneWidth / 2).toBeLessThanOrEqual(
          section.inner + 1e-8,
        );
        if (def.lanesBackward) expect(Math.sign(l.offset)).toBe(l.direction);
      }
    }
  });
  it('creates stable one-way directed paths, valid mixed-width junctions, zoning exclusions and batched tree instances', async () => {
    const { snapshot: w } = await roadTypesCity();
    const lanes = generateRoadLanes(w.nodes, w.segments);
    expect(new Set(lanes.map((l) => l.id)).size).toBe(lanes.length);
    for (const lane of lanes) {
      const road = w.segments.find((s) => s.id === lane.segment)!;
      expect(lane.length).toBeGreaterThan(0);
      expect(lane.speedMps).toBe(ROADS[road.type].speedKph / 3.6);
      expect(
        lane.points.every((p) => Number.isFinite(p.x + p.y + p.z + p.distance)),
      ).toBe(true);
      expect(lane.points[0]!.distance).toBe(0);
      expect(lane.points.at(-1)!.distance).toBe(lane.length);
      if (ROADS[road.type].lanesBackward === 0) {
        expect(lane.start).toBe(road.start);
        expect(lane.end).toBe(road.end);
      }
    }
    for (const s of w.segments.filter((s) => s.type.startsWith('highway')))
      expect(s.zoneBlockIds).toHaveLength(0);
    const arms = roadArms(w.nodes, w.segments);
    for (const n of w.nodes) {
      const mesh = junctionMesh(n, arms.get(n.id)!);
      expect(mesh.positions.every(Number.isFinite)).toBe(true);
      expect(mesh.positions.length).toBeGreaterThan(0);
    }
    for (const s of w.segments) {
      const a = arms.get(s.start)!.find((a) => a.segment.id === s.id)!,
        b = arms.get(s.end)!.find((a) => a.segment.id === s.id)!;
      expect(
        segmentMesh(a, b, true, true).positions.every(Number.isFinite),
      ).toBe(true);
    }
    const r = new RoadRenderer(),
      scene = new Scene();
    scene.add(r.group);
    r.sync({ ...w, heights: w.terrain.heights, mode: w.settings.mode });
    while (r.readStats().pending) r.update();
    expect(r.readStats().trees).toBeGreaterThan(20);
    expect(
      r.group.children.filter((c) => c instanceof InstancedMesh),
    ).toHaveLength(1);
    const tree = r.group.children.find(
      (c) => c instanceof InstancedMesh,
    ) as InstancedMesh;
    expect(tree.geometry.getAttribute('color').count).toBe(
      tree.geometry.getAttribute('position').count,
    );
    r.dispose();
    expect(r.group.children).toHaveLength(0);
  });
});
