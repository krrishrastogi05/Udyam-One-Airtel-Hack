import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { Journey } from '../lib/api'
import { cx } from '../lib/util'
import { useLiveCall } from '../lib/voice'
import { Icon } from './ui'

const LANG_LABEL: Record<string, string> = { en: 'English', hi: 'हिन्दी', hinglish: 'Hinglish', mr: 'मराठी', ta: 'தமிழ்' }

function Mark({ size = 76 }: { size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-red-600" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" style={{ width: size * 0.55, height: size * 0.55 }}><path d="M20 16v19a12 12 0 0 0 24 0V16" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" /><circle cx="44" cy="47" r="5" fill="#fff" /></svg>
    </span>
  )
}

export function IncomingCall({ reason, onAccept, onDecline }: { reason: string; onAccept: () => void; onDecline: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex flex-col bg-gradient-to-b from-[#2a0606] via-black to-black text-white">
      <div className="mt-24 flex flex-col items-center px-8 text-center">
        <div className="relative"><span className="absolute inset-0 animate-pulsering rounded-full bg-red-600/50" /><Mark size={88} /></div>
        <div className="mt-6 text-[28px] font-semibold tracking-tight">Udyam One</div>
        <div className="mt-1 text-[15px] text-white/60">Accel Business, verified</div>
        <div className="mt-6 rounded-2xl bg-white/10 px-4 py-3 text-[14px] text-white/85">{reason}</div>
      </div>
      <div className="mt-auto flex justify-around px-10 pb-16">
        <div className="flex flex-col items-center gap-2"><button aria-label="Decline" onClick={onDecline} className="grid h-[68px] w-[68px] place-items-center rounded-full bg-[#ff3b30]"><Icon name="PhoneOff" className="h-7 w-7" /></button><span className="text-[13px] text-white/70">Decline</span></div>
        <div className="flex flex-col items-center gap-2"><motion.button aria-label="Accept" onClick={onAccept} animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 1.4 }} className="grid h-[68px] w-[68px] place-items-center rounded-full bg-[#34c759]"><Icon name="Phone" className="h-7 w-7" /></motion.button><span className="text-[13px] text-white/70">Accept</span></div>
      </div>
    </motion.div>
  )
}

const STATE_LABEL: Record<string, string> = {
  connecting: 'Connecting', listening: 'Listening', hearing: 'Listening', thinking: 'Thinking', speaking: 'Speaking', ended: 'Call ended', error: 'Can’t use the microphone',
}

/** Live voice call with the advisor. Captions write themselves; the red glow follows whoever is speaking. */
export function LiveCall({ j, onJourney, onClose, opener }: { j: Journey; onJourney: (j: Journey) => void; onClose: () => void; opener?: string }) {
  const call = useLiveCall(j, onJourney)
  useEffect(() => { call.start(opener) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const agent = call.state === 'speaking'
  const last = call.captions[call.captions.length - 1]
  const prev = call.captions[call.captions.length - 2]
  const glow = agent ? 0.35 + call.level * 0.2 + 0.25 : call.state === 'hearing' ? 0.15 + call.level * 0.5 : 0.08
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 flex flex-col bg-black text-white">
      <motion.div className="pointer-events-none absolute inset-0" animate={{ boxShadow: `inset 0 0 ${40 + glow * 90}px rgba(228,0,0,${glow})` }} transition={{ duration: 0.15 }} />
      <div className="mt-14 text-center">
        <div className="text-[17px] font-semibold">Udyam One</div>
        <div className="mt-0.5 text-[13px] text-white/55">{LANG_LABEL[j.lang] || j.lang}, {STATE_LABEL[call.state] || ''}</div>
      </div>
      <div className="mt-12 flex justify-center">
        <motion.div animate={{ scale: agent ? 1.04 + call.level * 0.06 : call.state === 'hearing' ? 1 + call.level * 0.08 : 1 }} transition={{ duration: 0.12 }}><Mark /></motion.div>
      </div>
      <div className="mt-auto px-7 pb-6">
        {prev && <p className="mb-3 text-[15px] leading-snug text-white/35">{prev.text}</p>}
        <div className="mb-1.5 text-[12px] font-medium text-white/45">{last ? (last.who === 'agent' ? 'Udyam One' : 'You') : ''}</div>
        <p className={cx('min-h-[96px] text-[21px] font-medium leading-snug tracking-tight', call.state === 'thinking' && 'text-white/60')}>
          {call.error || last?.text || ''}
          {call.state === 'thinking' && <span className="ml-1 inline-flex gap-1 align-middle">{[0, 1, 2].map((k) => <motion.span key={k} className="h-1.5 w-1.5 rounded-full bg-white/70" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, repeat: Infinity, delay: k * 0.2 }} />)}</span>}
        </p>
      </div>
      <div className="flex justify-center gap-10 pb-14">
        <div className="flex flex-col items-center gap-1.5"><button aria-label="Back to chat" onClick={() => { call.end(); onClose() }} className="grid h-[58px] w-[58px] place-items-center rounded-full bg-white/15"><Icon name="MessageCircle" className="h-6 w-6" /></button><span className="text-[11px] text-white/60">Chat</span></div>
        <div className="flex flex-col items-center gap-1.5"><button aria-label="End call" onClick={() => { call.end(); onClose() }} className="grid h-[58px] w-[58px] place-items-center rounded-full bg-[#ff3b30]"><Icon name="PhoneOff" className="h-6 w-6" /></button><span className="text-[11px] text-white/60">End</span></div>
      </div>
    </motion.div>
  )
}
