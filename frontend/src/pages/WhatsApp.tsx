import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Icon, Md } from '../components/ui'
import { api, Journey, Msg, useJourney, useSpecimens } from '../lib/api'
import { celebrate, cx, DOC_LABEL, inr } from '../lib/util'
import { IncomingCall, LiveCall } from '../components/Call'
import { micAllowed, say, speak, stopSpeaking, useRecorder, useVoiceEngine, useVoiceInput } from '../lib/voice'

const fmtTime = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const SAMPLE_VOICE: Record<string, string[]> = {
  en: ['I run a dental clinic in Pune with 6 staff and I need internet that never goes down', 'Add CCTV please', 'What is the installation time?'],
  hinglish: ['Mera kirana store hai Lucknow mein, 3 log kaam karte hain, internet aur billing chahiye', 'Sasta option dikhao', 'Install kab tak hoga?'],
  hi: ['मेरा रेस्टोरेंट है जयपुर में, 3 ब्रांच और 25 लोग काम करते हैं', 'कैमरा भी चाहिए', 'इंस्टॉल कब तक होगा?'],
  mr: ['माझं डेंटल क्लिनिक आहे पुण्यात, चार लोक काम करतात', 'इंटरनेट आणि बिलिंग पाहिजे', 'स्वस्त पर्याय दाखवा'],
  ta: ['என் மளிகை கடை சென்னையில், ஐந்து பேர் வேலை செய்கிறார்கள்', 'இணையம் மற்றும் பில்லிங் வேண்டும்', 'மலிவான திட்டம்'],
}
const CALLBACK_OPENER: Record<string, string> = {
  en: 'Hello, this is Udyam One from Accel Business, calling back as you asked. How can I help with your plan?',
  hi: 'नमस्ते, मैं Accel Business से Udyam One, आपके कहने पर कॉल कर रही हूँ। प्लान के बारे में क्या जानना है?',
  hinglish: 'Namaste, main Udyam One, aapke kehne pe call kar rahi hoon. Plan ke baare mein kya jaanna hai?',
  mr: 'नमस्कार, मी Accel Business कडून Udyam One, तुम्ही सांगितल्याप्रमाणे कॉल करतेय. प्लॅनबद्दल काय जाणून घ्यायचं आहे?',
  ta: 'வணக்கம், நான் Accel Business-இலிருந்து Udyam One, நீங்கள் கேட்டபடி அழைக்கிறேன். உங்கள் திட்டம் பற்றி என்ன தெரிய வேண்டும்?',
}

export default function WhatsAppPage() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const embed = sp.get('embed') === '1'
  const nav = useNavigate()

  useEffect(() => {
    if (!id) api.start('wa').then((j) => nav(`/wa/${j.id}${embed ? '?embed=1' : ''}`, { replace: true }))
  }, [id, nav, embed])

  if (!id) return <div className="grid min-h-screen place-items-center bg-wa-bg"><div className="h-8 w-8 animate-spin rounded-full border-2 border-wa-green border-t-transparent" /></div>
  if (embed) return <div className="h-screen"><WaChat id={id} framed /></div>

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-mist p-0 sm:p-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600/10 blur-[140px]" />
      </div>
      <div className="relative h-screen w-full sm:h-[860px] sm:w-[400px]">
        <PhoneFrame><WaChat id={id} framed /></PhoneFrame>
      </div>
    </div>
  )
}

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-full w-full sm:rounded-[54px] sm:border-[10px] sm:border-[#1b1b1f] sm:bg-black sm:p-0 sm:shadow-[0_30px_80px_-30px_rgba(0,0,0,.35)]">
      <div className="pointer-events-none absolute left-1/2 top-2 z-30 hidden h-7 w-28 -translate-x-1/2 rounded-full bg-black sm:block" />
      <div className="h-full w-full overflow-hidden sm:rounded-[44px]">{children}</div>
    </div>
  )
}

