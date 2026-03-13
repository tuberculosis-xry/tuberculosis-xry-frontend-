"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

export default function ModeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])

  if (!mounted) return (
    <button className="relative h-9 w-9 rounded-full border border-border/50 flex items-center justify-center">
      <Sun className="h-4 w-4" />
    </button>
  )

  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="relative h-9 w-9 rounded-full border border-border/50 bg-secondary/50 flex items-center justify-center hover:bg-secondary transition-all duration-300 hover:scale-110 hover:border-primary/30"
      aria-label="Toggle theme"
    >
      <Sun className={`h-4 w-4 transition-all duration-500 ${isDark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'} absolute`} />
      <Moon className={`h-4 w-4 transition-all duration-500 ${isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'} absolute`} />
    </button>
  )
}
