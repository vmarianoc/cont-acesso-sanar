import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react'

/** Casca de tela mobile (max-w-md, fundo areia). */
export function AppScreen({
  children,
  bottomNav = false,
}: {
  children: ReactNode
  bottomNav?: boolean
}) {
  return (
    <div className={`min-h-screen bg-areia max-w-md mx-auto ${bottomNav ? 'pb-24' : ''}`}>
      {children}
    </div>
  )
}

/** Cabeçalho arredondado. variant "brand" (carmim) ou "tinta" (escuro). */
export function Header({
  variant = 'brand',
  eyebrow,
  title,
  right,
  children,
}: {
  variant?: 'brand' | 'tinta'
  eyebrow?: string
  title?: string
  right?: ReactNode
  children?: ReactNode
}) {
  const bg = variant === 'tinta' ? 'bg-tinta' : 'bg-brand-600'
  const eyebrowColor = variant === 'tinta' ? 'text-white/50' : 'text-white/70'
  return (
    <header className={`${bg} rounded-b-3xl px-5 pt-6 pb-6 text-white`}>
      {children ? (
        children
      ) : (
        <div className="flex items-start justify-between">
          <div>
            {eyebrow && (
              <p className={`text-xs tracking-widest uppercase ${eyebrowColor}`}>{eyebrow}</p>
            )}
            {title && <h1 className="text-2xl font-bold mt-1">{title}</h1>}
          </div>
          {right}
        </div>
      )}
    </header>
  )
}

/** Logo condar (hexágono "c" + wordmark). */
export function Logo({ subtitle }: { subtitle?: string }) {
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

/** Tile redondo com emoji. */
export function IconTile({
  icon,
  bg = 'bg-brand-50',
  className = '',
}: {
  icon: ReactNode
  bg?: string
  className?: string
}) {
  return (
    <span className={`grid place-items-center rounded-xl ${bg} ${className || 'h-11 w-11 text-xl'}`}>
      {icon}
    </span>
  )
}

/** Cartão branco com ícone + título + subtítulo (clicável opcional). */
export function Card({
  icon,
  iconBg = 'bg-brand-600',
  titulo,
  sub,
  right,
  onClick,
}: {
  icon?: ReactNode
  iconBg?: string
  titulo: ReactNode
  sub?: ReactNode
  right?: ReactNode
  onClick?: () => void
}) {
  const Comp: any = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 text-left ${onClick ? 'active:opacity-80' : ''}`}
    >
      {icon !== undefined && <IconTile icon={icon} bg={iconBg} />}
      <span className="flex-1">
        <span className="block font-semibold text-gray-900">{titulo}</span>
        {sub && <span className="block text-sm text-gray-500">{sub}</span>}
      </span>
      {right}
    </Comp>
  )
}

/** Métrica (número grande + rótulo). */
export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 bg-gray-50 rounded-md p-3">
      <div className="break-words text-xl font-bold text-gray-900 sm:text-2xl">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'green' | 'red' | 'neutral'
}) {
  const tones = {
    green: 'text-green-700 bg-green-50',
    red: 'text-brand-700 bg-brand-50',
    neutral: 'text-gray-600 bg-gray-100',
  }
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost' }) {
  const variants = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700',
    outline: 'border border-gray-300 text-gray-800 hover:bg-gray-50',
    ghost: 'text-brand-600 hover:bg-brand-50',
  }
  return (
    <button
      {...props}
      className={`rounded-xl px-4 py-3 font-semibold transition-colors disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  )
}

export function TextField({
  label,
  mono,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; mono?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input
        {...props}
        className={`mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${mono ? 'font-mono' : ''}`}
      />
    </label>
  )
}

export interface NavItem {
  to: string
  label: string
  icon: ReactNode
}

/** Bottom nav mobile (router-agnóstico). */
export function BottomNav({
  items,
  current,
  onNavigate,
}: {
  items: NavItem[]
  current: string
  onNavigate: (to: string) => void
}) {
  return (
    <nav className="fixed bottom-0 inset-x-0 mx-auto max-w-md bg-white border-t border-gray-200 flex justify-around py-2 pb-[env(safe-area-inset-bottom)]">
      {items.map((i) => {
        const ativo = current === i.to
        return (
          <button
            key={i.to}
            onClick={() => onNavigate(i.to)}
            className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 ${ativo ? 'text-brand-600' : 'text-gray-400'}`}
          >
            <span className="text-xl">{i.icon}</span>
            <span className="max-w-full truncate text-xs font-medium">{i.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export function iniciais(nome: string) {
  return nome
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}
