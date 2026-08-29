'use client'

import { useState } from 'react'
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
    <div
      style={{
        boxShadow: `4px 4px 0px 0px #000000`,
      }}
      className="flex flex-col bg-[#0e1115] border-2 border-white rounded-xl overflow-hidden w-full h-[380px] sm:h-[460px] flex-shrink-0 font-mono select-none"
    >
      {/* Box Header */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b-2 border-zinc-800 bg-[#12151a] flex-shrink-0">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-xs sm:text-sm font-black uppercase text-white flex items-center gap-2">
              <span>// HOLDINGS</span>
              <span className="text-[10px] font-black px-1.5 py-0.2 bg-zinc-800 border border-zinc-700 text-theme-light rounded">
                [{holdings.length} TOKENS]
              </span>
            </h2>
          </div>
          <p className="text-[11px] text-zinc-400">
            EST. VALUE:{' '}
            <span className="font-black text-xs text-white">
              ${totalTokensValueUsd.toFixed(2)}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={() => setImportOpen(true)}
            className="text-xs font-black py-1.5 px-3"
          >
            + IMPORT
          </Button>
        </div>
      </div>

      {/* Box Body - Scrollable Viewport */}
      <div className="flex-1 min-h-0 p-3 sm:p-4 flex flex-col gap-2.5 overflow-y-auto">
        {holdings.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[220px] p-6 text-center gap-3">
            <SparkleIcon size={32} className="flex-shrink-0" />
            <p className="text-sm font-black uppercase text-white">NO HOLDINGS FOUND</p>
            <p className="text-xs text-zinc-400 max-w-sm font-sans">
              Tokens with balance on Robinhood Chain automatically appear here.
            </p>
            <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)} className="mt-1 text-xs py-1.5 px-3.5">
              + IMPORT CUSTOM TOKEN
            </Button>
          </div>
        ) : (
          holdings.map((h) => {
            const hasBalance = h.balanceNumber > 0
            const explorerUrl = `${activeChain.blockExplorers.default.url}/token/${h.address}`

            return (
              <div
                key={h.address}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg bg-[#111419] border-2 border-zinc-800 hover:border-white shadow-[2px_2px_0px_0px_#000000] hover:shadow-[3px_3px_0px_0px_var(--theme-color)] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
              >
                {/* Left: Token Info */}
                <div className="flex items-center gap-3">
                  <SparkleIcon size={28} className="flex-shrink-0" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-black text-white">{h.symbol}</span>
                      {hasBalance && (
                        <span className="text-[9px] font-black bg-[var(--theme-color)] text-black px-1.5 py-0.2 border border-black">
                          HELD
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-zinc-400 truncate max-w-[130px] font-sans">{h.name}</span>
                      <span className="text-zinc-600">/</span>
                      <button
                        onClick={() => copyAddress(h.address)}
                        className="text-[10px] text-zinc-500 hover:text-white transition-colors flex items-center gap-0.5 cursor-pointer"
                        title="Copy Contract Address"
                      >
                        <span>{h.address.slice(0, 4)}...{h.address.slice(-4)}</span>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right: Balance & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800">
                  <div className="text-left sm:text-right">
                    <p className="text-sm font-black text-white">
                      {h.balanceFormatted} <span className="text-xs text-theme-light">{h.symbol}</span>
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      {h.usdPrice > 0 ? (
                        <>
                          <span className="font-bold text-white">
                            ${h.valueUsd < 0.01 && h.valueUsd > 0 ? h.valueUsd.toFixed(4) : h.valueUsd.toFixed(2)}
                          </span>
                          <span className="text-zinc-500 ml-1">
                            (@${h.usdPrice < 0.01 ? h.usdPrice.toFixed(6) : h.usdPrice.toFixed(2)})
                          </span>
                        </>
                      ) : (
                        <span className="text-zinc-500">PRICE SYNC...</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => onQuickSwap(h.address)}
                      className="px-2.5 py-1 rounded bg-[var(--theme-color)] text-black border border-black shadow-[1px_1px_0px_0px_#ffffff] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none text-xs font-black transition-all cursor-pointer"
                      title={`Swap ${h.symbol}`}
                    >
                      SWAP
                    </button>
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded bg-[#181b20] hover:bg-white text-zinc-300 hover:text-black border border-zinc-700 hover:border-white shadow-[1px_1px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                      title="View on Explorer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                    {h.symbol !== 'CHEF' && (
                      <button
                        onClick={() => removeToken(h.address)}
                        className="p-1.5 rounded bg-[#181b20] hover:bg-rose-600 text-zinc-400 hover:text-white border border-zinc-700 hover:border-white shadow-[1px_1px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                        title="Remove from watch list"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
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
          <p className="text-xs text-zinc-300 font-sans leading-relaxed">
            Enter the token contract address on Robinhood Chain to track balances and enable instant buy/sell swaps.
          </p>

          <div>
            <label className="text-xs font-black uppercase text-white mb-1.5 block">
              CONTRACT ADDRESS (0x...)
            </label>
            <input
              type="text"
              required
              value={caInput}
              onChange={(e) => setCaInput(e.target.value)}
              placeholder="0x..."
              className="w-full bg-[#121519] border-2 border-zinc-700 focus:border-white rounded-lg px-3.5 py-2.5 text-xs font-mono text-white placeholder-zinc-500 shadow-[2px_2px_0px_0px_#000000] focus:shadow-[3px_3px_0px_0px_#ffffff] focus:outline-none transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="secondary" onClick={() => setImportOpen(false)}>
              CANCEL
            </Button>
            <Button variant="primary" type="submit">
              IMPORT
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
