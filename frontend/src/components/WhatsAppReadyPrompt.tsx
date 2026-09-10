import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { setWhatsAppTapHandler } from '@/lib/whatsapp'
import { useLanguage } from '@/context/LanguageContext'

/**
 * Shown only when a PDF took so long to prepare that the browser would no
 * longer let the original tap open WhatsApp — see setWhatsAppTapHandler. The
 * button is a new tap, which it will.
 */
export function WhatsAppReadyPrompt() {
  const { t } = useLanguage()
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    setWhatsAppTapHandler(setUrl)
    return () => setWhatsAppTapHandler(null)
  }, [])

  if (!url) return null

  return (
    // No history entry: this usually opens over the payment dialog, and two
    // stacked dialogs both listening for back close together (modal.tsx).
    <Modal title={t('share.readyTitle')} onClose={() => setUrl(null)} captureBack={false}>
      <p className="mb-4 text-sm text-muted">{t('share.readyBody')}</p>
      <Button
        className="w-full"
        onClick={() => {
          window.open(url, '_blank', 'noopener,noreferrer')
          setUrl(null)
        }}
      >
        <WhatsAppIcon size={16} /> {t('share.openWhatsApp')}
      </Button>
    </Modal>
  )
}
