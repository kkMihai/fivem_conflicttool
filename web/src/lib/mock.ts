import type { Conflict, ResourceWeight, ScanMeta, ToolState, AssetKind, CollisionData } from '@/types'

const mockMat = (slot: number, type: number, name: string, flags = 0) => ({
    slot, type, name, flags, procId: 0, roomId: 0, pedDensity: 0, colorIndex: 0, unk4: 0
})

export const mockCollMats = [
    'DEFAULT', 'CONCRETE', 'CONCRETE_POTHOLE', 'CONCRETE_DUSTY', 'TARMAC', 'TARMAC_PAINTED',
    'TARMAC_POTHOLE', 'RUMBLE_STRIP', 'BREEZE_BLOCK', 'ROCK', 'ROCK_MOSSY', 'STONE',
    'COBBLESTONE', 'BRICK', 'MARBLE', 'PAVING_SLAB', 'SANDSTONE_SOLID', 'SANDSTONE_BRITTLE',
    'SAND_LOOSE', 'SAND_COMPACT', 'GRAVEL_SMALL', 'GRAVEL_LARGE', 'DIRT_TRACK', 'MUD_HARD',
    'GRASS_LONG', 'GRASS', 'GRASS_SHORT', 'HAY', 'BUSHES', 'TREE_BARK', 'METAL_SOLID_SMALL'
]

export const mockCollColors: [number, number, number][] = [
    [255, 0, 255], [145, 145, 145], [145, 145, 145], [145, 140, 130], [90, 90, 90], [90, 90, 90],
    [70, 70, 70], [90, 90, 90], [145, 145, 145], [185, 185, 185], [185, 185, 185], [185, 185, 185],
    [185, 185, 185], [195, 95, 30], [195, 155, 145], [200, 165, 130], [215, 195, 150], [205, 190, 145],
    [235, 220, 170], [230, 215, 165], [190, 185, 165], [190, 185, 165], [175, 160, 140], [110, 100, 85],
    [110, 100, 85], [125, 140, 80], [125, 140, 80], [150, 150, 90], [85, 160, 30], [125, 90, 55],
    [155, 155, 155]
]

export const mockCollFlags = [
    'stairs', 'not_climbable', 'see_through', 'shoot_through',
    'not_cover', 'walkable_path', 'no_cam_collision', 'shoot_through_fx',
    'no_decal', 'no_navmesh', 'no_ragdoll', 'vehicle_wheel',
    'no_ptfx', 'too_steep_for_player', 'no_network_spawn', 'no_cam_collision_allow_clipping'
]

export const mockCollision: CollisionData = {
    file: 'sc1_13_0.ybn',
    resource: 'citymaps_tunershop',
    rel: 'stream/sc1_13_0.ybn',
    inspect: {
        composite: true,
        root: { type: 10, bmin: [1200.4, -1580.2, 28.1], bmax: [1288.9, -1495.7, 61.4], center: [1244.6, -1538, 44.7] },
        bounds: [
            {
                bi: 0, type: 8, tris: 3780, faces: 3780,
                bmin: [-44.2, -42.2, -16.6], bmax: [44.2, 42.2, 16.6],
                m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1244.6, -1538, 44.7, 1],
                matSource: 'geom',
                mats: [mockMat(0, 4, 'TARMAC'), mockMat(1, 21, 'GRAVEL_LARGE', 0x0020), mockMat(2, 9, 'ROCK')]
            },
            {
                bi: 1, type: 8, tris: 512, faces: 512,
                bmin: [-8.5, -6.2, -3.1], bmax: [8.5, 6.2, 3.1],
                m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1262.1, -1512.4, 33.9, 1],
                matSource: 'geom',
                mats: [mockMat(0, 1, 'CONCRETE'), mockMat(1, 25, 'GRASS', 0x0200)]
            }
        ]
    }
}

