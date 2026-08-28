import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
    'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide',
    {
        variants: {
            variant: {
                default: 'bg-primary/15 text-primary border border-primary/30',
                secondary: 'bg-secondary text-muted-foreground border border-border',
                destructive: 'bg-destructive/15 text-destructive border border-destructive/40',
                warning: 'bg-cat-occl/15 text-cat-occl border border-cat-occl/40',
                success: 'bg-cat-vanilla/15 text-cat-vanilla border border-cat-vanilla/40',
                coll: 'bg-cat-coll/15 text-cat-coll border border-cat-coll/40',
                occl: 'bg-cat-occl/15 text-cat-occl border border-cat-occl/40',
                prop: 'bg-cat-prop/15 text-cat-prop border border-cat-prop/40',
                asset: 'bg-cat-asset/15 text-cat-asset border border-cat-asset/40'
            }
        },
        defaultVariants: { variant: 'default' }
    }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
    return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
