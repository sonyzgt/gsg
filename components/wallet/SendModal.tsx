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

      await walletClient.sendTransaction({
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
    <Modal open={open} onClose={handleClose} title="// SEND_NATIVE_ETH">
      <div className="flex flex-col gap-4 font-mono select-none">
        {/* Network indicator */}
        <div className="flex items-center justify-between text-xs text-zinc-300 bg-[#121519] px-3.5 py-2 rounded-lg border-2 border-zinc-800 shadow-[2px_2px_0px_0px_#000000]">
          <span className="flex items-center gap-1.5 font-black uppercase text-white">
            <span
              className="w-1.5 h-1.5 rounded-none"
              style={{ backgroundColor: theme.color }}
            />
            ROBINHOOD MAINNET
          </span>
          {balance && (
            <span className="text-[11px] text-zinc-400">
              BAL: <strong className="text-theme-light font-black">{parseFloat(balance.formatted).toFixed(4)} ETH</strong>
            </span>
          )}
        </div>

        {/* Recipient Address */}
        <div>
          <label className="block text-xs font-black uppercase text-zinc-300 mb-1.5">
            RECIPIENT ADDRESS
          </label>
          <input
            type="text"
            placeholder="0x... (Robinhood Chain address)"
            value={to}
            onChange={(e) => setTo(e.target.value.trim())}
            className="w-full bg-[#121519] border-2 border-zinc-700 focus:border-white rounded-lg px-3.5 py-2 text-xs font-mono text-white placeholder-zinc-500 shadow-[2px_2px_0px_0px_#000000] focus:shadow-[3px_3px_0px_0px_#ffffff] focus:outline-none transition-all"
          />
          {to && !isValidAddress && (
            <p className="text-[11px] text-rose-400 mt-1 uppercase font-bold">Invalid address</p>
          )}
        </div>

        {/* Amount */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-black uppercase text-zinc-300">AMOUNT (ETH)</label>
            <button
              type="button"
              onClick={setMax}
              className="text-[10px] text-black font-black px-2 py-0.5 bg-[var(--theme-color)] border border-black shadow-[1px_1px_0px_0px_#000000] cursor-pointer"
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
              className="w-full bg-[#121519] border-2 border-zinc-700 focus:border-white rounded-lg px-3.5 py-2 text-xs font-mono font-bold text-white placeholder-zinc-500 shadow-[2px_2px_0px_0px_#000000] focus:shadow-[3px_3px_0px_0px_#ffffff] focus:outline-none transition-all pr-14"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-theme-light font-mono">
              ETH
            </span>
          </div>
          {amount && !hasEnoughBalance && (
            <p className="text-[11px] text-rose-400 mt-1 uppercase font-bold">Insufficient ETH balance</p>
          )}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose} disabled={sending}>
            CANCEL
          </Button>
          <Button
            variant="primary"
            onClick={handleSend}
            disabled={!canSend}
            loading={sending}
          >
            {sending ? 'SENDING...' : 'SEND ETH'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
