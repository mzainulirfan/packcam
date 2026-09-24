import { useCallback, useEffect, useState } from 'react'

import { readActivePackingSessionApi, readPendingShopeeChatSendsApi } from '@pakti/api-client'

export type NavBadges = {
  hasActivePackingSession: boolean
  pendingChatCount: number
}

const EMPTY_BADGES: NavBadges = {
  hasActivePackingSession: false,
  pendingChatCount: 0,
}

const REFRESH_EVENTS = ['pakti:sessions-updated', 'pakti:chat-sends-updated', 'pakti:shipping-chat-sends-updated']
const REFRESH_INTERVAL_MS = 30_000

export function useNavBadges(enabled: boolean) {
  const [badges, setBadges] = useState<NavBadges>(EMPTY_BADGES)
  const [wasEnabled, setWasEnabled] = useState(enabled)

  if (wasEnabled !== enabled) {
    setWasEnabled(enabled)
    if (!enabled) {
      setBadges(EMPTY_BADGES)
    }
  }

  const refresh = useCallback(async () => {
    if (!enabled) {
      setBadges(EMPTY_BADGES)
      return
    }

    try {
      const [activeSession, pendingChats] = await Promise.all([
        readActivePackingSessionApi().catch(() => null),
        readPendingShopeeChatSendsApi().catch(() => []),
      ])

      setBadges({
        hasActivePackingSession: activeSession !== null,
        pendingChatCount: Array.isArray(pendingChats) ? pendingChats.length : 0,
      })
    } catch {
      setBadges(EMPTY_BADGES)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return
    }

    let cancelled = false
    const runRefresh = () => {
      if (!cancelled) {
        void refresh()
      }
    }

    const immediate = window.setTimeout(runRefresh, 0)
    const timer = window.setInterval(runRefresh, REFRESH_INTERVAL_MS)

    const handleRefreshEvent = () => {
      void refresh()
    }

    for (const eventName of REFRESH_EVENTS) {
      window.addEventListener(eventName, handleRefreshEvent)
    }

    return () => {
      cancelled = true
      window.clearTimeout(immediate)
      window.clearInterval(timer)
      for (const eventName of REFRESH_EVENTS) {
        window.removeEventListener(eventName, handleRefreshEvent)
      }
    }
  }, [enabled, refresh])

  return badges
}
