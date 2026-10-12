import { useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { SiteFooter, SiteHeader } from '@/components/site/SiteChrome'
import { PLANS, SITE, TRIAL_DAYS, rupees } from '@/lib/site'
import { usePageTitle } from '@/lib/usePageTitle'

/**
 * Privacy policy and Terms of service (2026-10-12). English only, like the
 * bills: a legal text read in a translation nobody checked is worse than one
 * read in English. Written from what the app actually does — every claim here
 * is a fact recorded in CLAUDE.md (tenant isolation, the admin boundary, the
 * nightly backup, where the data is hosted). The user's decisions: 10-day
 * free trial, no refund once paid, data kept 30 days after leaving, courts in
 * Betul. To be read by the user's CA or lawyer before relying on it.
 */

const UPDATED = '12 October 2026'

export default function Legal({ doc }: { doc: 'privacy' | 'terms' }) {
  const { lang, t } = useLanguage()
  const { hash } = useLocation()
  usePageTitle(doc === 'privacy' ? 'Privacy policy — BuildSupply' : 'Terms of service — BuildSupply')

  // "/terms#refunds" from the footer: land on that part.
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
    else document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [doc, hash])

  return (
    <div className="min-h-app bg-surface text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-text">
          <ArrowLeft size={16} /> {t('site.legal.back')}
        </Link>
        {lang !== 'en' && <p className="mt-4 rounded-lg bg-accent-bg p-3 text-sm text-accent-text">{t('site.legal.english')}</p>}
        <article className="legal mt-6 rounded-2xl border border-border bg-card p-5 sm:p-8">
          {doc === 'privacy' ? <Privacy /> : <Terms />}
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}

function H1({ children }: { children: ReactNode }) {
  return (
    <>
      <h1 className="text-2xl font-bold sm:text-3xl">{children}</h1>
      <p className="mt-2 text-sm text-muted">Last updated: {UPDATED}</p>
    </>
  )
}

function H2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mt-8 scroll-mt-24 text-lg font-semibold">
      {children}
    </h2>
  )
}

function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-ink/90">{children}</p>
}

function UL({ children }: { children: ReactNode }) {
  return <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink/90">{children}</ul>
}

function ContactLines() {
  return (
    <UL>
      <li>
        Email: <a className="text-accent-text underline" href={`mailto:${SITE.email}`}>{SITE.email}</a>
      </li>
      <li>WhatsApp or phone: +91 {SITE.phone}</li>
      <li>{SITE.business}, {SITE.place}, India</li>
    </UL>
  )
}

