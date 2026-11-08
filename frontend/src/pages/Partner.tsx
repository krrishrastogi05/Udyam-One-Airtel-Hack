import { AnimatePresence, motion } from 'framer-motion'
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Btn, LightLogo } from '../components/light'
import { Icon, Md } from '../components/ui'
import { api, partnerToken, Trace, useJourney, usePartnerFeed } from '../lib/api'
import { cx, inr } from '../lib/util'

const UP = '#D70000' // raises activation
const DOWN = '#3E6FD8' // lowers activation
const LANG: Record<string, string> = { en: 'English', hi: 'Hindi', hinglish: 'Hinglish', mr: 'Marathi', ta: 'Tamil' }
const ago = (ts: number) => { const s = Math.max(1, Math.round(Date.now() / 1000 - ts)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h` }

type Tab = 'leads' | 'agents' | 'impact'

export default function PartnerPage() {
  const [token, setToken] = useState(partnerToken.get())
  const [name, setName] = useState(() => { try { return localStorage.getItem('udyam.partner.name') || 'Rohit Verma' } catch { return 'Rohit Verma' } })
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('tab') as Tab) || 'leads'
  useEffect(() => { const out = () => setToken(null); window.addEventListener('partner-logout', out); return () => window.removeEventListener('partner-logout', out) }, [])
  if (!token) return <Login onIn={(t, n) => { partnerToken.set(t); try { localStorage.setItem('udyam.partner.name', n) } catch { /* */ } setName(n); setToken(t) }} />
  return (
    <div className="min-h-screen bg-white text-smoke">
      <header className="sticky top-0 z-30 border-b border-rule bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[1400px] items-center gap-6 px-5 text-[13px]">
          <LightLogo />
          <nav className="flex gap-1">
            {([['leads', 'Leads'], ['agents', 'Agents'], ['impact', 'Impact']] as [Tab, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setSp({ tab: k })} className={cx('rounded-md px-2.5 py-1', tab === k ? 'bg-mist font-medium text-snow' : 'text-fog hover:text-snow')}>{l}</button>
            ))}
          </nav>
          <span className="ml-auto hidden items-center gap-2 text-fog sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{name}, Shree Telecom</span>
          <button onClick={() => { partnerToken.set(null); setToken(null) }} className="text-fog hover:text-snow">Sign out</button>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-5 py-6">
        {tab === 'leads' && <Leads />}
        {tab === 'agents' && <Agents />}
        {tab === 'impact' && <Impact />}
      </main>
    </div>
  )
}

function Login({ onIn }: { onIn: (t: string, name: string) => void }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('Rohit Verma')
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="grid min-h-screen place-items-center bg-mist px-5">
      <form onSubmit={async (e) => { e.preventDefault(); setErr(null); try { const r = await api.login(code, name); onIn(r.token, r.name) } catch (x: any) { setErr(x.message) } }}
        className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-[0_20px_60px_-30px_rgba(0,0,0,.3)]">
        <LightLogo />
        <h1 className="mt-8 text-[28px] font-bold tracking-[-0.03em]">Partner console</h1>
        <p className="mt-1 text-[14px] text-graphite">For Accel channel partners and field sales.</p>
        <label className="mt-6 block text-[13px] font-medium" htmlFor="pn">Your name</label>
        <input id="pn" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-hair px-3 outline-none focus:border-smoke" />
        <label className="mt-4 block text-[13px] font-medium" htmlFor="pc">Partner code</label>
        <input id="pc" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoFocus className="mt-1 h-11 w-full rounded-xl border border-hair px-3 outline-none focus:border-smoke" />
        {err && <p className="mt-2 text-[13px] text-red-700">{err}</p>}
        <Btn className="mt-6 w-full">Sign in</Btn>
        <p className="mt-4 text-[12px] text-graphite">Demo code is in the README. Sessions are signed and expire after 8 hours; every sign-in is written to the audit log.</p>
      </form>
    </div>
  )
}

function Stat({ k, v, sub, alarm }: { k: string; v: ReactNode; sub?: string; alarm?: boolean }) {
  return (
    <div className="border-b border-r border-rule px-5 py-4 last:border-r-0 md:border-b-0">
      <div className="text-[12px] text-fog">{k}</div>
      <div className={cx('mt-1 text-[26px] font-semibold tabular-nums tracking-tight', alarm && 'text-alarm')}>{v}</div>
      {sub && <div className="text-[12px] text-fog">{sub}</div>}
    </div>
  )
}

const Panel = ({ title, right, children, className }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={cx('rounded-lg border border-rule', className)}>
    <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5 text-[13px]"><span className="font-medium">{title}</span>{right && <span className="text-fog">{right}</span>}</div>
    {children}
  </section>
)

// ------------------------------------------------------------------ leads
function Leads() {
  const [q, setQ] = useState<any>(null)
  const [reason, setReason] = useState('All')
  const [chat, setChat] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(() => { api.partner().then(setQ).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  usePartnerFeed(load)
  const reasons = useMemo(() => ['All', ...Array.from(new Set((q?.winback || []).map((w: any) => w.drop_reason))) as string[]], [q])
  const win = (q?.winback || []).filter((w: any) => reason === 'All' || w.drop_reason === reason)
  const hand = q?.handoffs || []
  const fresh = hand.filter((h: any) => h.status === 'new').length

  return (
    <>
      <h1 className="text-[28px] font-semibold tracking-tight">{fresh ? `${fresh} ${fresh === 1 ? 'business needs' : 'businesses need'} you` : 'Nobody is waiting right now'}</h1>
      <p className="mt-1 text-[14px] text-fog">The advisor handles the easy part. When a business needs a person, you get the whole context, and the commission stays yours.</p>
      <div className="mt-5 grid grid-cols-2 rounded-lg border border-rule md:grid-cols-4">
        <Stat k="Hand-offs" v={hand.length} sub="from WhatsApp and web" alarm={fresh > 0} />
        <Stat k="Win-back leads" v={q?.winback?.length ?? '–'} sub="dropped for fixable reasons" />
        <Stat k="Score accuracy" v={q ? `AUC ${q.auc}` : '–'} sub="on held-out leads" />
        <Stat k="Call the top 20%" v={q ? `${Math.round(q.capture * 100)}%` : '–'} sub={`of activations, ${q?.lift ?? '–'}× random`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Panel title="Needs you now" right={<span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />Live</span>}>
            {!hand.length && <div className="px-4 py-8 text-center text-[14px] text-fog">When an owner asks for a person, or KYC needs help, they appear here instantly.</div>}
            <AnimatePresence initial={false}>
              {hand.map((h: any) => (
                <motion.div key={h.id} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="border-b border-rule px-4 py-3.5 last:border-b-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-[15px] font-semibold">{h.business}</span>
                    <span className={cx('text-[13px] font-medium tabular-nums', h.band === 'hot' ? 'text-alarm' : 'text-fog')}>{Math.round(h.score * 100)}% likely</span>
                    <span className="text-[12px] text-fog">{ago(h.created_at)} ago, speaks {LANG[h.lang] || h.lang}</span>
                    {h.status === 'accepted' && <span className="text-[12px] font-medium text-emerald-600">{h.partner ? `With ${h.partner}` : 'Accepted'}</span>}
                  </div>
                  <div className="mt-1 text-[13px] font-medium text-alarm">{h.reason}</div>
                  <p className="mt-1 text-[13px] text-fog">{h.summary}</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {h.status === 'new' && <button disabled={busy === h.id} onClick={async () => { setBusy(h.id); await api.accept(h.id).catch(() => {}); setBusy(null); load() }} className="h-8 rounded-md bg-red-600 px-3 text-[13px] font-medium text-white hover:bg-red-700">Accept and schedule a call</button>}
                    <button onClick={async () => { await api.takeover(h.id).catch(() => {}); setChat(h.journey); load() }} className="h-8 rounded-md border border-rule px-3 text-[13px] font-medium hover:bg-mist">Take over chat</button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </Panel>

          <Panel title="Win-back list" right={
            <span className="flex flex-wrap gap-1">{reasons.slice(0, 6).map((r) => (
              <button key={r} onClick={() => setReason(r)} className={cx('rounded px-2 py-0.5 text-[12px]', reason === r ? 'bg-smoke text-white' : 'text-fog hover:bg-mist')}>{r === 'All' ? 'All' : r.split(' ').slice(0, 3).join(' ')}</button>
            ))}</span>}>
            <table className="w-full text-left text-[13px]">
              <thead className="text-fog"><tr className="border-b border-rule">{['Score', 'Business', 'Dropped because', 'Do this'].map((h) => <th key={h} className="px-4 py-2 font-normal">{h}</th>)}</tr></thead>
              <tbody>
                {win.slice(0, 12).map((w: any) => (
                  <tr key={w.lead_id} className="border-b border-rule last:border-b-0">
                    <td className="px-4 py-2.5 font-semibold tabular-nums">{Math.round(w.score * 100)}%</td>
                    <td className="px-4 py-2.5"><div className="font-medium">{w.business}</div><div className="text-[12px] text-fog">{w.type}, {w.city}, {w.language}</div></td>
                    <td className="px-4 py-2.5 text-fog">{w.drop_reason}</td>
                    <td className="px-4 py-2.5">{w.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
        <aside className="space-y-6 lg:sticky lg:top-16 lg:self-start">{q && <Drivers rows={q.drivers} />}</aside>
      </div>
      <MarketPulse />
      <AnimatePresence>{chat && <TakeoverChat jid={chat} onClose={() => setChat(null)} />}</AnimatePresence>
    </>
  )
}

function Drivers({ rows }: { rows: { label: string; weight: number }[] }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.weight)))
  return (
    <Panel title="What makes a lead convert" right="model weights, 5,000 leads">
      <div className="px-4 pb-4 pt-3">
        <div className="flex gap-4 text-[12px] text-fog">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: UP }} />Raises the chance</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: DOWN }} />Lowers it</span>
        </div>
        <div className="mt-3 space-y-[7px]">
          {rows.map((r, i) => {
            const pos = r.weight > 0
            return (
              <div key={r.label} title={`${r.label}: weight ${r.weight.toFixed(2)}`}>
                <div className="mb-0.5 flex justify-between text-[12px]"><span>{r.label}</span><span className="tabular-nums text-fog">{pos ? '+' : '−'}{Math.abs(r.weight).toFixed(2)}</span></div>
                <div className="relative h-2.5">
                  <div className="absolute inset-y-[-2px] left-1/2 w-px bg-rule" />
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(Math.abs(r.weight) / max) * 50}%` }} transition={{ duration: 0.7, delay: i * 0.04 }}
                    className={cx('absolute top-0 h-2.5', pos ? 'left-1/2 rounded-r-[3px]' : 'right-1/2 rounded-l-[3px]')} style={{ background: pos ? UP : DOWN }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Panel>
  )
}

