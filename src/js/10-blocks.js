'use strict';
/* Registri blok + daftar layer tekstur (indeks = layer di DataArrayTexture). */

const TEX = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'cobble', 'stone_brick', 'mossy',
  'sand', 'red_sand', 'sandstone_top', 'sandstone_side', 'gravel', 'clay',
  'oak_top', 'oak_side', 'oak_leaves', 'birch_top', 'birch_side', 'birch_leaves', 'pine_leaves',
  'planks', 'bricks', 'glass', 'snow', 'snow_side', 'ice',
  'cactus_top', 'cactus_side', 'obsidian',
  'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'glowstone', 'bedrock',
  'water', 'lava',
  'tallgrass', 'flower_yellow', 'flower_red', 'deadbush'
];
const T = {};
TEX.forEach((n, i) => T[n] = i);

const AIR = 0;
/* kind: 0 = kubus, 1 = silang (tanaman), 2 = cairan */
const K_CUBE = 0, K_CROSS = 1, K_LIQUID = 2;

/** t: [atas, samping, bawah] */
function blk(id, name, t, o = {}) {
  return {
    id, name,
    top: t[0], side: t[1], bottom: t[2] === undefined ? t[0] : t[2],
    kind: o.kind === undefined ? K_CUBE : o.kind,
    solid: o.solid === undefined ? true : o.solid,
    opaque: o.opaque === undefined ? true : o.opaque,
    light: o.light || 0,
    hardness: o.hardness === undefined ? 1.5 : o.hardness,
    cat: o.cat || 'Alam',
    shade: !!o.shade,               // menghalangi cahaya langit walau tidak opak (daun)
    tint: o.tint || null,
    note: o.note || ''
  };
}

const BLOCKS = [];
function reg(b) { BLOCKS[b.id] = b; return b; }

