import type { Lang } from '@/lib/i18n'

/**
 * Dates and times as the customer pages show them, in the reader's own
 * language (#34) — "15 अक्टू॰ 2026", "शाम 7 बजे". On screen only: bills,
 * statements and every PDF stay English, as agreed. Digits stay 0–9 in all
 * three languages, so dates read like the money beside them.
 */
export function dateLocale(lang: Lang): string {
  return lang === 'hi' ? 'hi-IN' : lang === 'mr' ? 'mr-IN-u-nu-latn' : 'en-IN'
}

export function showDate(iso: string, lang: Lang, withYear = true): string {
  return new Date(iso).toLocaleDateString(dateLocale(lang), {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' as const } : {}),
  })
}

/**
 * "19:00" → "7 pm" / "शाम 7 बजे" / "संध्याकाळी 7 वाजता". The browser's own
 * Hindi and Marathi formats still say "pm", so the part of the day is ours.
 * In a range ("सुबह 9:30 – शाम 7") the "बजे / वाजता" is left off (oClock).
 */
export function showTime(hhmm: string, lang: Lang, oClock = true): string {
  const [h, m] = hhmm.split(':').map(Number)
  const h12 = h % 12 || 12
  const clock = m ? `${h12}:${String(m).padStart(2, '0')}` : `${h12}`
  if (lang === 'hi') {
    const part = h < 12 ? 'सुबह' : h < 16 ? 'दोपहर' : h < 20 ? 'शाम' : 'रात'
    return oClock ? `${part} ${clock} बजे` : `${part} ${clock}`
  }
  if (lang === 'mr') {
    const part = h < 12 ? 'सकाळी' : h < 16 ? 'दुपारी' : h < 20 ? 'संध्याकाळी' : 'रात्री'
    return oClock ? `${part} ${clock} वाजता` : `${part} ${clock}`
  }
  return `${clock} ${h < 12 ? 'am' : 'pm'}`
}
