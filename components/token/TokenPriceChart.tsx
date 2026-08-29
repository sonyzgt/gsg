'use client'

import { useState, useMemo } from 'react'
import { useTheme } from '@/context/ThemeContext'

interface TokenPriceChartProps {
  symbol: string
  currentPriceUsd: number
  currentPriceNative: number
  ethPriceUsd?: number
  phase?: number
}

interface PricePoint {
  time: string
  priceUsd: number
  priceNative: number
  high: number
  low: number
  open: number
  close: number
}

export default function TokenPriceChart({
  symbol,
  currentPriceUsd,
  currentPriceNative,
  ethPriceUsd = 2500,
}: TokenPriceChartProps) {
  const { theme } = useTheme()
  const [timeframe, setTimeframe] = useState<'1M' | '5M' | '15M' | '1H' | '1D'>('5M')
  const [chartType, setChartType] = useState<'area' | 'candle'>('area')
  const [hoveredPoint, setHoveredPoint] = useState<PricePoint | null>(null)

  // Generate synthetic on-chain curve trajectory points leading up to current real price
  const points: PricePoint[] = useMemo(() => {
    const totalPoints = timeframe === '1M' ? 20 : timeframe === '5M' ? 30 : timeframe === '15M' ? 40 : 50
    const baseNative = currentPriceNative > 0 ? currentPriceNative : 0.0000000025
    const startNative = baseNative * 0.45 // Initial curve starting price (~0.000000001 ETH)

    const list: PricePoint[] = []
    const now = Date.now()
    const stepMs = timeframe === '1M' ? 60000 : timeframe === '5M' ? 300000 : timeframe === '15M' ? 900000 : 3600000

    let prev = startNative

    for (let i = totalPoints - 1; i >= 0; i--) {
      const t = new Date(now - i * stepMs)
      const progressRatio = (totalPoints - 1 - i) / (totalPoints - 1)
      
      // Bonding curve upward curve formula + micro market noise
      const curveFactor = Math.pow(progressRatio, 1.4)
      const noise = (Math.sin(i * 1.7) * 0.05 + Math.cos(i * 0.9) * 0.04)
      const calculatedNative = i === 0 ? baseNative : startNative + (baseNative - startNative) * curveFactor * (1 + noise)
      const priceNat = Math.max(startNative * 0.8, calculatedNative)
      const priceU = priceNat * ethPriceUsd

      const open = prev * ethPriceUsd
      const close = priceU
      const high = Math.max(open, close) * (1 + Math.abs(Math.sin(i * 2.3)) * 0.02)
      const low = Math.min(open, close) * (1 - Math.abs(Math.cos(i * 1.9)) * 0.02)
      prev = priceNat

      list.push({
        time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        priceUsd: priceU,
        priceNative: priceNat,
        open,
        close,
        high,
        low,
      })
    }
    return list
  }, [currentPriceNative, ethPriceUsd, timeframe])

  // SVG dimensions
  const width = 800
  const height = 320
  const padding = { top: 25, right: 30, bottom: 35, left: 15 }

  const minPrice = Math.min(...points.map((p) => p.low)) * 0.95
  const maxPrice = Math.max(...points.map((p) => p.high)) * 1.05
  const priceRange = maxPrice - minPrice || 1

  const getY = (price: number) => {
    return height - padding.bottom - ((price - minPrice) / priceRange) * (height - padding.top - padding.bottom)
  }

  const getX = (index: number) => {
    const usableWidth = width - padding.left - padding.right
    return padding.left + (index / (points.length - 1)) * usableWidth
  }

  // SVG Area Path
  const linePath = useMemo(() => {
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.close).toFixed(1)}`)
      .join(' ')
  }, [points])

  const areaPath = useMemo(() => {
    const firstX = getX(0).toFixed(1)
    const lastX = getX(points.length - 1).toFixed(1)
    const bottomY = (height - padding.bottom).toFixed(1)
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`
  }, [linePath, points.length])

  const activePoint = hoveredPoint || points[points.length - 1]
  const startPoint = points[0]
  const priceChangePct = startPoint && activePoint ? (((activePoint.priceUsd - startPoint.priceUsd) / startPoint.priceUsd) * 100).toFixed(2) : '0.00'
  const isPositive = parseFloat(priceChangePct) >= 0

  return (
    <div
      style={{
        boxShadow: `4px 4px 0px 0px #000000`,
      }}
      className="flex flex-col bg-[#0e1115] border-2 border-white rounded-xl p-4 sm:p-6 overflow-hidden font-mono select-none"
    >
      {/* Chart Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b-2 border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              ${activePoint.priceUsd < 0.0001 ? activePoint.priceUsd.toFixed(8) : activePoint.priceUsd.toFixed(4)}
            </span>
            <span
              className={`text-xs font-black px-2 py-0.5 border ${
                isPositive
                  ? 'bg-[var(--theme-color)] text-black border-black shadow-[1px_1px_0px_0px_#000000]'
                  : 'bg-rose-600 text-white border-black shadow-[1px_1px_0px_0px_#000000]'
              }`}
            >
              {isPositive ? '+' : ''}
              {priceChangePct}%
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400">
            <span>
              1 {symbol} = {activePoint.priceNative < 0.00001 ? activePoint.priceNative.toFixed(10) : activePoint.priceNative.toFixed(6)} ETH
            </span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400 uppercase font-bold">{activePoint.time}</span>
          </div>
        </div>

        {/* Timeframe & Chart Style Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-black border-2 border-zinc-700 rounded-lg p-1 text-xs shadow-[2px_2px_0px_0px_#000000]">
            {(['1M', '5M', '15M', '1H', '1D'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 rounded transition-all cursor-pointer font-black ${
                  timeframe === tf
                    ? 'bg-[var(--theme-color)] text-black border border-black shadow-[1px_1px_0px_0px_#000000]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-black border-2 border-zinc-700 rounded-lg p-1 text-xs shadow-[2px_2px_0px_0px_#000000]">
            <button
              onClick={() => setChartType('area')}
              className={`px-2.5 py-1 rounded transition-all cursor-pointer font-black uppercase ${
                chartType === 'area'
                  ? 'bg-[var(--theme-color)] text-black border border-black shadow-[1px_1px_0px_0px_#000000]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              LINE
            </button>
            <button
              onClick={() => setChartType('candle')}
              className={`px-2.5 py-1 rounded transition-all cursor-pointer font-black uppercase ${
                chartType === 'candle'
                  ? 'bg-[var(--theme-color)] text-black border border-black shadow-[1px_1px_0px_0px_#000000]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              CANDLES
            </button>
          </div>
        </div>
      </div>

      {/* SVG Canvas Container */}
      <div className="relative w-full h-[280px] sm:h-[320px] pt-4 select-none">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          onMouseLeave={() => setHoveredPoint(null)}
        >
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.color} stopOpacity="0.35" />
              <stop offset="60%" stopColor={theme.color} stopOpacity="0.08" />
              <stop offset="100%" stopColor={theme.color} stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="lineGlow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={theme.secondary || theme.primary} />
              <stop offset="100%" stopColor={theme.color} />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((pct) => {
            const y = padding.top + pct * (height - padding.top - padding.bottom)
            const priceVal = maxPrice - pct * priceRange
            return (
              <g key={pct}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="rgba(255,255,255,0.04)"
                  strokeDasharray="4 4"
                />
                <text
                  x={width - padding.right + 4}
                  y={y + 3}
                  fill="rgba(255,255,255,0.25)"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  ${priceVal < 0.0001 ? priceVal.toFixed(6) : priceVal.toFixed(4)}
                </text>
              </g>
            )
          })}

          {chartType === 'area' ? (
            <>
              {/* Area Fill */}
              <path d={areaPath} fill="url(#chartGradient)" />

              {/* Smooth Main Price Stroke */}
              <path
                d={linePath}
                fill="none"
                stroke="url(#lineGlow)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* End Point Glow Indicator */}
              {points.length > 0 && (
                <g>
                  <circle
                    cx={getX(points.length - 1)}
                    cy={getY(points[points.length - 1].close)}
                    r="5"
                    fill={theme.color}
                    className="animate-pulse"
                  />
                  <circle
                    cx={getX(points.length - 1)}
                    cy={getY(points[points.length - 1].close)}
                    r="2"
                    fill="#ffffff"
                  />
                </g>
              )}
            </>
          ) : (
            // Candlestick rendering
            points.map((p, i) => {
              const x = getX(i)
              const yOpen = getY(p.open)
              const yClose = getY(p.close)
              const yHigh = getY(p.high)
              const yLow = getY(p.low)
              const isGreen = p.close >= p.open
              const candleWidth = Math.max(3, (width / points.length) * 0.6)

              return (
                <g key={i}>
                  {/* High/Low Wick */}
                  <line
                    x1={x}
                    y1={yHigh}
                    x2={x}
                    y2={yLow}
                    stroke={isGreen ? theme.color : '#f43f5e'}
                    strokeWidth="1.5"
                  />
                  {/* Body */}
                  <rect
                    x={x - candleWidth / 2}
                    y={Math.min(yOpen, yClose)}
                    width={candleWidth}
                    height={Math.max(2, Math.abs(yClose - yOpen))}
                    fill={isGreen ? theme.color : '#f43f5e'}
                    rx="1"
                  />
                </g>
              )
            })
          )}

          {/* Interactive Mouse Hover Overlay Zones */}
          {points.map((p, i) => {
            const x = getX(i)
            const zoneWidth = width / points.length
            return (
              <rect
                key={i}
                x={x - zoneWidth / 2}
                y={0}
                width={zoneWidth}
                height={height}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoveredPoint(p)}
              />
            )
          })}

          {/* Hover Crosshair */}
          {hoveredPoint && (
            <g>
              <line
                x1={getX(points.indexOf(hoveredPoint))}
                y1={padding.top}
                x2={getX(points.indexOf(hoveredPoint))}
                y2={height - padding.bottom}
                stroke={theme.color}
                strokeOpacity="0.4"
                strokeDasharray="3 3"
              />
              <circle
                cx={getX(points.indexOf(hoveredPoint))}
                cy={getY(hoveredPoint.close)}
                r="4"
                fill={theme.color}
                stroke="#000000"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Bottom Time Axis */}
      <div className="flex justify-between items-center px-4 pt-2 border-t border-white/[0.04] text-[10px] font-mono text-zinc-500">
        <span>{points[0]?.time}</span>
        <span>{points[Math.floor(points.length / 2)]?.time}</span>
        <span>{points[points.length - 1]?.time} (Now)</span>
      </div>
    </div>
  )
}