reg(blk(1, 'Rumput', [T.grass_top, T.grass_side, T.dirt], { hardness: 0.6, note: 'Lapisan atas daratan lembap.' }));
reg(blk(2, 'Tanah', [T.dirt, T.dirt, T.dirt], { hardness: 0.5 }));
reg(blk(3, 'Batu', [T.stone, T.stone, T.stone], { hardness: 1.5, cat: 'Batuan' }));
reg(blk(4, 'Batu Bulat', [T.cobble, T.cobble, T.cobble], { hardness: 2.0, cat: 'Batuan' }));
reg(blk(5, 'Bata Batu', [T.stone_brick, T.stone_brick, T.stone_brick], { hardness: 2.0, cat: 'Bangunan' }));
reg(blk(6, 'Batu Berlumut', [T.mossy, T.mossy, T.mossy], { hardness: 2.0, cat: 'Batuan' }));
reg(blk(7, 'Pasir', [T.sand, T.sand, T.sand], { hardness: 0.5 }));
reg(blk(8, 'Pasir Merah', [T.red_sand, T.red_sand, T.red_sand], { hardness: 0.5 }));
reg(blk(9, 'Batu Pasir', [T.sandstone_top, T.sandstone_side, T.sandstone_top], { hardness: 0.8, cat: 'Bangunan' }));
reg(blk(10, 'Kerikil', [T.gravel, T.gravel, T.gravel], { hardness: 0.6 }));
reg(blk(11, 'Tanah Liat', [T.clay, T.clay, T.clay], { hardness: 0.6 }));
reg(blk(12, 'Kayu Ek', [T.oak_top, T.oak_side, T.oak_top], { hardness: 2.0, cat: 'Kayu' }));
reg(blk(13, 'Daun Ek', [T.oak_leaves, T.oak_leaves, T.oak_leaves], { hardness: 0.2, opaque: false, shade: true, cat: 'Kayu' }));
reg(blk(14, 'Kayu Birch', [T.birch_top, T.birch_side, T.birch_top], { hardness: 2.0, cat: 'Kayu' }));
reg(blk(15, 'Daun Birch', [T.birch_leaves, T.birch_leaves, T.birch_leaves], { hardness: 0.2, opaque: false, shade: true, cat: 'Kayu' }));
reg(blk(16, 'Daun Pinus', [T.pine_leaves, T.pine_leaves, T.pine_leaves], { hardness: 0.2, opaque: false, shade: true, cat: 'Kayu' }));
reg(blk(17, 'Papan', [T.planks, T.planks, T.planks], { hardness: 2.0, cat: 'Bangunan' }));
reg(blk(18, 'Bata', [T.bricks, T.bricks, T.bricks], { hardness: 2.0, cat: 'Bangunan' }));
reg(blk(19, 'Kaca', [T.glass, T.glass, T.glass], { hardness: 0.3, opaque: false, cat: 'Bangunan' }));
reg(blk(20, 'Salju', [T.snow, T.snow_side, T.dirt], { hardness: 0.2 }));
reg(blk(21, 'Es', [T.ice, T.ice, T.ice], { hardness: 0.5, opaque: false }));
reg(blk(22, 'Kaktus', [T.cactus_top, T.cactus_side, T.cactus_top], { hardness: 0.4, opaque: false, cat: 'Tumbuhan' }));
reg(blk(23, 'Obsidian', [T.obsidian, T.obsidian, T.obsidian], { hardness: 50, cat: 'Langka' }));
reg(blk(24, 'Bijih Batu Bara', [T.coal_ore, T.coal_ore, T.coal_ore], { hardness: 3.0, cat: 'Bijih' }));
reg(blk(25, 'Bijih Besi', [T.iron_ore, T.iron_ore, T.iron_ore], { hardness: 3.0, cat: 'Bijih' }));
reg(blk(26, 'Bijih Emas', [T.gold_ore, T.gold_ore, T.gold_ore], { hardness: 3.0, cat: 'Bijih' }));
reg(blk(27, 'Bijih Berlian', [T.diamond_ore, T.diamond_ore, T.diamond_ore], { hardness: 3.0, cat: 'Bijih' }));
reg(blk(28, 'Lampu Batu', [T.glowstone, T.glowstone, T.glowstone], { hardness: 0.3, light: 15, cat: 'Langka', note: 'Memancarkan cahaya hangat radius 12 blok.' }));
reg(blk(29, 'Air', [T.water, T.water, T.water], { kind: K_LIQUID, solid: false, opaque: false, hardness: 0, cat: 'Cairan' }));
reg(blk(30, 'Lava', [T.lava, T.lava, T.lava], { kind: K_LIQUID, solid: false, opaque: false, light: 15, hardness: 0, cat: 'Cairan' }));
reg(blk(31, 'Bedrock', [T.bedrock, T.bedrock, T.bedrock], { hardness: -1, cat: 'Langka' }));
reg(blk(32, 'Rumput Tinggi', [T.tallgrass, T.tallgrass, T.tallgrass], { kind: K_CROSS, solid: false, opaque: false, hardness: 0, cat: 'Tumbuhan' }));
reg(blk(33, 'Bunga Kuning', [T.flower_yellow, T.flower_yellow, T.flower_yellow], { kind: K_CROSS, solid: false, opaque: false, hardness: 0, cat: 'Tumbuhan' }));
reg(blk(34, 'Bunga Merah', [T.flower_red, T.flower_red, T.flower_red], { kind: K_CROSS, solid: false, opaque: false, hardness: 0, cat: 'Tumbuhan' }));
reg(blk(35, 'Semak Kering', [T.deadbush, T.deadbush, T.deadbush], { kind: K_CROSS, solid: false, opaque: false, hardness: 0, cat: 'Tumbuhan' }));

const BLOCK_COUNT = BLOCKS.filter(Boolean).length;

/* Tabel lookup rata (dipakai di jalur panas mesher) */
const N_ID = 64;
const IS_OPAQUE = new Uint8Array(N_ID);
const IS_SOLID = new Uint8Array(N_ID);
const KIND = new Uint8Array(N_ID);
const IS_SHADE = new Uint8Array(N_ID);   // menghalangi cahaya langit
const LIGHT_EMIT = new Uint8Array(N_ID);
for (let i = 1; i < N_ID; i++) {
  const b = BLOCKS[i];
  if (!b) continue;
  IS_OPAQUE[i] = b.opaque ? 1 : 0;
  IS_SHADE[i] = (b.opaque || b.shade) ? 1 : 0;
  IS_SOLID[i] = b.solid ? 1 : 0;
  KIND[i] = b.kind;
  LIGHT_EMIT[i] = b.light;
}

const CATEGORIES = ['Alam', 'Batuan', 'Kayu', 'Tumbuhan', 'Bangunan', 'Bijih', 'Langka', 'Cairan'];
const CAT_LABEL = {
  Alam: 'Permukaan & sedimen', Batuan: 'Batuan', Kayu: 'Kayu & dedaunan',
  Tumbuhan: 'Tumbuhan kecil', Bangunan: 'Bahan bangunan', Bijih: 'Bijih',
  Langka: 'Langka', Cairan: 'Cairan'
};
const DEFAULT_HOTBAR = [1, 3, 4, 17, 5, 19, 13, 28, 7];
