import { useEffect, useRef } from 'react'
import { Dock } from '@/components/conflicts/dock'
import { ConflictDetail } from '@/components/conflicts/conflict-detail'
import { TransformPanel } from '@/components/overlay/transform-panel'
import { Toolbar } from '@/components/overlay/toolbar'
import { BackupsDialog } from '@/components/dialogs/backups-dialog'
import { WeightsDialog } from '@/components/dialogs/weights-dialog'
import { ApplyModal } from '@/components/dialogs/apply-modal'
import { ScanProgress } from '@/components/overlay/scan-progress'
import { Legend } from '@/components/overlay/legend'
import { ContextMenu } from '@/components/overlay/context-menu'
import { Kbd } from '@/components/ui/kbd'
import { decodeChunks, fetchNui, isEnvBrowser, useNuiEvent } from '@/lib/nui'
import { useStore } from '@/store/use-store'
import type { Conflict, ScanPayload, ToolState, VersionInfo } from '@/types'
import { CheckCircle, CursorClick, Warning } from '@phosphor-icons/react'

export default function App() {
    const visible = useStore(s => s.visible)
    const transform = useStore(s => s.transform)
    const notice = useStore(s => s.notice)
    const noticeKind = useStore(s => s.noticeKind)
    const hoverModel = useStore(s => s.hoverModel)
    const scanning = useStore(s => s.scanning)
    const conflicts = useStore(s => s.conflicts)
    const uiHidden = useStore(s => s.uiHidden)
    const hoverId = useStore(s => s.hoverId)
    const occlEdit = useStore(s => s.occlEdit)
    const gizmoSpace = useStore(s => s.gizmoSpace)
    const hoverName =
        (hoverModel !== null ? conflicts.find(c => c.entity && c.entity.model === hoverModel)?.entity?.name : null) ??
        (hoverId ? conflicts.find(c => c.id === hoverId)?.title ?? null : null)
    const chunks = useRef<{ parts: string[]; received: number; total: number }>({ parts: [], received: 0, total: 0 })

    useEffect(() => {
        fetchNui('uiReady')
    }, [])

    useEffect(() => {
        if (isEnvBrowser()) return
        const isField = (el: EventTarget | null) =>
            el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
        const onFocusIn = (e: FocusEvent) => {
            if (isField(e.target)) fetchNui('typing', { on: true })
        }
        const onFocusOut = (e: FocusEvent) => {
            if (isField(e.target)) fetchNui('typing', { on: false })
        }
        document.addEventListener('focusin', onFocusIn)
        document.addEventListener('focusout', onFocusOut)
        return () => {
            document.removeEventListener('focusin', onFocusIn)
            document.removeEventListener('focusout', onFocusOut)
        }
    }, [])

    useEffect(() => {
        if (isEnvBrowser()) return
        let last = ''
        const send = () => {
            const w = window.innerWidth || 1
            const h = window.innerHeight || 1
            let rects: number[][]
            if (document.querySelector('[role="dialog"],[role="menu"],[role="listbox"]')) {
                rects = [[0, 0, 1, 1]]
            } else {
                rects = Array.from(document.querySelectorAll('[data-panel]'))
                    .map(el => el.getBoundingClientRect())
                    .filter(r => r.width > 1 && r.height > 1)
                    .map(r => [r.left / w, r.top / h, r.right / w, r.bottom / h])
            }
            const key = JSON.stringify(rects)
            if (key === last) return
            last = key
            fetchNui('uiRects', { rects, w, h })
        }
        send()
        const id = window.setInterval(send, 200)
        window.addEventListener('resize', send)
        return () => {
            window.clearInterval(id)
            window.removeEventListener('resize', send)
        }
    }, [])

    useNuiEvent<boolean>('setVisible', v => {
        useStore.setState({ visible: v })
        if (!v) useStore.setState({ transform: null, applyState: null, backupsOpen: false })
    })

    useNuiEvent<ToolState>('state', d => {
        const prev = useStore.getState().resolved
        let resolved = prev
        if (d.queued) {
            resolved = { ...prev }
            const queuedSet = new Set([...d.queued.assets, ...d.queued.entities])
            for (const id of d.queued.assets) {
                if (!resolved[id] || resolved[id].endsWith('applied live')) resolved[id] = 'queued · needs Resolve + restart'
            }
            for (const id of d.queued.entities) {
                if (!resolved[id]) resolved[id] = 'applied live'
            }
            for (const id of Object.keys(resolved)) {
                if (resolved[id].startsWith('queued') && !queuedSet.has(id)) delete resolved[id]
            }
        }
        useStore.setState({
            scanMeta: d.scanMeta ?? useStore.getState().scanMeta,
            decisions: d.decisions,
            backups: d.backups,
            scanning: d.scanning,
            version: d.version ?? useStore.getState().version,
            resolved
        })
    })

    useNuiEvent<string[]>('autoResolved', ids => {
        const resolved = { ...useStore.getState().resolved }
        for (const id of ids) {
            if (!resolved[id]) resolved[id] = 'queued · auto · applies on Resolve'
        }
        useStore.setState({ resolved })
    })

    useNuiEvent<VersionInfo>('version', v => useStore.setState({ version: v }))

    useNuiEvent<{ phase: string; resource: string; current: number; total: number }>('scanProgress', p => {
        useStore.setState({ scanning: true, scanProgress: p })
    })

    useNuiEvent<{ tid: string; parts: number }>('scanReady', async d => {
        if (chunks.current.total === -1) return
        chunks.current = { parts: [], received: 0, total: -1 }
        try {
            const parts: string[] = []
            for (let i = 0; i < d.parts; i++) {
                const p = await fetchNui<string>('getScanPart', { i })
                parts.push(typeof p === 'string' ? p : '')
            }
            const payload = (await decodeChunks(parts)) as ScanPayload
            useStore.getState().setConflicts(payload.conflicts)
            useStore.setState({ weights: payload.weights ?? [] })
        } catch (e) {
            console.error('scan payload decode failed', e)
        } finally {
            chunks.current = { parts: [], received: 0, total: 0 }
        }
    })

    useNuiEvent<any>('scanDone', meta => {
        useStore.setState({ scanning: false, scanProgress: null, scanMeta: meta })
    })

    useNuiEvent<any>('scanError', () => useStore.setState({ scanning: false, scanProgress: null }))

    useNuiEvent<{ id?: string; model?: number; hit?: number[] }>('worldSelect', d => {
        const s = useStore.getState()
        if (d.id) {
            s.select(d.id, false)
            return
        }
        if (!d.model) return
        const candidates = s.conflicts.filter(c => c.entity?.model === d.model || c.target?.model === d.model)
        if (!candidates.length) return
        let best = candidates[0]
        if (d.hit && candidates.length > 1) {
            let bestDist = Infinity
            for (const c of candidates) {
                if (!c.pos) continue
                const dx = c.pos[0] - d.hit[0]
                const dy = c.pos[1] - d.hit[1]
                const dz = c.pos[2] - d.hit[2]
                const dist = dx * dx + dy * dy + dz * dz
                if (dist < bestDist) {
                    bestDist = dist
                    best = c
                }
            }
        }
        s.select(best.id, false)
    })

    useNuiEvent<{ id: string; bx?: number; x: number; y: number }>('worldContext', d => {
        const s = useStore.getState()
        if (s.selectedId !== d.id) s.select(d.id, false)
        s.openCtxMenu({ id: d.id, bx: d.bx ?? null, x: d.x, y: d.y })
    })

    useNuiEvent('closeContext', () => useStore.getState().closeCtxMenu())

    useNuiEvent<{ model?: number; id?: string } | null>('hoverInfo', d =>
        useStore.setState({ hoverModel: d?.model ?? null, hoverId: d?.id ?? null })
    )

    useNuiEvent<{ pos: number[]; rot: number[]; quat: number[] }>('gizmoTransform', d => {
        const t = useStore.getState().transform
        if (t) {
            useStore.setState({
                transform: {
                    ...t,
                    pos: d.pos as [number, number, number],
                    rot: d.rot as [number, number, number],
                    quat: d.quat as [number, number, number, number]
                }
            })
        }
    })

    useNuiEvent('gizmoLost', () => useStore.setState({ transform: null }))

    useNuiEvent<string>('notice', msg => useStore.getState().setNotice(msg))

    useNuiEvent<{ conflictId: string | null; boxes: NonNullable<Conflict['boxes']> }>('occlPreview', d => {
        if (!d?.conflictId || !d.boxes) return
        const s = useStore.getState()
        const target = s.conflicts.find(c => c.id === d.conflictId)
        if (!target) return
        s.pushHistory({ id: target.id, label: target.title, action: 'occluder edit', boxes: target.boxes ?? null })
        useStore.setState({
            conflicts: s.conflicts.map(c => (c.id === d.conflictId ? { ...c, boxes: d.boxes } : c))
        })
        if (s.selectedId === d.conflictId) {
            fetchNui('occlBoxes', { boxes: d.boxes })
        }
    })

    useNuiEvent<{ l: number; w: number; h: number; face?: string | null }>('occlEditLive', d => {
        if (useStore.getState().occlEdit) useStore.setState({ occlEditLive: d })
    })

    useNuiEvent('occlEditDone', () => useStore.setState({ occlEdit: null, occlEditLive: null }))

    useNuiEvent<'local' | 'global'>('gizmoSpace', space => useStore.setState({ gizmoSpace: space }))

    useNuiEvent<'translate' | 'rotate' | 'scale'>('gizmoMode', mode => {
        const t = useStore.getState().transform
        if (t && mode !== 'scale') useStore.setState({ transform: { ...t, mode } })
    })

    useNuiEvent<{ key: string; value?: any }>('keybind', d => {
        const s = useStore.getState()
        const c = s.conflicts.find(x => x.id === s.selectedId)
        if (d.key === 'hideui') useStore.setState({ uiHidden: !s.uiHidden })
        else if (d.key === 'tab') s.cycle(1)
        else if (d.key === 'keep' && c) s.decideEntity(c, 'keep')
        else if (d.key === 'remove' && c && c.entity) s.decideEntity(c, 'remove')
        else if (d.key === 'undo') s.undo()
        else if (d.key === 'mode') s.enterMode(d.value)
        else if (d.key === 'grid' && s.transform) useStore.setState({ transform: { ...s.transform, grid: !!d.value } })
        else if (d.key === 'commit' && s.transform) s.endMove(true)
    })

    useNuiEvent<{ step: number; total: number; label: string }>('applyProgress', p => {
        const a = useStore.getState().applyState
        useStore.setState({ applyState: { ...(a ?? { open: true, done: false, result: null }), open: true, done: false, result: null, ...p } })
    })

    useNuiEvent<any>('applyDone', result => {
        const s = useStore.getState()
        const a = s.applyState
        useStore.setState({ applyState: { ...(a ?? { step: 0, total: 0, label: '' }), open: true, done: true, result, step: 0, total: 0, label: '' } })
        const ids: string[] = result?.conflictIds ?? []
        if (!ids.length) return
        const done = new Set(ids)
        const resolved = { ...s.resolved }
        const points: number[][] = []
        for (const c of s.conflicts) {
            if (!done.has(c.id)) continue
            resolved[c.id] = 'applied · fixed on disk'
            if (c.pos) points.push(c.pos)
        }
        useStore.setState({ resolved })
        useStore.getState().pushMarkers()
        if (points.length) fetchNui('resolvedPulse', { points })
        const n = result?.summary?.files ?? ids.length
        useStore.getState().setNotice(
            `Resolved ${ids.length} conflict${ids.length === 1 ? '' : 's'} across ${n} file${n === 1 ? '' : 's'}. Their markers are cleared.`,
            'success'
        )
    })

    useNuiEvent<any>('backups', list => useStore.setState({ backups: list }))

    useNuiEvent<any>('decisionsMeta', meta => useStore.setState({ decisions: meta }))

    useNuiEvent<{ count: number }>('collisionGeom', d => useStore.setState({ collisionTris: d.count }))

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!useStore.getState().visible) return
            const target = e.target as HTMLElement | null
            const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
            const inDialog = !!target?.closest?.('[role="dialog"]')
            const onControl = !!target && target !== document.body && target !== document.documentElement
            if (e.key === 'Escape') {
                if (useStore.getState().ctxMenu) {
                    useStore.getState().closeCtxMenu()
                } else if (useStore.getState().occlEdit) {
                    useStore.getState().occlEditCancel()
                } else if (useStore.getState().transform) {
                    useStore.getState().endMove(false)
                } else {
                    fetchNui('close')
                    if (isEnvBrowser()) useStore.setState({ visible: true })
                }
            } else if (e.key === 'Tab') {
                if (typing || inDialog || onControl) return
                e.preventDefault()
                useStore.getState().cycle(e.shiftKey ? -1 : 1)
            } else if (e.key.toLowerCase() === 'z' && e.ctrlKey) {
                if (typing) return
                e.preventDefault()
                useStore.getState().undo()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    if (!visible) return null

    if (uiHidden) {
        return (
            <div className="pointer-events-none fixed inset-0 flex items-end justify-center p-3 font-sans">
                <div className="chip-glass flex items-center gap-2 rounded-lg px-3 py-1.5 text-3xs text-muted-foreground" role="status">
                    <Kbd>H</Kbd>
                    <span>show UI</span>
                </div>
            </div>
        )
    }

    return (
        <div className="pointer-events-none fixed inset-0 flex gap-2 p-3 font-sans">
            {transform && (
                <div
                    data-worldlayer=""
                    className="pointer-events-auto absolute inset-0"
                    onMouseDown={() => {
                        const el = document.activeElement
                        if (el instanceof HTMLElement) el.blur()
                    }}
                />
            )}
            <div className="relative min-w-0 flex-1">
                <div className="absolute left-0 top-0 flex items-center gap-1.5">
                    <Legend />
                </div>
                {scanning && (
                    <div className="absolute left-1/2 top-10 -translate-x-1/2">
                        <ScanProgress />
                    </div>
                )}
                {(hoverModel !== null || hoverId) && !transform && (
                    <div className="chip-glass pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 rounded-md px-2 py-1 text-2xs">
                        <span className="flex items-center gap-1.5">
                            <CursorClick className="h-3 w-3 text-primary" aria-hidden="true" />
                            click = select {hoverName ?? 'nearest conflict'}
                        </span>
                    </div>
                )}
                {notice && (
                    <div className="absolute bottom-24 left-1/2 w-max max-w-notice -translate-x-1/2">
                        <div className="panel flex items-start gap-2 rounded-lg px-3 py-2 text-2xs" role="status">
                            {noticeKind === 'success' ? (
                                <CheckCircle className="mt-px h-3.5 w-3.5 shrink-0 text-cat-vanilla" aria-hidden="true" />
                            ) : (
                                <Warning className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
                            )}
                            <span>{notice}</span>
                        </div>
                    </div>
                )}
                <div className="absolute bottom-1 left-1/2 w-max max-w-full -translate-x-1/2">
                    {transform ? (
                        <div className="flex flex-col items-center gap-1.5">
                            <div className="chip-glass pointer-events-none flex items-center gap-2.5 rounded-lg px-2.5 py-1 text-3xs text-muted-foreground" role="note">
                                <span className="flex items-center gap-1.5">
                                    <Kbd>RMB</Kbd>
                                    <span>hold to look</span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Kbd>WASD</Kbd>
                                    <span>fly</span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Kbd>LMB</Kbd>
                                    <span>drag gizmo</span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Kbd>Enter</Kbd>
                                    <span>apply</span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Kbd>Esc</Kbd>
                                    <span>cancel</span>
                                </span>
                            </div>
                            <div className="pointer-events-auto">
                                <TransformPanel />
                            </div>
                        </div>
                    ) : occlEdit ? (
                        <div className="chip-glass pointer-events-none flex items-center gap-2.5 rounded-lg px-2.5 py-1 text-3xs text-muted-foreground" role="note">
                            <span className="flex items-center gap-1.5">
                                <Kbd>LMB</Kbd>
                                <span>drag gizmo</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Kbd>2</Kbd>
                                <span>move</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Kbd>3</Kbd>
                                <span>rotate</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Kbd>4</Kbd>
                                <span>resize</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Kbd>RMB</Kbd>
                                <span>tap a face to extrude</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Kbd>X</Kbd>
                                <span>{gizmoSpace} axes</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Kbd>Enter</Kbd>
                                <span>apply</span>
                            </span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-1.5">
                            <div className="chip-glass pointer-events-none flex items-center gap-2.5 rounded-lg px-2.5 py-1 text-3xs text-muted-foreground" role="note">
                                <span className="flex items-center gap-1.5">
                                    <Kbd>RMB</Kbd>
                                    <span>hold to look</span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Kbd>WASD</Kbd>
                                    <span>fly</span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Kbd>LMB</Kbd>
                                    <span>select in world</span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Kbd>RMB</Kbd>
                                    <span>tap for actions</span>
                                </span>
                            </div>
                            <Toolbar />
                        </div>
                    )}
                </div>
            </div>
            <ContextMenu />
            <ConflictDetail />
            <Dock />
            <BackupsDialog />
            <WeightsDialog />
            <ApplyModal />
        </div>
    )
}

