import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Btn, LightLogo, rupee } from '../components/light'
import { Icon } from '../components/ui'
import { api } from '../lib/api'

const HELLO = ['Namaste', 'नमस्ते', 'नमस्कार', 'வணக்கம்', 'Hello']

const CHAT = [
  { me: true, voice: true, t: 'माझं डेंटल क्लिनिक आहे पुण्यात, चार लोक काम करतात' },
  { me: false, t: 'छान! 300 Mbps फायबर, 4 सिम आणि बिलिंग. दरमहा ₹3,355, GST सह.' },
  { me: false, t: 'तुम्ही आज ₹4,800 देता. वर्षाला ₹17,340 बचत.' },
]

const STEPS = [
  ['Tell us, your way', 'Type or send a voice note in Hindi, Marathi, Tamil, English or Hinglish. A few questions, no forms.', 'Mic'],
  ['See one price', 'Internet, SIMs, billing and more as one monthly price, with GST shown. Every item says why it’s there.', 'ReceiptIndianRupee'],
  ['Verify in two minutes', 'GST checked with the registry, Udyam from DigiLocker, or photos from your phone. The signatory approves by OTP.', 'ScanLine'],
  ['Go live, without chasing', 'Pay by UPI. Every step of the install arrives on WhatsApp before you think to ask.', 'Rocket'],
]