function Privacy() {
  return (
    <>
      <H1>Privacy policy</H1>
      <P>
        This policy explains what information BuildSupply keeps, why, where it is kept and what you can ask us to do with it.
        BuildSupply is run from {SITE.place}, India. In this policy “we” means BuildSupply, a “supplier” is a shop using BuildSupply,
        and a “customer” is a supplier’s customer.
      </P>

      <H2>1. What we keep</H2>
      <P>
        <strong>About a supplier’s account:</strong> business name, owner’s name, email address, phone and personal mobile number, business
        address, GST number, UPI ID, logo, cover and product photos, shop page details, and the plan and subscription dates.
      </P>
      <P>
        <strong>What a supplier records in the app:</strong> their customers’ names, phone numbers, addresses and sites; bills, estimates,
        payments, advances and opening balances; materials, rates and stock; drivers’ names and phone numbers; and online orders.
      </P>
      <P>
        <strong>From customers who use a supplier’s links:</strong> the name, phone number, site and order details a customer types into an
        order form; whether they answered an estimate or confirmed a delivery; and, if a customer taps “Save” to keep their account on
        their phone, an anonymous sign-in that has no name, email or phone attached.
      </P>
      <P>
        <strong>Technical information:</strong> sign-in sessions kept on your own device; a record of actions taken in an account (for example
        “bill created”); and, to stop spam on order forms, a one-way coded value made from the sender’s internet address — the address
        itself is not stored.
      </P>

      <H2>2. Why we keep it</H2>
      <UL>
        <li>To run the app: make and show bills, balances, stock and orders.</li>
        <li>To show each customer their own account and orders when the supplier shares a link with them.</li>
        <li>To manage subscriptions, answer support requests and keep accounts secure.</li>
        <li>To stop spam and misuse of order forms.</li>
      </UL>
      <P>
        We do not sell information, show advertising, or send messages on anyone’s behalf. Every WhatsApp message and PDF is sent by the
        supplier, from their own phone, when they press send.
      </P>

      <H2>3. Who can see it</H2>
      <UL>
        <li>A supplier sees only their own customers, bills, payments, stock and orders. Other suppliers cannot see them.</li>
        <li>
          BuildSupply’s admin manages subscriptions and the shared material catalog. The admin can see a supplier’s account and contact
          details, but the system does not let the admin open a supplier’s customers, bills, payments or stock.
        </li>
        <li>A customer sees only their own account, through the link their supplier sent, and the supplier’s public shop details.</li>
        <li>We may share information if the law requires it.</li>
      </UL>

      <H2>4. The supplier’s customers</H2>
      <P>
        The information a supplier records about their customers is entered and controlled by the supplier; we keep it on their behalf.
        A customer who wants their details corrected or removed should first ask the supplier they buy from. They can also contact us
        and we will pass the request on.
      </P>

      <H2>5. Where it is stored, and the services we use</H2>
      <UL>
        <li>Database, sign-in and uploaded photos: Supabase, on servers in Singapore.</li>
        <li>The website and app files: Vercel.</li>
        <li>A backup copy, made every night: stored by BuildSupply on Microsoft OneDrive.</li>
        <li>
          Password safety check: when you choose a new password, the app checks whether it has appeared in a known data leak by sending
          only the first five characters of a coded form of it to the “Have I Been Pwned” service. The password itself never leaves your
          phone.
        </li>
        <li>WhatsApp, Google Maps and UPI apps are opened on your own phone when you tap them; their own policies apply there.</li>
      </UL>
      <P>
        Passwords are kept only in coded form by the sign-in service; we cannot read them. The 4-digit confirmation PIN is also kept only
        in coded form and is not included in backups.
      </P>

      <H2>6. How long we keep it</H2>
      <UL>
        <li>While a supplier’s account is active, we keep their information so the app can work.</li>
        <li>
          When a supplier stops using BuildSupply, or a free trial ends without a plan, the account is paused. The supplier can ask for a
          copy of their data within {SITE.dataKeptDays} days. After {SITE.dataKeptDays} days the account and its data are deleted.
        </li>
        <li>
          Copies inside backups made before the deletion are kept securely and used only to recover from a disaster, never to restore
          a deleted account’s data into the app.
        </li>
      </UL>

      <H2>7. Your rights</H2>
      <P>Under India’s Digital Personal Data Protection Act, 2023, you can ask us to:</P>
      <UL>
        <li>tell you what personal information we keep about you;</li>
        <li>correct or complete it;</li>
        <li>delete it, where we are not required to keep it;</li>
        <li>and you can raise a complaint with us, and with the Data Protection Board of India if you are not satisfied.</li>
      </UL>
      <P>Write to us using the details below. We will reply as soon as we can, and within 30 days.</P>

      <H2>8. Security</H2>
      <P>
        Each shop’s data is kept apart by rules in the database itself, not only in the app. Connections are encrypted (HTTPS). If a
        security problem ever affects your information, we will tell you and the authorities as the law requires.
      </P>

      <H2>9. Children</H2>
      <P>BuildSupply is for businesses. It is not meant for anyone under 18.</P>

      <H2>10. Changes</H2>
      <P>If we change this policy, we will update the date above, and tell suppliers about important changes on WhatsApp or in the app.</P>

      <H2>11. Contact and complaints</H2>
      <ContactLines />
    </>
  )
}

