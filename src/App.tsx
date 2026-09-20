import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PwaPrompt } from '@/components/PwaPrompt'
import { About } from '@/pages/About'
import { Home } from '@/pages/Home'
import { Language } from '@/pages/Language'
import { Play } from '@/pages/Play'
import { Share } from '@/pages/Share'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-full bg-cream">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/language" element={<Language />} />
          <Route path="/play" element={<Play />} />
          <Route path="/share" element={<Share />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <PwaPrompt />
      </div>
    </BrowserRouter>
  )
}
