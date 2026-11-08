// Round 1 deck v3: ChatGPT images from gpt/*.png placed on the official SYNC template.
// node build_deck_v3.js   (needs pptxgenjs, react, react-dom, react-icons, sharp, simple-icons on NODE_PATH)
const fs = require('fs')
const path = require('path')
const pptxgen = require('pptxgenjs')
const sharp = require('sharp')
const si = require('simple-icons')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const lu = require('react-icons/lu')

const D = (...p) => path.join(__dirname, ...p)
const OUT = D('Winter is Calling_Birla Institute of Technology(BIT), Mesra, Ranchi.pptx')   // submission naming: TeamName_CampusName
const { DEMO, GITHUB, COVER, HIDDEN } = require('./deck_text')
const RED = 'E40000', INK = '1D1D1F', MUTE = '5F5F66', FONT = 'Calibri'
const T = (o) => ({ fontFace: FONT, color: INK, margin: 0, isTextBox: true, valign: 'top', ...o })
const JPG = D('gpt', 'jpg'); fs.mkdirSync(JPG, { recursive: true })

const svgIcon = (name, color, px) => Buffer.from(renderToStaticMarkup(React.createElement(lu[name], { size: px, color: '#' + color, strokeWidth: 2 })))
const siPng = (key, px) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${px}" height="${px}"><path fill="#${si[key].hex}" d="${si[key].path}"/></svg>`)).png().toBuffer()
const white = (w, h, bg = '#FBFBFD') => sharp({ create: { width: w, height: h, channels: 4, background: bg } }).png().toBuffer()

// ChatGPT drew Google's "G" for Gemini and a garbled scikit-learn mark, and left Sarvam blank: paste the real logos.
async function patchArchitecture() {
  const src = D('gpt', 's4_architecture.png')
  const sarvam = await sharp(fs.readFileSync(D('assets', 'logos', 'sarvam.svg')), { density: 600 }).resize({ height: 22 }).png().toBuffer()
  const sw = (await sharp(sarvam).metadata()).width
  return sharp(src).composite([
    { input: await white(150, 34, '#FEFEFE'), left: 1152, top: 314 },             // "Sarvam AI" title -> wordmark
    { input: sarvam, left: 1158, top: 320 },
    { input: await sharp(svgIcon('LuAudioLines', RED, 56)).png().toBuffer(), left: 1088, top: 330 },
    { input: await white(64, 60), left: 1080, top: 416 },              // Google G -> Gemini spark
    { input: await siPng('siGooglegemini', 46), left: 1089, top: 423 },
    { input: await white(86, 56), left: 1078, top: 564 },              // garbled -> scikit-learn
    { input: await siPng('siScikitlearn', 60), left: 1090, top: 562 },
  ]).png().toBuffer().then(b => { if (sw > 145) throw new Error('sarvam wordmark too wide'); return b })
}

async function jpg(name, buf) {
  const out = path.join(JPG, name + '.jpg')
  await sharp(buf || D('gpt', name + '.png')).flatten({ background: '#FFFFFF' }).jpeg({ quality: 90 }).toFile(out)
  const m = await sharp(out).metadata()
  return { path: out, r: m.width / m.height }
}
const title = (s, text) => s.addText(text, T({ x: 1.75, y: 0.3, w: 9.85, h: 0.7, fontSize: 30, bold: true, color: RED, align: 'center', valign: 'middle', charSpacing: 1 }))

