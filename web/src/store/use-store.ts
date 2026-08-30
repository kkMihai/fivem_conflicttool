import { create } from 'zustand'
import type { AssetKind, Backup, Category, Conflict, DecisionsMeta, HistoryEntry, ResourceWeight, ScanMeta, TransformState, VersionInfo } from '@/types'
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
    showHidden: boolean
    onlyNew: boolean
    hiddenExts: Record<string, true>
    hiddenKinds: Record<string, true>
    preview: 'a' | 'b' | null
    resourceFilter: string | null
    selectedId: string | null
    hoverModel: number | null
    hoverId: string | null
    picking: boolean
    history: HistoryEntry[]
    transform: TransformState | null
    movedTo: Record<string, { pos: [number, number, number]; rot: [number, number, number, number] }>
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
    noticeKind: 'warn' | 'success'
    setNotice: (msg: string | null, kind?: 'warn' | 'success') => void
    setTab: (t: Tab) => void
    setSearch: (s: string) => void
    setShowVanilla: (v: boolean) => void
    setShowIgnored: (v: boolean) => void
    setShowHidden: (v: boolean) => void
    setOnlyNew: (v: boolean) => void
    toggleExt: (ext: string) => void
    showAllExts: () => void
    toggleKind: (kind: AssetKind) => void
    showAllKinds: () => void
    toggleIgnore: (c: Conflict) => void
    clipOccluder: (c: Conflict, target: number) => void
    mergeOccluders: (c: Conflict) => void
    zeroOccluder: (c: Conflict, target: number) => void
    occlEdit: { id: string; target: number } | null
    occlEditLive: { l: number; w: number; h: number; face?: string | null } | null
    ctxMenu: { id: string; bx: number | null; x: number; y: number } | null
    gizmoSpace: 'local' | 'global'
    openCtxMenu: (d: { id: string; bx: number | null; x: number; y: number }) => void
    closeCtxMenu: () => void
    editOccluder: (c: Conflict, target: number) => Promise<void>
    occlEditApply: () => void
    occlEditCancel: () => void
    occlEditWholeBox: () => void
    toggleChecked: (id: string, shift?: boolean) => void
    clearChecked: () => void
    bulkIgnore: (on: boolean) => void
    bulkDecide: (action: 'keep' | 'remove') => void
    setPreview: (c: Conflict | null, which: 'a' | 'b' | null) => void
    setResourceFilter: (r: string | null) => void
    filtered: () => Conflict[]
    select: (id: string | null, teleport?: boolean) => void
    cycle: (dir: 1 | -1) => void
    decideEntity: (c: Conflict, action: 'keep' | 'remove' | 'move', extra?: any) => Promise<void>
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
    decisions: isEnvBrowser() ? mockState.decisions : { entities: 0, assetsPending: 0, assetsApplied: 0, entityFilePending: 0, updatedAt: null },
    backups: isEnvBrowser() ? mockState.backups : [],
    scanning: false,
    scanProgress: null,
    conflicts: isEnvBrowser() ? mockConflicts : [],
    resolved: {},
    notice: null,
    noticeKind: 'warn',
    tab: 'all',
    search: '',
    showVanilla: true,
    showIgnored: false,
    showHidden: false,
    onlyNew: false,
    hiddenExts: {},
    hiddenKinds: {},
    preview: null,
    resourceFilter: null,
    selectedId: null,
    hoverModel: null,
    hoverId: null,
    picking: true,
    history: [],
    transform: null,
    movedTo: {},
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
        set({ conflicts: c, resolved: {}, checked: {}, lastChecked: null, movedTo: {} })
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

    setShowHidden: v => {
        set({ showHidden: v })
        get().pushMarkers()
    },

    setOnlyNew: v => {
        set({ onlyNew: v })
        get().pushMarkers()
    },

    clipOccluder: (c, target) => {
        const boxes = c.boxes
        if (!boxes || boxes.length < 2) return
        fetchNui('clipOccluder', { conflictId: c.id, boxes, target })
    },

    mergeOccluders: c => {
        const boxes = c.boxes
        if (!boxes || boxes.length < 2) return
        fetchNui('mergeOccluders', { conflictId: c.id, boxes })
    },

    zeroOccluder: (c, target) => {
        const boxes = c.boxes
        if (!boxes || boxes.length < 2) return
        fetchNui('zeroOccluder', { conflictId: c.id, boxes, target })
    },

    occlEdit: null,
    occlEditLive: null,
    ctxMenu: null,
    gizmoSpace: 'global',

    openCtxMenu: d => set({ ctxMenu: d }),

    closeCtxMenu: () => set({ ctxMenu: null }),

    editOccluder: async (c, target) => {
        const boxes = c.boxes
        if (!boxes || !boxes[target] || get().occlEdit) return
        if (isEnvBrowser()) {
            set({ occlEdit: { id: c.id, target }, occlEditLive: null })
            return
        }
        const res = await fetchNui<{ ok: boolean; reason?: string }>('editOccluder', { conflictId: c.id, boxes, target })
        if (res?.ok) {
            set({ occlEdit: { id: c.id, target }, occlEditLive: null })
        } else if (res?.reason) {
            get().setNotice(res.reason)
        }
    },

    occlEditApply: () => {
        if (isEnvBrowser()) {
            set({ occlEdit: null, occlEditLive: null })
            return
        }
        fetchNui('occlEditApply')
    },

    occlEditCancel: () => {
        if (isEnvBrowser()) {
            set({ occlEdit: null, occlEditLive: null })
            return
        }
        fetchNui('occlEditCancel')
    },

    occlEditWholeBox: () => {
        if (isEnvBrowser()) {
            set(s => ({ occlEditLive: s.occlEditLive ? { ...s.occlEditLive, face: null } : null }))
            return
        }
        fetchNui('occlEditWholeBox')
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

    toggleKind: kind => {
        set(s => {
            const next = { ...s.hiddenKinds }
            if (next[kind]) delete next[kind]
            else next[kind] = true
            return { hiddenKinds: next }
        })
        get().pushMarkers()
    },

    showAllKinds: () => {
        set({ hiddenKinds: {} })
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
        void (async () => {
            for (const c of targets) await get().decideEntity(c, action)
        })()
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
        const { conflicts, tab, search, showVanilla, showIgnored, showHidden, onlyNew, resourceFilter, hiddenExts, hiddenKinds } = get()
        const q = search.trim().toLowerCase()
        return conflicts.filter(c => {
            if (hiddenExts[extOf(c.file)]) return false
            if (hiddenKinds[c.akind ?? 'other']) return false
            if (tab !== 'all' && c.cat !== tab) return false
            if (!showIgnored && c.ignored) return false
            if (!showHidden && c.hidden) return false
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
        set({ selectedId: id, preview: null, ctxMenu: null })
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
            const live = c.target ?? { pos: c.entity.pos, rot: c.entity.rot, model: c.entity.model }
            fetchNui('collisionBox', { on: true, model: live.model, pos: live.pos, quat: live.rot })
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

    decideEntity: async (c, action, extra) => {
        if (!c.entity) return
        if (get().transform && action !== 'move') {
            await get().endMove(false)
        }
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
        const entPos = c.entity.pos
        const entModel = c.entity.model
        const live = c.target ?? { pos: entPos, rot: c.entity.rot, model: entModel }
        const spots = c.target
            ? [
                  { model: c.target.model, pos: c.target.pos },
                  { model: entModel, pos: entPos }
              ]
            : [{ model: entModel, pos: entPos }]
        const targets = c.target
            ? [
                  c.resources[0]?.rel ? { resource: c.resources[0].name, rel: c.resources[0].rel, from: c.target.pos, model: c.target.model } : null,
                  c.resources[1]?.rel ? { resource: c.resources[1].name, rel: c.resources[1].rel, from: entPos, model: entModel } : null
              ].filter(Boolean)
            : c.resources.filter(r => r.rel).map(r => ({ resource: r.name, rel: r.rel, from: entPos, model: entModel }))
        fetchNui('decide', {
            type: 'entity',
            action,
            conflictId: c.id,
            archetype: c.entity.name,
            hash: live.model,
            guid: c.entity.guid,
            source: { resource: c.resources[1]?.name ?? c.resources[0]?.name, file: c.file },
            file: c.file,
            targets,
            spots,
            original: { pos: live.pos, rot: live.rot },
            new: extra?.new ?? null,
            hideRadius: c.entity.radius
        })
        set(s => ({
            resolved: { ...s.resolved, [c.id]: action === 'remove' ? 'removed · applied live' : 'moved · applied live' },
            movedTo: action === 'move' && extra?.new ? { ...s.movedTo, [c.id]: { pos: extra.new.pos, rot: extra.new.rot } } : s.movedTo
        }))
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
                group: c.id,
                file: c.file,
                loser: { resource: l.name, relPath: l.rel, sha1: l.fullSha1 ?? undefined },
                winner: winner ? { resource: winner.name, sha1: winner.fullSha1 } : null
            })
        }
        set(s => ({ resolved: { ...s.resolved, [c.id]: `queued · keep ${keeper} · applies on Resolve` } }))
        get().pushHistory({ id: c.id, label: c.file, action: `keep ${keeper}` })
    },

    setNotice: (msg, kind = 'warn') => {
        if (noticeTimer) clearTimeout(noticeTimer)
        set({ notice: msg, noticeKind: kind })
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
        const live = c.target ?? { pos: c.entity.pos, rot: c.entity.rot, model: c.entity.model }
        const moved = get().movedTo[c.id]
        const spots = c.target
            ? [
                  { model: c.target.model, pos: c.target.pos },
                  { model: c.entity.model, pos: c.entity.pos }
              ]
            : [{ model: c.entity.model, pos: c.entity.pos }]
        const res = await fetchNui<{ ok?: boolean; reason?: string; pos?: [number, number, number] }>('startTransform', {
            model: live.model,
            pos: live.pos,
            rot: moved?.rot ?? live.rot,
            radius: c.entity.radius,
            newPos: moved?.pos ?? null,
            spots
        })
        if (res && res.ok === false) {
            if (res.reason) get().setNotice(res.reason)
            return
        }
        set({
            transform: {
                conflictId: c.id,
                model: live.model,
                name: c.entity.name,
                pos: moved?.pos ?? res?.pos ?? live.pos,
                rot: [0, 0, 0],
                quat: moved?.rot ?? live.rot,
                mode: 'translate',
                grid: false
            }
        })
    },

    endMove: async commit => {
        const t = get().transform
        set({ transform: null })
        const result = await fetchNui<any>('endTransform', { commit })
        if (commit && t) {
            if (result && result.pos) {
                const c = get().conflicts.find(x => x.id === t.conflictId)
                if (c) {
                    get().decideEntity(c, 'move', { new: { pos: result.pos, rot: result.quat } })
                }
            } else {
                get().setNotice('The preview object was lost, so nothing was applied. Open Move and try again.')
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
        const shown = list.filter(c => c.pos && !(s.resolved[c.id] ?? '').startsWith('applied')).slice(0, 1500)
        const sel = s.selectedId
        if (sel && !shown.some(c => c.id === sel)) {
            const c = s.conflicts.find(x => x.id === sel && x.pos)
            if (c && !(s.resolved[c.id] ?? '').startsWith('applied')) shown.push(c)
        }
        markerIds = new Set(shown.map(c => c.id))
        const markers: { id: string; x: number; y: number; z: number; cat: Category; ci: number; bx?: number }[] = []
        for (const c of shown) {
            if (c.kind === 'occl-overlap' && c.boxes?.length) {
                c.boxes.forEach((b, bx) => {
                    if (b.l === 0 && b.w === 0 && b.h === 0) return
                    markers.push({ id: c.id, x: b.c[0], y: b.c[1], z: b.c[2], cat: c.cat, ci: catColorIdx(c), bx })
                })
                continue
            }
            markers.push({ id: c.id, x: c.pos![0], y: c.pos![1], z: c.pos![2], cat: c.cat, ci: catColorIdx(c) })
        }
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
            const movedTo = { ...s.movedTo }
            delete movedTo[first.id]
            let conflicts = s.conflicts
            if (first.boxes) {
                conflicts = conflicts.map(c => (c.id === first.id ? { ...c, boxes: first.boxes } : c))
                if (s.selectedId === first.id) {
                    fetchNui('occlBoxes', { boxes: first.boxes })
                }
            }
            return { history: rest, resolved, conflicts, movedTo }
        })
    }
}))
