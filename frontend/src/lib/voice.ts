import { useCallback, useEffect, useRef, useState } from 'react'
import { api, Journey, Lang } from './api'

/** Voice in the owner's language.
 *  Server voice (Sarvam speech-to-text and text-to-speech) when the backend has a key; otherwise the browser's own
 *  speech service (Chrome/Edge). Microphones only work on localhost or HTTPS. */

export const BCP: Record<string, string> = { en: 'en-IN', hi: 'hi-IN', hinglish: 'hi-IN', mr: 'mr-IN', ta: 'ta-IN' }
const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null
export const voiceSupported = () => !!SR

let engine: Promise<'sarvam' | 'browser'> | null = null
export const voiceEngine = () => (engine ??= api.voiceStatus().then((s) => s.engine).catch(() => 'browser' as const))

export function useVoiceEngine() {
  const [e, setE] = useState<'sarvam' | 'browser' | null>(null)
  useEffect(() => { voiceEngine().then(setE) }, [])
  return e
}

export const micAllowed = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext

const clean = (t: string) => t.replace(/\*\*/g, '').replace(/[*_#>]/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}️]/gu, '').trim()

// ---------------------------------------------------------------- speaking
let current: HTMLAudioElement | null = null
export function stopSpeaking() {
  current?.pause(); current = null
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

/** Speak and resolve when finished (or interrupted). */
export async function say(text: string, lang: Lang): Promise<void> {
  const t = clean(text)
  if (!t) return
  stopSpeaking()
  if ((await voiceEngine()) === 'sarvam') {
    try {
      const r = await fetch('/api/voice/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t, lang }) })
      if (r.ok) {
        const url = URL.createObjectURL(await r.blob())
        const a = new Audio(url)
        current = a
        await new Promise<void>((res) => { a.onended = a.onpause = a.onerror = () => res(); a.play().catch(() => res()) })
        URL.revokeObjectURL(url)
        return
      }
    } catch { /* fall back to the browser voice */ }
  }
  if (!('speechSynthesis' in window)) return
  await new Promise<void>((res) => {
    const u = new SpeechSynthesisUtterance(t)
    u.lang = BCP[lang] || 'en-IN'
    const v = window.speechSynthesis.getVoices().find((x) => x.lang === u.lang)
    if (v) u.voice = v
    u.rate = 1.02
    u.onend = u.onerror = () => res()
    window.speechSynthesis.speak(u)
  })
}
/** Fire-and-forget version used for "read replies aloud". */
export const speak = (text: string, lang: Lang) => { say(text, lang) }

// ---------------------------------------------------------------- browser speech-to-text (fallback)
export function useVoiceInput(lang: Lang, onFinal: (text: string) => void, onFail?: (reason: string) => void) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [level, setLevel] = useState(0)
  const rec = useRef<any>(null)
  const finalText = useRef('')
  const timer = useRef<number>()

  const stop = useCallback(() => { rec.current?.stop() }, [])
  const start = useCallback(() => {
    if (!SR) return false
    const r = new SR()
    r.lang = BCP[lang] || 'en-IN'
    r.interimResults = true
    r.continuous = false
    finalText.current = ''
    r.onresult = (e: any) => {
      let fin = '', mid = ''
      for (let i = 0; i < e.results.length; i++) (e.results[i].isFinal ? (fin += e.results[i][0].transcript) : (mid += e.results[i][0].transcript))
      finalText.current = fin || finalText.current
      setInterim(fin || mid)
    }
    r.onend = () => {
      setListening(false); window.clearInterval(timer.current); setLevel(0)
      const t = (finalText.current || '').trim()
      setInterim('')
      if (t) onFinal(t)
    }
    r.onerror = (e: any) => { setListening(false); window.clearInterval(timer.current); setLevel(0); setInterim(''); finalText.current = ''; onFail?.(e?.error || 'error') }
    rec.current = r
    r.start()
    setListening(true)
    timer.current = window.setInterval(() => setLevel(Math.random()), 120)
    return true
  }, [lang, onFinal, onFail])
  useEffect(() => () => { rec.current?.abort?.(); window.clearInterval(timer.current) }, [])
  return { listening, interim, level, start, stop, supported: !!SR }
}

// ---------------------------------------------------------------- microphone + level meter
async function openMic() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  const ctx = new AudioContext()
  const an = ctx.createAnalyser()
  an.fftSize = 1024
  ctx.createMediaStreamSource(stream).connect(an)
  const buf = new Float32Array(an.fftSize)
  const rms = () => { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length) }
  const close = () => { stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {}) }
  return { stream, rms, close }
}

