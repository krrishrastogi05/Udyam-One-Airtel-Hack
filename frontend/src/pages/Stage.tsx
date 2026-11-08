import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LightLogo } from '../components/light'
import { Icon } from '../components/ui'
import { api, Journey, Trace } from '../lib/api'
import { cx } from '../lib/util'

type Step = { cap?: [string, string]; say?: string; ch?: 'wa' | 'web'; voice?: boolean; act?: (id: string, j: Journey) => Promise<any>; wait?: number; label?: string }

const docsFor = (applicant: string, ch: 'wa' | 'web', docs = ['gst', 'udyam', 'id', 'address'], cap?: [string, string]): Step[] =>
  docs.map((d, i) => ({ label: `Send ${d} document`, act: (id) => api.specimen(id, applicant, d, ch), wait: 1800, cap: i === 0 ? cap : undefined }))
const ops = (n: number, cap?: [string, string]): Step[] => Array.from({ length: n }, (_, i) => ({ label: 'Update from operations', act: (id) => api.advance(id), wait: 1600, cap: i === 0 ? cap : undefined }))

const SCRIPTS: Record<string, { title: string; sub: string; steps: Step[] }> = {
  clinic: {
    title: 'Dental clinic, English', sub: 'Voice note, plan on both screens, bill check, photo KYC',
    steps: [
      { say: 'Hi, I run a dental clinic in Kochi with 6 staff', ch: 'wa', voice: true, cap: ['Discover', 'Dr. Shah sends one voice note. No form, no visit, no app to install.'] },
      { say: 'Internet that never goes down, professional email and billing', ch: 'wa' },
      { say: 'Yes', ch: 'wa' },
      { say: '32TTNXB7384T1ZW', ch: 'wa', cap: ['Discover', 'A GSTIN pulls the business from the registry in seconds.'] },
      { say: 'Home broadband, about 3000 a month', ch: 'wa', wait: 3000, cap: ['Plan', 'One plan, one monthly price. Prices come from the catalogue engine, never from the AI.'] },
      { label: 'Check against a bill photo', act: (id) => api.billSample(id), wait: 2600, cap: ['Plan', 'A photo of today’s bill: the real comparison, read by OCR.'] },
      { label: 'Add CCTV on the laptop', say: 'add cctv', ch: 'web', wait: 2800, cap: ['Plan', 'Same journey on the laptop. Add CCTV and both screens update.'] },
      { label: 'Confirm on the laptop', act: (id, j) => api.confirm(id, j.cart?.plan || 'complete', 'web'), wait: 2400 },
      { label: 'Consent on WhatsApp', act: (id) => api.consent(id, 'wa'), cap: ['Verify', 'Consent first: purpose, retention and rights in plain words (DPDP Act).'] },
      ...docsFor('K09', 'wa', undefined, ['Verify', 'Four photos are read, straightened and cross-checked. Every check is traced below.']),
      { label: 'Pay with UPI', act: (id) => api.pay(id, 'upi', true, 'wa'), wait: 2500, cap: ['Pay', 'Setup paid by UPI in the chat. The installer is booked by the Fulfilment agent.'] },
      ...ops(5, ['Go live', 'Every update arrives on WhatsApp. No “when?” calls.']),
    ],
  },
  marathi: {
    title: 'Workshop, मराठी', sub: 'DigiLocker, e-sign, failed payment, agent calls back',
    steps: [
      { say: 'माझं फर्निचर वर्कशॉप आहे नागपुरात, आठ लोक काम करतात', ch: 'wa', voice: true, cap: ['मराठी', 'A furniture workshop in Nagpur, entirely in Marathi.'] },
      { say: 'इंटरनेट आणि CCTV पाहिजे', ch: 'wa', voice: true },
      { say: 'हो', ch: 'wa' },
      { say: '27XUIXG0767D1ZP', ch: 'wa', cap: ['Registry', 'GSTIN found: Ganesh Woodcraft, active.'] },
      { say: 'हॉटस्पॉट, 3000', ch: 'wa', wait: 3000 },
      { label: 'Confirm', act: (id, j) => api.confirm(id, j.cart?.plan || 'complete', 'wa'), wait: 2000 },
      { label: 'Consent', act: (id) => api.consent(id, 'wa'), wait: 1800 },
      { label: 'Fetch from DigiLocker', act: (id) => api.digilocker(id), wait: 2400, cap: ['Zero paperwork', 'GST from the GST registry, Udyam from DigiLocker. No photos.'] },
      { label: 'Signatory e-signs', act: async (id) => { const r = await api.esign(id, 'Joseph Singh'); await new Promise((x) => setTimeout(x, 1800)); return api.esignDone(r.sign_link.split('/').pop()!, '123456') }, wait: 2400, cap: ['e-Sign', 'The signatory approves from his own phone with an OTP. Nobody waits together.'] },
      ...docsFor('K03', 'wa', ['address'], ['One photo', 'Only the address proof is photographed.']),
      { label: 'UPI times out', act: (id) => api.pay(id, 'upi', true, 'wa', true), wait: 3000, cap: ['Fulfilment agent', 'The UPI app times out. Our notifier sends a retry link in Marathi.'] },
      { label: 'Retry payment', act: (id) => api.pay(id, 'upi', true, 'wa'), wait: 2500 },
      ...ops(2),
      { label: 'Agent calls back', act: (id) => api.call(id, 'request'), wait: 1500, cap: ['Voice', 'The agent calls the owner back. Accept on the phone and talk, in Marathi.'] },
    ],
  },
  kirana: {
    title: 'Kirana, Hinglish', sub: 'No GST: honest eligibility, partner help',
    steps: [
      { say: 'Mera kirana store hai Lucknow mein, main aur 2 log kaam karte hain', ch: 'wa', voice: true, cap: ['Lucknow', 'A kirana owner talks in Hinglish, exactly as she would to a person.'] },
      { say: 'Internet, sim aur billing chahiye, WhatsApp pe bhi bechna hai', ch: 'wa' },
      { say: 'GST nahi hai', ch: 'wa', cap: ['Honest eligibility', 'No GST, so WhatsApp selling is locked, and she’s told why.'] },
      { say: 'Hotspot, 1500', ch: 'wa', wait: 3200 },
      { say: 'Sasta option dikhao', ch: 'wa', wait: 3000, cap: ['Price-sensitive', '“Show me something cheaper” gives the Essential plan, same catalogue rules.'] },
      { label: 'Ask for GST help', act: (id) => api.handoff(id, 'Wants help with GST registration to unlock WhatsApp Business', 'wa'), cap: ['Partners, not replaced', 'A local partner gets her full context, helps with GST and keeps the commission.'] },
    ],
  },
  restaurant: {
    title: 'Restaurant chain, हिन्दी', sub: 'Multi-site, a blocked KYC caught',
    steps: [
      { say: 'मेरा रेस्टोरेंट है, 3 ब्रांच और 25 लोग काम करते हैं, जयपुर में', ch: 'wa', voice: true, cap: ['जयपुर', 'A restaurant owner with 3 branches, entirely in Hindi.'] },
      { say: 'कैमरा, बिलिंग और बैकअप इंटरनेट चाहिए', ch: 'wa' },
      { say: 'हाँ', ch: 'wa' },
      { say: 'छोड़ें', ch: 'wa' },
      { say: 'लगभग ₹10,000', ch: 'wa', wait: 3200 },
      { label: 'Confirm', act: (id, j) => api.confirm(id, j.cart?.plan || 'complete', 'wa'), wait: 2000 },
      { label: 'Consent', act: (id) => api.consent(id, 'wa'), cap: ['Smart KYC', 'Four photos are read and checked against the GST and Udyam registries.'] },
      ...docsFor('K01', 'wa'),
      { label: 'Result', act: async () => null, wait: 3500, cap: ['Caught', 'The registry says the GSTIN is cancelled and the Udyam number is blank. Blocked, and a partner is alerted.'] },
    ],
  },
}

