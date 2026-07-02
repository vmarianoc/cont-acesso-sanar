export default function Logo({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/15 font-bold text-white">
        c
      </span>
      <span className="text-white font-bold text-lg lowercase tracking-tight">condar</span>
      {subtitle && <span className="text-white/60 text-sm">{subtitle}</span>}
    </div>
  )
}
