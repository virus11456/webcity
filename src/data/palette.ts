// PWA shell and original icon palette (ART §2.5 / TECH §11).
export const PWA_PALETTE = {
  background: '#141A22',
  skyline: '#FFFFFF',
} as const;

// ART §2. All render colors originate here.
export const ENVIRONMENT_PALETTE = {
  grass: '#7FA650',
  grass_dark: '#5E8A3A',
  grass_dry: '#A8A866',
  dirt: '#8B7355',
  rock: '#8A877D',
  snow: '#EEF2F5',
  sand: '#D8C89A',
  water_shallow: '#4FB3BF',
  water_deep: '#1F4E79',
  water_foam: '#E8F4F4',
  sky_zenith: '#4A8FD9',
  sky_horizon: '#CFE6F5',
} as const;
export const ROAD_PALETTE = {
  asphalt: '#3B3E44',
  asphalt_worn: '#4A4D52',
  lane_white: '#EDEDED',
  lane_yellow: '#E3BE45',
  sidewalk: '#B8B3AA',
  curb: '#9A968E',
  gravel: '#9C9078',
  concrete: '#B5B2AA',
  signal_red: '#D95757',
  signal_green: '#64C578',
  signal_off: '#20252B',
  median_grass: '#6E9A45',
  tree_leaf: '#47783D',
  tree_trunk: '#72553C',
} as const;
export const ZONE_PALETTE = {
  RL: {
    normal: '#6CC24A',
    colorBlind: '#009E73',
  },
  RH: {
    normal: '#2E8B3E',
    colorBlind: '#00664A',
  },
  CL: {
    normal: '#5AA9F0',
    colorBlind: '#56B4E9',
  },
  CH: {
    normal: '#1F5FAF',
    colorBlind: '#0072B2',
  },
  I: {
    normal: '#F2C230',
    colorBlind: '#E69F00',
  },
  O: {
    normal: '#37C8C8',
    colorBlind: '#CC79A7',
  },
} as const;
export const BUILDING_PALETTE = {
  RL: {
    walls: ['#EDE3D1', '#F4F1EA', '#C9876B', '#E8D9A8', '#AFC0CC'],
    roofs: ['#4A4E57', '#A6533D', '#6E4B3A', '#4F6273'],
    accents: ['#FFFFFF', '#7A5536', '#86B05A'],
  },
  RH: {
    walls: ['#C9C6BF', '#B5ADA3', '#A8644E', '#E9E7E2'],
    roofs: ['#8E8E8A', '#B0B0AC'],
    accents: ['#3F4448', '#5F7F99'],
  },
  commercial: {
    walls: ['#F0EEE9', '#D3D1CC', '#B05A45', '#DCCFB4'],
    roofs: ['#7F807D'],
    accents: ['#C8443A', '#3E8E5A', '#3A6EA8', '#E08A2E', '#FFFFFF'],
  },
  industrial: {
    walls: ['#9AA3A8', '#6F8592', '#C8BBA0', '#8E4F3A'],
    roofs: ['#7C8489'],
    accents: ['#B04A3A', '#FFFFFF', '#D9D9D4', '#E8B931'],
  },
  office: {
    walls: ['#4C7FA3', '#4F9AA0', '#2E4A63', '#E6E8EA'],
    roofs: ['#6E7378'],
    accents: ['#3A3D42', '#C0C0C0'],
  },
} as const;
export const SERVICE_PALETTE = {
  police: '#3A5BA0',
  fire: '#B8352E',
  health: '#F2F2F2',
  education: '#D9A35F',
  power: '#8C8C88',
} as const;
export const UI_PALETTE = {
  panel: 'rgba(20, 26, 34, 0.88)',
  border: 'rgba(255,255,255,0.08)',
  text: '#F2F5F8',
  secondaryText: '#9AA7B4',
  accent: '#4FC3F7',
  positive: '#7BD88F',
  negative: '#FF6B6B',
  warning: '#FFC857',
  infoScale: ['#4CAF50', '#CDDC39', '#FFC107', '#FF7043', '#E53935'],
} as const;
export const ZONE_OPACITY = {
  ground: 0.35,
  selected: 0.6,
} as const;
export type ZonePaletteId = keyof typeof ZONE_PALETTE;
export type EnvironmentColor = keyof typeof ENVIRONMENT_PALETTE;
export type Palette =
  typeof ENVIRONMENT_PALETTE | typeof ROAD_PALETTE | typeof UI_PALETTE;

// ART §4, daytime light colors.
export const LIGHT_PALETTE = {
  sun: '#FFF1DC',
  sky: '#BBD7F0',
  ground: '#6B7A4F',
} as const;

// ART §4 / §7 and original neutral gallery presentation colors.
export const BUILDING_DETAIL_PALETTE = {
  concrete: '#A9A59C',
  glass: '#5F7F99',
  frame: '#E6E8EA',
  windowLight: '#FFD27A',
  atlasWhite: '#FFFFFF',
  atlasBlack: '#000000',
  night: '#0E1630',
  galleryDay: '#E9E7E2',
  scaffold: '#C0C0C0',
  crane: '#E8B931',
} as const;

export const VEHICLE_PALETTE = {
  paint: [
    '#E8E7DF',
    '#34383F',
    '#A9AFB3',
    '#28496C',
    '#B54C43',
    '#64816A',
    '#D8B857',
    '#83604C',
    '#83B2CA',
  ],
  glass: '#344B59',
  rubber: '#272B30',
  chrome: '#A8ADB1',
  headlight: '#F1E9CD',
  taillight: '#C13D36',
  skin: '#D8AB89',
  clothes: ['#3A6EA8', '#C8443A', '#E08A2E', '#5D8F72', '#ADA08F'],
} as const;