;(async () => {
  const pres = new pptxgen()
  pres.layout = 'LAYOUT_WIDE'
  pres.title = 'Udyam One, Airtel SYNC 2026 Track A'
  pres.company = 'Udyam One'
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT }
  pres.defineSlideMaster({ title: 'SYNC cover', background: { path: D('assets', 'bg_cover.jpg') } })
  pres.defineSlideMaster({ title: 'SYNC content', background: { path: D('assets', 'bg_content.jpg') } })
  pres.defineSlideMaster({ title: 'SYNC blank', background: { color: '1C0608' } })

  const I = {}
  for (const n of ['v_s2', 'v_s3d', 'v_s5', 'v_s6b', 'v_s7']) I[n] = await jpg(n)
  I.s4 = await jpg('s4_architecture_fixed', await patchArchitecture())

  // headline claim under the title; [text, bold] runs
  const lead = (s, runs) => s.addText(runs.map(([t, b]) => ({ text: t, options: { bold: !!b, color: b ? RED : INK } })),
    T({ x: 1.45, y: 1.0, w: 10.45, h: 0.58, fontSize: 14.5, align: 'center', valign: 'middle' }))
  const playPng = 'image/png;base64,' + (await sharp(svgIcon('LuPlay', 'FFFFFF', 256)).png().toBuffer()).toString('base64')

  const playRed = 'image/png;base64,' + (await sharp(svgIcon('LuPlay', RED, 256)).png().toBuffer()).toString('base64')
  const ghPng = 'image/png;base64,' + (await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="256" height="256"><path fill="#FFFFFF" d="${si.siGithub.path}"/></svg>`)).png().toBuffer()).toString('base64')
  const clearPng ='image/png;base64,' + (await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } }).png().toBuffer()).toString('base64')

  // Every content slide: a 16:9 visual on the left, numbered story sections on the right.
  const story = (s, img, heading, steps, opts = {}) => {
    const h = 5.0, w = h * img.r, x = 0.45, y = 1.68
    // the image's content as real text: drawn first so the opaque image covers it, readable by PDF/AI text extraction
    const txt = HIDDEN[heading]
    if (txt) {
      s.addText(txt, T({ x: x + 0.1, y: y + 0.1, w: w - 0.2, h: h - 0.2, fontSize: 5.5, color: 'FFFFFF', fit: 'none' }))
      s.addNotes(txt)
    }
    s.addImage({ path: img.path, x, y, w, h, altText: txt || heading })
    const cx = x + w + 0.25, cw = 13.333 - cx - 0.45
    s.addShape('roundRect', { x: cx, y, w: cw, h, rectRadius: 0.1, fill: { color: 'F5F5F7' }, line: { color: 'E3E3E8' } })
    s.addText(heading, T({ x: cx + 0.2, y: y + 0.15, w: cw - 0.4, h: 0.32, fontSize: 14, bold: true }))
    const gap = opts.gap || (steps.length > 3 ? 1.0 : 1.3)
    steps.forEach(([t, d], i) => {
      const sy = y + 0.62 + i * gap
      s.addShape('ellipse', { x: cx + 0.2, y: sy, w: 0.34, h: 0.34, fill: { color: RED }, line: { color: RED } })
      s.addText(String(i + 1), T({ x: cx + 0.2, y: sy, w: 0.34, h: 0.34, fontSize: 12, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }))
      s.addText([{ text: t, options: { bold: true, fontSize: 12, breakLine: true } }, { text: d, options: { fontSize: 10, color: MUTE } }],
        T({ x: cx + 0.65, y: sy - 0.03, w: cw - 0.8, h: gap - 0.05 }))
    })
    if (opts.callout) {   // the "so what" that hands over to the next slide
      const by = y + h - 0.95
      s.addShape('roundRect', { x: cx + 0.2, y: by, w: cw - 0.4, h: 0.78, rectRadius: 0.08, fill: { color: 'FDECEC' }, line: { color: 'F6C6C6' } })
      s.addText(opts.callout, T({ x: cx + 0.35, y: by, w: cw - 0.7, h: 0.78, fontSize: 11.5, bold: true, color: RED, valign: 'middle' }))
    }
    return { cx, cw, y, h }
  }

  // 1. Cover: the owner, full bleed
  {
    const s = pres.addSlide({ masterName: 'SYNC blank' })
    s.background = { path: D('assets', 'cover_bg.jpg') }
    s.addImage({ path: D('assets', 'logo_airtel_white.png'), x: 0.5, y: 0.42, w: 1.26, h: 0.62 })
    s.addShape('roundRect', { x: 11.3, y: 0.45, w: 1.6, h: 0.58, rectRadius: 0.12, fill: { color: 'FFFFFF' }, line: { color: 'FFFFFF' } })
    s.addImage({ path: D('assets', 'logo_sync.png'), x: 11.42, y: 0.52, w: 1.36, h: 0.42 })
    s.addImage({ path: D('assets', 'logo_unstop_white.png'), x: 10.4, y: 6.82, w: 2.6, h: 0.42 })
    s.addText('Enterprise Track A: Project Udyam Digital', T({ x: 0.6, y: 1.75, w: 6.2, h: 0.32, fontSize: 14, bold: true, color: 'FF8A8A' }))
    s.addText('Udyam One', T({ x: 0.6, y: 2.1, w: 6.4, h: 1.0, fontSize: 60, bold: true, color: 'FFFFFF', valign: 'middle' }))
    s.addText('Making small businesses go digital in one sitting', T({ x: 0.6, y: 3.12, w: 6.4, h: 0.5, fontSize: 23, color: 'FFFFFF' }))
    s.addText('Accel Business’s AI front door. AI voice agents on WhatsApp, a phone call or the web take a small business from interested to live, in its own language.',
      T({ x: 0.6, y: 3.72, w: 5.7, h: 0.9, fontSize: 14, color: 'E2D6D6' }))
    let px = 0.6
    for (const m of ['AI voice agents', 'WhatsApp, call or web', 'Every Indian language', 'Live in days']) {
      const w = 0.32 + m.length * 0.082
      s.addShape('roundRect', { x: px, y: 4.8, w, h: 0.36, rectRadius: 0.18, fill: { color: 'FFFFFF', transparency: 88 }, line: { color: 'FFFFFF', transparency: 45, width: 1 } })
      s.addText(m, T({ x: px, y: 4.8, w, h: 0.36, fontSize: 11, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }))
      px += w + 0.12
    }
    {
      const vx = 6.15, vy = 2.02, vw = 2.0, vh = 0.46
      s.addShape('roundRect', { x: vx, y: vy, w: vw, h: vh, rectRadius: 0.23, fill: { color: 'FFFFFF', transparency: 6 }, line: { color: 'FFFFFF' },
        shadow: { type: 'outer', color: '000000', opacity: 0.35, blur: 8, offset: 2, angle: 90 } })
      ;[0.12, 0.22, 0.32, 0.18, 0.3, 0.14, 0.24].forEach((bh, i) =>
        s.addShape('roundRect', { x: vx + 0.16 + i * 0.065, y: vy + (vh - bh) / 2, w: 0.035, h: bh, rectRadius: 0.017, fill: { color: RED }, line: { color: RED } }))
      s.addText([{ text: 'AI voice agent', options: { bold: true, color: INK } }, { text: '  Hindi', options: { color: MUTE } }],
        T({ x: vx + 0.68, y: vy, w: vw - 0.75, h: vh, fontSize: 11, valign: 'middle' }))
    }
    s.addShape('line', { x: 0.6, y: 5.5, w: 2.2, h: 0, line: { color: RED, width: 2.5 } })
    ;[['Team', 'Winter is Calling'], ['Name', 'Krrish Rastogi'], ['Institute', 'Birla Institute of Technology (BIT), Mesra, Ranchi']].forEach(([k, v], i) =>
      s.addText([{ text: k + '   ', options: { bold: true, color: 'FF8A8A' } }, { text: v, options: { color: 'FFFFFF', bold: k === 'Team' } }], T({ x: 0.6, y: 5.65 + i * 0.34, w: 6.6, h: 0.34, fontSize: 14 })))
    // demo + code links, right on the cover
    {
      const ly = 6.9
      s.addShape('roundRect', { x: 0.6, y: ly, w: 2.05, h: 0.4, rectRadius: 0.2, fill: { color: RED }, line: { color: RED } })
      s.addImage({ data: playPng, x: 0.78, y: ly + 0.11, w: 0.18, h: 0.18 })
      s.addText('Watch the demo', T({ x: 1.02, y: ly, w: 1.55, h: 0.4, fontSize: 12, bold: true, color: 'FFFFFF', valign: 'middle' }))
      s.addImage({ data: clearPng, x: 0.6, y: ly, w: 2.05, h: 0.4, hyperlink: { url: DEMO, tooltip: 'Watch the Udyam One demo' }, altText: 'Demo video: ' + DEMO })
      s.addShape('roundRect', { x: 2.8, y: ly, w: 1.75, h: 0.4, rectRadius: 0.2, fill: { color: 'FFFFFF', transparency: 88 }, line: { color: 'FFFFFF', transparency: 40, width: 1 } })
      s.addImage({ data: ghPng, x: 2.97, y: ly + 0.1, w: 0.2, h: 0.2 })
      s.addText('Code on GitHub', T({ x: 3.24, y: ly, w: 1.3, h: 0.4, fontSize: 12, bold: true, color: 'FFFFFF', valign: 'middle' }))
      s.addImage({ data: clearPng, x: 2.8, y: ly, w: 1.75, h: 0.4, hyperlink: { url: GITHUB, tooltip: 'Udyam One on GitHub' }, altText: 'Code: ' + GITHUB })
    }
    s.addNotes(COVER + ' Code: ' + GITHUB)
  }

  // 2. Problem
  {
    const s = pres.addSlide({ masterName: 'SYNC content' })
    title(s, 'PROBLEM STATEMENT')
    lead(s, [['India’s '], ['6 crore+ small businesses', 1], [' are ready to go digital, but a sales journey built for corporates '], ['loses 93 of every 100 who ask.', 1]])
    story(s, I.v_s2, 'Why it matters', [
      ['A huge, under-served market', 'MSMEs now need broadband, SIMs, a WhatsApp channel, cloud, security and CCTV. Most buy each piece from a different vendor, with no single bill.'],
      ['A journey built for corporates', 'A sales visit, a PDF quote in 3-5 days, paper KYC and 10-14 days to install, then a separate bill and support number for every product.'],
      ['Revenue walking away', 'In one quarter, 4,632 of 5,000 interested businesses never went live. Each one that did cost ₹15,000 to win.'],
    ], { callout: 'Fix the journey, and the same leads become twice the customers.' })
  }

  // 3. Solution
  {
    const s = pres.addSlide({ masterName: 'SYNC content' })
    title(s, 'PROPOSED SOLUTION')
    lead(s, [['Udyam One is Accel Business’s '], ['AI front door', 1], [': '], ['AI voice agents', 1], [' take a small business from interested to live in one conversation, then keep it growing.']])
    const c = story(s, I.v_s3d, 'How Udyam One works', [
      ['Voice agents, any channel', 'Owners just talk on WhatsApp, a phone call, the web or in a store. The voice agent replies in their language.'],
      ['AI agents do the work', 'Advisor, quote, KYC, install, billing, care and growth agents act for the owner, from the first message to live service and beyond.'],
      ['Trusted by design', 'Prices come only from Accel’s catalogue. KYC is verified with GST, Udyam, DigiLocker and Aadhaar eSign, with DPDP consent.'],
      ['People where they add value', 'Partners and the field force take complex sites, with the whole conversation in hand.'],
    ], { gap: 0.84 })
    // demo: a big red card with a play disc; code: a dark button below. Clear images on top carry the links into the PDF.
    const bx = c.cx + 0.15, bw = c.cw - 0.3, by = c.y + 3.9
    s.addShape('roundRect', { x: bx, y: by, w: bw, h: 0.62, rectRadius: 0.12, fill: { color: RED }, line: { color: RED },
      shadow: { type: 'outer', color: 'E40000', opacity: 0.45, blur: 10, offset: 2, angle: 90 } })
    s.addShape('ellipse', { x: bx + 0.12, y: by + 0.09, w: 0.44, h: 0.44, fill: { color: 'FFFFFF' }, line: { color: 'FFFFFF' } })
    s.addImage({ data: playRed, x: bx + 0.24, y: by + 0.2, w: 0.22, h: 0.22 })
    s.addText([{ text: 'Watch the demo', options: { bold: true, fontSize: 14, breakLine: true } }, { text: 'AI voice agent, end to end', options: { fontSize: 9.5, color: 'FFE0E0' } }],
      T({ x: bx + 0.66, y: by, w: bw - 0.75, h: 0.62, color: 'FFFFFF', valign: 'middle' }))
    s.addImage({ data: clearPng, x: bx, y: by, w: bw, h: 0.62, hyperlink: { url: DEMO, tooltip: 'Watch the Udyam One demo' }, altText: 'Demo video: ' + DEMO })
    const gy = by + 0.7
    s.addShape('roundRect', { x: bx, y: gy, w: bw, h: 0.36, rectRadius: 0.18, fill: { color: '1D1D1F' }, line: { color: '1D1D1F' } })
    s.addImage({ data: ghPng, x: bx + 0.18, y: gy + 0.08, w: 0.2, h: 0.2 })
    s.addText('View the code on GitHub', T({ x: bx + 0.46, y: gy, w: bw - 0.55, h: 0.36, fontSize: 11, bold: true, color: 'FFFFFF', valign: 'middle' }))
    s.addImage({ data: clearPng, x: bx, y: gy, w: bw, h: 0.36, hyperlink: { url: GITHUB, tooltip: 'Udyam One on GitHub' }, altText: 'Code: ' + GITHUB })
  }

  // 4. Technical approach (unchanged layout: architecture + how a request flows)
  {
    const s = pres.addSlide({ masterName: 'SYNC content' })
    title(s, 'TECHNICAL APPROACH')
    lead(s, [['A GenAI advisor works on top of rule engines and trusted sources, so '], ['KYC is near-instant', 1],
      [' and stays compliant with the '], ['DPDP Act, 2023: consent, purpose limitation and data minimisation.', 1]])
    story(s, I.s4, 'How a request flows', [
      ['Reach us', 'WhatsApp, the web app or a phone call with the voice agent. Partners and Accel ops use the back-office.'],
      ['Secure entry', 'The gateway checks every request and keeps all screens in sync, live.'],
      ['Advisor and agents act', 'The GenAI advisor recommends from the catalogue; agents run KYC, book the install and send updates.'],
      ['Smart KYC, compliant', 'GSTIN and Udyam lookup, DigiLocker, OCR and e-sign. PII is redacted before the AI; data is encrypted and every action is logged.'],
    ], { gap: 1.08 })
  }

  // 5. Competitive analysis
  {
    const s = pres.addSlide({ masterName: 'SYNC content' })
    title(s, 'COMPETITIVE ANALYSIS')
    lead(s, [['Others sell one product through a form. Udyam One sells '], ['the whole business bundle through AI voice agents, in the owner’s language', 1], [', backed by '], ['Accel’s reach.', 1]])
    story(s, I.v_s5, 'Why Udyam One wins', [
      ['The whole bundle, not one product', 'Digital-first players sell a single product through a form. We design the full business bundle, on one bill.'],
      ['Built for Bharat', 'Voice agents speak the owner’s language, so a kirana owner is as comfortable as a CA firm.'],
      ['Accel’s reach as a multiplier', 'Field force, partners and stores carry every lead the AI starts, so the channel grows instead of competing.'],
    ], { callout: 'The only option that ticks every box for the owner, and only Accel can run it.' })
  }

  // 6. Feasibility and viability
  {
    const s = pres.addSlide({ masterName: 'SYNC content' })
    title(s, 'FEASIBILITY AND VIABILITY')
    lead(s, [['Udyam One runs on what Accel already owns, '], ['starts with 80% of the SMB base', 1], [' and '], ['pays back in under 3 months.', 1]])
    story(s, I.v_s6b, 'Why it works for Accel', [
      ['Runs on what Accel owns', 'Uses Accel’s catalogue, network, billing, field force and partners. No new stores, no new sales force.'],
      ['Start with 80% of SMBs', 'Wave 1 is micro retail and professional offices, piloted in two contrasting markets: Lucknow (costliest to win today) and Pune (Marathi-first Tier 1 metro).'],
      ['Pays back fast', 'Cost to acquire falls below ₹8,000, so a micro-retail bundle earns it back in under 3 months.'],
      ['Built on Accel’s own data', 'Prices from the 25-product catalogue; baselines and a lead-scoring model from 5,000 leads (its top 20% holds 2.15x the conversions); KYC checked against the GSTIN and Udyam registries.'],
    ], { gap: 1.07 })
  }

  // 7. Impact and benefits
  {
    const s = pres.addSlide({ masterName: 'SYNC content' })
    title(s, 'IMPACT AND BENEFITS')
    lead(s, [['Same leads, same budget: '], ['twice the businesses live, at about half the cost each, in less than half the time.', 1]])
    const c = story(s, I.v_s7, 'Who gains', [
      ['Business owners', 'Online in one sitting, in their own language, with one bill and one number to call.'],
      ['Accel Business', 'Twice the customers from the same leads and budget, with revenue starting 10 days sooner.'],
      ['Partners and field force', 'Ready leads with full context. Partners keep their commission; the field force focuses on large sites.'],
      ['Digital India', 'More small businesses on UPI, cloud tools and secure connectivity.'],
    ], { gap: 0.92 })
    s.addText('Baseline: smb_leads.csv, April to June 2026. ₹98 crore = 6,640 extra activations per 1 lakh leads × ₹12,351 average monthly bundle × 12.',
      T({ x: c.cx + 0.2, y: c.y + c.h - 0.62, w: c.cw - 0.4, h: 0.5, fontSize: 7.5, color: MUTE }))
  }

  await pres.writeFile({ fileName: OUT })
  console.log('wrote', OUT)
})()
