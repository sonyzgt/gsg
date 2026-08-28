'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { THEMES, ThemeConfig } from '@/lib/themes'

interface ThemeContextType {
  theme: ThemeConfig
  setThemeId: (id: string) => void
  themes: ThemeConfig[]
}

const ThemeContext = createContext<ThemeContextType>({
  theme: THEMES[0],
  setThemeId: () => {},
  themes: THEMES,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<string>('white')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pons_theme_color')
      if (saved && THEMES.some((t) => t.id === saved)) {
        setThemeIdState(saved)
      }
    } catch { /* ignore */ }
  }, [])

  const currentTheme = THEMES.find((t) => t.id === themeId) || THEMES[0]

  const applyThemeVars = (t: ThemeConfig) => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.setAttribute('data-theme', t.id)
    root.style.setProperty('--accent', t.primary)
    root.style.setProperty('--accent-hover', t.primaryHover)
    root.style.setProperty('--theme-color', t.primary)
    root.style.setProperty('--theme-light', t.color)
    root.style.setProperty('--theme-dark', t.secondary)
    root.style.setProperty('--theme-glow', t.glow)
    root.style.setProperty('--theme-subtle', `${t.primary}25`)
    root.style.setProperty('--theme-border', `${t.primary}55`)
  }

  const setThemeId = (id: string) => {
    const target = THEMES.find((t) => t.id === id)
    if (!target) return
    setThemeIdState(id)
    try {
      localStorage.setItem('pons_theme_color', id)
    } catch { /* ignore */ }
    applyThemeVars(target)
  }

  useEffect(() => {
    applyThemeVars(currentTheme)
  }, [currentTheme])

  return (
    <ThemeContext.Provider value={{ theme: currentTheme, setThemeId, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
