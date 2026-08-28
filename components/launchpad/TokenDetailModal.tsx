'use client'

import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { PonsV2TokenInfo } from '@/lib/pons-v2'
import { formatEther } from 'viem'
import toast from 'react-hot-toast'
import { useTheme } from '@/context/ThemeContext'
import TokenImage from '@/components/ui/TokenImage'

interface TokenDetailModalProps {
  token: PonsV2TokenInfo | null
  open: boolean
  onClose: () => void
  onOpenSwap?: (tokenCa: string) => void
}

export default function TokenDetailModal({
  token,
  open,
  onClose,
  onOpenSwap,
}: TokenDetailModalProps) {
  const { theme } = useTheme()
  if (!token) return null

  const raisedEth = parseFloat(formatEther(BigInt(token.realQuoteReserve || '0')))
  const targetEth = parseFloat(formatEther(BigInt(token.graduationThreshold || '5000000000000000000')))
  const progressPct = (token.progress * 100).toFixed(1)
  const isGraduated = token.phase === 2
  const explorerUrl = `https://robinhoodchain.blockscout.com/token/${token.tokenAddress}`

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied!`)
  }

  return (
    <Modal open={open} onClose={onClose} title={`${token.name} ($${token.symbol})`}>
      <div className="flex flex-col gap-4 max-h-[80vh] overflow-y-auto pr-1">
        {/* Header Profile */}
        <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-[#09110d] border border-white/[0.08]">
          <div
            style={{ borderColor: `${theme.primary}55` }}
            className="w-16 h-16 rounded-2xl bg-black border overflow-hidden relative flex-shrink-0 flex items-center justify-center shadow-lg"
          >
            <TokenImage
              src={token.logo}
              alt={token.symbol}
              size={64}
              sparkleSize={48}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-white truncate">{token.name}</h3>
              <span className="text-xs font-mono font-bold text-theme-light liquid-pill px-2 py-0.5 rounded-full border-theme">
                ${token.symbol}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase font-mono ${
                  isGraduated
                    ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                    : 'liquid-pill-active'
                }`}
              >
                {isGraduated ? 'Uniswap v4' : 'Bonding Curve'}
              </span>
            </div>

            <p className="text-xs text-zinc-400 font-mono mt-1">
              Supply: 1,000,000,000 • Fixed Supply
            </p>
          </div>
        </div>

        {/* Description */}
        {token.description && (
          <div className="bg-[#09110d]/60 border border-white/[0.06] p-3.5 rounded-2xl">
            <h4 className="text-xs font-semibold text-zinc-300 mb-1">About Token</h4>
            <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">
              {token.description}
            </p>
          </div>
        )}

        {/* Graduation Progress */}
        <div className="bg-[#09110d] border border-white/10 p-4 rounded-2xl flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-zinc-300">Graduation Progress</span>
            <span className="font-mono font-bold text-theme-light">{progressPct}%</span>
          </div>

          <div className="w-full h-2.5 bg-black/60 rounded-full overflow-hidden border border-white/[0.06] p-0.5">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(3, parseFloat(progressPct))}%`,
                background: `linear-gradient(to right, ${theme.secondary}, ${theme.primary}, ${theme.color})`,
                boxShadow: `0 0 10px ${theme.color}`,
              }}
            />
          </div>

          <div className="flex justify-between text-[11px] text-zinc-400 font-mono mt-0.5">
            <span>Raised: {raisedEth.toFixed(4)} ETH</span>
            <span>Target: {targetEth.toFixed(2)} ETH</span>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
          <div className="bg-black/60 border border-white/[0.06] rounded-xl p-3">
            <span className="text-zinc-500 text-[10px] uppercase block mb-0.5">Estimated Price (USD)</span>
            <span className="text-zinc-100 font-bold text-sm">
              ${token.priceUsd < 0.0001 ? token.priceUsd.toFixed(8) : token.priceUsd.toFixed(4)}
            </span>
          </div>
          <div className="bg-black/60 border border-white/[0.06] rounded-xl p-3">
            <span className="text-zinc-500 text-[10px] uppercase block mb-0.5">Creator Tax</span>
            <span className="font-bold text-sm text-theme-light">
              {(token.creatorTaxBps / 100).toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Addresses & Explorer */}
        <div className="bg-[#09110d] border border-white/[0.08] rounded-2xl p-3.5 flex flex-col gap-2 text-xs font-mono">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Token CA:</span>
            <div className="flex items-center gap-1.5">
              <code className="text-theme-light font-bold bg-black px-2 py-0.5 rounded-md border border-white/10">
                {token.tokenAddress.slice(0, 6)}...{token.tokenAddress.slice(-4)}
              </code>
              <button
                onClick={() => copyToClipboard(token.tokenAddress, 'Token CA')}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                title="Copy Address"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Curve Contract:</span>
            <div className="flex items-center gap-1.5">
              <code className="text-zinc-300 bg-black px-2 py-0.5 rounded-md border border-white/10">
                {token.curveAddress.slice(0, 6)}...{token.curveAddress.slice(-4)}
              </code>
              <button
                onClick={() => copyToClipboard(token.curveAddress, 'Curve Address')}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                title="Copy Address"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Creator Wallet:</span>
            <div className="flex items-center gap-1.5">
              <code className="text-zinc-400 bg-black px-2 py-0.5 rounded-md border border-white/10">
                {token.creatorAddress.slice(0, 6)}...{token.creatorAddress.slice(-4)}
              </code>
              <button
                onClick={() => copyToClipboard(token.creatorAddress, 'Creator Address')}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                title="Copy Address"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Socials & Links */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {token.socials?.twitter && (
            <a
              href={token.socials.twitter.startsWith('http') ? token.socials.twitter : `https://x.com/${token.socials.twitter.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-300 hover:text-white text-xs font-mono transition-colors"
            >
              <span>Twitter</span>
            </a>
          )}
          {token.socials?.telegram && (
            <a
              href={token.socials.telegram.startsWith('http') ? token.socials.telegram : `https://t.me/${token.socials.telegram.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-300 hover:text-white text-xs font-mono transition-colors"
            >
              <span>Telegram</span>
            </a>
          )}
          {token.socials?.website && (
            <a
              href={token.socials.website.startsWith('http') ? token.socials.website : `https://${token.socials.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-300 hover:text-white text-xs font-mono transition-colors"
            >
              <span>Website</span>
            </a>
          )}
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-emerald-400 hover:text-emerald-300 text-xs font-mono transition-colors ml-auto"
          >
            <span>Blockscout</span>
          </a>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <Button
            variant="primary"
            onClick={() => {
              onClose()
              onOpenSwap?.(token.tokenAddress)
            }}
            className="w-full py-3 text-sm font-bold gap-2"
          >
            <span>Trade / Swap ${token.symbol}</span>
          </Button>
        </div>
      </div>
    </Modal>
  )
}
