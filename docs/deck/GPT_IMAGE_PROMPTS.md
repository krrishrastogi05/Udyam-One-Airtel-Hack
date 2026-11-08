# Udyam One deck: ChatGPT image prompts

## How to use
1. Open one new ChatGPT chat. Paste **Message 1 (context + style)** first and send it.
2. Then send each image prompt below one by one, in the same chat.
3. Save each result with the file name given, into `docs/deck/gpt/`.
4. If any word or number in an image is wrong, reply in the chat: "Same image, fix only this text: ...".
5. Give me the folder. I place the images on the official SYNC template, which already has the title, the Airtel logo, the SYNC logo and the Unstop footer. **So no image may contain a slide title or any logo.**

Grid: every content slide = one **landscape 3:2** image (left, big) + one **portrait 2:3** image (right).
Slide 1 is the template cover. It needs no image.

| Slide | Landscape 3:2 (left) | Portrait 2:3 (right) |
|---|---|---|
| 2 Problem Statement | `s2_funnel.png` | `s2_owner.png` (optional, we already have one) |
| 3 Proposed Solution | `s3_solution.png` | `s3_video_poster.png` |
| 4 Technical Approach | `s4_architecture.png` | none: I build the tech-stack card with the real logos |
| 5 Competitive Analysis | `s5_compare_table.png` | `s5_position_map.png` |
| 6 Feasibility and Viability | `s6_feasibility.png` | `s6_rollout.png` |
| 7 Impact and Benefits | `s7_outcomes.png` | `s7_who_gains.png` |

---

## Message 1: context and style (send first)

```
I am making a 7-slide pitch deck for Airtel SYNC 2026, Enterprise Track A, "Project Udyam Digital".
I need you to generate infographic images for it, one at a time. Please read this first and apply it to every image I ask for.

THE PRODUCT
Udyam One. A small business owner in India (a kirana shop, a clinic, a small office, a restaurant) tells the AI what the business needs, by voice or text, in Hindi, Marathi, Tamil, English or Hinglish, on WhatsApp or on the web. The AI builds one clear monthly plan (internet, phone lines, CCTV, POS and similar) from the operator's own catalogue. It checks the documents (GST, Udyam) from trusted sources, collects payment by UPI, books the installation and sends updates on WhatsApp. A local partner can step in any time. The operator in the brief is called "Accel Business". Tagline: "Every small business, online in one conversation".
Audience: Airtel judges. The images must be simple to understand, focused on the business owner, and show only strengths.

STYLE (apply to every image)
- Clean, premium, modern infographic, like a top consulting or Apple keynote slide. Flat vector, not 3D, not clip art, not cartoonish.
- Background: pure white #FFFFFF. No border or frame around the whole image. Generous white space and margins.
- Colours: Airtel red #E40000 as the single accent. Text charcoal #1D1D1F, secondary text grey #5F5F66. Cards light grey #F5F5F7 or soft red tint #FDECEC. Thin lines #E3E3E8. Green #1DB954 only for check marks. No other colours, no gradients except a very soft red glow when I ask for one.
- Shapes: rounded cards (large corner radius), very soft shadows, thin 2px line icons (charcoal, or white inside red circles, or red inside soft-red circles). Numbered steps use small solid red circles with white numbers.
- Typography: one clean sans-serif (like Inter or SF Pro). Bold for headings and big numbers, regular for small lines. Big numbers large and bold. All text horizontal and easy to read.
- Text rules: spell every word and number exactly as I give it. Do not add any text, title, heading, caption, watermark or label that I did not give. Do not draw any company logo (no Airtel, WhatsApp, Google or other brand marks). Where I ask for the Udyam One mark, use a solid red circle with a bold white capital "U".
- Photos (only when I ask for a photo): photorealistic, warm natural light, real Indian small business, respectful and dignified, subtle red accents, no text on the photo.

Reply "ready" and wait for my first image prompt.
```

---

## Slide 2: Problem Statement

### `s2_funnel.png`: landscape 3:2
```
Image: landscape 3:2. Follow the Udyam One style.
Content: why small businesses who want internet never get connected today. Three zones.

LEFT ZONE (largest): a horizontal funnel of six bars that get shorter from top to bottom. Label on the left of each bar, number inside or next to it:
"Interested" 5,000
"Contacted" 3,406
"Needs understood" 1,974
"Accepted the quote" 861
"Documents done" 588
"Connected" 368
Bars are charcoal, except "Accepted the quote", which is red. Next to the red bar, a small red tag: "Only 44% accept the quote".

RIGHT ZONE: a soft-red rounded card with the heading "Why they drop" and four rows. Each row = red line icon in a white circle + a big red number + one short grey line:
phone with a cross icon: "1,632" - "never reached or visited"
receipt icon: "1,006" - "found the quote costly, slow or confusing"
document icon: "273" - "stuck on paperwork"
wrench icon: "220" - "lost at install or payment"

BOTTOM STRIP: four equal light-grey tiles in one row, each with a line icon at the top, a big bold number and one short line:
calendar icon: "17.6 days" - "to get connected"
phone icon: "3 calls" - "to ask for status"
rupee icon: "₹15,053" - "to win one customer"
language icon: "1 in 3" - "prefer a regional language"

No other text.
```

