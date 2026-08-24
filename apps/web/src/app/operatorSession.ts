import { useSyncExternalStore } from 'react'

import {
  deleteServerOperatorProfileApi,
  loginServerOperatorApi,
  logoutServerOperatorApi,
  readServerOperatorProfilesApi,
  readServerSessionApi,
  resetServerOperatorPasswordApi,
  upsertServerOperatorProfileApi,
  updateServerSessionTaskApi,
} from '@pakti/api-client'
import type { OperatorProfile, OperatorRole, OperatorSession, WorkTask } from '@pakti/types'

type Listener = () => void

const OPERATOR_STORE_KEY = 'pakti.operatorStore'
const DEFAULT_NEW_USER_PASSWORD = 'user123'

type OperatorStoreCache = {
  session: OperatorSession | null
  profiles: OperatorProfile[]
  hydrated: boolean
}

function readOperatorStoreCache(): OperatorStoreCache {
  if (typeof window === 'undefined') {
    return {
      session: null,
      profiles: [],
      hydrated: false,
    }
  }

  const raw = window.sessionStorage.getItem(OPERATOR_STORE_KEY)
  if (!raw) {
    return {
      session: null,
      profiles: [],
      hydrated: false,
    }
  }

  try {
    const parsed = JSON.parse(raw) as Partial<OperatorStoreCache>
    return {
      session: parsed.session ?? null,
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      hydrated: Boolean(parsed.hydrated),
    }
  } catch {
    return {
      session: null,
      profiles: [],
      hydrated: false,
    }
  }
}

function writeOperatorStoreCache() {
  if (typeof window === 'undefined') {
    return
  }

  const payload: OperatorStoreCache = {
    session: currentSession,
    profiles: currentProfiles,
    hydrated: isHydrated,
  }

  window.sessionStorage.setItem(OPERATOR_STORE_KEY, JSON.stringify(payload))
}

const initialStore = readOperatorStoreCache()

let currentSession: OperatorSession | null = initialStore.session
let currentProfiles: OperatorProfile[] = initialStore.profiles
let isHydrated = initialStore.hydrated
let loadPromise: Promise<void> | null = null
let realtimeBridgeReady = false
let refreshQueue: number | null = null
const listeners = new Set<Listener>()

function emitChange() {
  writeOperatorStoreCache()
  for (const listener of listeners) {
    listener()
  }
}

async function loadServerState() {
  try {
    const [sessionResponse, profiles] = await Promise.all([readServerSessionApi(), readServerOperatorProfilesApi()])
    currentSession = sessionResponse.session
    currentProfiles = sortProfiles(dedupeProfiles(profiles))
  } catch {
    currentSession = null
    currentProfiles = []
  } finally {
    isHydrated = true
    emitChange()
  }
}

function scheduleServerStateRefresh() {
  if (typeof window === 'undefined') {
    return
  }

  if (refreshQueue !== null) {
    return
  }

  refreshQueue = window.setTimeout(() => {
    refreshQueue = null
    void loadServerState()
  }, 0)
}

function attachRealtimeBridgeListeners() {
  if (typeof window === 'undefined' || realtimeBridgeReady) {
    return
  }

  const refreshEvents = ['pakti:operators-updated', 'pakti:sessions-updated']

  for (const eventName of refreshEvents) {
    window.addEventListener(eventName, scheduleServerStateRefresh)
  }

  realtimeBridgeReady = true
}

function ensureHydrated() {
  attachRealtimeBridgeListeners()

  if (isHydrated || loadPromise) {
    return
  }

  loadPromise = loadServerState().finally(() => {
    loadPromise = null
  })
}

function sortProfiles(profiles: OperatorProfile[]) {
  return [...profiles].sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt))
}

function dedupeProfiles(profiles: OperatorProfile[]) {
  const seenNames = new Set<string>()
  const seenCodes = new Set<string>()

  return profiles.filter((profile) => {
    const nameKey = profile.operatorName.trim().toLowerCase()
    const codeKey = profile.operatorCode.trim().toLowerCase()

    if (seenNames.has(nameKey) || seenCodes.has(codeKey)) {
      return false
    }

    seenNames.add(nameKey)
    seenCodes.add(codeKey)
    return true
  })
}

function mergeProfile(profile: OperatorProfile) {
  currentProfiles = dedupeProfiles(
    sortProfiles([profile, ...currentProfiles.filter((existing) => !isSameProfile(existing, profile))]),
  ).slice(0, 12)
  emitChange()
}

function removeProfile(profile: Pick<OperatorProfile, 'operatorName' | 'operatorCode' | 'role'>) {
  currentProfiles = currentProfiles.filter((existing) => !isSameIdentity(existing, profile))
  emitChange()
}

function isSameIdentity(
  value: Pick<OperatorProfile, 'operatorName' | 'operatorCode' | 'role'>,
  profile: Pick<OperatorProfile, 'operatorName' | 'operatorCode' | 'role'>,
) {
  return (
    value.operatorName.trim().toLowerCase() === profile.operatorName.trim().toLowerCase() &&
    value.operatorCode.trim().toLowerCase() === profile.operatorCode.trim().toLowerCase() &&
    value.role === profile.role
  )
}

