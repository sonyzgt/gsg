'use client'

import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { useWallet } from '@/hooks/useWallet'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

interface ReceiveModalProps {
  open: boolean
  onClose: () => void
}

export default function ReceiveModal({ open, onClose }: ReceiveModalProps) {
  const { address } = useWallet()
  const [copying, setCopying] = useState(false)

  async function copyAddress() {
    if (!address) return
    setCopying(true)
    await navigator.clipboard.writeText(address)
    toast.success('Address copied to clipboard!')
    setTimeout(() => setCopying(false), 1500)
  }

  return (
    <Modal open={open} onClose={onClose} title="// RECEIVE_ASSETS">
      <div className="flex flex-col items-center gap-4 font-mono select-none">
        {/* QR Code Frame */}
        <div className="p-3 bg-white border-2 border-black shadow-[4px_4px_0px_0px_#ffffff] rounded-none">
          {address ? (
            <QRCodeSVG
              value={address}
              size={170}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
            />
          ) : (
            <div className="w-[170px] h-[170px] flex items-center justify-center">
              <div className="w-8 h-8 animate-spin border-2 border-black border-t-transparent" />
            </div>
          )}
        </div>

        {/* Instructions */}
        <p className="text-zinc-400 text-xs text-center font-sans leading-relaxed">
          Scan the QR code or copy the address below to receive Native ETH and tokens on Robinhood Chain.
        </p>

        {/* Address */}
        {address && (
          <div className="w-full">
            <p className="text-[10px] text-zinc-400 mb-1.5 uppercase font-black tracking-wider">
              ACCOUNT ADDRESS
            </p>
            <div className="flex items-center gap-2 bg-[#121519] rounded-lg p-2.5 border-2 border-zinc-700 shadow-[2px_2px_0px_0px_#000000]">
              <code className="text-xs font-mono text-zinc-200 flex-1 break-all select-all">
                {address}
              </code>
              <button
                onClick={copyAddress}
                className="flex-shrink-0 px-2 py-1 rounded bg-[var(--theme-color)] text-black border border-black shadow-[1px_1px_0px_0px_#ffffff] active:translate-x-0.5 active:translate-y-0.5 text-[10px] font-black cursor-pointer"
                title="Copy Address"
              >
                {copying ? 'COPIED' : 'COPY'}
              </button>
            </div>
          </div>
        )}

        <Button onClick={onClose} variant="secondary" className="w-full py-2.5 text-xs font-black">
          CLOSE
        </Button>
      </div>
    </Modal>
  )
}
