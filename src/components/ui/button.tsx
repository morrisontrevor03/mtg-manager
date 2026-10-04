import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

/*
 * Every variant shares `press` (lift on hover, sink when held). `default` is the
 * burnished amber key with the hover sheen; `outline` is the quiet bordered
 * button used for most secondary actions.
 */
const buttonVariants = cva(
  "press inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "sheen border border-black/25 bg-linear-to-b from-primary to-primary-soft font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,240,214,0.28),var(--shadow-sm)] hover:brightness-107 hover:shadow-[inset_0_1px_0_rgba(255,240,214,0.32),var(--shadow-md)] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)]",
        destructive:
          "border border-destructive/40 bg-destructive/15 text-destructive shadow-hairline hover:border-destructive/60 hover:bg-destructive/25 focus-visible:ring-destructive/40",
        outline:
          "border border-border bg-muted text-foreground shadow-hairline hover:border-border-strong hover:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground shadow-hairline hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline [&]:hover:translate-y-0",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
