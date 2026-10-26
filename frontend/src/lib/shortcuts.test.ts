import { describe, it, expect } from 'vitest'
import { SHORTCUT_TARGETS, launchedFromShortcut } from './shortcuts'
import manifestText from '../../public/manifest.webmanifest?raw'

describe('long-press shortcuts', () => {
  it('every shortcut in the manifest lands on a /go/ address the app knows', () => {
    const manifest = JSON.parse(manifestText)
    const urls: string[] = manifest.shortcuts.map((s: { url: string }) => s.url)
    // Chrome on Android shows three; a fourth would never appear on a phone.
    expect(urls.length).toBeLessThanOrEqual(3)
    for (const url of urls) {
      const name = url.match(/^\/go\/([a-z]+)$/)?.[1]
      expect(name && SHORTCUT_TARGETS[name], url).toBeTruthy()
    }
  })

  it('knows a shortcut launch, and the first shortcut’s old address', () => {
    expect(launchedFromShortcut({ pathname: '/go/bill', search: '' })).toBe(true)
    expect(launchedFromShortcut({ pathname: '/dashboard', search: '?send=details' })).toBe(true)
    expect(launchedFromShortcut({ pathname: '/dashboard', search: '' })).toBe(false)
    expect(launchedFromShortcut({ pathname: '/invoices/new', search: '' })).toBe(false)
  })
})
