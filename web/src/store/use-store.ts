import { create } from 'zustand'
import type { Backup, Category, Conflict, DecisionsMeta, HistoryEntry, ResourceWeight, ScanMeta, TransformState, VersionInfo } from '@/types'
import { fetchNui, isEnvBrowser } from '@/lib/nui'
import { extOf } from '@/lib/utils'
import { mockConflicts, mockState, mockWeights } from '@/lib/mock'

export type Tab = 'all' | Category

interface StoreState {
    visible: boolean
    version: VersionInfo | null
    scanMeta: ScanMeta | null
    decisions: DecisionsMeta
    backups: Backup[]
    scanning: boolean
    scanProgress: { phase: string; resource: string; current: number; total: number } | null
    conflicts: Conflict[]
    resolved: Record<string, string>
    notice: string | null
    tab: Tab
    search: string
    showVanilla: boolean
    showIgnored: boolean
    onlyNew: boolean
    hiddenExts: Record<string, true>
    preview: 'a' | 'b' | null
    resourceFilter: string | null
    selectedId: string | null
    hoverModel: number | null
    hoverId: string | null
    picking: boolean
    history: HistoryEntry[]
    transform: TransformState | null
    applyState: { open: boolean; step: number; total: number; label: string; done: boolean; result: any } | null
    backupsOpen: boolean
    scriptsOpen: boolean
    weightsOpen: boolean
    weights: ResourceWeight[]
    checked: Record<string, true>
    lastChecked: string | null
    collisionTris: number
    collViz: boolean
    uiHidden: boolean
    worldVisuals: boolean
    xray: boolean
    toggleWorldVisuals: () => void
    toggleXray: () => void
    toggleCollViz: () => void
    setVisible: (v: boolean) => void
    setConflicts: (c: Conflict[]) => void
    setNotice: (msg: string | null) => void
    setTab: (t: Tab) => void
    setSearch: (s: string) => void
    setShowVanilla: (v: boolean) => void
    setShowIgnored: (v: boolean) => void
    setOnlyNew: (v: boolean) => void
    toggleExt: (ext: string) => void
    showAllExts: () => void
    toggleIgnore: (c: Conflict) => void
    toggleChecked: (id: string, shift?: boolean) => void
    clearChecked: () => void
    bulkIgnore: (on: boolean) => void
    bulkDecide: (action: 'keep' | 'remove') => void
    setPreview: (c: Conflict | null, which: 'a' | 'b' | null) => void
    setResourceFilter: (r: string | null) => void
    filtered: () => Conflict[]
    select: (id: string | null, teleport?: boolean) => void
    cycle: (dir: 1 | -1) => void
    decideEntity: (c: Conflict, action: 'keep' | 'remove' | 'move', extra?: any) => void
    decideAsset: (c: Conflict, keepResource?: string) => void
    startMove: (c: Conflict) => Promise<void>
    endMove: (commit: boolean) => Promise<void>
    enterMode: (mode: 'review' | 'translate' | 'rotate') => Promise<void>
    pushMarkers: () => void
    pushHistory: (e: Omit<HistoryEntry, 'at'>) => void
    undo: () => void
}

const catColorIdx = (c: Conflict): number => (c.vanilla ? 2 : 0)

let markerIds = new Set<string>()
let noticeTimer: ReturnType<typeof setTimeout> | null = null

