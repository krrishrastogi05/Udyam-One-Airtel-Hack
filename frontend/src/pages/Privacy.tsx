import { LightLogo } from '../components/light'

const SECTIONS: [string, string][] = [
  ['Why we ask', 'Only to confirm your business is registered and active, so business connections can be switched on. Not for marketing, not to train any AI model.'],
  ['What we collect', 'What you tell the advisor, your plan, and for verification: your GST certificate, a Udyam certificate (optional), the signatory’s ID or e-sign, and one recent utility bill. If you choose, we verify GST directly with the GST registry and fetch the Udyam certificate from DigiLocker instead of photos.'],
  ['What the AI sees', 'Udyam AI understands your messages through a language model provider set by the operator. Before any message leaves our server, phone numbers, emails, GSTINs, Udyam, PAN and ID numbers are replaced with placeholders. Lookups happen on our server. The AI never sets prices or approves documents; Accel’s catalogue and checks do.'],
  ['Voice', 'Voice notes and calls are turned into text by Sarvam AI’s speech service, and replies are spoken by it, when the operator has it switched on. Otherwise your browser’s own speech service is used (Google in Chrome, Microsoft in Edge). The audio is used only to understand you. You can always type instead.'],
  ['How we protect it', 'Document photos are encrypted with their own key (AES-256-GCM), and that key is encrypted again with a master key. ID numbers are masked on every screen and never sent to the browser in full. Every consent, document, payment and partner action is written to a tamper-evident log.'],
  ['Who else sees it', 'A local Accel partner sees a short summary only when you ask for help or verification needs a person. Partners sign in, and every view is logged. They never see your document photos.'],
  ['How long we keep it', 'Telecom rules (Department of Telecommunications) require us to keep the KYC record while your connection is active and for 3 years after it ends. Everything else is deleted 30 days after your services go live. In this prototype everything lives in memory and disappears when the server restarts.'],
  ['Messages from us', 'Order, payment and install updates come any time. Offers go only between 10 in the morning and 9 at night, inside TRAI’s time window.'],
  ['Your rights', 'Withdraw consent or erase your documents and ID numbers any time: type DELETE in the chat. We keep only what telecom rules require. Your plan stays saved. Questions go to one support number, in your language.'],
]

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-smoke">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <LightLogo />
        <h1 className="mt-16 text-[44px] font-bold leading-[1.05] tracking-[-0.04em] sm:text-[56px]">Your documents stay yours.</h1>
        <p className="mt-4 text-[19px] text-graphite">What we collect, why, and how to make us forget it. Written for the Digital Personal Data Protection Act, 2023 and the DPDP Rules, 2025.</p>
        <dl className="mt-14 divide-y divide-hair border-y border-hair">
          {SECTIONS.map(([t, d]) => (
            <div key={t} className="grid gap-2 py-6 sm:grid-cols-[200px_1fr] sm:gap-8">
              <dt className="text-[17px] font-semibold">{t}</dt>
              <dd className="text-[16px] leading-relaxed text-graphite">{d}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-10 text-[13px] text-graphite">Prototype for Airtel SYNC 2026, Track A. Accel Business is the fictional operator from the case; all records are synthetic.</p>
      </div>
    </div>
  )
}
