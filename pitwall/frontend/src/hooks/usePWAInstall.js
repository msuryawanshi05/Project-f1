import { useState, useEffect } from 'react'

/**
 * usePWAInstall — handles the browser's beforeinstallprompt event.
 * Shows an install banner after 3 visits if the user hasn't dismissed it.
 */
export function usePWAInstall() {
  const [prompt, setPrompt]         = useState(null)
  const [showBanner, setShowBanner] = useState(false)
  const [installed, setInstalled]   = useState(false)

  useEffect(() => {
    // Increment visit counter
    const visits = parseInt(localStorage.getItem('pw_visits') || '0', 10) + 1
    localStorage.setItem('pw_visits', String(visits))

    const dismissed = localStorage.getItem('pw_install_dismissed')

    // Check if already installed (in standalone mode)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    if (isStandalone) {
      setInstalled(true)
      return
    }

    const handler = (e) => {
      e.preventDefault()
      setPrompt(e)
      if (visits >= 3 && !dismissed) {
        setShowBanner(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => {
      setInstalled(true)
      setShowBanner(false)
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = async () => {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      setShowBanner(false)
      setInstalled(true)
    }
    setPrompt(null)
  }

  const dismiss = () => {
    setShowBanner(false)
    localStorage.setItem('pw_install_dismissed', '1')
  }

  return { showBanner, install, dismiss, installed }
}
