'use client'

import { useState } from 'react'
import { isAddress, parseEther, getAddress, createWalletClient, custom } from 'viem'
import { useWallet } from '@/hooks/useWallet'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'
import { activeChain } from '@/lib/chains'
import { useTheme } from '@/context/ThemeContext'

interface SendModalProps {
  open: boolean
  onClose: () => void
}

export default function SendModal({ open, onClose }: SendModalProps) {
  const { balance, refetchBalance, embeddedWallet, address } = useWallet()
  const { theme } = useTheme()

  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [sending, setSending] = useState(false)

  const isValidAddress = isAddress(to)
  const isValidAmount = parseFloat(amount) > 0 && !isNaN(parseFloat(amount))
  const hasEnoughBalance =
    balance && parseFloat(amount) <= parseFloat(balance.formatted)

  const canSend = isValidAddress && isValidAmount && hasEnoughBalance && !sending && !!address && !!embeddedWallet

  async function handleSend() {
    if (!canSend || !embeddedWallet || !address) return
    setSending(true)

    try {
      await embeddedWallet.switchChain(activeChain.id)
      const provider = await embeddedWallet.getEthereumProvider()
      const walletClient = createWalletClient({
        chain: activeChain,
        transport: custom(provider),
      })
      const [account] = await walletClient.getAddresses()

      const targetAddress = getAddress(to.trim())
      const valueInWei = parseEther(amount.trim())

      toast('Sending ETH transaction...')

      const txHash = await walletClient.sendTransaction({
        account,
        to: targetAddress,
        value: valueInWei,
      })

      toast.success('ETH successfully sent!')
      await refetchBalance()
      handleClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      if (
        msg.toLowerCase().includes('cancel') ||
        msg.toLowerCase().includes('reject') ||
        msg.toLowerCase().includes('denied') ||
        msg.toLowerCase().includes('aborted') ||
        msg.toLowerCase().includes('user rejected')
      ) {
        toast.error('Transaction canceled.')
      } else if (msg.toLowerCase().includes('insufficient funds') || msg.toLowerCase().includes('exceeds')) {
        toast.error('Insufficient ETH for amount + gas fee.')
      } else {
        toast.error(msg.slice(0, 100))
      }
    } finally {
      setSending(false)
    }
  }

  function handleClose() {
    setTo('')
    setAmount('')
    onClose()
  }

  function setMax() {
    if (balance) {
      const maxEth = Math.max(0, parseFloat(balance.formatted) - 0.0001)
      setAmount(maxEth > 0 ? maxEth.toFixed(4) : '0')
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Send ETH — Robinhood Chain">
      <div className="flex flex-col gap-4">
        {/* Network indicator */}
        <div className="flex items-center justify-between text-xs text-zinc-400 bg-white/[0.02] px-3.5 py-2.5 rounded-xl border border-white/[0.08]">
          <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: theme.color, boxShadow: `0 0 8px ${theme.color}` }}
            />
            Robinhood Chain Mainnet
          </span>
          {balance && (
            <span className="font-mono text-zinc-400">
              Balance: <strong className="text-theme-light font-bold">{parseFloat(balance.formatted).toFixed(4)} ETH</strong>
            </span>
          )}
        </div>

        {/* Recipient Address */}
        <div>
          <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
            Recipient Address
          </label>
          <input
            type="text"
            placeholder="0x... (Robinhood Chain address)"
            value={to}
            onChange={(e) => setTo(e.target.value.trim())}
            className="w-full bg-[#050b08] border border-white/[0.08] focus:border-theme rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-[var(--theme-color)] transition-all"
          />
          {to && !isValidAddress && (
            <p className="text-xs text-rose-400 mt-1">Invalid Ethereum / Robinhood address</p>
          )}
        </div>

        {/* Amount */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-zinc-300">Amount (ETH)</label>
            <button
              type="button"
              onClick={setMax}
              className="text-xs text-theme-light font-bold px-2 py-0.5 rounded liquid-pill border-theme font-mono cursor-pointer"
            >
              MAX
            </button>
          </div>
          <div className="relative">
            <input
              type="number"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              step="any"
              min="0"
              className="w-full bg-[#050b08] border border-white/[0.08] focus:border-theme rounded-xl px-3.5 py-2.5 text-sm font-bold text-white placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-[var(--theme-color)] pr-16 transition-all font-mono"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-theme-light font-mono">
              ETH
            </span>
          </div>
          {amount && !hasEnoughBalance && (
            <p className="text-xs text-rose-400 mt-1">Insufficient ETH balance</p>
          )}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose} disabled={sending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSend}
            disabled={!canSend}
            loading={sending}
          >
            {sending ? 'Awaiting Wallet...' : 'Send ETH'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
