import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { setSharePresenter, type PendingShare, type ShareOutcome } from '@/lib/shareDocument'
import { useLanguage } from '@/context/LanguageContext'

/**
 * Finishes a PDF share that could not open the share sheet by itself — see
 * shareDocument. 'ready' when the tap that started it expired while the PDF
 * was being made: the button here is a fresh tap. 'unsupported' when this
 * browser cannot hand a file to WhatsApp at all.
 */
export function ShareDocumentPrompt() {
  const { t } = useLanguage()
  const [pending, setPending] = useState<PendingShare | null>(null)

  useEffect(() => {
    setSharePresenter(setPending)
    return () => setSharePresenter(null)
  }, [])

  if (!pending) return null
  const current = pending

  function close(outcome: ShareOutcome) {
    current.finish(outcome)
    setPending(null)
  }

  // No history entries: these usually open over the payment dialog, and two
  // stacked dialogs both listening for back close together (modal.tsx).
  if (current.kind === 'unsupported') {
    return (
      <Modal title={t('share.unsupportedTitle')} onClose={() => close('unsupported')} captureBack={false}>
        <p className="mb-4 text-sm text-muted">{t('share.unsupportedBody')}</p>
        <Button className="w-full" onClick={() => close('unsupported')}>
          {t('share.understood')}
        </Button>
      </Modal>
    )
  }

  return (
    <Modal title={t('share.readyTitle')} onClose={() => close('cancelled')} captureBack={false}>
      <p className="text-sm font-semibold text-ink">{current.title}</p>
      <p className="mt-1 mb-4 text-sm text-muted">{t('share.readyBody')}</p>
      <Button
        className="w-full"
        onClick={() => {
          // share() has to start inside this tap, before anything awaits.
          const result = current.share()
          setPending(null)
          void result.then((outcome) =>
            outcome === 'unsupported' ? setPending({ ...current, kind: 'unsupported' }) : current.finish(outcome),
          )
        }}
      >
        <WhatsAppIcon size={16} /> {t('common.sendWhatsApp')}
      </Button>
    </Modal>
  )
}
