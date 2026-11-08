import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion'
import * as Icons from 'lucide-react'
import { ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { cx, inr } from '../lib/util'

export function Icon({ name, className, strokeWidth = 2 }: { name: string; className?: string; strokeWidth?: number }) {
  const C = (Icons as any)[name] || Icons.Circle
  return <C className={className} strokeWidth={strokeWidth} />
}

export function Logo({ small, to = '/' }: { small?: boolean; to?: string }) {
  return (
    <Link to={to} className="group inline-flex items-center gap-2.5">
      <span className={cx('relative grid place-items-center rounded-xl red-gradient shadow-glow transition-transform group-hover:rotate-[-6deg]', small ? 'h-8 w-8' : 'h-9 w-9')}>
        <svg viewBox="0 0 64 64" className={small ? 'h-5 w-5' : 'h-6 w-6'}>
          <path d="M20 16v19a12 12 0 0 0 24 0V16" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
          <circle cx="44" cy="47" r="5" fill="#fff" />
        </svg>
      </span>
      <span className={cx('font-extrabold tracking-tight text-white', small ? 'text-[17px]' : 'text-xl')}>
        udyam<span className="text-red-500">one</span>
      </span>
    </Link>
  )
}

type BtnProps = {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'outline' | 'white'; size?: 'sm' | 'md' | 'lg'
  className?: string; disabled?: boolean; loading?: boolean; icon?: string; iconRight?: string; type?: 'button' | 'submit'
}

export function Button({ children, onClick, variant = 'primary', size = 'md', className, disabled, loading, icon, iconRight, type = 'button' }: BtnProps) {
  const [shine, setShine] = useState(0)
  const base = 'group relative inline-flex select-none items-center justify-center gap-2 overflow-hidden rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50'
  const sizes = { sm: 'h-9 px-4 text-sm', md: 'h-11 px-5 text-[15px]', lg: 'h-14 px-7 text-base' }
  const variants = {
    primary: 'bg-red-600 text-white shadow-glow hover:bg-red-500',
    white: 'bg-white text-ink-900 hover:bg-ink-100',
    outline: 'border border-white/15 bg-white/[.03] text-white hover:border-white/30 hover:bg-white/[.07]',
    ghost: 'text-ink-200 hover:bg-white/[.06] hover:text-white',
  }
  return (
    <motion.button
      type={type}
      whileTap={{ scale: disabled ? 1 : 0.96 }}
      whileHover={{ y: disabled ? 0 : -1 }}
      onHoverStart={() => setShine((s) => s + 1)}
      onClick={onClick}
      disabled={disabled || loading}
      className={cx(base, sizes[size], variants[variant], className)}
    >
      {variant === 'primary' && (
        <span key={shine} className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      )}
      {loading ? <Icons.Loader2 className="h-4 w-4 animate-spin" /> : icon && <Icon name={icon} className="h-4 w-4" />}
      <span className="relative">{children}</span>
      {iconRight && !loading && <Icon name={iconRight} className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
    </motion.button>
  )
}

export function Money({ value, className, prefix = '₹' }: { value: number; className?: string; prefix?: string }) {
  const mv = useMotionValue(value)
  const text = useTransform(mv, (v) => prefix + Math.round(v).toLocaleString('en-IN'))
  const [flash, setFlash] = useState(0)
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.7, ease: [0.22, 1, 0.36, 1] })
    setFlash((f) => f + 1)
    return c.stop
  }, [value, mv])
  return (
    <motion.span key={flash} initial={{ color: '#ffffff' }} animate={{ color: ['#FF4A4A', '#ffffff'] }} transition={{ duration: 0.9 }} className={cx('tabular-nums', className)}>
      <motion.span>{text}</motion.span>
    </motion.span>
  )
}

export function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300', on ? 'bg-red-600' : 'bg-ink-600', disabled && 'opacity-40')}
      aria-pressed={on}
    >
      <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 32 }} className={cx('absolute top-1 h-5 w-5 rounded-full bg-white shadow', on ? 'right-1' : 'left-1')} />
    </button>
  )
}

