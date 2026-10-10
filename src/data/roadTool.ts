/** Construction preview dimensions; committed meshes use roadMesh.ts. */
export const ROAD_TOOL_RENDER = {
  sampleM: 4,
  surfaceLiftM: 0.25,
  previewLiftM: 0.5,
  previewOpacity: 0.65,
  markerRadiusM: 5,
  focus: { x: -120, z: -80, distance: 850 },
} as const;
