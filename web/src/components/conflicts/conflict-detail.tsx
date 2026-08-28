import { ArrowsOutCardinal, Check, Crosshair, Cube, Eye, EyeSlash, Swap, Trash, Warning, X } from '@phosphor-icons/react'
import { cn, OCCL_DOTS } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store/use-store'
import { fetchNui } from '@/lib/nui'
import { fmtBytes } from '@/lib/utils'

const catLabel: Record<string, string> = { asset: 'Asset', prop: 'Prop', occl: 'Occluder', coll: 'Collision' }
const sevLabel: Record<string, string> = { cosmetic: 'Cosmetic', medium: 'Medium', high: 'High' }

const previewLabels: Record<string, [string, string]> = {
    'spatial-dup': ['Both copies', 'Without copy'],
    'entity-moved': ['Moved (now)', 'Original spot'],
    'entity-retyped': ['New model', 'Original model'],
    'entity-removed': ['Removed (now)', 'With object']
}

export function ConflictDetail() {
    const selectedId = useStore(s => s.selectedId)
    const conflicts = useStore(s => s.conflicts)
    const resolved = useStore(s => s.resolved)
    const decideEntity = useStore(s => s.decideEntity)
    const decideAsset = useStore(s => s.decideAsset)
    const startMove = useStore(s => s.startMove)
    const select = useStore(s => s.select)
    const collisionTris = useStore(s => s.collisionTris)
    const toggleIgnore = useStore(s => s.toggleIgnore)
    const clipOccluder = useStore(s => s.clipOccluder)
    const mergeOccluders = useStore(s => s.mergeOccluders)
    const zeroOccluder = useStore(s => s.zeroOccluder)
    const editOccluder = useStore(s => s.editOccluder)
    const occlEdit = useStore(s => s.occlEdit)
    const occlEditLive = useStore(s => s.occlEditLive)
    const occlEditApply = useStore(s => s.occlEditApply)
    const occlEditCancel = useStore(s => s.occlEditCancel)
    const occlEditWholeBox = useStore(s => s.occlEditWholeBox)
    const gizmoSpace = useStore(s => s.gizmoSpace)
    const preview = useStore(s => s.preview)
    const setPreview = useStore(s => s.setPreview)
    const c = conflicts.find(x => x.id === selectedId)
    if (!c) return null
    const pvLabels = c.entity ? previewLabels[c.kind] : undefined

    return (
        <div
            data-panel=""
            className="panel animate-rise pointer-events-auto flex h-full w-detail shrink-0 flex-col overflow-hidden rounded-xl"
            role="region"
            aria-label={`Details for ${c.title}`}
        >
            <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
                <Badge>{sevLabel[c.sev]}</Badge>
                <Badge variant={c.cat as any}>{catLabel[c.cat]}</Badge>
                {c.vanilla && <Badge variant="success">Vanilla</Badge>}
                {c.isNew && !c.ignored && <Badge>New</Badge>}
                {c.ignored && <Badge variant="secondary">Ignored</Badge>}
                <div className="ml-auto flex items-center gap-0.5">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 px-0"
                        title={c.ignored ? 'Stop ignoring this conflict' : 'Ignore this conflict on future scans'}
                        aria-label={c.ignored ? 'Stop ignoring this conflict' : 'Ignore this conflict on future scans'}
                        aria-pressed={!!c.ignored}
                        onClick={() => toggleIgnore(c)}
                    >
                        {c.ignored ? <Eye className="h-3 w-3" aria-hidden="true" /> : <EyeSlash className="h-3 w-3" aria-hidden="true" />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 px-0"
                        title="Teleport to this conflict"
                        aria-label="Teleport to this conflict"
                        disabled={!c.pos}
                        onClick={() => c.pos && fetchNui('teleportTo', { pos: c.pos })}
                    >
                        <Crosshair className="h-3 w-3" aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 px-0" title="Close details" aria-label="Close details" onClick={() => select(null)}>
                        <X className="h-3 w-3" aria-hidden="true" />
                    </Button>
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-3">
                <div className="px-3 pt-2.5">
                    <div className="break-all font-mono text-sm font-bold">{c.title}</div>
                    <div className="mt-0.5 truncate text-3xs text-muted-foreground">
                        <span className="font-mono text-res-a">{c.resources[0]?.name}</span>
                        {' → '}
                        <span className="font-mono text-res-b">{c.resources[1]?.name}</span>
                    </div>
                </div>

                <div className="mx-3 mt-2 rounded-lg border border-border bg-card p-2.5">
                    <div className="flex items-center gap-1.5 text-2xs font-bold">
                        <Warning className="h-3 w-3 text-cat-occl" aria-hidden="true" />
                        Why this is a conflict
                    </div>
                    <p className="mt-1.5 text-2xs leading-relaxed text-secondary-foreground">{c.explain.summary}</p>
                    <div className="mt-2 space-y-1">
                        {c.resources.map((r, i) => (
                            <div key={`${r.name}_${i}`} className="flex items-center gap-1.5 text-3xs">
                                <span aria-hidden="true" className={i === 0 ? 'h-1.5 w-1.5 rounded-full bg-res-a' : 'h-1.5 w-1.5 rounded-full bg-res-b'} />
                                <span className="truncate font-mono">{r.name}</span>
                                <span className="ml-auto shrink-0 text-muted-foreground">{r.status}</span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-2 text-3xs italic text-muted-foreground">{c.explain.note}</p>
                </div>

                {c.resources.some(r => r.size > 0) && (
                    <div className="mx-3 mt-2 space-y-1">
                        {c.resources.map((r, i) => (
                            <div key={`f_${r.name}_${i}`} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-3xs">
                                <span className="truncate font-mono text-muted-foreground">{r.rel}</span>
                                <span className="ml-auto shrink-0">{fmtBytes(r.size)}</span>
                                {r.sha1 && <span className="shrink-0 font-mono text-muted-foreground">{r.sha1}</span>}
                            </div>
                        ))}
                    </div>
                )}

                {pvLabels && (
                    <div className="mx-3 mt-2.5">
                        <div className="flex items-center gap-1.5 text-2xs font-bold">
                            <Swap className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                            Preview in world
                        </div>
                        <div className="mt-1 flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
                            {(['a', 'b'] as const).map((which, i) => (
                                <button
                                    key={which}
                                    type="button"
                                    onClick={() => setPreview(c, which)}
                                    aria-pressed={(preview ?? 'a') === which}
                                    className={cn(
                                        'flex-1 rounded-md px-1 py-1 text-3xs font-semibold transition-colors duration-150 cursor-pointer',
                                        (preview ?? 'a') === which
                                            ? 'bg-primary text-primary-foreground'
                                            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                                    )}
                                >
                                    {pvLabels[i]}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mx-3 mt-2.5 grid grid-cols-3 gap-1.5">
                    {c.entity ? (
                        <>
                            <Button variant="secondary" onClick={() => decideEntity(c, 'keep')}>
                                <Check />
                                Keep
                            </Button>
                            <Button variant="secondary" onClick={() => startMove(c)}>
                                <ArrowsOutCardinal />
                                Move
                            </Button>
                            <Button variant="destructive" onClick={() => decideEntity(c, 'remove')}>
                                <Trash />
                                Remove
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="secondary"
                            className="col-span-3"
                            disabled={!!resolved[c.id] || c.kind !== 'dup-file'}
                            onClick={() => decideAsset(c)}
                        >
                            <Check />
                            Keep last · disable rest
                        </Button>
                    )}
                </div>

                {c.kind === 'occl-overlap' && (c.boxes?.length ?? 0) > 1 && (
                    <div className="mx-3 mt-2 space-y-1">
                        <div className="text-3xs font-semibold text-muted-foreground">Or fix the volumes instead of deleting a file:</div>
                        <Button
                            variant="secondary"
                            className="w-full justify-start"
                            disabled={!!occlEdit || c.boxes!.filter(b => b?.rel && !(b.l === 0 && b.w === 0 && b.h === 0)).length < 2}
                            onClick={() => mergeOccluders(c)}
                            title="Grow one occluder to cover both volumes and zero the other"
                        >
                            <Swap />
                            Merge into one occluder
                        </Button>
                        {c.boxes!.map((box, i) => {
                            const gone = !!box && box.l === 0 && box.w === 0 && box.h === 0
                            const locked = !box?.rel || gone
                            const editing = occlEdit?.id === c.id && occlEdit.target === i
                            const dims = editing && occlEditLive ? occlEditLive : box
                            return (
                                <div key={i} className="rounded-md border border-border bg-card px-2 py-1.5">
                                    <div className="flex items-center gap-1.5 text-2xs">
                                        <span
                                            className={cn('h-2 w-2 shrink-0 rounded-full', OCCL_DOTS[i % OCCL_DOTS.length])}
                                            aria-hidden="true"
                                        />
                                        <Cube className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                        <span className="truncate font-mono">{box?.resource ?? '?'}</span>
                                        <span className="ml-auto pl-2 text-3xs text-muted-foreground">
                                            {gone ? 'removed' : dims ? `${dims.l} x ${dims.w} x ${dims.h}` : ''}
                                        </span>
                                    </div>
                                    {editing ? (
                                        <>
                                            <div className="mt-1 flex items-center gap-1.5 rounded-md border border-border bg-background px-1.5 py-1 text-3xs">
                                                {occlEditLive?.face ? (
                                                    <>
                                                        <span className="text-muted-foreground">
                                                            extruding the <span className="font-semibold text-foreground">{occlEditLive.face}</span> face
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => occlEditWholeBox()}
                                                            className="ml-auto min-h-6 shrink-0 rounded-sm px-1 text-3xs font-semibold text-muted-foreground transition-colors duration-150 hover:text-foreground cursor-pointer"
                                                        >
                                                            whole box
                                                        </button>
                                                    </>
                                                ) : (
                                                    <span className="text-muted-foreground">right click a face in world to extrude just that side</span>
                                                )}
                                            </div>
                                            <div className="mt-1 flex items-center gap-1.5 rounded-md border border-border bg-background px-1.5 py-1 text-3xs">
                                                <span className="text-muted-foreground">axes</span>
                                                <span className="font-bold">{gizmoSpace === 'local' ? 'Local' : 'Global'}</span>
                                                <span className="ml-auto text-muted-foreground">press X to switch</span>
                                            </div>
                                            <div className="mt-1 grid grid-cols-2 gap-1">
                                                <Button size="sm" onClick={() => occlEditApply()} aria-label={`Apply the edit of occluder ${i + 1}`}>
                                                    <Check />
                                                    Apply edit
                                                </Button>
                                                <Button size="sm" variant="secondary" onClick={() => occlEditCancel()} aria-label={`Cancel the edit of occluder ${i + 1}`}>
                                                    <X />
                                                    Cancel
                                                </Button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="mt-1 grid grid-cols-3 gap-1">
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                disabled={locked || !!occlEdit}
                                                onClick={() => editOccluder(c, i)}
                                                aria-label={`Edit occluder ${i + 1} in ${box?.resource ?? ''} with the in-world gizmo`}
                                            >
                                                <ArrowsOutCardinal />
                                                Edit
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                disabled={locked || !!occlEdit}
                                                onClick={() => clipOccluder(c, i)}
                                                aria-label={`Shrink occluder ${i + 1} in ${box?.resource ?? ''} until the overlaps are gone`}
                                            >
                                                Shrink
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                disabled={locked || !!occlEdit}
                                                onClick={() => zeroOccluder(c, i)}
                                                aria-label={`Remove occluder ${i + 1} in ${box?.resource ?? ''} by zeroing its volume`}
                                            >
                                                <Trash />
                                                Remove
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                {c.kind === 'dup-file' && c.resources.length > 1 && !c.entity && (
                    <div className="mx-3 mt-2 space-y-1">
                        <div className="text-3xs font-semibold text-muted-foreground">Or pick which copy to keep:</div>
                        {c.resources.map((r, i) => (
                            <Button
                                key={`k_${r.name}_${i}`}
                                variant="outline"
                                size="sm"
                                className="w-full justify-start"
                                disabled={!!resolved[c.id]}
                                onClick={() => decideAsset(c, r.name)}
                            >
                                <span className="truncate">keep {r.name}</span>
                            </Button>
                        ))}
                    </div>
                )}

                {c.cat === 'coll' && (
                    <div role="status" className="mx-3 mt-2 flex items-center gap-2 rounded-md border border-cat-coll/40 bg-cat-coll/10 px-2 py-1.5 text-3xs text-cat-coll">
                        <Eye className="h-3 w-3" aria-hidden="true" />
                        {collisionTris > 0 ? `${collisionTris} collision tris drawn in world` : 'Loading collision geometry…'}
                    </div>
                )}

                {c.near && c.near.length > 0 && (
                    <div className="mx-3 mt-2">
                        <div className="flex items-center gap-1.5 text-2xs font-bold">
                            <Cube className="h-3 w-3 text-cat-occl" aria-hidden="true" />
                            Occluders near
                        </div>
                        <div className="mt-1 space-y-1">
                            {c.near.map((n, i) => (
                                <div key={i} className="flex items-center rounded-md border border-border bg-card px-2 py-1 text-3xs">
                                    <span className="font-mono">{n.label}</span>
                                    <span className="ml-auto text-muted-foreground">{n.dist.toFixed(1)}m</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
