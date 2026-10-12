import { BrandMark } from '@/components/BrandMark'
import { cn } from '@/lib/utils'

/**
 * The BuildSupply badge at the very end of every customer-facing page
 * (2026-10-12, the user's request): a small arch — curved top, flat base —
 * centred under the content, holding the BuildSupply mark in quiet colours.
 *
 * It sits in the page's flow, never fixed, as the last thing inside the
 * page's `<main>`. With `mt-auto` in a full-height column it rests at the
 * bottom of a short page; on a long one it is what you reach by scrolling to
 * the end. Inside `<main>` means the page's own bottom padding — the room it
 * keeps for a floating tab bar — stays below it, so the bar never covers it.
 *
 * Deliberately smaller and paler than anything of the shop's: the shop's
 * logo, name and colours stay the page's identity. One per page — the khata
 * page carries it, and /me adds it only on its own screens, never around the
 * khata page it embeds.
 */
export function BuildSupplyFooter({ className }: { className?: string }) {
  return (
    <footer className={cn('mt-auto flex justify-center pt-10', className)} aria-label="BuildSupply">
      <div className="flex items-center rounded-b-2xl rounded-t-[999px] border border-border bg-card/70 px-7 pb-2.5 pt-4 text-muted shadow-sm">
        <BrandMark size={18} textClassName="text-sm text-muted" />
      </div>
    </footer>
  )
}
