import { BuildingRenderer } from './render/buildings/buildingRenderer';
import { BulldozeTool } from './tools/bulldozeTool';
import { BulldozePreview } from './render/bulldozePreview';
import { createBulldozeControls } from './ui/bulldozeControls';
import { ZoneTool } from './tools/zoneTool';
import { ZoneRenderer } from './render/zones';
import { createZoneControls } from './ui/zoneControls';
import { ZONE_CODES } from './data/zones';
import { RoadTool } from './tools/roadTool';
import { ToolManager } from './tools/toolManager';
import { RoadPreviewRenderer } from './render/preview';
import { createRoadControls } from './ui/roadControls';
import { TerrainPicker } from './input/picking';
import { ROAD_TOOL_RENDER } from './data/roadTool';
import { PickingPreview } from './input/pickingPreview';
import { createPickingDebug } from './ui/pickingDebug';
import type { TerrainPick } from './world/picking';
import { CITY_PREVIEW, MAP_PRESETS, type CityView } from './data/terrain';
import { SimClient } from './bridge/simClient';
import { createSimControls } from './ui/simControls';
import { CameraController } from './input/cameraController';
import type { RtsCamera } from './render/camera';
import { h, render } from 'preact';
import { CityRenderer } from './render/renderer';
import { createDebugPanel } from './ui/debug';
import { t } from './ui/i18n/t';
import { App } from './ui/App';

declare global {
  interface Window {
    __webcityBuildingStats?: () => ReturnType<BuildingRenderer['readStats']>;
    __webcityCamera?: RtsCamera;
    __webcityZoneStats?: () => {
      blocks: number;
      valid: number;
      invalid: number;
      painted: number;
      codes: Record<number, number>;
      instances: number;
      pending: boolean;
    };
    __webcityRoadStats?: () => {
      batches: number;
      pending: boolean;
      generation: number;
    };
    __webcityPick?: (x: number, y: number) => TerrainPick | null;
  }
}

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) throw new Error('Missing #app element');

let bulldozeTool: BulldozeTool | undefined;
let bulldozePreview: BulldozePreview | undefined;
let bulldozeControls: ReturnType<typeof createBulldozeControls> | undefined;
let zoneTool: ZoneTool | undefined;
let zoneRenderer: ZoneRenderer | undefined;
let zoneControls: ReturnType<typeof createZoneControls> | undefined;
let roadTool: RoadTool | undefined;
let roadControls: ReturnType<typeof createRoadControls> | undefined;
let roadPreview: RoadPreviewRenderer | undefined;
let tools: ToolManager | undefined;
let input: CameraController | undefined;
let city: CityRenderer | undefined;
let buildings: BuildingRenderer | undefined;
let frameSeconds = 0;
let unsubscribeBuildings: (() => void) | undefined;
let picking: PickingPreview | undefined;
let pickingDebug: ReturnType<typeof createPickingDebug> | undefined;
render(
  h(App, {
    onViewChange: (view: CityView) => {
      const target = CITY_PREVIEW.views[view];
      city?.cameraController.flyTo(target, target.distance);
    },
    onEdgeScrollChange: (enabled: boolean) => input?.setEdgeScrolling(enabled),
  }),
  root,
);

const canvas = root.querySelector<HTMLCanvasElement>('canvas');
const status = root.querySelector<HTMLParagraphElement>('.render-status');
const debug =
  new URLSearchParams(location.search).get('debug') === '1'
    ? createDebugPanel(root)
    : undefined;
