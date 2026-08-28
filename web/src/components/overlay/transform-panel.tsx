import { ArrowLineDown, Check, GridFour, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStore } from '@/store/use-store'
import { fetchNui } from '@/lib/nui'
import { cn } from '@/lib/utils'

const axes = ['X', 'Y', 'Z'] as const
const rots = ['Roll', 'Pitch', 'Yaw'] as const
const axisColor = ['text-cat-coll', 'text-cat-vanilla', 'text-cat-prop']

export function TransformPanel() {
    const transform = useStore(s => s.transform)
    const endMove = useStore(s => s.endMove)
    const gizmoSpace = useStore(s => s.gizmoSpace)
    if (!transform) return null

    const setMode = (mode: 'translate' | 'rotate') => {
        useStore.setState({ transform: { ...transform, mode } })
        fetchNui('setGizmoMode', { mode })
    }

    const numChange = (kind: 'pos' | 'rot', idx: number, value: number) => {
        if (Number.isNaN(value)) return
        const pos = [...transform.pos] as [number, number, number]
        const rot = [...transform.rot] as [number, number, number]
        if (kind === 'pos') pos[idx] = value
        else rot[idx] = value
        useStore.setState({ transform: { ...transform, pos, rot } })
        fetchNui('applyTransformInput', { pos, rot })
    }

    return (
        <div data-panel="" className="panel animate-rise pointer-events-auto w-transform rounded-xl p-3">
            <div className="flex items-center gap-1.5">
                <span className="text-2xs font-bold">Transform</span>
                <span className="truncate font-mono text-3xs text-muted-foreground">{transform.name}</span>
                <div className="ml-auto flex gap-1">
                    <button
                        type="button"
                        aria-pressed={transform.mode === 'translate'}
                        className={cn(
                            'rounded-md px-1.5 py-0.5 text-3xs font-bold transition-colors duration-150 cursor-pointer',
                            transform.mode === 'translate'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                        onClick={() => setMode('translate')}
                    >
                        Move 2
                    </button>
                    <button
                        type="button"
                        aria-pressed={transform.mode === 'rotate'}
                        className={cn(
                            'rounded-md px-1.5 py-0.5 text-3xs font-bold transition-colors duration-150 cursor-pointer',
                            transform.mode === 'rotate'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                        onClick={() => setMode('rotate')}
                    >
                        Rotate 3
                    </button>
                </div>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 rounded-md border border-border bg-background px-1.5 py-1 text-3xs">
                <span className="text-muted-foreground">axes</span>
                <span className="font-bold">{gizmoSpace === 'local' ? 'Local' : 'Global'}</span>
                <span className="ml-auto text-muted-foreground">press X to switch</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
                {axes.map((a, i) => (
                    <div key={a}>
                        <div className={cn('text-3xs font-bold', axisColor[i])}>{a}</div>
                        <Input
                            type="number"
                            aria-label={`Position ${a}`}
                            className="font-mono"
                            step={0.05}
                            value={transform.pos[i].toFixed(2)}
                            onChange={e => numChange('pos', i, parseFloat(e.target.value))}
                        />
                    </div>
                ))}
                {rots.map((a, i) => (
                    <div key={a}>
                        <div className="text-3xs font-bold text-muted-foreground">{a}</div>
                        <Input
                            type="number"
                            aria-label={a}
                            className="font-mono"
                            step={1}
                            value={transform.rot[i].toFixed(1)}
                            onChange={e => numChange('rot', i, parseFloat(e.target.value))}
                        />
                    </div>
                ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
                <Button
                    variant={transform.grid ? 'default' : 'secondary'}
                    size="sm"
                    aria-pressed={!!transform.grid}
                    title="Snap movement to a grid (G)"
                    onClick={() => {
                        useStore.setState({ transform: { ...transform, grid: !transform.grid } })
                        fetchNui('setSnap', { grid: !transform.grid })
                    }}
                >
                    <GridFour aria-hidden="true" />
                    Grid
                </Button>
                <Button variant="secondary" size="sm" onClick={() => fetchNui('setSnap', { ground: true })}>
                    <ArrowLineDown aria-hidden="true" />
                    Ground
                </Button>
                <div className="ml-auto flex gap-1.5">
                    <Button variant="ghost" size="sm" title="Cancel transform (Esc)" aria-label="Cancel transform" onClick={() => endMove(false)}>
                        <X aria-hidden="true" />
                    </Button>
                    <Button size="sm" onClick={() => endMove(true)}>
                        <Check />
                        Apply
                    </Button>
                </div>
            </div>
        </div>
    )
}