function Scaled({ w, h, src }: { w: number; h: number; src: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [s, setS] = useState(0.5)
  useEffect(() => {
    const el = box.current!
    const ro = new ResizeObserver(() => setS(Math.min(el.clientWidth / w, el.clientHeight / h)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [w, h])
  return (
    <div ref={box} className="relative h-full w-full overflow-hidden">
      <iframe src={src} title={src} allow="microphone; autoplay" style={{ width: w, height: h, transform: `scale(${s})`, transformOrigin: 'top left' }} className="absolute left-0 top-0 border-0" />
    </div>
  )
}

const AGENT_TONE: Record<string, string> = { Advisor: 'text-smoke', KYC: 'text-smoke', Fulfilment: 'text-smoke', Notifier: 'text-smoke', 'Win-back': 'text-smoke' }

export default function StagePage() {
  const [sp, setSp] = useSearchParams()
  const [id, setId] = useState<string | null>(sp.get('j'))
  const [playing, setPlaying] = useState<string | null>(null)
  const [stepLabel, setStepLabel] = useState('')
  const [caption, setCaption] = useState<[string, string] | null>(null)
  const [trace, setTrace] = useState<Trace[]>([])
  const [lat, setLat] = useState<number | null>(null)
  const stopRef = useRef(false)

  const fresh = useCallback(async () => {
    stopRef.current = true
    setCaption(null); setPlaying(null); setTrace([])
    const j = await api.start('wa')
    setId(j.id)
    setSp({ j: j.id }, { replace: true })
    return j.id
  }, [setSp])

  useEffect(() => { if (!id) fresh() }, [id, fresh])

  useEffect(() => {
    if (!id) return
    const es = new EventSource(`/api/journeys/${id}/events`)
    es.onmessage = (ev) => {
      try {
        const j = JSON.parse(ev.data) as Journey
        setLat(Math.max(8, Math.round(Date.now() - j.updated_at * 1000)))
        setTrace(j.trace || [])
      } catch { /* */ }
    }
    return () => es.close()
  }, [id])

  const play = async (key: string) => {
    const jid = await fresh()
    stopRef.current = false
    setPlaying(key)
    await new Promise((r) => setTimeout(r, 1500))
    for (const st of SCRIPTS[key].steps) {
      if (stopRef.current) break
      if (st.cap) setCaption(st.cap)
      setStepLabel(st.label || (st.voice ? `Voice note: “${st.say}”` : `“${st.say}”`))
      const j = await api.get(jid)
      if (st.say) await api.send(jid, st.say, st.ch || 'wa', !!st.voice).catch(() => {})
      else if (st.act) await st.act(jid, j).catch(() => {})
      await new Promise((r) => setTimeout(r, st.wait || 2300))
    }
    setPlaying(null); setStepLabel('')
    setTimeout(() => setCaption(null), 5000)
  }

  const recent = [...trace].reverse().slice(0, 5)

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#EEEEF1] text-smoke">
      <header className="relative z-10 flex flex-wrap items-center gap-3 px-5 py-3">
        <LightLogo />
        <span className="text-[13px] text-graphite">Demo stage</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {Object.entries(SCRIPTS).map(([k, s]) => (
            <button key={k} onClick={() => play(k)} disabled={!!playing} title={s.sub}
              className={cx('flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition disabled:opacity-40',
                playing === k ? 'bg-red-600 text-white' : 'bg-white text-smoke hover:bg-hair')}>
              <Icon name={playing === k ? 'Loader2' : 'Play'} className={cx('h-3.5 w-3.5', playing === k ? 'animate-spin' : 'text-red-600')} />{s.title}
            </button>
          ))}
          <button onClick={() => (playing ? ((stopRef.current = true), setPlaying(null)) : fresh())} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] text-graphite hover:bg-white">
            <Icon name={playing ? 'Square' : 'RotateCcw'} className="h-3.5 w-3.5" />{playing ? 'Stop' : 'New'}
          </button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center gap-8 px-6 pt-2 xl:gap-12 xl:px-10">
        <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-center">
          <div className="relative aspect-[16/10] max-h-full w-full max-w-[1080px]">
            <div className="absolute inset-0 rounded-[20px] bg-[#1c1c1e] p-[10px] shadow-[0_30px_80px_-30px_rgba(0,0,0,.45)]">
              <div className="h-full w-full overflow-hidden rounded-[11px] bg-white">
                {id && <Scaled key={id} w={1440} h={900} src={`/j/${id}?embed=1`} />}
              </div>
            </div>
          </div>
          <div className="h-3.5 w-[calc(min(100%,1080px)+56px)] rounded-b-[16px] bg-gradient-to-b from-[#c9c9ce] to-[#a9a9b0]" />
          <div className="mt-3 text-[12px] text-graphite">Web app on the owner’s laptop</div>
        </div>
        <div className="flex h-full min-h-0 flex-col items-center justify-center">
          <div className="relative aspect-[390/844] h-full max-h-[700px] rounded-[46px] border-[9px] border-[#1c1c1e] bg-black shadow-[0_30px_80px_-30px_rgba(0,0,0,.5)]">
            <div className="absolute left-1/2 top-2 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
            <div className="h-full w-full overflow-hidden rounded-[37px]">
              {id && <Scaled key={id} w={390} h={844} src={`/wa/${id}?embed=1`} />}
            </div>
          </div>
          <div className="mt-3 text-[12px] text-graphite">WhatsApp on the owner’s phone</div>
        </div>
      </div>

      <div className="relative z-10 mx-6 mb-4 mt-3 grid grid-cols-[1fr_auto] items-end gap-6 xl:mx-10">
        <div className="min-h-[124px] rounded-2xl bg-white px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,.04)]">
          <div className="mb-1.5 flex items-center gap-2 text-[12px] text-graphite">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />Agents working on this journey
            {lat !== null && lat < 3000 && <span className="ml-auto">both screens in sync, {lat} ms</span>}
          </div>
          <ul className="space-y-0.5 text-[13px]">
            <AnimatePresence initial={false}>
              {recent.map((t) => (
                <motion.li key={t.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="grid grid-cols-[64px_84px_160px_1fr_64px] gap-3">
                  <span className="tabular-nums text-graphite">{t.t}</span>
                  <span className={cx('font-semibold', AGENT_TONE[t.agent])}>{t.agent}</span>
                  <span className="truncate text-graphite">{t.act.replace(/_/g, ' ')}</span>
                  <span className={cx('truncate', t.level === 'alarm' ? 'font-medium text-red-600' : t.level === 'warn' ? 'text-amber-700' : '')}>{t.res}</span>
                  <span className="text-right tabular-nums text-graphite">{t.ms ? `${t.ms} ms` : ''}</span>
                </motion.li>
              ))}
            </AnimatePresence>
            {!recent.length && <li className="text-graphite">Pick a scenario above. Every tool call the agents make shows up here.</li>}
          </ul>
        </div>
        <AnimatePresence mode="wait">
          {stepLabel && (
            <motion.div key={stepLabel} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-[340px] truncate rounded-full bg-smoke px-4 py-2 text-[13px] text-white">{stepLabel}</motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {caption && (
          <motion.div key={caption[1]} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="absolute bottom-[168px] left-8 z-30 max-w-[460px] rounded-2xl bg-red-600 p-4 pr-6 text-white shadow-[0_20px_50px_-20px_rgba(228,0,0,.6)] xl:left-12">
            <div className="text-[12px] font-semibold text-white/80">{caption[0]}</div>
            <div className="mt-1 text-[18px] font-semibold leading-snug">{caption[1]}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
