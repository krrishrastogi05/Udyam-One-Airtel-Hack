import { motion } from 'framer-motion'
import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './ui'
import { cx } from '../lib/util'

// Light-mode primitives for the owner-facing screens.

export function LightLogo({ invert }: { invert?: boolean }) {
  return (
    <Link to="/" className="inline-flex items-center gap-2">
      <span className={cx('grid h-7 w-7 place-items-center rounded-lg', invert ? 'bg-white' : 'bg-red-600')}>
        <svg viewBox="0 0 64 64" className="h-[18px] w-[18px]">
          <path d="M20 16v19a12 12 0 0 0 24 0V16" fill="none" stroke={invert ? '#E40000' : '#fff'} strokeWidth="7" strokeLinecap="round" />
          <circle cx="44" cy="47" r="5" fill={invert ? '#E40000' : '#fff'} />
        </svg>
      </span>
      <span className={cx('text-[17px] font-bold tracking-tight', invert ? 'text-white' : 'text-smoke')}>Udyam One</span>
    </Link>
  )
}

export function Btn({ children, onClick, kind = 'red', icon, className, big }: {
  children: ReactNode; onClick?: () => void; kind?: 'red' | 'quiet' | 'white' | 'link'; icon?: string; className?: string; big?: boolean
}) {
  const k = {
    red: 'bg-red-600 text-white hover:bg-red-700',
    quiet: 'bg-mist text-smoke hover:bg-hair',
    white: 'bg-white text-red-700 hover:bg-blush',
    link: 'text-red-600 hover:text-red-700 px-0',
  }[kind]
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={onClick}
      className={cx('inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-600/25',
        kind !== 'link' && (big ? 'h-14 px-8 text-[17px]' : 'h-11 px-6 text-[15px]'), k, className)}>
      {icon && <Icon name={icon} className="h-[18px] w-[18px]" />}
      {children}
    </motion.button>
  )
}

/** Apple-style section heading: bold statement followed by a quieter question. */
export function Ask({ title, q, className }: { title: string; q: string; className?: string }) {
  return <h2 className={cx('text-[26px] font-bold leading-tight tracking-[-0.02em] text-smoke sm:text-[28px]', className)}>{title} <span className="text-graphite">{q}</span></h2>
}

export function Option({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button onClick={onClick}
      className={cx('relative w-full rounded-2xl border bg-white p-5 text-left transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-600/20',
        on ? 'border-red-600 shadow-[0_0_0_1px_#E40000]' : 'border-hair hover:border-graphite/50', className)}>
      {children}
    </button>
  )
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={cx('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors', on ? 'bg-red-600' : 'bg-hair')}>
      <motion.span layout transition={{ type: 'spring', stiffness: 700, damping: 40 }}
        className={cx('absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,.18)]', on ? 'right-[2px]' : 'left-[2px]')} />
    </button>
  )
}

/** Full-bleed Airtel-red interstitial used between major steps. */
export function RedMoment({ title, line, cta, onNext, children }: { title: string; line: string; cta: string; onNext: () => void; children?: ReactNode }) {
  return (
    <motion.section initial={{ clipPath: 'circle(0% at 50% 60%)' }} animate={{ clipPath: 'circle(150% at 50% 60%)' }} transition={{ duration: 0.8, ease: [0.65, 0, 0.35, 1] }}
      className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center bg-red-600 px-6 pb-24 pt-12 text-center text-white">
      <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.6 }}
        className="max-w-3xl text-[44px] font-bold leading-[1.02] tracking-[-0.035em] sm:text-[72px]">{title}</motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-5 max-w-md text-lg text-white/85">{line}</motion.p>
      {children}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="mt-10"><Btn kind="white" big onClick={onNext}>{cta}</Btn></motion.div>
    </motion.section>
  )
}

export const rupee = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
