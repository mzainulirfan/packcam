import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  Cancel01Icon,
  Copy01Icon,
  Delete02Icon,
  DollarCircleIcon,
  Download01Icon,
  Edit02Icon,
  LockPasswordIcon,
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
import { cancelPackerAdjustmentApi, cancelPackingPaymentDraftApi, closePackingSessionApi, confirmPackingPaymentDraftApi, createPackerAdjustmentApi, createPackingPaymentApi, createPackingPaymentDraftApi, deletePackingSessionApi, mergePackingSessionsApi, readPackerAdjustmentsApi, readPackingPaymentDraftsApi, readPackingPaymentsApi, readPackingPayRulesApi, readPackingSessionsApi, readServerHistoryRecordingsApi, updatePackingRecordingPayRuleApi } from '@pakti/api-client'
import type { PackerAdjustment, PackingPayment, PackingPaymentDraft, PackingPayRule, PackingWorkSession } from '@pakti/types'
import { downloadTextFile } from '@pakti/shared'
import { recordsToCsv } from '@pakti/shared/exporters'
import { navigateTo, navigateToPackingSessionDetail } from '../app/uiState'
import { getPackingSessionDetailPath } from '../app/navigation'

type SessionOrderItem = {
  productName: string
  variationName?: string | null
  quantity: number
}

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
  const [selected, setSelected] = useState<PackingWorkSession | null>(null)
  const [records, setRecords] = useState<Awaited<ReturnType<typeof readServerHistoryRecordingsApi>>['records']>([])
  const [detailLoading, setDetailLoading] = useState(false)
  void setSelected; void records; void detailLoading; void setDetailLoading
  const [payments, setPayments] = useState<PackingPayment[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
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
  const [ledgerPacker, setLedgerPacker] = useState('all')
  const [ledgerKind, setLedgerKind] = useState<'add' | 'deduct'>('deduct')
  const [ledgerLabel, setLedgerLabel] = useState('')
  const [ledgerAmount, setLedgerAmount] = useState('')
  const [ledgerNote, setLedgerNote] = useState('')
  const [lastPayment, setLastPayment] = useState<PackingPayment | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [shareDraft, setShareDraft] = useState<{ title: string; text: string } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [payRules, setPayRules] = useState<PackingPayRule[]>([])
  const [payRuleBusyId, setPayRuleBusyId] = useState<string | null>(null)
  const [payRuleEditTarget, setPayRuleEditTarget] = useState<{ id: string; resiNumber: string; packingPayRuleId?: string | null; packingPayBreakdown?: { ruleName?: string; payType?: string; amount?: number; quantity?: number; total?: number; manualOverride?: boolean } | null; packingPayAmount?: number | null } | null>(null)
  const [payRuleEditSelectedId, setPayRuleEditSelectedId] = useState<string>('')
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!moreMenuRef.current?.contains(e.target as Node)) setShowMoreMenu(false)
    }
    if (showMoreMenu) document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [showMoreMenu])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [data, pays, rules, draftList, ledger] = await Promise.all([
        readPackingSessionsApi(100),
        readPackingPaymentsApi(50).catch(() => [] as PackingPayment[]),
        readPackingPayRulesApi().catch(() => [] as PackingPayRule[]),
        readPackingPaymentDraftsApi('draft', 50).catch(() => [] as PackingPaymentDraft[]),
        readPackerAdjustmentsApi({ status: 'pending', limit: 100 }).catch(() => [] as PackerAdjustment[]),
      ])
      setSessions(data as PackingWorkSession[])
      setPayments(pays as PackingPayment[])
      setPayRules(rules as PackingPayRule[])
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

  async function loadPayments() {
    setPaymentsLoading(true)
    try {
      const data = await readPackingPaymentsApi(50)
      setPayments(data as PackingPayment[])
    } catch {
      // ignore
    } finally {
      setPaymentsLoading(false)
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sessions.filter((s) => {
      const matchesSearch = !q || `${s.packerNameSnapshot} ${s.packerCodeSnapshot} ${s.id}`.toLowerCase().includes(q)
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter
      const matchesPacker = packerFilter === 'all' || `${s.packerOperatorName}::${s.packerOperatorCode}` === packerFilter
      const isPaid = Boolean(s.paidAt)
      const matchesPaid = paidFilter === 'all' || (paidFilter === 'paid' ? isPaid : !isPaid)
      return matchesSearch && matchesStatus && matchesPacker && matchesPaid
    })
  }, [sessions, search, statusFilter, packerFilter, paidFilter])

  const groupedSessions = useMemo(() => {
    const map = new Map<string, { key: string; name: string; code: string; sessions: PackingWorkSession[]; totalPaket: number; totalUpah: number; paidSessions: number; unpaidSessions: number }>()

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
      }
      group.sessions.push(session)
      group.totalPaket += session.completedPackingCount ?? 0
      group.totalUpah += session.totalPayAmount ?? 0
      if (session.paidAt) group.paidSessions += 1
      else group.unpaidSessions += 1
      map.set(key, group)
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [filtered])

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

  const lockedSessionDraftNo = useMemo(() => {
    const map = new Map<string, string>()
    for (const draft of drafts) {
      if (draft.status !== 'draft') continue
      for (const sid of draft.sessionIds) {
        if (!map.has(sid)) map.set(sid, draft.draftNo)
      }
    }
    return map
  }, [drafts])

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
    if (!confirm(`Gabung ${selectedSessionIds.size} sesi terpilih menjadi 1 sesi?`)) return
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
  }

  async function handleClose(id: string) {
    if (!confirm('Tutup sesi packing ini?')) return
    try {
      const updated = await closePackingSessionApi(id)
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? (updated as PackingWorkSession) : s)))
      if (selected?.id === id) setSelected(updated as PackingWorkSession)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal tutup sesi')
    }
  }

  async function handleDeleteSession(s: PackingWorkSession) {
    if (!canDeleteSession(s)) {
      alert('Hanya sesi closed yang kosong dan belum dibayar yang bisa dihapus.')
      return
    }
    if (!confirm(`Hapus sesi kosong ${s.packerNameSnapshot} (${s.packerCodeSnapshot})? Aksi ini tidak bisa dibatalkan.`)) return
    try {
      await deletePackingSessionApi(s.id)
      setSessions((prev) => prev.filter((item) => item.id !== s.id))
      setSelectedSessionIds((current) => {
        const next = new Set(current)
        next.delete(s.id)
        return next
      })
      if (selected?.id === s.id) setSelected(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal hapus sesi')
    }
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
    const skippedText = deletePreview.invalidCount > 0 ? ` ${deletePreview.invalidCount} sesi lain dilewati karena tidak kosong/belum closed/sudah dibayar.` : ''
    if (!confirm(`Hapus ${deletePreview.deletable.length} sesi kosong terpilih?${skippedText} Aksi ini tidak bisa dibatalkan.`)) return

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
      if (selected && deletedIds.has(selected.id)) setSelected(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal hapus sesi terpilih')
      await load()
    } finally {
      setDeleteBusy(false)
    }
  }

  function handleOpenDetail(s: PackingWorkSession) {
    navigateToPackingSessionDetail(s.id)
  }

  // keep handleOpenDetail used via anchor below

  function openPayRuleEdit(record: { id: string; resiNumber: string; packingPayRuleId?: string | null; packingPayBreakdown?: { ruleName?: string; payType?: string; amount?: number; quantity?: number; total?: number; manualOverride?: boolean } | null; packingPayAmount?: number | null }) {
    if (!selected || selected.paidAt || selected.paymentId) {
      alert('Pay rule tidak bisa diubah karena sesi sudah dibayar.')
      return
    }
    if (payRules.length === 0) {
      alert('Belum ada pay rule tersedia.')
      return
    }
    setPayRuleEditTarget(record)
    setPayRuleEditSelectedId(record.packingPayRuleId ?? '')
  }

  function closePayRuleEdit() {
    if (payRuleBusyId) return
    setPayRuleEditTarget(null)
    setPayRuleEditSelectedId('')
  }

  async function handleConfirmPayRuleEdit() {
    if (!payRuleEditTarget) return
    const recordId = payRuleEditTarget.id
    const ruleId = payRuleEditSelectedId
    if (!selected || selected.paidAt || selected.paymentId) {
      alert('Pay rule tidak bisa diubah karena sesi sudah dibayar.')
      return
    }
    if (!ruleId) {
      alert('Pilih pay rule terlebih dahulu.')
      return
    }
    setPayRuleBusyId(recordId)
    try {
      const updated = await updatePackingRecordingPayRuleApi(recordId, ruleId)
      setRecords((prev: typeof records) => prev.map((record: typeof records[number]) => (record.id === (updated as unknown as { id: string }).id ? (updated as unknown as typeof records[number]) : record)))
      const refreshedSessions = await readPackingSessionsApi(100)
      setSessions(refreshedSessions as PackingWorkSession[])
      const refreshedSelected = refreshedSessions.find((session) => session.id === selected.id)
      if (refreshedSelected) setSelected(refreshedSelected as PackingWorkSession)
      setPayRuleEditTarget(null)
      setPayRuleEditSelectedId('')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal mengubah pay rule.')
    } finally {
      setPayRuleBusyId(null)
    }
  }

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

  function handleExportPayments() {
    if (payments.length === 0) {
      alert('Belum ada pembayaran.')
      return
    }
    const csv = ['payment_no,packer_name,packer_code,sesi,paket,subtotal,penyesuaian,upah,metode,paid_at,note,adjustment_detail', ...payments.map((p) => {
      const subtotal = p.subtotalAmount ?? p.totalAmount
      const adj = p.adjustmentTotal ?? 0
      const detail = (p.adjustments ?? []).map((item) => `${item.kind === 'add' ? '+' : '-'}${item.label} Rp${item.amount}`).join('|').replace(/,/g, ';')
      return `${p.paymentNo},${p.packerNameSnapshot},${p.packerCodeSnapshot},${p.totalSessions},${p.totalPackages},${subtotal},${adj},${p.totalAmount},${p.paymentMethod},${p.paidAt},${(p.note ?? '').replace(/,/g, ';')},${detail}`
    })].join('\n')
    downloadTextFile(`packing-payments-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8')
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

  function handleExportDetail() {
    if (!selected || records.length === 0) {
      alert('Tidak ada data untuk export.')
      return
    }
    const csv = recordsToCsv(records)
    downloadTextFile(`packing-session-${selected.packerCodeSnapshot}-${selected.id.slice(0, 8)}.csv`, csv, 'text/csv;charset=utf-8')
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

  function paymentSessionLookup(payment: PackingPayment) {
    const byId = new Map(sessions.map((s) => [s.id, s] as const))
    return payment.sessionIds.map((id) => byId.get(id)).filter(Boolean) as PackingWorkSession[]
  }

  function formatLongDate(iso: string) {
    try {
      const d = new Date(iso)
      const date = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      return `${date} pukul ${time} WIB`
    } catch {
      return new Date(iso).toLocaleString('id-ID')
    }
  }

  function formatShortDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return new Date(iso).toLocaleDateString('id-ID')
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

  function buildPaymentShareText(payment: PackingPayment) {
    const linked = paymentSessionLookup(payment)
    const metodeLabel = payment.paymentMethod === 'cash' ? 'Tunai' : payment.paymentMethod === 'transfer' ? 'Transfer' : 'Lainnya'
    const firstName = payment.packerNameSnapshot.split(' ')[0]
    const subtotal = payment.subtotalAmount ?? payment.totalAmount
    const adjustments = payment.adjustments ?? []
    const adjustmentTotal = payment.adjustmentTotal ?? 0
    const lines = [
      `Halo Kak ${firstName} 👋`,
      ``,
      `Kabar baik — pembayaran upah packing kamu sudah selesai diproses ✓`,
      ``,
      `Petugas: ${payment.packerNameSnapshot} (${payment.packerCodeSnapshot})`,
      `No. Pembayaran: ${payment.paymentNo}`,
      `Tanggal bayar: ${formatLongDate(payment.paidAt)}`,
      `Metode: ${metodeLabel} (${payment.paymentMethod})`,
      payment.note ? `Catatan: ${payment.note}` : null,
      ``,
      `Subtotal upah: ${formatCurrency(subtotal)}`,
      ...adjustments.map((item) => `${item.kind === 'add' ? '+' : '−'} ${item.label}: ${formatCurrency(item.amount)}`),
      adjustmentTotal !== 0 ? `Penyesuaian: ${adjustmentTotal > 0 ? '+' : '−'}${formatCurrency(Math.abs(adjustmentTotal)).replace('Rp', 'Rp')}` : null,
      `Total dibayar: ${formatCurrency(payment.totalAmount)}`,
      `Rincian: ${payment.totalSessions} sesi • ${payment.totalPackages} paket`,
      ``,
    ].filter(Boolean) as string[]
    if (linked.length > 0) {
      lines.push(`Detail sesi:`)
      linked.forEach((s, idx) => {
        lines.push(`${idx + 1}. ${formatShortDate(s.startedAt)} • ${s.completedPackingCount} paket • ${formatCurrency(s.totalPayAmount)}`)
      })
      lines.push(``)
    } else if (payment.sessionIds.length > 0) {
      lines.push(`Detail sesi tidak tersedia di perangkat ini.`, `ID sesi: ${payment.sessionIds.slice(0, 5).join(', ')}${payment.sessionIds.length > 5 ? '…' : ''}`, ``)
    }
    lines.push(`Dibayar oleh: ${payment.paidByOperatorName} (${payment.paidByOperatorCode})`, ``, `Mohon dicek dan konfirmasi ya. Terima kasih banyak atas kerja kerasnya 🙏`)
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
      const t = buildPaymentShareText(payment as PackingPayment)
      setShareDraft({ title: `Pembayaran ${payment.paymentNo}`, text: t })
      setShowPayDialog(false)
      setSelectedSessionIds(new Set())
      setPayAdjustments([])
      setCheckedLedgerIds(new Set())
      await load()
      await loadPayments()
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
    if (!confirm(`Konfirmasi pembayaran ${draft.draftNo}? Sesi akan ditandai dibayar dan tidak bisa diubah.`)) return
    try {
      const result = await confirmPackingPaymentDraftApi(draft.id)
      setLastPayment(result.payment as PackingPayment)
      const t = buildPaymentShareText(result.payment as PackingPayment)
      setShareDraft({ title: `Pembayaran ${result.payment.paymentNo}`, text: t })
      setSelectedSessionIds(new Set())
      await load()
      await loadPayments()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal konfirmasi draft.')
      await refreshPending()
    }
  }

  async function handleCancelDraft(draft: PackingPaymentDraft) {
    if (!confirm(`Batalkan draft ${draft.draftNo}? Sesi akan bebas dipilih lagi.`)) return
    try {
      await cancelPackingPaymentDraftApi(draft.id)
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal membatalkan draft.')
    }
  }

  async function handleCancelLedger(item: PackerAdjustment) {
    if (!confirm(`Batalkan catatan "${item.label}" (${formatCurrency(item.amount)})?`)) return
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
  }

  function openLedgerDialog(presetPacker = 'all') {
    setLedgerError(null)
    setLedgerKind('deduct')
    setLedgerLabel('')
    setLedgerAmount('')
    setLedgerNote('')
    setLedgerPacker(presetPacker !== 'all' ? presetPacker : (packerFilter !== 'all' ? packerFilter : 'all'))
    setShowLedgerDialog(true)
  }

  async function handleCreateLedger() {
    const [name, code] = ledgerPacker.split('::')
    if (!name || !code) {
      setLedgerError('Pilih petugas dulu.')
      return
    }
    const amount = parseAdjustmentAmount(ledgerAmount)
    if (!ledgerLabel.trim()) {
      setLedgerError('Keterangan wajib diisi (mis: Kasbon, Bonus rapi).')
      return
    }
    if (amount <= 0) {
      setLedgerError('Nominal harus lebih dari Rp 0.')
      return
    }
    setLedgerBusy(true)
    setLedgerError(null)
    try {
      await createPackerAdjustmentApi({ packerOperatorName: name, packerOperatorCode: code, label: ledgerLabel.trim().slice(0, 100), kind: ledgerKind, amount, note: ledgerNote.trim() || null })
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
                    <HugeiconsIcon icon={Copy01Icon} size={16} strokeWidth={1.9} /> {copiedKey === 'draft' ? 'Copied' : 'Copy'}
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
                      <Button type="button" variant="ghost" onClick={() => { const t = buildSelectionShareText(); if (t) void copyText(t, 'selection') }} className="h-7 flex-1 rounded-[8px] border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.9} /> {copiedKey === 'selection' ? 'Copied' : 'Copy ringkasan'}</Button>
                      <Button type="button" variant="ghost" onClick={() => { const t = buildSelectionShareText(); if (t) setShareDraft({ title: 'Ringkasan packing', text: t }) }} className="h-7 flex-1 rounded-[8px] border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={SentIcon} size={14} strokeWidth={1.9} /> WA</Button>
                    </div>
                  </div>
                </section>
                <section className="overflow-hidden rounded-[8px] border border-[#e6e6e6] bg-white">
                  <button type="button" onClick={() => setAdjustOpen((v) => !v)} aria-expanded={adjustOpen} className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-[#fbfaf9]">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#000000] font-['Inter'] text-[11px] font-bold text-white">2</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-['Inter'] text-[13px] font-semibold text-[#000000]">Penyesuaian</span>
                      <span className="block truncate font-['Inter'] text-[12px] tabular-nums text-[#a39e98]">{activePayAdjustments.length === 0 ? 'Tidak ada — total = subtotal upah' : `${activePayAdjustments.length} aktif · ${payAdjustmentSummary.adjustmentTotal > 0 ? '+' : payAdjustmentSummary.adjustmentTotal < 0 ? '−' : ''}${formatCurrency(Math.abs(payAdjustmentSummary.adjustmentTotal))}`}</span>
                    </span>
                    <span className={`shrink-0 font-['Inter'] text-[14px] text-[#615d59] transition-transform ${adjustOpen ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
                  </button>
                  {adjustOpen ? (
                  <div className="grid gap-2 border-t border-[#e6e6e6] px-4 py-3">
                  <p className="font-['Inter'] text-[12px] leading-5 text-[#615d59]">Centang kasbon/bonus yang <span className="font-medium text-[#31302e]">tersimpan</span>, atau tambah baris <span className="font-medium text-[#31302e]">manual</span> sekali pakai.</p>
                  {payLedgerOptions.length > 0 ? (
                    <div className="grid gap-1.5">
                      {payLedgerOptions.map((item) => {
                        const checked = checkedLedgerIds.has(item.id)
                        return (
                          <label key={item.id} className={`flex cursor-pointer items-center gap-2.5 rounded-[8px] border bg-white px-3 py-2 transition-colors ${checked ? 'border-[#000000]' : 'border-[#e6e6e6]'}`}>
                            <input type="checkbox" className="h-4 w-4 shrink-0 rounded border-[#dddddd] accent-[#000000]" checked={checked} onChange={() => setCheckedLedgerIds((prev) => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next })} aria-label={`Ikutkan ${item.label}`} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-['Inter'] text-[12px] text-[#31302e]" title={item.label}>{item.label}</span>
                              <span className="block font-['Inter'] text-[11px] text-[#a39e98]">Tersimpan · oleh {item.createdByOperatorName ?? '-'}</span>
                            </span>
                            <span className={`shrink-0 font-['Inter'] text-[12px] font-semibold tabular-nums ${item.kind === 'add' ? 'text-[#000000]' : 'text-[#991b1b]'}`}>{item.kind === 'add' ? '+' : '−'}{formatCurrency(item.amount)}</span>
                          </label>
                        )
                      })}
                    </div>
                  ) : null}
                  {payAdjustmentSummary.items.length > 0 ? (
                    <div className="grid gap-2">
                      {payAdjustmentSummary.items.map((item) => (
                        <div key={item.id} className="grid grid-cols-[76px_1fr] gap-2 rounded-[8px] border border-dashed border-[#8f8a84] bg-white p-2">
                          <select value={item.kind} onChange={(e) => updatePayAdjustmentRow(item.id, { kind: e.target.value as 'add' | 'deduct' })} className="h-8 rounded-[4px] border border-[#e6e6e6] bg-white px-1 font-['Inter'] text-[12px] font-medium text-[#000000] focus:outline-none" aria-label="Tipe penyesuaian">
                            <option value="add">+ Tambah</option>
                            <option value="deduct">− Kurang</option>
                          </select>
                          <div className="grid gap-2">
                            <div className="flex gap-2">
                              <Input value={item.label} onChange={(e) => updatePayAdjustmentRow(item.id, { label: e.target.value })} placeholder="mis: Bonus rapi / Koreksi kurang bayar" className="h-8 flex-1 rounded-[4px] border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" maxLength={100} aria-label="Keterangan penyesuaian" />
                              <Button type="button" variant="ghost" size="icon" onClick={() => removePayAdjustmentRow(item.id)} className="h-8 w-8 shrink-0 rounded-[4px] border border-[#e6e6e6] text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]" aria-label="Hapus penyesuaian">
                                <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.9} />
                              </Button>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-['Inter'] text-[12px] text-[#a39e98]">Rp</span>
                              <Input value={item.amount} onChange={(e) => updatePayAdjustmentRow(item.id, { amount: e.target.value })} inputMode="numeric" placeholder="0" className="h-8 flex-1 rounded-[4px] border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[13px] tabular-nums placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" aria-label="Nominal penyesuaian" />
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
                    {['Bonus rapi', 'Kasbon', 'Kurang bayar lalu'].map((preset) => (
                      <button key={preset} type="button" onClick={() => { if (payAdjustments.length >= 10) { alert('Maksimal 10 baris penyesuaian.'); return } const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; setPayAdjustments((prev) => [...prev, { id, kind: preset === 'Bonus rapi' || preset === 'Kurang bayar lalu' ? 'add' : 'deduct', label: preset, amount: '' }]) }} className="h-7 rounded-full border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[12px] text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]">{preset}</button>
                    ))}
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
          <DialogContent showCloseButton={false} className="packing-modal max-w-md gap-0 overflow-hidden rounded-[12px] border border-[#e6e6e6] bg-white p-0 font-['Inter'] shadow-[0_23px_52px_rgba(0,0,0,0.08),0_4px_18px_rgba(0,0,0,0.06)]">
            <div className="border-b border-[#e6e6e6] bg-white p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="grid gap-1.5">
                  <DialogTitle className="font-['Inter'] text-[20px] font-semibold leading-none tracking-[-0.5px] text-[#000000]">Catat kasbon / bonus</DialogTitle>
                  <DialogDescription className="font-['Inter'] text-[12px] leading-5 text-[#615d59]">Tersimpan sebagai pending per petugas. Otomatis disarankan saat bayar nanti — tanpa harus bayar sekarang.</DialogDescription>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setShowLedgerDialog(false)} className="h-8 w-8 shrink-0 rounded-[8px] border border-[#e6e6e6] bg-white text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]">
                  <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.9} />
                </Button>
              </div>
            </div>
            <div className="grid gap-4 bg-[#f6f5f4] p-5">
              <div className="grid gap-1.5">
                <Label className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Petugas</Label>
                <NativeSelect value={ledgerPacker} onChange={setLedgerPacker} options={packerOptions.map((op) => ({ value: `${op.name}::${op.code}`, label: op.label }))} placeholder="Pilih petugas" placeholderValue="" />
              </div>
              <div className="grid gap-1.5">
                <Label className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Tipe</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setLedgerKind('deduct')} className={`h-9 rounded-[8px] border font-['Inter'] text-[13px] font-medium ${ledgerKind === 'deduct' ? 'border-[#000000] bg-[#000000] text-white' : 'border-[#e6e6e6] bg-white text-[#31302e] hover:bg-[#f6f5f4]'}`}>− Kurang (kasbon)</button>
                  <button type="button" onClick={() => setLedgerKind('add')} className={`h-9 rounded-[8px] border font-['Inter'] text-[13px] font-medium ${ledgerKind === 'add' ? 'border-[#000000] bg-[#000000] text-white' : 'border-[#e6e6e6] bg-white text-[#31302e] hover:bg-[#f6f5f4]'}`}>+ Tambah (bonus)</button>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Keterangan</Label>
                <Input value={ledgerLabel} onChange={(e) => setLedgerLabel(e.target.value)} placeholder="mis: Kasbon 20 Jan / Bonus rapi" maxLength={100} className="h-9 rounded-[4px] border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" />
              </div>
              <div className="grid gap-1.5">
                <Label className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Nominal (Rp)</Label>
                <Input value={ledgerAmount} onChange={(e) => setLedgerAmount(e.target.value)} inputMode="numeric" placeholder="0" className="h-9 rounded-[4px] border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[13px] tabular-nums placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" />
              </div>
              <div className="grid gap-1.5">
                <Label className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Catatan (opsional)</Label>
                <Input value={ledgerNote} onChange={(e) => setLedgerNote(e.target.value)} placeholder="mis: titip ke mandor" maxLength={200} className="h-9 rounded-[4px] border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" />
              </div>
              {ledgerError ? <Alert variant="destructive" className="font-['Inter'] text-[13px]"><p>{ledgerError}</p></Alert> : null}
              <div className="flex justify-end gap-2 border-t border-[#e6e6e6] bg-white -mx-5 -mb-5 px-5 py-3">
                <Button type="button" variant="ghost" onClick={() => setShowLedgerDialog(false)} disabled={ledgerBusy} className="h-8 rounded-[8px] border border-[#e6e6e6] bg-white px-4 font-['Inter'] text-[12px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">Batal</Button>
                <Button type="button" onClick={() => void handleCreateLedger()} disabled={ledgerBusy} className="h-8 rounded-[8px] bg-[#000000] px-5 font-['Inter'] text-[12px] font-medium text-white hover:bg-[#31302e] disabled:opacity-40">{ledgerBusy ? 'Menyimpan...' : 'Simpan catatan'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // ── Detail view ───────────────────────────────────────────────────
  if (selected) {
    const selectedIsPaid = Boolean(selected.paidAt)
    const selectedCanDelete = canDeleteSession(selected)
    const paymentLabel = selectedIsPaid ? formatCurrency(selected.paidAmount ?? selected.totalPayAmount) : 'Belum dibayar'

    return (
      <div className="packing-page mx-auto max-w-[1240px] bg-[#f6f5f4] px-4 py-8 font-['Inter'] sm:px-6 lg:py-10 xl:px-8">
        <section className="mb-6 grid gap-4">
          <button type="button" onClick={() => setSelected(null)} className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-[#dddddd] bg-white px-3 py-2 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-white">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.9} /> Riwayat Sesi Packing
          </button>
          <div className="overflow-hidden rounded-2xl border border-[#dddddd] bg-white">
            <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="inline-flex rounded-full border border-[#dddddd] bg-white px-2.5 py-1 font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#615d59]">Detail sesi</div>
                <h1 className="mt-3 max-w-3xl truncate font-['Inter'] text-[34px] font-bold leading-[1.05] tracking-[-1px] text-[#000000] sm:text-[40px]">{selected.packerNameSnapshot}</h1>
                <p className="mt-3 max-w-3xl font-['Inter'] text-[15px] leading-6 text-[#615d59]">{formatPeriode(selected.startedAt, selected.endedAt)} · dibuat oleh {selected.createdByOperatorName ? `${selected.createdByOperatorName} (${selected.createdByOperatorCode ?? '-'})` : '-'}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 font-['Inter'] text-[12px] font-semibold ${selected.status === 'closed' ? 'border-[#000000] bg-[#000000] text-white' : 'border-[#dddddd] bg-white text-[#615d59]'}`}>{selected.status}</span>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 font-['Inter'] text-[12px] font-semibold ${selectedIsPaid ? 'border-[#000000] bg-[#000000] text-white' : 'border-[#dddddd] bg-white text-[#615d59]'}`}>{selectedIsPaid ? 'Dibayar' : 'Belum dibayar'}</span>
                  <span className="inline-flex rounded-full border border-[#dddddd] bg-[#f6f5f4] px-2.5 py-1 font-['Inter'] text-[12px] font-medium text-[#31302e]">{selected.packerCodeSnapshot}</span>
                  <span className="inline-flex rounded-full border border-[#dddddd] bg-white px-2.5 py-1 font-['Inter'] text-[12px] font-medium text-[#615d59]">{selected.id.slice(0, 12)}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button type="button" variant="ghost" onClick={handleExportDetail} disabled={records.length === 0} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40"><HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={1.9} /> Export</Button>
                <Button type="button" variant="ghost" onClick={() => { window.sessionStorage.setItem('pakti.historyPackingSessionId', selected.id); navigateTo('history') }} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">History</Button>
                {selected.status === 'active' ? <Button type="button" variant="ghost" onClick={() => void handleClose(selected.id)} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">Tutup</Button> : null}
                {selectedCanDelete ? <Button type="button" variant="ghost" onClick={() => void handleDeleteSession(selected)} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.9} /> Hapus</Button> : null}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Paket" value={String(selected.completedPackingCount)} subLabel="completed" icon={Package01Icon} />
          <StatCard label="Upah" value={formatCurrency(selected.totalPayAmount)} subLabel="total sesi" icon={DollarCircleIcon} />
          <StatCard label="Payment" value={paymentLabel} subLabel={selectedIsPaid ? 'sudah dibayar' : 'menunggu'} icon={DollarCircleIcon} />
        </section>

        <section className="mt-5 overflow-hidden rounded-xl border border-[#dddddd] bg-white">
          <div className="flex flex-col gap-3 border-b border-[#dddddd] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="font-['Inter'] text-[20px] font-semibold leading-snug tracking-[-0.125px] text-[#000000]">Detail paket sesi</h2>
              <p className="mt-1 font-['Inter'] text-[13px] leading-5 text-[#615d59]">Daftar paket completed yang masuk ke sesi ini. Produk dibersihkan dari metadata Shopee.</p>
            </div>
            <span className="inline-flex w-fit items-center rounded-full border border-[#dddddd] bg-white px-2.5 py-1 font-['Inter'] text-[11px] font-semibold text-[#615d59]">{detailLoading ? 'Loading...' : `${records.length} record`}</span>
          </div>
          {detailLoading ? (
            <div className="grid gap-2 p-6">
              <div className="h-10 animate-pulse rounded-lg bg-[#f6f5f4]" />
              <div className="h-20 animate-pulse rounded-lg bg-[#f6f5f4]" />
              <div className="h-20 animate-pulse rounded-lg bg-[#f6f5f4]" />
            </div>
          ) : records.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#f6f5f4] text-[#615d59]">
                <HugeiconsIcon icon={Package01Icon} size={20} strokeWidth={1.9} />
              </div>
              <div className="mt-3 font-['Inter'] text-[15px] font-semibold text-[#000000]">Belum ada paket completed di sesi ini</div>
              <div className="mt-1 font-['Inter'] text-[13px] text-[#615d59]">Sesi kosong yang sudah closed bisa dihapus dari halaman ini.</div>
              {selectedCanDelete ? <Button type="button" variant="ghost" onClick={() => void handleDeleteSession(selected)} className="mt-4 h-9 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]">Hapus sesi kosong</Button> : null}
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[860px] border-collapse">
                <thead className="bg-[#f6f5f4]">
                  <tr className="text-left">
                    <Th className="w-[56px]">No</Th>
                    <Th>Paket</Th>
                    <Th>Produk</Th>
                    <Th className="text-right">Upah</Th>
                    <Th>Waktu</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e6e6e6] bg-white">
                  {records.map((rec: typeof records[number], index: number) => {
                    const r = rec as unknown as { id: string; resiNumber: string; orderNumber?: string | null; mediaType?: string; packingPayAmount?: number | null; packingPayRuleId?: string | null; packingPayBreakdown?: { ruleName?: string; payType?: string; amount?: number; quantity?: number; total?: number; manualOverride?: boolean } | null; orderSnapshot?: { items?: SessionOrderItem[] } | null; startTime?: string }
                    const itemsLabel = r.orderSnapshot?.items ? formatSessionOrderItems(r.orderSnapshot.items) : '-'
                    const currentRule = payRules.find((rule) => rule.id === r.packingPayRuleId)
                    const currentRuleName = currentRule?.name ?? r.packingPayBreakdown?.ruleName ?? '-'
                    const canEditRule = !selectedIsPaid && payRules.length > 0
                    return (
                      <tr key={r.id ?? `${r.resiNumber}-${index}`} className="bg-white transition-colors hover:bg-[#fbfaf9]">
                        <Td className="font-['Inter'] text-[13px] text-[#a39e98]">{String(index + 1).padStart(2, '0')}</Td>
                        <Td>
                          <div className="grid gap-1">
                            <span className="font-['Inter'] text-[13px] font-semibold text-[#000000]">{r.resiNumber}</span>
                            <span className="font-['Inter'] text-[12px] text-[#a39e98]">{r.orderNumber ? `Order ${r.orderNumber}` : 'Order -'} · {r.mediaType ?? 'video'}</span>
                          </div>
                        </Td>
                        <Td>
                          <p className="max-w-[56rem] font-['Inter'] text-[13px] leading-5 text-[#31302e] [overflow-wrap:anywhere]">{itemsLabel}</p>
                          <div className="mt-2 inline-flex items-center gap-1.5">
                            <span className="rounded-full bg-[#f6f5f4] px-2 py-0.5 font-['Inter'] text-[12px] font-medium text-[#31302e] ring-1 ring-[#e6e6e6]">{currentRuleName}</span>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]" onClick={() => openPayRuleEdit({ id: r.id, resiNumber: r.resiNumber, packingPayRuleId: r.packingPayRuleId, packingPayBreakdown: r.packingPayBreakdown, packingPayAmount: r.packingPayAmount })} disabled={!canEditRule || payRuleBusyId === r.id} title={selectedIsPaid ? 'Terkunci: sudah dibayar' : !canEditRule ? 'Tidak ada pay rule' : 'Ubah pay rule'} aria-label={`Ubah pay rule ${r.resiNumber}`}>
                              {payRuleBusyId === r.id ? <span className="font-['Inter'] text-[11px]">...</span> : <HugeiconsIcon icon={selectedIsPaid ? LockPasswordIcon : Edit02Icon} size={14} strokeWidth={1.9} />}
                            </Button>
                            {payRuleBusyId === r.id ? <span className="font-['Inter'] text-[11px] text-[#a39e98]">menyimpan...</span> : null}
                          </div>
                        </Td>
                        <Td className="text-right font-['Inter'] text-[13px] font-medium tabular-nums text-[#000000]">{r.packingPayAmount != null ? formatCurrency(r.packingPayAmount) : '-'}</Td>
                        <Td className="font-['Inter'] text-[12px] text-[#a39e98]">{r.startTime ? new Date(r.startTime).toLocaleString('id-ID') : '-'}</Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <Dialog open={Boolean(payRuleEditTarget)} onOpenChange={(open) => { if (!open) closePayRuleEdit() }}>
          <DialogContent showCloseButton={false} className="packing-modal max-w-md gap-0 overflow-hidden rounded-2xl border-[#dddddd] bg-white p-0 font-['Inter'] shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
            <div className="border-b border-[#dddddd] p-6">
              <div className="flex items-start justify-between gap-5">
                <div className="grid gap-1">
                  <DialogTitle className="font-['Inter'] text-[18px] font-semibold text-[#000000]">Ubah Pay Rule</DialogTitle>
                  <DialogDescription className="font-['Inter'] text-[13px] leading-5 text-[#615d59]">Pilih pay rule baru untuk paket ini. Perubahan akan menghitung ulang upah paket dan total sesi.</DialogDescription>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={closePayRuleEdit} className="h-9 w-9 shrink-0 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]">
                  <HugeiconsIcon icon={Cancel01Icon} size={19} strokeWidth={1.9} />
                </Button>
              </div>
            </div>
            {payRuleEditTarget ? (
              <div className="grid gap-4 p-6">
                <div className="rounded-[4px] border border-[#dddddd] bg-[#f6f5f4] px-3 py-3">
                  <p className="font-['Inter'] text-[13px] font-semibold text-[#000000]">{payRuleEditTarget.resiNumber}</p>
                  <p className="mt-1 font-['Inter'] text-[12px] leading-5 text-[#615d59]">Saat ini: {payRuleEditTarget.packingPayBreakdown?.ruleName ?? '-'} · {payRuleEditTarget.packingPayBreakdown?.payType ?? '-'} · {payRuleEditTarget.packingPayAmount != null ? formatCurrency(payRuleEditTarget.packingPayAmount) : '-'}{payRuleEditTarget.packingPayBreakdown?.manualOverride ? ' · manual' : ''}</p>
                </div>
                <div className="grid gap-1.5">
                  <Label className="font-['Inter'] text-[12px] font-medium text-[#000000]">Pay rule baru</Label>
                  <NativeSelect value={payRuleEditSelectedId} onChange={setPayRuleEditSelectedId} options={payRules.map((rule) => ({ value: rule.id, label: `${rule.name} · ${formatCurrency(rule.amount)} · ${rule.payType}${rule.active ? '' : ' · nonaktif'}` }))} placeholder="Pilih pay rule" placeholderValue="" />
                  <p className="font-['Inter'] text-[12px] text-[#a39e98]">Rule aktif dengan prioritas lebih tinggi akan dipakai otomatis untuk paket baru; pilihan di sini overrides manual.</p>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="ghost" onClick={closePayRuleEdit} disabled={Boolean(payRuleBusyId)} className="h-10 rounded-full border border-[#dddddd] bg-white px-5 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]">Batal</Button>
                  <Button type="button" onClick={() => void handleConfirmPayRuleEdit()} disabled={Boolean(payRuleBusyId) || !payRuleEditSelectedId || payRuleEditSelectedId === (payRuleEditTarget.packingPayRuleId ?? '')} className="h-10 rounded-full bg-[#000000] px-6 font-['Inter'] text-[13px] font-medium text-white hover:bg-[#31302e] disabled:opacity-40">{payRuleBusyId ? 'Menyimpan...' : 'Simpan'}</Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="packing-page mx-auto max-w-[1240px] bg-[#f6f5f4] px-4 py-8 font-['Inter'] sm:px-6 lg:py-10 xl:px-8">
      <section className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-['Inter'] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Operasional / Sesi Packing</div>
          <h1 className="mt-2 font-['Inter'] text-[32px] font-bold leading-[1.1] tracking-[-0.8px] text-[#000000] sm:text-[36px]">Riwayat Sesi Packing</h1>
          <p className="mt-3 max-w-2xl font-['Inter'] text-[14px] leading-6 text-[#615d59] sm:text-[15px]">Kelola sesi packing per petugas, catat kasbon/bonus kapan saja, simpan pending, lalu bayar atau share ringkasan.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[#dddddd] bg-white px-2.5 py-1 font-['Inter'] text-[11px] font-semibold text-[#615d59]">{loading ? 'Loading' : 'Ready'}</span>
          <Button type="button" variant="ghost" onClick={() => void load()} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.9} /> Refresh</Button>
          <Button type="button" variant="ghost" onClick={() => openLedgerDialog()} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={Edit02Icon} size={16} strokeWidth={1.9} /> Catat kasbon/bonus</Button>
          <Button type="button" variant="ghost" onClick={handleExportAll} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={1.9} /> Export Sesi</Button>
          <Button type="button" variant="ghost" onClick={handleExportPayments} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={1.9} /> Export Bayar</Button>
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
            <Button type="button" variant="ghost" onClick={() => void copyText(buildPaymentShareText(lastPayment), `last-${lastPayment.id}`)} className="h-9 rounded-full border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]">{copiedKey === `last-${lastPayment.id}` ? 'Copied' : 'Copy'}</Button>
            <Button type="button" variant="ghost" onClick={() => setShareDraft({ title: `Pembayaran ${lastPayment.paymentNo}`, text: buildPaymentShareText(lastPayment) })} className="h-9 rounded-full border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]">WA</Button>
            <Button type="button" variant="ghost" onClick={() => setLastPayment(null)} className="h-9 rounded-full px-4 font-['Inter'] text-[13px] text-[#615d59] hover:bg-[#f6f5f4]">Tutup</Button>
          </div>
        </div>
      ) : null}

      <section className="mt-5 overflow-hidden rounded-xl border border-[#dddddd] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#dddddd] bg-[#fbfaf9] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <h2 className="font-['Inter'] text-[14px] font-semibold leading-none text-[#000000]">Daftar Sesi</h2>
            <p className="mt-1 truncate font-['Inter'] text-[12px] leading-none text-[#615d59]">
              {selectedSessionIds.size > 0
                ? `${totals.selectedSessions.length} sesi · ${totals.totalPaket} paket · ${formatCurrency(totals.totalUpah)}${payPreview && !payPreview.valid ? ` · ${payPreview.mixedPacker ? 'pilih 1 petugas saja' : payPreview.notClosedCount > 0 ? `${payPreview.notClosedCount} sesi belum closed` : payPreview.alreadyPaidCount > 0 ? `${payPreview.alreadyPaidCount} sesi sudah dibayar` : payPreview.lockedCount > 0 ? `${payPreview.lockedCount} sesi terkunci pending` : ''}` : deletePreview.invalidCount > 0 ? ` · ${deletePreview.deletable.length} bisa dihapus, ${deletePreview.invalidCount} dilewati` : ''}${canMergeSelected ? ' · bisa digabung' : ''}`
                : `Menampilkan ${filtered.length} dari ${sessions.length} sesi · ${groupedSessions.length} petugas`}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <span className="inline-flex h-7 items-center rounded-lg border border-[#dddddd] bg-[#f6f5f4] px-3 font-['Inter'] text-[12px] font-medium text-[#615d59]">{selectedSessionIds.size} terpilih</span>
            <Button type="button" variant="ghost" onClick={selectAllFilteredSessions} disabled={filtered.length === 0} className="h-7 rounded-lg border border-[#dddddd] bg-white px-3 font-['Inter'] text-[12px] text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40">Pilih semua</Button>
            <Button type="button" variant="ghost" onClick={() => setSelectedSessionIds(new Set())} disabled={selectedSessionIds.size === 0} className="h-7 rounded-lg border border-[#dddddd] bg-white px-3 font-['Inter'] text-[12px] text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40">Reset pilihan</Button>
            {selectedSessionIds.size > 0 ? (
              <>
                <span className="mx-1 hidden h-7 w-px bg-[#e6e6e6] sm:block" aria-hidden="true" />
                <Button type="button" onClick={openPayDialog} disabled={payPreview ? !payPreview.valid : true} className="h-7 rounded-lg bg-[#000000] px-3.5 font-['Inter'] text-[12px] font-medium text-white hover:bg-[#31302e] disabled:opacity-40"><HugeiconsIcon icon={DollarCircleIcon} size={14} strokeWidth={1.9} /> Bayar</Button>
                <div ref={moreMenuRef} className="relative">
                  <Button type="button" variant="ghost" onClick={() => setShowMoreMenu((v) => !v)} className="grid h-7 w-7 place-items-center rounded-lg border border-[#e6e6e6] bg-white text-[#31302e] hover:bg-[#f6f5f4]" aria-label="Aksi lainnya">⋯</Button>
                  {showMoreMenu ? (
                    <div className="absolute right-0 top-[calc(100%+6px)] z-20 grid w-40 gap-1 rounded-[12px] border border-[#e6e6e6] bg-white p-1 shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
                      <button type="button" onClick={() => { setShowMoreMenu(false); void handleMergeSelected() }} disabled={!canMergeSelected || mergeBusy} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40"><HugeiconsIcon icon={Package01Icon} size={14} strokeWidth={1.9} /> {mergeBusy ? 'Menggabung...' : 'Gabung'}</button>
                      <button type="button" onClick={() => { setShowMoreMenu(false); void handleDeleteSelectedSessions() }} disabled={deleteBusy || deletePreview.deletable.length === 0} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-['Inter'] text-[13px] font-medium text-[#991b1b] hover:bg-[#fee2e2] disabled:opacity-40"><HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.9} /> {deleteBusy ? 'Menghapus...' : 'Hapus'}</button>
                    </div>
                  ) : null}
                </div>
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
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari packer / kode / ID sesi..." className="h-8 w-full rounded-[4px] border-[#e6e6e6] bg-white pl-8 pr-3 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" aria-label="Cari sesi" />
            </label>
            <div className="flex flex-wrap gap-2">
              <NativeSelect compact value={packerFilter} onChange={setPackerFilter} options={packerOptions.map((op) => ({ value: `${op.name}::${op.code}`, label: op.label }))} placeholder="Semua petugas" icon={UserGroupIcon} />
              <NativeSelect compact value={paidFilter} onChange={(value) => setPaidFilter(value as typeof paidFilter)} options={[{ value: 'unpaid', label: 'Belum dibayar' }, { value: 'paid', label: 'Sudah dibayar' }]} placeholder="Semua bayar" icon={DollarCircleIcon} />
              <NativeSelect compact value={statusFilter} onChange={(value) => setStatusFilter(value as typeof statusFilter)} options={[{ value: 'active', label: 'active' }, { value: 'closed', label: 'closed' }, { value: 'cancelled', label: 'cancelled' }]} placeholder="Semua status" />
              <Button type="button" variant="ghost" onClick={() => { setSearch(''); setStatusFilter('all'); setPackerFilter('all'); setPaidFilter('unpaid') }} className="inline-flex h-8 items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#615d59] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.9} /> Reset filter</Button>
            </div>
          </div>
        </div>

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
          <div className="overflow-x-auto scrollbar-thin">
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
                              <p className="font-['Inter'] text-[12px] text-[#a39e98]">{group.code} · {group.sessions.length} sesi · {group.totalPaket} paket · {group.unpaidSessions} belum · {group.paidSessions} sudah</p>
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
                        <Td className="px-4"><input type="checkbox" className="h-4 w-4 rounded border-[#dddddd] accent-[#000000] disabled:opacity-30" checked={selectedSessionIds.has(s.id)} disabled={lockedSessionDraftNo.has(s.id)} title={lockedSessionDraftNo.get(s.id) ? `Terkunci di ${lockedSessionDraftNo.get(s.id)}` : undefined} onChange={() => toggleSessionSelection(s.id)} aria-label={`Pilih sesi ${s.packerNameSnapshot}`} /></Td>
                        <Td>
                          <div className="ml-4 grid gap-1 border-l border-[#e6e6e6] pl-3">
                            <span className="font-['Inter'] text-[13px] font-medium text-[#000000]">{formatSessionDateLabel(s.startedAt)}</span>
                            {s.createdByOperatorName && (s.createdByOperatorName !== s.packerOperatorName || s.createdByOperatorCode !== s.packerOperatorCode) ? (
                              <span className="font-['Inter'] text-[11px] text-[#615d59]">Atas nama: {s.createdByOperatorName} ({s.createdByOperatorCode})</span>
                            ) : null}
                          </div>
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1.5">
                            {s.paidAt ? <span className="inline-flex rounded-lg bg-[#000000] px-2 py-0.5 font-['Inter'] text-[11px] font-semibold text-white">Dibayar</span> : lockedSessionDraftNo.has(s.id) ? <span className="inline-flex rounded-lg border border-[#8f8a84] bg-[#f6f5f4] px-2 py-0.5 font-['Inter'] text-[11px] font-medium text-[#31302e]" title={`Terkunci di ${lockedSessionDraftNo.get(s.id)}`}>Pending</span> : <span className="inline-flex rounded-lg border border-[#8f8a84] bg-white px-2 py-0.5 font-['Inter'] text-[11px] font-medium text-[#615d59]">Belum</span>}
                            {s.status === 'active' && !s.createdBySessionId ? <span className="inline-flex rounded-lg border border-[#dddddd] bg-white px-2 py-0.5 font-['Inter'] text-[11px] font-medium text-[#615d59]">Menggantung</span> : null}
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
                          <div className="flex justify-end">
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
        )}
        {filtered.length > 0 ? <p className="border-t border-[#dddddd] bg-[#fbfaf9] px-4 py-3 font-['Inter'] text-[12px] text-[#a39e98] sm:px-5">Menampilkan {filtered.length} dari {sessions.length} sesi · Centang untuk hitung total & share.</p> : null}
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-[#dddddd] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#dddddd] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="font-['Inter'] text-[16px] font-semibold text-[#000000]">Pending</h2>
            <p className="mt-1 font-['Inter'] text-[12px] text-[#a39e98]">{drafts.length} draft pembayaran · {pendingLedger.length} kasbon/bonus menunggu · sesi di draft terkunci</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => openLedgerDialog()} className="h-9 rounded-full border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={Edit02Icon} size={16} strokeWidth={1.9} /> Catat kasbon/bonus</Button>
            <Button type="button" variant="ghost" onClick={() => void refreshPending()} disabled={draftsLoading || ledgerLoading} className="h-9 rounded-full border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40"><HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.9} /> {draftsLoading || ledgerLoading ? 'Memuat...' : 'Refresh'}</Button>
          </div>
        </div>
        {drafts.length === 0 && pendingLedger.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <div className="mt-1 font-['Inter'] text-[14px] font-medium text-[#000000]">Tidak ada yang pending</div>
            <div className="mt-1 font-['Inter'] text-[12px] text-[#a39e98]">Kasbon/bonus yang baru ingat bisa dicatat kapan saja. Pembayaran bisa disimpan sebagai draft tanpa konfirmasi.</div>
          </div>
        ) : (
          <div className="grid gap-0 lg:grid-cols-2">
            <div className="border-b border-[#dddddd] lg:border-b-0 lg:border-r">
              <p className="border-b border-[#e6e6e6] bg-[#fbfaf9] px-4 py-2.5 font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98] sm:px-5">Draft pembayaran ({drafts.length})</p>
              {drafts.length === 0 ? (
                <p className="px-4 py-4 font-['Inter'] text-[12px] text-[#a39e98] sm:px-5">Belum ada draft. Pilih sesi → Bayar → Simpan pending.</p>
              ) : (
                <ul className="divide-y divide-[#e6e6e6]">
                  {drafts.map((draft) => {
                    const expanded = expandedDraftId === draft.id
                    const allAdj = [...draft.adjustments, ...draft.ledgerItems]
                    return (
                      <li key={draft.id} className="px-4 py-3 sm:px-5">
                        <div className="flex items-start justify-between gap-3">
                          <button type="button" onClick={() => setExpandedDraftId(expanded ? null : draft.id)} className="min-w-0 flex-1 text-left">
                            <p className="truncate font-['Inter'] text-[13px] font-semibold text-[#000000]">{draft.draftNo} · {draft.packerNameSnapshot}</p>
                            <p className="mt-0.5 font-['Inter'] text-[12px] tabular-nums text-[#615d59]">{draft.totalSessions} sesi · {draft.totalPackages} paket · estimasi {formatCurrency(draft.estimatedTotal)}</p>
                            <p className="mt-0.5 font-['Inter'] text-[11px] text-[#a39e98]">oleh {draft.createdByOperatorName ?? '-'} · {new Date(draft.createdAt).toLocaleString('id-ID')}</p>
                          </button>
                          <div className="flex shrink-0 gap-1">
                            <Button type="button" variant="ghost" size="sm" onClick={() => void handleConfirmDraft(draft)} className="h-8 rounded-lg bg-[#000000] px-3 font-['Inter'] text-[12px] font-medium text-white hover:bg-[#31302e]">Konfirmasi</Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => void handleCancelDraft(draft)} className="h-8 rounded-lg border border-[#dddddd] bg-white px-3 font-['Inter'] text-[12px] text-[#991b1b] hover:bg-[#fee2e2]">Batal</Button>
                          </div>
                        </div>
                        {expanded ? (
                          <div className="mt-2 rounded-[8px] border border-[#e6e6e6] bg-[#f6f5f4] p-3">
                            <p className="font-['Inter'] text-[12px] text-[#615d59]">Subtotal {formatCurrency(draft.subtotalSnapshot)}{draft.adjustmentTotalSnapshot !== 0 ? ` · penyesuaian ${draft.adjustmentTotalSnapshot > 0 ? '+' : '−'}${formatCurrency(Math.abs(draft.adjustmentTotalSnapshot))}` : ''} · metode {draft.paymentMethod}</p>
                            {allAdj.length > 0 ? (
                              <ul className="mt-1.5 grid gap-1">
                                {allAdj.map((item, idx) => (
                                  <li key={`${draft.id}-adj-${idx}`} className="flex justify-between gap-2 font-['Inter'] text-[12px] text-[#31302e]"><span className="truncate">{item.kind === 'add' ? '+' : '−'} {item.label}</span><span className="shrink-0 tabular-nums">{formatCurrency(item.amount)}</span></li>
                                ))}
                              </ul>
                            ) : null}
                            {draft.note ? <p className="mt-1.5 font-['Inter'] text-[12px] text-[#615d59]">Catatan: {draft.note}</p> : null}
                            <p className="mt-1.5 font-['Inter'] text-[11px] text-[#a39e98]">Sesi: {draft.sessionIds.map((id) => id.slice(0, 8)).join(', ')}</p>
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div>
              <p className="border-b border-[#e6e6e6] bg-[#fbfaf9] px-4 py-2.5 font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98] sm:px-5">Kasbon & bonus menunggu ({pendingLedger.length})</p>
              {pendingLedger.length === 0 ? (
                <p className="px-4 py-4 font-['Inter'] text-[12px] text-[#a39e98] sm:px-5">Belum ada catatan. Baru ingat ada kasbon? Catat di sini.</p>
              ) : (
                <ul className="max-h-[320px] divide-y divide-[#e6e6e6] overflow-y-auto">
                  {pendingLedger.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                      <div className="min-w-0">
                        <p className="truncate font-['Inter'] text-[13px] font-medium text-[#000000]">{item.kind === 'add' ? '+' : '−'} {item.label}</p>
                        <p className="mt-0.5 truncate font-['Inter'] text-[11px] text-[#a39e98]">{item.packerNameSnapshot} ({item.packerCodeSnapshot}) · {formatCurrency(item.amount)} · oleh {item.createdByOperatorName ?? '-'}</p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => void handleCancelLedger(item)} className="h-8 shrink-0 rounded-lg border border-[#dddddd] bg-white px-3 font-['Inter'] text-[12px] text-[#991b1b] hover:bg-[#fee2e2]">Batalkan</Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-[#dddddd] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#dddddd] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="font-['Inter'] text-[16px] font-semibold text-[#000000]">Riwayat Pembayaran</h2>
            <p className="mt-1 font-['Inter'] text-[12px] text-[#a39e98]">{payments.length} pembayaran · terbaru di atas</p>
          </div>
          <Button type="button" variant="ghost" onClick={() => void loadPayments()} disabled={paymentsLoading} className="h-9 rounded-full border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40"><HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.9} /> {paymentsLoading ? 'Memuat...' : 'Refresh'}</Button>
        </div>
        {payments.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[#f6f5f4] text-[#615d59]">
              <HugeiconsIcon icon={DollarCircleIcon} size={20} strokeWidth={1.9} />
            </div>
            <div className="mt-3 font-['Inter'] text-[14px] font-medium text-[#000000]">Belum ada pembayaran</div>
            <div className="mt-1 font-['Inter'] text-[12px] text-[#a39e98]">Pembayaran yang dibuat dari sesi terpilih akan muncul di sini.</div>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[980px] border-collapse">
              <thead className="bg-[#f6f5f4]">
                <tr className="text-left">
                  <Th>No. Bayar</Th>
                  <Th>Petugas</Th>
                  <Th className="text-center">Sesi</Th>
                  <Th className="text-right">Paket</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Metode</Th>
                  <Th>Waktu</Th>
                  <Th className="px-5 text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6e6e6]">
                {payments.map((p) => (
                  <tr key={p.id} className="bg-white transition-colors hover:bg-[#fbfaf9]">
                    <Td className="font-['Inter'] text-[13px] font-medium text-[#000000]">{p.paymentNo}</Td>
                    <Td>
                      <div className="grid gap-0.5">
                        <span className="font-['Inter'] text-[13px] font-medium text-[#000000]">{p.packerNameSnapshot}</span>
                        <span className="font-['Inter'] text-[12px] text-[#a39e98]">{p.packerCodeSnapshot}</span>
                      </div>
                    </Td>
                    <Td className="text-center font-['Inter'] text-[13px] tabular-nums text-[#000000]">{p.totalSessions}</Td>
                    <Td className="text-right font-['Inter'] text-[13px] tabular-nums text-[#000000]">{p.totalPackages}</Td>
                    <Td className="text-right">
                      <div className="grid gap-0.5">
                        <span className="font-['Inter'] text-[13px] font-semibold tabular-nums text-[#000000]">{formatCurrency(p.totalAmount)}</span>
                        {(p.adjustmentTotal ?? 0) !== 0 ? <span className="font-['Inter'] text-[11px] tabular-nums text-[#615d59]">subtotal {formatCurrency(p.subtotalAmount ?? p.totalAmount)} {(p.adjustmentTotal ?? 0) > 0 ? '+' : '−'}{formatCurrency(Math.abs(p.adjustmentTotal ?? 0))}</span> : null}
                      </div>
                    </Td>
                    <Td><span className="inline-flex rounded-full border border-[#dddddd] bg-[#f6f5f4] px-2 py-0.5 font-['Inter'] text-[12px] font-medium text-[#31302e]">{p.paymentMethod}</span></Td>
                    <Td className="font-['Inter'] text-[12px] text-[#615d59]">{new Date(p.paidAt).toLocaleString('id-ID')}</Td>
                    <Td className="px-5">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => { const t = buildPaymentShareText(p); void copyText(t, `pay-${p.id}`) }} className="h-8 rounded-lg border border-[#dddddd] bg-white px-3 font-['Inter'] text-[12px] text-[#31302e] hover:bg-[#f6f5f4]">{copiedKey === `pay-${p.id}` ? 'Copied' : 'Copy'}</Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => { const t = buildPaymentShareText(p); setShareDraft({ title: `Pembayaran ${p.paymentNo}`, text: t }) }} className="h-8 rounded-lg border border-[#dddddd] bg-white px-3 font-['Inter'] text-[12px] text-[#31302e] hover:bg-[#f6f5f4]">WA</Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => downloadTextFile(`pembayaran-${p.paymentNo}.txt`, buildPaymentShareText(p), 'text/plain;charset=utf-8')} className="h-8 rounded-lg border border-[#dddddd] bg-white px-3 font-['Inter'] text-[12px] text-[#31302e] hover:bg-[#f6f5f4]">TXT</Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {renderDialogs()}
    </div>
  )
}

function cleanSessionOrderText(value: string | null | undefined) {
  const text = value?.replace(/\s+/g, ' ').trim()
  if (!text) return null

  return text
    .replace(/\s*x\s*\d+.+$/i, '')
    .replace(/\s*(?:variasi\s*:|variation\s*:|varian\s*:|pesan\s*:|rp\s*\d|cod\b|perlu dikirim\b|menunggu\b|hemat kargo\b|spx\b).*$/i, '')
    .replace(/\s*x\s*\d+\s*$/i, '')
    .trim() || null
}

function formatSessionOrderItems(items: SessionOrderItem[]) {
  const seen = new Set<string>()
  const labels: string[] = []

  for (const item of items) {
    const productName = cleanSessionOrderText(item.productName)
    if (!productName) continue
    const variationName = cleanSessionOrderText(item.variationName)
    const quantity = Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0 ? Math.floor(Number(item.quantity)) : 1
    const key = `${productName.toLowerCase()}|${variationName?.toLowerCase() ?? ''}|${quantity}`
    if (seen.has(key)) continue
    seen.add(key)
    labels.push(`${productName} x${quantity}`)
  }

  return labels.join(', ') || '-'
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts.slice(0, 2).map((part) => part[0]).join('')
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

function NativeSelect({ value, onChange, options, placeholder, placeholderValue = 'all', icon, compact }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string; placeholderValue?: string; icon?: typeof UserGroupIcon; compact?: boolean }) {
  return (
    <label className={`relative inline-flex items-center rounded-lg border bg-white text-[#000000] ${compact ? 'h-8 border-[#e6e6e6]' : 'h-10 border-[#dddddd]'}`}>
      {icon ? (
        <span className="pointer-events-none absolute left-3 grid place-items-center text-[#31302e]">
          <HugeiconsIcon icon={icon} size={17} strokeWidth={1.9} />
        </span>
      ) : null}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`h-full appearance-none rounded-lg bg-transparent font-['Inter'] font-medium focus:outline-none focus:ring-0 ${compact ? 'text-[12px]' : 'text-[13px]'} ${icon ? 'pl-9 pr-8' : 'px-3 pr-8'}`}>
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
