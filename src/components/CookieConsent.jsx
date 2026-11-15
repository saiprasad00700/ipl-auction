// Modified from the upstream project by saiprasad00700.
import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Cookie, X, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const loadOptionalAnalytics = () => {
  if (typeof document === 'undefined') return
  if (document.querySelector('script[data-ss-auction-analytics="umami"]')) return
  const umami = document.createElement('script')
  umami.defer = true
  umami.src = 'https://cloud.umami.is/script.js'
  umami.dataset.websiteId = '18b70328-8e45-4f7e-baac-18aabc0a8ff8'
  umami.dataset.ssAuctionAnalytics = 'umami'
  document.head.appendChild(umami)
  const cloudflare = document.createElement('script')
  cloudflare.type = 'module'
  cloudflare.src = 'https://static.cloudflareinsights.com/beacon.min.js'
  cloudflare.dataset.cfBeacon = JSON.stringify({ token: '4b65f211b1be460b86bb03f73a9fa9ed', spa: true })
  cloudflare.dataset.ssAuctionAnalytics = 'cloudflare'
  document.body.appendChild(cloudflare)
}

export default function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false)
  useEffect(() => {
    const consent = localStorage.getItem('cookie_consent_status')
    if (consent === 'accepted') loadOptionalAnalytics()
    if (!consent) {
      const timer = setTimeout(() => setIsVisible(true), 1200)
      return () => clearTimeout(timer)
    }
  }, [])
  const handleAccept = () => {
    localStorage.setItem('cookie_consent_status', 'accepted')
    loadOptionalAnalytics()
    window.dispatchEvent(new CustomEvent('ssauction-consent-updated', { detail: 'accepted' }))
    setIsVisible(false)
  }
  const handleDecline = () => {
    localStorage.setItem('cookie_consent_status', 'declined')
    window.dispatchEvent(new CustomEvent('ssauction-consent-updated', { detail: 'declined' }))
    setIsVisible(false)
  }
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }} transition={{ duration: 0.3 }} className="fixed bottom-6 left-4 right-4 sm:right-auto sm:left-6 sm:max-w-sm z-[100] pointer-events-auto">
          <div className="bg-[#08111d]/95 border border-white/10 backdrop-blur-2xl rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-white relative flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><div className="p-1.5 bg-emerald-400/10 border border-[#6ee7b7]/30 rounded-lg text-emerald-300"><Cookie className="w-4 h-4" /></div><h4 className="font-black text-xs uppercase tracking-wider text-white">Privacy choices</h4></div>
              <button onClick={handleDecline} className="text-gray-500 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors" aria-label="Close privacy choices"><X className="w-3.5 h-3.5" /></button>
            </div>
            <p className="text-[11px] text-gray-300 font-medium leading-relaxed">Essential storage is used for sign-in and auction features. Optional Umami and Cloudflare analytics load only if you accept. Declining does not affect gameplay. Read our <Link to="/privacy" className="text-white underline hover:text-emerald-300">Privacy Policy</Link>.</p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={handleDecline} className="px-3 py-1.5 rounded-xl border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 transition-all text-[11px] font-bold uppercase tracking-wider">Decline optional analytics</button>
              <button onClick={handleAccept} className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 text-white text-[11px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-1 shadow-[0_4px_15px_rgba(16,185,129,0.24)]"><Check className="w-3.5 h-3.5" /> Accept</button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
