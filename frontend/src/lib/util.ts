import confetti from 'canvas-confetti'

export const inr = (n: number | undefined | null) => '₹' + Math.round(n || 0).toLocaleString('en-IN')

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

export function celebrate() {
  const colors = ['#E40000', '#FF4A4A', '#ffffff', '#111111']
  const end = Date.now() + 900
  ;(function frame() {
    confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors, scalar: 1.1 })
    confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors, scalar: 1.1 })
    if (Date.now() < end) requestAnimationFrame(frame)
  })()
}

export const NEED_ICONS: Record<string, string> = {
  internet: 'Wifi', backup: 'ShieldCheck', mobile: 'Smartphone', whatsapp: 'MessageCircle', sms: 'MessageSquareText',
  email: 'Mail', storage: 'HardDrive', website: 'Globe', pos: 'CreditCard', security: 'Shield', wifi: 'Router',
  cctv: 'Cctv', calling: 'PhoneCall', tollfree: 'Phone', iot: 'Cpu', fleet: 'Truck', sdwan: 'Network',
}

export const CATEGORY_ICON: Record<string, string> = {
  Connectivity: 'Wifi', Communication: 'PhoneCall', 'Cloud & Productivity': 'Cloud', Security: 'Shield', 'IoT & Physical': 'Cctv',
}

export const DOC_LABEL: Record<string, string> = {
  gst: 'GST certificate', udyam: 'Udyam certificate', id: 'Signatory ID', address: 'Address proof',
}
