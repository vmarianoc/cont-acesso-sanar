import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

/**
 * Leitura de QR pela câmera do próprio celular/tablet da portaria — sem
 * depender de leitor dedicado. Funciona no navegador (getUserMedia) e dentro
 * do app Android empacotado via Capacitor (permissão de câmera no manifest).
 */
export default function QrScanner({
  onScan,
  onClose,
}: {
  onScan: (texto: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let frame = 0
    let parado = false

    const iniciar = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (parado) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        const tick = () => {
          if (parado) return
          const canvas = canvasRef.current
          const ctx = canvas?.getContext('2d')
          if (canvas && ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            const imagem = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const resultado = jsQR(imagem.data, imagem.width, imagem.height)
            if (resultado?.data) {
              onScanRef.current(resultado.data)
              return
            }
          }
          frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      } catch {
        setErro('Não foi possível acessar a câmera. Verifique a permissão do navegador/app.')
      }
    }
    iniciar()

    return () => {
      parado = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
      <video ref={videoRef} className="max-w-full max-h-[70vh] rounded-lg" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />
      <p className="text-white/70 text-sm mt-4">Aponte a câmera para o QR do visitante</p>
      {erro && <p className="text-red-400 text-sm mt-2 max-w-xs text-center">{erro}</p>}
      <button
        onClick={onClose}
        className="mt-4 rounded-xl bg-white/10 hover:bg-white/20 text-white px-6 py-2 text-sm font-semibold"
      >
        Cancelar
      </button>
    </div>
  )
}
