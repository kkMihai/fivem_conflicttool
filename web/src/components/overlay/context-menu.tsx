import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowsInLineHorizontal, ArrowsOutCardinal, Check, Cube, Eye, EyeSlash, Swap, Trash } from '@phosphor-icons/react'
import { cn, OCCL_DOTS } from '@/lib/utils'
import { useStore } from '@/store/use-store'

interface ItemProps {
    icon: React.ReactNode
    label: string
    onClick: () => void
    disabled?: boolean
    danger?: boolean
}

function Item({ icon, label, onClick, disabled, danger }: ItemProps) {
    return (
        <button
            type="button"
            role="menuitem"
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-2xs font-medium transition-colors duration-150 cursor-pointer',
                'disabled:pointer-events-none disabled:opacity-40',
                '[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0',
                danger ? 'text-destructive hover:bg-destructive/15' : 'hover:bg-accent'
            )}
        >
            {icon}
            <span className="truncate">{label}</span>
        </button>
    )
}

export function ContextMenu() {
    const ctx = useStore(s => s.ctxMenu)
    const conflicts = useStore(s => s.conflicts)
    const resolved = useStore(s => s.resolved)
    const occlEdit = useStore(s => s.occlEdit)
    const closeCtxMenu = useStore(s => s.closeCtxMenu)
    const editOccluder = useStore(s => s.editOccluder)
    const clipOccluder = useStore(s => s.clipOccluder)
    const zeroOccluder = useStore(s => s.zeroOccluder)
    const mergeOccluders = useStore(s => s.mergeOccluders)
    const decideEntity = useStore(s => s.decideEntity)
    const decideAsset = useStore(s => s.decideAsset)
    const startMove = useStore(s => s.startMove)
    const toggleIgnore = useStore(s => s.toggleIgnore)
    const ref = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

    useLayoutEffect(() => {
        if (!ctx) {
            setPos(null)
            return
        }
        const el = ref.current
        const w = el?.offsetWidth ?? 200
        const h = el?.offsetHeight ?? 220
        const pad = 8
        setPos({
            left: Math.min(Math.max(pad, ctx.x * window.innerWidth), Math.max(pad, window.innerWidth - w - pad)),
            top: Math.min(Math.max(pad, ctx.y * window.innerHeight), Math.max(pad, window.innerHeight - h - pad))
        })
        window.dispatchEvent(new Event('resize'))
    }, [ctx])

    if (!ctx) return null
    const c = conflicts.find(x => x.id === ctx.id)
    if (!c) return null

    const box = ctx.bx !== null && ctx.bx !== undefined ? c.boxes?.[ctx.bx] : null
    const gone = !!box && box.l === 0 && box.w === 0 && box.h === 0
    const boxLocked = !box?.rel || gone || !!occlEdit
    const live = c.boxes?.filter(b => b?.rel && !(b.l === 0 && b.w === 0 && b.h === 0)).length ?? 0
    const done = !!resolved[c.id]

    const run = (fn: () => void) => () => {
        closeCtxMenu()
        fn()
    }

    return (
        <>
            <div className="pointer-events-auto absolute inset-0" onMouseDown={() => closeCtxMenu()} aria-hidden="true" />
            <div
                ref={ref}
                data-panel=""
                role="menu"
                aria-label={`Actions for ${c.title}`}
                style={pos ? { left: pos.left, top: pos.top } : { left: `${ctx.x * 100}%`, top: `${ctx.y * 100}%` }}
                className="panel animate-rise pointer-events-auto absolute w-56 rounded-lg p-1"
            >
                <div className="flex items-center gap-1.5 border-b border-border px-2 pb-1.5 pt-1">
                    {box ? (
                        <span
                            className={cn('h-2 w-2 shrink-0 rounded-full', OCCL_DOTS[(ctx.bx ?? 0) % OCCL_DOTS.length])}
                            aria-hidden="true"
                        />
                    ) : (
                        <Cube className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                    <span className="truncate font-mono text-3xs">{box?.resource ?? c.title}</span>
                    {box && !gone && (
                        <span className="ml-auto shrink-0 text-3xs text-muted-foreground">
                            {box.l} x {box.w} x {box.h}
                        </span>
                    )}
                </div>
                <div className="mt-1 space-y-0.5">
                    {box && (
                        <>
                            <Item
                                icon={<ArrowsOutCardinal />}
                                label="Edit with gizmo"
                                disabled={boxLocked}
                                onClick={run(() => editOccluder(c, ctx.bx!))}
                            />
                            <Item
                                icon={<ArrowsInLineHorizontal />}
                                label="Shrink to clear overlap"
                                disabled={boxLocked}
                                onClick={run(() => clipOccluder(c, ctx.bx!))}
                            />
                            <Item
                                icon={<Trash />}
                                label="Remove this box"
                                danger
                                disabled={boxLocked}
                                onClick={run(() => zeroOccluder(c, ctx.bx!))}
                            />
                            <Item
                                icon={<Swap />}
                                label="Merge all into one"
                                disabled={live < 2 || !!occlEdit}
                                onClick={run(() => mergeOccluders(c))}
                            />
                        </>
                    )}
                    {!box && c.entity && (
                        <>
                            <Item icon={<Check />} label="Keep" onClick={run(() => decideEntity(c, 'keep'))} />
                            <Item icon={<ArrowsOutCardinal />} label="Move" onClick={run(() => startMove(c))} />
                            <Item icon={<Trash />} label="Remove" danger onClick={run(() => decideEntity(c, 'remove'))} />
                        </>
                    )}
                    {!box && !c.entity && c.kind === 'dup-file' && (
                        <Item
                            icon={<Check />}
                            label="Keep last, disable rest"
                            disabled={done}
                            onClick={run(() => decideAsset(c))}
                        />
                    )}
                    <div className="my-0.5 h-px bg-border" aria-hidden="true" />
                    <Item
                        icon={c.ignored ? <Eye /> : <EyeSlash />}
                        label={c.ignored ? 'Stop ignoring' : 'Ignore this conflict'}
                        onClick={run(() => toggleIgnore(c))}
                    />
                </div>
            </div>
        </>
    )
}
