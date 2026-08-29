'use client'

import { useEffect, useRef } from 'react'

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

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    const GRID_SIZE = 36

    const render = () => {
      ctx.clearRect(0, 0, width, height)

      const cssColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--theme-color').trim() || '#10b981'

      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      // Draw subtle brutalist technical grid
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)'

      // Vertical lines
      for (let x = 0; x < width; x += GRID_SIZE) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }

      // Horizontal lines
      for (let y = 0; y < height; y += GRID_SIZE) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }

      // Draw grid intersection pluses/crosses (+)
      const crossSize = 2.5
      for (let x = 0; x < width; x += GRID_SIZE * 2) {
        for (let y = 0; y < height; y += GRID_SIZE * 2) {
          const dx = x - mx
          const dy = y - my
          const dist = Math.sqrt(dx * dx + dy * dy)
          const isNear = dist < 140

          ctx.strokeStyle = isNear ? cssColor : 'rgba(255, 255, 255, 0.12)'
          ctx.lineWidth = isNear ? 1.5 : 1

          ctx.beginPath()
          ctx.moveTo(x - crossSize, y)
          ctx.lineTo(x + crossSize, y)
          ctx.moveTo(x, y - crossSize)
          ctx.lineTo(x, y + crossSize)
          ctx.stroke()
        }
      }

      // Draw subtle interactive crosshair at cursor
      if (mx > 0 && my > 0) {
        ctx.strokeStyle = cssColor
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(mx, 0)
        ctx.lineTo(mx, height)
        ctx.moveTo(0, my)
        ctx.lineTo(width, my)
        ctx.stroke()
        ctx.setLineDash([])

        // Center box indicator
        ctx.strokeRect(mx - 8, my - 8, 16, 16)
      }

      animationFrameId = requestAnimationFrame(render)
    }

    animationFrameId = requestAnimationFrame(render)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none bg-[#08090a]">
      {/* Dark Brutalist Base */}
      <div className="absolute inset-0 bg-[#08090a]" />

      {/* Interactive Blueprint Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
    </div>
  )
}
