import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  Cancel01Icon,
  Copy01Icon,
  Delete02Icon,
  DollarCircleIcon,
  Download01Icon,
  Edit02Icon,
  Package01Icon,
  RefreshIcon,
  Search01Icon,
  SentIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { cancelPackerAdjustmentApi, cancelPackingPaymentDraftApi, closePackingSessionApi, confirmPackingPaymentDraftApi, createPackerAdjustmentApi, createPackingPaymentApi, createPackingPaymentDraftApi, deletePackingSessionApi, mergePackingSessionsApi, readPackerAdjustmentsApi, readPackingPaymentDraftsApi, readPackingSessionsApi } from '@pakti/api-client'
import type { PackerAdjustment, PackingPayment, PackingPaymentDraft, PackingWorkSession } from '@pakti/types'
import { downloadTextFile } from '@pakti/shared'
import { navigateTo, navigateToPackingSessionDetail } from '../app/uiState'
import { getPackingSessionDetailPath } from '../app/navigation'

function getJakartaDateKey(iso: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

export function PackingSessionsPage() {
  const [sessions, setSessions] = useState<PackingWorkSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed' | 'cancelled'>('all')
  const [packerFilter, setPackerFilter] = useState<string>('all')
  const [paidFilter, setPaidFilter] = useState<'all' | 'unpaid' | 'paid'>('unpaid')
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(() => new Set())
  const [showPayDialog, setShowPayDialog] = useState(false)
  const [payMethod, setPayMethod] = useState<'cash' | 'transfer' | 'other'>('cash')
  const [payNote, setPayNote] = useState('')
  const [payAdjustments, setPayAdjustments] = useState<Array<{ id: string; kind: 'add' | 'deduct'; label: string; amount: string }>>([])
  const [payBusy, setPayBusy] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [draftBusy, setDraftBusy] = useState(false)
  const [drafts, setDrafts] = useState<PackingPaymentDraft[]>([])
  const [draftsLoading, setDraftsLoading] = useState(false)
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null)
  const [pendingLedger, setPendingLedger] = useState<PackerAdjustment[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [checkedLedgerIds, setCheckedLedgerIds] = useState<Set<string>>(() => new Set())
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [showLedgerDialog, setShowLedgerDialog] = useState(false)
  const [ledgerBusy, setLedgerBusy] = useState(false)
  const [ledgerError, setLedgerError] = useState<string | null>(null)
  const [ledgerFieldErrors, setLedgerFieldErrors] = useState<{ packer?: string; label?: string; amount?: string }>({})
  const [highlightLedgerId, setHighlightLedgerId] = useState<string | null>(null)
  const [ledgerPacker, setLedgerPacker] = useState('all')
  const [ledgerKind, setLedgerKind] = useState<'add' | 'deduct'>('deduct')
  const [ledgerLabel, setLedgerLabel] = useState('')
  const [ledgerAmount, setLedgerAmount] = useState('')
  const [ledgerNote, setLedgerNote] = useState('')
  const [lastPayment, setLastPayment] = useState<PackingPayment | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [shareDraft, setShareDraft] = useState<{ title: string; text: string } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const pendingSectionRef = useRef<HTMLElement | null>(null)
  const daftarSectionRef = useRef<HTMLElement | null>(null)
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const headerMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!headerMenuRef.current?.contains(e.target as Node)) setShowHeaderMenu(false)
    }
    if (showHeaderMenu) document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [showHeaderMenu])
  const [pendingFlash, setPendingFlash] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{
    title: string
    body: string
    confirmLabel: string
    danger?: boolean
    busy?: boolean
    onConfirm: () => void | Promise<void>
  } | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [data, draftList, ledger] = await Promise.all([
        readPackingSessionsApi(100),
        readPackingPaymentDraftsApi('draft', 50).catch(() => [] as PackingPaymentDraft[]),
        readPackerAdjustmentsApi({ status: 'pending', limit: 100 }).catch(() => [] as PackerAdjustment[]),
      ])
      setSessions(data as PackingWorkSession[])
      setDrafts(draftList as PackingPaymentDraft[])
      setPendingLedger(ledger as PackerAdjustment[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat sesi packing.')
    } finally {
      setLoading(false)
    }
  }

  async function refreshPending() {
    setDraftsLoading(true)
    setLedgerLoading(true)
    try {
      const [draftList, ledger] = await Promise.all([
        readPackingPaymentDraftsApi('draft', 50).catch(() => [] as PackingPaymentDraft[]),
        readPackerAdjustmentsApi({ status: 'pending', limit: 100 }).catch(() => [] as PackerAdjustment[]),
      ])
      setDrafts(draftList as PackingPaymentDraft[])
      setPendingLedger(ledger as PackerAdjustment[])
    } finally {
      setDraftsLoading(false)
      setLedgerLoading(false)
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [])

  const packerOptions = useMemo(() => {
    const map = new Map<string, { name: string; code: string; label: string }>()
    for (const s of sessions) {
      const key = `${s.packerOperatorName}::${s.packerOperatorCode}`
      if (!map.has(key)) {
        map.set(key, { name: s.packerOperatorName, code: s.packerOperatorCode, label: `${s.packerNameSnapshot} (${s.packerCodeSnapshot})` })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [sessions])

  const lockedSessionDraftNo = useMemo(() => {
    const map = new Map<string, { draftNo: string; draftId: string }>()
    for (const draft of drafts) {
      if (draft.status !== 'draft') continue
      for (const sid of draft.sessionIds) {
        if (!map.has(sid)) map.set(sid, { draftNo: draft.draftNo, draftId: draft.id })
      }
    }
    return map
  }, [drafts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sessions.filter((s) => {
      const draftNo = lockedSessionDraftNo.get(s.id)?.draftNo ?? ''
      const matchesSearch = !q || `${s.packerNameSnapshot} ${s.packerCodeSnapshot} ${s.id} ${draftNo}`.toLowerCase().includes(q)
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter
      const matchesPacker = packerFilter === 'all' || `${s.packerOperatorName}::${s.packerOperatorCode}` === packerFilter
      const isPaid = Boolean(s.paidAt)
      const matchesPaid = paidFilter === 'all' || (paidFilter === 'paid' ? isPaid : !isPaid)
      return matchesSearch && matchesStatus && matchesPacker && matchesPaid
    })
  }, [sessions, search, statusFilter, packerFilter, paidFilter, lockedSessionDraftNo])

  const groupedSessions = useMemo(() => {
    const map = new Map<string, { key: string; name: string; code: string; sessions: PackingWorkSession[]; totalPaket: number; totalUpah: number; paidSessions: number; unpaidSessions: number; lockedSessions: number }>()

    for (const session of filtered) {
      const key = `${session.packerOperatorName}::${session.packerOperatorCode}`
      const group = map.get(key) ?? {
        key,
        name: session.packerNameSnapshot,
        code: session.packerCodeSnapshot,
        sessions: [],
        totalPaket: 0,
        totalUpah: 0,
        paidSessions: 0,
        unpaidSessions: 0,
        lockedSessions: 0,
      }
      group.sessions.push(session)
      group.totalPaket += session.completedPackingCount ?? 0
      group.totalUpah += session.totalPayAmount ?? 0
      if (session.paidAt) group.paidSessions += 1
      else group.unpaidSessions += 1
      if (lockedSessionDraftNo.has(session.id)) group.lockedSessions += 1
      map.set(key, group)
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [filtered, lockedSessionDraftNo])

  const totals = useMemo(() => {
    const selectedSessions = selectedSessionIds.size > 0
      ? filtered.filter((s) => selectedSessionIds.has(s.id))
      : filtered
    const totalPaket = selectedSessions.reduce((acc, s) => acc + (s.completedPackingCount ?? 0), 0)
    const totalUpah = selectedSessions.reduce((acc, s) => acc + (s.totalPayAmount ?? 0), 0)
    const paidSessions = selectedSessions.filter((s) => Boolean(s.paidAt)).length
    const unpaidSessions = selectedSessions.length - paidSessions
    return {
      paidSessions,
      unpaidSessions,
      selectedSessions,
      totalPaket,
      totalUpah,
    }
  }, [filtered, selectedSessionIds])

  const lockedSummary = useMemo(() => {
    const draftIds = new Set<string>()
    let count = 0
    for (const draft of drafts) {
      if (draft.status !== 'draft') continue
      draftIds.add(draft.id)
      count += draft.sessionIds.length
    }
    return { sessionCount: count, draftCount: draftIds.size }
  }, [drafts])

  const pendingTotals = useMemo(() => {
    const draftEstimasi = drafts.reduce((acc, d) => acc + (d.estimatedTotal ?? 0), 0)
    let kasbon = 0
    let bonus = 0
    for (const item of pendingLedger) {
      if (item.kind === 'add') bonus += item.amount
      else kasbon += item.amount
    }
    return { draftEstimasi, kasbon, bonus, ledgerNet: bonus - kasbon }
  }, [drafts, pendingLedger])

  function scrollToPending(draftId?: string | null) {
    if (draftId) setExpandedDraftId(draftId)
    pendingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setPendingFlash(true)
    window.setTimeout(() => setPendingFlash(false), 1600)
  }

  function askConfirm(action: NonNullable<typeof confirmAction>) {
    setConfirmAction({ ...action, busy: false })
  }

  async function runConfirmAction() {
    if (!confirmAction || confirmAction.busy) return
    setConfirmAction((current) => (current ? { ...current, busy: true } : current))
    try {
      await confirmAction.onConfirm()
    } finally {
      setConfirmAction(null)
    }
  }

  function isPayableSession(s: PackingWorkSession) {
    return s.status === 'closed' && !s.paidAt && !s.paymentId && !lockedSessionDraftNo.has(s.id)
  }

  function selectPayableSessions() {
    setSelectedSessionIds(new Set(filtered.filter(isPayableSession).map((s) => s.id)))
  }

  function deselectInvalidSessions() {
    setSelectedSessionIds((current) => {
      const next = new Set<string>()
      for (const id of current) {
        const s = filtered.find((row) => row.id === id)
        if (s && isPayableSession(s)) next.add(id)
      }
      return next
    })
  }

  async function handleCloseSessionInline(id: string) {
    try {
      const updated = await closePackingSessionApi(id)
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? (updated as PackingWorkSession) : s)))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menutup sesi.')
    }
  }

  const canDeleteSession = useCallback((s: PackingWorkSession) => {
    return s.status === 'closed' && (s.completedPackingCount ?? 0) === 0 && !s.paidAt && !s.paymentId && !lockedSessionDraftNo.has(s.id)
  }, [lockedSessionDraftNo])

  const payPreview = useMemo(() => {
    const ids = Array.from(selectedSessionIds)
    if (ids.length === 0) return null
    const selectedRows = filtered.filter((s) => selectedSessionIds.has(s.id))
    if (selectedRows.length === 0) return null
    const first = selectedRows[0]
    const mixedPacker = selectedRows.some((s) => s.packerOperatorName !== first.packerOperatorName || s.packerOperatorCode !== first.packerOperatorCode)
    const notClosed = selectedRows.filter((s) => s.status !== 'closed')
    const alreadyPaid = selectedRows.filter((s) => Boolean(s.paidAt))
    const locked = selectedRows.filter((s) => lockedSessionDraftNo.has(s.id))
    return {
      count: selectedRows.length,
      packerLabel: `${first.packerNameSnapshot} (${first.packerCodeSnapshot})`,
      packerKey: `${first.packerOperatorName}::${first.packerOperatorCode}`,
      mixedPacker,
      notClosedCount: notClosed.length,
      alreadyPaidCount: alreadyPaid.length,
      lockedCount: locked.length,
      totalPaket: selectedRows.reduce((acc, s) => acc + (s.completedPackingCount ?? 0), 0),
      totalUpah: selectedRows.reduce((acc, s) => acc + (s.totalPayAmount ?? 0), 0),
      sessions: selectedRows,
      valid: !mixedPacker && notClosed.length === 0 && alreadyPaid.length === 0 && locked.length === 0,
    }
  }, [filtered, selectedSessionIds, lockedSessionDraftNo])

  const deletePreview = useMemo(() => {
    const selectedRows = filtered.filter((s) => selectedSessionIds.has(s.id))
    const deletable = selectedRows.filter(canDeleteSession)
    return {
      selected: selectedRows,
      deletable,
      invalidCount: selectedRows.length - deletable.length,
    }
  }, [filtered, selectedSessionIds, canDeleteSession])

  function parseAdjustmentAmount(raw: string) {
    const digits = raw.replace(/[^0-9]/g, '')
    if (!digits) return 0
    const value = Number(digits)
    return Number.isFinite(value) ? Math.floor(value) : 0
  }

  const payLedgerOptions = useMemo(() => {
    if (!payPreview || payPreview.mixedPacker) return [] as PackerAdjustment[]
    return pendingLedger.filter((item) => `${item.packerOperatorName}::${item.packerOperatorCode}` === payPreview.packerKey)
  }, [pendingLedger, payPreview])

  const payAdjustmentSummary = useMemo(() => {
    const items = payAdjustments.map((item) => {
      const amount = parseAdjustmentAmount(item.amount)
      return { ...item, parsedAmount: amount, signed: item.kind === 'add' ? amount : -amount }
    })
    const manualTotal = items.reduce((acc, item) => acc + (item.label.trim() && item.parsedAmount > 0 ? item.signed : 0), 0)
    const ledgerChecked = payLedgerOptions.filter((item) => checkedLedgerIds.has(item.id))
    const ledgerTotal = ledgerChecked.reduce((acc, item) => acc + (item.kind === 'add' ? item.amount : -item.amount), 0)
    const adjustmentTotal = manualTotal + ledgerTotal
    const subtotal = payPreview?.totalUpah ?? 0
    return { items, ledgerChecked, ledgerTotal, manualTotal, adjustmentTotal, subtotal, finalTotal: subtotal + adjustmentTotal }
  }, [payAdjustments, payPreview, payLedgerOptions, checkedLedgerIds])

  function addPayAdjustmentRow() {
    if (payAdjustments.length >= 10) {
      alert('Maksimal 10 baris penyesuaian.')
      return
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setPayAdjustments((prev) => [...prev, { id, kind: 'deduct', label: '', amount: '' }])
  }

  function updatePayAdjustmentRow(id: string, patch: Partial<{ kind: 'add' | 'deduct'; label: string; amount: string }>) {
    setPayAdjustments((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function removePayAdjustmentRow(id: string) {
    setPayAdjustments((prev) => prev.filter((item) => item.id !== id))
  }

  const canMergeSelected = useMemo(() => {
    if (selectedSessionIds.size < 2) return false
    const selected = filtered.filter((s) => selectedSessionIds.has(s.id))
    if (selected.length !== selectedSessionIds.size) return false
    if (selected.some((s) => Boolean(s.paidAt) || Boolean(s.paymentId))) return false
    if (selected.some((s) => lockedSessionDraftNo.has(s.id))) return false
    const first = selected[0]!
    const opKey = `${first.packerOperatorName}::${first.packerOperatorCode}`
    const dateKey = getJakartaDateKey(first.startedAt)
    return selected.every((s) => `${s.packerOperatorName}::${s.packerOperatorCode}` === opKey && getJakartaDateKey(s.startedAt) === dateKey)
  }, [filtered, selectedSessionIds, lockedSessionDraftNo])

  const [mergeBusy, setMergeBusy] = useState(false)
  async function handleMergeSelected() {
    if (!canMergeSelected) {
      alert('Hanya sesi dengan operator dan tanggal yang sama yang bisa digabung, dan belum dibayar.')
      return
    }
    const targets = filtered.filter((s) => selectedSessionIds.has(s.id))
    const totalPaket = targets.reduce((acc, s) => acc + (s.completedPackingCount ?? 0), 0)
    const totalUpah = targets.reduce((acc, s) => acc + (s.totalPayAmount ?? 0), 0)
    askConfirm({
      title: 'Gabung sesi packing?',
      body: `${targets.length} sesi · ${totalPaket} paket · ${formatCurrency(totalUpah)} · ${targets[0]?.packerNameSnapshot ?? ''}. Rekaman paket pindah ke sesi paling awal.`,
      confirmLabel: 'Gabung',
      onConfirm: async () => {
        setMergeBusy(true)
        try {
          const ids = Array.from(selectedSessionIds)
          await mergePackingSessionsApi(ids)
          setSelectedSessionIds(new Set())
          await load()
        } catch (e) {
          alert(e instanceof Error ? e.message : 'Gagal menggabungkan sesi')
        } finally {
          setMergeBusy(false)
        }
      },
    })
  }

  async function handleDeleteSelectedSessions() {
    if (deletePreview.selected.length === 0) {
      alert('Centang dulu sesi kosong yang mau dihapus.')
      return
    }
    if (deletePreview.deletable.length === 0) {
      alert('Tidak ada sesi terpilih yang bisa dihapus. Hanya sesi closed, kosong, dan belum dibayar yang bisa dihapus.')
      return
    }
    const skippedText = deletePreview.invalidCount > 0 ? ` ${deletePreview.invalidCount} sesi lain dilewati (tidak kosong / belum closed / sudah dibayar / terkunci).` : ''
    askConfirm({
      title: `Hapus ${deletePreview.deletable.length} sesi kosong?`,
      body: `Aksi ini tidak bisa dibatalkan.${skippedText}`,
      confirmLabel: 'Hapus',
      danger: true,
      onConfirm: async () => {
        setDeleteBusy(true)
        try {
          for (const session of deletePreview.deletable) {
            await deletePackingSessionApi(session.id)
          }
          const deletedIds = new Set(deletePreview.deletable.map((session) => session.id))
          setSessions((prev) => prev.filter((session) => !deletedIds.has(session.id)))
          setSelectedSessionIds((current) => {
            const next = new Set(current)
            for (const id of deletedIds) next.delete(id)
            return next
          })
        } catch (e) {
          alert(e instanceof Error ? e.message : 'Gagal hapus sesi terpilih')
          await load()
        } finally {
          setDeleteBusy(false)
        }
      },
    })
  }

  function handleOpenDetail(s: PackingWorkSession) {
    navigateToPackingSessionDetail(s.id)
  }

  // keep handleOpenDetail used via anchor below

  function handleExportAll() {
    const rows = totals.selectedSessions
    if (rows.length === 0) {
      alert('Tidak ada data untuk export.')
      return
    }
    const csv = ['session_id,packer_name,packer_code,status,bayar,paid_at,paket,upah,mulai,ended', ...rows.map((s) => `${s.id},${s.packerNameSnapshot},${s.packerCodeSnapshot},${s.status},${s.paidAt ? 'dibayar' : 'belum'},${s.paidAt ?? ''},${s.completedPackingCount},${s.totalPayAmount},${s.startedAt},${s.endedAt ?? ''}`)].join('\n')
    const scope = selectedSessionIds.size > 0 ? 'selected' : 'filtered'
    downloadTextFile(`packing-sessions-${scope}-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8')
  }

  function toggleSessionSelection(sessionId: string) {
    if (lockedSessionDraftNo.has(sessionId)) return
    setSelectedSessionIds((current) => {
      const next = new Set(current)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  function selectAllFilteredSessions() {
    setSelectedSessionIds(new Set(filtered.filter((s) => !lockedSessionDraftNo.has(s.id)).map((s) => s.id)))
  }

  function toggleGroupSelection(groupSessions: PackingWorkSession[]) {
    const unlocked = groupSessions.filter((s) => !lockedSessionDraftNo.has(s.id))
    if (unlocked.length === 0) return
    setSelectedSessionIds((current) => {
      const next = new Set(current)
      const allSelected = unlocked.every((session) => next.has(session.id))
      for (const session of unlocked) {
        if (allSelected) next.delete(session.id)
        else next.add(session.id)
      }
      return next
    })
  }

  function openPayDialog() {
    const ids = Array.from(selectedSessionIds)
    if (ids.length === 0) {
      alert('Centang dulu sesi yang mau dibayar.')
      return
    }
    if (!payPreview) return
    if (payPreview.mixedPacker) {
      alert('Pembayaran harus per petugas. Filter per petugas dulu atau pilih sesi dengan petugas yang sama.')
      return
    }
    if (payPreview.notClosedCount > 0) {
      alert(`Ada ${payPreview.notClosedCount} sesi yang belum closed. Hanya sesi closed yang bisa dibayar.`)
      return
    }
    if (payPreview.alreadyPaidCount > 0) {
      alert(`Ada ${payPreview.alreadyPaidCount} sesi yang sudah dibayar. Filter ke belum dibayar dulu.`)
      return
    }
    if (payPreview.lockedCount > 0) {
      alert(`Ada ${payPreview.lockedCount} sesi yang terkunci di draft pending. Konfirmasi atau batalkan draft dulu.`)
      return
    }
    setPayError(null)
    setPayMethod('cash')
    setPayNote('')
    setPayAdjustments([])
    const packerPending = pendingLedger.filter((item) => `${item.packerOperatorName}::${item.packerOperatorCode}` === payPreview.packerKey)
    setCheckedLedgerIds(new Set(packerPending.map((item) => item.id)))
    setAdjustOpen(packerPending.length > 0)
    setShowPayDialog(true)
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)
  }

  // ── Kamus label Indonesia (satu sumber) ──────────────────────────
  function formatPaymentMethodLabel(method: string | null | undefined) {
    if (method === 'transfer') return 'Transfer'
    if (method === 'other') return 'Lainnya'
    return 'Tunai'
  }

  function formatPackingSessionStatus(status: PackingWorkSession['status']) {
    if (status === 'active') return 'Aktif'
    if (status === 'cancelled') return 'Dibatalkan'
    return 'Ditutup'
  }

  function formatDateTimeWIB(iso: string | null | undefined) {
    if (!iso) return '—'
    try {
      const d = new Date(iso)
      const date = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
      const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      return `${date}, ${time} WIB`
    } catch {
      return String(iso)
    }
  }

  function formatPeriode(startedAt: string, endedAt: string | null) {
    try {
      const s = new Date(startedAt)
      const start = s.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      if (!endedAt) return `${start} → —`
      const e = new Date(endedAt)
      const end = e.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      return `${start} → ${end}`
    } catch {
      return `${new Date(startedAt).toLocaleDateString('id-ID')} → ${endedAt ? new Date(endedAt).toLocaleDateString('id-ID') : '—'}`
    }
  }

  function formatSessionDateLabel(iso: string) {
    try {
      return new Date(iso).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    } catch {
      return new Date(iso).toLocaleDateString('id-ID')
    }
  }

  function buildSelectionShareText() {
    const rows = totals.selectedSessions
    if (rows.length === 0) return ''
    const isMultiPacker = payPreview?.mixedPacker ?? new Set(rows.map((r) => `${r.packerOperatorName}::${r.packerOperatorCode}`)).size > 1
    const firstName = isMultiPacker ? 'Kak' : rows[0].packerNameSnapshot.split(' ')[0]

    const sortedByDate = [...rows].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    const startDate = new Date(sortedByDate[0].startedAt)
    const endDate = new Date(sortedByDate[sortedByDate.length - 1].startedAt)
    const startDay = startDate.getDate()
    const endDay = endDate.getDate()
    const sameMonth = startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()
    const sameDay = startDate.toDateString() === endDate.toDateString()
    let periode: string
    if (sameDay) {
      periode = startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    } else if (sameMonth) {
      const monthYear = startDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
      periode = `${startDay}–${endDay} ${monthYear}`
    } else {
      const s = startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      const e = endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      periode = `${s} – ${e}`
    }

    const groups = new Map<string, PackingWorkSession[]>()
    for (const r of sortedByDate) {
      const d = new Date(r.startedAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    }
    const sortedKeys = Array.from(groups.keys()).sort()

    const lines: string[] = []
    lines.push(`Halo ${firstName} 👋`, ``, `Ini ringkasan upah packing kamu ya:`, ``, `Periode: ${periode}`, ``, `Total keseluruhan:`, `• ${rows.length} sesi packing`, `• ${totals.totalPaket} paket`, `• Total upah: ${formatCurrency(totals.totalUpah)}`, `• Sudah dibayar: ${totals.paidSessions} sesi`, `• Belum dibayar: ${totals.unpaidSessions} sesi`, ``, `Rinciannya:`, ``)

    for (const key of sortedKeys) {
      const group = groups.get(key)!
      const headerDate = new Date(group[0].startedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      lines.push(`📅 ${headerDate}`)
      const sortedGroup = [...group].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
      sortedGroup.forEach((s, idx) => {
        const paid = Boolean(s.paidAt)
        const statusText = paid ? '✅ Sudah dibayar' : 'Belum dibayar'
        lines.push(`• Sesi ${idx + 1} — ${s.completedPackingCount} paket • ${formatCurrency(s.totalPayAmount)} • ${statusText}`)
      })
      lines.push(``)
    }

    lines.push(`Coba dicek dulu ya. Kalau datanya sudah sesuai, kabari admin supaya pembayaran yang belum selesai bisa diproses 😊`, ``, `Makasih banyak sudah bantu proses packing 🙏`)
    return lines.join('\n')
  }

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      try {
        document.execCommand('copy')
        setCopiedKey(key)
        window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800)
      } catch {
        alert('Gagal menyalin. Silakan copy manual.')
      } finally {
        ta.remove()
      }
    }
  }

  function shareToWhatsApp(text: string) {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function collectManualAdjustments() {
    return payAdjustmentSummary.items
      .filter((item) => item.label.trim() || item.parsedAmount > 0)
      .map((item) => {
        const label = item.label.trim()
        if (!label) throw new Error('Setiap penyesuaian wajib diisi keterangannya.')
        if (item.parsedAmount <= 0) throw new Error(`Penyesuaian "${label}": nominal harus lebih dari Rp 0.`)
        return { label: label.slice(0, 100), kind: item.kind, amount: item.parsedAmount }
      })
  }

  function collectLedgerIds() {
    return payAdjustmentSummary.ledgerChecked.map((item) => item.id)
  }

  function validateFinalTotal(manual: Array<{ kind: 'add' | 'deduct'; amount: number }>, ledger: PackerAdjustment[]) {
    if (!payPreview) return false
    const total = manual.reduce((acc, item) => acc + (item.kind === 'add' ? item.amount : -item.amount), 0)
      + ledger.reduce((acc, item) => acc + (item.kind === 'add' ? item.amount : -item.amount), 0)
    return payPreview.totalUpah + total >= 0
  }

  async function handleConfirmPay() {
    if (!payPreview || !payPreview.valid) return
    setPayBusy(true)
    setPayError(null)
    try {
      const manual = collectManualAdjustments()
      const ledgerIds = collectLedgerIds()
      if (!validateFinalTotal(manual, payAdjustmentSummary.ledgerChecked)) {
        setPayError('Total akhir tidak boleh negatif. Kurangi potongan atau tambah bonus.')
        return
      }
      const payment = await createPackingPaymentApi({ sessionIds: payPreview.sessions.map((s) => s.id), paymentMethod: payMethod, note: payNote.trim() || null, adjustments: manual, ledgerAdjustmentIds: ledgerIds })
      setLastPayment(payment as PackingPayment)
      setShowPayDialog(false)
      setSelectedSessionIds(new Set())
      setPayAdjustments([])
      setCheckedLedgerIds(new Set())
      await load()
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Penyesuaian')) {
        setPayError(e.message)
      } else {
        setPayError(e instanceof Error ? e.message : 'Gagal membuat pembayaran.')
      }
    } finally {
      setPayBusy(false)
    }
  }

  async function handleSaveDraft() {
    if (!payPreview || !payPreview.valid) return
    setDraftBusy(true)
    setPayError(null)
    try {
      const manual = collectManualAdjustments()
      const ledgerIds = collectLedgerIds()
      if (!validateFinalTotal(manual, payAdjustmentSummary.ledgerChecked)) {
        setPayError('Estimasi total tidak boleh negatif. Kurangi potongan atau tambah bonus.')
        return
      }
      const draft = await createPackingPaymentDraftApi({ sessionIds: payPreview.sessions.map((s) => s.id), manualAdjustments: manual, ledgerAdjustmentIds: ledgerIds, paymentMethod: payMethod, note: payNote.trim() || null })
      setShowPayDialog(false)
      setSelectedSessionIds(new Set())
      setPayAdjustments([])
      setCheckedLedgerIds(new Set())
      await load()
      setExpandedDraftId((draft as PackingPaymentDraft).id)
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Gagal menyimpan draft pending.')
    } finally {
      setDraftBusy(false)
    }
  }

  async function handleConfirmDraft(draft: PackingPaymentDraft) {
    askConfirm({
      title: `Konfirmasi ${draft.draftNo}?`,
      body: `${draft.packerNameSnapshot} · ${draft.totalSessions} sesi · ${draft.totalPackages} paket · estimasi ${formatCurrency(draft.estimatedTotal)} (${formatPaymentMethodLabel(draft.paymentMethod)}). Sesi ditandai dibayar dan tidak bisa diubah.`,
      confirmLabel: 'Konfirmasi bayar',
      onConfirm: async () => {
        try {
          const result = await confirmPackingPaymentDraftApi(draft.id)
          setLastPayment(result.payment as PackingPayment)
          setSelectedSessionIds(new Set())
          await load()
        } catch (e) {
          alert(e instanceof Error ? e.message : 'Gagal konfirmasi draft.')
          await refreshPending()
        }
      },
    })
  }

  async function handleCancelDraft(draft: PackingPaymentDraft) {
    askConfirm({
      title: `Batalkan ${draft.draftNo}?`,
      body: `${draft.totalSessions} sesi kembali bebas dipilih. Kasbon/bonus yang ikut draft tetap menunggu.`,
      confirmLabel: 'Batalkan draft',
      danger: true,
      onConfirm: async () => {
        try {
          await cancelPackingPaymentDraftApi(draft.id)
          await load()
        } catch (e) {
          alert(e instanceof Error ? e.message : 'Gagal membatalkan draft.')
        }
      },
    })
  }

  async function handleCancelLedger(item: PackerAdjustment) {
    askConfirm({
      title: 'Batalkan catatan?',
      body: `"${item.label}" (${item.kind === 'add' ? '+' : '−'}${formatCurrency(item.amount)}) untuk ${item.packerNameSnapshot} tidak akan disarankan lagi saat bayar.`,
      confirmLabel: 'Batalkan catatan',
      danger: true,
      onConfirm: async () => {
        try {
          await cancelPackerAdjustmentApi(item.id)
          setCheckedLedgerIds((prev) => {
            const next = new Set(prev)
            next.delete(item.id)
            return next
          })
          await refreshPending()
        } catch (e) {
          alert(e instanceof Error ? e.message : 'Gagal membatalkan catatan.')
        }
      },
    })
  }

  function openLedgerDialog(presetPacker = 'all') {
    setLedgerError(null)
    setLedgerFieldErrors({})
    setLedgerKind('deduct')
    setLedgerLabel('')
    setLedgerAmount('')
    setLedgerNote('')
    setLedgerPacker(presetPacker !== 'all' ? presetPacker : (packerFilter !== 'all' ? packerFilter : 'all'))
    setShowLedgerDialog(true)
  }

  async function handleCreateLedger() {
    const [name, code] = ledgerPacker.split('::')
    const amount = parseAdjustmentAmount(ledgerAmount)
    const fieldErrors: { packer?: string; label?: string; amount?: string } = {}
    if (!name || !code) fieldErrors.packer = 'Pilih petugas dulu.'
    if (!ledgerLabel.trim()) fieldErrors.label = 'Keterangan wajib diisi (mis: Kasbon, Bonus rapi).'
    if (amount <= 0) fieldErrors.amount = 'Nominal harus lebih dari Rp 0.'
    setLedgerFieldErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return
    setLedgerBusy(true)
    setLedgerError(null)
    try {
      const created = await createPackerAdjustmentApi({ packerOperatorName: name, packerOperatorCode: code, label: ledgerLabel.trim().slice(0, 100), kind: ledgerKind, amount, note: ledgerNote.trim() || null })
      setShowLedgerDialog(false)
      await refreshPending()
      // Jika modal bayar sedang terbuka untuk packer yang sama, centang otomatis
      if (showPayDialog && payPreview && payPreview.packerKey === `${name}::${code}`) {
        const fresh = await readPackerAdjustmentsApi({ packerOperatorName: name, packerOperatorCode: code, status: 'pending', limit: 100 }).catch(() => [] as PackerAdjustment[])
        const match = (fresh as PackerAdjustment[]).find((item) => item.label === ledgerLabel.trim().slice(0, 100) && item.amount === amount && item.kind === ledgerKind)
        if (match) setCheckedLedgerIds((prev) => new Set(prev).add(match.id))
        setPendingLedger((prev) => {
          const ids = new Set(prev.map((p) => p.id))
          const merged = [...prev]
          for (const item of fresh as PackerAdjustment[]) {
            if (!ids.has(item.id)) merged.push(item)
          }
          return merged
        })
      } else if (created && (created as PackerAdjustment).id) {
        // Sorot catatan baru di section Pending.
        const newId = (created as PackerAdjustment).id
        setHighlightLedgerId(newId)
        scrollToPending()
        window.setTimeout(() => setHighlightLedgerId((current) => (current === newId ? null : current)), 2400)
      }
    } catch (e) {
      setLedgerError(e instanceof Error ? e.message : 'Gagal mencatat.')
    } finally {
      setLedgerBusy(false)
    }
  }

  // ── Dialogs (shared) ──────────────────────────────────────────────
  function renderDialogs() {
    const activePayAdjustments = payPreview ? [
      ...payAdjustmentSummary.ledgerChecked.map((item) => ({ key: `ledger-${item.id}`, label: item.label, kind: item.kind, amount: item.amount, source: 'tersimpan' as const })),
      ...payAdjustmentSummary.items
        .filter((item) => item.label.trim() && item.parsedAmount > 0)
        .map((item) => ({ key: `manual-${item.id}`, label: item.label.trim(), kind: item.kind, amount: item.parsedAmount, source: 'manual' as const })),
    ] : []
    return (
      <>
        <Dialog open={Boolean(shareDraft)} onOpenChange={(open) => !open && setShareDraft(null)}>
          <DialogContent showCloseButton={false} className="packing-modal max-w-lg gap-0 overflow-hidden rounded-2xl border-[#dddddd] bg-white p-0 font-['Inter'] shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
            <div className="border-b border-[#dddddd] p-6">
              <div className="flex items-start justify-between gap-5">
                <div className="grid gap-1">
                  <DialogTitle className="font-['Inter'] text-[18px] font-semibold text-[#000000]">{shareDraft?.title ?? 'Bagikan rincian'}</DialogTitle>
                  <DialogDescription className="font-['Inter'] text-[13px] leading-5 text-[#615d59]">Copy teks di bawah atau langsung share ke WhatsApp. Format siap tempel.</DialogDescription>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setShareDraft(null)} className="h-9 w-9 shrink-0 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]">
                  <HugeiconsIcon icon={Cancel01Icon} size={19} strokeWidth={1.9} />
                </Button>
              </div>
            </div>
            {shareDraft ? (
              <div className="grid gap-4 p-6">
                <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-[4px] border border-[#dddddd] bg-[#f6f5f4] p-4 font-['Inter'] text-[13px] leading-6 text-[#31302e]">{shareDraft.text}</pre>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => void copyText(shareDraft.text, 'draft')} className="h-9 rounded-full border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]">
                    <HugeiconsIcon icon={Copy01Icon} size={16} strokeWidth={1.9} /> {copiedKey === 'draft' ? 'Tersalin ✓' : 'Salin'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => shareToWhatsApp(shareDraft.text)} className="h-9 rounded-full border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]">
                    <HugeiconsIcon icon={SentIcon} size={16} strokeWidth={1.9} /> WhatsApp
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => downloadTextFile(`${shareDraft.title.replace(/[^a-zA-Z0-9-_]+/g, '_')}.txt`, shareDraft.text, 'text/plain;charset=utf-8')} className="h-9 rounded-full border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]">
                    <HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={1.9} /> TXT
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(confirmAction)} onOpenChange={(open) => { if (!open && !confirmAction?.busy) setConfirmAction(null) }}>
          <DialogContent showCloseButton={false} className="packing-modal max-w-md gap-0 overflow-hidden rounded-[12px] border border-[#e6e6e6] bg-white p-0 font-['Inter'] shadow-[0_23px_52px_rgba(0,0,0,0.08),0_4px_18px_rgba(0,0,0,0.06)]">
            <div className="grid gap-4 p-6">
              <div className="grid gap-1.5">
                <DialogTitle className="font-['Inter'] text-[18px] font-semibold text-[#000000]">{confirmAction?.title ?? 'Konfirmasi'}</DialogTitle>
                <DialogDescription className="font-['Inter'] text-[13px] leading-5 text-[#615d59]">{confirmAction?.body ?? ''}</DialogDescription>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setConfirmAction(null)} disabled={Boolean(confirmAction?.busy)} className="h-9 rounded-[8px] border border-[#e6e6e6] bg-white px-5 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">Batal</Button>
                <Button type="button" onClick={() => void runConfirmAction()} disabled={Boolean(confirmAction?.busy)} className={`h-9 rounded-[8px] px-5 font-['Inter'] text-[13px] font-semibold text-white disabled:opacity-40 ${confirmAction?.danger ? 'bg-[#991b1b] hover:bg-[#7f1d1d]' : 'bg-[#000000] hover:bg-[#31302e]'}`}>{confirmAction?.busy ? 'Memproses...' : confirmAction?.confirmLabel ?? 'Ya'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
          <DialogContent showCloseButton={false} className="packing-modal flex max-h-[88vh] w-[calc(100vw-2rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-[12px] border border-[#e6e6e6] bg-white p-0 font-['Inter'] shadow-[0_23px_52px_rgba(0,0,0,0.08),0_4px_18px_rgba(0,0,0,0.06)] sm:max-w-xl">
            <div className="shrink-0 border-b border-[#e6e6e6] bg-white p-6 pb-5">
              <div className="flex items-start justify-between gap-4">
                <div className="grid min-w-0 gap-1.5">
                  <DialogTitle className="font-['Inter'] text-[20px] font-semibold leading-none tracking-[-0.5px] text-[#000000]">Bayar upah packing</DialogTitle>
                  <DialogDescription className="font-['Inter'] text-[12px] leading-5 text-[#615d59]">1 petugas · sesi closed & belum dibayar · bisa simpan pending dulu</DialogDescription>
                  {payPreview ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex max-w-full truncate rounded-full bg-[#000000] px-2.5 py-1 font-['Inter'] text-[11px] font-semibold text-white">{payPreview.packerLabel}</span>
                      <span className="inline-flex rounded-full border border-[#e6e6e6] bg-[#f6f5f4] px-2.5 py-1 font-['Inter'] text-[11px] font-medium tabular-nums text-[#31302e]">{payPreview.count} sesi · {payPreview.totalPaket} paket</span>
                    </div>
                  ) : null}
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setShowPayDialog(false)} className="h-8 w-8 shrink-0 rounded-[8px] border border-[#e6e6e6] bg-white text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]">
                  <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.9} />
                </Button>
              </div>
            </div>
            {payPreview ? (
              <>
              <div className="min-h-0 flex-1 overflow-y-auto bg-[#f6f5f4]">
              <div className="sticky top-0 z-10 border-b border-[#e6e6e6] bg-white/95 px-5 py-3 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-['Inter'] text-[12px] tabular-nums text-[#615d59]">{payPreview.count} sesi · {payPreview.totalPaket} paket · subtotal {formatCurrency(payPreview.totalUpah)}</p>
                    <p className="mt-0.5 truncate font-['Inter'] text-[12px] tabular-nums text-[#615d59]">penyesuaian {payAdjustmentSummary.adjustmentTotal === 0 ? '—' : `${payAdjustmentSummary.adjustmentTotal > 0 ? '+' : '−'}${formatCurrency(Math.abs(payAdjustmentSummary.adjustmentTotal))}`}{activePayAdjustments.length > 0 ? ` (${activePayAdjustments.length})` : ''}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Total dibayar</p>
                    <p className="font-['Inter'] text-[22px] font-bold tabular-nums leading-tight tracking-[-0.5px] text-[#000000]">{formatCurrency(Math.max(0, payAdjustmentSummary.finalTotal))}</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-5 p-5">
                <section className="grid gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#000000] font-['Inter'] text-[11px] font-bold text-white">1</span>
                    <h3 className="font-['Inter'] text-[13px] font-semibold text-[#000000]">Sesi yang dibayar</h3>
                    <span className="font-['Inter'] text-[12px] tabular-nums text-[#a39e98]">{formatCurrency(payPreview.totalUpah)}</span>
                  </div>
                  <div className="overflow-hidden rounded-[8px] border border-[#e6e6e6] bg-white">
                    <ul className="max-h-44 divide-y divide-[#e6e6e6] overflow-y-auto bg-white">
                      {payPreview.sessions.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 font-['Inter'] text-[12px]">
                          <span className="min-w-0">
                            <span className="block truncate text-[#31302e]" title={s.id}>{new Date(s.startedAt).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })} · {s.id.slice(0, 8)}</span>
                            <span className="block text-[11px] tabular-nums text-[#a39e98]">{s.completedPackingCount} paket</span>
                          </span>
                          <span className="shrink-0 tabular-nums font-semibold text-[#000000]">{formatCurrency(s.totalPayAmount)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2 border-t border-[#e6e6e6] bg-white p-2">
                      <Button type="button" variant="ghost" onClick={() => { const t = buildSelectionShareText(); if (t) void copyText(t, 'selection') }} className="h-7 flex-1 rounded-[8px] border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.9} /> {copiedKey === 'selection' ? 'Tersalin ✓' : 'Salin ringkasan'}</Button>
                      <Button type="button" variant="ghost" onClick={() => { const t = buildSelectionShareText(); if (t) setShareDraft({ title: 'Ringkasan packing', text: t }) }} className="h-7 flex-1 rounded-[8px] border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={SentIcon} size={14} strokeWidth={1.9} /> WA</Button>
                    </div>
                  </div>
                </section>
                <section className="overflow-hidden rounded-[8px] border border-[#e6e6e6] bg-white">
                  <button type="button" onClick={() => setAdjustOpen((v) => !v)} aria-expanded={adjustOpen} className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-[#fbfaf9]">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#000000] font-['Inter'] text-[11px] font-bold text-white">2</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-['Inter'] text-[13px] font-semibold text-[#000000]">Potongan & Bonus</span>
                      <span className="block truncate font-['Inter'] text-[12px] tabular-nums text-[#a39e98]">{activePayAdjustments.length === 0 ? 'Tidak ada — total = subtotal upah' : `${activePayAdjustments.length} aktif · ${payAdjustmentSummary.adjustmentTotal > 0 ? '+' : payAdjustmentSummary.adjustmentTotal < 0 ? '−' : ''}${formatCurrency(Math.abs(payAdjustmentSummary.adjustmentTotal))}`}</span>
                    </span>
                    <span className={`shrink-0 font-['Inter'] text-[14px] text-[#615d59] transition-transform ${adjustOpen ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
                  </button>
                  {adjustOpen ? (
                  <div className="grid gap-2 border-t border-[#e6e6e6] px-4 py-3">
                  <p className="font-['Inter'] text-[12px] leading-5 text-[#615d59]">A. Centang <span className="font-medium text-[#31302e]">catatan tersimpan</span> (kasbon/bonus yang dicatat sebelumnya). B. Tambah <span className="font-medium text-[#31302e]">baris manual</span> sekali pakai khusus pembayaran ini.</p>
                  {payLedgerOptions.length > 0 ? (
                    <div className="grid gap-1.5">
                      <p className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">A · Dari catatan tersimpan</p>
                      {payLedgerOptions.map((item) => {
                        const checked = checkedLedgerIds.has(item.id)
                        return (
                          <label key={item.id} className={`flex cursor-pointer items-center gap-2.5 rounded-[8px] border bg-white px-3 py-2 transition-colors ${checked ? 'border-[#000000]' : 'border-[#e6e6e6]'}`}>
                            <input type="checkbox" className="h-4 w-4 shrink-0 rounded border-[#dddddd] accent-[#000000]" checked={checked} onChange={() => setCheckedLedgerIds((prev) => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next })} aria-label={`Ikutkan ${item.label}`} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-['Inter'] text-[12px] text-[#31302e]" title={item.label}>{item.label}</span>
                              <span className="block font-['Inter'] text-[11px] text-[#a39e98]">Catatan tersimpan · oleh {item.createdByOperatorName ?? '-'} · {formatDateTimeWIB(item.createdAt)}</span>
                            </span>
                            <span className={`shrink-0 font-['Inter'] text-[12px] font-semibold tabular-nums ${item.kind === 'add' ? 'text-[#000000]' : 'text-[#991b1b]'}`}>{item.kind === 'add' ? '+' : '−'}{formatCurrency(item.amount)}</span>
                          </label>
                        )
                      })}
                    </div>
                  ) : null}
                  {payAdjustmentSummary.items.length > 0 ? (
                    <div className="grid gap-2">
                      <p className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">B · Tambahan sekali ini saja</p>
                      {payAdjustmentSummary.items.map((item) => (
                        <div key={item.id} className="grid grid-cols-[76px_1fr] gap-2 rounded-[8px] border border-dashed border-[#8f8a84] bg-white p-2">
                          <select value={item.kind} onChange={(e) => updatePayAdjustmentRow(item.id, { kind: e.target.value as 'add' | 'deduct' })} className="h-8 rounded-[4px] border border-[#e6e6e6] bg-white px-1 font-['Inter'] text-[12px] font-medium text-[#000000] focus:outline-none" aria-label="Tipe penyesuaian">
                            <option value="add">+ Tambah</option>
                            <option value="deduct">− Kurang</option>
                          </select>
                          <div className="grid gap-2">
                            <div className="flex gap-2">
                              <Input value={item.label} onChange={(e) => updatePayAdjustmentRow(item.id, { label: e.target.value })} placeholder="mis: Bonus rapi / Koreksi kurang bayar" className="h-8 min-w-0 flex-1 rounded-[4px] border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" maxLength={100} aria-label="Keterangan penyesuaian" />
                              <Button type="button" variant="ghost" size="icon" onClick={() => removePayAdjustmentRow(item.id)} className="h-8 w-8 shrink-0 rounded-[4px] border border-[#e6e6e6] text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]" aria-label="Hapus penyesuaian">
                                <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.9} />
                              </Button>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-['Inter'] text-[12px] text-[#a39e98]">Rp</span>
                              <Input value={item.amount} onChange={(e) => updatePayAdjustmentRow(item.id, { amount: e.target.value })} inputMode="numeric" placeholder="0" className="h-8 min-w-0 flex-1 rounded-[4px] border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[13px] tabular-nums placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" aria-label="Nominal penyesuaian" />
                              <span className={`shrink-0 font-['Inter'] text-[12px] font-semibold tabular-nums ${item.parsedAmount > 0 ? (item.kind === 'add' ? 'text-[#000000]' : 'text-[#991b1b]') : 'text-[#a39e98]'}`}>{item.parsedAmount > 0 ? `${item.kind === 'add' ? '+' : '−'}${formatCurrency(item.parsedAmount)}` : 'Rp 0'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {payLedgerOptions.length === 0 && payAdjustmentSummary.items.length === 0 ? (
                    <p className="rounded-[8px] border border-dashed border-[#e6e6e6] bg-white px-3 py-2.5 font-['Inter'] text-[12px] leading-5 text-[#a39e98]">Belum ada penyesuaian — total yang dibayar sama dengan subtotal upah.</p>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={addPayAdjustmentRow} disabled={payAdjustments.length >= 10} className="inline-flex h-7 items-center rounded-[8px] border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40">+ Baris manual</button>
                    <button type="button" onClick={() => openLedgerDialog(payPreview.packerKey)} className="inline-flex h-7 items-center rounded-[8px] border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">+ Catat kasbon/bonus</button>
                  </div>
                  {payAdjustmentSummary.finalTotal < 0 ? <p className="font-['Inter'] text-[12px] font-medium text-red-600">Total tidak boleh negatif. Kurangi potongan.</p> : null}
                  </div>
                  ) : null}
                </section>
                <section className="grid gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#000000] font-['Inter'] text-[11px] font-bold text-white">3</span>
                    <h3 className="font-['Inter'] text-[13px] font-semibold text-[#000000]">Pembayaran</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 rounded-[8px] border border-[#e6e6e6] bg-white p-1.5" role="radiogroup" aria-label="Metode pembayaran">
                    {[{ value: 'cash', label: 'Tunai' }, { value: 'transfer', label: 'Transfer' }, { value: 'other', label: 'Lainnya' }].map((opt) => (
                      <button key={opt.value} type="button" role="radio" aria-checked={payMethod === opt.value} onClick={() => setPayMethod(opt.value as typeof payMethod)} className={`h-9 rounded-[6px] font-['Inter'] text-[13px] font-medium transition-colors ${payMethod === opt.value ? 'bg-[#000000] text-white' : 'text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]'}`}>{opt.label}</button>
                    ))}
                  </div>
                  <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Catatan (opsional) — mis: periode 1-7 Agu, tunai" maxLength={200} className="h-9 rounded-[8px] border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" aria-label="Catatan pembayaran" />
                  <p className="rounded-[8px] border border-[#e6e6e6] bg-white px-3 py-2.5 font-['Inter'] text-[12px] leading-5 text-[#615d59]"><span className="font-semibold text-[#000000]">Simpan pending</span> menyimpan pembayaran ini sebagai draft & mengunci {payPreview.count} sesi — sesi tidak bisa dibayar di tempat lain sampai draft dikonfirmasi atau dibatalkan.</p>
                </section>
                {payError ? <Alert variant="destructive" className="font-['Inter'] text-[13px]"><p>{payError}</p></Alert> : null}
                </div>
              </div>
              <div className="grid shrink-0 gap-2 border-t border-[#e6e6e6] bg-white p-4 sm:grid-cols-[auto_1fr_1fr] sm:items-center">
                <Button type="button" variant="ghost" onClick={() => setShowPayDialog(false)} disabled={payBusy || draftBusy} className="h-10 rounded-[8px] border border-[#e6e6e6] bg-white px-5 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">Batal</Button>
                <Button type="button" variant="ghost" onClick={() => void handleSaveDraft()} disabled={payBusy || draftBusy || !payPreview.valid || payAdjustmentSummary.finalTotal < 0} className="h-10 rounded-[8px] border border-[#000000] bg-white px-5 font-['Inter'] text-[13px] font-semibold text-[#000000] hover:bg-[#f6f5f4] disabled:opacity-40">{draftBusy ? 'Menyimpan...' : 'Simpan pending'}</Button>
                <Button type="button" onClick={() => void handleConfirmPay()} disabled={payBusy || draftBusy || !payPreview.valid || payAdjustmentSummary.finalTotal < 0} className="h-10 rounded-[8px] bg-[#000000] px-5 font-['Inter'] text-[13px] font-semibold text-white hover:bg-[#31302e] disabled:opacity-40">{payBusy ? 'Memproses...' : `Bayar ${formatCurrency(Math.max(0, payAdjustmentSummary.finalTotal))}`}</Button>
              </div>
              </>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={showLedgerDialog} onOpenChange={setShowLedgerDialog}>
          <DialogContent showCloseButton={false} className="packing-modal flex max-h-[88vh] max-w-md flex-col gap-0 overflow-hidden rounded-[16px] border border-[#e6e6e6] bg-white p-0 font-['Inter'] shadow-[0_23px_52px_rgba(0,0,0,0.08),0_4px_18px_rgba(0,0,0,0.06)]">
            <div className="shrink-0 border-b border-[#e6e6e6] bg-white px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="grid gap-1.5">
                  <DialogTitle className="font-['Inter'] text-[18px] font-semibold leading-7 tracking-[-0.125px] text-[#000000]">Catat kasbon / bonus</DialogTitle>
                  <DialogDescription className="font-['Inter'] text-[13px] leading-5 text-[#615d59]">Tersimpan sebagai pending per petugas — otomatis disarankan saat bayar, tanpa harus bayar sekarang.</DialogDescription>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setShowLedgerDialog(false)} className="h-8 w-8 shrink-0 rounded-[8px] border border-[#e6e6e6] bg-white text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]">
                  <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.9} />
                </Button>
              </div>
            </div>
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto bg-[#f6f5f4] p-6">
              <div className="grid gap-1.5">
                <Label className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Petugas</Label>
                <NativeSelect value={ledgerPacker} onChange={(value) => { setLedgerPacker(value); setLedgerFieldErrors((prev) => ({ ...prev, packer: undefined })) }} options={packerOptions.map((op) => ({ value: `${op.name}::${op.code}`, label: op.label }))} placeholder="Pilih petugas" placeholderValue="" className="w-full min-w-0" />
                {ledgerFieldErrors.packer ? <p className="font-['Inter'] text-[12px] font-medium text-[#991b1b]">{ledgerFieldErrors.packer}</p> : null}
              </div>
              <div className="grid gap-1.5">
                <Label className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Tipe</Label>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipe catatan">
                  <button type="button" role="radio" aria-checked={ledgerKind === 'deduct'} onClick={() => setLedgerKind('deduct')} className={`h-10 rounded-[8px] border font-['Inter'] text-[13px] font-medium transition-colors ${ledgerKind === 'deduct' ? 'border-[#000000] bg-[#000000] text-white' : 'border-[#e6e6e6] bg-white text-[#31302e] hover:bg-[#f6f5f4]'}`}>− Kurang (kasbon)</button>
                  <button type="button" role="radio" aria-checked={ledgerKind === 'add'} onClick={() => setLedgerKind('add')} className={`h-10 rounded-[8px] border font-['Inter'] text-[13px] font-medium transition-colors ${ledgerKind === 'add' ? 'border-[#000000] bg-[#000000] text-white' : 'border-[#e6e6e6] bg-white text-[#31302e] hover:bg-[#f6f5f4]'}`}>+ Tambah (bonus)</button>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Nominal (Rp)</Label>
                <Input value={ledgerAmount} onChange={(e) => { setLedgerAmount(e.target.value); setLedgerFieldErrors((prev) => ({ ...prev, amount: undefined })) }} inputMode="numeric" placeholder="0" aria-invalid={Boolean(ledgerFieldErrors.amount)} className={`h-10 rounded-[4px] border bg-white px-3 font-['Inter'] text-[15px] font-semibold tabular-nums placeholder:font-normal placeholder:text-[#a39e98] focus-visible:ring-0 ${ledgerFieldErrors.amount ? 'border-[#991b1b] focus-visible:border-[#991b1b]' : 'border-[#e6e6e6] focus-visible:border-[#8f8a84]'}`} />
                {ledgerFieldErrors.amount ? <p className="font-['Inter'] text-[12px] font-medium text-[#991b1b]">{ledgerFieldErrors.amount}</p> : parseAdjustmentAmount(ledgerAmount) > 0 ? <p className="font-['Inter'] text-[12px] tabular-nums text-[#615d59]">= {formatCurrency(parseAdjustmentAmount(ledgerAmount))}</p> : null}
              </div>
              <div className="grid gap-1.5">
                <Label className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Keterangan</Label>
                <Input value={ledgerLabel} onChange={(e) => { setLedgerLabel(e.target.value); setLedgerFieldErrors((prev) => ({ ...prev, label: undefined })) }} placeholder="mis: Kasbon 20 Jan / Bonus rapi" maxLength={100} aria-invalid={Boolean(ledgerFieldErrors.label)} className={`h-10 rounded-[4px] border bg-white px-3 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:ring-0 ${ledgerFieldErrors.label ? 'border-[#991b1b] focus-visible:border-[#991b1b]' : 'border-[#e6e6e6] focus-visible:border-[#8f8a84]'}`} />
                {ledgerFieldErrors.label ? <p className="font-['Inter'] text-[12px] font-medium text-[#991b1b]">{ledgerFieldErrors.label}</p> : null}
              </div>
              <div className="grid gap-1.5">
                <Label className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Catatan (opsional)</Label>
                <Input value={ledgerNote} onChange={(e) => setLedgerNote(e.target.value)} placeholder="mis: titip ke mandor" maxLength={200} className="h-10 rounded-[4px] border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" />
              </div>
              {ledgerError ? <Alert variant="destructive" className="font-['Inter'] text-[13px]"><p>{ledgerError}</p></Alert> : null}
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[#e6e6e6] bg-white p-4">
              <Button type="button" variant="ghost" onClick={() => setShowLedgerDialog(false)} disabled={ledgerBusy} className="h-10 rounded-full border border-[#e6e6e6] bg-white font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">Batal</Button>
              <Button type="button" onClick={() => void handleCreateLedger()} disabled={ledgerBusy} className="h-10 rounded-full bg-[#000000] font-['Inter'] text-[13px] font-medium text-white hover:bg-[#31302e] disabled:opacity-40">{ledgerBusy ? 'Menyimpan...' : 'Simpan catatan'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // Detail sesi dibuka di halaman PackingSessionDetailPage (navigasi via handleOpenDetail).

  return (
    <div className="packing-page mx-auto max-w-[1240px] bg-[#f6f5f4] px-4 py-8 font-['Inter'] sm:px-6 lg:py-10 xl:px-8">
      <section className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-['Inter'] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Operasional / Sesi Packing</div>
          <h1 className="mt-2 font-['Inter'] text-[32px] font-bold leading-[1.1] tracking-[-0.8px] text-[#000000] sm:text-[36px]">Riwayat Sesi Packing</h1>
          <p className="mt-3 max-w-2xl font-['Inter'] text-[14px] leading-6 text-[#615d59] sm:text-[15px]">Kelola sesi packing per petugas, catat kasbon/bonus kapan saja, simpan pending, lalu bayar atau share ringkasan.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" onClick={() => openLedgerDialog()} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={Edit02Icon} size={16} strokeWidth={1.9} /> Catat kasbon/bonus</Button>
          <Button type="button" variant="ghost" onClick={() => navigateTo('packing-payments')} className="h-10 rounded-lg bg-[#000000] px-4 font-['Inter'] text-[13px] font-medium text-white hover:bg-[#31302e]">Riwayat Bayar</Button>
          <div ref={headerMenuRef} className="relative">
            <Button type="button" variant="ghost" onClick={() => setShowHeaderMenu((v) => !v)} className="grid h-10 w-10 place-items-center rounded-lg border border-[#dddddd] bg-white text-[#31302e] hover:bg-[#f6f5f4]" aria-label="Menu lainnya">⋯</Button>
            {showHeaderMenu ? (
              <div className="absolute right-0 top-[calc(100%+6px)] z-20 grid w-44 gap-1 rounded-[12px] border border-[#e6e6e6] bg-white p-1 shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
                <button type="button" onClick={() => { setShowHeaderMenu(false); void load() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.9} /> Refresh</button>
                <button type="button" onClick={() => { setShowHeaderMenu(false); handleExportAll() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={Download01Icon} size={14} strokeWidth={1.9} /> Export Sesi</button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {error ? <Alert variant="destructive" className="mb-5 rounded-[4px] border-[#dddddd] bg-white font-['Inter'] text-[13px]"><p className="text-[#31302e]">{error}</p></Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sesi" value={String(totals.selectedSessions.length)} subLabel={`${selectedSessionIds.size > 0 ? 'terpilih' : 'terfilter'}`} icon={UserGroupIcon} />
        <StatCard label="Paket" value={String(totals.totalPaket)} subLabel="paket" icon={Package01Icon} />
        <StatCard label="Upah" value={formatCurrency(totals.totalUpah)} subLabel="total" icon={DollarCircleIcon} />
        <StatCard label="Belum / sudah" value={`${totals.unpaidSessions} belum`} subLabel={`${totals.paidSessions} sudah`} icon={DollarCircleIcon} />
      </section>

      {lastPayment ? (
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-[#dddddd] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-['Inter'] text-[13px] leading-5 text-[#31302e]">
            <span className="font-semibold text-[#000000]">{lastPayment.paymentNo}</span>
            <span className="mx-1 text-[#a39e98]">·</span>
            {lastPayment.packerNameSnapshot} ({lastPayment.packerCodeSnapshot}) · {lastPayment.totalSessions} sesi · {lastPayment.totalPackages} paket · {formatCurrency(lastPayment.totalAmount)}{(lastPayment.adjustmentTotal ?? 0) !== 0 ? ` (subtotal ${formatCurrency(lastPayment.subtotalAmount ?? lastPayment.totalAmount)})` : ''}
            <span className="ml-2 inline-flex rounded-full bg-[#000000] px-2 py-0.5 font-['Inter'] text-[11px] font-semibold text-white">barusan dibayar</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => navigateTo('packing-payments')} className="h-9 rounded-full bg-[#000000] px-4 font-['Inter'] text-[13px] font-medium text-white hover:bg-[#31302e]">Lihat di Riwayat</Button>
            <Button type="button" variant="ghost" onClick={() => setLastPayment(null)} className="h-9 rounded-full px-4 font-['Inter'] text-[13px] text-[#615d59] hover:bg-[#f6f5f4]">Tutup</Button>
          </div>
        </div>
      ) : null}

      {lockedSummary.sessionCount > 0 ? (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-[#000000] bg-[#000000] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-['Inter'] text-[13px] font-medium leading-5 text-white">🔒 {lockedSummary.sessionCount} sesi terkunci di {lockedSummary.draftCount} draft pending — tidak bisa dibayar, digabung, atau dihapus sampai draft dikonfirmasi/dibatalkan.</p>
          <Button type="button" variant="ghost" onClick={() => scrollToPending()} className="h-9 shrink-0 rounded-lg bg-white px-4 font-['Inter'] text-[13px] font-semibold text-[#000000] hover:bg-[#f6f5f4]">Lihat Pending</Button>
        </div>
      ) : null}

      <section ref={daftarSectionRef} className="mt-5 scroll-mt-4 overflow-hidden rounded-xl border border-[#dddddd] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#dddddd] bg-[#fbfaf9] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-['Inter'] text-[14px] font-semibold leading-none text-[#000000]">Daftar Sesi</h2>
              {lockedSummary.sessionCount > 0 ? (
                <button type="button" onClick={() => scrollToPending()} className="inline-flex items-center rounded-full bg-[#000000] px-2 py-0.5 font-['Inter'] text-[11px] font-semibold text-white hover:bg-[#31302e]">🔒 {lockedSummary.sessionCount} terkunci · Lihat Pending</button>
              ) : null}
            </div>
            <p className="mt-1 truncate font-['Inter'] text-[12px] leading-none text-[#615d59]">
              {selectedSessionIds.size > 0
                ? `${totals.selectedSessions.length} sesi · ${totals.totalPaket} paket · ${formatCurrency(totals.totalUpah)}${canMergeSelected ? ' · bisa digabung' : ''}`
                : `Menampilkan ${filtered.length} dari ${sessions.length} sesi · ${groupedSessions.length} petugas`}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <span className="inline-flex h-7 items-center rounded-lg border border-[#dddddd] bg-[#f6f5f4] px-3 font-['Inter'] text-[12px] font-medium text-[#615d59]">{selectedSessionIds.size} terpilih</span>
            <Button type="button" variant="ghost" onClick={selectPayableSessions} disabled={filtered.length === 0} title="Centang hanya sesi closed, belum dibayar, dan tidak terkunci" className="h-7 rounded-lg border border-[#dddddd] bg-white px-3 font-['Inter'] text-[12px] text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40">Pilih bisa dibayar</Button>
            <Button type="button" variant="ghost" onClick={selectAllFilteredSessions} disabled={filtered.length === 0} className="h-7 rounded-lg border border-[#dddddd] bg-white px-3 font-['Inter'] text-[12px] text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40">Pilih semua</Button>
            <Button type="button" variant="ghost" onClick={() => setSelectedSessionIds(new Set())} disabled={selectedSessionIds.size === 0} className="h-7 rounded-lg border border-[#dddddd] bg-white px-3 font-['Inter'] text-[12px] text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40">Reset pilihan</Button>
            {selectedSessionIds.size > 0 ? (
              <>
                <span className="mx-1 hidden h-7 w-px bg-[#e6e6e6] sm:block" aria-hidden="true" />
                <Button type="button" onClick={openPayDialog} disabled={payPreview ? !payPreview.valid : true} title={payPreview && !payPreview.valid ? 'Pilihan tidak valid untuk dibayar' : 'Bayar sesi terpilih'} className="h-7 rounded-lg bg-[#000000] px-3.5 font-['Inter'] text-[12px] font-medium text-white hover:bg-[#31302e] disabled:opacity-40"><HugeiconsIcon icon={DollarCircleIcon} size={14} strokeWidth={1.9} /> Bayar</Button>
                <Button type="button" variant="ghost" onClick={() => void handleMergeSelected()} disabled={!canMergeSelected || mergeBusy} title={canMergeSelected ? 'Gabung sesi terpilih' : 'Hanya sesi 1 petugas + 1 tanggal yang belum dibayar'} className="h-7 rounded-lg border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40"><HugeiconsIcon icon={Package01Icon} size={14} strokeWidth={1.9} /> {mergeBusy ? 'Menggabung...' : 'Gabung'}</Button>
                <Button type="button" variant="ghost" onClick={() => void handleDeleteSelectedSessions()} disabled={deleteBusy || deletePreview.deletable.length === 0} title={deletePreview.deletable.length > 0 ? 'Hapus sesi kosong terpilih' : 'Tidak ada sesi kosong yang bisa dihapus'} className="h-7 rounded-lg border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#991b1b] hover:bg-[#fee2e2] disabled:opacity-40"><HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.9} /> {deleteBusy ? 'Menghapus...' : 'Hapus'}</Button>
                <Button type="button" variant="ghost" onClick={() => { const t = buildSelectionShareText(); if (t) setShareDraft({ title: 'Ringkasan packing', text: t }) }} disabled={totals.selectedSessions.length === 0} className="h-7 rounded-lg border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40"><HugeiconsIcon icon={SentIcon} size={14} strokeWidth={1.9} /> Share</Button>
              </>
            ) : null}
          </div>
        </div>
        <div className="border-b border-[#e6e6e6] bg-white p-3">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
            <label className="relative flex min-w-[240px] flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 grid w-8 place-items-center text-[#a39e98]">
                <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.9} />
              </span>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari packer / kode / ID sesi / no. bayar / no. draft..." className="h-8 w-full rounded-[4px] border-[#e6e6e6] bg-white pl-8 pr-3 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" aria-label="Cari sesi" />
            </label>
            <div className="flex flex-wrap gap-2">
              <NativeSelect compact value={packerFilter} onChange={setPackerFilter} options={packerOptions.map((op) => ({ value: `${op.name}::${op.code}`, label: op.label }))} placeholder="Semua petugas" icon={UserGroupIcon} />
              <NativeSelect compact value={paidFilter} onChange={(value) => setPaidFilter(value as typeof paidFilter)} options={[{ value: 'unpaid', label: 'Belum dibayar' }, { value: 'paid', label: 'Sudah dibayar' }]} placeholder="Semua bayar" icon={DollarCircleIcon} />
              <NativeSelect compact value={statusFilter} onChange={(value) => setStatusFilter(value as typeof statusFilter)} options={[{ value: 'active', label: 'Aktif' }, { value: 'closed', label: 'Ditutup' }, { value: 'cancelled', label: 'Dibatalkan' }]} placeholder="Semua status" />
              <Button type="button" variant="ghost" onClick={() => { setSearch(''); setStatusFilter('all'); setPackerFilter('all'); setPaidFilter('unpaid') }} className="inline-flex h-8 items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#615d59] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.9} /> Reset filter</Button>
            </div>
          </div>
        </div>

        {selectedSessionIds.size > 0 && payPreview && !payPreview.valid ? (
          <div className="flex flex-col gap-2 border-b border-[#f5c518] bg-[#fff8e1] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="font-['Inter'] text-[12px] leading-5 text-[#5f4b00]">
              {payPreview.mixedPacker
                ? 'Pilihan campur beberapa petugas — pembayaran harus 1 petugas.'
                : payPreview.notClosedCount > 0
                  ? `${payPreview.notClosedCount} sesi belum Ditutup — hanya sesi Ditutup yang bisa dibayar.`
                  : payPreview.alreadyPaidCount > 0
                    ? `${payPreview.alreadyPaidCount} sesi sudah dibayar.`
                    : `${payPreview.lockedCount} sesi terkunci di draft pending.`}
            </p>
            <div className="flex shrink-0 gap-1.5">
              {payPreview.lockedCount > 0 ? (
                <Button type="button" variant="ghost" onClick={() => scrollToPending()} className="h-8 rounded-lg border border-[#8f8a84] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">Lihat Pending</Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={deselectInvalidSessions} className="h-8 rounded-lg bg-[#000000] px-3 font-['Inter'] text-[12px] font-medium text-white hover:bg-[#31302e]">Keluarkan yang tak valid</Button>
            </div>
          </div>
        ) : null}
        {loading ? (
          <div className="grid gap-2 p-6">
            <div className="h-10 animate-pulse rounded-lg bg-[#f6f5f4]" />
            <div className="h-20 animate-pulse rounded-lg bg-[#f6f5f4]" />
            <div className="h-20 animate-pulse rounded-lg bg-[#f6f5f4]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[#f6f5f4] text-[#615d59]">
              <HugeiconsIcon icon={Search01Icon} size={20} strokeWidth={1.9} />
            </div>
            <div className="mt-3 font-['Inter'] text-[14px] font-medium text-[#000000]">Tidak ada sesi sesuai filter</div>
            <div className="mt-1 font-['Inter'] text-[12px] text-[#a39e98]">Coba ubah petugas, status bayar, atau kata kunci pencarian.</div>
            <Button type="button" variant="ghost" onClick={() => { setSearch(''); setStatusFilter('all'); setPackerFilter('all'); setPaidFilter('unpaid') }} className="mt-4 h-9 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]">Reset filter</Button>
          </div>
        ) : (
          <>
          <div className="hidden overflow-x-auto scrollbar-thin md:block">
            <table className="w-full min-w-[860px] border-collapse">
              <thead className="bg-[#f6f5f4]">
                <tr className="text-left">
                  <Th className="w-[48px] px-4">Pilih</Th>
                  <Th>Sesi</Th>
                  <Th>Bayar</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Periode</Th>
                  <Th className="px-5 text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6e6e6]">
                {groupedSessions.map((group) => {
                  const allGroupSelected = group.sessions.every((session) => selectedSessionIds.has(session.id))
                  const someGroupSelected = !allGroupSelected && group.sessions.some((session) => selectedSessionIds.has(session.id))

                  return (
                  <Fragment key={group.key}>
                    <tr className="border-t border-[#dddddd] bg-[#fbfaf9] first:border-t-0">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <input type="checkbox" className="h-4 w-4 rounded border-[#dddddd] accent-[#000000]" checked={allGroupSelected} ref={(node) => { if (node) node.indeterminate = someGroupSelected }} onChange={() => toggleGroupSelection(group.sessions)} aria-label={`Pilih semua sesi ${group.name}`} />
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#000000] font-['Inter'] text-[11px] font-semibold uppercase text-white">{getInitials(group.name)}</span>
                            <div className="min-w-0">
                              <p className="truncate font-['Inter'] text-[13px] font-semibold text-[#000000]">{group.name}</p>
                              <p className="font-['Inter'] text-[12px] text-[#a39e98]">{group.code} · {group.sessions.length} sesi · {group.totalPaket} paket · {group.unpaidSessions} belum dibayar · {group.paidSessions} sudah{group.lockedSessions > 0 ? ` · 🔒 ${group.lockedSessions} terkunci` : ''}</p>
                            </div>
                          </div>
                          <div className="grid shrink-0 gap-0.5 text-right">
                            <span className="font-['Inter'] text-[13px] font-semibold tabular-nums text-[#000000]">{formatCurrency(group.totalUpah)}</span>
                            <span className="font-['Inter'] text-[11px] text-[#a39e98]">total petugas</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                    {group.sessions.map((s) => (
                      <tr key={s.id} className="bg-white transition-colors hover:bg-[#fbfaf9]">
                        <Td className="px-4"><input type="checkbox" className="h-4 w-4 rounded border-[#dddddd] accent-[#000000] disabled:opacity-30" checked={selectedSessionIds.has(s.id)} disabled={lockedSessionDraftNo.has(s.id)} title={lockedSessionDraftNo.get(s.id) ? `Terkunci di ${lockedSessionDraftNo.get(s.id)?.draftNo}` : undefined} onChange={() => toggleSessionSelection(s.id)} aria-label={`Pilih sesi ${s.packerNameSnapshot}`} /></Td>
                        <Td>
                          <div className="ml-4 grid gap-1 border-l border-[#e6e6e6] pl-3">
                            <span className="font-['Inter'] text-[13px] font-medium text-[#000000]">{formatSessionDateLabel(s.startedAt)}</span>
                            <span className="font-['Inter'] text-[11px] text-[#a39e98]">{formatPackingSessionStatus(s.status)}{s.createdByOperatorName && (s.createdByOperatorName !== s.packerOperatorName || s.createdByOperatorCode !== s.packerOperatorCode) ? ` · Atas nama ${s.createdByOperatorName} (${s.createdByOperatorCode})` : ''}</span>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1.5">
                            {s.paidAt ? <span className="inline-flex rounded-lg bg-[#000000] px-2 py-0.5 font-['Inter'] text-[11px] font-semibold text-white">Dibayar</span> : lockedSessionDraftNo.has(s.id) ? <button type="button" onClick={() => scrollToPending(lockedSessionDraftNo.get(s.id)?.draftId)} title={`Terkunci di ${lockedSessionDraftNo.get(s.id)?.draftNo} — klik untuk lihat`} className="inline-flex items-center gap-1 rounded-lg border border-[#000000] bg-[#000000] px-2 py-0.5 font-['Inter'] text-[11px] font-semibold text-white hover:bg-[#31302e]">🔒 {lockedSessionDraftNo.get(s.id)?.draftNo}</button> : <span className="inline-flex rounded-lg border border-[#8f8a84] bg-white px-2 py-0.5 font-['Inter'] text-[11px] font-medium text-[#615d59]">Belum dibayar</span>}
                            {s.status === 'active' ? <span className="inline-flex rounded-lg border border-[#dddddd] bg-white px-2 py-0.5 font-['Inter'] text-[11px] font-medium text-[#615d59]">Aktif</span> : null}
                          </div>
                        </Td>
                        <Td className="text-right">
                          <div className="grid gap-0.5">
                            <span className="font-['Inter'] text-[13px] font-medium tabular-nums text-[#000000]">{formatCurrency(s.totalPayAmount)}</span>
                            <span className="font-['Inter'] text-[12px] tabular-nums text-[#a39e98]">{s.completedPackingCount} paket</span>
                          </div>
                        </Td>
                        <Td className="font-['Inter'] text-[12px] text-[#615d59]" title={`${new Date(s.startedAt).toLocaleString('id-ID')} → ${s.endedAt ? new Date(s.endedAt).toLocaleString('id-ID') : '— masih aktif'}`}>{formatPeriode(s.startedAt, s.endedAt)}</Td>
                        <Td className="px-5">
                          <div className="flex justify-end gap-1.5">
                            {s.status === 'active' ? (
                              <button type="button" onClick={() => askConfirm({ title: 'Tutup sesi ini?', body: `${s.packerNameSnapshot} · ${s.completedPackingCount} paket · ${formatCurrency(s.totalPayAmount)}. Sesi Ditutup tidak bisa diisi lagi.`, confirmLabel: 'Tutup sesi', onConfirm: () => handleCloseSessionInline(s.id) })} className="inline-flex h-8 items-center rounded-lg bg-[#000000] px-3 font-['Inter'] text-[12px] font-medium text-white hover:bg-[#31302e]">Tutup</button>
                            ) : null}
                            <a href={getPackingSessionDetailPath(s.id)} onClick={(e) => { e.preventDefault(); handleOpenDetail(s) }} className="inline-flex h-8 items-center rounded-lg border border-[#dddddd] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">Detail</a>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 p-3 md:hidden">
            {groupedSessions.map((group) => (
              <div key={group.key} className="overflow-hidden rounded-xl border border-[#e6e6e6] bg-white">
                <button
                  type="button"
                  onClick={() => toggleGroupSelection(group.sessions)}
                  className="flex w-full items-center gap-2.5 bg-[#fbfaf9] px-3 py-2.5 text-left"
                  aria-label={`Pilih semua sesi ${group.name}`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#000000] font-['Inter'] text-[12px] font-semibold uppercase text-white">{getInitials(group.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-['Inter'] text-[13px] font-semibold text-[#000000]">{group.name}</span>
                    <span className="block font-['Inter'] text-[11px] text-[#a39e98]">{group.sessions.length} sesi · {group.totalPaket} paket{group.lockedSessions > 0 ? ` · 🔒 ${group.lockedSessions}` : ''}</span>
                  </span>
                  <span className="shrink-0 font-['Inter'] text-[13px] font-semibold tabular-nums text-[#000000]">{formatCurrency(group.totalUpah)}</span>
                </button>
                <ul className="divide-y divide-[#e6e6e6]">
                  {group.sessions.map((s) => {
                    const locked = lockedSessionDraftNo.get(s.id)
                    return (
                      <li key={s.id} className="flex items-center gap-2.5 px-3 py-2.5">
                        <input type="checkbox" className="h-5 w-5 shrink-0 rounded border-[#dddddd] accent-[#000000] disabled:opacity-30" checked={selectedSessionIds.has(s.id)} disabled={Boolean(locked)} onChange={() => toggleSessionSelection(s.id)} aria-label={`Pilih sesi ${s.packerNameSnapshot} ${formatSessionDateLabel(s.startedAt)}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-['Inter'] text-[13px] font-medium text-[#000000]">{formatSessionDateLabel(s.startedAt)}</p>
                          <p className="mt-0.5 font-['Inter'] text-[11px] tabular-nums text-[#a39e98]">{s.completedPackingCount} paket · {formatCurrency(s.totalPayAmount)}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {s.paidAt ? <span className="inline-flex rounded-md bg-[#000000] px-1.5 py-px font-['Inter'] text-[10px] font-semibold text-white">Dibayar</span> : locked ? <span className="inline-flex rounded-md bg-[#000000] px-1.5 py-px font-['Inter'] text-[10px] font-semibold text-white">🔒 {locked.draftNo}</span> : <span className="inline-flex rounded-md border border-[#8f8a84] bg-white px-1.5 py-px font-['Inter'] text-[10px] font-medium text-[#615d59]">Belum dibayar</span>}
                            {s.status === 'active' ? <span className="inline-flex rounded-md border border-[#dddddd] bg-white px-1.5 py-px font-['Inter'] text-[10px] font-medium text-[#615d59]">Aktif</span> : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1">
                          {s.status === 'active' ? (
                            <button type="button" onClick={() => askConfirm({ title: 'Tutup sesi ini?', body: `${s.packerNameSnapshot} · ${s.completedPackingCount} paket · ${formatCurrency(s.totalPayAmount)}. Sesi Ditutup tidak bisa diisi lagi.`, confirmLabel: 'Tutup sesi', onConfirm: () => handleCloseSessionInline(s.id) })} className="h-8 rounded-lg bg-[#000000] px-3 font-['Inter'] text-[12px] font-medium text-white">Tutup</button>
                          ) : null}
                          <a href={getPackingSessionDetailPath(s.id)} onClick={(e) => { e.preventDefault(); handleOpenDetail(s) }} className="inline-flex h-8 items-center justify-center rounded-lg border border-[#dddddd] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#31302e]">Detail</a>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
          </>
        )}
        {filtered.length > 0 ? <p className="border-t border-[#dddddd] bg-[#fbfaf9] px-4 py-3 font-['Inter'] text-[12px] text-[#a39e98] sm:px-5">Menampilkan {filtered.length} dari {sessions.length} sesi · Centang untuk hitung total & share.</p> : null}
      </section>

      <section ref={pendingSectionRef} className={`mt-5 scroll-mt-4 overflow-hidden rounded-xl border bg-white transition-shadow ${pendingFlash ? 'border-[#000000] shadow-[0_0_0_3px_rgba(0,0,0,0.25)]' : 'border-[#e6e6e6]'}`}>
        <div className="flex flex-col gap-2 border-b border-[#e6e6e6] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-['Inter'] text-[14px] font-semibold leading-none text-[#000000]">Pending</h2>
              {drafts.length + pendingLedger.length > 0 ? (
                <span className="inline-flex rounded-full border border-[#e6e6e6] bg-white px-2 py-0.5 font-['Inter'] text-[11px] font-semibold text-[#000000]">{drafts.length + pendingLedger.length} menunggu</span>
              ) : null}
            </div>
            <p className="mt-1 font-['Inter'] text-[12px] leading-4 text-[#a39e98]">Draft yang dikonfirmasi menjadi pembayaran. Sesi di dalam draft terkunci sampai draft selesai.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => void refreshPending()} disabled={draftsLoading || ledgerLoading} className="grid h-10 w-10 place-items-center rounded-full border border-[#e6e6e6] bg-white text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40" aria-label="Refresh pending" title="Refresh"><HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.9} /></Button>
          </div>
        </div>
        {drafts.length === 0 && pendingLedger.length === 0 ? (
          <div className="grid justify-items-center gap-3 rounded-xl bg-[#f6f5f4] px-6 py-8 text-center">
            <div className="font-['Inter'] text-[15px] font-medium leading-6 text-[#000000]">Tidak ada yang pending — semua beres ✓</div>
            <div>
              <Button type="button" variant="ghost" onClick={() => daftarSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="h-9 rounded-lg bg-[#000000] px-4 font-['Inter'] text-[13px] font-medium text-white hover:bg-[#31302e]">Pilih sesi untuk draft</Button>
            </div>
            <div className="max-w-md font-['Inter'] text-[13px] leading-5 text-[#615d59]">Kasbon yang baru ingat bisa dicatat lewat tombol di atas halaman. Pembayaran bisa disimpan sebagai draft tanpa konfirmasi.</div>
          </div>
        ) : (
          <div className="grid gap-6 bg-[#f6f5f4] p-4 sm:p-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-['Inter'] text-[12px] font-semibold uppercase tracking-[0.125px] text-[#615d59]">Draft pembayaran ({drafts.length})</p>
                {drafts.length > 0 ? <span className="font-['Inter'] text-[12px] tabular-nums text-[#a39e98]">estimasi {formatCurrency(pendingTotals.draftEstimasi)}</span> : null}
              </div>
              {drafts.length === 0 ? (
                <p className="rounded-xl border border-[#e6e6e6] bg-white px-6 py-8 text-center font-['Inter'] text-[13px] text-[#615d59]">Belum ada draft. Pilih sesi → Bayar → Simpan pending.</p>
              ) : (
                <ul className="grid gap-4">
                  {drafts.map((draft) => {
                    const expanded = expandedDraftId === draft.id
                    const allAdj = [...draft.adjustments, ...draft.ledgerItems]
                    const sticker = packerSticker(`${draft.packerOperatorName}::${draft.packerOperatorCode}`)
                    return (
                      <li key={draft.id} className="overflow-hidden rounded-xl border border-[#e6e6e6] bg-white">
                        <div className="flex items-center gap-4 p-6 pb-5">
                          <button type="button" onClick={() => setExpandedDraftId(expanded ? null : draft.id)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full font-['Inter'] text-[13px] font-semibold uppercase" style={{ backgroundColor: sticker.bg, color: sticker.fg }} aria-expanded={expanded} aria-label={expanded ? 'Tutup rincian draft' : 'Buka rincian draft'}>
                            {draft.packerNameSnapshot.trim().charAt(0).toUpperCase()}
                          </button>
                          <button type="button" onClick={() => setExpandedDraftId(expanded ? null : draft.id)} className="min-w-0 flex-1 text-left" aria-expanded={expanded}>
                            <p className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.125px] text-[#a39e98]">Draft · {draft.draftNo}</p>
                            <p className="mt-1 flex items-center gap-1.5 font-['Inter'] text-[15px] font-semibold leading-6 text-[#000000]"><span className="truncate">{draft.packerNameSnapshot}</span><span aria-hidden="true" className={`shrink-0 text-[10px] text-[#a39e98] transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span></p>
                            <p className="mt-1 truncate font-['Inter'] text-[13px] tabular-nums text-[#615d59]">{draft.totalSessions} sesi · {draft.totalPackages} paket · {formatPaymentMethodLabel(draft.paymentMethod)}</p>
                          </button>
                          <div className="grid shrink-0 justify-items-end gap-1">
                            <span className="font-['Inter'] text-[20px] font-bold tabular-nums leading-6 tracking-[-0.25px] text-[#000000]">{formatCurrency(draft.estimatedTotal)}</span>
                            <span className="font-['Inter'] text-[11px] uppercase tracking-[0.125px] text-[#a39e98]">estimasi</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-[#e6e6e6] px-6 py-3">
                          <span className="truncate font-['Inter'] text-[12px] text-[#a39e98]">oleh {draft.createdByOperatorName ?? '-'} · {formatDateTimeWIB(draft.createdAt)}</span>
                          <div className="flex shrink-0 gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => void handleCancelDraft(draft)} className="h-9 rounded-lg border border-[#e6e6e6] bg-white px-3.5 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">Batal</Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => void handleConfirmDraft(draft)} className="h-9 rounded-full bg-[#000000] px-6 font-['Inter'] text-[13px] font-medium text-white hover:bg-[#31302e]">Konfirmasi</Button>
                          </div>
                        </div>
                        {expanded ? (
                          <div className="grid gap-2 border-t border-[#e6e6e6] bg-white px-6 py-4">
                            <p className="font-['Inter'] text-[12px] font-semibold uppercase tracking-[0.125px] text-[#a39e98]">Rincian</p>
                            <div className="flex justify-between font-['Inter'] text-[12px] text-[#615d59]"><span>Subtotal upah</span><span className="tabular-nums font-medium text-[#000000]">{formatCurrency(draft.subtotalSnapshot)}</span></div>
                            <div className="flex justify-between font-['Inter'] text-[12px] text-[#615d59]"><span>Metode</span><span className="font-medium text-[#000000]">{formatPaymentMethodLabel(draft.paymentMethod)}</span></div>
                            {allAdj.length > 0 ? (
                              <ul className="grid gap-1 border-t border-[#f0efed] pt-2">
                                {allAdj.map((item, idx) => (
                                  <li key={`${draft.id}-adj-${idx}`} className="flex justify-between gap-2 font-['Inter'] text-[12px] text-[#31302e]"><span className="truncate">{item.kind === 'add' ? '+' : '−'} {item.label}</span><span className={`shrink-0 tabular-nums font-medium ${item.kind === 'add' ? 'text-[#000000]' : 'text-[#991b1b]'}`}>{item.kind === 'add' ? '+' : '−'}{formatCurrency(item.amount)}</span></li>
                                ))}
                              </ul>
                            ) : null}
                            {draft.note ? <p className="font-['Inter'] text-[12px] text-[#615d59]">Catatan: {draft.note}</p> : null}
                            <div className="flex flex-wrap gap-1.5 border-t border-[#f0efed] pt-2">
                              {draft.sessionIds.map((sid) => {
                                const s = sessions.find((row) => row.id === sid)
                                return (
                                  <button
                                    key={sid}
                                    type="button"
                                    title={s ? `${formatSessionDateLabel(s.startedAt)} · ${s.completedPackingCount} paket · ${formatCurrency(s.totalPayAmount)}` : sid}
                                    onClick={() => {
                                      setPackerFilter(`${draft.packerOperatorName}::${draft.packerOperatorCode}`)
                                      setPaidFilter('all')
                                      setStatusFilter('all')
                                      setSearch(sid)
                                      daftarSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                    }}
                                    className="rounded-full border border-[#dddddd] bg-[#f6f5f4] px-2 py-0.5 font-['Inter'] text-[11px] tabular-nums text-[#31302e] hover:bg-[#efedeb]"
                                  >
                                    {s ? `${new Date(s.startedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} · ${s.completedPackingCount} pkt` : sid.slice(0, 8)}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-['Inter'] text-[12px] font-semibold uppercase tracking-[0.125px] text-[#615d59]">Kasbon & bonus menunggu ({pendingLedger.length})</p>
                {pendingLedger.length > 0 ? <span className="font-['Inter'] text-[12px] tabular-nums text-[#a39e98]">net {pendingTotals.ledgerNet >= 0 ? '+' : '−'}{formatCurrency(Math.abs(pendingTotals.ledgerNet))}</span> : null}
              </div>
              {pendingLedger.length === 0 ? (
                <p className="rounded-xl border border-[#e6e6e6] bg-white px-6 py-8 text-center font-['Inter'] text-[13px] text-[#615d59]">Belum ada catatan kasbon/bonus.</p>
              ) : (
                <ul className="grid max-h-[460px] gap-3 overflow-y-auto pr-0.5">
                  {pendingLedger.map((item) => {
                    const dot = item.kind === 'add' ? '#1aae39' : '#dd5b00'
                    return (
                      <li key={item.id} className={`flex items-center gap-3 rounded-xl border bg-white p-4 transition-shadow ${highlightLedgerId === item.id ? 'border-[#000000] shadow-[0_0_0_3px_rgba(0,0,0,0.15)]' : 'border-[#e6e6e6]'}`}>
                        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-['Inter'] text-[14px] font-semibold leading-6 text-[#000000]">{item.label}</p>
                          <p className="mt-0.5 truncate font-['Inter'] text-[12px] text-[#a39e98]">{item.packerNameSnapshot} · dicatat {formatDateTimeWIB(item.createdAt)}{item.note ? ` · ${item.note}` : ''}</p>
                        </div>
                        <span className="shrink-0 font-['Inter'] text-[15px] font-semibold tabular-nums text-[#000000]">{item.kind === 'add' ? '+' : '−'}{formatCurrency(item.amount)}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => void handleCancelLedger(item)} title="Batalkan catatan" aria-label={`Batalkan ${item.label}`} className="h-8 w-8 shrink-0 rounded-lg border border-[#e6e6e6] text-[#a39e98] hover:bg-[#f6f5f4] hover:text-[#000000]">✕</Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>


      {renderDialogs()}
    </div>
  )
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts.slice(0, 2).map((part) => part[0]).join('')
}

// Sticker palette dekoratif (Notion DS): hanya untuk dot/tile kategori, bukan aksi.
const PACKER_STICKERS = [
  { bg: '#62aef0', fg: '#ffffff' },
  { bg: '#d6b6f6', fg: '#391c57' },
  { bg: '#ff64c8', fg: '#ffffff' },
  { bg: '#dd5b00', fg: '#ffffff' },
  { bg: '#2a9d99', fg: '#ffffff' },
  { bg: '#1aae39', fg: '#ffffff' },
] as const

function packerSticker(key: string) {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return PACKER_STICKERS[hash % PACKER_STICKERS.length] ?? PACKER_STICKERS[0]
}

function StatCard({ label, value, subLabel, icon }: { label: string; value: string; subLabel?: string; icon: typeof Package01Icon }) {
  return (
    <article className="rounded-[12px] border border-[#e6e6e6] bg-white p-5">
      <div className="grid gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">{label}</div>
          <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-[#f6f5f4] text-[#31302e]">
            <HugeiconsIcon icon={icon} size={16} strokeWidth={1.9} />
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-['Inter'] text-[26px] font-bold leading-none tracking-[-0.5px] text-[#000000]">{value}</span>
          {subLabel ? <span className="font-['Inter'] text-[12px] leading-none text-[#615d59]">{subLabel}</span> : null}
        </div>
      </div>
    </article>
  )
}

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`bg-[#f6f5f4] px-4 py-3 text-left font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98] ${className}`}>{children}</th>
}

function Td({ children, className = '', title }: { children: ReactNode; className?: string; title?: string }) {
  return <td title={title} className={`bg-white px-4 py-3 align-top font-['Inter'] text-[14px] text-[#31302e] ${className}`}>{children}</td>
}

function NativeSelect({ value, onChange, options, placeholder, placeholderValue = 'all', icon, compact, className = '' }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string; placeholderValue?: string; icon?: typeof UserGroupIcon; compact?: boolean; className?: string }) {
  return (
    <label className={`relative inline-flex min-w-0 items-center rounded-lg border bg-white text-[#000000] ${compact ? 'h-8 border-[#e6e6e6]' : 'h-10 border-[#dddddd]'} ${className}`}>
      {icon ? (
        <span className="pointer-events-none absolute left-3 grid place-items-center text-[#31302e]">
          <HugeiconsIcon icon={icon} size={17} strokeWidth={1.9} />
        </span>
      ) : null}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`h-full w-full min-w-0 max-w-full overflow-hidden text-ellipsis appearance-none rounded-lg bg-transparent font-['Inter'] font-medium focus:outline-none focus:ring-0 ${compact ? 'text-[12px]' : 'text-[13px]'} ${icon ? 'pl-9 pr-8' : 'px-3 pr-8'}`}>
        {placeholder ? <option value={placeholderValue}>{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 grid place-items-center text-[#a39e98]">
        <HugeiconsIcon icon={ArrowDown01Icon} size={15} strokeWidth={1.9} />
      </span>
    </label>
  )
}

// @ts-ignore TS6133 - kept for future use, detail now hides durasi per request
function formatSessionDuration(startedAt: string, endedAt: string | null) {
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '-'

  const minutes = Math.max(1, Math.round((end - start) / 60000))
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return hours > 0 ? `${hours}j ${remainder}m` : `${minutes}m`
}