export function Segmented<T extends string>({ options, value, onChange, id }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; id: string }) {
  return (
    <div className="relative inline-flex rounded-full border border-white/10 bg-ink-850 p-1">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={cx('relative z-10 rounded-full px-4 py-2 text-sm font-semibold transition-colors', value === o.value ? 'text-white' : 'text-ink-300 hover:text-white')}>
          {value === o.value && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 -z-10 rounded-full bg-red-600 shadow-glow" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Md({ text, className }: { text?: string; className?: string }) {
  if (!text) return null
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return (
    <span className={cx('whitespace-pre-line', className)}>
      {parts.map((p, i) =>
        p.startsWith('**') ? <strong key={i} className="font-bold text-white">{p.slice(2, -2)}</strong>
          : p.startsWith('*') && p.length > 2 ? <em key={i} className="not-italic font-semibold">{p.slice(1, -1)}</em> : <span key={i}>{p}</span>,
      )}
    </span>
  )
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'red' | 'green' | 'amber'; className?: string }) {
  const tones = {
    neutral: 'border-white/10 bg-white/[.05] text-ink-200',
    red: 'border-red-500/30 bg-red-600/15 text-red-300',
    green: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300',
    amber: 'border-amber-400/25 bg-amber-500/10 text-amber-300',
  }
  return <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider', tones[tone], className)}>{children}</span>
}

export const STEPS = [
  { key: 'discover', label: 'Tell us', icon: 'MessageCircleHeart' },
  { key: 'bundle', label: 'Your plan', icon: 'Package' },
  { key: 'verify', label: 'Verify', icon: 'ScanLine' },
  { key: 'pay', label: 'Pay', icon: 'Wallet' },
  { key: 'track', label: 'Go live', icon: 'Rocket' },
] as const

export function Stepper({ stage, onPick }: { stage: string; onPick?: (k: string) => void }) {
  const idx = STEPS.findIndex((s) => s.key === stage)
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {STEPS.map((s, i) => {
        const done = i < idx, cur = i === idx
        return (
          <div key={s.key} className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => (done || cur) && onPick?.(s.key)}
              className={cx('relative flex items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-[13px]',
                cur ? 'text-white' : done ? 'text-ink-100 hover:bg-white/5' : 'text-ink-400')}
            >
              {cur && <motion.span layoutId="step-pill" className="absolute inset-0 rounded-full bg-red-600/15 ring-1 ring-red-500/40" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
              <span className={cx('relative grid h-6 w-6 place-items-center rounded-full text-[11px] transition-colors',
                done ? 'bg-red-600 text-white' : cur ? 'bg-white text-ink-900' : 'bg-ink-700 text-ink-300')}>
                {done ? <Icons.Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className="relative hidden md:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className="relative h-[2px] w-4 overflow-hidden rounded bg-ink-600 sm:w-8">
                <motion.div className="absolute inset-y-0 left-0 bg-red-600" initial={false} animate={{ width: i < idx ? '100%' : '0%' }} transition={{ duration: 0.6, ease: 'easeOut' }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}

export function Sheet({ open, onClose, children, title, wide }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode; wide?: boolean }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className={cx('relative z-10 max-h-[88vh] w-full overflow-auto rounded-t-3xl border border-white/10 bg-ink-850 p-6 shadow-2xl sm:rounded-3xl', wide ? 'sm:max-w-4xl' : 'sm:max-w-lg')}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="text-lg font-bold">{title}</div>
              <button onClick={onClose} className="rounded-full p-1.5 text-ink-300 hover:bg-white/10 hover:text-white"><Icons.X className="h-5 w-5" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export function Toast({ text }: { text: string | null }) {
  return (
    <AnimatePresence>
      {text && (
        <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-red-500/30 bg-ink-800 px-5 py-3 text-sm font-medium shadow-glow">
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Price({ value, className }: { value: number; className?: string }) {
  return <span className={cx('tabular-nums', className)}>{inr(value)}</span>
}

export function Typing({ dark }: { dark?: boolean }) {
  return (
    <div className={cx('inline-flex items-center gap-1 rounded-2xl px-4 py-3', dark ? 'bg-wa-in' : 'bg-ink-750')}>
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-ink-300" animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
      ))}
    </div>
  )
}
