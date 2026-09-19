import { useEffect, useRef, useState } from 'react'
import { ArrowsOutCardinal, Crosshair, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchNui, isEnvBrowser, useNuiEvent } from '@/lib/nui'
import { useStore } from '@/store/use-store'
import type { Conflict, YmapEntitiesData, YmapEntity } from '@/types'

export function YmapEditor({ c }: { c: Conflict }) {
    const resource = c.resources[0]?.name
    const rel = c.resources[0]?.rel
    const focusIndex = useStore(s => s.ymapPickIndex)
    const setNotice = useStore(s => s.setNotice)
    const transform = useStore(s => s.transform)
    const [query, setQuery] = useState('')
    const [offset, setOffset] = useState(0)
    const [loading, setLoading] = useState(true)
    const [preparing, setPreparing] = useState(false)
    const [data, setData] = useState<YmapEntitiesData | null>(null)
    const [selected, setSelected] = useState<YmapEntity | null>(null)
    const requestId = useRef(0)
    const previewRequestId = useRef(0)

    useEffect(() => {
        setQuery('')
        setOffset(0)
        setData(null)
        setSelected(null)
        setPreparing(false)
        previewRequestId.current++
    }, [resource, rel])

    useEffect(() => {
        if (!resource || !rel || isEnvBrowser()) return
        const id = ++requestId.current
        setLoading(true)
        const timer = window.setTimeout(() => fetchNui('ymapEntities', { resource, rel, query, offset, focusIndex, requestId: id }), 180)
        return () => window.clearTimeout(timer)
    }, [resource, rel, query, offset, focusIndex])

    useNuiEvent<YmapEntitiesData>('ymapEntitiesData', result => {
        if (!result || result.requestId !== requestId.current || result.resource !== resource || result.rel !== rel) return
        setLoading(false)
        setData(result)
        if (result.error) setNotice(result.error)
        if (focusIndex !== null && result.focused) setSelected(result.focused)
    })

    useNuiEvent<{ requestId: number; resource: string; rel: string; entities?: Pick<YmapEntity, 'index' | 'model' | 'pos' | 'rot'>[]; error?: string }>('ymapMovePreviewData', result => {
        if (result.requestId !== previewRequestId.current || result.resource !== resource || result.rel !== rel) return
        previewRequestId.current++
        setPreparing(false)
        if (result.error) {
            setNotice(result.error)
            return
        }
        if (result.entities?.length) move(true, result.entities)
    })

    const pick = (entity: YmapEntity) => {
        setSelected(entity)
        fetchNui('collisionBox', { on: true, model: entity.model, pos: entity.pos, quat: entity.rot })
        fetchNui('teleportTo', { pos: entity.pos, auto: true })
    }

    const remove = () => {
        if (!selected || !resource || !rel) return
        fetchNui('editYmapProp', { action: 'remove', resource, rel, index: selected.index, model: selected.model, pos: selected.pos })
        useStore.getState().pushHistory({ id: `ymap-prop|${resource}|${rel}|${selected.index}`, label: selected.name, action: 'remove' })
    }

    const move = async (all = false, group?: Pick<YmapEntity, 'index' | 'model' | 'pos' | 'rot'>[]) => {
        const anchor = all ? selected ?? data?.anchor : selected
        if (!anchor || !resource || !rel || transform) return
        const result = await fetchNui<{ ok?: boolean; reason?: string; pos?: [number, number, number] }>('startTransform', {
            model: anchor.model,
            pos: anchor.pos,
            rot: anchor.rot,
            radius: 0.5,
            spots: [{ model: anchor.model, pos: anchor.pos }],
            translateOnly: all,
            group,
            anchorIndex: anchor.index
        })
        if (!result?.ok) {
            if (result?.reason) setNotice(result.reason)
            return
        }
        useStore.setState({
            transform: {
                conflictId: all ? c.id : `ymap-prop|${resource}|${rel}|${anchor.index}`,
                model: anchor.model,
                name: all ? c.title : anchor.name,
                pos: result.pos ?? anchor.pos,
                rot: [0, 0, 0],
                quat: anchor.rot,
                mode: 'translate',
                grid: false,
                ...(all
                    ? { ymapAll: { resource, rel, anchor: result.pos ?? anchor.pos } }
                    : { ymap: { resource, rel, entity: anchor } })
            }
        })
    }

    const moveAll = () => {
        if (!resource || !rel || !data?.anchor || transform || preparing) return
        const id = ++previewRequestId.current
        setPreparing(true)
        fetchNui('ymapMovePreview', { resource, rel, requestId: id })
        window.setTimeout(() => {
            if (previewRequestId.current === id) {
                previewRequestId.current++
                setPreparing(false)
                setNotice('The YMAP preview timed out. Try again.')
            }
        }, 30000)
    }

    const entities = data?.entities ?? []
    const total = data?.total ?? 0

    return (
        <div className="mx-3 mt-2.5 space-y-2">
            <div className="text-2xs font-bold">YMAP props</div>
            <Button className="w-full" size="sm" variant="secondary" onClick={moveAll} disabled={!data?.anchor || !!transform || preparing}>
                <ArrowsOutCardinal /> {preparing ? 'Loading objects…' : 'Move all objects'}
            </Button>
            <Input
                aria-label="Search props in this YMAP"
                placeholder="Model name, hash, or row…"
                value={query}
                onChange={event => { setQuery(event.target.value); setOffset(0) }}
            />
            <div className="text-3xs text-muted-foreground" role="status">
                {loading ? 'Loading props…' : `${total} matching props`}
            </div>
            {selected && (
                <div className="rounded-md border border-border bg-card p-2">
                    <div className="truncate font-mono text-2xs font-semibold" title={selected.name}>{selected.name}</div>
                    <div className="mt-1 font-mono text-3xs text-muted-foreground">
                        {selected.pos.map(value => value.toFixed(2)).join(', ')}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1">
                        <Button size="sm" variant="secondary" onClick={() => fetchNui('teleportTo', { pos: selected.pos })} title="Go to this prop">
                            <Crosshair /> Go
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => move()} disabled={!!transform}>
                            <ArrowsOutCardinal /> Move
                        </Button>
                        <Button size="sm" variant="destructive" onClick={remove} disabled={!!transform}>
                            <Trash /> Remove
                        </Button>
                    </div>
                </div>
            )}
            <div className="space-y-1" role="list" aria-label="Props in YMAP">
                {entities.map(entity => (
                    <div key={entity.index} role="listitem">
                        <button
                            type="button"
                            aria-pressed={selected?.index === entity.index}
                            onClick={() => pick(entity)}
                            className={`w-full rounded-md border p-2 text-left transition-colors duration-150 cursor-pointer ${selected?.index === entity.index ? 'border-ring bg-accent' : 'border-border bg-card hover:bg-accent'}`}
                        >
                            <span className="block truncate font-mono text-2xs" title={entity.name}>{entity.name}</span>
                            <span className="block truncate font-mono text-3xs text-muted-foreground">#{entity.index + 1} · {entity.pos.map(value => value.toFixed(1)).join(', ')}</span>
                        </button>
                    </div>
                ))}
            </div>
            {total > 80 && (
                <div className="flex items-center gap-1">
                    <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 80))}>Previous</Button>
                    <span className="flex-1 text-center text-3xs text-muted-foreground">{offset + 1}–{Math.min(offset + 80, total)} of {total}</span>
                    <Button size="sm" variant="secondary" disabled={offset + 80 >= total} onClick={() => setOffset(offset + 80)}>Next</Button>
                </div>
            )}
        </div>
    )
}