function isSameProfile(left: OperatorProfile, right: OperatorProfile) {
  return isSameIdentity(left, right)
}

export async function loginOperator(operatorName: string, password: string) {
  return authOperatorByUsername(operatorName, password)
}

export async function upsertOperatorProfile(
  operatorName: string,
  operatorCode: string,
  taskType: 'qc' | 'packing' = 'qc',
  isEditMode = false,
  password?: string,
  fullName: string | null = null,
  role: OperatorRole = 'operator',
  previousIdentity?: {
    operatorName: string
    operatorCode: string
    role: OperatorRole
  } | null,
) {
  const savedProfile = await upsertServerOperatorProfileApi({
    operatorName: operatorName.trim(),
    operatorCode: operatorCode.trim(),
    role,
    taskType,
    fullName,
    password: isEditMode ? undefined : password ?? DEFAULT_NEW_USER_PASSWORD,
  })

  const existingSession = currentSession
  const shouldUpdateCurrentSession =
    existingSession &&
    ((previousIdentity &&
      isSameIdentity(existingSession, {
        operatorName: previousIdentity.operatorName,
        operatorCode: previousIdentity.operatorCode,
        role: previousIdentity.role,
      })) ||
      isSameIdentity(existingSession, savedProfile))

  if (shouldUpdateCurrentSession) {
    currentSession = {
      operatorName: savedProfile.operatorName,
      operatorCode: savedProfile.operatorCode,
      role: savedProfile.role,
      taskType: savedProfile.taskType,
      loggedInAt: existingSession.loggedInAt,
    }
    emitChange()
  }

  mergeProfile(savedProfile)
  return savedProfile
}

export async function authOperator(
  operatorName: string,
  operatorCode: string,
  password: string,
  role: OperatorRole = 'operator',
) {
  const result = await loginServerOperatorApi({
    operatorName: operatorName.trim(),
    operatorCode: operatorCode.trim(),
    password: password.trim(),
    role,
  })

  currentSession = result.session
  mergeProfile(result.profile)
  emitChange()
  return result.session
}

export async function authOperatorByUsername(operatorName: string, password: string) {
  const result = await loginServerOperatorApi({
    operatorName: operatorName.trim(),
    password: password.trim(),
  })

  currentSession = result.session
  mergeProfile(result.profile)
  emitChange()
  return result.session
}

export function logoutOperator() {
  currentSession = null
  isHydrated = false
  currentProfiles = []
  loadPromise = null
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(OPERATOR_STORE_KEY)
      window.localStorage.removeItem(OPERATOR_STORE_KEY)
    } catch {}
  }
  emitChange()
  void logoutServerOperatorApi().catch(() => undefined)
}

export async function updateOperatorSessionTask(taskType: WorkTask) {
  if (!currentSession) {
    throw new Error('Sesi login belum aktif.')
  }

  const result = await updateServerSessionTaskApi(taskType)
  currentSession = result.session
  emitChange()
  return currentSession
}

export function getOperatorProfiles() {
  ensureHydrated()
  return currentProfiles
}

export async function removeOperatorProfile(
  operatorName: string,
  operatorCode: string,
  role: OperatorRole = 'operator',
) {
  await deleteServerOperatorProfileApi(operatorName, operatorCode, role)
  removeProfile({ operatorName, operatorCode, role })

  if (currentSession && isSameIdentity(currentSession, { operatorName, operatorCode, role })) {
    currentSession = null
    emitChange()
  }
}

export async function resetOperatorPassword(
  operatorName: string,
  operatorCode: string,
  password: string,
  role: OperatorRole = 'operator',
) {
  return updateOperatorPassword(operatorName, operatorCode, password, role)
}

export async function updateOperatorPassword(
  operatorName: string,
  operatorCode: string,
  password: string,
  role: OperatorRole = 'operator',
) {
  const updatedProfile = await resetServerOperatorPasswordApi(
    operatorName.trim(),
    operatorCode.trim(),
    role,
    password.trim(),
  )

  mergeProfile(updatedProfile)
  return updatedProfile
}

export function useOperatorProfiles() {
  return useSyncExternalStore(subscribe, getProfilesSnapshot, getServerProfilesSnapshot)
}

export function useOperatorSession() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function useOperatorStoreHydrated() {
  return useSyncExternalStore(subscribe, getHydrationSnapshot, getServerHydrationSnapshot)
}

export function getOperatorSession() {
  ensureHydrated()
  return currentSession
}

function getSnapshot() {
  ensureHydrated()
  return currentSession
}

function getServerSnapshot(): OperatorSession | null {
  return null
}

function getProfilesSnapshot() {
  ensureHydrated()
  return currentProfiles
}

function getServerProfilesSnapshot() {
  return []
}

function getHydrationSnapshot() {
  ensureHydrated()
  return isHydrated
}

function getServerHydrationSnapshot() {
  return false
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  ensureHydrated()
  return () => {
    listeners.delete(listener)
  }
}