let sim: SimClient | undefined;
let simControls: ReturnType<typeof createSimControls> | undefined;
try {
  sim = new SimClient(
    new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' }),
  );
  simControls = createSimControls(root, sim);
  void sim
    .send({
      t: 'init',
      seed: MAP_PRESETS[0].seed,
      mapId: MAP_PRESETS[0].id,
      mode: 'normal',
      cityName: t('city.name'),
    })
    .then((response) => {
      if (response.t !== 'ready') simControls?.showError();
    })
    .catch(() => simControls?.showError());
} catch {
  if (status) {
    status.hidden = false;
    status.textContent = t('sim.failed');
  }
}
if (canvas && status) {
  try {
    city = new CityRenderer(canvas, {
      onStats: debug?.update,
      onBeforeFrame: (seconds) => {
        frameSeconds = seconds;
        input?.update(seconds);
        roadPreview?.roads.update();
        zoneRenderer?.update();
      },
      onAfterCamera: () => {
        picking?.update();
        buildings?.update(frameSeconds, city?.camera);
      },
      onContextState(lost) {
        status.hidden = !lost;
        status.textContent = lost ? t('render.contextLost') : '';
      },
    });
    if (debug) {
      pickingDebug = createPickingDebug(root);
      picking = new PickingPreview(
        canvas,
        city.camera,
        city.terrain,
        city.scene,
        pickingDebug.update,
      );
      window.__webcityPick = (x, y) =>
        picking!.picker.pick(
          x,
          y,
          canvas.getBoundingClientRect(),
          city!.camera,
          city!.camera.far,
        );
    }
    input = new CameraController(canvas, city.cameraController, {
      onTap: (p) => picking?.tap(p.x, p.y),
      onShortcut: (action) => {
        const speed = sim?.mirror.clock?.speed;
        if (action === 'pause') void simControls?.setSpeed(speed === 0 ? 1 : 0);
        else if (action === 'speed1') void simControls?.setSpeed(1);
        else if (action === 'speed2') void simControls?.setSpeed(2);
        else if (action === 'speed3') void simControls?.setSpeed(4);
      },
    });
    if (sim) {
      buildings = new BuildingRenderer(city.scene, {
        heightAt: (x, z) => city!.terrain.heightAt(x, z),
        registerMaterial: (material, install) =>
          city!.registerMaterial(material, install),
        unregisterMaterial: (material) => city!.unregisterMaterial(material),
      });
      buildings.group.visible = false;
      buildings.reset(sim.mirror.readBuildings());
      unsubscribeBuildings = sim.onEvent((event) => buildings!.accept(event));
      const picker = new TerrainPicker(city.terrain);
      roadPreview = new RoadPreviewRenderer(city.scene);
      city.registerMaterial(roadPreview.roads.material);
      roadTool = new RoadTool(
        {
          sim,
          pick(x, y) {
            const hit = picker.pick(
              x,
              y,
              canvas.getBoundingClientRect(),
              city!.camera,
              city!.camera.far,
            );
            return hit ? { x: hit.world.x, z: hit.world.z } : null;
          },
          preview: (result, anchor) => roadPreview?.show(result, anchor),
          worldChanged: (world) => {
            city?.syncTerrain(world.heights);
            roadPreview?.sync(world);
          },
        },
        (state) => roadControls?.update(state),
      );
      zoneRenderer = new ZoneRenderer(city.scene);
      zoneTool = new ZoneTool(
        {
          sim,
          pick(x, y) {
            const hit = picker.pick(
              x,
              y,
              canvas.getBoundingClientRect(),
              city!.camera,
              city!.camera.far,
            );
            return hit ? { x: hit.world.x, z: hit.world.z } : null;
          },
          preview: (cells, zone) => zoneRenderer?.preview(cells, zone),
          worldChanged: (blocks, heights, owned) =>
            zoneRenderer?.sync(blocks, heights, owned),
        },
        (state) => {
          zoneControls?.update(state);
          roadControls?.updateZone(state.active, state.pending);
          zoneRenderer?.setActive(state.active);
        },
      );
      bulldozePreview = new BulldozePreview(city.scene);
      bulldozeTool = new BulldozeTool(
        {
          sim,
          pick(x, y) {
            const hit = picker.pick(
              x,
              y,
              canvas.getBoundingClientRect(),
              city!.camera,
              city!.camera.far,
            );
            return hit ? { x: hit.world.x, z: hit.world.z } : null;
          },
          preview: (shapes, heights) => bulldozePreview?.show(shapes, heights),
        },
        (state) => {
          bulldozeControls?.update(state);
          roadControls?.updateBulldoze(state.active, state.pending);
        },
      );
      tools = new ToolManager((tool) => input?.setTool(tool));
      const mode = (construction: boolean) => {
        const first = construction && root.dataset.construction !== 'true';
        root.dataset.construction = String(construction);
        city!.setConstructionMode(construction);
        roadPreview!.group.visible = construction;
        zoneRenderer!.group.visible = construction;
        buildings!.group.visible = construction;
        if (first)
          city!.cameraController.flyTo(
            ROAD_TOOL_RENDER.focus,
            ROAD_TOOL_RENDER.focus.distance,
          );
      };
      roadControls = createRoadControls(root, {
        enter() {
          mode(true);
          tools!.select(roadTool!);
          canvas.focus({ preventScroll: true });
        },
        zone() {
          mode(true);
          tools!.select(zoneTool!);
          canvas.focus({ preventScroll: true });
        },
        bulldoze() {
          mode(true);
          tools!.select(bulldozeTool!);
          canvas.focus({ preventScroll: true });
        },
        explore() {
          tools!.select(null);
          canvas.focus({ preventScroll: true });
        },
        demo() {
          tools!.select(null);
          mode(false);
        },
        confirm: () => roadTool!.onConfirm(),
        cancel: () => roadTool!.onCancel(),
        type: (type) => roadTool!.setType(type),
        angle: (enabled) => roadTool!.setAngleSnap(enabled),
      });
      roadControls.update(roadTool.readState());
      zoneControls = createZoneControls(roadControls.zoneHost, {
        zone: (zone) => zoneTool!.setZone(zone),
        mode: (mode) => zoneTool!.setMode(mode),
        cancel: () => zoneTool!.onCancel(),
      });
      zoneControls.update(zoneTool.readState());
      bulldozeControls = createBulldozeControls(roadControls.bulldozeHost, {
        kind: (k) => bulldozeTool!.setKind(k),
        cancel: () => bulldozeTool!.onCancel(),
      });
      bulldozeControls.update(bulldozeTool.readState());
    }
    if (debug) {
      window.__webcityCamera = city.cameraController;
      window.__webcityZoneStats = () => {
        const blocks = sim?.mirror.readZoneBlocks() ?? [];
        const codes: Record<number, number> = {};
        let painted = 0;
        let valid = 0,
          invalid = 0;
        for (const block of blocks)
          for (const code of block.cells) {
            if (code === ZONE_CODES.invalid) invalid++;
            else {
              valid++;
              if (code) painted++;
              codes[code] = (codes[code] ?? 0) + 1;
            }
          }
        return {
          blocks: blocks.length,
          valid,
          invalid,
          painted,
          codes,
          ...zoneRenderer!.readStats(),
        };
      };
      window.__webcityBuildingStats = () => buildings!.readStats();
      window.__webcityRoadStats = () => roadPreview!.roads.readStats();
    }
  } catch {
    status.hidden = false;
    status.textContent = t('render.unavailable');
  }
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    delete window.__webcityBuildingStats;
    delete window.__webcityCamera;
    delete window.__webcityRoadStats;
    delete window.__webcityZoneStats;
    delete window.__webcityPick;
    tools?.dispose();
    bulldozeTool?.dispose();
    bulldozeControls?.dispose();
    bulldozePreview?.dispose();
    zoneTool?.dispose();
    zoneControls?.dispose();
    zoneRenderer?.dispose();
    roadTool?.dispose();
    roadControls?.dispose();
    roadPreview?.dispose();
    picking?.dispose();
    pickingDebug?.dispose();
    input?.dispose();
    unsubscribeBuildings?.();
    buildings?.dispose();
    city?.dispose();
    debug?.dispose();
    simControls?.dispose();
    sim?.dispose();
  });
