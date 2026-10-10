import { readPreferences } from './ui/preferences';
import { createPauseMenu } from './ui/screens/PauseMenu';
import { startup } from './bootstrap';
import { SAVE } from './data/persistence';
import { createSaveController } from './save/controller';
import { createSaveControls } from './ui/saveControls';
import './ui/styles/save.css';
import { InspectTool } from './tools/inspectTool';
import { createInspectPanel } from './ui/panels/InspectPanel';
import { UI_PALETTE } from './data/palette';
import { ProblemIcons } from './render/icons';
import { WaterTool } from './tools/waterTool';
import { WaterUtilityRenderer } from './render/waterUtilities';
import { createFinanceControls } from './ui/financeControls';
import { createWaterControls } from './ui/waterControls';
import { PlaceTool } from './tools/placeTool';
import { NetworkTool } from './tools/networkTool';
import { PowerRenderer } from './render/power';
import { createPowerControls } from './ui/powerControls';
import { createGrowthControls } from './ui/growthControls';
import { GROWTH_VIEW_DISTANCE } from './data/buildingRendering';
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
import { CITY_PREVIEW, type CityView } from './data/terrain';
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
    __webcityStats?: () => ReturnType<SimClient['mirror']['readStats']>;
    __webcityBuildings?: () => ReturnType<SimClient['mirror']['readBuildings']>;
    __webcityProblemIcons?: () => ReturnType<ProblemIcons['readStats']>;
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