### `s2_owner.png`: portrait 2:3 (optional, we already have this photo)
```
Image: portrait 2:3, photorealistic photo. Follow the Udyam One style for photos.
A confident Indian woman in her 40s who owns a small kirana store, wearing a red and cream saree. She stands behind her counter with shelves of packaged goods behind her, softly blurred. She smiles while she speaks a voice note into her smartphone, held near her mouth. Warm daylight, shallow depth of field. Keep the lower third calm and slightly darker so that white text can sit over it. No text, no logos, no screen content visible.
```

---

## Slide 3: Proposed Solution

### `s3_solution.png`: landscape 3:2
```
Image: landscape 3:2. Follow the Udyam One style.
Content: how Udyam One works for the owner.

TOP: a row of six steps joined by thin red arrows. Each step = a soft-red circle with a red line icon, a small solid red number badge under it, and a bold label:
1 microphone "Tell us"
2 receipt with rupee "Get a plan"
3 document with tick "Verify"
4 card "Pay"
5 location pin with hand "Install"
6 headset "Stay connected"
Under the row, one wide solid red rounded ribbon with white bold text: "AI takes action on your behalf"

BOTTOM: three equal rounded cards side by side, each with an icon in a soft-red circle, a bold title and one grey line:
microphone icon: "Talk in your language" - "Hindi, Marathi, Tamil, English, Hinglish"
receipt icon: "One clear monthly price" - "Every item explained in your words"
tick-shield icon: "No paperwork" - "Records fetched, photos checked in seconds"
Then a second row of three equal cards:
UPI-style arrow icon: "Pay by UPI" - "Installation booked for you"
chat bubble icon: "Updates on WhatsApp" - "No need to call and ask"
two people icon: "A local partner can step in" - "Any time you want a person"

No other text.
```

### `s3_video_poster.png`: portrait 2:3
```
Image: portrait 2:3, photorealistic photo. Follow the Udyam One style for photos.
Close-up of an Indian shop owner's hand holding a modern smartphone in a softly blurred small shop. The phone screen shows a clean, light chat app: one incoming message card with a red header that reads "Your plan" and below it a big bold "₹2,708/month", then two short grey lines that read "Business internet" and "CCTV, 4 cameras", and under the card a green voice-note waveform bubble. Keep the centre of the phone screen uncluttered, because I will put a play button over it. No app logos, no other text.
```

---

## Slide 4: Technical Approach

### `s4_architecture.png`: landscape 3:2
```
Image: landscape 3:2. Follow the Udyam One style. This is the technical slide, so technical labels are fine.
Content: system architecture, five columns from left to right joined by thin grey arrows, plus one loop strip at the bottom.

Each column = a tall rounded card with a red number badge at the top, a bold title and a grey subtitle, then its items as small rows with line icons:
1 "Channels" / "Where owners and partners meet us": "Web app", "WhatsApp chat", "Voice call", "Partner console"
2 "Secure gateway" / "FastAPI": "Live sync to every screen", "Rate limits and security headers", "Signed partner sign-in"
3 "AI agents" / "Act on the owner's behalf": "Advisor", "KYC checker", "Fulfilment", "Win-back", "Notifier"
4 "Decision engines" / "Rules, not guesses": "Catalogue pricing", "Smart KYC checks", "Lead scoring", "Consent and audit log"
5 "Data and services" / "Trusted sources": "GST registry", "DigiLocker (Udyam)", "UPI and e-NACH", "Aadhaar eSign", "Encrypted document vault"
Arrow labels between columns (small grey text): "REST + live sync", "events", "facts in, decisions out", "read / write".
Column 3 has a soft red glow, because it is the heart of the system.

BOTTOM STRIP: a wide soft-red rounded strip titled "Real-time loop: from a sentence to a booked install", with five steps joined by red arrows, each with a red line icon:
"Owner speaks" -> "Speech to text (Sarvam AI)" -> "Understanding (LLM)" -> "Engines decide" -> "Plan, KYC, install, update"

No other text.
```

---

## Slide 5: Competitive Analysis

### `s5_compare_table.png`: landscape 3:2
```
Image: landscape 3:2. Follow the Udyam One style.
Content: a clean comparison table. Six rows and five columns.
Column headers, each with a simple grey line icon in a light circle above the name: "Field sales visit" (person with briefcase), "Telco online store" (shopping cart), "Local reseller" (storefront), "Generic chatbot" (chat bubble), and last "Udyam One" (the Udyam One mark: a solid red circle with a white "U").
The "Udyam One" column is highlighted: a soft red tint background running down the full column, red bold header, a slight lift with a soft shadow.
Cells use only three symbols: green check, amber half-filled circle, grey cross.
Row labels on the left, bold charcoal:
"Full bundle on one bill": check, cross, half, cross, check
"Talk in your language, by voice": half, cross, check, half, check
"Instant, clear monthly price": cross, check, cross, cross, check
"No paperwork": cross, half, cross, cross, check
"Install tracked, updates on WhatsApp": cross, half, cross, cross, check
"Local partner can step in": check, cross, check, cross, check
Small legend under the table: green check "Yes", amber half circle "Partly", grey cross "No".
No other text.
```

