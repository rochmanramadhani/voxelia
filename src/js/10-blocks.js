'use strict';
/* Block registry + texture layer list (index = layer in the DataArrayTexture).
   Display names live in the i18n dictionary under `block.<key>`; nothing here
   is user-visible text. */

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
/* kind: 0 = cube, 1 = cross (plant), 2 = fluid */
const K_CUBE = 0, K_CROSS = 1, K_LIQUID = 2;

/** t: [top, side, bottom] */
function blk(id, key, t, o = {}) {
  return {
    id, key,
    top: t[0], side: t[1], bottom: t[2] === undefined ? t[0] : t[2],
    kind: o.kind === undefined ? K_CUBE : o.kind,
    solid: o.solid === undefined ? true : o.solid,
    opaque: o.opaque === undefined ? true : o.opaque,
    light: o.light || 0,
    hardness: o.hardness === undefined ? 1.5 : o.hardness,
    shade: !!o.shade,               // blocks skylight even when not opaque (leaves)
    cat: o.cat || 'nature',
    note: !!o.note                  // true -> i18n key `block.<key>.note` exists
  };
}

const BLOCKS = [];
function reg(b) { BLOCKS[b.id] = b; return b; }

reg(blk(1, 'grass', [T.grass_top, T.grass_side, T.dirt], { hardness: 0.6, note: true }));
reg(blk(2, 'dirt', [T.dirt, T.dirt, T.dirt], { hardness: 0.5 }));
reg(blk(3, 'stone', [T.stone, T.stone, T.stone], { hardness: 1.5, cat: 'stone' }));
reg(blk(4, 'cobblestone', [T.cobble, T.cobble, T.cobble], { hardness: 2.0, cat: 'stone' }));
reg(blk(5, 'stone_bricks', [T.stone_brick, T.stone_brick, T.stone_brick], { hardness: 2.0, cat: 'build' }));
reg(blk(6, 'mossy_stone', [T.mossy, T.mossy, T.mossy], { hardness: 2.0, cat: 'stone' }));
reg(blk(7, 'sand', [T.sand, T.sand, T.sand], { hardness: 0.5 }));
reg(blk(8, 'red_sand', [T.red_sand, T.red_sand, T.red_sand], { hardness: 0.5 }));
reg(blk(9, 'sandstone', [T.sandstone_top, T.sandstone_side, T.sandstone_top], { hardness: 0.8, cat: 'build' }));
reg(blk(10, 'gravel', [T.gravel, T.gravel, T.gravel], { hardness: 0.6 }));
reg(blk(11, 'clay', [T.clay, T.clay, T.clay], { hardness: 0.6 }));
reg(blk(12, 'oak_log', [T.oak_top, T.oak_side, T.oak_top], { hardness: 2.0, cat: 'wood' }));
reg(blk(13, 'oak_leaves', [T.oak_leaves, T.oak_leaves, T.oak_leaves], { hardness: 0.2, opaque: false, shade: true, cat: 'wood' }));
reg(blk(14, 'birch_log', [T.birch_top, T.birch_side, T.birch_top], { hardness: 2.0, cat: 'wood' }));
reg(blk(15, 'birch_leaves', [T.birch_leaves, T.birch_leaves, T.birch_leaves], { hardness: 0.2, opaque: false, shade: true, cat: 'wood' }));
reg(blk(16, 'pine_leaves', [T.pine_leaves, T.pine_leaves, T.pine_leaves], { hardness: 0.2, opaque: false, shade: true, cat: 'wood' }));
reg(blk(17, 'planks', [T.planks, T.planks, T.planks], { hardness: 2.0, cat: 'build' }));
reg(blk(18, 'bricks', [T.bricks, T.bricks, T.bricks], { hardness: 2.0, cat: 'build' }));
reg(blk(19, 'glass', [T.glass, T.glass, T.glass], { hardness: 0.3, opaque: false, cat: 'build' }));
reg(blk(20, 'snow', [T.snow, T.snow_side, T.dirt], { hardness: 0.2 }));
reg(blk(21, 'ice', [T.ice, T.ice, T.ice], { hardness: 0.5, opaque: false }));
reg(blk(22, 'cactus', [T.cactus_top, T.cactus_side, T.cactus_top], { hardness: 0.4, opaque: false }));
reg(blk(23, 'obsidian', [T.obsidian, T.obsidian, T.obsidian], { hardness: 50, cat: 'rare' }));
reg(blk(24, 'coal_ore', [T.coal_ore, T.coal_ore, T.coal_ore], { hardness: 3.0, cat: 'ore' }));
reg(blk(25, 'iron_ore', [T.iron_ore, T.iron_ore, T.iron_ore], { hardness: 3.0, cat: 'ore' }));
reg(blk(26, 'gold_ore', [T.gold_ore, T.gold_ore, T.gold_ore], { hardness: 3.0, cat: 'ore' }));
reg(blk(27, 'diamond_ore', [T.diamond_ore, T.diamond_ore, T.diamond_ore], { hardness: 3.0, cat: 'ore' }));
reg(blk(28, 'glowstone', [T.glowstone, T.glowstone, T.glowstone], { hardness: 0.3, light: 15, cat: 'rare', note: true }));
reg(blk(29, 'water', [T.water, T.water, T.water], { kind: K_LIQUID, solid: false, opaque: false, hardness: 0, cat: 'fluid' }));
reg(blk(30, 'lava', [T.lava, T.lava, T.lava], { kind: K_LIQUID, solid: false, opaque: false, light: 15, hardness: 0, cat: 'fluid' }));
reg(blk(31, 'bedrock', [T.bedrock, T.bedrock, T.bedrock], { hardness: -1, cat: 'rare' }));
reg(blk(32, 'tall_grass', [T.tallgrass, T.tallgrass, T.tallgrass], { kind: K_CROSS, solid: false, opaque: false, hardness: 0, cat: 'plant' }));
reg(blk(33, 'yellow_flower', [T.flower_yellow, T.flower_yellow, T.flower_yellow], { kind: K_CROSS, solid: false, opaque: false, hardness: 0, cat: 'plant' }));
reg(blk(34, 'red_flower', [T.flower_red, T.flower_red, T.flower_red], { kind: K_CROSS, solid: false, opaque: false, hardness: 0, cat: 'plant' }));
reg(blk(35, 'dead_bush', [T.deadbush, T.deadbush, T.deadbush], { kind: K_CROSS, solid: false, opaque: false, hardness: 0, cat: 'plant' }));

const BLOCK_COUNT = BLOCKS.filter(Boolean).length;

/** Localised display name for a block id. */
function blockName(id) {
  const b = BLOCKS[id];
  return b ? t('block.' + b.key) : t('common.air');
}

/* Flat lookup tables, used on the mesher's hot path. */
const N_ID = 64;
const IS_OPAQUE = new Uint8Array(N_ID);
const IS_SOLID = new Uint8Array(N_ID);
const KIND = new Uint8Array(N_ID);
const IS_SHADE = new Uint8Array(N_ID);   // casts skylight shadow
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

const CATEGORIES = ['nature', 'stone', 'wood', 'plant', 'build', 'ore', 'rare', 'fluid'];
const DEFAULT_HOTBAR = [1, 3, 4, 17, 5, 19, 13, 28, 7];
