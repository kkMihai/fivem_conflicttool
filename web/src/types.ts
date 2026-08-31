export type Category = 'asset' | 'prop' | 'occl' | 'coll'

export type AssetKind = 'vehicle' | 'ped' | 'weapon' | 'map' | 'prop' | 'other'

export interface ConflictResource {
    name: string
    rel: string
    size: number
    sha1: string
    fullSha1?: string
    status: string
}

export interface ConflictEntity {
    model: number
    name: string
    guid: number
    pos: [number, number, number]
    rot: [number, number, number, number]
    radius: number
}

export interface Conflict {
    id: string
    key: string
    ignored?: boolean
    hidden?: boolean
    isNew?: boolean
    cat: Category
    akind?: AssetKind
    sev: 'cosmetic' | 'medium' | 'high'
    kind: string
    title: string
    sub: string
    file: string
    badges: string[]
    vanilla: boolean
    pos: [number, number, number] | null
    autoRes: 'assets' | 'props' | null
    resources: ConflictResource[]
    entity: ConflictEntity | null
    target: { pos: [number, number, number]; rot: [number, number, number, number]; model: number } | null
    near: { label: string; dist: number }[] | null
    boxes?: OccluderBox[] | null
    explain: { summary: string; note: string }
    suggested: { action: string; losers: { resource: string; rel: string; sha1: string }[] }
}

export interface ScanMeta {
    scanId: string
    scannedAt: string
    durationMs: number
    resourceCount: number
    modPackCount: number
    fileCount: number
    counts: { all: number; coll: number; occl: number; prop: number; asset: number }
    autoRes: number
    newCount?: number
    ignoredCount?: number
    hiddenCount?: number
    parseErrorCount: number
}

export interface ResourceWeight {
    name: string
    bytes: number
    files: number
    over: { rel: string; size: number }[]
}

export interface ScanPayload {
    scanId: string
    scannedAt: string
    durationMs: number
    resourceCount: number
    modPackCount: number
    fileCount: number
    parseErrors: { resource: string; file: string; msg: string }[]
    conflicts: Conflict[]
    weights?: ResourceWeight[]
}

export interface DecisionsMeta {
    entities: number
    assetsPending: number
    entityFilePending?: number
    assetsApplied: number
    updatedAt: string | null
}

export interface Backup {
    id: string
    createdAt: string
    summary: { removed: number; moved: number; buried?: number; clipped?: number; collision?: number; filedMoves?: number; assets: number; files: number; errors?: number }
    files: number
    resources: string[]
    restored: boolean
    current?: boolean
}

export interface VersionInfo {
    current: string
    latest: string | null
    updateAvailable: boolean
    url: string
    checkedAt: number | null
    error: string | null
}

export interface CollisionMatSlot {
    slot: number
    type: number
    procId: number
    roomId: number
    pedDensity: number
    flags: number
    colorIndex: number
    unk4: number
    name: string
}

export interface CollisionBound {
    bi: number
    type: number
    tris: number
    faces: number
    bmin: [number, number, number]
    bmax: [number, number, number]
    m: number[] | null
    matSource: 'geom' | 'base'
    mats: CollisionMatSlot[]
}

export interface CollisionInspect {
    composite: boolean
    root: {
        type: number
        bmin: [number, number, number]
        bmax: [number, number, number]
        center: [number, number, number]
    }
    bounds: CollisionBound[]
}

export interface CollisionData {
    file: string
    resource: string
    rel: string
    inspect: CollisionInspect
}

export interface CollEditState {
    file: string
    bi: number | null
    whole: boolean
}

export interface CollEditLive {
    bi?: number
    whole?: boolean
    pos: [number, number, number]
    delta?: [number, number, number]
    yaw: number
}

export interface CollVerifyCopy {
    resource: string
    unique: number
    total: number
    tested: number
    matched: number
    pct?: number
}

export interface CollVerify {
    state: 'running' | 'done' | 'none' | 'far'
    file?: string
    copies?: CollVerifyCopy[]
}

export interface FaceSelState {
    bi: number
    count: number
    brush: number
    slot: number | null
    loading: boolean
    moving?: boolean
    offset?: [number, number, number]
    yaw?: number
}

export interface FaceDataInfo {
    bi: number
    total: number
    tris: number
    capped: boolean
    counts: { slot: number; count: number }[]
}

export interface OccluderBox {
    c: [number, number, number]
    l: number
    w: number
    h: number
    cz: number
    sz: number
    bi?: number
    resource?: string
    rel?: string
    file?: string
}

export interface ToolState {
    scanMeta: ScanMeta | null
    decisions: DecisionsMeta
    backups: Backup[]
    scanning: boolean
    queued?: { assets: string[]; entities: string[]; entityFiles?: string[] }
    version?: VersionInfo
}

export interface HistoryEntry {
    id: string
    label: string
    action: string
    at: number
    boxes?: OccluderBox[] | null
}

export interface TransformState {
    conflictId: string
    model: number
    name: string
    pos: [number, number, number]
    rot: [number, number, number]
    quat: [number, number, number, number]
    mode: 'translate' | 'rotate'
    grid: boolean
}
