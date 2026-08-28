'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useTokens } from '@/hooks/useTokens'
import { activeChain } from '@/lib/chains'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import toast from 'react-hot-toast'
import { useTheme } from '@/context/ThemeContext'
import SparkleIcon from '@/components/ui/SparkleIcon'

interface TokenListProps {
  onQuickSwap: (tokenAddress: string) => void
}

export default function TokenList({ onQuickSwap }: TokenListProps) {
  const { holdings, importToken, removeToken } = useTokens()
  const { theme } = useTheme()
  const [importOpen, setImportOpen] = useState(false)
  const [caInput, setCaInput] = useState('')

  async function copyAddress(addr: string) {
    await navigator.clipboard.writeText(addr)
    toast.success('Token address copied!')
  }

  function handleImportSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!caInput.trim()) return
    importToken(caInput.trim())
    setCaInput('')
    setImportOpen(false)
  }

  const totalTokensValueUsd = holdings.reduce((sum, h) => sum + (h.valueUsd || 0), 0)

  return (
    <div className="flex flex-col liquid-glass rounded-3xl shadow-2xl overflow-hidden w-full h-[380px] sm:h-[460px] flex-shrink-0">
      {/* Box Header - Aligned with Twitter Feed Frame Header */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/[0.08] bg-white/[0.02] flex-shrink-0">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <SparkleIcon size={16} className="flex-shrink-0" />
            <h2 className="text-sm sm:text-base font-bold text-zinc-100 flex items-center gap-2">
              <span>Your Holdings</span>
              <span className="text-[10px] sm:text-xs font-bold text-theme-light liquid-pill px-2 py-0.5 rounded-full font-mono border-theme">
                {holdings.length} {holdings.length === 1 ? 'Token' : 'Tokens'}
              </span>
            </h2>
          </div>
          <p className="text-[11px] sm:text-xs text-zinc-400 font-mono">
            Est. Portfolio Value:{' '}
            <span className="font-bold text-xs sm:text-sm font-mono text-theme-light">
              ${totalTokensValueUsd.toFixed(2)}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="accent"
            onClick={() => setImportOpen(true)}
            className="text-xs font-semibold py-2 px-3 sm:px-3.5"
          >
            + Import Token
          </Button>
        </div>
      </div>

      {/* Box Body - Scrollable Viewport */}
      <div className="flex-1 min-h-0 p-3 sm:p-5 flex flex-col gap-2.5 sm:gap-3 overflow-y-auto">
        {holdings.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[220px] p-8 text-center gap-3">
            <SparkleIcon size={44} className="flex-shrink-0" />
            <p className="text-sm font-bold text-zinc-200">No launched tokens found</p>
            <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
              Tokens with balance on Robinhood Chain automatically appear here. You can also import any custom token.
            </p>
            <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)} className="mt-1 text-xs py-1.5 px-3.5">
              + Import Custom Token
            </Button>
          </div>
        ) : (
          holdings.map((h) => {
            const hasBalance = h.balanceNumber > 0
            const explorerUrl = `${activeChain.blockExplorers.default.url}/token/${h.address}`

            return (
              <div
                key={h.address}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-4.5 rounded-2xl border bg-white/[0.02] border-white/[0.08] hover:border-theme transition-all shadow-md"
              >
                {/* Left: Token Info */}
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 flex items-center justify-center flex-shrink-0 relative">
                    <SparkleIcon size={40} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm sm:text-base font-bold text-zinc-100">{h.symbol}</span>
                      {hasBalance && (
                        <span className="text-[10px] font-bold text-theme-light liquid-pill px-2 py-0.5 rounded-full font-mono border-theme">
                          Holding
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-zinc-400 truncate max-w-[130px] sm:max-w-[180px]">{h.name}</span>
                      <span className="text-zinc-600">&bull;</span>
                      <button
                        onClick={() => copyAddress(h.address)}
                        className="text-[11px] font-mono text-zinc-500 hover:text-white transition-colors flex items-center gap-0.5 cursor-pointer"
                        title="Copy Contract Address"
                      >
                        <span>{h.address.slice(0, 6)}...{h.address.slice(-4)}</span>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right: Balance, USD Value & Quick Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-2.5 sm:pt-0 border-t sm:border-t-0 border-white/[0.06]">
                  <div className="text-left sm:text-right">
                    <p className="text-sm sm:text-base font-bold text-zinc-100 font-mono tracking-tight">
                      {h.balanceFormatted} <span className="text-xs text-zinc-400 font-sans">{h.symbol}</span>
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {h.usdPrice > 0 ? (
                        <>
                          <span className="font-bold font-mono text-theme-light">
                            ${h.valueUsd < 0.01 && h.valueUsd > 0 ? h.valueUsd.toFixed(6) : h.valueUsd.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-zinc-500 ml-1.5 font-mono">
                            (@${h.usdPrice < 0.01 ? h.usdPrice.toFixed(8) : h.usdPrice.toFixed(4)})
                          </span>
                        </>
                      ) : (
                        <span className="text-[11px] text-zinc-500">Price loading...</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => onQuickSwap(h.address)}
                      className="text-xs px-3 py-1.5 font-semibold"
                      title={`Swap ${h.symbol}`}
                    >
                      Swap
                    </Button>
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-400 hover:text-white transition-colors"
                      title="View on Explorer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                    {h.symbol !== 'CHEF' && (
                      <button
                        onClick={() => removeToken(h.address)}
                        className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Remove from watch list"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modal: Import Custom Token */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import Custom Token">
        <form onSubmit={handleImportSubmit} className="flex flex-col gap-4">
          <p className="text-xs text-zinc-400 leading-relaxed">
            Enter the token contract address on Robinhood Chain to track balances and enable instant buy/sell swaps.
          </p>

          <div>
            <label className="text-xs font-semibold text-zinc-300 mb-1.5 block">
              Contract Address (CA)
            </label>
            <input
              type="text"
              required
              value={caInput}
              onChange={(e) => setCaInput(e.target.value)}
              placeholder="0x... (Robinhood Chain address)"
              className="w-full bg-[#050b08] border border-white/[0.08] focus:border-theme rounded-xl px-4 py-2.5 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-[var(--theme-color)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="secondary" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Import Token
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

