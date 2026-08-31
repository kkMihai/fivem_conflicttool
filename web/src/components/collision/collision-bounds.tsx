import { useState } from 'react'
import { ArrowsOutCardinal, CaretDown, CaretRight, PaintBrush, Pulse, Warning } from '@phosphor-icons/react'
import { cn, OCCL_DOTS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { MaterialPicker } from '@/components/collision/material-picker'
import { FacePanel } from '@/components/collision/face-panel'
import { useStore } from '@/store/use-store'
import type { CollisionBound, Conflict } from '@/types'

const BOUND_TYPE: Record<number, string> = {
    0: 'sphere',
    1: 'capsule',
    3: 'box',
    4: 'geometry',
    8: 'bvh',
    10: 'composite',
    12: 'disc',
    13: 'cylinder'
}

const size3 = (min: number[], max: number[]) =>
    `${Math.round(max[0] - min[0])}×${Math.round(max[1] - min[1])}×${Math.round(max[2] - min[2])}`

function Swatches({ b, colors }: { b: CollisionBound; colors: [number, number, number][] }) {
    const seen: number[] = []
    for (const m of b.mats) {
        if (!seen.includes(m.type)) seen.push(m.type)
        if (seen.length >= 8) break
    }
    return (
        <span className="flex shrink-0 gap-px" aria-hidden="true">
            {seen.map(t => (
                <span
                    key={t}
                    className="h-2 w-1 rounded-[1px]"
                    style={colors[t] ? { backgroundColor: `rgb(${colors[t].join(',')})` } : undefined}
                />
            ))}
        </span>
    )
}

export function CollisionBounds({ c }: { c: Conflict }) {
    const collision = useStore(s => s.collision)
    const collResource = useStore(s => s.collResource)
    const collEdit = useStore(s => s.collEdit)
    const collEditLive = useStore(s => s.collEditLive)
    const collMats = useStore(s => s.collMats)
    const collFlags = useStore(s => s.collFlags)
    const collColors = useStore(s => s.collColors)
    const collVerify = useStore(s => s.collVerify)
    const verifyCollision = useStore(s => s.verifyCollision)
    const gizmoSpace = useStore(s => s.gizmoSpace)
    const requestCollision = useStore(s => s.requestCollision)
    const editCollisionBound = useStore(s => s.editCollisionBound)
    const moveWholeCollision = useStore(s => s.moveWholeCollision)
    const collEditApply = useStore(s => s.collEditApply)
    const collEditCancel = useStore(s => s.collEditCancel)
    const setCollisionMaterial = useStore(s => s.setCollisionMaterial)
    const highlightBound = useStore(s => s.highlightBound)
    const faceEdit = useStore(s => s.faceEdit)
    const startFaceEdit = useStore(s => s.startFaceEdit)
    const openBound = useStore(s => s.openBound)
    const setOpenBound = useStore(s => s.setOpenBound)
    const [openSlot, setOpenSlot] = useState<string | null>(null)
    const [showMats, setShowMats] = useState(false)

    if (!collision) {
        return (
            <div role="status" className="mx-3 mt-2 rounded-md border border-cat-coll/40 bg-cat-coll/10 px-2 py-1.5 text-3xs text-cat-coll">
                Reading collision bounds…
            </div>
        )
    }

    const { composite, bounds } = collision.inspect
    const editing = !!collEdit || !!faceEdit
    const copies = c.resources.filter(r => r.rel)
    const verified = collVerify && collVerify.state !== 'running' ? collVerify : null

    return (
        <div className="mx-3 mt-2 space-y-1.5">
            {copies.length > 1 && (
                <div className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
                    {copies.map(r => (
                        <button
                            key={r.name}
                            type="button"
                            disabled={editing}
                            onClick={() => requestCollision(c, r.name)}
                            aria-pressed={collResource === r.name}
                            className={cn(
                                'min-h-6 min-w-0 flex-1 truncate rounded-md px-1 py-1 font-mono text-3xs transition-colors duration-150 cursor-pointer disabled:pointer-events-none disabled:opacity-40',
                                collResource === r.name
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                            )}
                        >
                            {r.name}
                        </button>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-1">
                <Button
                    size="sm"
                    variant="secondary"
                    className="min-w-0 flex-1 justify-start"
                    disabled={editing || collVerify?.state === 'running'}
                    onClick={() => verifyCollision()}
                    title="Which copy the game streams is a load order guess. This probes the world to find out."
                >
                    <Pulse />
                    <span className="truncate">{collVerify?.state === 'running' ? 'Probing…' : 'Check against world'}</span>
                </Button>
                <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    disabled={editing}
                    onClick={() => moveWholeCollision(c)}
                    title="Drag every bound in this file together"
                >
                    <ArrowsOutCardinal />
                    Move all
                </Button>
            </div>

            {verified && (
                <div role="status" className="rounded-md border border-border bg-card px-1.5 py-1 text-3xs">
                    {verified.state === 'far' ? (
                        <span className="text-muted-foreground">
                            None of the differing faces are near enough to probe. Fly closer to where the copies disagree.
                        </span>
                    ) : verified.state === 'none' ? (
                        <span className="text-muted-foreground">These copies have no faces that differ, so it makes no difference which one loads.</span>
                    ) : (
                        <>
                            <div className="text-muted-foreground">Probed the faces each copy has that the others do not:</div>
                            <div className="mt-1 space-y-0.5">
                                {(verified.copies ?? []).map(v => {
                                    const live = (v.pct ?? 0) >= 70
                                    const dead = v.tested > 0 && (v.pct ?? 0) <= 30
                                    return (
                                        <div
                                            key={v.resource}
                                            className={cn(
                                                'flex items-center gap-1.5 rounded-sm px-1 py-0.5',
                                                live && 'bg-cat-vanilla/10 text-cat-vanilla',
                                                dead && 'text-muted-foreground'
                                            )}
                                        >
                                            <span className="truncate font-mono">{v.resource}</span>
                                            <span className="ml-auto shrink-0 font-mono">
                                                {v.tested === 0 ? 'none in range' : `${v.matched}/${v.tested}`}
                                            </span>
                                            <span className="w-16 shrink-0 text-right">
                                                {v.tested === 0 ? '' : live ? 'is loaded' : dead ? 'not loaded' : 'partly'}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                            {(() => {
                                const probed = (verified.copies ?? []).filter(v => v.tested > 0)
                                const live = probed.filter(v => (v.pct ?? 0) >= 70)
                                if (live.length !== 1) return null
                                const predicted = c.resources[c.resources.length - 1]?.name
                                if (live[0].resource === predicted) return null
                                return (
                                    <div className="mt-1 rounded-sm border border-cat-occl/40 bg-cat-occl/10 px-1 py-0.5 text-cat-occl">
                                        The world says {live[0].resource} is loaded, but registration order points at {predicted}. That happens when a
                                        resource was restarted while the server was running.
                                    </div>
                                )
                            })()}
                        </>
                    )}
                </div>
            )}

            {!composite && (
                <div className="flex items-start gap-1.5 rounded-md border border-cat-occl/40 bg-cat-occl/10 px-1.5 py-1 text-3xs text-cat-occl">
                    <Warning className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>One bound, no composite wrapper. It can be moved, not rotated.</span>
                </div>
            )}

            {collEdit?.whole && (
                <div className="rounded-md border border-primary/40 bg-card px-2 py-1.5">
                    <div className="text-2xs font-semibold">Moving the whole ybn</div>
                    <div className="mt-1 flex items-center gap-1.5 rounded-md border border-border bg-background px-1.5 py-1 font-mono text-3xs">
                        <span className="text-muted-foreground">offset</span>
                        <span>{(collEditLive?.delta ?? [0, 0, 0]).map(v => v.toFixed(2)).join(', ')}</span>
                        <span className="ml-auto text-muted-foreground">{gizmoSpace}</span>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-1">
                        <Button size="sm" onClick={() => collEditApply()}>Apply</Button>
                        <Button size="sm" variant="secondary" onClick={() => collEditCancel()}>Cancel</Button>
                    </div>
                </div>
            )}

            <div className="space-y-0.5">
                {bounds.map((b, i) => {
                    if (faceEdit?.bi === b.bi) return <FacePanel key={b.bi} bound={b} />
                    const mine = collEdit?.bi === b.bi && !collEdit.whole
                    const open = openBound === b.bi || mine
                    const lockedEdit = editing || !composite || !b.m
                    return (
                        <div
                            key={b.bi}
                            className={cn('rounded-md border bg-card', open ? 'border-primary/40' : 'border-border')}
                            onMouseEnter={() => highlightBound(b.bi)}
                            onMouseLeave={() => highlightBound(null)}
                        >
                            <button
                                type="button"
                                onClick={() => setOpenBound(b.bi)}
                                aria-expanded={open}
                                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors duration-150 cursor-pointer hover:bg-accent"
                            >
                                {open ? (
                                    <CaretDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                ) : (
                                    <CaretRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                )}
                                <span className={cn('h-2 w-2 shrink-0 rounded-full', OCCL_DOTS[i % OCCL_DOTS.length])} aria-hidden="true" />
                                <span className="shrink-0 text-2xs font-semibold">bound {b.bi + 1}</span>
                                <Swatches b={b} colors={collColors} />
                                <span className="ml-auto shrink-0 font-mono text-3xs text-muted-foreground">
                                    {b.faces} · {size3(b.bmin, b.bmax)}
                                </span>
                            </button>

                            {mine && (
                                <div className="border-t border-border px-2 py-1.5">
                                    <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-1.5 py-1 font-mono text-3xs">
                                        <span>{(collEditLive?.pos ?? [0, 0, 0]).map(v => v.toFixed(2)).join(', ')}</span>
                                        <span className="ml-auto text-muted-foreground">yaw {(collEditLive?.yaw ?? 0).toFixed(0)}°</span>
                                    </div>
                                    <div className="mt-1 grid grid-cols-2 gap-1">
                                        <Button size="sm" onClick={() => collEditApply()}>Apply</Button>
                                        <Button size="sm" variant="secondary" onClick={() => collEditCancel()}>Cancel</Button>
                                    </div>
                                </div>
                            )}

                            {open && !mine && (
                                <div className="border-t border-border px-2 py-1.5">
                                    <div className="grid grid-cols-2 gap-1">
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            disabled={lockedEdit}
                                            onClick={() => editCollisionBound(c, b.bi)}
                                            aria-label={`Move or rotate bound ${b.bi + 1}`}
                                        >
                                            <ArrowsOutCardinal />
                                            Move
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            disabled={editing || b.faces === 0}
                                            onClick={() => startFaceEdit(c, b.bi)}
                                            title={
                                                b.faces === 0
                                                    ? 'Built from box and capsule shapes, so it has no faces to paint'
                                                    : 'Pick faces in the world and set their surface'
                                            }
                                            aria-label={`Paint the faces of bound ${b.bi + 1}`}
                                        >
                                            <PaintBrush />
                                            Paint
                                        </Button>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setShowMats(!showMats)}
                                        aria-expanded={showMats}
                                        className="mt-1 flex w-full items-center gap-1.5 rounded-sm px-1 py-1 text-3xs text-muted-foreground transition-colors duration-150 cursor-pointer hover:bg-accent hover:text-foreground"
                                    >
                                        {showMats ? (
                                            <CaretDown className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                                        ) : (
                                            <CaretRight className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                                        )}
                                        <span className="font-mono">{BOUND_TYPE[b.type] ?? `type ${b.type}`}</span>
                                        <span className="ml-auto">{b.mats.length} surfaces</span>
                                    </button>

                                    {showMats && (
                                        <div className="space-y-0.5">
                                            {b.mats.map(mat => {
                                                const key = `${b.bi}:${mat.slot}`
                                                return (
                                                    <div key={key}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setOpenSlot(openSlot === key ? null : key)}
                                                            aria-expanded={openSlot === key}
                                                            className="flex w-full items-center gap-1.5 rounded-sm px-1 py-0.5 text-left transition-colors duration-150 cursor-pointer hover:bg-accent"
                                                        >
                                                            <span
                                                                aria-hidden="true"
                                                                className="h-2.5 w-2.5 shrink-0 rounded-sm border border-border"
                                                                style={
                                                                    collColors[mat.type]
                                                                        ? { backgroundColor: `rgb(${collColors[mat.type].join(',')})` }
                                                                        : undefined
                                                                }
                                                            />
                                                            <span className="truncate font-mono text-3xs">{mat.name}</span>
                                                            <span className="ml-auto shrink-0 font-mono text-3xs text-muted-foreground">
                                                                {mat.slot < 0 ? 'bound' : mat.slot}
                                                            </span>
                                                        </button>
                                                        {openSlot === key && (
                                                            <MaterialPicker
                                                                names={collMats}
                                                                flagNames={collFlags}
                                                                colors={collColors}
                                                                mat={mat}
                                                                onSurface={type => setCollisionMaterial(c, b.bi, mat.slot, { type })}
                                                                onFlags={flags => setCollisionMaterial(c, b.bi, mat.slot, { flags })}
                                                                onClose={() => setOpenSlot(null)}
                                                            />
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
