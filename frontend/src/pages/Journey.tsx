import { AnimatePresence, motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Ask, Btn, LightLogo, Option, RedMoment, Toggle, rupee } from '../components/light'
import { Icon, Md } from '../components/ui'
import { api, Check, Journey, Lang, Line, useJourney, useSpecimens } from '../lib/api'
import { celebrate, cx, DOC_LABEL } from '../lib/util'
import { micAllowed, stopSpeaking, useRecorder, useVoiceEngine, useVoiceInput } from '../lib/voice'

type View = 'language' | 'discover' | 'bundle' | 'ready' | 'verify' | 'pay' | 'track' | 'live'
const PROGRESS: Partial<Record<View, [number, string]>> = { discover: [1, 'about you'], bundle: [2, 'your plan'], verify: [3, 'verify'], pay: [4, 'pay'], track: [4, 'tracking'] }

const LANGS: { code: Lang; native: string; latin: string; hello: string }[] = [
  { code: 'hi', native: 'हिन्दी', latin: 'Hindi', hello: 'नमस्ते' },
  { code: 'mr', native: 'मराठी', latin: 'Marathi', hello: 'नमस्कार' },
  { code: 'ta', native: 'தமிழ்', latin: 'Tamil', hello: 'வணக்கம்' },
  { code: 'en', native: 'English', latin: 'English', hello: 'Hello' },
  { code: 'hinglish', native: 'Hinglish', latin: 'Hindi in English letters', hello: 'Namaste' },
]

function derive(j: Journey, picked: boolean): View {
  if (j.stage === 'discover') return picked || j.messages.some((m) => m.role === 'user') ? 'discover' : 'language'
  if (j.stage === 'bundle') return 'bundle'
  if (j.stage === 'verify') return j.kyc.consent ? 'verify' : 'ready'
  if (j.stage === 'pay') return 'pay'
  return j.order?.status === 'live' ? 'live' : 'track'
}

const plain = (t?: string) => (t || '').replace(/\*\*/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}️]/gu, '').trim()

