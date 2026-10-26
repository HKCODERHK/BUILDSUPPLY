import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TruckLoader } from '@/components/TruckLoader'
import { SHORTCUT_TARGETS } from '@/lib/shortcuts'

/**
 * Where a long-press shortcut lands (/go/bill, /go/payment, /go/details — see
 * lib/shortcuts.ts). It puts the Dashboard underneath and the shortcut's
 * screen on top, so back from a new bill returns to the Dashboard instead of
 * closing the app. Shop details open on the Dashboard itself; an unknown
 * shortcut, from some future version, simply opens the Dashboard.
 */
export function GoShortcut() {
  const { action = '' } = useParams()
  const navigate = useNavigate()
  // Once only, even where React runs an effect twice in development.
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true
    const to = SHORTCUT_TARGETS[action] ?? '/dashboard'
    if (to.startsWith('/dashboard')) {
      navigate(to, { replace: true })
      return
    }
    navigate('/dashboard', { replace: true })
    navigate(to)
  }, [action, navigate])

  return <TruckLoader />
}