const mimeType = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) || ''

/** Hold-to-record voice notes for the server voice path. */
export function useRecorder() {
  const [recording, setRecording] = useState(false)
  const [level, setLevel] = useState(0)
  const st = useRef<{ mic?: Awaited<ReturnType<typeof openMic>>; rec?: MediaRecorder; chunks: Blob[]; raf?: number; t0: number }>({ chunks: [], t0: 0 })

  const start = useCallback(async () => {
    const mic = await openMic()
    const rec = new MediaRecorder(mic.stream, mimeType() ? { mimeType: mimeType() } : undefined)
    st.current = { mic, rec, chunks: [], t0: Date.now() }
    rec.ondataavailable = (e) => e.data.size && st.current.chunks.push(e.data)
    rec.start(250)
    setRecording(true)
    const tick = () => { setLevel(Math.min(1, mic.rms() * 8)); st.current.raf = requestAnimationFrame(tick) }
    tick()
  }, [])

  const stop = useCallback(async (): Promise<{ blob: Blob; secs: number } | null> => {
    const s = st.current
    if (!s.rec) return null
    cancelAnimationFrame(s.raf!)
    await new Promise<void>((res) => { s.rec!.onstop = () => res(); s.rec!.stop() })
    s.mic?.close()
    setRecording(false); setLevel(0)
    const secs = (Date.now() - s.t0) / 1000
    st.current = { chunks: [], t0: 0 }
    return secs < 0.6 ? null : { blob: new Blob(s.chunks, { type: s.rec.mimeType || 'audio/webm' }), secs }
  }, [])

  useEffect(() => () => { cancelAnimationFrame(st.current.raf!); st.current.mic?.close() }, [])
  return { recording, level, start, stop }
}

// ---------------------------------------------------------------- the live call
export type CallState = 'idle' | 'connecting' | 'listening' | 'hearing' | 'thinking' | 'speaking' | 'ended' | 'error'
export type Caption = { who: 'agent' | 'owner'; text: string }

const OPENER: Record<string, string> = {
  en: 'Hello, this is Udyam One from Accel Business. Tell me about your business, in your own words.',
  hi: 'नमस्ते, मैं Accel Business से Udyam One बोल रही हूँ। अपने बिज़नेस के बारे में बताइए।',
  hinglish: 'Namaste, main Accel Business se Udyam One bol rahi hoon. Apne business ke baare mein batayiye.',
  mr: 'नमस्कार, मी Accel Business कडून Udyam One बोलतेय. तुमच्या व्यवसायाबद्दल सांगा.',
  ta: 'வணக்கம், நான் Accel Business-இலிருந்து Udyam One பேசுகிறேன். உங்கள் தொழிலைப் பற்றிச் சொல்லுங்கள்.',
}

const botTextSince = (j: Journey, n: number) =>
  j.messages.slice(n).filter((m) => m.role === 'bot' && m.text && ['text', 'doc_result'].includes(m.kind)).map((m) => m.text).join(' ')