let pauseMenu: ReturnType<typeof createPauseMenu> | undefined;
let saveController: ReturnType<typeof createSaveController> | undefined;
let saveControls: ReturnType<typeof createSaveControls> | undefined;
let inspectTool: InspectTool | undefined;
let inspectPanel: ReturnType<typeof createInspectPanel> | undefined;
let inspectPreview: BulldozePreview | undefined;
let waterTool: WaterTool | undefined;
let waterUtilities: WaterUtilityRenderer | undefined;
let waterControls: ReturnType<typeof createWaterControls> | undefined;
let unsubscribeWater: (() => void) | undefined;
let placeTool: PlaceTool | undefined;
let networkTool: NetworkTool | undefined;
let powerRenderer: PowerRenderer | undefined;
let powerControls: ReturnType<typeof createPowerControls> | undefined;
let unsubscribePower: (() => void) | undefined;
let bulldozeTool: BulldozeTool | undefined;
let bulldozePreview: BulldozePreview | undefined;
let bulldozeControls: ReturnType<typeof createBulldozeControls> | undefined;
let zoneTool: ZoneTool | undefined;
let zoneRenderer: ZoneRenderer | undefined;
let zoneControls: ReturnType<typeof createZoneControls> | undefined;
let roadTool: RoadTool | undefined;
let growthControls: ReturnType<typeof createGrowthControls> | undefined;
let roadControls: ReturnType<typeof createRoadControls> | undefined;
let roadPreview: RoadPreviewRenderer | undefined;
let tools: ToolManager | undefined;
let input: CameraController | undefined;
let city: CityRenderer | undefined;
let buildings: BuildingRenderer | undefined;
let problemIcons: ProblemIcons | undefined;
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
let financeControls: ReturnType<typeof createFinanceControls> | undefined;
let simControls: ReturnType<typeof createSimControls> | undefined;
try {
  sim = new SimClient(
    new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' }),
  );
  simControls = createSimControls(root, sim);
  void sim
    .send(
      startup.data
        ? { t: 'load', data: startup.data }
        : { t: 'init', ...startup.settings },
    )
    .then((response) => {
      if (response.t !== 'ready') simControls?.showError();
      else if (startup.construction) roadControls?.showCity();
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
    const preferences = readPreferences();
    document.documentElement.style.setProperty(
      '--ui-scale',
      String(preferences.uiScale / 100),
    );
    const renderSearch = new URLSearchParams(location.search);
    if (!renderSearch.has('quality') && preferences.quality !== 'auto')
      renderSearch.set('quality', preferences.quality);
    city = new CityRenderer(canvas, {
      search: `?${renderSearch}`,
      seed: startup.settings.seed,
      mapId: startup.settings.mapId,
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
        if (city)
          problemIcons?.update(
            frameSeconds,
            city.camera,
            window.innerWidth,
            window.innerHeight,
          );
        powerRenderer?.update(frameSeconds);
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
      onTap: (p) => {
        picking?.tap(p.x, p.y);
        if (root.dataset.construction === 'true') inspectTool?.tap(p.x, p.y);
      },
      onShortcut: (action) => {
        if (action === 'cancel') inspectTool?.clear();
        const speed = sim?.mirror.clock?.speed;
        if (action === 'pause') void simControls?.setSpeed(speed === 0 ? 1 : 0);
        else if (action === 'speed1') void simControls?.setSpeed(1);
        else if (action === 'speed2') void simControls?.setSpeed(2);
        else if (action === 'speed3') void simControls?.setSpeed(4);
      },
    });
    input.setEdgeScrolling(preferences.edgeScrolling);
    if (sim) {
      buildings = new BuildingRenderer(city.scene, {
        heightAt: (x, z) => city!.terrain.heightAt(x, z),
        registerMaterial: (material, install) =>
          city!.registerMaterial(material, install),
        unregisterMaterial: (material) => city!.unregisterMaterial(material),
      });
      buildings.group.visible = false;
      buildings.reset(sim.mirror.readBuildings());
      problemIcons = new ProblemIcons(city.scene, (id, out) =>
        buildings!.roof(id, out),
      );
      problemIcons.reset(sim.mirror.readBuildings());
      problemIcons.group.visible = false;
      unsubscribeBuildings = sim.onEvent((event) => {
        buildings!.accept(event);
        problemIcons!.accept(event);
      });
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
      powerRenderer = new PowerRenderer(city.scene, (x, z) =>
        city!.terrain.heightAt(x, z),
      );
      powerRenderer.group.visible = false;
      const powerSnapshot = sim.mirror.readSnapshot();
      if (powerSnapshot)
        powerRenderer.accept({ t: 'ready', reqId: 0, snapshot: powerSnapshot });
      unsubscribePower = sim.onEvent((e) => powerRenderer!.accept(e));
      const powerContext = {
        sim,
        pick(x: number, y: number) {
          const h = picker.pick(
            x,
            y,
            canvas.getBoundingClientRect(),
            city!.camera,
            city!.camera.far,
          );
          return h ? { x: h.world.x, z: h.world.z } : null;
        },
        preview: (p: Parameters<PowerRenderer['show']>[0]) =>
          powerRenderer?.show(p),
      };
      const powerChanged = () => {
        const p = placeTool?.readState(),
          n = networkTool?.readState();
        roadControls?.updatePower(
          !!(p?.active || n?.active),
          !!(p?.pending || n?.pending),
        );
        if (n?.active) powerControls?.update(n);
        else if (p?.active) powerControls?.update(p);
      };
      placeTool = new PlaceTool(powerContext, powerChanged);
      networkTool = new NetworkTool(powerContext, powerChanged);
      waterUtilities = new WaterUtilityRenderer(city.scene, (x, z) =>
        city!.terrain.heightAt(x, z),
      );
      waterUtilities.group.visible = false;
      if (powerSnapshot)
        waterUtilities.accept({
          t: 'ready',
          reqId: 0,
          snapshot: powerSnapshot,
        });
      unsubscribeWater = sim.onEvent((e) => waterUtilities!.accept(e));
      waterTool = new WaterTool(
        { ...powerContext, preview: (p) => waterUtilities?.show(p) },
        (s) => {
          roadControls?.updateWater(s.active, s.pending);
          waterControls?.update(s);
          const underground =
            s.active && (s.mode === 'pipe' || s.mode === 'roads');
          city!.setWaterOverlay(underground);
          waterUtilities?.setUnderground(underground);
          root.dataset.underground = String(underground);
        },
      );
      inspectPreview = new BulldozePreview(city.scene, UI_PALETTE.accent);
      inspectPanel = createInspectPanel(root, () => inspectTool?.clear());
      inspectTool = new InspectTool(
        sim,
        powerContext.pick,
        (info) => inspectPanel?.update(info),
        (shapes, heights) => inspectPreview?.show(shapes, heights),
      );
      tools = new ToolManager((tool) => {
        inspectTool?.clear();
        input?.setTool(tool);
      });
      const mode = (construction: boolean) => {
        const first = construction && root.dataset.construction !== 'true';
        root.dataset.construction = String(construction);
        city!.setConstructionMode(construction);
        roadPreview!.group.visible = construction;
        zoneRenderer!.group.visible = construction;
        buildings!.group.visible = construction;
        problemIcons!.group.visible = construction;
        powerRenderer!.group.visible = construction;
        waterUtilities!.group.visible = construction;
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
        water() {
          mode(true);
          tools!.select(waterTool!);
          canvas.focus({ preventScroll: true });
        },
        power() {
          mode(true);
          tools!.select(placeTool!);
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
        mode: (mode) => roadTool!.setMode(mode),
        angle: (enabled) => roadTool!.setAngleSnap(enabled),
      });
      powerControls = createPowerControls(roadControls.powerHost, {
        plant(id) {
          tools!.select(placeTool!);
          placeTool!.setDefinition(id);
        },
        line() {
          tools!.select(networkTool!);
        },
        rotate: () => placeTool!.rotate(),
        confirm: () =>
          networkTool!.readState().active
            ? networkTool!.onConfirm()
            : placeTool!.onConfirm(),
        cancel: () =>
          networkTool!.readState().active
            ? networkTool!.onCancel()
            : placeTool!.onCancel(),
      });
      waterControls = createWaterControls(roadControls.waterHost, {
        mode: (m) => waterTool!.setMode(m),
        rotate: () => waterTool!.rotate(),
        confirm: () => waterTool!.onConfirm(),
        cancel: () => waterTool!.onCancel(),
      });
      growthControls = createGrowthControls(
        roadControls.growthHost,
        sim,
        (b) => {
          tools!.select(null);
          buildings!.focus(b.id);
          city!.cameraController.flyTo(b.pos, GROWTH_VIEW_DISTANCE);
          canvas.focus({ preventScroll: true });
        },
        root,
      );
      financeControls = createFinanceControls(root, sim!);
      saveController = createSaveController(
        sim,
        () =>
          city?.thumbnail(
            SAVE.thumbnailWidth,
            SAVE.thumbnailHeight,
            SAVE.thumbnailQuality,
          ) ?? null,
        (failed) => saveControls?.notify(failed),
      );
      saveControls = createSaveControls(root, saveController);
      pauseMenu = createPauseMenu(
        root,
        sim,
        (value) => {
          input?.setEdgeScrolling(value.edgeScrolling);
          city?.setQuality(value.quality);
        },
        () => saveController!.save(SAVE.autoId),
      );
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
      window.__webcityStats = () => sim!.mirror.readStats();
      window.__webcityBuildings = () => sim!.mirror.readBuildings();
      window.__webcityProblemIcons = () => problemIcons!.readStats();
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
    delete window.__webcityProblemIcons;
    delete window.__webcityBuildingStats;
    delete window.__webcityBuildings;
    delete window.__webcityStats;
    delete window.__webcityCamera;
    delete window.__webcityRoadStats;
    delete window.__webcityZoneStats;
    delete window.__webcityPick;
    pauseMenu?.dispose();
    saveController?.dispose();
    saveControls?.dispose();
    tools?.dispose();
    inspectTool?.dispose();
    inspectPanel?.dispose();
    inspectPreview?.dispose();
    unsubscribeWater?.();
    waterTool?.dispose();
    waterControls?.dispose();
    waterUtilities?.dispose();
    unsubscribePower?.();
    placeTool?.dispose();
    networkTool?.dispose();
    powerControls?.dispose();
    powerRenderer?.dispose();
    bulldozeTool?.dispose();
    bulldozeControls?.dispose();
    bulldozePreview?.dispose();
    zoneTool?.dispose();
    zoneControls?.dispose();
    zoneRenderer?.dispose();
    roadTool?.dispose();
    roadControls?.dispose();
    growthControls?.dispose();
    roadPreview?.dispose();
    picking?.dispose();
    pickingDebug?.dispose();
    input?.dispose();
    unsubscribeBuildings?.();
    problemIcons?.dispose();
    buildings?.dispose();
    city?.dispose();
    debug?.dispose();
    financeControls?.dispose();
    simControls?.dispose();
    sim?.dispose();
  });
