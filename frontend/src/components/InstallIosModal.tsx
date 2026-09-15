import type { ReactNode } from 'react'
import { Share, SquarePlus } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/LanguageContext'

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  )
}

/**
 * "Install app" on an iPhone or iPad: Safari has no install button a page can
 * press, so this shows the three taps that put BuildSupply on the home screen.
 */
export function InstallIosModal({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  return (
    <Modal title={t('install.title')} onClose={onClose}>
      <ol className="flex flex-col gap-4 text-sm text-ink">
        <Step n={1}>
          {t('install.ios1')} <Share size={16} className="inline -translate-y-0.5 text-accent" aria-hidden />
        </Step>
        <Step n={2}>
          {t('install.ios2')} <SquarePlus size={16} className="inline -translate-y-0.5 text-accent" aria-hidden />
        </Step>
        <Step n={3}>{t('install.ios3')}</Step>
      </ol>
      <Button className="mt-5 w-full" onClick={onClose}>
        {t('common.done')}
      </Button>
    </Modal>
  )
}
