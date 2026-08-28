import { cn } from '@/lib/utils'

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <span
            className={cn(
                'kbd-key inline-flex min-w-5.5 items-center justify-center rounded-sm px-1 py-0.5 text-3xs font-semibold text-secondary-foreground',
                className
            )}
        >
            {children}
        </span>
    )
}
