/* global document, requestAnimationFrame */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    process.env.ROAD_MESH_TEST_URL ||
      'http://127.0.0.1:5173/webcity/?quality=low',
  );
  const result = await page.evaluate(async () => {
    const { ENVIRONMENT_PALETTE, PWA_PALETTE, LIGHT_PALETTE } =
      await import('/webcity/src/data/palette.ts');
    const THREE = await import('/webcity/node_modules/.vite/deps/three.js');
    const { RoadRenderer } =
      await import('/webcity/src/render/roads/roadRenderer.ts');
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(1440, 900);
    renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:10000';
    document.body.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(ENVIRONMENT_PALETTE.grass);
    scene.add(
      new THREE.HemisphereLight(PWA_PALETTE.skyline, LIGHT_PALETTE.ground, 2),
    );
    const camera = new THREE.PerspectiveCamera(45, 1440 / 900, 1, 15000);
    camera.position.set(0, 5000, 3500);
    camera.lookAt(0, 0, 0);
    function make(count) {
      const nodes = [],
        segments = [];
      for (let i = 0; i < count; i++) {
        const x = -2200 + (i % 40) * 110,
          z = -2200 + Math.floor(i / 40) * 175;
        const start = i * 2,
          end = start + 1;
        nodes.push(
          {
            id: start,
            pos: { x, z },
            height: 0,
            segments: [i],
            control: 'none',
          },
          {
            id: end,
            pos: { x: x + 80, z },
            height: 0,
            segments: [i],
            control: 'none',
          },
        );
        segments.push({
          id: i,
          type: 'road_small',
          start,
          end,
          c1: { x: x + 80 / 3, z },
          c2: { x: x + 160 / 3, z },
          length: 80,
          elevated: false,
          builtDay: 0,
          zoneBlockIds: [],
        });
      }
      return {
        nodes,
        segments,
        heights: new Float32Array(),
        money: 70000,
        mode: 'normal',
        unlocked: [0],
        nextId: 3000,
        ownedTiles: [12],
        buildings: [],
      };
    }
    const road = new RoadRenderer();
    scene.add(road.group);
    road.sync(make(1000));
    let frames = 0,
      maxSlice = 0;
    while (road.readStats().pending) {
      const t = performance.now();
      road.update();
      maxSlice = Math.max(maxSlice, performance.now() - t);
      frames++;
      await new Promise(requestAnimationFrame);
    }
    renderer.render(scene, camera);
    const stress = {
      roads: 1000,
      drawCalls: renderer.info.render.calls,
      batches: road.readStats().batches,
      frames,
      maxSliceMs: maxSlice,
    };
    const nodes = [],
      segments = [];
    function add(x, z, angles, type = 'road_small') {
      const center = nodes.length;
      nodes.push({
        id: center,
        pos: { x, z },
        height: 0,
        segments: [],
        control: 'none',
      });
      for (const angle of angles) {
        const a = (angle * Math.PI) / 180,
          xx = x + 90 * Math.cos(a),
          zz = z + 90 * Math.sin(a),
          end = nodes.length,
          id = segments.length;
        nodes[center].segments.push(id);
        nodes.push({
          id: end,
          pos: { x: xx, z: zz },
          height: 0,
          segments: [id],
          control: 'none',
        });
        segments.push({
          id,
          type,
          start: center,
          end,
          c1: { x: x + (xx - x) / 3, z: z + (zz - z) / 3 },
          c2: { x: x + ((xx - x) * 2) / 3, z: z + ((zz - z) * 2) / 3 },
          length: 90,
          elevated: false,
          builtDay: 0,
          zoneBlockIds: [],
        });
      }
    }
    add(-150, -130, [0, 90, 180, 270]);
    add(150, -130, [0, 90, 180]);
    add(-150, 140, [0, 45, 180]);
    add(150, 140, [0, 30, 180], 'road_medium');
    road.sync({ ...make(0), nodes, segments });
    while (road.readStats().pending) {
      road.update();
      await new Promise(requestAnimationFrame);
    }
    camera.position.set(0, 650, 200);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    return stress;
  });
  assert.ok(result.drawCalls < 30);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: 'test-results/road-mesh-junctions.png' });
  console.log(JSON.stringify({ ...result, errors }));
} finally {
  await browser.close();
}