export const mockWeights: ResourceWeight[] = [
    { name: 'citymaps_gasstation', bytes: 512 * 1024 * 1024, files: 1240, over: [{ rel: 'stream/gas_main.ydr', size: 21 * 1024 * 1024 }, { rel: 'stream/gas_props.ytd', size: 18 * 1024 * 1024 }] },
    { name: 'firedept_mlo', bytes: 388 * 1024 * 1024, files: 890, over: [] },
    { name: 'citymaps_tunershop', bytes: 201 * 1024 * 1024, files: 610, over: [{ rel: 'stream/tuner_interior.ytd', size: 33 * 1024 * 1024 }] },
    { name: 'prop_pack_downtown', bytes: 96 * 1024 * 1024, files: 402, over: [] },
    { name: 'citymaps_townhall', bytes: 45 * 1024 * 1024, files: 180, over: [] },
    { name: 'freemode_hills', bytes: 18 * 1024 * 1024, files: 66, over: [] },
    { name: 'phone_shop_mlo', bytes: 6 * 1024 * 1024, files: 31, over: [] }
]

export const mockConflicts: Conflict[] = [
    {
        id: 'c_coll_1',
        akind: 'map',
        key: 'dup|sc1_13_0.ybn|citymaps_gasstation+citymaps_tunershop',
        isNew: true,
        cat: 'coll',
        sev: 'high',
        kind: 'dup-file',
        title: 'sc1_13_0.ybn',
        sub: 'citymaps_gasstation vs citymaps_tunershop',
        file: 'sc1_13_0.ybn',
        badges: ['2 scripts · 2 versions'],
        vanilla: true,
        pos: [186.6, -1500.2, 35.9],
        autoRes: null,
        resources: [
            { name: 'citymaps_gasstation', rel: 'stream/sc1_13_0.ybn', size: 431200, sha1: 'ab12cd34', status: 'overridden' },
            { name: 'citymaps_tunershop', rel: 'stream/sc1_13_0.ybn', size: 429988, sha1: 'ff00aa11', status: 'loads last · likely active' }
        ],
        entity: null,
        target: null,
        near: null,
        explain: {
            summary: '2 resources ship different versions of sc1_13_0.ybn. Collision files override by name, so only the script loaded last takes effect.',
            note: 'Mismatched collision versions are the classic cause of invisible walls.'
        },
        suggested: { action: 'disable', losers: [{ resource: 'citymaps_gasstation', rel: 'stream/sc1_13_0.ybn', sha1: 'ab12cd34' }] }
    },
    {
        id: 'c_occl_2',
        akind: 'map',
        key: 'dup|bh1_occl_05.ymap|freemode_hills+citymaps_townhall',
        cat: 'occl',
        sev: 'medium',
        kind: 'dup-file',
        title: 'bh1_occl_05.ymap',
        sub: 'citymaps_townhall vs freemode_hills',
        file: 'bh1_occl_05.ymap',
        badges: ['2 scripts · 2 versions'],
        vanilla: true,
        pos: [-598.1, -260.8, 56.2],
        autoRes: 'assets',
        resources: [
            { name: 'citymaps_townhall', rel: 'stream/bh1_occl_05.ymap', size: 8121, sha1: '11f2e3d4', status: 'overridden' },
            { name: 'freemode_hills', rel: 'stream/bh1_occl_05.ymap', size: 8121, sha1: '11f2e3d4', status: 'loads last · likely active' }
        ],
        entity: null,
        target: null,
        near: [
            { label: 'MODEL #6', dist: 32.1 },
            { label: 'MODEL #7', dist: 54.7 },
            { label: 'MODEL #10', dist: 65.5 }
        ],
        explain: {
            summary: '2 resources ship an identical copy of bh1_occl_05.ymap. Only one is needed, the rest waste memory and load time.',
            note: 'This file overrides a vanilla GTA map file.'
        },
        suggested: { action: 'disable', losers: [{ resource: 'citymaps_townhall', rel: 'stream/bh1_occl_05.ymap', sha1: '11f2e3d4' }] }
    },
    {
        id: 'c_occl_3',
        akind: 'map',
        key: 'occl|bh1_occl_05.ymap+lr_sc1_occl_00.ymap|citymaps_townhall+freemode_hills',
        cat: 'occl',
        sev: 'medium',
        kind: 'occl-overlap',
        title: 'box occluder overlap',
        sub: 'citymaps_townhall vs freemode_hills',
        file: 'bh1_occl_05.ymap + lr_sc1_occl_00.ymap',
        badges: ['overlapping occluders'],
        vanilla: false,
        pos: [-851.5, -348.75, 40.25],
        autoRes: null,
        resources: [
            { name: 'citymaps_townhall', rel: 'stream/bh1_occl_05.ymap', size: 0, sha1: '', status: 'occluder 1' },
            { name: 'freemode_hills', rel: 'stream/lr_sc1_occl_00.ymap', size: 0, sha1: '', status: 'occluder 2' },
            { name: 'downtown_offices', rel: 'stream/dt1_occl_02.ymap', size: 0, sha1: '', status: 'occluder 3' }
        ],
        entity: null,
        target: null,
        near: [],
        boxes: [
            { c: [-851.5, -348.75, 40.25], l: 5.5, w: 16.5, h: 7.75, cz: 0.891, sz: -0.454, bi: 0, resource: 'citymaps_townhall', rel: 'stream/bh1_occl_05.ymap', file: 'bh1_occl_05.ymap' },
            { c: [-847.5, -350.75, 40.25], l: 6, w: 16.5, h: 7.75, cz: 0.891, sz: -0.454, bi: 3, resource: 'freemode_hills', rel: 'stream/lr_sc1_occl_00.ymap', file: 'lr_sc1_occl_00.ymap' },
            { c: [-843.25, -352.5, 40.25], l: 4.75, w: 16.5, h: 7.75, cz: 0.891, sz: -0.454, bi: 7, resource: 'downtown_offices', rel: 'stream/dt1_occl_02.ymap', file: 'dt1_occl_02.ymap' }
        ],
        explain: {
            summary: 'Two box occluders from citymaps_townhall and freemode_hills overlap. Overlapping occluders can make geometry pop in and out or disappear.',
            note: 'Occluders hide whatever is behind them. Only one should cover a given volume.'
        },
        suggested: { action: 'keep', losers: [] }
    },
    ...Array.from({ length: 60 }, (_, i): Conflict => ({
        id: `c_prop_${i + 10}`,
        akind: (i % 3 === 0 ? 'vehicle' : i % 3 === 1 ? 'ped' : 'prop') as AssetKind,
        key: `mock-prop|${i}`,
        isNew: i < 4,
        ignored: i === 5 || i === 11,
        cat: 'prop',
        sev: 'cosmetic',
        kind: i % 3 === 0 ? 'entity-removed' : i % 3 === 1 ? 'entity-moved' : 'spatial-dup',
        title: ['prop_pot_plant_01d', 'prop_bollard_02a', 'sc1_23_bannercloth', 'prop_roofvent_01a', 'prop_aircon_s_01a'][i % 5],
        sub: 'prop_pack_downtown vs firedept_mlo',
        file: 'sc1_23.ymap',
        badges: [i % 3 === 0 ? '1 removed · 1 unchanged' : i % 3 === 1 ? 'moved 1.24m' : 'double placement'],
        vanilla: i % 4 === 0,
        pos: [178.95 + i * 3, -1732.69 + i * 2, 28.49],
        autoRes: i % 3 === 2 ? 'props' : null,
        resources: [
            { name: 'prop_pack_downtown', rel: 'stream/sc1_23.ymap', size: 40120, sha1: 'a1b2c3d4', status: i % 3 === 0 ? 'removed it' : 'moved it 1.24m' },
            { name: 'firedept_mlo', rel: 'stream/sc1_23.ymap', size: 41000, sha1: 'e5f6a7b8', status: 'ships it unchanged' }
        ],
        entity: {
            model: 1043035044 + i,
            name: ['prop_pot_plant_01d', 'prop_bollard_02a', 'sc1_23_bannercloth', 'prop_roofvent_01a', 'prop_aircon_s_01a'][i % 5],
            guid: 987654321 + i,
            pos: [178.95 + i * 3, -1732.69 + i * 2, 28.49],
            rot: [0, 0, 0, 1],
            radius: 0.5
        },
        target: i % 3 === 1 ? { pos: [180.2 + i * 3, -1731.4 + i * 2, 28.49], rot: [0, 0, 0.707, 0.707], model: 1043035044 + i } : null,
        near: null,
        explain: {
            summary: 'This object is part of vanilla GTA. Removed by prop_pack_downtown, still shipped by firedept_mlo.',
            note: 'Map files override by name, so only the script loaded last takes effect.'
        },
        suggested: { action: 'keep', losers: [] }
    })),
    ...Array.from({ length: 20 }, (_, i): Conflict => ({
        id: `c_asset_${i + 100}`,
        key: `mock-asset|${i}`,
        ignored: i === 2,
        cat: 'asset',
        sev: 'medium',
        kind: 'dup-file',
        title: ['ss1_12_night.ydr', 'dt1_rd1_r1_018.ydr', 'v_int_46.ytyp', 'hash_F92F100E.ydd', 'ss1_12_bld3c.ydr'][i % 5],
        sub: 'phone_shop_mlo vs phone_scripts',
        file: 'ss1_12_night.ydr',
        badges: ['2 scripts · 2 versions', ...(i % 4 === 0 ? ['FILES UNAVAILABLE'] : []), ...(i % 5 === 3 ? ['stale LOD'] : [])],
        vanilla: i % 3 === 0,
        pos: i % 2 === 0 ? [300 + i * 5, -900 - i * 4, 30] : null,
        autoRes: i % 2 === 0 ? 'assets' : null,
        resources: [
            { name: 'phone_shop_mlo', rel: 'stream/ss1_12_night.ydr', size: 220100, sha1: '99887766', status: 'overridden' },
            { name: 'phone_scripts', rel: 'stream/ss1_12_night.ydr', size: 220300, sha1: '55443322', status: 'loads last · likely active' }
        ],
        entity: null,
        target: null,
        near: null,
        explain: {
            summary: '2 resources ship different versions of this file. Only the last loaded one takes effect.',
            note: 'The copy loaded last is the one players get in game.'
        },
        suggested: { action: 'disable', losers: [{ resource: 'phone_shop_mlo', rel: 'stream/ss1_12_night.ydr', sha1: '99887766' }] }
    }))
]

