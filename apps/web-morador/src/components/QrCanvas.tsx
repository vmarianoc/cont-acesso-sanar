import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

export default function QrCanvas({ token }: { token: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) QRCode.toCanvas(ref.current, token, { width: 220, margin: 1 })
  }, [token])
  return <canvas ref={ref} className="mx-auto rounded-xl" />
}
