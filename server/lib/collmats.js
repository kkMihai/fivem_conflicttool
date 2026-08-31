(() => {
globalThis.KKCT = globalThis.KKCT || {}

KKCT.collmats = (() => {
    const NAMES = [
        'DEFAULT', 'CONCRETE', 'CONCRETE_POTHOLE', 'CONCRETE_DUSTY', 'TARMAC', 'TARMAC_PAINTED',
        'TARMAC_POTHOLE', 'RUMBLE_STRIP', 'BREEZE_BLOCK', 'ROCK', 'ROCK_MOSSY', 'STONE',
        'COBBLESTONE', 'BRICK', 'MARBLE', 'PAVING_SLAB', 'SANDSTONE_SOLID', 'SANDSTONE_BRITTLE',
        'SAND_LOOSE', 'SAND_COMPACT', 'SAND_WET', 'SAND_TRACK', 'SAND_UNDERWATER', 'SAND_DRY_DEEP',
        'SAND_WET_DEEP', 'ICE', 'ICE_TARMAC', 'SNOW_LOOSE', 'SNOW_COMPACT', 'SNOW_DEEP',
        'SNOW_TARMAC', 'GRAVEL_SMALL', 'GRAVEL_LARGE', 'GRAVEL_DEEP', 'GRAVEL_TRAIN_TRACK', 'DIRT_TRACK',
        'MUD_HARD', 'MUD_POTHOLE', 'MUD_SOFT', 'MUD_UNDERWATER', 'MUD_DEEP', 'MARSH',
        'MARSH_DEEP', 'SOIL', 'CLAY_HARD', 'CLAY_SOFT', 'GRASS_LONG', 'GRASS',
        'GRASS_SHORT', 'HAY', 'BUSHES', 'TWIGS', 'LEAVES', 'WOODCHIPS',
        'TREE_BARK', 'METAL_SOLID_SMALL', 'METAL_SOLID_MEDIUM', 'METAL_SOLID_LARGE', 'METAL_HOLLOW_SMALL', 'METAL_HOLLOW_MEDIUM',
        'METAL_HOLLOW_LARGE', 'METAL_CHAINLINK_SMALL', 'METAL_CHAINLINK_LARGE', 'METAL_CORRUGATED_IRON', 'METAL_GRILLE', 'METAL_RAILING',
        'METAL_DUCT', 'METAL_GARAGE_DOOR', 'METAL_MANHOLE', 'WOOD_SOLID_SMALL', 'WOOD_SOLID_MEDIUM', 'WOOD_SOLID_LARGE',
        'WOOD_SOLID_POLISHED', 'WOOD_FLOOR_DUSTY', 'WOOD_HOLLOW_SMALL', 'WOOD_HOLLOW_MEDIUM', 'WOOD_HOLLOW_LARGE', 'WOOD_CHIPBOARD',
        'WOOD_OLD_CREAKY', 'WOOD_HIGH_DENSITY', 'WOOD_LATTICE', 'CERAMIC', 'ROOF_TILE', 'ROOF_FELT',
        'FIBREGLASS', 'TARPAULIN', 'PLASTIC', 'PLASTIC_HOLLOW', 'PLASTIC_HIGH_DENSITY', 'PLASTIC_CLEAR',
        'PLASTIC_HOLLOW_CLEAR', 'PLASTIC_HIGH_DENSITY_CLEAR', 'FIBREGLASS_HOLLOW', 'RUBBER', 'RUBBER_HOLLOW', 'LINOLEUM',
        'LAMINATE', 'CARPET_SOLID', 'CARPET_SOLID_DUSTY', 'CARPET_FLOORBOARD', 'CLOTH', 'PLASTER_SOLID',
        'PLASTER_BRITTLE', 'CARDBOARD_SHEET', 'CARDBOARD_BOX', 'PAPER', 'FOAM', 'FEATHER_PILLOW',
        'POLYSTYRENE', 'LEATHER', 'TVSCREEN', 'SLATTED_BLINDS', 'GLASS_SHOOT_THROUGH', 'GLASS_BULLETPROOF',
        'GLASS_OPAQUE', 'PERSPEX', 'CAR_METAL', 'CAR_PLASTIC', 'CAR_SOFTTOP', 'CAR_SOFTTOP_CLEAR',
        'CAR_GLASS_WEAK', 'CAR_GLASS_MEDIUM', 'CAR_GLASS_STRONG', 'CAR_GLASS_BULLETPROOF', 'CAR_GLASS_OPAQUE', 'WATER',
        'BLOOD', 'OIL', 'PETROL', 'FRESH_MEAT', 'DRIED_MEAT', 'EMISSIVE_GLASS',
        'EMISSIVE_PLASTIC', 'VFX_METAL_ELECTRIFIED', 'VFX_METAL_WATER_TOWER', 'VFX_METAL_STEAM', 'VFX_METAL_FLAME', 'PHYS_NO_FRICTION',
        'PHYS_GOLF_BALL', 'PHYS_TENNIS_BALL', 'PHYS_CASTER', 'PHYS_CASTER_RUSTY', 'PHYS_CAR_VOID', 'PHYS_PED_CAPSULE',
        'PHYS_ELECTRIC_FENCE', 'PHYS_ELECTRIC_METAL', 'PHYS_BARBED_WIRE', 'PHYS_POOLTABLE_SURFACE', 'PHYS_POOLTABLE_CUSHION', 'PHYS_POOLTABLE_BALL',
        'BUTTOCKS', 'THIGH_LEFT', 'SHIN_LEFT', 'FOOT_LEFT', 'THIGH_RIGHT', 'SHIN_RIGHT',
        'FOOT_RIGHT', 'SPINE0', 'SPINE1', 'SPINE2', 'SPINE3', 'CLAVICLE_LEFT',
        'UPPER_ARM_LEFT', 'LOWER_ARM_LEFT', 'HAND_LEFT', 'CLAVICLE_RIGHT', 'UPPER_ARM_RIGHT', 'LOWER_ARM_RIGHT',
        'HAND_RIGHT', 'NECK', 'HEAD', 'ANIMAL_DEFAULT', 'CAR_ENGINE', 'PUDDLE',
        'CONCRETE_PAVEMENT', 'BRICK_PAVEMENT', 'PHYS_DYNAMIC_COVER_BOUND', 'VFX_WOOD_BEER_BARREL', 'WOOD_HIGH_FRICTION', 'ROCK_NOINST',
        'BUSHES_NOINST', 'METAL_SOLID_ROAD_SURFACE', 'STUNT_RAMP_SURFACE', 'TEMP_01', 'TEMP_02',
    ]

    const COLORS = [
        [255, 0, 255], [145, 145, 145], [145, 145, 145], [145, 140, 130], [90, 90, 90],
        [90, 90, 90], [70, 70, 70], [90, 90, 90], [145, 145, 145], [185, 185, 185],
        [185, 185, 185], [185, 185, 185], [185, 185, 185], [195, 95, 30], [195, 155, 145],
        [200, 165, 130], [215, 195, 150], [205, 180, 120], [235, 220, 190], [250, 240, 220],
        [190, 185, 165], [250, 240, 220], [135, 130, 120], [110, 100, 85], [110, 100, 85],
        [200, 250, 255], [200, 250, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255],
        [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255], [145, 140, 130],
        [175, 160, 140], [175, 160, 140], [105, 95, 75], [105, 95, 75], [75, 65, 50],
        [105, 95, 75], [105, 95, 75], [105, 95, 75], [105, 95, 75], [160, 160, 160],
        [160, 160, 160], [130, 205, 75], [130, 205, 75], [130, 205, 75], [240, 205, 125],
        [85, 160, 30], [115, 100, 70], [70, 100, 50], [115, 100, 70], [115, 100, 70],
        [155, 180, 190], [155, 180, 190], [155, 180, 190], [155, 180, 190], [155, 180, 190],
        [155, 180, 190], [155, 180, 190], [155, 180, 190], [155, 180, 190], [155, 180, 190],
        [155, 180, 190], [155, 180, 190], [155, 180, 190], [155, 180, 190], [155, 130, 95],
        [155, 130, 95], [155, 130, 95], [155, 130, 95], [165, 145, 110], [170, 150, 125],
        [170, 150, 125], [170, 150, 125], [170, 150, 125], [155, 130, 95], [155, 130, 95],
        [155, 130, 95], [220, 210, 195], [220, 210, 195], [165, 145, 110], [255, 250, 210],
        [255, 250, 210], [255, 250, 210], [240, 230, 185], [255, 250, 210], [255, 250, 210],
        [240, 230, 185], [255, 250, 210], [240, 230, 185], [70, 70, 70], [70, 70, 70],
        [205, 150, 80], [170, 150, 125], [250, 100, 100], [255, 135, 135], [250, 100, 100],
        [250, 100, 100], [145, 145, 145], [225, 225, 225], [120, 115, 95], [120, 115, 95],
        [230, 225, 220], [230, 235, 240], [230, 230, 230], [255, 250, 210], [250, 100, 100],
        [115, 125, 125], [255, 250, 210], [205, 240, 255], [115, 125, 125], [205, 240, 255],
        [205, 240, 255], [255, 255, 255], [255, 255, 255], [250, 100, 100], [250, 100, 100],
        [210, 245, 245], [210, 245, 245], [210, 245, 245], [210, 245, 245], [210, 245, 245],
        [55, 145, 230], [205, 5, 5], [80, 65, 65], [70, 100, 120], [255, 55, 20],
        [185, 100, 85], [205, 240, 255], [255, 250, 210], [155, 180, 190], [155, 180, 190],
        [155, 180, 190], [155, 180, 190], [0, 0, 0], [0, 0, 0], [0, 0, 0],
        [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0],
        [0, 0, 0], [0, 0, 0], [155, 130, 95], [155, 130, 95], [255, 250, 210],
        [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0],
        [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0],
        [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0],
        [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0],
        [0, 0, 0], [0, 0, 0], [255, 255, 255], [55, 145, 230], [145, 145, 145],
        [195, 95, 30], [0, 0, 0], [155, 130, 95], [155, 130, 95], [185, 185, 185],
        [85, 160, 30], [155, 180, 190], [155, 180, 190], [255, 0, 255], [255, 0, 255]
    ]

    const FLAGS = [
        'stairs', 'not_climbable', 'see_through', 'shoot_through',
        'not_cover', 'walkable_path', 'no_cam_collision', 'shoot_through_fx',
        'no_decal', 'no_navmesh', 'no_ragdoll', 'vehicle_wheel',
        'no_ptfx', 'too_steep_for_player', 'no_network_spawn', 'no_cam_collision_allow_clipping'
    ]

    function name(type) {
        return NAMES[type] || `UNKNOWN_${type}`
    }

    function decode(data1, data2) {
        return {
            type: data1 & 0xff,
            procId: (data1 >>> 8) & 0xff,
            roomId: (data1 >>> 16) & 0x1f,
            pedDensity: (data1 >>> 21) & 0x7,
            flags: ((data1 >>> 24) & 0xff) | ((data2 & 0xff) << 8),
            colorIndex: (data2 >>> 8) & 0xff,
            unk4: (data2 >>> 16) & 0xffff
        }
    }

    function encode(cur, next) {
        const f = { ...cur, ...next }
        const data1 = ((f.type & 0xff) |
            ((f.procId & 0xff) << 8) |
            ((f.roomId & 0x1f) << 16) |
            ((f.pedDensity & 0x7) << 21) |
            ((f.flags & 0xff) << 24)) >>> 0
        const data2 = (((f.flags >>> 8) & 0xff) |
            ((f.colorIndex & 0xff) << 8) |
            ((f.unk4 & 0xffff) << 16)) >>> 0
        return { data1, data2 }
    }

    return { NAMES, COLORS, FLAGS, name, decode, encode, count: () => NAMES.length }
})()
})()
