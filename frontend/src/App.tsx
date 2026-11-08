import { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { api } from './lib/api'
import JourneyPage from './pages/Journey'
import Landing from './pages/Landing'
import PartnerPage from './pages/Partner'
import PrivacyPage from './pages/Privacy'
import SignPage from './pages/Sign'
import StagePage from './pages/Stage'
import WhatsAppPage from './pages/WhatsApp'

function StartWeb() {
  const nav = useNavigate()
  useEffect(() => { api.start('web').then((j) => nav(`/j/${j.id}`, { replace: true })) }, [nav])
  return <div className="grid min-h-screen place-items-center"><div className="h-9 w-9 animate-spin rounded-full border-2 border-red-600 border-t-transparent" /></div>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/start" element={<StartWeb />} />
      <Route path="/j/:id" element={<JourneyPage />} />
      <Route path="/wa" element={<WhatsAppPage />} />
      <Route path="/wa/:id" element={<WhatsAppPage />} />
      <Route path="/stage" element={<StagePage />} />
      <Route path="/partner" element={<PartnerPage />} />
      <Route path="/impact" element={<Navigate to="/partner?tab=impact" replace />} />
      <Route path="/sign/:tok" element={<SignPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  )
}
