import * as React from 'react'
import { cn } from '@/lib/utils'

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
    value?: number
    label?: string
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(({ className, value = 0, label, ...props }, ref) => (
    <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(100, Math.max(0, value)))}
        aria-label={label}
        className={cn('relative h-1.5 w-full overflow-hidden rounded-full border border-border bg-muted', className)}
        {...props}
    >
        <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
    </div>
))
Progress.displayName = 'Progress'

export { Progress }
