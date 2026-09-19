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
    const [data, setData] = useState<YmapEntitiesData | null>(null)
    const [selected, setSelected] = useState<YmapEntity | null>(null)
    const requestId = useRef(0)

    useEffect(() => {
        setQuery('')
        setOffset(0)
        setData(null)
        setSelected(null)
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

    const move = async () => {
        if (!selected || !resource || !rel || transform) return
        const result = await fetchNui<{ ok?: boolean; reason?: string; pos?: [number, number, number] }>('startTransform', {
            model: selected.model,
            pos: selected.pos,
            rot: selected.rot,
            radius: 0.5,
            spots: [{ model: selected.model, pos: selected.pos }]
        })
        if (!result?.ok) {
            if (result?.reason) setNotice(result.reason)
            return
        }
        useStore.setState({
            transform: {
                conflictId: `ymap-prop|${resource}|${rel}|${selected.index}`,
                model: selected.model,
                name: selected.name,
                pos: result.pos ?? selected.pos,
                rot: [0, 0, 0],
                quat: selected.rot,
                mode: 'translate',
                grid: false,
                ymap: { resource, rel, entity: selected }
            }
        })
    }

    const entities = data?.entities ?? []
    const total = data?.total ?? 0

    return (
        <div className="mx-3 mt-2.5 space-y-2">
            <div className="text-2xs font-bold">YMAP props</div>
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
                        <Button size="sm" variant="secondary" onClick={move} disabled={!!transform}>
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
