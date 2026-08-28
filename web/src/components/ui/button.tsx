import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 cursor-pointer',
    {
        variants: {
            variant: {
                default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/85',
                secondary:
                    'border border-border bg-secondary text-secondary-foreground hover:border-ring/30 hover:bg-accent',
                ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
                outline:
                    'border border-border bg-transparent text-foreground hover:border-primary/50 hover:bg-primary/10',
                destructive:
                    'border border-destructive/40 bg-destructive/15 text-destructive hover:border-destructive/60 hover:bg-destructive/25'
            },
            size: {
                default: 'h-8 px-3',
                sm: 'h-6.5 px-2 text-2xs',
                lg: 'h-9 px-4',
                icon: 'h-8 w-8'
            }
        },
        defaultVariants: { variant: 'default', size: 'default' }
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button'
        return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
