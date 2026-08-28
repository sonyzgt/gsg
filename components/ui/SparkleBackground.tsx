'use client'

import { useEffect, useRef } from 'react'

interface HexCell {
  cx: number
  cy: number
  radius: number
  currentAlpha: number
  targetAlpha: number
  pulseSpeed: number
  isAmbientPulse: boolean
}

export default function SparkleBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mouseRef = useRef<{ x: number; y: number }>({ x: -2000, y: -2000 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        mouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }
    }
    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    // Narrowed non-null reference used by all nested functions
    const context = ctx as CanvasRenderingContext2D

    const R = 32
    const horizDist = Math.sqrt(3) * R
    const vertDist = 1.5 * R

    let cells: HexCell[] = []

    function initCells() {
      cells = []
      const cols = Math.ceil(width / horizDist) + 2
      const rows = Math.ceil(height / vertDist) + 2
      for (let r = -1; r < rows; r++) {
        for (let c = -1; c < cols; c++) {
          const xOffset = r % 2 !== 0 ? horizDist / 2 : 0
          const cx = c * horizDist + xOffset
          const cy = r * vertDist
          cells.push({
            cx, cy,
            radius: R - 1.5,
            currentAlpha: 0.04,
            targetAlpha: 0.04,
            pulseSpeed: Math.random() * 0.02 + 0.01,
            isAmbientPulse: false,
          })
        }
      }
    }

    initCells()

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
      initCells()
    }
    window.addEventListener('resize', handleResize)

    function drawHexagon(cx: number, cy: number, radius: number) {
      context.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 6 + (i * Math.PI) / 3
        const x = cx + radius * Math.cos(angle)
        const y = cy + radius * Math.sin(angle)
        if (i === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      }
      context.closePath()
    }

    // Parse hex color string to r,g,b integers
    function parseHex(hex: string): [number, number, number] {
      const h = hex.replace('#', '')
      if (h.length !== 6) return [16, 185, 129]
      return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
      ]
    }

    let ambientTimer = 0
    const hoverRadius = 180

    const render = (time: number) => {
      context.clearRect(0, 0, width, height)

      // Read CSS variable EVERY frame — guaranteed to reflect current theme instantly
      const cssColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--theme-color').trim() || '#10b981'
      const [r, g, b] = parseHex(cssColor)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      // Ambient random pulse
      if (time - ambientTimer > 500) {
        ambientTimer = time
        const idx = Math.floor(Math.random() * cells.length)
        if (cells[idx]) cells[idx].currentAlpha = Math.random() * 0.45 + 0.2
      }

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]

        // Cursor proximity
        const dx = cell.cx - mx
        const dy = cell.cy - my
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < hoverRadius) {
          const factor = 1 - dist / hoverRadius
          const intensity = Math.pow(factor, 1.5) * 0.92
          cell.currentAlpha = Math.max(cell.currentAlpha, intensity)
        }

        // Smooth fade back to baseline
        cell.currentAlpha += (0.04 - cell.currentAlpha) * 0.05
        const alpha = Math.min(1, Math.max(0.03, cell.currentAlpha))

        // Fill (active cells only)
        if (alpha > 0.08) {
          context.save()
          drawHexagon(cell.cx, cell.cy, cell.radius)
          context.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.2})`
          if (alpha > 0.35) {
            context.shadowBlur = 18
            context.shadowColor = cssColor
          }
          context.fill()
          context.restore()
        }

        // Border
        context.save()
        drawHexagon(cell.cx, cell.cy, cell.radius)
        if (alpha > 0.12) {
          context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha * 1.1)})`
          context.lineWidth = alpha > 0.4 ? 1.8 : 1.2
          if (alpha > 0.3) {
            context.shadowBlur = 12
            context.shadowColor = cssColor
          }
        } else {
          context.strokeStyle = 'rgba(255, 255, 255, 0.055)'
          context.lineWidth = 0.8
        }
        context.stroke()
        context.restore()
      }

      animationFrameId = requestAnimationFrame(render)
    }

    animationFrameId = requestAnimationFrame(render)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  // Read theme from CSS variable for the ambient orbs in JSX
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none bg-[#000000]">
      {/* Pure Black Base */}
      <div className="absolute inset-0 bg-[#000000]" />

      {/* Ambient Glow Orbs — use CSS vars so they always follow theme */}
      <div
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[850px] h-[550px] opacity-35 blur-[140px] pointer-events-none transition-all duration-700"
        style={{
          background: 'radial-gradient(circle, var(--theme-glow, rgba(16,185,129,0.35)) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute -bottom-48 left-1/3 w-[700px] h-[550px] opacity-20 blur-[140px] pointer-events-none transition-all duration-700"
        style={{
          background: 'radial-gradient(circle, var(--theme-glow, rgba(16,185,129,0.35)) 0%, transparent 75%)',
        }}
      />

      {/* Interactive Honeycomb Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
    </div>
  )
}