export function WaChat({ id, framed }: { id: string; framed: boolean }) {
  const { j, run, setJ } = useJourney(id)
  const engine = useVoiceEngine()
  const recorder = useRecorder()
  const [call, setCall] = useState<{ opener?: string } | null>(null)
  const [banner, setBanner] = useState<Msg | null>(null)
  const seenNotify = useRef<string | null>(null)
  const [text, setText] = useState('')
  const [pending, setPending] = useState<{ text: string; voice?: boolean } | null>(null)
  const [tts, setTts] = useState(false)
  const [sheet, setSheet] = useState<null | { kind: 'attach' } | { kind: 'samples'; doc: string } | { kind: 'list'; msg: Msg } | { kind: 'upi' } | { kind: 'voice' }>(null)
  const [localDocs, setLocalDocs] = useState<Record<string, string>>({})
  const scroller = useRef<HTMLDivElement>(null)
  const spoken = useRef('')
  const file = useRef<HTMLInputElement>(null)
  const fileDoc = useRef('gst')

  const send = useCallback(async (t: string, voice = false) => {
    const msg = t.trim()
    if (!msg) return
    setPending({ text: msg, voice })
    setText('')
    await run(() => api.send(id, msg, 'wa', voice))
    setPending(null)
  }, [id, run])

  const mic = useVoiceInput(j?.lang || 'en', (t) => send(t, true), () => setSheet({ kind: 'voice' }))
  const serverMic = engine === 'sarvam' && micAllowed()
  const recording = mic.listening || recorder.recording
  const level = recorder.recording ? recorder.level : mic.level

  const startMic = async () => {
    stopSpeaking()
    if (serverMic) { try { await recorder.start() } catch { setSheet({ kind: 'voice' }) } }
    else if (mic.supported) mic.start()
    else setSheet({ kind: 'voice' })
  }
  const stopMic = async () => {
    if (!recorder.recording) return mic.stop()
    const r = await recorder.stop()
    if (!r) return
    setPending({ text: '…', voice: true })
    await run(async () => {
      const out = await api.voice(id, r.blob, 'wa', 'note')
      if (tts && out.reply) say(out.reply, out.lang)
      return out.journey
    })
    setPending(null)
  }

  // our notifier: a banner drops in for each new notification, like a phone's lock-screen alert
  const lastNotify = j ? [...j.messages].reverse().find((m) => m.kind === 'notify') : undefined
  useEffect(() => {
    if (!j) return
    if (seenNotify.current === null) { seenNotify.current = lastNotify?.id || ''; return }
    if (!lastNotify || seenNotify.current === lastNotify.id) return
    seenNotify.current = lastNotify.id
    setBanner(lastNotify)
    const t = setTimeout(() => setBanner(null), 4500)
    return () => clearTimeout(t)
  }, [lastNotify?.id, !!j]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [j?.messages.length, pending])

  const last = j?.messages[j.messages.length - 1]
  useEffect(() => {
    if (!tts || !last || last.role !== 'bot' || spoken.current === last.id) return
    spoken.current = last.id
    const t = last.text || (last.kind === 'order_update' ? `${last.payload?.title}. ${last.payload?.detail}` : '')
    if (t) speak(t, j!.lang)
  }, [last, tts, j])

  if (!j) return <div className="grid h-full place-items-center bg-wa-bg"><div className="h-8 w-8 animate-spin rounded-full border-2 border-wa-green border-t-transparent" /></div>

  const sendDoc = async (doc: string, src: { applicant?: string; file?: File }) => {
    setSheet(null)
    setLocalDocs((d) => ({ ...d, [doc]: src.file ? URL.createObjectURL(src.file) : `/api/kyc/specimen/${src.applicant}/${doc}.png` }))
    await run(() => (src.file ? api.upload(id, doc, src.file, 'wa') : api.specimen(id, src.applicant!, doc, 'wa')))
  }

  const msgs = j.messages
  const lastUserIdx = msgs.map((m) => m.role).lastIndexOf('user')

  return (
    <div className="relative flex h-full flex-col bg-wa-bg font-sans text-wa-text">
      {framed && (
        <div className="flex h-11 shrink-0 items-end justify-between bg-wa-panel px-7 pb-1.5 text-[13px] font-semibold">
          <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
          <span className="flex items-center gap-1.5"><Icon name="Signal" className="h-3.5 w-3.5" /><Icon name="Wifi" className="h-3.5 w-3.5" /><Icon name="BatteryFull" className="h-4 w-4" /></span>
        </div>
      )}
      <header className="flex shrink-0 items-center gap-2 bg-wa-panel px-2 py-2">
        <Icon name="ArrowLeft" className="h-5 w-5 text-wa-text" />
        <div className="relative grid h-10 w-10 place-items-center rounded-full red-gradient">
          <svg viewBox="0 0 64 64" className="h-6 w-6"><path d="M20 16v19a12 12 0 0 0 24 0V16" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" /><circle cx="44" cy="47" r="5" fill="#fff" /></svg>
        </div>
        <div className="min-w-0 flex-1 pl-1">
          <div className="flex items-center gap-1 text-[16px] font-semibold">Udyam One <Icon name="BadgeCheck" className="h-4 w-4 fill-wa-green text-white" /></div>
          <div className="truncate text-xs text-wa-muted">{pending ? 'typing…' : 'Business account · replies instantly'}</div>
        </div>
        <button onClick={() => setTts((v) => !v)} title="Read replies aloud" className={cx('rounded-full p-2', tts ? 'text-wa-green' : 'text-wa-text')}>
          <Icon name={tts ? 'Volume2' : 'VolumeX'} className="h-5 w-5" />
        </button>
        <button aria-label="Call Udyam One" onClick={() => setCall({})} className="mx-1 rounded-full p-1.5 hover:bg-wa-sheet"><Icon name="Phone" className="h-[19px] w-[19px]" /></button>
      </header>

      <div ref={scroller} className="wa-wallpaper min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
        <div className="mx-auto mb-2 w-fit rounded-lg bg-white/90 px-3 py-1 text-[11px] font-medium uppercase text-wa-muted">Today</div>
        <div className="mx-auto mb-3 max-w-[90%] rounded-lg bg-[#FFEECD] px-3 py-2 text-center text-[11.5px] leading-snug text-[#54656F]">
          <Icon name="Lock" className="mr-1 inline h-3 w-3" />This business works with Accel Business to manage this chat. Your documents are used only for verification.
        </div>
        <AnimatePresence initial={false}>
          {msgs.map((m, i) => (
            <WaMessage key={m.id} m={m} j={j} localDocs={localDocs} interactive={i > lastUserIdx}
              onChip={(c) => {
                if (/confirm/i.test(c)) run(() => api.confirm(id, j.cart?.plan || 'complete', 'wa'))
                else if (/expert|बात करें|Expert se/i.test(c)) run(() => api.handoff(id, 'Asked for an expert on WhatsApp', 'wa'))
                else send(c.replace(/^✅\s*/, ''))
              }}
              onList={() => setSheet({ kind: 'list', msg: m })}
              onConsent={() => run(() => api.consent(id, 'wa'))}
              onAttach={() => setSheet({ kind: 'attach' })}
              onPay={() => setSheet({ kind: 'upi' })}
              onDigiLocker={() => run(() => api.digilocker(id))}
              onListen={(t) => say(t, j.lang)}
            />
          ))}
          {pending && (
            <motion.div key="p" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
              <OutBubble ts={Date.now() / 1000} ticks="sent">{pending.voice ? <VoiceNote text={pending.text} /> : pending.text}</OutBubble>
            </motion.div>
          )}
          {pending && (
            <motion.div key="t" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex">
              <div className="flex gap-1 rounded-lg rounded-tl-none bg-wa-in px-3 py-3">
                {[0, 1, 2].map((k) => <motion.span key={k} className="h-1.5 w-1.5 rounded-full bg-wa-muted" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: k * 0.2 }} />)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="shrink-0 bg-wa-bg px-2 pb-2 pt-1.5">
        {recording ? (
          <div className="flex items-center gap-2 rounded-full bg-wa-panel px-4 py-2.5">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500" /><span className="h-2.5 w-2.5 rounded-full bg-red-500" /></span>
            <div className="flex h-6 flex-1 items-center gap-[2px] overflow-hidden">
              {Array.from({ length: 34 }).map((_, k) => <motion.span key={k} className="w-[2.5px] rounded-full bg-wa-muted" animate={{ height: 3 + Math.abs(Math.sin(k * 0.9 + level * 7)) * 18 * (recorder.recording ? 0.3 + level : 1) }} transition={{ duration: 0.12 }} />)}
            </div>
            <span className="max-w-[40%] truncate text-xs text-wa-muted">{mic.interim || (recorder.recording ? 'Recording' : '')}</span>
            <button aria-label="Send voice note" onClick={stopMic} className="grid h-10 w-10 place-items-center rounded-full bg-wa-green text-white"><Icon name="Send" className="h-5 w-5" /></button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); send(text) }} className="flex items-end gap-1.5">
            <div className="flex min-h-[46px] flex-1 items-center gap-2 rounded-3xl bg-wa-panel px-3">
              <Icon name="Smile" className="h-6 w-6 shrink-0 text-wa-muted" />
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" className="min-w-0 flex-1 bg-transparent py-3 text-[15px] text-wa-text outline-none placeholder:text-wa-muted" />
              <button type="button" onClick={() => setSheet({ kind: 'attach' })}><Icon name="Paperclip" className="h-5 w-5 -rotate-45 text-wa-muted" /></button>
              {!text && <button type="button" onClick={() => setSheet({ kind: 'attach' })}><Icon name="Camera" className="h-5 w-5 text-wa-muted" /></button>}
            </div>
            <motion.button whileTap={{ scale: 0.88 }} type={text ? 'submit' : 'button'}
              aria-label={text ? 'Send' : 'Record a voice note'} onClick={() => { if (!text) startMic() }}
              className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full bg-wa-green text-white">
              <Icon name={text ? 'SendHorizontal' : 'Mic'} className="h-5 w-5" />
            </motion.button>
          </form>
        )}
      </div>

      <input ref={file} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) sendDoc(fileDoc.current, { file: f }); e.currentTarget.value = '' }} />

      <AnimatePresence>
        {banner && (
          <motion.button key={banner.id} onClick={() => setBanner(null)} initial={{ y: -90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -90, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="absolute inset-x-2.5 top-12 z-40 flex gap-3 rounded-[22px] bg-white/90 p-3 text-left shadow-[0_10px_30px_rgba(0,0,0,.18)] backdrop-blur-xl">
            <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-red-600"><svg viewBox="0 0 64 64" className="h-5 w-5"><path d="M20 16v19a12 12 0 0 0 24 0V16" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" /><circle cx="44" cy="47" r="5" fill="#fff" /></svg></span>
            <span className="min-w-0 flex-1">
              <span className="flex justify-between text-[13px]"><b className="font-semibold">Udyam One</b><span className="text-wa-muted">now</span></span>
              <span className={cx('block text-[13px] font-semibold', banner.payload?.template === 'payment_failed' ? 'text-red-600' : 'text-wa-text')}>{banner.payload?.title}</span>
              <span className="block text-[13px] leading-snug text-wa-text/80">{banner.payload?.body}</span>
            </span>
          </motion.button>
        )}
        {j.call?.state === 'ringing' && !call && (
          <IncomingCall key="in" reason={j.call.reason} onAccept={() => setCall({ opener: CALLBACK_OPENER[j.lang] || CALLBACK_OPENER.en })}
            onDecline={() => run(() => api.call(id, 'end'))} />
        )}
        {call && <LiveCall key="call" j={j} onJourney={setJ} opener={call.opener} onClose={() => setCall(null)} />}
      </AnimatePresence>

      <WaSheet open={!!sheet} onClose={() => setSheet(null)}>
        {sheet?.kind === 'attach' && (
          <AttachSheet j={j} onCamera={(doc) => { fileDoc.current = doc; setSheet(null); file.current?.click() }} onSamples={(doc) => setSheet({ kind: 'samples', doc })} />
        )}
        {sheet?.kind === 'samples' && <SampleSheet doc={sheet.doc} onPick={(a) => sendDoc(sheet.doc, { applicant: a })} />}
        {sheet?.kind === 'list' && <ListSheet msg={sheet.msg} onSend={(v) => { setSheet(null); send(v) }} />}
        {sheet?.kind === 'upi' && <UpiSheet j={j} onDone={async () => { setSheet(null); celebrate(); await run(() => api.pay(id, 'upi', true, 'wa')) }} />}
        {sheet?.kind === 'voice' && (
          <div>
            <div className="mb-1 text-base font-semibold">Send a voice note</div>
            <p className="mb-3 text-xs text-wa-muted">Live voice needs Chrome/Edge with a microphone. Pick a sample voice note to see how it's understood:</p>
            <div className="space-y-2">
              {(SAMPLE_VOICE[j.lang] || SAMPLE_VOICE.en).concat(j.lang === 'en' ? SAMPLE_VOICE.hinglish.slice(0, 1) : SAMPLE_VOICE.en.slice(0, 1)).map((s) => (
                <button key={s} onClick={() => { setSheet(null); send(s, true) }} className="flex w-full items-center gap-3 rounded-xl bg-wa-bg px-3 py-3 text-left text-sm hover:bg-wa-sheet">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-wa-green text-white"><Icon name="Mic" className="h-4 w-4" /></span>
                  <span className="text-wa-text">“{s}”</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </WaSheet>
    </div>
  )
}

function OutBubble({ children, ts, ticks = 'read', image }: { children: React.ReactNode; ts: number; ticks?: 'sent' | 'read'; image?: string }) {
  return (
    <div className="relative max-w-[82%] rounded-lg rounded-tr-none bg-wa-out px-2 pb-1.5 pt-1.5 text-[14.5px] leading-snug shadow-sm">
      <span className="absolute -right-2 top-0 h-3 w-3 bg-wa-out [clip-path:polygon(0_0,100%_0,0_100%)]" />
      {image && <img src={image} alt="" className="mb-1 max-h-56 w-60 rounded-md bg-white object-cover object-top" />}
      <div className="px-1">{children}</div>
      <div className="mt-0.5 flex items-center justify-end gap-1 px-1 text-[10.5px] text-wa-muted">
        {fmtTime(ts)}
        <Icon name="CheckCheck" className={cx('h-3.5 w-3.5', ticks === 'read' ? 'text-wa-green' : 'text-wa-muted')} />
      </div>
    </div>
  )
}

function InBubble({ children, ts, className }: { children: React.ReactNode; ts: number; className?: string }) {
  return (
    <div className={cx('relative max-w-[86%] rounded-lg rounded-tl-none bg-wa-in px-2.5 pb-1.5 pt-1.5 text-[14.5px] leading-snug shadow-sm', className)}>
      <span className="absolute -left-2 top-0 h-3 w-3 bg-wa-in [clip-path:polygon(0_0,100%_0,100%_100%)]" />
      {children}
      <div className="mt-0.5 text-right text-[10.5px] text-wa-muted">{fmtTime(ts)}</div>
    </div>
  )
}

function VoiceNote({ text }: { text: string }) {
  const bars = Array.from({ length: 28 }, (_, i) => 4 + Math.abs(Math.sin(i * 1.3 + text.length)) * 16)
  return (
    <div className="w-60">
      <div className="flex items-center gap-2 py-1">
        <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-wa-green/15"><Icon name="Play" className="h-4 w-4 fill-wa-text" /></div>
        <div className="flex h-7 flex-1 items-center gap-[2px]">{bars.map((h, i) => <span key={i} className="w-[2.5px] rounded-full bg-wa-muted/50" style={{ height: h }} />)}</div>
        <span className="text-[11px] text-wa-muted">0:0{Math.min(9, 2 + Math.round(text.length / 18))}</span>
      </div>
      <div className="mt-1 border-t border-black/10 pt-1 text-[12.5px] italic text-wa-text/70">“{text}”</div>
    </div>
  )
}

function WaButtons({ items }: { items: { label: string; icon?: string; onClick: () => void }[] }) {
  return (
    <div className="mt-[3px] grid w-[86%] gap-[3px]">
      {items.map((b, i) => (
        <motion.button key={b.label + i} whileTap={{ scale: 0.97 }} onClick={b.onClick}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-wa-in py-2.5 text-[14px] font-medium text-wa-green shadow-sm transition hover:bg-wa-sheet">
          {b.icon && <Icon name={b.icon} className="h-4 w-4" />}{b.label}
        </motion.button>
      ))}
    </div>
  )
}

function WaMessage({ m, j, interactive, localDocs, onChip, onList, onConsent, onAttach, onPay, onDigiLocker, onListen }: {
  m: Msg; j: Journey; interactive: boolean; localDocs: Record<string, string>
  onChip: (c: string) => void; onList: () => void; onConsent: () => void; onAttach: () => void; onPay: () => void
  onDigiLocker: () => void; onListen: (text: string) => void
}) {
  const wrap = (node: React.ReactNode, mine: boolean) => (
    <motion.div layout initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 34 }}
      className={cx('flex flex-col', mine ? 'items-end' : 'items-start')}>
      {node}
      {m.channel === 'web' && <span className="mt-0.5 px-1 text-[10px] text-wa-muted"><Icon name="Monitor" className="mr-0.5 inline h-2.5 w-2.5" /> from web</span>}
    </motion.div>
  )

  if (m.role === 'user') {
    if (m.kind === 'doc') {
      const doc = m.payload?.doc
      return wrap(<OutBubble ts={m.ts} image={m.payload?.img || localDocs[doc]}>📄 {DOC_LABEL[doc] || m.text}</OutBubble>, true)
    }
    return wrap(<OutBubble ts={m.ts}>{m.voice ? <VoiceNote text={m.text || ''} /> : m.text}</OutBubble>, true)
  }

  const p = m.payload
  switch (m.kind) {
    case 'bundle':
      return wrap(
        <>
          <InBubble ts={m.ts} className="w-[86%] p-1">
            <div className="red-gradient relative overflow-hidden rounded-md p-3">
              <div className="absolute -right-4 -top-6 h-24 w-24 rounded-full bg-white/15 blur-xl" />
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/85"><Icon name="Package" className="h-3.5 w-3.5" /> {p.title} plan</div>
              <div className="mt-1 text-[26px] font-extrabold leading-tight text-white">{inr(p.monthly_with_gst)}<span className="text-sm font-semibold text-white/80">/month</span></div>
              <div className="text-[11.5px] text-white/85">incl. GST · setup {inr(p.setup)} · live in ~{p.eta_days} days</div>
            </div>
            <div className="px-1.5 pt-2">
              {p.items.map((it: any) => (
                <div key={it.id} className="flex items-start gap-2 py-1 text-[13.5px]">
                  <span className="mt-0.5 text-wa-green">✔</span>
                  <span className="flex-1">{it.name}{it.qty > 1 ? ` ×${it.qty}` : ''}</span>
                  <span className="text-wa-muted">{inr(it.monthly)}</span>
                </div>
              ))}
            </div>
          </InBubble>
          {interactive && (
            <WaButtons items={[
              { label: 'Confirm plan', icon: 'CircleCheck', onClick: () => onChip('✅ Confirm') },
              { label: 'Customise on web', icon: 'ExternalLink', onClick: () => window.open(`/j/${j.id}`, '_blank') },
            ]} />
          )}
        </>, false)
    case 'consent':
      return wrap(
        <>
          <InBubble ts={m.ts} className="w-[86%]">
            <div className="flex items-center gap-2 font-semibold"><Icon name="ShieldCheck" className="h-4 w-4 text-wa-green" /> Your consent (DPDP Act, 2023)</div>
            <div className="mt-1.5 space-y-1 text-[13px] text-wa-text/80">
              <div>• <b>Why:</b> {p.purpose}</div>
              <div>• <b>What:</b> {p.data.join(', ')}</div>
              <div>• <b>How long:</b> {p.retention}</div>
              <div>• <b>Your rights:</b> {p.rights}</div>
            </div>
          </InBubble>
          {!j.kyc.consent && <WaButtons items={[{ label: 'I agree', icon: 'Check', onClick: onConsent }]} />}
        </>, false)
    case 'doc_request': {
      const docs = ['gst', 'udyam', 'id', 'address']
      return wrap(
        <>
          <InBubble ts={m.ts} className="w-[86%]">
            <Md text={m.text} />
            <div className="mt-2 space-y-1">
              {docs.map((d) => {
                const dd = j.kyc.docs[d]
                const ok = dd && dd.quality === 'ok' && !(j.kyc.result?.checks || []).some((c) => c.doc === d && c.status === 'fail')
                return (
                  <div key={d} className="flex items-center gap-2 text-[13.5px]">
                    <span>{ok ? '✅' : dd ? '⚠️' : '⬜'}</span>{DOC_LABEL[d]}{d === 'udyam' && <span className="text-wa-muted">(optional)</span>}
                  </div>
                )
              })}
            </div>
          </InBubble>
          {j.stage === 'verify' && <WaButtons items={[{ label: 'Send document', icon: 'Paperclip', onClick: onAttach },
            ...(j.profile.gstin && !j.kyc.docs.gst ? [{ label: 'Fetch from DigiLocker', icon: 'FolderLock', onClick: onDigiLocker }] : [])]} />}
        </>, false)
    }
    case 'doc_result':
      return wrap(
        <InBubble ts={m.ts}>
          <Md text={m.text} />
          {p?.quality === 'ok' && p.fields && (
            <div className="mt-1.5 rounded-md bg-wa-sheet p-2 text-[12px] text-wa-muted">
              {Object.entries(p.fields).filter(([k, v]) => v && !k.startsWith('_')).slice(0, 4).map(([k, v]) => (
                <div key={k} className="truncate"><span className="capitalize">{k.replace(/_/g, ' ')}:</span> <span className="text-wa-text">{String(v)}</span></div>
              ))}
            </div>
          )}
        </InBubble>, false)
    case 'kyc_summary':
      return wrap(
        <InBubble ts={m.ts} className="w-[86%]">
          <div className="font-semibold">{p.status === 'verified' ? '✅ Business verified' : p.status === 'blocked' ? '⛔ Verification blocked' : '⚠️ Please fix these'}</div>
          <div className="mt-1 space-y-0.5 text-[12.5px]">
            {p.checks.filter((c: any) => p.status === 'verified' ? c.status === 'pass' : c.status !== 'pass').slice(0, 6).map((c: any) => (
              <div key={c.key} className="text-wa-text/80">{c.status === 'pass' ? '✔' : c.status === 'warn' ? '•' : '✖'} {p.status === 'verified' ? c.title : c.detail}</div>
            ))}
          </div>
        </InBubble>, false)
    case 'payment':
      return wrap(
        <>
          <InBubble ts={m.ts} className="w-[86%]">
            <div className="flex items-center gap-2 font-semibold"><Icon name="Receipt" className="h-4 w-4 text-wa-green" /> Order summary</div>
            <div className="mt-1.5 space-y-1 text-[13px]">
              <div className="flex justify-between"><span className="text-wa-muted">Due now (setup + GST)</span><b>{inr(p.due_now)}</b></div>
              <div className="flex justify-between"><span className="text-wa-muted">Monthly, after go-live</span><span>{inr(p.monthly_with_gst)}</span></div>
              <div className="flex justify-between"><span className="text-wa-muted">Live in</span><span>~{p.eta_days} days</span></div>
            </div>
          </InBubble>
          {!j.order && <WaButtons items={[{ label: `Pay ${inr(p.due_now)} with UPI`, icon: 'IndianRupee', onClick: onPay }]} />}
        </>, false)
    case 'order_update':
      return wrap(
        <InBubble ts={m.ts} className="border-l-4 border-wa-green">
          <div className="font-semibold">📦 {p.title}</div>
          <div className="text-[13.5px] text-wa-text/80">{p.detail}</div>
          {p.next && <div className="mt-1 text-[12px] text-wa-muted">Next: {p.next} · ETA {p.eta}</div>}
        </InBubble>, false)
    case 'notify':
      return wrap(
        <InBubble ts={m.ts} className={cx('border-l-4', p?.template === 'payment_failed' ? 'border-red-600' : 'border-wa-green')}>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-wa-muted"><Icon name="Bell" className="h-3 w-3" /> Notification</div>
          <div className={cx('font-semibold', p?.template === 'payment_failed' && 'text-red-600')}>{p?.title}</div>
          <div className="text-[13.5px] text-wa-text/80">{p?.body}</div>
        </InBubble>, false)
    case 'partner':
      return wrap(
        <InBubble ts={m.ts}>
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-red-600 text-white font-bold">{p.name?.[0]}</div>
            <div><div className="font-semibold">{p.name}</div><div className="text-[11.5px] text-wa-muted">{p.shop}</div></div>
          </div>
          <div className="mt-1.5 text-[13.5px]"><Md text={m.text} /></div>
        </InBubble>, false)
    default: {
      const chips = m.chips || []
      const many = chips.length > 3 || m.multi
      return wrap(
        <>
          <InBubble ts={m.ts}>
            <Md text={m.text} />
            <button onClick={() => onListen(m.text || '')} className="mt-1 flex items-center gap-1 text-[11px] font-medium text-wa-green"><Icon name="Volume2" className="h-3 w-3" /> Listen</button>
          </InBubble>
          {interactive && chips.length > 0 && (
            many ? <WaButtons items={[{ label: m.multi ? 'Choose what you need' : 'See options', icon: 'List', onClick: onList }]} />
              : <WaButtons items={chips.map((c) => ({ label: c, onClick: () => onChip(c) }))} />
          )}
        </>, false)
    }
  }
}

function WaSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="absolute inset-0 z-40 flex flex-col justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="relative max-h-[80%] overflow-y-auto rounded-t-3xl bg-white px-4 pb-6 pt-3 text-wa-text">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-wa-muted/50" />
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function AttachSheet({ j, onCamera, onSamples }: { j: Journey; onCamera: (doc: string) => void; onSamples: (doc: string) => void }) {
  if (j.stage !== 'verify' || !j.kyc.consent) {
    return <div className="py-4 text-center text-sm text-wa-muted">{j.stage === 'verify' ? 'Tap “I agree” on the consent message first.' : 'You can send documents once your plan is confirmed.'}</div>
  }
  return (
    <div>
      <div className="mb-3 text-base font-semibold">Which document?</div>
      <div className="space-y-2">
        {['gst', 'udyam', 'id', 'address'].map((d) => {
          const done = j.kyc.docs[d]
          return (
            <div key={d} className="flex items-center gap-3 rounded-xl bg-wa-bg p-3">
              <span className="text-lg">{done ? (done.quality === 'ok' ? '✅' : '⚠️') : '📄'}</span>
              <span className="flex-1 text-sm">{DOC_LABEL[d]}</span>
              <button onClick={() => onCamera(d)} className="rounded-full bg-wa-green/15 p-2 text-wa-green" title="Camera / gallery"><Icon name="Camera" className="h-4 w-4" /></button>
              <button onClick={() => onSamples(d)} className="rounded-full bg-wa-sheet px-3 py-1.5 text-xs font-semibold text-wa-text">Sample</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SampleSheet({ doc, onPick }: { doc: string; onPick: (a: string) => void }) {
  const list = useSpecimens().filter((a) => a.docs.includes(doc))
  return (
    <div>
      <div className="mb-3 text-base font-semibold">{DOC_LABEL[doc]} · sample applicants</div>
      <div className="grid grid-cols-3 gap-2">
        {list.map((a) => (
          <button key={a.id} onClick={() => onPick(a.id)} className="overflow-hidden rounded-xl bg-wa-bg text-left">
            <img src={`/api/kyc/specimen/${a.id}/${doc}.png`} alt="" className="h-20 w-full bg-white object-cover object-top" loading="lazy" />
            <div className="truncate px-2 py-1.5 text-[11px]"><b>{a.id}</b> {a.name}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function ListSheet({ msg, onSend }: { msg: Msg; onSend: (v: string) => void }) {
  const [sel, setSel] = useState<string[]>([])
  const chips = msg.chips || []
  return (
    <div>
      <div className="mb-3 text-base font-semibold">{msg.multi ? 'Select all that apply' : 'Choose one'}</div>
      <div className="divide-y divide-wa-line">
        {chips.map((c) => {
          const on = sel.includes(c)
          return (
            <button key={c} onClick={() => (msg.multi && !/suggest|सुझाइए|Aap hi/i.test(c) ? setSel((s) => (on ? s.filter((x) => x !== c) : [...s, c])) : onSend(c))}
              className="flex w-full items-center justify-between py-3 text-left text-[15px]">
              {c}
              <span className={cx('grid h-5 w-5 place-items-center rounded-full border-2', on ? 'border-wa-green bg-wa-green' : 'border-wa-muted')}>{on && <Icon name="Check" className="h-3 w-3 text-white" strokeWidth={3} />}</span>
            </button>
          )
        })}
      </div>
      {msg.multi && <button disabled={!sel.length} onClick={() => onSend(sel.join(', '))} className="mt-3 w-full rounded-full bg-wa-green py-3 font-semibold text-white disabled:opacity-40">Send ({sel.length})</button>}
    </div>
  )
}

function UpiSheet({ j, onDone }: { j: Journey; onDone: () => void }) {
  const [stage, setStage] = useState<'pin' | 'paying' | 'done'>('pin')
  const [pin, setPin] = useState(0)
  const due = Math.round((j.quote?.setup || 0) * 1.18)
  useEffect(() => {
    if (stage !== 'pin') return
    if (pin >= 4) { setStage('paying'); setTimeout(() => setStage('done'), 1400); setTimeout(onDone, 2300) }
  }, [pin, stage, onDone])
  return (
    <div className="text-center">
      <div className="text-xs uppercase tracking-widest text-wa-muted">Paying</div>
      <div className="mt-1 text-lg font-semibold">Accel Business · Udyam One</div>
      <div className="mt-2 text-4xl font-extrabold">{inr(due)}</div>
      {stage === 'pin' && (
        <>
          <div className="mt-5 text-sm text-wa-muted">Enter UPI PIN</div>
          <div className="mt-3 flex justify-center gap-3">
            {[0, 1, 2, 3].map((k) => <motion.span key={k} animate={{ scale: pin > k ? [1.4, 1] : 1 }} className={cx('h-3.5 w-3.5 rounded-full', pin > k ? 'bg-wa-text' : 'border-2 border-wa-muted')} />)}
          </div>
          <div className="mx-auto mt-5 grid max-w-[240px] grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} onClick={() => setPin((p) => p + 1)} className="rounded-xl bg-wa-bg py-3 text-lg font-semibold active:bg-wa-line">{n}</button>)}
          </div>
          <div className="mt-3 text-[11px] text-wa-muted">Demo payment · tap any 4 digits</div>
        </>
      )}
      {stage === 'paying' && <div className="mx-auto mt-8 h-12 w-12 animate-spin rounded-full border-4 border-wa-green border-t-transparent" />}
      {stage === 'done' && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }} className="mx-auto mt-6 grid h-16 w-16 place-items-center rounded-full bg-wa-green">
          <Icon name="Check" className="h-9 w-9 text-white" strokeWidth={3} />
        </motion.div>
      )}
    </div>
  )
}