export default function JourneyPage() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const embed = sp.get('embed') === '1'
  const { j, error, busy, run } = useJourney(id)
  const [picked, setPicked] = useState(false)
  const [view, setView] = useState<View | null>(null)
  const [qr, setQr] = useState(false)
  const [ask, setAsk] = useState(false)
  const lastKey = useRef('')
  const nav = useNavigate()

  useEffect(() => {
    if (!j) return
    const key = `${j.stage}|${j.kyc.consent}|${j.order?.status}|${picked}`
    if (key !== lastKey.current) {
      lastKey.current = key
      setView(derive(j, picked))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [j, picked])

  if (!j || !view) {
    return (
      <div className="grid min-h-screen place-items-center bg-white">
        {error ? <div className="text-center"><div className="text-lg font-semibold">{error}</div><button className="mt-3 text-red-600" onClick={() => nav('/')}>Go home</button></div>
          : <div className="h-9 w-9 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />}
      </div>
    )
  }

  const red = view === 'ready' || view === 'live'
  const p = PROGRESS[view]
  const order: View[] = ['discover', 'bundle', 'verify', 'pay']
  const reached = { discover: 0, language: 0, bundle: 1, ready: 2, verify: 2, pay: 3, track: 3, live: 3 }[derive(j, true)]

  return (
    <div className="min-h-screen bg-white text-smoke">
      <header className={cx('sticky top-0 z-30 transition-colors', red ? 'bg-red-600' : 'border-b border-hair bg-white/85 backdrop-blur-xl')}>
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5">
          <LightLogo invert={red} />
          {p && !embed && (
            <nav className="mx-auto hidden items-center gap-1 sm:flex" aria-label="Progress">
              {order.map((v, i) => (
                <button key={v} disabled={i > reached} onClick={() => setView(v)}
                  className={cx('rounded-full px-3 py-1 text-[13px] transition-colors', view === v || (v === 'pay' && view === 'track') ? 'bg-smoke text-white' : i <= reached ? 'text-smoke hover:bg-mist' : 'text-graphite/50')}>
                  {['About you', 'Plan', 'Verify', view === 'track' ? 'Tracking' : 'Pay'][i]}
                </button>
              ))}
            </nav>
          )}
          {p && <span className="mx-auto text-[13px] text-graphite sm:hidden">Step {p[0]} of 4</span>}
          <div className={cx('flex items-center gap-1', !p && 'ml-auto')}>
            <select aria-label="Language" value={j.lang} onChange={(e) => run(() => api.lang(j.id, e.target.value as Lang))}
              className={cx('h-9 rounded-full bg-transparent px-2 text-[13px] outline-none', red ? 'text-white' : 'text-graphite hover:text-smoke')}>
              {LANGS.map((l) => <option key={l.code} value={l.code} className="text-smoke">{l.native}</option>)}
            </select>
            {!embed && (
              <button onClick={() => setQr(true)} className={cx('hidden h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium sm:flex', red ? 'text-white' : 'text-graphite hover:bg-mist hover:text-smoke')}>
                <Icon name="Smartphone" className="h-4 w-4" />Continue on WhatsApp
              </button>
            )}
          </div>
        </div>
        {p && <motion.div className="h-[2px] bg-red-600" initial={false} animate={{ width: `${p[0] * 25}%` }} transition={{ duration: 0.6 }} />}
      </header>

      <AnimatePresence>
        {j.handoff && !red && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className="overflow-hidden border-b border-hair bg-mist">
            <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-2.5 text-[14px]">
              <Icon name="Headset" className="h-4 w-4 text-red-600" />
              {j.agent_paused ? `${j.agent_paused} from Shree Telecom is in your WhatsApp chat.`
                : j.handoff.status === 'accepted' ? `${j.handoff.partner} (a local Accel partner) will call you. They already have your details.`
                  : 'A local partner has your details and will call within 2 working hours. You can keep going here.'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.main key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {view === 'language' && <Language j={j} onPick={(l) => { setPicked(true); run(() => api.lang(j.id, l)) }} />}
          {view === 'discover' && <Tell j={j} run={run} busy={busy} />}
          {view === 'bundle' && <Plan j={j} run={run} busy={busy} />}
          {view === 'ready' && j.quote && (
            <RedMoment title="Your plan is ready." line={`${rupee(j.quote.monthly_with_gst)} a month with GST, live in about ${j.quote.eta_days} days. Next, a two-minute check of your business.`}
              cta="Verify my business" onNext={() => setView('verify')} />
          )}
          {view === 'verify' && <Verify j={j} run={run} busy={busy} />}
          {view === 'pay' && <Pay j={j} run={run} busy={busy} />}
          {view === 'track' && <Track j={j} run={run} />}
          {view === 'live' && <Live j={j} />}
        </motion.main>
      </AnimatePresence>

      {view !== 'language' && view !== 'discover' && !red && (
        <button onClick={() => setAsk(true)} className="fixed bottom-5 right-5 z-30 flex h-12 items-center gap-2 rounded-full bg-smoke px-5 text-[14px] font-medium text-white shadow-[0_10px_30px_rgba(0,0,0,.2)]">
          <Icon name="MessageCircle" className="h-4 w-4" />Ask a question
        </button>
      )}
      <AnimatePresence>{ask && <AskDrawer j={j} run={run} onClose={() => setAsk(false)} />}</AnimatePresence>

      <Modal open={qr} onClose={() => setQr(false)}>
        <div className="flex flex-col items-center text-center">
          <div className="text-[19px] font-semibold">Continue on your phone</div>
          <p className="mt-1 text-[14px] text-graphite">Scan to open this same journey in our WhatsApp chat. Both stay in sync.</p>
          <div className="mt-5 rounded-2xl border border-hair p-4"><QRCodeSVG value={`${window.location.origin}/wa/${j.id}`} size={180} fgColor="#1D1D1F" /></div>
          <a href={`/wa/${j.id}`} target="_blank" rel="noreferrer" className="mt-4 text-[14px] font-medium text-red-600">Open the WhatsApp view in a new tab</a>
        </div>
      </Modal>
      <AnimatePresence>{error && <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-smoke px-5 py-3 text-[14px] text-white">{error}</motion.div>}</AnimatePresence>
      {busy && <div className="fixed left-0 top-0 z-50 h-0.5 w-full overflow-hidden"><div className="h-full w-1/3 animate-[shine_1s_linear_infinite] bg-red-600" /></div>}
    </div>
  )
}

type Run = (fn: () => Promise<Journey>) => Promise<void>

export function Modal({ open, onClose, children, wide }: { open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
          <motion.div role="dialog" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className={cx('relative z-10 max-h-[90vh] w-full overflow-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-md')}>
            <button aria-label="Close" onClick={onClose} className="absolute right-4 top-4 rounded-full p-1.5 text-graphite hover:bg-mist"><Icon name="X" className="h-5 w-5" /></button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ------------------------------------------------------------------ language
function Language({ j, onPick }: { j: Journey; onPick: (l: Lang) => void }) {
  const [pick, setPick] = useState<Lang>(j.lang === 'en' ? 'hi' : j.lang)
  const l = LANGS.find((x) => x.code === pick)!
  return (
    <section className="mx-auto flex min-h-[calc(100vh-56px)] max-w-3xl flex-col justify-center px-5 py-14">
      <AnimatePresence mode="wait">
        <motion.h1 key={l.hello} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
          className="text-[56px] font-bold leading-none tracking-[-0.04em] sm:text-[88px]">{l.hello}.</motion.h1>
      </AnimatePresence>
      <p className="mt-5 max-w-xl text-[19px] leading-relaxed text-graphite sm:text-[21px]">Internet, SIMs and billing for your business, set up in one conversation. Which language should we talk in?</p>
      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {LANGS.map((x) => (
          <Option key={x.code} on={pick === x.code} onClick={() => setPick(x.code)} className="py-5">
            <div className="text-[22px] font-semibold leading-tight">{x.native}</div>
            <div className="mt-1 text-[13px] text-graphite">{x.latin}</div>
          </Option>
        ))}
      </div>
      <p className="mt-3 text-[13px] text-graphite">With Udyam AI switched on we also understand Gujarati, Kannada, Telugu, Bengali and more.</p>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Btn big onClick={() => onPick(pick)}>Continue in {l.latin === 'Hindi in English letters' ? 'Hinglish' : l.latin}</Btn>
        <a href={`/wa/${j.id}`} className="inline-flex h-14 items-center gap-2 rounded-full bg-mist px-8 text-[17px] font-semibold text-smoke hover:bg-hair"><Icon name="Phone" className="h-[18px] w-[18px]" />Talk instead</a>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ tell us (the advisor conversation)
function Tell({ j, run, busy }: { j: Journey; run: Run; busy: boolean }) {
  const [text, setText] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const [saw, setSaw] = useState<{ raw: string; sent: string } | null>(null)
  const engine = useVoiceEngine()
  const rec = useRecorder()
  const send = useCallback((t: string, voice = false) => { if (t.trim()) { setText(''); setSel([]); run(() => api.send(j.id, t.trim(), 'web', voice)) } }, [j.id, run])
  const mic = useVoiceInput(j.lang, (t) => send(t, true))
  const bots = j.messages.filter((m) => m.role === 'bot' && m.text)
  const q = bots[bots.length - 1]
  const history = j.messages.filter((m) => m.text && ['text', 'doc_result'].includes(m.kind) && m.id !== q?.id).slice(-4)
  const chips = (q?.chips || []).filter((c) => !/^skip$/i.test(c) || q?.slot === 'spend')
  const listening = mic.listening || rec.recording

  const voice = async () => {
    stopSpeaking()
    if (listening) {
      if (!rec.recording) return mic.stop()
      const r = await rec.stop()
      if (r) run(async () => (await api.voice(j.id, r.blob, 'web', 'note')).journey)
      return
    }
    if (engine === 'sarvam' && micAllowed()) rec.start().catch(() => mic.start())
    else mic.start()
  }

  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-5 py-12 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        {history.length > 0 && (
          <ol className="mb-8 space-y-2 border-l-2 border-hair pl-4 text-[14px]">
            {history.map((m) => (
              <li key={m.id} className={m.role === 'user' ? 'text-smoke' : 'text-graphite'}>
                {m.role === 'user' && <span className="mr-1.5 text-[12px] font-semibold text-red-600">{m.voice ? 'You said' : 'You'}</span>}
                <span className="line-clamp-2">{plain(m.text)}</span>
              </li>
            ))}
          </ol>
        )}
        <AnimatePresence mode="wait">
          <motion.div key={q?.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="max-w-2xl whitespace-pre-line text-[26px] font-bold leading-tight tracking-[-0.02em] sm:text-[32px]">{plain(q?.text)}</h1>
          </motion.div>
        </AnimatePresence>
        {chips.length > 0 && (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {chips.map((c) => {
              const on = sel.includes(c)
              const suggest = /suggest|सुझाइए|suggest karo|सुचवा|பரிந்துரை/i.test(c)
              return (
                <Option key={c} on={on} onClick={() => (q?.multi && !suggest ? setSel(on ? sel.filter((x) => x !== c) : [...sel, c]) : send(c))}>
                  <span className="text-[16px] font-medium">{c.replace(/^✅\s*/, '')}</span>
                </Option>
              )
            })}
          </div>
        )}
        {q?.multi && sel.length > 0 && <div className="mt-4"><Btn onClick={() => send(sel.join(', '))}>Continue with {sel.length}</Btn></div>}
        <form onSubmit={(e) => { e.preventDefault(); send(text) }} className="mt-8">
          <label htmlFor="say" className="text-[14px] text-graphite">Or say it in your own words</label>
          <div className={cx('mt-2 flex items-center gap-2 rounded-full border bg-mist p-1.5 pl-5 transition-colors', listening ? 'border-red-600' : 'border-hair')}>
            <input id="say" value={listening ? (mic.interim || 'Listening…') : text} onChange={(e) => setText(e.target.value)} disabled={listening}
              className="h-10 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-graphite"
              placeholder={{ hi: 'मेरा क्लिनिक है पुणे में, 4 लोग काम करते हैं', mr: 'माझं क्लिनिक पुण्यात आहे, चार लोक काम करतात', ta: 'என் கடை சென்னையில், ஐந்து பேர் வேலை செய்கிறார்கள்', hinglish: 'Mera clinic Pune mein hai, 4 log kaam karte hain' }[j.lang as string] || 'I run a clinic in Pune with 4 people'} />
            {text && <button type="submit" aria-label="Send" className="grid h-10 w-10 place-items-center rounded-full bg-smoke text-white"><Icon name="ArrowUp" className="h-[18px] w-[18px]" /></button>}
            <button type="button" onClick={voice} aria-label={listening ? 'Stop and send' : 'Speak'}
              className={cx('relative grid h-10 w-10 place-items-center rounded-full text-white', listening ? 'bg-smoke' : 'bg-red-600')}>
              {listening && <span className="absolute inset-0 animate-pulsering rounded-full bg-red-600/40" />}
              <Icon name={listening ? 'Square' : 'Mic'} className="h-[18px] w-[18px]" />
            </button>
          </div>
        </form>
        {busy && <div className="mt-6 flex items-center gap-2 text-[14px] text-graphite"><span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />Thinking</div>}
      </div>

      <aside className="lg:pt-1">
        <div className="text-[13px] font-semibold text-graphite">What we understood</div>
        <Understood j={j} />
        <button onClick={async () => setSaw(saw ? null : await api.aiView(j.id))} className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-red-600">
          <Icon name="ShieldCheck" className="h-4 w-4" /> {saw ? 'Hide' : 'See'} what our AI received
        </button>
        <AnimatePresence>{saw && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 space-y-3 rounded-2xl bg-mist p-4 text-[13px] leading-relaxed">
              {saw.raw ? <>
                <div><div className="font-semibold">You said</div><p className="mt-1 text-graphite">{saw.raw}</p></div>
                <div><div className="font-semibold">Udyam AI received</div>
                  <p className="mt-1 text-graphite">{saw.sent.split(/(\[[^\]]+\])/).map((s, i) => s.startsWith('[') ? <mark key={i} className="rounded bg-red-600 px-1 text-white">{s.slice(1, -1)} hidden</mark> : s)}</p></div>
              </> : <p className="text-graphite">Nothing typed yet. When you write a phone number, GSTIN or ID number, it is replaced before anything reaches the AI.</p>}
              <p className="text-graphite">Prices come from Accel’s catalogue, never from the AI. Asking it for a discount changes nothing.</p>
            </div>
          </motion.div>
        )}</AnimatePresence>
      </aside>
    </section>
  )
}

const NEED_LABEL: Record<string, string> = {
  internet: 'Internet', backup: 'Backup internet', mobile: 'SIMs', whatsapp: 'WhatsApp Business', sms: 'SMS', email: 'Email', storage: 'Cloud storage',
  website: 'Website', pos: 'Billing', security: 'Security', wifi: 'Guest Wi-Fi', cctv: 'CCTV', calling: 'Calling', tollfree: 'Toll-free', iot: 'Machines', fleet: 'Vehicles', sdwan: 'Branch network',
}

function Understood({ j }: { j: Journey }) {
  const p = j.profile, s = p.said || {}
  const rows: [string, string | null, string | undefined][] = [
    ['Business', p.business_name || p.business_type, s.business],
    ['City', p.city, s.city],
    ['People', p.employees ? `${p.employees}${p.sites > 1 ? `, ${p.sites} locations` : ''}` : null, s.people],
    ['Needs', (p.needs || []).map((n: string) => NEED_LABEL[n] || n).join(', ') || null, Object.entries(s).find(([k]) => k.startsWith('need:'))?.[1] as string],
    ['GST', p.has_gst === false ? 'Not registered' : p.gst_status ? `${p.gst_status}` : p.has_gst ? 'Registered' : null, s.gst],
    ['Today', [p.current_setup, p.current_spend ? `${rupee(p.current_spend)} a month` : null].filter(Boolean).join(', ') || null, s.spend || s.setup],
  ]
  return (
    <ul className="mt-3 divide-y divide-hair border-y border-hair">
      {rows.map(([k, v, said]) => (
        <li key={k} className="py-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[14px] text-graphite">{k}</span>
            <span className={cx('text-right text-[15px]', v ? 'font-medium' : 'text-graphite/50')}>{v || 'Not yet'}</span>
          </div>
          {v && said && <div className="mt-0.5 truncate text-right text-[12px] italic text-graphite">“{said}”</div>}
        </li>
      ))}
    </ul>
  )
}

// ------------------------------------------------------------------ plan
const CAT_ORDER = ['Connectivity', 'Communication', 'Cloud & Productivity', 'Security', 'IoT & Physical']
const CAT_ASK: Record<string, [string, string]> = {
  Connectivity: ['Internet.', 'Fast, and it stays up.'], Communication: ['Calls and SIMs.', 'For you and your team.'],
  'Cloud & Productivity': ['Email and cloud.', 'Look professional, lose nothing.'], Security: ['Security.', 'Keep data and devices safe.'],
  'IoT & Physical': ['Devices.', 'Cameras, machines, vehicles.'],
}

function Plan({ j, run, busy }: { j: Journey; run: Run; busy: boolean }) {
  const [why, setWhy] = useState<string | null>(null)
  const billIn = useRef<HTMLInputElement>(null)
  const q = j.quote!, cart = j.cart!
  const said = j.profile.said || {}
  const setCart = (items: any[], term = cart.term) => run(() => api.cart(j.id, items, term))
  const patch = (lineId: string, ch: Record<string, any>) => setCart(cart.items.map((i) => (i.id === lineId ? { ...i, ...ch } : i)))
  const cats = CAT_ORDER.filter((c) => q.lines.some((l) => l.category === c))
  const spend = Number(j.profile.current_spend || 0)
  const diff = spend - q.monthly_with_gst
  const locked = j.reco?.locked || []

  const whyOf = (l: Line) => {
    const quote = said[`need:${l.need}`] || (l.qty > 1 ? said.people : null) || said.business
    return { quote, rule: [l.why, l.assumed].filter(Boolean).join(' ') }
  }

  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-5 py-12 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-14">
        <div>
          <h1 className="text-[38px] font-bold leading-[1.05] tracking-[-0.035em] sm:text-[48px]">{j.profile.business_name || j.profile.business_type || 'Your'} plan</h1>
          <p className="mt-2 text-[17px] text-graphite">Built from what you told us. Change anything; the price updates as you go.</p>
          {new Set((j.reco?.plans || []).map((pl) => pl.quote.monthly_with_gst)).size > 1 && (
            <div className="mt-6 inline-flex rounded-full bg-mist p-1">
              {j.reco!.plans.map((pl) => (
                <button key={pl.key} onClick={() => run(() => api.plan(j.id, pl.key))}
                  className={cx('rounded-full px-4 py-2 text-[14px] font-medium transition-colors', cart.plan === pl.key ? 'bg-white text-smoke shadow-sm' : 'text-graphite hover:text-smoke')}>
                  {pl.title} <span className="text-graphite">{rupee(pl.quote.monthly_with_gst)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {cats.map((c) => (
          <div key={c}>
            <Ask title={CAT_ASK[c]?.[0] || c} q={CAT_ASK[c]?.[1] || ''} />
            <div className="mt-6 divide-y divide-hair rounded-2xl border border-hair">
              {q.lines.filter((l) => l.category === c).map((l) => {
                const w = whyOf(l)
                const perUnit = /per (user|sim|camera|device|vehicle|site|number|inbox|seat)/i.test(l.unit)
                return (
                  <div key={l.id} className={cx('p-5 transition-opacity', !l.on && 'opacity-60')}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-[16px] font-semibold">{l.name}</div>
                        <div className="text-[14px] text-graphite">{rupee(l.unit_price)} {l.unit.replace('per ', 'a ')} a month{l.setup ? `, setup ${rupee(l.setup)}` : ''}</div>
                        {l.issues.map((i) => <div key={i.code} className="mt-1 text-[13px] text-red-700">{i.msg}</div>)}
                        <button onClick={() => setWhy(why === l.id ? null : l.id)} className="mt-2 text-[13px] font-medium text-red-600">Why this?</button>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-3">
                        <div className="text-[15px] tabular-nums">{rupee(l.monthly)}<span className="text-graphite">/mo</span></div>
                        <div className="flex items-center gap-3">
                          {perUnit && l.on && (
                            <div className="flex items-center gap-2">
                              <button aria-label="Fewer" disabled={busy} onClick={() => patch(l.id, { qty: Math.max(1, l.qty - 1) })} className="grid h-8 w-8 place-items-center rounded-full bg-mist hover:bg-hair"><Icon name="Minus" className="h-3.5 w-3.5" /></button>
                              <span className="w-5 text-center text-[16px] font-semibold tabular-nums">{l.qty}</span>
                              <button aria-label="More" disabled={busy} onClick={() => patch(l.id, { qty: l.qty + 1 })} className="grid h-8 w-8 place-items-center rounded-full bg-mist hover:bg-hair"><Icon name="Plus" className="h-3.5 w-3.5" /></button>
                            </div>
                          )}
                          {!l.core && <Toggle on={l.on} onChange={(v) => patch(l.id, { on: v })} />}
                        </div>
                      </div>
                    </div>
                    <AnimatePresence>{why === l.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="mt-3 rounded-xl bg-blush p-3 text-[13px] leading-relaxed">
                          {w.quote && <div>You said <span className="font-semibold">“{w.quote}”</span></div>}
                          <div className={cx(w.quote && 'mt-1 text-graphite')}>{w.rule}</div>
                        </div>
                      </motion.div>
                    )}</AnimatePresence>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {(q.addons || []).length > 0 && (
          <div>
            <Ask title="Extras." q="Only if they help." />
            <div className="mt-6 divide-y divide-hair rounded-2xl border border-hair">
              {q.addons!.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-4 p-5">
                  <div><div className="text-[16px] font-medium">{a.name}</div><div className="text-[14px] text-graphite">{a.why}</div>
                    {a.locked && <div className="mt-1 text-[13px] text-red-700">{a.locked}</div>}</div>
                  <Btn kind="quiet" onClick={() => !a.locked && setCart([...cart.items, { id: a.id, qty: a.qty, on: true, need: a.need, why: a.why }])}>
                    {a.locked ? 'Locked' : `Add ${rupee(a.unit_price * a.qty)}`}
                  </Btn>
                </div>
              ))}
            </div>
          </div>
        )}

        {locked.length > 0 && (
          <div className="rounded-2xl bg-mist p-5">
            <div className="text-[15px] font-semibold">Not available yet</div>
            {locked.map((l) => <div key={l.id} className="mt-2 text-[14px]"><span className="font-medium">{l.name}.</span> <span className="text-graphite">{l.reason}</span></div>)}
            <button onClick={() => run(() => api.handoff(j.id, 'Wants help with GST registration', 'web'))} className="mt-3 text-[13px] font-medium text-red-600">Get free help from a local partner</button>
          </div>
        )}

        <div>
          <Ask title="Contract." q="Longer is cheaper." />
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[24, 12].map((t) => <Option key={t} on={cart.term === t} onClick={() => setCart(cart.items, t)}><div className="text-[17px] font-semibold">{t} months</div><div className="text-[14px] text-graphite">{t === 24 ? 'Lowest monthly price' : 'Shorter, a little more a month'}</div></Option>)}
          </div>
        </div>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-3xl bg-mist p-6">
          <div className="text-[13px] font-semibold text-graphite">You’ll pay</div>
          <motion.div key={q.monthly_with_gst} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="mt-1 text-[44px] font-bold tracking-[-0.03em] tabular-nums">{rupee(q.monthly_with_gst)}</motion.div>
          <div className="text-[14px] text-graphite">a month for {q.term} months, including {rupee(q.gst)} GST</div>
          <div className="mt-5 space-y-2 border-t border-hair pt-4 text-[14px]">
            <div className="flex justify-between"><span className="text-graphite">One-time setup</span><span className="tabular-nums">{rupee(q.setup)}</span></div>
            <div className="flex justify-between"><span className="text-graphite">Live in</span><span>about {q.eta_days} days</span></div>
            {q.saving_vs_flex > 0 && <div className="flex justify-between"><span className="text-graphite">Saved by the {q.term}-month term</span><span className="tabular-nums">{rupee(q.saving_vs_flex)}/mo</span></div>}
          </div>
        </div>
        <div className={cx('mt-3 rounded-3xl p-6', spend ? 'bg-red-600 text-white' : 'border border-hair')}>
          {spend ? <>
            <div className="text-[13px] font-semibold text-white/80">Compared with today</div>
            <div className="mt-1 text-[15px]">You pay {rupee(spend)} a month{j.profile.current_provider ? ` to ${j.profile.current_provider}` : ''}.</div>
            <div className="mt-2 text-[26px] font-bold leading-tight tracking-[-0.02em] tabular-nums">{diff >= 0 ? `Save ${rupee(diff * 12)} a year` : `${rupee(-diff)} more a month`}</div>
            {diff < 0 && <div className="mt-1 text-[13px] text-white/80">For one bill, one support number and everything above.</div>}
          </> : <>
            <div className="text-[15px] font-semibold">What do you pay today?</div>
            <div className="mt-1 text-[14px] text-graphite">Add a photo of your current phone or internet bill and we’ll compare.</div>
          </>}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <button onClick={() => billIn.current?.click()} className={cx('inline-flex items-center gap-1.5 text-[13px] font-semibold', spend ? 'text-white' : 'text-red-600')}><Icon name="Camera" className="h-4 w-4" />Check against a bill photo</button>
            <button onClick={() => run(() => api.billSample(j.id))} className={cx('text-[13px]', spend ? 'text-white/75' : 'text-graphite')}>Use a sample bill</button>
          </div>
          <input ref={billIn} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) run(() => api.bill(j.id, f)); e.currentTarget.value = '' }} />
        </div>
        <Btn big className="mt-5 w-full" onClick={() => run(() => api.confirm(j.id, cart.plan, 'web'))}>Choose this plan</Btn>
        {!q.valid && <p className="mt-2 text-center text-[13px] text-red-700">Some items can’t be activated yet. See the notes above.</p>}
      </aside>
    </section>
  )
}

// ------------------------------------------------------------------ verify
const DOCS = ['gst', 'udyam', 'id', 'address'] as const

function Verify({ j, run, busy }: { j: Journey; run: Run; busy: boolean }) {
  const [signer, setSigner] = useState('')
  const [proof, setProof] = useState<{ doc: string; check: Check } | null>(null)
  const [sample, setSample] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const fileDoc = useRef('gst')
  const specimens = useSpecimens()
  const r = j.kyc.result
  const reg = r?.registry
  const p = j.profile
  const es = j.kyc.esign
  const checks = r?.checks || []

  const docState = (d: string) => {
    const doc = j.kyc.docs[d]
    if (d === 'id' && es?.status === 'signed' && !doc) return { tone: 'ok', note: `${es.name} signed digitally` }
    if (!doc) return { tone: 'todo', note: d === 'udyam' ? 'Optional, speeds up MSME benefits' : d === 'id' ? 'Or ask the signatory to e-sign below' : 'Photo from your phone is fine' }
    if (doc.quality !== 'ok') return { tone: 'bad', note: doc.message || 'Retake the photo' }
    const bad = checks.find((c) => c.doc === d && c.status === 'fail')
    if (bad) return { tone: 'bad', note: bad.detail, check: bad }
    return { tone: 'ok', note: doc.source === 'DigiLocker' ? 'From DigiLocker, issued by the Ministry of MSME' : doc.source === 'GST registry' ? 'Verified with the GST registry' : 'Read and checked' }
  }

  return (
    <section className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-[38px] font-bold leading-[1.05] tracking-[-0.035em] sm:text-[48px]">{reg || p.legal_name ? 'We found your business.' : 'Let’s verify your business.'}</h1>
      <p className="mt-3 text-[17px] text-graphite">{reg || p.legal_name ? 'From the GST and Udyam registries. Check them, then add what’s missing.' : 'A few photos, checked against the GST and Udyam registries in seconds.'}</p>

      {(reg || p.legal_name) && (
        <dl className="mt-10 divide-y divide-hair border-y border-hair text-[15px]">
          {([['Legal name', reg?.legal_name || p.legal_name], ['Trade name', reg?.trade_name || p.business_name], ['GSTIN', reg?.gstin_masked || (p.gstin ? `${p.gstin.slice(0, 4)}•••••••${p.gstin.slice(-3)}` : null)],
            ['Status', reg?.status || p.gst_status], ['Address', reg?.address]] as [string, string | undefined][]).filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="grid grid-cols-[110px_1fr] gap-4 py-3.5"><dt className="text-graphite">{k}</dt><dd className={cx('font-medium', k === 'Status' && v !== 'Active' && 'text-red-700')}>{v}</dd></div>
          ))}
        </dl>
      )}

      <div className="mt-12 rounded-3xl border border-hair p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-[17px] font-semibold">Let Accel Business verify these details</div>
            <ul className="mt-3 space-y-1.5 text-[14px] text-graphite">
              <li>Used only to verify your business and activate your connections.</li>
              <li>Photos are encrypted. The KYC record is kept only as long as telecom rules require; everything else is deleted 30 days after you go live.</li>
              <li>Withdraw any time: type DELETE in the chat.</li>
            </ul>
            <div className="mt-2 text-[12px] text-graphite">Digital Personal Data Protection Act, 2023</div>
          </div>
          <Toggle on={j.kyc.consent} onChange={(v) => v && !j.kyc.consent && run(() => api.consent(j.id, 'web'))} />
        </div>
      </div>

      <div className={cx('mt-12 transition-opacity', !j.kyc.consent && 'pointer-events-none opacity-40')}>
        <Ask title="Documents." q="Photos from your phone are fine." />
        {p.gstin && !j.kyc.docs.gst && (
          <button onClick={() => run(() => api.digilocker(j.id))} className="mt-6 flex w-full items-center gap-4 rounded-2xl bg-mist p-5 text-left hover:bg-hair">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-red-600"><Icon name="FolderLock" className="h-5 w-5" /></span>
            <span className="flex-1"><span className="block text-[16px] font-semibold">Verify GST and fetch Udyam from DigiLocker</span><span className="text-[14px] text-graphite">GST from the GST registry, the Udyam certificate from DigiLocker. No photos needed for these two.</span></span>
            <Icon name="ChevronRight" className="h-5 w-5 text-graphite" />
          </button>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {DOCS.map((d) => {
            const s = docState(d)
            return (
              <div key={d} className={cx('rounded-2xl border p-5', s.tone === 'bad' ? 'border-red-600' : 'border-hair')}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[16px] font-medium">{DOC_LABEL[d]}</span>
                  {s.tone === 'ok' ? <Icon name="CircleCheck" className="h-5 w-5 text-emerald-600" /> : s.tone === 'bad' ? <Icon name="CircleAlert" className="h-5 w-5 text-red-600" /> : <span className="h-5 w-5 rounded-full border-2 border-hair" />}
                </div>
                <div className={cx('mt-1 text-[14px]', s.tone === 'bad' ? 'text-red-700' : 'text-graphite')}>{s.note}</div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-medium">
                  {s.tone !== 'ok' && <button onClick={() => { fileDoc.current = d; file.current?.click() }} className="text-red-600">{j.kyc.docs[d] ? 'Retake photo' : 'Add photo'}</button>}
                  {s.check && j.kyc.docs[d]?.img && <button onClick={() => setProof({ doc: d, check: s.check! })} className="text-smoke underline decoration-hair underline-offset-4">Show where</button>}
                  {s.tone !== 'ok' && <button onClick={() => setSample(d)} className="text-graphite">Use a sample</button>}
                </div>
              </div>
            )
          })}
        </div>
        <input ref={file} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) run(() => api.upload(j.id, fileDoc.current, f, 'web')); e.currentTarget.value = '' }} />

        {checks.length > 0 && (
          <div className="mt-10">
            <div className="flex items-baseline justify-between">
              <div className="text-[17px] font-semibold">Checks</div>
              <div className="text-[13px] text-graphite">{r!.summary.pass} passed{r!.summary.fail ? `, ${r!.summary.fail} to fix` : ''}</div>
            </div>
            <ul className="mt-3 divide-y divide-hair border-y border-hair">
              {checks.map((c) => (
                <li key={c.key} className="flex gap-3 py-3 text-[14px]">
                  <Icon name={c.status === 'pass' ? 'Check' : c.status === 'warn' ? 'Info' : 'X'} className={cx('mt-0.5 h-4 w-4 shrink-0', c.status === 'pass' ? 'text-emerald-600' : c.status === 'warn' ? 'text-amber-600' : 'text-red-600')} />
                  <div className="min-w-0"><div className="font-medium">{c.title}</div><div className="text-graphite">{c.detail}</div></div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-10 rounded-3xl bg-mist p-6">
          {es?.status === 'signed' ? (
            <div className="flex items-center gap-3"><Icon name="BadgeCheck" className="h-6 w-6 text-emerald-600" /><div><div className="text-[16px] font-semibold">{es.name} signed digitally</div><div className="text-[14px] text-graphite">Aadhaar OTP e-sign, simulated for this prototype. No ID photo needed.</div></div></div>
          ) : es?.status === 'sent' ? (
            <div><div className="text-[16px] font-semibold">Waiting for {es.name}</div><div className="mt-1 text-[14px] text-graphite">We sent a WhatsApp link. They sign with an OTP; you don’t need to be together.</div>
              <a href={es.link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[13px] font-medium text-red-600">Open their signing page (demo)</a></div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (signer.trim()) run(() => api.esign(j.id, signer.trim())) }}>
              <div className="text-[16px] font-semibold">Does someone else sign for the business?</div>
              <div className="mt-1 text-[14px] text-graphite">We’ll send them a link to approve with an OTP, instead of a photo of their ID.</div>
              <div className="mt-4 flex gap-2">
                <input value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="Their name" aria-label="Signatory name" className="h-11 min-w-0 flex-1 rounded-full border border-hair bg-white px-4 text-[15px] outline-none focus:border-smoke" />
                <Btn kind="quiet" icon="Send">Send link</Btn>
              </div>
            </form>
          )}
        </div>
        {r?.status === 'blocked' && <div className="mt-6 rounded-2xl border border-red-600 p-5 text-[15px]"><div className="font-semibold text-red-700">We can’t activate this business yet</div><div className="mt-1 text-graphite">A local partner has been alerted and will call you to sort it out.</div></div>}
        {busy && <div className="mt-6 flex items-center gap-2 text-[14px] text-graphite"><span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />Reading and checking</div>}
      </div>

      <Modal open={!!sample} onClose={() => setSample(null)} wide>
        <div className="text-[19px] font-semibold">Sample {sample && DOC_LABEL[sample].toLowerCase()}</div>
        <p className="mt-1 text-[14px] text-graphite">Synthetic documents from the challenge pack. Some have planted problems.</p>
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {specimens.filter((a) => sample && a.docs.includes(sample)).map((a) => (
            <button key={a.id} onClick={() => { const d = sample!; setSample(null); run(() => api.specimen(j.id, a.id, d, 'web')) }} className="overflow-hidden rounded-xl border border-hair text-left hover:border-smoke">
              <img src={`/api/kyc/specimen/${a.id}/${sample}.png`} alt="" loading="lazy" className="h-24 w-full object-cover object-top" />
              <div className="truncate px-2 py-1.5 text-[12px]"><b>{a.id}</b> {a.name}</div>
            </button>
          ))}
        </div>
      </Modal>
      <Modal open={!!proof} onClose={() => setProof(null)} wide>{proof && <Evidence j={j} doc={proof.doc} check={proof.check} />}</Modal>
    </section>
  )
}

function Evidence({ j, doc, check }: { j: Journey; doc: string; check: Check }) {
  const [ev, setEv] = useState<{ w: number; h: number; boxes: number[][] } | null>(null)
  useEffect(() => { api.evidence(j.id, doc, check.key).then(setEv).catch(() => setEv({ w: 0, h: 0, boxes: [] })) }, [j.id, doc, check.key])
  return (
    <div className="grid gap-6 sm:grid-cols-[1fr_220px]">
      <div className="relative overflow-hidden rounded-xl border border-hair bg-mist">
        <img src={j.kyc.docs[doc].img} alt={DOC_LABEL[doc]} className="block w-full" />
        {ev && ev.w > 0 && ev.boxes.map((b, i) => (
          <motion.span key={i} initial={{ opacity: 0, scale: 1.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 + i * 0.1 }}
            className="absolute rounded border-[3px] border-red-600 shadow-[0_0_0_4000px_rgba(0,0,0,.18)]"
            style={{ left: `${(b[0] / ev.w) * 100 - 0.5}%`, top: `${(b[1] / ev.h) * 100 - 0.5}%`, width: `${(b[2] / ev.w) * 100 + 1}%`, height: `${(b[3] / ev.h) * 100 + 1}%` }} />
        ))}
      </div>
      <div className="text-[14px]">
        <div className="text-[17px] font-semibold text-red-700">{check.title}</div>
        <p className="mt-2 text-graphite">{check.detail}</p>
        <p className="mt-4 text-[12px] text-graphite">{!ev ? 'Locating it on the photo…' : ev.boxes.length ? 'Found on the photo by OCR.' : 'Couldn’t pinpoint it on the photo.'}</p>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ pay, track, live
function Pay({ j, run, busy }: { j: Journey; run: Run; busy: boolean }) {
  const [auto, setAuto] = useState(true)
  const q = j.quote!
  const setupGst = Math.round(q.setup * 0.18)
  const due = q.setup + setupGst
  return (
    <section className="mx-auto grid max-w-5xl gap-10 px-5 py-12 md:grid-cols-2">
      <div>
        <h1 className="text-[38px] font-bold leading-[1.05] tracking-[-0.035em]">Pay {rupee(due)} to book your install.</h1>
        <dl className="mt-8 divide-y divide-hair border-y border-hair text-[15px]">
          {q.lines.filter((l) => l.on).map((l) => <div key={l.id} className="flex justify-between gap-4 py-3"><dt className="text-graphite">{l.name}{l.qty > 1 ? ` × ${l.qty}` : ''}</dt><dd className="tabular-nums">{rupee(l.monthly)}</dd></div>)}
          <div className="flex justify-between py-3"><dt className="text-graphite">GST 18%</dt><dd className="tabular-nums">{rupee(q.gst)}</dd></div>
          <div className="flex justify-between py-3 font-semibold"><dt>Monthly, from your first bill</dt><dd className="tabular-nums">{rupee(q.monthly_with_gst)}</dd></div>
          <div className="flex justify-between py-3"><dt className="text-graphite">Due now: setup {rupee(q.setup)} + GST {rupee(setupGst)}</dt><dd className="tabular-nums">{rupee(due)}</dd></div>
        </dl>
      </div>
      <div className="rounded-3xl border border-hair p-6">
        {j.payment_failed && (
          <div className="mb-5 rounded-2xl bg-blush p-4 text-[14px]"><div className="font-semibold text-red-700">Payment didn’t go through</div><div className="text-graphite">Your UPI app timed out. Nothing was charged. We’ve sent a retry link to WhatsApp too.</div></div>
        )}
        <div className="text-[17px] font-semibold">Pay with any UPI app</div>
        <div className="mt-5 flex items-center gap-5">
          <div className="rounded-2xl border border-hair p-3"><QRCodeSVG value={`upi://pay?pa=accelbusiness@upi&am=${due}&tn=${j.id}`} size={132} fgColor="#1D1D1F" /></div>
          <p className="text-[14px] text-graphite">Scan with GPay, PhonePe or Paytm. On this phone, tap the button instead.</p>
        </div>
        <div className="mt-6 flex items-start justify-between gap-4 border-t border-hair pt-5">
          {q.monthly_with_gst <= 15000
            ? <div><div className="text-[15px] font-medium">Pay monthly with UPI AutoPay</div><div className="text-[13px] text-graphite">Approve once. Cancel from your UPI app any time.</div></div>
            : <div><div className="text-[15px] font-medium">Pay monthly by e-NACH bank mandate</div><div className="text-[13px] text-graphite">UPI AutoPay runs without extra approval only up to ₹15,000 a debit, so larger bills use your bank account.</div></div>}
          <Toggle on={auto} onChange={setAuto} />
        </div>
        <Btn big className="mt-6 w-full" onClick={() => { celebrate(); run(() => api.pay(j.id, 'upi', auto, 'web')) }}>{j.payment_failed ? `Retry ${rupee(due)}` : `Pay ${rupee(due)}`}</Btn>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-graphite"><Icon name="Lock" className="h-3.5 w-3.5" /> Simulated payment. We never see your UPI PIN.</p>
        {!j.payment_failed && <button disabled={busy} onClick={() => run(() => api.pay(j.id, 'upi', auto, 'web', true))} className="mx-auto mt-2 block text-[12px] text-graphite underline decoration-hair underline-offset-4">Demo: simulate a failed payment</button>}
      </div>
    </section>
  )
}

function Track({ j, run }: { j: Journey; run: Run }) {
  const o = j.order!
  const nextIdx = o.events.findIndex((e) => !e.done_at)
  return (
    <section className="mx-auto max-w-3xl px-5 py-12">
      <div className="text-[13px] font-semibold text-graphite">Order {o.id}</div>
      <h1 className="mt-1 text-[38px] font-bold leading-[1.05] tracking-[-0.035em] sm:text-[48px]">Live by {o.eta_date}.</h1>
      <p className="mt-3 text-[17px] text-graphite">Every step also arrives on WhatsApp, so there’s nothing to chase. You can check here any time.</p>
      <ol className="relative mt-12 space-y-0">
        {o.events.map((e, i) => {
          const done = !!e.done_at, cur = i === nextIdx
          return (
            <li key={e.key} className="relative grid grid-cols-[32px_1fr] gap-4 pb-8 last:pb-0">
              {i < o.events.length - 1 && <span className={cx('absolute left-[15px] top-8 h-[calc(100%-24px)] w-[2px]', done ? 'bg-red-600' : 'bg-hair')} />}
              <span className={cx('relative z-10 grid h-8 w-8 place-items-center rounded-full', done ? 'bg-red-600 text-white' : cur ? 'border-2 border-red-600 bg-white' : 'border-2 border-hair bg-white')}>
                {done ? <Icon name="Check" className="h-4 w-4" strokeWidth={3} /> : cur ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" /> : null}
              </span>
              <div className="pt-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={cx('text-[17px] font-semibold', !done && !cur && 'text-graphite')}>{e.title.replace(/ 🎉/, '')}</span>
                  <span className="text-[13px] text-graphite">{done ? `Done ${new Date(e.done_at! * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : `Planned ${e.planned}`}</span>
                </div>
                <div className="mt-0.5 text-[14px] text-graphite">{e.detail}</div>
              </div>
            </li>
          )
        })}
      </ol>
      <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-hair pt-6">
        <Btn kind="quiet" icon="Headset" onClick={() => run(() => api.handoff(j.id, 'Question about the order', 'web'))}>Talk to a person</Btn>
        <button onClick={() => run(() => api.advance(j.id))} className="text-[13px] text-graphite underline decoration-hair underline-offset-4">Demo: next update from operations</button>
      </div>
    </section>
  )
}

function Live({ j }: { j: Journey }) {
  const items = (j.quote?.lines || []).filter((l) => l.on).slice(0, 5)
  useEffect(() => { celebrate() }, [])
  return (
    <RedMoment title="You’re live." line={`${j.profile.business_name || 'Your business'} is connected. One bill, one support number, in your language.`}
      cta="Share with a business nearby" onNext={() => navigator.share?.({ title: 'Udyam One', text: 'Set up your business internet in one conversation', url: window.location.origin }).catch(() => {})}>
      <ul className="mt-10 w-full max-w-sm space-y-2 text-left">
        {items.map((l, i) => (
          <motion.li key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 + i * 0.12 }}
            className="flex items-center justify-between rounded-2xl bg-white/12 px-4 py-3 text-[15px]">
            <span className="flex items-center gap-2"><Icon name="Check" className="h-4 w-4" />{l.name}</span><span className="text-white/75">Active</span>
          </motion.li>
        ))}
      </ul>
      <p className="mt-6 text-[14px] text-white/80">Refer a business on your street. You both get a month free.</p>
      <Link to={`/wa/${j.id}`} className="mt-3 text-[13px] text-white underline underline-offset-4">Open your WhatsApp chat</Link>
    </RedMoment>
  )
}

function AskDrawer({ j, run, onClose }: { j: Journey; run: Run; onClose: () => void }) {
  const [t, setT] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const msgs = j.messages.filter((m) => m.text && ['text', 'partner', 'notify', 'doc_result'].includes(m.kind)).slice(-12)
  useEffect(() => { box.current?.scrollTo({ top: 1e6, behavior: 'smooth' }) }, [msgs.length])
  return (
    <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/25" onClick={onClose} />
      <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-hair px-5 py-4"><div className="font-semibold">Ask Udyam One</div>
          <button aria-label="Close" onClick={onClose} className="rounded-full p-1.5 hover:bg-mist"><Icon name="X" className="h-5 w-5" /></button></div>
        <div ref={box} className="flex-1 space-y-3 overflow-y-auto p-5 text-[14px]">
          {msgs.map((m) => (
            <div key={m.id} className={cx('max-w-[85%] rounded-2xl px-4 py-2.5', m.role === 'user' ? 'ml-auto bg-smoke text-white' : 'bg-mist')}>
              {m.kind === 'partner' && <div className="mb-0.5 text-[12px] font-semibold text-red-600">{m.payload?.name}</div>}<Md text={m.text} />
            </div>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (t.trim()) { run(() => api.send(j.id, t.trim(), 'web')); setT('') } }} className="flex gap-2 border-t border-hair p-4">
          <input value={t} onChange={(e) => setT(e.target.value)} placeholder="When will it be installed?" aria-label="Your question" className="h-11 min-w-0 flex-1 rounded-full border border-hair px-4 outline-none focus:border-smoke" />
          <button aria-label="Send" className="grid h-11 w-11 place-items-center rounded-full bg-red-600 text-white"><Icon name="ArrowUp" className="h-5 w-5" /></button>
        </form>
      </motion.aside>
    </motion.div>
  )
}