function Terms() {
  const basic = PLANS.find((p) => p.id === 'basic')!
  const pro = PLANS.find((p) => p.id === 'pro')!
  const yearly = PLANS.find((p) => p.id === 'yearly')!
  return (
    <>
      <H1>Terms of service</H1>
      <P>
        These terms apply when you use BuildSupply, a billing and khata app for building-material suppliers run from {SITE.place},
        India. By using BuildSupply you agree to them. If you use it for a business, you agree on that business’s behalf.
      </P>

      <H2>1. Your account</H2>
      <UL>
        <li>We create supplier accounts on request. Keep your password and PIN to yourself; you are responsible for what is done in your account.</li>
        <li>One account is for one business. The information you give us about your business must be true.</li>
        <li>Tell us straight away if you think someone else has used your account.</li>
      </UL>

      <H2>2. Free trial</H2>
      <P>
        A new supplier can use BuildSupply free for {TRIAL_DAYS} days. No payment is taken to start. When the trial ends, the account is
        paused until a plan is paid for.
      </P>

      <H2>3. Plans and payment</H2>
      <UL>
        <li>Basic: {rupees(basic.price)} a month — everything except online orders.</li>
        <li>Pro: {rupees(pro.price)} a month — everything, including online orders.</li>
        <li>Yearly: {rupees(yearly.price)} a year — everything in Pro, for 12 months.</li>
      </UL>
      <P>
        Plans are paid in advance, in Indian rupees, and are not renewed automatically: each period is paid for separately. We may change
        prices; a change applies from your next renewal, and we will tell you before it.
      </P>

      <H2 id="refunds">4. Cancellation and refunds</H2>
      <UL>
        <li>You can stop at any time by not renewing. Your plan keeps working until the end of the period you paid for.</li>
        <li>
          Payments are not refunded once made, including for part of a month or year. This is why every new supplier gets a free trial
          first: please use it to decide.
        </li>
        <li>If you were charged by mistake — for example, paid twice for the same period — tell us and we will return the extra amount.</li>
      </UL>

      <H2>5. Your business is your responsibility</H2>
      <P>
        BuildSupply helps you keep records. It is not a party to your sales. The prices, bills, GST, taxes, quality of goods, deliveries,
        returns and refunds between you and your customers are your responsibility, and so is checking that your bills meet the law. GST
        figures are calculated from the rates you set; check with your CA what your bills must show.
      </P>

      <H2>6. Acceptable use</H2>
      <UL>
        <li>Use BuildSupply only for lawful business.</li>
        <li>Do not try to reach another shop’s data, break the app’s security, or overload it.</li>
        <li>Send customers only messages they would expect from your shop.</li>
      </UL>

      <H2>7. Your data</H2>
      <P>
        The records you enter are yours. We use them only to run BuildSupply for you, as described in our{' '}
        <Link to="/privacy" className="text-accent-text underline">privacy policy</Link>. You can ask for a copy at any time. After you
        leave, we keep your data for {SITE.dataKeptDays} days so you can ask for a copy, then delete it.
      </P>

      <H2>8. Availability</H2>
      <P>
        We work to keep BuildSupply running and back it up every night, but we cannot promise it will never be interrupted or that no
        data could ever be lost. Keep your own copies of anything important, such as PDF statements.
      </P>

      <H2>9. Pausing or closing an account</H2>
      <P>
        We may pause an account if a plan is not paid, or if it is used against these terms. Where possible we will tell you first, on
        WhatsApp or by phone.
      </P>

      <H2>10. Limit of liability</H2>
      <P>
        As far as the law allows, BuildSupply is not responsible for indirect losses such as lost profit or business. Our total liability
        for any claim is limited to what you paid us in the three months before it.
      </P>

      <H2>11. Changes to these terms</H2>
      <P>If we change these terms, we will update the date above and tell suppliers about important changes before they apply.</P>

      <H2>12. Law and disputes</H2>
      <P>
        These terms are governed by the laws of India. Any dispute will be handled by the courts at {SITE.courts}. Please contact us first
        — most things can be sorted out with a phone call.
      </P>

      <H2>13. Contact</H2>
      <ContactLines />
    </>
  )
}
