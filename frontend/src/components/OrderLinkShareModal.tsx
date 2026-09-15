import { useState } from 'react'
import { ArrowLeft, LoaderCircle, QrCode as QrIcon, X } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { QrCode } from '@/components/QrCode'
import { CustomerAvatar } from '@/components/CustomerAvatar'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { orderQrPngFile } from '@/lib/qr'
import { PATTERN_GREEN, patternCssUrl } from '@/lib/qrPattern'
import { shareDocumentOnWhatsApp } from '@/lib/shareDocument'
import { shareOrderLinkText } from '@/lib/shareOrderLink'

/**
 * Share order link → "Link or QR?" The link goes out as text, as before. The QR
 * is the same link as a code: shown on the supplier's phone for a customer at
 * the counter to scan, or shared as an image to send or print for the shop.
 * One dialog with two steps — two dialogs in a row fight over the back-button
 * history entry (see modal.tsx).
 *
 * The QR step fills the screen, Telegram-style: the code on a white card with
 * the business's logo (or initials) over its top edge, on a green ground
 * tiled with faint building-trade doodles. The shared image is drawn the same
 * way (orderQrPngFile), so what gets printed for the counter matches.
 */
export function OrderLinkShareModal({
  url,
  onClose,
  initialStep = 'choose',
}: {
  url: string
  onClose: () => void
  /** 'qr': open straight on the QR — a long-press on the Dashboard's logo. */
  initialStep?: 'choose' | 'qr'
}) {
  const { supplier } = useAuth()
  const { t } = useLanguage()
  const [step, setStep] = useState<'choose' | 'qr'>(initialStep)
  const [sharing, setSharing] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const business = supplier?.business_name ?? ''
  const message = t('ord.shareMessage', { business, url })
  const logo = !logoFailed ? supplier?.logo_url : null
  const shortUrl = url.replace(/^https?:\/\//, '')

  async function sendLink() {
    await shareOrderLinkText(message)
    onClose()
  }

  async function shareQr() {
    if (sharing) return
    setSharing(true)
    try {
      // Goes to customers, so in English like every document the app makes.
      const file = await orderQrPngFile({
        url,
        business,
        logoUrl: supplier?.logo_url ?? null,
        initialsKey: supplier?.id ?? business,
      })
      await shareDocumentOnWhatsApp({ file, message, title: 'Order QR' })
    } finally {
      setSharing(false)
    }
  }

  return (
    <Modal title={t('ord.shareLink')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted">{t('ordShare.hint')}</p>
        <Button onClick={sendLink}>
          <WhatsAppIcon size={16} /> {t('ordShare.sendLink')}
        </Button>
        <Button variant="outline" onClick={() => setStep('qr')}>
          <QrIcon size={16} /> {t('ordShare.showQr')}
        </Button>
      </div>

      {step === 'qr' && (
        // Inside the dialog's own layer (so the share prompt, mounted later,
        // still opens above it), covering the whole screen.
        <div
          className="fixed inset-0 z-10 flex flex-col items-center overflow-y-auto px-5 text-center"
          style={{
            paddingTop: 'calc(0.75rem + var(--safe-top))',
            paddingBottom: 'calc(1.5rem + var(--safe-bottom))',
            backgroundImage: `${patternCssUrl()}, linear-gradient(160deg, ${PATTERN_GREEN.join(', ')})`,
          }}
        >
          <div className="flex w-full max-w-sm items-center justify-between">
            <button
              type="button"
              onClick={() => setStep('choose')}
              aria-label={t('ordShare.back')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
            >
              <ArrowLeft size={20} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
            >
              <X size={20} />
            </button>
          </div>

          <div className="relative mt-14 w-full max-w-[320px] rounded-3xl bg-white px-6 pb-6 pt-14 shadow-2xl">
            <div className="absolute -top-10 left-1/2 flex h-20 w-20 -translate-x-1/2 items-center justify-center overflow-hidden rounded-full bg-white ring-4 ring-white shadow-lg">
              {logo ? (
                <img src={logo} alt="" onError={() => setLogoFailed(true)} className="h-full w-full object-cover" />
              ) : (
                <CustomerAvatar id={supplier?.id ?? business} name={business} size={80} />
              )}
            </div>
            <QrCode text={url} size={260} label={t('ordShare.showQr')} />
            <div className="mt-2 break-words text-lg font-bold leading-tight text-[#1F7A45]">{business}</div>
            <div className="mt-1 text-sm font-semibold text-neutral-700">{t('ordShare.scanToOrder')}</div>
            <div className="mt-1 break-all text-xs text-neutral-500">{shortUrl}</div>
          </div>

          <p className="mt-5 max-w-[320px] text-xs text-white/85">{t('ordShare.qrHint')}</p>

          {/* Pushes Share to the bottom on a tall phone, and keeps a gap on a short one. */}
          <div className="min-h-6 flex-1" />
          <button
            type="button"
            onClick={shareQr}
            disabled={sharing}
            className="flex h-12 w-full max-w-[320px] shrink-0 items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-[#1F7A45] shadow-lg disabled:opacity-70"
          >
            {sharing ? <LoaderCircle size={16} className="animate-spin" /> : <WhatsAppIcon size={16} />} {t('ordShare.shareQr')}
          </button>
        </div>
      )}
    </Modal>
  )
}
