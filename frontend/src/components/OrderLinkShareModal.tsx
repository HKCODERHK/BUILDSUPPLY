import { useState } from 'react'
import { ArrowLeft, LoaderCircle, QrCode as QrIcon } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { QrCode } from '@/components/QrCode'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { qrPngFile } from '@/lib/qr'
import { shareDocumentOnWhatsApp } from '@/lib/shareDocument'
import { shareOrderLinkText } from '@/lib/shareOrderLink'

/**
 * Share order link → "Link or QR?" The link goes out as text, as before. The QR
 * is the same link as a code: shown on the supplier's phone for a customer at
 * the counter to scan, or shared as an image to send or print for the shop.
 * One dialog with two steps — two dialogs in a row fight over the back-button
 * history entry (see modal.tsx).
 */
export function OrderLinkShareModal({ url, onClose }: { url: string; onClose: () => void }) {
  const { supplier } = useAuth()
  const { t } = useLanguage()
  const [step, setStep] = useState<'choose' | 'qr'>('choose')
  const [sharing, setSharing] = useState(false)
  const business = supplier?.business_name ?? ''
  const message = t('ord.shareMessage', { business, url })

  async function sendLink() {
    await shareOrderLinkText(message)
    onClose()
  }

  async function shareQr() {
    if (sharing) return
    setSharing(true)
    try {
      // Goes to customers, so in English like every document the app makes.
      const file = await qrPngFile({
        text: url,
        lines: [business, 'Scan to order'],
        caption: url.replace(/^https?:\/\//, ''),
        filename: 'order-qr.png',
      })
      await shareDocumentOnWhatsApp({ file, message, title: 'Order QR' })
    } finally {
      setSharing(false)
    }
  }

  return (
    <Modal title={t('ord.shareLink')} onClose={onClose}>
      {step === 'choose' ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">{t('ordShare.hint')}</p>
          <Button onClick={sendLink}>
            <WhatsAppIcon size={16} /> {t('ordShare.sendLink')}
          </Button>
          <Button variant="outline" onClick={() => setStep('qr')}>
            <QrIcon size={16} /> {t('ordShare.showQr')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-xl bg-white p-2">
            <QrCode text={url} size={240} label={t('ordShare.showQr')} />
          </div>
          <div>
            <div className="text-sm font-semibold text-ink">{business}</div>
            <div className="break-all text-xs text-muted">{url}</div>
          </div>
          <p className="text-xs text-muted">{t('ordShare.qrHint')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={shareQr} disabled={sharing}>
              {sharing ? <LoaderCircle size={14} className="animate-spin" /> : <WhatsAppIcon size={14} />} {t('ordShare.shareQr')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setStep('choose')}>
              <ArrowLeft size={14} /> {t('ordShare.back')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
