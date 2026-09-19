import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PwaPrompt } from '@/components/PwaPrompt'
import { Home } from '@/pages/Home'
import { Play } from '@/pages/Play'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-full bg-cream">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/play" element={<Play />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <PwaPrompt />
      </div>
    </BrowserRouter>
  )
}