### `s5_position_map.png`: portrait 2:3
```
Image: portrait 2:3. Follow the Udyam One style.
TOP TWO THIRDS: a 2x2 positioning map in a light-grey rounded card, drawn as a cross of two thin axes with arrow heads.
Horizontal axis: left end "One product", right end "Full business bundle".
Vertical axis: bottom end "Visit and paperwork", top end "Self-serve, in your language".
Grey dots with small grey labels: "Telco online store" in the top-left quadrant; "Generic chatbot" in the top-left quadrant, lower than the store; "Local reseller" in the bottom-left quadrant; "Field sales visit" in the bottom-right quadrant.
One large red dot with a soft red glow, alone in the top-right quadrant, labelled in bold red "Udyam One".

BOTTOM THIRD: a solid red rounded card with the heading "Why we win" in white bold, and three rows, each with a small white line icon and white text:
shield icon: "Prices come from Accel's own catalogue, so the AI stays trustworthy"
microphone icon: "Voice-first in regional languages"
handshake icon: "Partners handle the hard cases and keep their commission"
No other text.
```

---

## Slide 6: Feasibility and Viability

### `s6_feasibility.png`: landscape 3:2
```
Image: landscape 3:2. Follow the Udyam One style.
Content: a 2x2 grid of four large rounded cards. Each card = a red number badge, an icon in a soft-red circle, a bold title and two short grey lines with small red dots:
1 gear icon: "Technical" - "Working prototype, end to end" - "Voice in 5 languages, live web and WhatsApp sync"
2 handshake icon: "Operational" - "Fits how Accel already sells" - "Partners get ready leads, field force focuses on large sites"
3 rupee icon: "Economic" - "No sales visit for most businesses: cost to win under ₹8,000" - "Micro shops become profitable: cost recovered in under 3 months, not 8"
4 shield icon: "Regulatory" - "Built for the DPDP Act 2023 and Rules 2025" - "Follows TRAI message hours, DoT KYC and RBI e-mandate rules"
No other text.
```

### `s6_rollout.png`: portrait 2:3
```
Image: portrait 2:3. Follow the Udyam One style.
TOP: a vertical timeline, a thin red line with three solid red numbered circles, each with a rounded card to the right:
1 "Pilot: 0 to 3 months" - "Pune and Lucknow, 20 partners" - "Clinics, offices and shops"
2 "Scale: 3 to 9 months" - "10 cities" - "Chains; DigiLocker, eSign and UPI AutoPay live"
3 "National: 9 to 18 months" - "All 22 Indian languages" - "Factories through the field force"
BOTTOM: a wide soft-red rounded card with a red building icon, a very large bold red "8.84 crore" and under it in grey: "enterprises registered on Udyam: our market"
No other text.
```

---

## Slide 7: Impact and Benefits

### `s7_outcomes.png`: landscape 3:2
```
Image: landscape 3:2. Follow the Udyam One style.
Content: how we measure success. Five horizontal rounded light-grey rows stacked vertically. Each row = a red line icon in a soft-red circle, a bold label with one small grey "how we measure" line under it, then on the right a grey "today" value, a thin red arrow, and a large bold red "target" value. Give the first row a soft red tint, because it is the headline metric.
chart icon: "Leads connected" / "Businesses live ÷ all leads. Each stage improves a little: contact 68% to 85%, quote accepted 44% to 55%" - "7.4%" -> "14%"
rupee-coins icon: "Monthly revenue per 1,000 leads" / "Leads connected × monthly bill" - "₹9.1 lakh" -> "₹17 lakh"
calendar icon: "Days to go live" / "Median days from lead to service live" - "17" -> "7"
wallet icon: "Cost to win a customer" / "Total spend ÷ businesses live. Micro shops: cost recovered in under 3 months, not 8" - "₹15,053" -> "under ₹8,000"
heart icon: "Customers who leave in 6 months" / "Early signal: support tickets in the first 30 days" - "15%" -> "10%"
Above the rows, two small column captions aligned over the values: "Today" (grey) and "Target" (red).
Under the rows, one thin soft-red strip with a small red line icon of a stopwatch and the text: "Every step is time-stamped in the app. Pilot leads are compared with field-sales leads over the same months."
No other text.
```

### `s7_who_gains.png`: portrait 2:3
```
Image: portrait 2:3. Follow the Udyam One style.
Content: four stacked rounded cards, each with a simple flat illustration or icon in a soft-red circle on the left, a bold name and one short grey line:
shop icon: "Business owners" - "Online in one conversation, in their own language"
signal tower icon: "Accel Business" - "About twice the connected businesses from the same leads"
handshake icon: "Local partners" - "Ready leads with full context, commission kept"
India map outline icon: "Digital India" - "More small businesses using UPI, billing and WhatsApp selling"
At the bottom, a solid red rounded banner with white bold text: "One conversation. One plan. One bill. Live in days."
No other text.
```