export const mockScanMeta: ScanMeta = {
    scanId: 's_mock',
    scannedAt: new Date(Date.now() - 13 * 60000).toISOString(),
    durationMs: 8421,
    resourceCount: 312,
    modPackCount: 17,
    fileCount: 4211,
    counts: {
        all: mockConflicts.filter(c => !c.ignored).length,
        coll: mockConflicts.filter(c => c.cat === 'coll' && !c.ignored).length,
        occl: mockConflicts.filter(c => c.cat === 'occl' && !c.ignored).length,
        prop: mockConflicts.filter(c => c.cat === 'prop' && !c.ignored).length,
        asset: mockConflicts.filter(c => c.cat === 'asset' && !c.ignored).length
    },
    autoRes: mockConflicts.filter(c => c.autoRes).length,
    newCount: mockConflicts.filter(c => c.isNew && !c.ignored).length,
    ignoredCount: mockConflicts.filter(c => c.ignored).length,
    parseErrorCount: 3
}

export const mockState: ToolState = {
    scanMeta: mockScanMeta,
    decisions: { entities: 2, assetsPending: 1, assetsApplied: 0, entityFilePending: 1, updatedAt: new Date().toISOString() },
    backups: [
        {
            id: '2026-08-07T17-30-00',
            createdAt: '2026-08-07T17:30:00.000Z',
            summary: { removed: 422, moved: 91, assets: 38, files: 98 },
            files: 98,
            resources: ['job_garbage', 'job_lumberjack', 'phone_scripts'],
            restored: false,
            current: true
        },
        {
            id: '2026-08-05T17-41-00',
            createdAt: '2026-08-05T17:41:00.000Z',
            summary: { removed: 422, moved: 91, assets: 39, files: 98 },
            files: 98,
            resources: ['job_garbage', 'phone_scripts'],
            restored: false
        }
    ],
    scanning: false
}
