import { useRef, useState, type ChangeEvent } from 'react'
import { Trash2, UserRound } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { ProfileHero } from '@/components/ProfileHero'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { removeShopImage, replaceShopImage, saveOwnerProfile } from '@/services/shopPage'

/** "98220 12345", easier to read; anything else as it was typed. */
function mobileText(mobile: string): string {
  return /^\d{10}$/.test(mobile) ? `${mobile.slice(0, 5)} ${mobile.slice(5)}` : mobile
}

/**
 * Settings → Owner profile (migration 043): the owner, apart from the
 * business. Since 2026-10-27 it opens like the Profile tab (ProfileHero, after
 * the user's Snapchat reference): the shop's cover, the owner's own photo —
 * the pencil on it picks a new one — their name and mobile. The name and the
 * personal mobile stay private — customers never get them; the BuildSupply
 * admin can see the mobile. The photo is shown to customers beside the shop's
 * name.
 */
export function YourProfileCard() {
  const { supplier, refreshSupplier } = useAuth()
  const { t } = useLanguage()
  const [name, setName] = useState(supplier?.owner_name ?? '')
  const [mobile, setMobile] = useState(supplier?.owner_mobile ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  if (!supplier || supplier.role !== 'supplier' || !('owner_mobile' in supplier)) return null
  const me = supplier

  async function save() {
    if (saving) return
    if (mobile && mobile.length !== 10) {
      setError(t('me.invalid'))
      return
    }
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await saveOwnerProfile(me.id, { owner_name: name.trim() || null, owner_mobile: mobile || null, owner_photo_url: me.owner_photo_url ?? null })
      await refreshSupplier()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error && err.message === 'owner-invalid' ? t('me.invalid') : t('error.generic'))
    } finally {
      setSaving(false)
    }
  }

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || photoBusy) return
    setPhotoBusy(true)
    setError(null)
    try {
      await replaceShopImage(me.id, file, 'owner', me.owner_photo_url, async (url) => {
        await saveOwnerProfile(me.id, { owner_name: me.owner_name, owner_mobile: me.owner_mobile ?? null, owner_photo_url: url })
      })
      await refreshSupplier()
    } catch (err) {
      setError(err instanceof Error && err.message === 'not-image' ? t('shop.notImage') : t('error.generic'))
    } finally {
      setPhotoBusy(false)
    }
  }

  async function clearPhoto() {
    if (photoBusy) return
    setPhotoBusy(true)
    try {
      await saveOwnerProfile(me.id, { owner_name: me.owner_name, owner_mobile: me.owner_mobile ?? null, owner_photo_url: null })
      await removeShopImage(me.id, me.owner_photo_url)
      await refreshSupplier()
    } catch {
      setError(t('error.generic'))
    } finally {
      setPhotoBusy(false)
    }
  }

  return (
    <div className="max-w-lg">
      <ProfileHero
        cover={me.cover_url}
        photo={me.owner_photo_url}
        fallback={<UserRound size={36} strokeWidth={1.5} className="text-gray-400" />}
        title={me.owner_name || t('prof.ownerNoName')}
        subtitle={me.owner_mobile ? mobileText(me.owner_mobile) : null}
        onPhoto={() => input.current?.click()}
        photoLabel={me.owner_photo_url ? t('shop.changePhoto') : t('shop.choosePhoto')}
        busy={photoBusy}
      />
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick} />
      {me.owner_photo_url && (
        <button
          type="button"
          onClick={clearPhoto}
          disabled={photoBusy}
          className="mt-3 inline-flex items-center gap-1.5 py-1 text-xs font-semibold text-muted hover:text-ink disabled:opacity-50"
        >
          <Trash2 size={13} /> {t('shop.removePhoto')}
        </button>
      )}

      <Card className="mt-4">
        <p className="mb-4 text-xs text-muted">{t('me.hint')}</p>
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="owner-name">{t('me.name')}</Label>
            <Input
              id="owner-name"
              maxLength={80}
              autoComplete="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setSaved(false)
              }}
            />
          </div>
          <div>
            <Label htmlFor="owner-mobile">{t('me.mobile')}</Label>
            <PhoneInput
              id="owner-mobile"
              value={mobile}
              onValueChange={(v) => {
                setMobile(v)
                setSaved(false)
                setError(null)
              }}
            />
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving || photoBusy}>
              {saving ? t('common.saving') : t('me.save')}
            </Button>
            {saved && <span className="text-xs text-accent">{t('set.saved')}</span>}
          </div>
        </div>
      </Card>
    </div>
  )
}
