import { useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getPlatformSettings, updatePlatformSettings } from '@/services/platformSettings'
import type { PlatformSettings } from '@/lib/database.types'

export default function AdminPlatformSettings() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getPlatformSettings()
      .then(setSettings)
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    setSaved(false)
    try {
      const updated = await updatePlatformSettings({
        platform_name: settings.platform_name,
        default_currency: settings.default_currency,
        default_gst_rate: settings.default_gst_rate,
        default_subscription_days: settings.default_subscription_days,
      })
      setSettings(updated)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !settings) return <p className="text-sm text-muted">Loading…</p>

  return (
    <div>
      <PageHeader title="Platform Settings" subtitle="Defaults applied across BuildSupply" />

      <Card className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="platform_name">Platform name</Label>
            <Input
              id="platform_name"
              value={settings.platform_name}
              onChange={(e) => setSettings({ ...settings, platform_name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="currency">Default currency</Label>
            <Input
              id="currency"
              value={settings.default_currency}
              onChange={(e) => setSettings({ ...settings, default_currency: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="gst">Default GST rate (%)</Label>
            <Input
              id="gst"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={settings.default_gst_rate}
              onChange={(e) => setSettings({ ...settings, default_gst_rate: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label htmlFor="days">Default subscription length (days)</Label>
            <Input
              id="days"
              type="number"
              min="1"
              value={settings.default_subscription_days}
              onChange={(e) => setSettings({ ...settings, default_subscription_days: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            {saved && <span className="text-xs text-accent">Saved!</span>}
          </div>
        </form>
      </Card>
    </div>
  )
}
