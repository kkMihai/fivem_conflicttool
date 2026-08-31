import { useState } from 'react'
import { ArrowsOutCardinal, Check, PaintBrush, Selection, Warning, X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { MaterialPicker } from '@/components/collision/material-picker'
import { useStore } from '@/store/use-store'
import type { CollisionBound } from '@/types'

const swatch = (colors: [number, number, number][], type: number) =>
    colors[type] ? { backgroundColor: `rgb(${colors[type].join(',')})` } : undefined

export function FacePanel({ bound }: { bound: CollisionBound }) {
    const faceSel = useStore(s => s.faceSel)
    const faceInfo = useStore(s => s.faceInfo)
    const collMats = useStore(s => s.collMats)
    const collFlags = useStore(s => s.collFlags)
    const collColors = useStore(s => s.collColors)
    const stopFaceEdit = useStore(s => s.stopFaceEdit)
    const faceSelectOp = useStore(s => s.faceSelectOp)
    const applyFaceMaterial = useStore(s => s.applyFaceMaterial)
    const faceMove = useStore(s => s.faceMove)
    const gizmoSpace = useStore(s => s.gizmoSpace)
    const [picking, setPicking] = useState(false)

    const count = faceSel?.count ?? 0
    const brush = faceSel?.brush ?? 0.6
    const loading = faceSel?.loading ?? true
    const moving = !!faceSel?.moving
    const counts = new Map((faceInfo?.counts ?? []).map(c => [c.slot, c.count]))

    return (
        <div className="rounded-md border border-primary/40 bg-card px-2 py-1.5">
            <div className="flex items-center gap-1.5 text-2xs">
                <PaintBrush className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                <span className="font-semibold">Painting faces</span>
                <span className="font-mono text-3xs text-muted-foreground">bound {bound.bi + 1}</span>
                <span className="ml-auto shrink-0 font-mono text-3xs">
                    {loading ? 'loading…' : `${count} of ${faceInfo?.tris ?? bound.tris} selected`}
                </span>
            </div>

            {faceInfo?.capped && (
                <div className="mt-1 flex items-start gap-1.5 rounded-md border border-cat-occl/40 bg-cat-occl/10 px-1.5 py-1 text-3xs text-cat-occl">
                    <Warning className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>This bound is too big to load every face, only the first {faceInfo.tris} are editable.</span>
                </div>
            )}

            {moving ? (
                <div className="mt-1 rounded-md border border-primary/40 bg-background px-1.5 py-1">
                    <div className="flex items-center gap-1.5 font-mono text-3xs">
                        <span className="text-muted-foreground">offset</span>
                        <span>{(faceSel?.offset ?? [0, 0, 0]).map(v => v.toFixed(2)).join(', ')}</span>
                        <span className="ml-auto text-muted-foreground">yaw {(faceSel?.yaw ?? 0).toFixed(1)}°</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-3xs text-muted-foreground">
                        <span className="font-semibold text-foreground">LMB</span> drag the gizmo,{' '}
                        <span className="font-semibold text-foreground">2</span> move,{' '}
                        <span className="font-semibold text-foreground">3</span> rotate,{' '}
                        <span className="font-semibold text-foreground">X</span> {gizmoSpace} axes
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-1">
                        <Button size="sm" onClick={() => faceMove('apply')}>
                            <Check />
                            Apply move
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => faceMove('cancel')}>
                            <X />
                            Cancel
                        </Button>
                    </div>
                </div>
            ) : (
            <div className="mt-1 rounded-md border border-border bg-background px-1.5 py-1 text-3xs text-muted-foreground">
                <span className="font-semibold text-foreground">LMB</span> tap a face, hold and sweep to paint,{' '}
                <span className="font-semibold text-foreground">Ctrl</span> to erase,{' '}
                <span className="font-semibold text-foreground">scroll</span> for brush size
            </div>
            )}

            <div className="mt-1 flex items-center gap-1.5 rounded-md border border-border bg-background px-1.5 py-1 text-3xs">
                <span className="text-muted-foreground">brush</span>
                <input
                    type="range"
                    min={0.2}
                    max={6}
                    step={0.2}
                    value={brush}
                    onChange={e => faceSelectOp('brush', Number(e.target.value))}
                    aria-label="Brush radius"
                    className="h-1 flex-1 cursor-pointer accent-primary"
                />
                <span className="w-8 shrink-0 text-right font-mono">{brush.toFixed(1)}m</span>
            </div>

            <div className="mt-1 grid grid-cols-3 gap-1">
                <Button size="sm" variant="secondary" onClick={() => faceSelectOp('all')}>
                    <Selection />
                    All
                </Button>
                <Button size="sm" variant="secondary" disabled={faceSel?.slot === null} onClick={() => faceSelectOp('like')}>
                    Same surface
                </Button>
                <Button size="sm" variant="secondary" disabled={!count} onClick={() => faceSelectOp('clear')}>
                    Clear
                </Button>
            </div>

            <div className="mt-1.5">
                <div className="px-1 text-3xs font-semibold text-muted-foreground">Surfaces in this bound</div>
                <div className="mt-0.5 space-y-0.5">
                    {bound.mats.map(mat => (
                        <button
                            key={mat.slot}
                            type="button"
                            onClick={() => faceSelectOp('slot', mat.slot)}
                            title={`Select every face using ${mat.name}`}
                            className="flex w-full items-center gap-1.5 rounded-sm px-1 py-0.5 text-left transition-colors duration-150 cursor-pointer hover:bg-accent"
                        >
                            <span
                                aria-hidden="true"
                                className="h-2.5 w-2.5 shrink-0 rounded-sm border border-border"
                                style={swatch(collColors, mat.type)}
                            />
                            <span className="truncate font-mono text-3xs">{mat.name}</span>
                            <span className="ml-auto shrink-0 font-mono text-3xs text-muted-foreground">
                                {counts.get(mat.slot) ?? 0}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {!moving && (
                <Button
                    variant="secondary"
                    className="mt-1 w-full justify-start"
                    disabled={!count}
                    onClick={() => faceMove('begin')}
                    title="Grab the selected faces with the gizmo"
                >
                    <ArrowsOutCardinal />
                    Move / rotate {count} selected {count === 1 ? 'face' : 'faces'}
                </Button>
            )}

            <div className="mt-1.5 border-t border-border pt-1.5">
                {picking ? (
                    <MaterialPicker
                        names={collMats}
                        flagNames={collFlags}
                        colors={collColors}
                        hideFlags
                        surfaceLabel={`applies to ${count} selected ${count === 1 ? 'face' : 'faces'}`}
                        mat={bound.mats[0] ?? { slot: 0, type: 0, procId: 0, roomId: 0, pedDensity: 0, flags: 0, colorIndex: 0, unk4: 0, name: '' }}
                        onSurface={type => {
                            applyFaceMaterial(type)
                            setPicking(false)
                        }}
                        onFlags={() => {}}
                        onClose={() => setPicking(false)}
                    />
                ) : (
                    <Button
                        className={cn('w-full justify-start', !count && 'opacity-60')}
                        disabled={!count}
                        onClick={() => setPicking(true)}
                    >
                        <Check />
                        Set {count} selected {count === 1 ? 'face' : 'faces'} to…
                    </Button>
                )}
            </div>

            <Button size="sm" variant="secondary" className="mt-1 w-full" onClick={() => stopFaceEdit()}>
                <X />
                Done painting
            </Button>
        </div>
    )
}
