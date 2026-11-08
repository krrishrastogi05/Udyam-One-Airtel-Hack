import { useCallback, useEffect, useRef, useState } from 'react'

export type Lang = 'en' | 'hi' | 'hinglish' | 'mr' | 'ta'
export type Stage = 'discover' | 'bundle' | 'verify' | 'pay' | 'track'
export type Channel = 'web' | 'wa'

export interface Msg {
  id: string
  role: 'bot' | 'user'
  ts: number
  channel?: Channel | null
  kind: 'text' | 'bundle' | 'consent' | 'doc_request' | 'doc_result' | 'kyc_summary' | 'payment' | 'order' | 'order_update' | 'partner' | 'action' | 'doc' | 'notify'
  text?: string
  chips?: string[]
  multi?: boolean
  slot?: string
  voice?: boolean
  payload?: any
}

export interface Line {
  id: string; name: string; category: string; unit: string; qty: number; unit_price: number; monthly: number
  setup: number; term: number; on: boolean; core: boolean; need?: string; why?: string
  issues: { code: string; msg: string }[]; install_days: number; flex_price: number; assumed?: string | null
}

export interface Quote {
  lines: Line[]; monthly: number; gst: number; monthly_with_gst: number; setup: number; term: number; eta_days: number
  issues: { id: string; name: string; code: string; msg: string }[]; valid: boolean; saving_vs_flex: number
  addons?: { id: string; name: string; need: string; label: string; why: string; qty: number; unit_price: number; locked: string | null }[]
}

export interface Check { key: string; title: string; status: 'pass' | 'warn' | 'fail'; detail: string; doc?: string }

export interface Journey {
  id: string; created_at: number; updated_at: number; origin: Channel; lang: Lang; stage: Stage
  profile: Record<string, any>; messages: Msg[]; pending_slot: string | null
  reco: { segment: string; segment_label: string; needs: string[]; best: string; locked: { id: string; name: string; reason: string; code: string }[]
    plans: { key: string; title: string; tag: string; quote: Quote; items: any[] }[] } | null
  cart: { plan: string; items: any[]; term: number } | null
  quote: Quote | null
  kyc: { consent: boolean; docs: Record<string, any>; result: { status: 'verified' | 'action_needed' | 'blocked'; checks: Check[]; summary: any; registry: any } | null
    esign: { name: string; status: 'sent' | 'signed'; link: string } | null }
  order: { id: string; eta_date: string; eta_days: number; status: string; events: { key: string; title: string; detail: string; day: number; planned: string; done_at: number | null }[] } | null
  handoff: any
  ai: 'online' | 'offline'
  score: number
  trace: Trace[]
  call: { state: 'ringing' | 'live' | 'ended'; reason: string; at: number } | null
  agent_paused: string | null
  payment_failed: boolean
}

export interface Trace { id: string; ts: number; t: string; agent: string; act: string; res: string; who: string; jid: string | null; ms: number | null; level: 'ok' | 'warn' | 'alarm' }

export const partnerToken = {
  get: () => { try { return localStorage.getItem('udyam.partner') } catch { return null } },
  set: (t: string | null) => { try { t ? localStorage.setItem('udyam.partner', t) : localStorage.removeItem('udyam.partner') } catch { /* private mode */ } },
}

async function req<T = Journey>(url: string, opts: RequestInit = {}): Promise<T> {
  const auth: Record<string, string> = url.startsWith('/api/partner/') && partnerToken.get() ? { Authorization: `Bearer ${partnerToken.get()}` } : {}
  const r = await fetch(url, {
    ...opts,
    headers: opts.body instanceof FormData ? auth : { 'Content-Type': 'application/json', ...auth, ...(opts.headers || {}) },
  })
  if (r.status === 401 && url.startsWith('/api/partner/')) { partnerToken.set(null); window.dispatchEvent(new Event('partner-logout')) }
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Something went wrong')
  return data as T
}

const post = <T = Journey>(url: string, body?: any) => req<T>(url, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) })