export const useStore = create<StoreState>((set, get) => ({
    visible: isEnvBrowser(),
    version: isEnvBrowser()
        ? { current: __APP_VERSION__, latest: '9.9.9', updateAvailable: true, url: 'https://github.com/kkMihai/fivem_conflicttool/releases/latest', checkedAt: Date.now(), error: null }
        : null,
    scanMeta: isEnvBrowser() ? mockState.scanMeta : null,
    decisions: isEnvBrowser() ? mockState.decisions : { entities: 0, assetsPending: 0, assetsApplied: 0, updatedAt: null },
    backups: isEnvBrowser() ? mockState.backups : [],
    scanning: false,
    scanProgress: null,
    conflicts: isEnvBrowser() ? mockConflicts : [],
    resolved: {},
    notice: null,
    tab: 'all',
    search: '',
    showVanilla: true,
    showIgnored: false,
    onlyNew: false,
    hiddenExts: {},
    preview: null,
    resourceFilter: null,
    selectedId: null,
    hoverModel: null,
    hoverId: null,
    picking: true,
    history: [],
    transform: null,
    applyState: null,
    backupsOpen: false,
    scriptsOpen: false,
    weightsOpen: false,
    weights: isEnvBrowser() ? mockWeights : [],
    checked: {},
    lastChecked: null,
    collisionTris: 0,
    collViz: false,
    uiHidden: false,
    worldVisuals: true,
    xray: false,

    toggleWorldVisuals: () => {
        const on = !get().worldVisuals
        set({ worldVisuals: on })
        fetchNui('worldVisuals', { show: on })
    },

    toggleXray: () => {
        const on = !get().xray
        set({ xray: on })
        fetchNui('worldVisuals', { xray: on })
    },

    toggleCollViz: () => {
        const on = !get().collViz
        set({ collViz: on })
        fetchNui('collisionAll', { on })
        if (on) set({ tab: 'coll' })
        get().pushMarkers()
    },

    setVisible: v => set({ visible: v }),

    setConflicts: c => {
        set({ conflicts: c, resolved: {}, checked: {}, lastChecked: null })
        get().pushMarkers()
    },

    setTab: t => {
        set({ tab: t })
        get().pushMarkers()
    },

    setSearch: s => {
        set({ search: s })
        get().pushMarkers()
    },

    setShowVanilla: v => {
        set({ showVanilla: v })
        get().pushMarkers()
    },

    setShowIgnored: v => {
        set({ showIgnored: v })
        get().pushMarkers()
    },

    setOnlyNew: v => {
        set({ onlyNew: v })
        get().pushMarkers()
    },

    toggleExt: ext => {
        set(s => {
            const next = { ...s.hiddenExts }
            if (next[ext]) delete next[ext]
            else next[ext] = true
            return { hiddenExts: next }
        })
        get().pushMarkers()
    },

    showAllExts: () => {
        set({ hiddenExts: {} })
        get().pushMarkers()
    },

    toggleIgnore: c => {
        const on = !c.ignored
        fetchNui('ignoreConflict', { key: c.key, on, title: c.title, cat: c.cat })
        set(s => ({ conflicts: s.conflicts.map(x => (x.key === c.key ? { ...x, ignored: on } : x)) }))
        if (on && get().selectedId === c.id && !get().showIgnored) get().select(null)
        get().pushMarkers()
    },

    toggleChecked: (id, shift = false) => {
        const s = get()
        const checked = { ...s.checked }
        if (shift && s.lastChecked && s.lastChecked !== id) {
            const list = s.filtered()
            const a = list.findIndex(c => c.id === s.lastChecked)
            const b = list.findIndex(c => c.id === id)
            if (a !== -1 && b !== -1) {
                for (let i = Math.min(a, b); i <= Math.max(a, b); i++) checked[list[i].id] = true
                set({ checked, lastChecked: id })
                return
            }
        }
        if (checked[id]) delete checked[id]
        else checked[id] = true
        set({ checked, lastChecked: id })
    },

    clearChecked: () => set({ checked: {}, lastChecked: null }),

    bulkIgnore: on => {
        const s = get()
        const targets = s.conflicts.filter(c => s.checked[c.id])
        if (!targets.length) return
        fetchNui('ignoreConflict', { on, items: targets.map(c => ({ key: c.key, title: c.title, cat: c.cat })) })
        const keys = new Set(targets.map(c => c.key))
        set({
            conflicts: s.conflicts.map(x => (keys.has(x.key) ? { ...x, ignored: on } : x)),
            checked: {},
            lastChecked: null
        })
        const sel = get().selectedId
        if (on && sel && targets.some(c => c.id === sel) && !get().showIgnored) get().select(null)
        get().pushMarkers()
    },

    bulkDecide: action => {
        const s = get()
        const targets = s.conflicts.filter(c => s.checked[c.id] && c.entity && !s.resolved[c.id])
        for (const c of targets) get().decideEntity(c, action)
        set({ checked: {}, lastChecked: null })
    },

    setPreview: (c, which) => {
        set({ preview: which })
        if (!c || !which || which === 'a' || !c.entity) {
            fetchNui('previewEntity', { op: 'reset' })
            return
        }
        let hide: { model: number; pos: number[]; radius: number } | null = null
        let ghost: { model: number; pos: number[]; rot: number[] } | null = null
        if (c.kind === 'spatial-dup') {
            hide = { model: c.entity.model, pos: c.entity.pos, radius: c.entity.radius }
        } else if (c.target) {
            hide = { model: c.target.model, pos: c.target.pos, radius: c.entity.radius }
            ghost = { model: c.entity.model, pos: c.entity.pos, rot: c.entity.rot }
        } else {
            ghost = { model: c.entity.model, pos: c.entity.pos, rot: c.entity.rot }
        }
        fetchNui('previewEntity', { op: 'swap', hide, ghost })
    },

    setResourceFilter: r => {
        set({ resourceFilter: r })
        get().pushMarkers()
    },

    filtered: () => {
        const { conflicts, tab, search, showVanilla, showIgnored, onlyNew, resourceFilter, hiddenExts } = get()
        const q = search.trim().toLowerCase()
        return conflicts.filter(c => {
            if (hiddenExts[extOf(c.file)]) return false
            if (tab !== 'all' && c.cat !== tab) return false
            if (!showIgnored && c.ignored) return false
            if (onlyNew && !c.isNew) return false
            if (!showVanilla && c.vanilla) return false
            if (resourceFilter && !c.resources.some(r => r.name === resourceFilter)) return false
            if (q && !c.title.toLowerCase().includes(q) && !c.sub.toLowerCase().includes(q) && !c.file.toLowerCase().includes(q)) return false
            return true
        })
    },

    select: (id, teleport = true) => {
        if (get().preview) {
            fetchNui('previewEntity', { op: 'reset' })
        }
        set({ selectedId: id, preview: null })
        if (!id) {
            fetchNui('selectConflict', { id: null })
            fetchNui('collisionBox', { on: false })
            fetchNui('occlBoxes', { boxes: null })
            fetchNui('clearCollision')
            return
        }
        const list = get().filtered()
        const idx = list.findIndex(c => c.id === id)
        const c = get().conflicts.find(x => x.id === id)
        if (!c) return
        if (c.pos && !markerIds.has(id)) get().pushMarkers()
        const label = `[${idx + 1}/${list.length}] ${c.title} · ${c.sev.toUpperCase()} · ${c.cat.toUpperCase()}`
        fetchNui('selectConflict', { id, index: idx + 1, label, pos: c.pos, teleport: teleport && !!c.pos })
        fetchNui('clearCollision')
        if (c.cat === 'coll') {
            fetchNui('requestCollisionGeom', { file: c.file, resource: c.resources[c.resources.length - 1]?.name })
        } else {
            set({ collisionTris: 0 })
        }
        fetchNui('occlBoxes', { boxes: c.boxes ?? null })
        if (c.entity) {
            fetchNui('collisionBox', { on: true, model: c.entity.model, pos: c.entity.pos, quat: c.entity.rot })
        } else {
            fetchNui('collisionBox', { on: false })
        }
    },

    cycle: dir => {
        const list = get().filtered()
        if (!list.length) return
        const cur = list.findIndex(c => c.id === get().selectedId)
        const next = list[(cur + dir + list.length) % list.length]
        get().select(next.id)
    },

    decideEntity: (c, action, extra) => {
        if (!c.entity) return
        if (get().preview) {
            fetchNui('previewEntity', { op: 'reset' })
            set({ preview: null })
        }
        if (action === 'keep') {
            fetchNui('decide', { type: 'entity', action: 'keep', conflictId: c.id, hash: c.entity.model, original: { pos: c.entity.pos, rot: c.entity.rot } })
            set(s => ({ resolved: { ...s.resolved, [c.id]: 'kept as is' } }))
            get().pushHistory({ id: c.id, label: c.title, action: 'keep' })
            return
        }
        fetchNui('decide', {
            type: 'entity',
            action,
            conflictId: c.id,
            archetype: c.entity.name,
            hash: c.entity.model,
            guid: c.entity.guid,
            source: { resource: c.resources[1]?.name ?? c.resources[0]?.name, file: c.file },
            original: { pos: c.entity.pos, rot: c.entity.rot },
            new: extra?.new ?? null,
            hideRadius: c.entity.radius
        })
        set(s => ({ resolved: { ...s.resolved, [c.id]: action === 'remove' ? 'removed · applied live' : 'moved · applied live' } }))
        get().pushHistory({ id: c.id, label: c.title, action })
    },

    decideAsset: (c, keepResource) => {
        const keeper = keepResource ?? c.resources[c.resources.length - 1]?.name
        const winner = c.resources.find(r => r.name === keeper)
        const losers = c.resources.filter(r => r.name !== keeper)
        for (const l of losers) {
            fetchNui('decide', {
                type: 'asset',
                conflictId: c.id,
                file: c.file,
                loser: { resource: l.name, relPath: l.rel, sha1: l.fullSha1 ?? undefined },
                winner: winner ? { resource: winner.name, sha1: winner.fullSha1 } : null
            })
        }
        set(s => ({ resolved: { ...s.resolved, [c.id]: `queued · keep ${keeper} · applies on Resolve` } }))
        get().pushHistory({ id: c.id, label: c.file, action: `keep ${keeper}` })
    },

    setNotice: msg => {
        if (noticeTimer) clearTimeout(noticeTimer)
        set({ notice: msg })
        if (msg) {
            noticeTimer = setTimeout(() => set({ notice: null }), 7000)
        }
    },

    startMove: async c => {
        if (!c.entity) return
        if (get().preview) {
            fetchNui('previewEntity', { op: 'reset' })
            set({ preview: null })
        }
        const res = await fetchNui<{ ok?: boolean; reason?: string }>('startTransform', {
            model: c.entity.model,
            pos: c.entity.pos,
            rot: c.entity.rot,
            radius: c.entity.radius,
            newPos: c.target?.pos ?? null
        })
        if (res && res.ok === false) {
            if (res.reason) get().setNotice(res.reason)
            return
        }
        set({
            transform: {
                conflictId: c.id,
                model: c.entity.model,
                name: c.entity.name,
                pos: c.entity.pos,
                rot: [0, 0, 0],
                quat: c.entity.rot,
                mode: 'translate',
                grid: false
            }
        })
    },

    endMove: async commit => {
        const t = get().transform
        set({ transform: null })
        const result = await fetchNui<any>('endTransform', { commit })
        if (commit && t && result && result.pos) {
            const c = get().conflicts.find(x => x.id === t.conflictId)
            if (c) {
                get().decideEntity(c, 'move', { new: { pos: result.pos, rot: result.quat } })
            }
        }
    },

    enterMode: async mode => {
        const s = get()
        if (mode === 'review') {
            if (s.transform) await s.endMove(false)
            return
        }
        if (s.transform) {
            set({ transform: { ...s.transform, mode } })
            fetchNui('setGizmoMode', { mode })
            return
        }
        const c = s.conflicts.find(x => x.id === s.selectedId)
        if (!c || !c.entity) return
        await s.startMove(c)
        const t = get().transform
        if (t) {
            set({ transform: { ...t, mode } })
            fetchNui('setGizmoMode', { mode })
        }
    },

    pushMarkers: () => {
        const s = get()
        const list = s.filtered()
        const shown = list.filter(c => c.pos).slice(0, 1500)
        const sel = s.selectedId
        if (sel && !shown.some(c => c.id === sel)) {
            const c = s.conflicts.find(x => x.id === sel && x.pos)
            if (c) shown.push(c)
        }
        markerIds = new Set(shown.map(c => c.id))
        const markers = shown.map(c => ({ id: c.id, x: c.pos![0], y: c.pos![1], z: c.pos![2], cat: c.cat, ci: catColorIdx(c) }))
        fetchNui('setMarkers', { markers, total: list.length })
    },

    pushHistory: e => set(s => ({ history: [{ ...e, at: Date.now() }, ...s.history].slice(0, 50) })),

    undo: () => {
        fetchNui('undo')
        set(s => {
            const [first, ...rest] = s.history
            if (!first) return {}
            const resolved = { ...s.resolved }
            delete resolved[first.id]
            return { history: rest, resolved }
        })
    }
}))