/** Hands-free call: listens, detects when the owner stops talking, answers out loud, and stops talking if interrupted. */
export function useLiveCall(j: Journey | null, onJourney: (j: Journey) => void) {
  const [state, setState] = useState<CallState>('idle')
  const [captions, setCaptions] = useState<Caption[]>([])
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const live = useRef(false)
  const jr = useRef(j)
  jr.current = j
  const cleanup = useRef<() => void>(() => {})
  const add = (c: Caption) => setCaptions((cs) => [...cs.slice(-6), c])

  const answer = useCallback(async (reply: string, lang: Lang) => {
    if (!live.current || !reply) return
    add({ who: 'agent', text: clean(reply) })
    setState('speaking')
    await say(reply, lang)
  }, [])

  const end = useCallback(() => {
    live.current = false
    stopSpeaking()
    cleanup.current()
    setState('ended'); setLevel(0)
    if (jr.current) api.call(jr.current.id, 'end').catch(() => {})
  }, [])

  const start = useCallback(async (opener?: string) => {
    const jj = jr.current
    if (!jj || live.current) return
    live.current = true
    setCaptions([]); setError(null); setState('connecting')
    const lang = jj.lang
    api.call(jj.id, 'answer').catch(() => {})
    const server = (await voiceEngine()) === 'sarvam'

    if (!server) {
      // Browser fallback: one recognised utterance per turn.
      if (!SR) { setError('This browser has no speech service. Use Chrome or Edge, or add a Sarvam key.'); setState('error'); live.current = false; return }
      let rec: any = null
      cleanup.current = () => { try { rec?.abort() } catch { /* */ } }
      await answer(opener || OPENER[lang] || OPENER.en, lang)
      const turn = () => {
        if (!live.current) return
        rec = new SR()
        rec.lang = BCP[jr.current?.lang || lang] || 'en-IN'
        rec.interimResults = true
        let fin = ''
        setState('listening')
        rec.onresult = (e: any) => { let f = '', m = ''; for (let i = 0; i < e.results.length; i++) (e.results[i].isFinal ? (f += e.results[i][0].transcript) : (m += e.results[i][0].transcript)); fin = f || fin; setState('hearing'); setLevel(0.4 + Math.random() * 0.6) }
        rec.onend = async () => {
          setLevel(0)
          if (!live.current) return
          if (!fin.trim()) return turn()
          add({ who: 'owner', text: fin.trim() })
          setState('thinking')
          const n = jr.current!.messages.length
          try {
            const nj = await api.send(jr.current!.id, fin.trim(), 'wa', true)
            onJourney(nj)
            await answer(botTextSince(nj, n + 1), nj.lang)
          } catch { await answer(OPENER[lang], lang) }
          turn()
        }
        rec.onerror = () => {}
        rec.start()
      }
      turn()
      return
    }

    // Server voice: own voice-activity detection on the microphone, Sarvam for both directions.
    let mic: Awaited<ReturnType<typeof openMic>>
    try { mic = await openMic() } catch {
      setError(window.isSecureContext ? 'Allow the microphone to talk.' : 'The microphone needs HTTPS. Open the https:// address instead.')
      setState('error'); live.current = false; return
    }
    let raf = 0, rec: MediaRecorder | null = null, chunks: Blob[] = []
    let speechMs = 0, silenceMs = 0, last = performance.now(), floor = 0.01, calib = 0
    cleanup.current = () => { cancelAnimationFrame(raf); try { rec?.stop() } catch { /* */ } mic.close() }

    const send = async (blob: Blob) => {
      setState('thinking')
      try {
        const r = await api.voice(jr.current!.id, blob, 'wa', 'call')
        add({ who: 'owner', text: r.heard })
        onJourney(r.journey)
        await answer(r.reply, r.lang)
      } catch (e: any) {
        add({ who: 'agent', text: e.message })
      }
      if (live.current) setState('listening')
    }

    const loop = () => {
      const now = performance.now(), dt = now - last
      last = now
      const v = mic.rms()
      if (calib < 600) { floor = Math.max(floor, v); calib += dt }
      const thr = Math.max(0.02, floor * 2.2)
      setLevel(Math.min(1, v * 8))
      const st = stateRef.current
      if (st === 'speaking' && v > thr * 1.6) { speechMs += dt; if (speechMs > 250) { stopSpeaking(); speechMs = 0 } } // barge-in
      else if (st === 'listening' || st === 'hearing') {
        if (v > thr) {
          speechMs += dt; silenceMs = 0
          if (!rec && speechMs > 120) {
            chunks = []
            rec = new MediaRecorder(mic.stream, mimeType() ? { mimeType: mimeType() } : undefined)
            rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
            rec.start(200); setState('hearing')
          }
        } else if (rec) {
          silenceMs += dt
          if (silenceMs > 900) {
            const r = rec; rec = null; speechMs = 0; silenceMs = 0
            r.onstop = () => send(new Blob(chunks, { type: r.mimeType || 'audio/webm' }))
            r.stop()
          }
        } else speechMs = 0
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    await answer(opener || OPENER[lang] || OPENER.en, lang)
    if (live.current) setState('listening')
  }, [answer, onJourney])

  const stateRef = useRef(state)
  stateRef.current = state
  useEffect(() => () => { live.current = false; stopSpeaking(); cleanup.current() }, [])
  return { state, captions, level, error, start, end }
}