export const api = {
  start: (channel: Channel, lang: Lang = 'en') => post('/api/journeys', { channel, lang }),
  get: (id: string) => req(`/api/journeys/${id}`),
  send: (id: string, text: string, channel: Channel, voice = false) => post(`/api/journeys/${id}/message`, { text, channel, voice }),
  profile: (id: string, patch: Record<string, any>) => post(`/api/journeys/${id}/profile`, { patch }),
  plan: (id: string, plan: string) => post(`/api/journeys/${id}/plan`, { plan }),
  cart: (id: string, items: any[], term: number) => post(`/api/journeys/${id}/cart`, { items, term }),
  confirm: (id: string, plan: string, channel: Channel) => post(`/api/journeys/${id}/confirm`, { plan, channel }),
  consent: (id: string, channel: Channel) => post(`/api/journeys/${id}/kyc/consent`, { accepted: true, channel }),
  specimen: (id: string, applicant: string, doc: string, channel: Channel) => post(`/api/journeys/${id}/kyc/specimen`, { applicant, doc, channel }),
  upload: (id: string, doc: string, file: File, channel: Channel) => {
    const f = new FormData(); f.append('doc', doc); f.append('channel', channel); f.append('file', file)
    return post(`/api/journeys/${id}/kyc/upload`, f)
  },
  pay: (id: string, method: string, autopay: boolean, channel: Channel, simulate_failure = false) => post(`/api/journeys/${id}/pay`, { method, autopay, channel, simulate_failure }),
  lang: (id: string, lang: Lang) => post(`/api/journeys/${id}/lang`, { lang }),
  aiView: (id: string) => req<{ raw: string; sent: string; ai: string }>(`/api/journeys/${id}/ai-view`),
  digilocker: (id: string) => post(`/api/journeys/${id}/kyc/digilocker`),
  esign: (id: string, name: string) => post<Journey & { sign_link: string }>(`/api/journeys/${id}/esign/request`, { name }),
  esignView: (tok: string) => req<any>(`/api/esign/${tok}`),
  esignDone: (tok: string, otp: string) => post<any>(`/api/esign/${tok}/complete`, { otp }),
  bill: (id: string, file: File) => { const f = new FormData(); f.append('file', file); return post<Journey & { bill: any }>(`/api/journeys/${id}/bill`, f) },
  billSample: (id: string) => post<Journey & { bill: any }>(`/api/journeys/${id}/bill/sample`),
  evidence: (id: string, doc: string, check: string) => req<{ w: number; h: number; boxes: number[][] }>(`/api/journeys/${id}/kyc/${doc}/evidence?check=${check}`),
  call: (id: string, action: 'request' | 'answer' | 'end') => post(`/api/journeys/${id}/call`, { action }),
  voice: (id: string, audio: Blob, channel: Channel, mode: 'note' | 'call') => {
    const f = new FormData(); f.append('file', audio, 'voice.webm'); f.append('channel', channel); f.append('mode', mode)
    return post<{ heard: string; reply: string; lang: Lang; journey: Journey }>(`/api/journeys/${id}/voice`, f)
  },
  voiceStatus: () => req<{ engine: 'sarvam' | 'browser' }>('/api/voice/status'),
  login: (code: string, name: string) => post<{ token: string; name: string; shop: string }>('/api/partner/login', { code, name }),
  agents: () => req<any>('/api/partner/agents'),
  winback: () => post<any>('/api/partner/winback/run'),
  takeover: (hid: string) => post<any>(`/api/partner/handoffs/${hid}/takeover`),
  partnerSay: (jid: string, text: string) => post(`/api/partner/journeys/${jid}/message`, { text }),
  partnerJourney: (jid: string) => req<any>(`/api/partner/journeys/${jid}`),
  metrics: () => req<any>('/api/partner/metrics'),
  advance: (id: string) => post(`/api/journeys/${id}/order/advance`),
  handoff: (id: string, reason: string, channel: Channel) => post(`/api/journeys/${id}/handoff`, { reason, channel }),
  reset: (id: string) => post(`/api/journeys/${id}/reset`),
  deleteData: (id: string, channel: Channel) => post(`/api/journeys/${id}/delete-data`, { reason: 'erasure', channel }),
  cohort: (segment: string, month: string) => req<any>(`/api/partner/cohort?segment=${segment}&month=${month}`),
  specimens: () => req<{ id: string; docs: string[]; name: string }[]>('/api/kyc/specimens'),
  meta: () => req<any>('/api/meta'),
  personas: () => req<any[]>('/api/personas'),
  health: () => req<any>('/api/health'),
  partner: () => req<any>('/api/partner/queue'),
  insights: () => req<any>('/api/partner/insights'),
  accept: (hid: string) => post<any>(`/api/partner/handoffs/${hid}/accept`, {}),
}

/** Live journey: initial fetch + server-sent events, so the web app and the WhatsApp phone stay in lock-step. */
export function useJourney(id: string | undefined) {
  const [j, setJ] = useState<Journey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const last = useRef(0)

  const accept = useCallback((next: Journey) => {
    if (next.updated_at >= last.current) {
      last.current = next.updated_at
      setJ(next)
    }
  }, [])

  useEffect(() => {
    if (!id) return
    let es: EventSource | null = null
    let alive = true
    api.get(id).then(accept).catch((e) => setError(e.message))
    const connect = () => {
      es = new EventSource(`/api/journeys/${id}/events`)
      es.onmessage = (ev) => { try { accept(JSON.parse(ev.data)) } catch { /* ignore */ } }
      es.onerror = () => { es?.close(); if (alive) setTimeout(connect, 1500) }
    }
    connect()
    return () => { alive = false; es?.close() }
  }, [id, accept])

  const run = useCallback(async (fn: () => Promise<Journey>) => {
    setBusy(true)
    try { accept(await fn()) } catch (e: any) { setError(e.message); setTimeout(() => setError(null), 4000) } finally { setBusy(false) }
  }, [accept])

  return { j, setJ: accept, error, busy, run }
}

export function usePartnerFeed(onPing: () => void) {
  useEffect(() => {
    const t = partnerToken.get()
    if (!t) return
    const es = new EventSource(`/api/partner/events?t=${encodeURIComponent(t)}`)
    es.onmessage = () => onPing()
    return () => es.close()
  }, [onPing])
}

export function useSpecimens() {
  const [list, setList] = useState<{ id: string; docs: string[]; name: string }[]>([])
  useEffect(() => { api.specimens().then(setList).catch(() => {}) }, [])
  return list
}
