import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Btn, LightLogo, rupee } from '../components/light'
import { Icon } from '../components/ui'
import { api } from '../lib/api'

/** The signatory's own page, opened from the WhatsApp link: review and approve with an OTP (simulated Aadhaar eSign). */
export default function SignPage() {
  const { tok } = useParams()
  const [d, setD] = useState<any>(null)
  const [otp, setOtp] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  useEffect(() => { api.esignView(tok!).then((x) => { setD(x); setDone(x.status === 'signed') }).catch((e) => setErr(e.message)) }, [tok])
  if (err && !d) return <div className="grid min-h-screen place-items-center px-5 text-center text-[17px]">This signing link isn’t valid any more.</div>
  if (!d) return <div className="grid min-h-screen place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-red-600 border-t-transparent" /></div>
  return (
    <div className="min-h-screen bg-white px-5 py-8 text-smoke">
      <div className="mx-auto max-w-md">
        <LightLogo />
        {done ? (
          <div className="mt-20 text-center">
            <Icon name="BadgeCheck" className="mx-auto h-14 w-14 text-emerald-600" />
            <h1 className="mt-6 text-[32px] font-bold tracking-[-0.03em]">Signed. Thank you, {d.signer.split(' ')[0]}.</h1>
            <p className="mt-3 text-[16px] text-graphite">{d.business} can now finish setting up. You can close this page.</p>
          </div>
        ) : (
          <>
            <h1 className="mt-12 text-[32px] font-bold leading-tight tracking-[-0.03em]">{d.signer}, please approve for {d.business}.</h1>
            <p className="mt-3 text-[16px] text-graphite">You’re named as the person who signs for the business. Here’s what they chose:</p>
            <div className="mt-6 rounded-3xl bg-mist p-5">
              <div className="text-[30px] font-bold tabular-nums">{rupee(d.monthly || 0)}<span className="text-[15px] font-normal text-graphite"> a month with GST, {d.term} months</span></div>
              <ul className="mt-3 space-y-1 text-[14px]">{d.items.map((i: string) => <li key={i} className="flex gap-2"><Icon name="Check" className="mt-0.5 h-4 w-4 text-red-600" />{i}</li>)}</ul>
            </div>
            {!sent ? (
              <Btn big className="mt-8 w-full" onClick={() => setSent(true)}>Send OTP to my Aadhaar-linked phone</Btn>
            ) : (
              <form className="mt-8" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await api.esignDone(tok!, otp); setDone(true) } catch (x: any) { setErr(x.message) } }}>
                <label htmlFor="otp" className="text-[14px] font-medium">Enter the 6-digit OTP</label>
                <input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  className="mt-2 h-14 w-full rounded-2xl border border-hair text-center text-[26px] tracking-[0.5em] outline-none focus:border-smoke" />
                {err && <p className="mt-2 text-[13px] text-red-700">{err}</p>}
                <Btn big className="mt-4 w-full">Approve and sign</Btn>
                <p className="mt-3 text-center text-[12px] text-graphite">Simulated eSign for this prototype: any 6 digits work. In production this is Aadhaar eSign through a licensed provider.</p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