export default function Landing() {
  const nav = useNavigate()
  const [i, setI] = useState(0)
  const [plans, setPlans] = useState<any[]>([])
  const [starting, setStarting] = useState(false)
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % HELLO.length), 2200); return () => clearInterval(t) }, [])
  useEffect(() => { api.personas().then(setPlans).catch(() => {}) }, [])
  const start = async () => { setStarting(true); const j = await api.start('web'); nav(`/j/${j.id}`) }

  return (
    <div className="min-h-screen bg-white text-smoke">
      <nav className="sticky top-0 z-40 border-b border-hair bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5">
          <LightLogo />
          <div className="ml-auto hidden items-center gap-6 text-[14px] text-graphite md:flex">
            <a href="#how" className="hover:text-smoke">How it works</a>
            <a href="#plans" className="hover:text-smoke">Plans</a>
            <Link to="/privacy" className="hover:text-smoke">Privacy</Link>
            <Link to="/partner" className="hover:text-smoke">For partners</Link>
          </div>
          <Btn className="ml-auto h-9 px-4 text-[14px] md:ml-0" onClick={start}>Start</Btn>
        </div>
      </nav>

      <header className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.15fr_.85fr] lg:pt-24">
        <div>
          <div className="h-8 overflow-hidden text-[20px] font-medium text-red-600">
            <AnimatePresence mode="wait">
              <motion.div key={HELLO[i]} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -24, opacity: 0 }}>{HELLO[i]}.</motion.div>
            </AnimatePresence>
          </div>
          <h1 className="mt-3 text-[48px] font-bold leading-[1.02] tracking-[-0.045em] sm:text-[72px]">Your business, online in one conversation.</h1>
          <p className="mt-6 max-w-xl text-[19px] leading-relaxed text-graphite">Internet, business SIMs, billing and WhatsApp selling from Accel Business. One plan, one bill, set up from your phone, in your language. Nobody needs to visit.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Btn big onClick={start}>{starting ? 'Starting…' : 'Start in your language'}</Btn>
            <Link to="/wa" className="inline-flex h-14 items-center gap-2 rounded-full bg-mist px-8 text-[17px] font-semibold hover:bg-hair"><Icon name="MessageCircle" className="h-5 w-5 text-[#00A884]" />Continue on WhatsApp</Link>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[340px] rounded-[44px] border-[9px] border-[#1c1c1e] bg-[#EFEAE2] shadow-[0_40px_80px_-40px_rgba(0,0,0,.45)]">
          <div className="flex items-center gap-2.5 rounded-t-[35px] bg-white px-4 pb-3 pt-7">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-red-600"><svg viewBox="0 0 64 64" className="h-5 w-5"><path d="M20 16v19a12 12 0 0 0 24 0V16" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" /><circle cx="44" cy="47" r="5" fill="#fff" /></svg></span>
            <div className="leading-tight"><div className="text-[15px] font-semibold">Udyam One</div><div className="text-[12px] text-graphite">Accel Business</div></div>
          </div>
          <div className="space-y-2 px-3 pb-8 pt-4">
            {CHAT.map((m, k) => (
              <motion.div key={k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + k * 0.7 }} className={m.me ? 'flex justify-end' : 'flex'}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-[14px] leading-snug shadow-[0_1px_0.5px_rgba(11,20,26,.13)] ${m.me ? 'rounded-tr-none bg-[#D9FDD3]' : 'rounded-tl-none bg-white'}`}>
                  {m.voice && <div className="mb-1 flex items-center gap-2 text-[#667781]"><Icon name="Play" className="h-4 w-4 fill-current" /><span className="flex h-5 items-center gap-[2px]">{[5, 9, 6, 12, 8, 4, 10, 7, 11, 5, 8, 6].map((h, x) => <span key={x} className="w-[3px] rounded-full bg-[#667781]/50" style={{ height: h }} />)}</span><span className="text-[11px]">0:07</span></div>}
                  {m.t}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </header>

      <section className="bg-red-600 text-white">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="max-w-2xl text-[17px] text-white/80">Today, a small business waits for a sales visit, a PDF quote with product codes, and a pile of paperwork. Out of 5,000 leads last quarter:</p>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            {[['7.4%', 'got connected'], ['17.6 days', 'from first contact to live'], ['₹15,053', 'to win each one']].map(([v, k]) => (
              <div key={k}><div className="text-[48px] font-bold leading-none tracking-[-0.04em] tabular-nums">{v}</div><div className="mt-2 text-[17px] text-white/85">{k}</div></div>
            ))}
          </div>
          <p className="mt-10 max-w-2xl text-[17px]">Udyam One replaces the visit with a conversation, and the paperwork with registries that already know the business.</p>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-5 py-24">
        <h2 className="max-w-2xl text-[36px] font-bold leading-tight tracking-[-0.03em] sm:text-[44px]">Four steps, one sitting.</h2>
        <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([t, d, ic], k) => (
            <li key={t}>
              <div className="flex items-center gap-3"><span className="text-[14px] font-semibold tabular-nums text-red-600">{k + 1}</span><Icon name={ic} className="h-5 w-5 text-graphite" /></div>
              <div className="mt-4 text-[19px] font-semibold">{t}</div>
              <p className="mt-2 text-[15px] leading-relaxed text-graphite">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="plans" className="bg-mist">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <h2 className="text-[36px] font-bold leading-tight tracking-[-0.03em] sm:text-[44px]">Plans that fit the business.</h2>
          <p className="mt-3 max-w-2xl text-[17px] text-graphite">Typical starting plans, priced live from Accel’s catalogue. Yours is built from what you tell us.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => (
              <div key={p.key} className="flex flex-col rounded-3xl bg-white p-6">
                <div className="text-[13px] text-graphite">{p.who}</div>
                <div className="mt-1 text-[19px] font-semibold">{p.title}</div>
                <div className="mt-5 text-[34px] font-bold tracking-[-0.03em] tabular-nums">{rupee(p.monthly)}</div>
                <div className="text-[13px] text-graphite">a month with GST, live in about {p.eta} days</div>
                <ul className="mt-5 flex-1 space-y-1.5 text-[14px]">{p.items.slice(0, 5).map((it: string) => <li key={it} className="flex gap-2"><Icon name="Check" className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />{it}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-24 lg:grid-cols-2">
        <div>
          <h2 className="text-[36px] font-bold leading-tight tracking-[-0.03em] sm:text-[44px]">Your documents stay yours.</h2>
          <p className="mt-4 text-[17px] leading-relaxed text-graphite">Consent comes first, for one purpose. ID numbers are hidden before anything reaches the AI. Photos are encrypted, and we keep the KYC record only as long as telecom rules require. Type DELETE any time.</p>
          <Link to="/privacy" className="mt-6 inline-block text-[15px] font-medium text-red-600">Read the privacy note</Link>
        </div>
        <div className="rounded-3xl bg-mist p-8">
          <div className="text-[19px] font-semibold">Accel partner near you?</div>
          <p className="mt-2 text-[15px] leading-relaxed text-graphite">When a business needs a person, a local partner gets the whole conversation and keeps the commission. The advisor handles the rest.</p>
          <Link to="/partner" className="mt-5 inline-flex h-11 items-center rounded-full bg-white px-6 text-[15px] font-semibold hover:bg-hair">Open the partner console</Link>
        </div>
      </section>

      <footer className="border-t border-hair">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 text-[13px] text-graphite">
          <span>Prototype for Airtel SYNC 2026, Track A. Accel Business is the fictional operator from the case; all data is synthetic.</span>
          <Link to="/stage" className="ml-auto hover:text-smoke">Demo stage</Link>
          <Link to="/privacy" className="hover:text-smoke">Privacy</Link>
        </div>
      </footer>
    </div>
  )
}