const MONTHS = [{ k: 'all', l: 'Quarter' }, { k: '2026-04', l: 'Apr' }, { k: '2026-05', l: 'May' }, { k: '2026-06', l: 'Jun' }]
const SEGS = [{ k: 'all', l: 'All' }, { k: 'micro', l: 'Micro retail' }, { k: 'prof', l: 'Professional' }, { k: 'multi', l: 'Multi-site' }, { k: 'mfg', l: 'Manufacturers' }]

function Seg({ items, value, onChange }: { items: { k: string; l: string }[]; value: string; onChange: (v: string) => void }) {
  return <span className="inline-flex rounded-md bg-mist p-0.5">{items.map((it) => (
    <button key={it.k} onClick={() => onChange(it.k)} className={cx('rounded px-2 py-0.5 text-[12px]', value === it.k ? 'bg-white text-snow shadow-sm' : 'text-fog hover:text-snow')}>{it.l}</button>
  ))}</span>
}

function MarketPulse() {
  const [seg, setSeg] = useState('all')
  const [month, setMonth] = useState('all')
  const [d, setD] = useState<any>(null)
  useEffect(() => { api.cohort(seg, month).then(setD).catch(() => {}) }, [seg, month])
  if (!d) return <div className="mt-6 h-72 animate-pulse rounded-lg bg-mist" />
  const max = d.funnel[0]?.count || 1
  const maxReason = Math.max(...d.reasons.map((r: any) => r.count), 1)
  return (
    <Panel className="mt-6" title="Market pulse: where businesses fall off today" right={<span className="flex flex-wrap gap-2"><Seg items={SEGS} value={seg} onChange={setSeg} /><Seg items={MONTHS} value={month} onChange={setMonth} /></span>}>
      <div className="grid grid-cols-2 border-b border-rule sm:grid-cols-3 lg:grid-cols-6">
        <Stat k="Leads" v={d.leads.toLocaleString('en-IN')} />
        <Stat k="Activated" v={`${(d.rate * 100).toFixed(1)}%`} sub={`${d.activated} businesses`} />
        <Stat k="Lead to live" v={d.days ? `${d.days} days` : '–'} />
        <Stat k="Status chases" v={d.calls ?? '–'} sub="per customer" />
        <Stat k="Cost to acquire" v={d.cac ? inr(d.cac) : '–'} sub="per activation" />
        <Stat k="6-month churn" v={d.churn !== null ? `${Math.round(d.churn * 100)}%` : '–'} />
      </div>
      <div className="grid gap-8 p-5 lg:grid-cols-2">
        <div className="space-y-2.5">
          {d.funnel.map((r: any, i: number) => {
            const prev = i ? d.funnel[i - 1].count : null
            const steep = d.drop && r.stage === d.drop.to
            return (
              <div key={r.stage}>
                <div className="mb-1 flex justify-between text-[12px]"><span className={cx(steep && 'font-semibold')}>{r.stage}</span>
                  <span className="tabular-nums text-fog">{r.count.toLocaleString('en-IN')}{prev ? <span className={cx('ml-1.5', steep && 'font-semibold text-alarm')}>{Math.round((r.count / prev) * 100)}% carry on</span> : null}</span></div>
                <div className="h-3 bg-mist"><motion.div initial={{ width: 0 }} animate={{ width: `${(r.count / max) * 100}%` }} transition={{ duration: 0.6 }} className={cx('h-full', steep ? 'bg-red-600' : 'bg-smoke/80')} /></div>
              </div>
            )
          })}
        </div>
        <div className="space-y-2">
          <div className="text-[12px] font-medium">Top reasons they dropped</div>
          {d.reasons.map((r: any) => (
            <div key={r.reason}>
              <div className="mb-0.5 flex justify-between text-[12px]"><span>{r.reason}</span><span className="tabular-nums text-fog">{r.count}</span></div>
              <div className="h-2 bg-mist"><motion.div initial={{ width: 0 }} animate={{ width: `${(r.count / maxReason) * 100}%` }} className="h-full bg-smoke/70" /></div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}

function TakeoverChat({ jid, onClose }: { jid: string; onClose: () => void }) {
  const { j } = useJourney(jid)
  const [t, setT] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const msgs = (j?.messages || []).filter((m) => m.text && ['text', 'partner', 'notify', 'doc_result', 'action'].includes(m.kind))
  useEffect(() => { box.current?.scrollTo({ top: 1e6 }) }, [msgs.length])
  return (
    <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }} className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-rule px-5 py-3.5">
          <div><div className="font-semibold">{j?.profile.business_name || j?.profile.business_type || 'Conversation'}</div><div className="text-[12px] text-fog">You’re in the chat. The advisor is paused. Speaks {LANG[j?.lang || 'en']}.</div></div>
          <button aria-label="Close" onClick={onClose} className="rounded-full p-1.5 hover:bg-mist"><Icon name="X" className="h-5 w-5" /></button>
        </div>
        <div ref={box} className="flex-1 space-y-2.5 overflow-y-auto bg-mist p-4 text-[14px]">
          {msgs.map((m) => (
            <div key={m.id} className={cx('max-w-[85%] rounded-2xl px-3.5 py-2', m.role === 'user' ? 'bg-white' : m.kind === 'partner' ? 'ml-auto bg-red-600 text-white' : 'ml-auto bg-smoke/90 text-white')}>
              {m.role === 'bot' && <div className="mb-0.5 text-[11px] opacity-70">{m.kind === 'partner' ? m.payload?.name : 'Advisor'}</div>}<Md text={m.text} />
            </div>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (t.trim()) { api.partnerSay(jid, t.trim()); setT('') } }} className="flex gap-2 border-t border-rule p-4">
          <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Reply to the owner" aria-label="Reply" className="h-11 min-w-0 flex-1 rounded-full border border-rule px-4 outline-none focus:border-smoke" />
          <button aria-label="Send" className="grid h-11 w-11 place-items-center rounded-full bg-red-600 text-white"><Icon name="ArrowUp" className="h-5 w-5" /></button>
        </form>
      </motion.aside>
    </motion.div>
  )
}

// ------------------------------------------------------------------ agents
function Agents() {
  const [a, setA] = useState<any>(null)
  const [chat, setChat] = useState<string | null>(null)
  const [ran, setRan] = useState<any>(null)
  const load = useCallback(() => { api.agents().then(setA).catch(() => {}) }, [])
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t) }, [load])
  usePartnerFeed(load)
  if (!a) return <div className="h-72 animate-pulse rounded-lg bg-mist" />
  const esc = a.escalations.filter((h: any) => h.status === 'new')
  return (
    <>
      <div className="grid grid-cols-2 rounded-lg border border-rule md:grid-cols-4">
        <Stat k="Conversations, last 30 min" v={a.conversations} sub={`Udyam AI ${a.ai ? 'online' : 'offline, rules engine'}, voice ${a.voice ? 'Sarvam' : 'browser'}`} />
        <Stat k="Need a person" v={esc.length} alarm={esc.length > 0} sub={esc[0] ? `oldest waiting ${ago(esc[esc.length - 1].created_at)}` : 'nobody waiting'} />
        <Stat k="Notifications sent" v={a.sent_today} sub={a.quiet_hours ? 'quiet hours on for marketing' : 'outside quiet hours'} />
        <Stat k="Audit log" v={<span className={cx('flex items-center gap-2 text-[20px]', !a.audit.intact && 'text-alarm')}><Icon name={a.audit.intact ? 'ShieldCheck' : 'ShieldAlert'} className={cx('h-5 w-5', a.audit.intact ? 'text-emerald-600' : 'text-alarm')} />{a.audit.intact ? 'Intact' : `Broken at #${a.audit.broken_at}`}</span>}
          sub={`${a.audit.entries} entries, hash chain re-checked just now`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <Panel title="What the agents are doing" right={<span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />Live</span>}>
          <ul className="max-h-[520px] divide-y divide-rule overflow-y-auto text-[13px]">
            {a.feed.map((f: Trace) => (
              <li key={f.id} className="grid grid-cols-[64px_80px_1fr] items-baseline gap-3 px-4 py-2 sm:grid-cols-[64px_80px_150px_1fr_60px]">
                <span className="tabular-nums text-fog">{f.t}</span>
                <span className="font-medium">{f.agent}</span>
                <span className="hidden truncate text-fog sm:block">{f.act.replace(/_/g, ' ')}</span>
                <span className={cx('min-w-0', f.level === 'alarm' ? 'text-alarm' : f.level === 'warn' ? 'text-amber-700' : '')}>{f.res}{f.who && <span className="text-fog">, {f.who}</span>}</span>
                <span className="hidden text-right tabular-nums text-fog sm:block">{f.ms ? `${f.ms} ms` : ''}</span>
              </li>
            ))}
            {!a.feed.length && <li className="px-4 py-8 text-center text-fog">No activity yet. Start a journey or a stage scenario.</li>}
          </ul>
        </Panel>
        <div className="space-y-6">
          <Panel title="Waiting for you">
            {!esc.length && <div className="px-4 py-6 text-center text-[13px] text-fog">Nobody is waiting.</div>}
            {esc.map((e: any) => (
              <div key={e.id} className="border-b border-rule px-4 py-3 last:border-b-0">
                <div className="flex items-baseline justify-between text-[14px]"><span className="font-medium">{e.business}</span><span className="text-[12px] text-fog">{ago(e.created_at)}</span></div>
                <div className="mt-0.5 text-[13px] text-fog">{e.reason}. Speaks {LANG[e.lang] || e.lang}.</div>
                <button onClick={async () => { await api.takeover(e.id).catch(() => {}); setChat(e.journey); load() }} className="mt-2.5 h-8 rounded-md bg-red-600 px-3 text-[13px] font-medium text-white hover:bg-red-700">Take over chat</button>
              </div>
            ))}
          </Panel>
          <Panel title="Agents">
            {a.agents.map((g: any) => (
              <div key={g.name} className="flex items-center justify-between border-b border-rule px-4 py-2.5 text-[13px] last:border-b-0"><span>{g.name}<span className="ml-2 text-fog">{g.note}</span></span><span className="tabular-nums">{g.running}</span></div>
            ))}
            <div className="border-t border-rule px-4 py-3">
              <button onClick={async () => setRan(await api.winback())} className="h-8 rounded-md border border-rule px-3 text-[13px] font-medium hover:bg-mist">Run the win-back agent</button>
              {ran && <div className="mt-2 text-[12px] text-fog">Queued {ran.queued} nudges{ran.quiet_hours ? ', held until 10:00 (quiet hours)' : ''}.</div>}
            </div>
          </Panel>
          <Panel title="Audit log, latest">
            {a.audit.last.map((e: any) => (
              <div key={e.seq} className="border-b border-rule px-4 py-2 text-[12px] last:border-b-0">
                <div className="flex justify-between"><span className="font-medium">{e.action.replace(/_/g, ' ')}</span><span className="tabular-nums text-fog">#{e.seq}</span></div>
                <div className="truncate text-fog">{e.actor}{e.journey ? `, ${e.journey}` : ''}: {e.detail}</div>
                <div className="truncate font-mono text-[11px] text-fog/70">{e.hash.slice(0, 24)}…</div>
              </div>
            ))}
          </Panel>
        </div>
      </div>

      <Panel className="mt-6" title="Notification outbox" right="Offers wait until 10:00 during quiet hours; payments and orders always go">
        <table className="w-full text-left text-[13px]">
          <thead className="text-fog"><tr className="border-b border-rule">{['Business', 'Channel', 'Message', 'Language', 'Status'].map((h) => <th key={h} className="px-4 py-2 font-normal">{h}</th>)}</tr></thead>
          <tbody>
            {a.outbox.slice(0, 15).map((o: any) => (
              <tr key={o.id} className="border-b border-rule last:border-b-0">
                <td className="px-4 py-2.5">{o.to}</td><td className="px-4 py-2.5 text-fog">{o.channel}</td><td className="px-4 py-2.5">{o.title}</td><td className="px-4 py-2.5 text-fog">{LANG[o.lang] || o.lang}</td>
                <td className={cx('px-4 py-2.5', o.status.startsWith('Quiet') ? 'text-fog' : 'text-emerald-600')}>{o.status}</td>
              </tr>
            ))}
            {!a.outbox.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-fog">Nothing sent yet.</td></tr>}
          </tbody>
        </table>
      </Panel>
      <AnimatePresence>{chat && <TakeoverChat jid={chat} onClose={() => setChat(null)} />}</AnimatePresence>
    </>
  )
}

// ------------------------------------------------------------------ impact
// Real counts from smb_leads.csv (Apr–Jun 2026). Each lever recovers a share of leads lost for specific reasons.
const FUNNEL = [{ stage: 'Lead', n: 5000 }, { stage: 'Contacted', n: 3406 }, { stage: 'Needs assessed', n: 1974 }, { stage: 'Quote accepted', n: 861 }, { stage: 'KYC complete', n: 588 }, { stage: 'Live', n: 368 }]
const SPEND = 368 * 15053
const LEVERS = [
  { id: 'voice', name: 'Voice agent instead of a visit', reasons: 'Unreachable 805, no time for a visit 531, visit not scheduled 296', lost: [[0, 805], [1, 827]], pct: 20 },
  { id: 'savings', name: 'Savings shown against their bill', reasons: 'Price too high 414, competitor cheaper 207', lost: [[2, 621]], pct: 15 },
  { id: 'explain', name: 'Explainable, instant quote', reasons: 'Too complex 206, took too long 179', lost: [[2, 385]], pct: 25 },
  { id: 'kyc', name: 'DigiLocker, e-sign and photo KYC', reasons: 'Missing docs 94, paperwork 79, signatory 53, mismatch 47', lost: [[3, 273]], pct: 40 },
  { id: 'fulfil', name: 'Feasibility check and fulfilment agent', reasons: 'Install delayed 98, cancelled 53, not feasible 41, payment failed 28', lost: [[4, 220]], pct: 30 },
]

function simulate(on: Record<string, boolean>, pct: Record<string, number>) {
  const rec = [0, 0, 0, 0, 0]
  LEVERS.forEach((l) => { if (on[l.id]) l.lost.forEach(([i, n]) => { rec[i] += n * (pct[l.id] / 100) }) })
  const out = [FUNNEL[0].n]
  for (let i = 0; i < 5; i++) out.push(out[i] * ((FUNNEL[i + 1].n + rec[i]) / FUNNEL[i].n))
  return out
}

function Impact() {
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(LEVERS.map((l) => [l.id, true])))
  const [pct, setPct] = useState<Record<string, number>>(Object.fromEntries(LEVERS.map((l) => [l.id, l.pct])))
  const [m, setM] = useState<any>(null)
  useEffect(() => { api.metrics().then(setM).catch(() => {}) }, [])
  const sim = useMemo(() => simulate(on, pct), [on, pct])
  const live = sim[5], base = FUNNEL[5].n
  const fmt = (u: string, v: number | null) => v === null || v === undefined ? '–' : u === 'pct' ? `${(v * 100).toFixed(1)}%` : u === 'inr' ? inr(v) : u === 'days' ? `${v} days` : String(v)
  return (
    <>
      <h1 className="text-[28px] font-semibold tracking-tight">What if Accel ran last quarter with Udyam One?</h1>
      <p className="mt-1 max-w-3xl text-[14px] text-fog">5,000 real leads from April to June 2026. Each switch recovers part of the leads lost for a specific reason in that data. The baseline is exact; the recovery percentages are assumptions you can change.</p>
      <div className="mt-5 grid grid-cols-2 rounded-lg border border-rule md:grid-cols-4">
        <Stat k="Businesses live" v={Math.round(live).toLocaleString('en-IN')} sub={`was ${base}`} />
        <Stat k="Lead to live" v={`${(live / 50).toFixed(1)}%`} sub="was 7.4%" />
        <Stat k="Cost per live business" v={inr(SPEND / live)} sub="same spend, was ₹15,053" />
        <Stat k="Extra businesses a quarter" v={`+${Math.round(live - base)}`} sub="from the same leads" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        <Panel title="Funnel" right={<span className="flex gap-4"><span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-red-600" />With Udyam One</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm border border-dashed border-smoke/60" />Last quarter</span></span>}>
          <div className="space-y-4 p-5">
            {FUNNEL.map((f, i) => (
              <div key={f.stage} className="grid grid-cols-[120px_1fr_110px] items-center gap-4 text-[13px]">
                <span className="text-fog">{f.stage}</span>
                <div className="relative h-7">
                  <motion.div className="absolute inset-y-0 left-0 rounded-sm bg-red-600" initial={false} animate={{ width: `${(sim[i] / 5000) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
                  <div className="absolute inset-y-0 left-0 rounded-sm border border-dashed border-smoke/60" style={{ width: `${(f.n / 5000) * 100}%` }} />
                </div>
                <span className="text-right tabular-nums">{Math.round(sim[i]).toLocaleString('en-IN')} <span className="text-fog">/ {f.n.toLocaleString('en-IN')}</span></span>
              </div>
            ))}
          </div>
        </Panel>
        <section className="divide-y divide-rule rounded-lg border border-rule">
          {LEVERS.map((l) => (
            <div key={l.id} className="px-4 py-3.5">
              <label className="flex cursor-pointer items-center justify-between gap-3 text-[14px] font-medium">{l.name}
                <input type="checkbox" checked={on[l.id]} onChange={(e) => setOn({ ...on, [l.id]: e.target.checked })} className="h-4 w-4 accent-red-600" /></label>
              <div className="mt-0.5 text-[12px] text-fog">{l.reasons}</div>
              <div className={cx('mt-2 flex items-center gap-3 text-[12px]', !on[l.id] && 'opacity-40')}>
                <input type="range" min={0} max={80} step={5} value={pct[l.id]} disabled={!on[l.id]} onChange={(e) => setPct({ ...pct, [l.id]: +e.target.value })} className="flex-1 accent-red-600" aria-label={`${l.name}: share recovered`} />
                <span className="w-24 text-right tabular-nums text-fog">recover {pct[l.id]}%</span>
              </div>
            </div>
          ))}
        </section>
      </div>
      <Panel className="mt-6" title="The five metrics we commit to" right="baseline from smb_leads.csv, targets for year one">
        <table className="w-full text-left text-[13px]">
          <thead className="text-fog"><tr className="border-b border-rule">{['Metric', 'Last quarter', 'Target', 'How Udyam One moves it'].map((h) => <th key={h} className="px-4 py-2 font-normal">{h}</th>)}</tr></thead>
          <tbody>
            {(m?.metrics || []).map((x: any) => (
              <tr key={x.key} className="border-b border-rule last:border-b-0">
                <td className="px-4 py-2.5 font-medium">{x.name}</td><td className="px-4 py-2.5 tabular-nums">{fmt(x.unit, x.baseline)}</td>
                <td className="px-4 py-2.5 font-semibold tabular-nums text-alarm">{fmt(x.unit, x.target)}</td><td className="px-4 py-2.5 text-fog">{x.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <p className="mt-4 text-[12px] text-fog">Open the <Link to="/stage" className="underline">demo stage</Link> to see the agents behind these levers at work.</p>
    </>
  )
}
