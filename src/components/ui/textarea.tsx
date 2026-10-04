import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-sm border border-input bg-muted px-3 py-2 text-base transition-[color,box-shadow,border-color,background-color] duration-150 ease-settle hover:border-border-strong outline-none placeholder:text-faint-foreground focus-visible:border-primary-soft focus-visible:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/16 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
