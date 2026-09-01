import { Fragment, useEffect, useMemo, useState } from 'react'
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
import { closePackingSessionApi, createPackingPaymentApi, deletePackingSessionApi, readPackingPaymentsApi, readPackingPayRulesApi, readPackingSessionsApi, readServerHistoryRecordingsApi, updatePackingRecordingPayRuleApi } from '@pakti/api-client'
import type { PackingPayment, PackingPayRule, PackingWorkSession } from '@pakti/types'
import { downloadTextFile } from '@pakti/shared'
import { recordsToCsv } from '@pakti/shared/exporters'
import { navigateTo } from '../app/uiState'

type SessionOrderItem = {
  productName: string
  variationName?: string | null
  quantity: number
}

export function PackingSessionsPage() {
  const [sessions, setSessions] = useState<PackingWorkSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed' | 'cancelled'>('all')
  const [packerFilter, setPackerFilter] = useState<string>('all')
  const [paidFilter, setPaidFilter] = useState<'all' | 'unpaid' | 'paid'>('all')
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(() => new Set())
  const [selected, setSelected] = useState<PackingWorkSession | null>(null)
  const [records, setRecords] = useState<Awaited<ReturnType<typeof readServerHistoryRecordingsApi>>['records']>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [payments, setPayments] = useState<PackingPayment[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [showPayDialog, setShowPayDialog] = useState(false)
  const [payMethod, setPayMethod] = useState<'cash' | 'transfer' | 'other'>('cash')
  const [payNote, setPayNote] = useState('')
  const [payBusy, setPayBusy] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [lastPayment, setLastPayment] = useState<PackingPayment | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [shareDraft, setShareDraft] = useState<{ title: string; text: string } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [payRules, setPayRules] = useState<PackingPayRule[]>([])
  const [payRuleBusyId, setPayRuleBusyId] = useState<string | null>(null)
  const [payRuleEditTarget, setPayRuleEditTarget] = useState<{ id: string; resiNumber: string; packingPayRuleId?: string | null; packingPayBreakdown?: { ruleName?: string; payType?: string; amount?: number; quantity?: number; total?: number; manualOverride?: boolean } | null; packingPayAmount?: number | null } | null>(null)
  const [payRuleEditSelectedId, setPayRuleEditSelectedId] = useState<string>('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [data, pays, rules] = await Promise.all([readPackingSessionsApi(100), readPackingPaymentsApi(50).catch(() => [] as PackingPayment[]), readPackingPayRulesApi().catch(() => [] as PackingPayRule[])])
      setSessions(data as PackingWorkSession[])
      setPayments(pays as PackingPayment[])
      setPayRules(rules as PackingPayRule[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat sesi packing.')
    } finally {
      setLoading(false)
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

  const payPreview = useMemo(() => {
    const ids = Array.from(selectedSessionIds)
    if (ids.length === 0) return null
    const selectedRows = filtered.filter((s) => selectedSessionIds.has(s.id))
    if (selectedRows.length === 0) return null
    const first = selectedRows[0]
    const mixedPacker = selectedRows.some((s) => s.packerOperatorName !== first.packerOperatorName || s.packerOperatorCode !== first.packerOperatorCode)
    const notClosed = selectedRows.filter((s) => s.status !== 'closed')
    const alreadyPaid = selectedRows.filter((s) => Boolean(s.paidAt))
    return {
      count: selectedRows.length,
      packerLabel: `${first.packerNameSnapshot} (${first.packerCodeSnapshot})`,
      mixedPacker,
      notClosedCount: notClosed.length,
      alreadyPaidCount: alreadyPaid.length,
      totalPaket: selectedRows.reduce((acc, s) => acc + (s.completedPackingCount ?? 0), 0),
      totalUpah: selectedRows.reduce((acc, s) => acc + (s.totalPayAmount ?? 0), 0),
      sessions: selectedRows,
      valid: !mixedPacker && notClosed.length === 0 && alreadyPaid.length === 0,
    }
  }, [filtered, selectedSessionIds])

  const deletePreview = useMemo(() => {
    const selectedRows = filtered.filter((s) => selectedSessionIds.has(s.id))
    const deletable = selectedRows.filter(canDeleteSession)
    return {
      selected: selectedRows,
      deletable,
      invalidCount: selectedRows.length - deletable.length,
    }
  }, [filtered, selectedSessionIds])

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

  function canDeleteSession(s: PackingWorkSession) {
    return s.status === 'closed' && (s.completedPackingCount ?? 0) === 0 && !s.paidAt && !s.paymentId
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

  async function handleOpenDetail(s: PackingWorkSession) {
    setSelected(s)
    setDetailLoading(true)
    try {
      const result = await readServerHistoryRecordingsApi({ taskType: 'packing' })
      const filteredRecords = result.records.filter((r) => (r as unknown as { packingSessionId?: string | null }).packingSessionId === s.id)
      setRecords(filteredRecords)
    } catch {
      setRecords([])
    } finally {
      setDetailLoading(false)
    }
  }

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
      setRecords((prev) => prev.map((record) => (record.id === updated.id ? updated : record)))
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
    const csv = ['payment_no,packer_name,packer_code,sesi,paket,upah,metode,paid_at,note', ...payments.map((p) => `${p.paymentNo},${p.packerNameSnapshot},${p.packerCodeSnapshot},${p.totalSessions},${p.totalPackages},${p.totalAmount},${p.paymentMethod},${p.paidAt},${(p.note ?? '').replace(/,/g, ';')}`)].join('\n')
    downloadTextFile(`packing-payments-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8')
  }

  function toggleSessionSelection(sessionId: string) {
    setSelectedSessionIds((current) => {
      const next = new Set(current)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  function selectAllFilteredSessions() {
    setSelectedSessionIds(new Set(filtered.map((s) => s.id)))
  }

  function toggleGroupSelection(groupSessions: PackingWorkSession[]) {
    setSelectedSessionIds((current) => {
      const next = new Set(current)
      const allSelected = groupSessions.every((session) => next.has(session.id))
      for (const session of groupSessions) {
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
    setPayError(null)
    setPayMethod('cash')
    setPayNote('')
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

  async function handleConfirmPay() {
    if (!payPreview || !payPreview.valid) return
    setPayBusy(true)
    setPayError(null)
    try {
      const payment = await createPackingPaymentApi({ sessionIds: payPreview.sessions.map((s) => s.id), paymentMethod: payMethod, note: payNote.trim() || null })
      setLastPayment(payment as PackingPayment)
      const t = buildPaymentShareText(payment as PackingPayment)
      setShareDraft({ title: `Pembayaran ${payment.paymentNo}`, text: t })
      setShowPayDialog(false)
      setSelectedSessionIds(new Set())
      await load()
      await loadPayments()
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Gagal membuat pembayaran.')
    } finally {
      setPayBusy(false)
    }
  }

  // ── Dialogs (shared) ──────────────────────────────────────────────
  function renderDialogs() {
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
          <DialogContent showCloseButton={false} className="packing-modal max-w-md gap-0 overflow-hidden rounded-2xl border-[#dddddd] bg-white p-0 font-['Inter'] shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
            <div className="border-b border-[#dddddd] p-6">
              <div className="flex items-start justify-between gap-5">
                <div className="grid gap-1">
                  <DialogTitle className="font-['Inter'] text-[18px] font-semibold text-[#000000]">Bayar upah packing</DialogTitle>
                  <DialogDescription className="font-['Inter'] text-[13px] leading-5 text-[#615d59]">Periksa ringkasan sebelum konfirmasi. Hanya sesi closed dan belum dibayar dari 1 petugas yang bisa dibayar.</DialogDescription>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setShowPayDialog(false)} className="h-9 w-9 shrink-0 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]">
                  <HugeiconsIcon icon={Cancel01Icon} size={19} strokeWidth={1.9} />
                </Button>
              </div>
            </div>
            {payPreview ? (
              <div className="grid gap-4 p-6">
                <div className="rounded-[4px] border border-[#dddddd] bg-[#f6f5f4] p-4">
                  <p className="font-['Inter'] text-[13px] font-semibold text-[#000000]">{payPreview.packerLabel}</p>
                  <p className="mt-1 font-['Inter'] text-[12px] text-[#615d59]">{payPreview.count} sesi · {payPreview.totalPaket} paket · {formatCurrency(payPreview.totalUpah)}</p>
                  <ul className="mt-3 max-h-[18vh] divide-y divide-[#e6e6e6] overflow-y-auto rounded-[4px] border border-[#dddddd] bg-white">
                    {payPreview.sessions.map((s) => (
                      <li key={s.id} className="flex justify-between gap-2 px-3 py-2 font-['Inter'] text-[12px]">
                        <span className="truncate text-[#31302e]" title={s.id}>{new Date(s.startedAt).toLocaleDateString('id-ID')} · {s.id.slice(0, 8)}</span>
                        <span className="shrink-0 tabular-nums text-[#000000]">{s.completedPackingCount} paket · {formatCurrency(s.totalPayAmount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid gap-1.5">
                  <Label className="font-['Inter'] text-[12px] font-medium text-[#000000]">Metode pembayaran</Label>
                  <NativeSelect value={payMethod} onChange={(value) => setPayMethod(value as typeof payMethod)} options={[{ value: 'cash', label: 'cash' }, { value: 'transfer', label: 'transfer' }, { value: 'other', label: 'other' }]} />
                </div>
                <div className="grid gap-1.5">
                  <Label className="font-['Inter'] text-[12px] font-medium text-[#000000]">Catatan (opsional)</Label>
                  <Input className="h-10 rounded-[4px] border-[#dddddd] bg-white px-3 font-['Inter'] text-[14px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="mis: periode 1-7 Agu, tunai" />
                </div>
                {payError ? <Alert variant="destructive" className="font-['Inter'] text-[13px]"><p>{payError}</p></Alert> : null}
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="ghost" onClick={() => setShowPayDialog(false)} disabled={payBusy} className="h-10 rounded-full border border-[#dddddd] bg-white px-5 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]">Batal</Button>
                  <Button type="button" onClick={() => void handleConfirmPay()} disabled={payBusy || !payPreview.valid} className="h-10 rounded-full bg-[#000000] px-6 font-['Inter'] text-[13px] font-medium text-white hover:bg-[#31302e] disabled:opacity-40">{payBusy ? 'Memproses...' : 'Konfirmasi Bayar'}</Button>
                </div>
              </div>
            ) : null}
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
                  {records.map((rec, index) => {
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
          <p className="mt-3 max-w-2xl font-['Inter'] text-[14px] leading-6 text-[#615d59] sm:text-[15px]">Kelola sesi packing per petugas, hitung total upah, lalu bayar atau share ringkasan.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[#dddddd] bg-white px-2.5 py-1 font-['Inter'] text-[11px] font-semibold text-[#615d59]">{loading ? 'Loading' : 'Ready'}</span>
          <Button type="button" variant="ghost" onClick={() => void load()} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.9} /> Refresh</Button>
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
            {lastPayment.packerNameSnapshot} ({lastPayment.packerCodeSnapshot}) · {lastPayment.totalSessions} sesi · {lastPayment.totalPackages} paket · {formatCurrency(lastPayment.totalAmount)}
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
        <div className="flex flex-col gap-3 border-b border-[#dddddd] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="font-['Inter'] text-[16px] font-semibold text-[#000000]">Daftar sesi</h2>
            <p className="mt-1 font-['Inter'] text-[12px] text-[#a39e98]">{filtered.length} sesi terfilter · {groupedSessions.length} petugas</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center rounded-lg border border-[#dddddd] bg-[#f6f5f4] px-3 font-['Inter'] text-[12px] font-medium text-[#615d59]">{selectedSessionIds.size} terpilih</span>
            <Button type="button" variant="ghost" onClick={selectAllFilteredSessions} disabled={filtered.length === 0} className="h-9 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40">Pilih semua</Button>
            <Button type="button" variant="ghost" onClick={() => setSelectedSessionIds(new Set())} disabled={selectedSessionIds.size === 0} className="h-9 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40">Reset pilihan</Button>
          </div>
        </div>
        <div className="border-b border-[#dddddd] bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <label className="relative flex min-w-[240px] flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 grid w-10 place-items-center text-[#a39e98]">
                <HugeiconsIcon icon={Search01Icon} size={18} strokeWidth={1.9} />
              </span>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari packer / kode / ID sesi..." className="h-10 w-full rounded-[4px] border-[#dddddd] bg-white pl-10 pr-3 font-['Inter'] text-[14px] placeholder:text-[#a39e98] focus-visible:border-[#CFCBC7] focus-visible:ring-0" aria-label="Cari sesi" />
            </label>
            <div className="flex flex-wrap gap-2">
              <NativeSelect value={packerFilter} onChange={setPackerFilter} options={packerOptions.map((op) => ({ value: `${op.name}::${op.code}`, label: op.label }))} placeholder="Semua petugas" icon={UserGroupIcon} />
              <NativeSelect value={paidFilter} onChange={(value) => setPaidFilter(value as typeof paidFilter)} options={[{ value: 'unpaid', label: 'Belum dibayar' }, { value: 'paid', label: 'Sudah dibayar' }]} placeholder="Semua bayar" icon={DollarCircleIcon} />
              <NativeSelect value={statusFilter} onChange={(value) => setStatusFilter(value as typeof statusFilter)} options={[{ value: 'active', label: 'active' }, { value: 'closed', label: 'closed' }, { value: 'cancelled', label: 'cancelled' }]} placeholder="Semua status" />
              <Button type="button" variant="ghost" onClick={() => { setSearch(''); setStatusFilter('all'); setPackerFilter('all'); setPaidFilter('all') }} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 font-['Inter'] text-[13px] font-medium text-[#615d59] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.9} /> Reset</Button>
            </div>
          </div>
        </div>
        {selectedSessionIds.size > 0 ? (
          <div className="flex flex-col gap-3 border-b border-[#dddddd] bg-[#fbfaf9] px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
            <p className="font-['Inter'] text-[12px] text-[#615d59]">{totals.selectedSessions.length} sesi · {totals.totalPaket} paket · {formatCurrency(totals.totalUpah)}{payPreview && !payPreview.valid ? ` · ${payPreview.mixedPacker ? 'pilih 1 petugas saja' : payPreview.notClosedCount > 0 ? `${payPreview.notClosedCount} sesi belum closed` : payPreview.alreadyPaidCount > 0 ? `${payPreview.alreadyPaidCount} sesi sudah dibayar` : ''}` : deletePreview.invalidCount > 0 ? ` · ${deletePreview.deletable.length} bisa dihapus, ${deletePreview.invalidCount} dilewati` : ''}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => { const t = buildSelectionShareText(); if (t) void copyText(t, 'selection') }} className="h-9 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={Copy01Icon} size={16} strokeWidth={1.9} /> {copiedKey === 'selection' ? 'Copied' : 'Copy'}</Button>
              <Button type="button" variant="ghost" onClick={() => { const t = buildSelectionShareText(); if (t) setShareDraft({ title: 'Ringkasan packing', text: t }) }} className="h-9 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={SentIcon} size={16} strokeWidth={1.9} /> WA</Button>
              <Button type="button" onClick={openPayDialog} disabled={payPreview ? !payPreview.valid : true} className="h-9 rounded-lg bg-[#000000] px-5 font-['Inter'] text-[13px] font-medium text-white hover:bg-[#31302e] disabled:opacity-40"><HugeiconsIcon icon={DollarCircleIcon} size={16} strokeWidth={1.9} /> Bayar</Button>
              <Button type="button" variant="ghost" onClick={() => void handleDeleteSelectedSessions()} disabled={deleteBusy || deletePreview.deletable.length === 0} className="h-9 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40"><HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.9} /> {deleteBusy ? 'Menghapus...' : 'Hapus Kosong'}</Button>
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
            <Button type="button" variant="ghost" onClick={() => { setSearch(''); setStatusFilter('all'); setPackerFilter('all'); setPaidFilter('all') }} className="mt-4 h-9 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]">Reset filter</Button>
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
                        <Td className="px-4"><input type="checkbox" className="h-4 w-4 rounded border-[#dddddd] accent-[#000000]" checked={selectedSessionIds.has(s.id)} onChange={() => toggleSessionSelection(s.id)} aria-label={`Pilih sesi ${s.packerNameSnapshot}`} /></Td>
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
                            {s.paidAt ? <span className="inline-flex rounded-lg bg-[#000000] px-2 py-0.5 font-['Inter'] text-[11px] font-semibold text-white">Dibayar</span> : <span className="inline-flex rounded-lg border border-[#8f8a84] bg-white px-2 py-0.5 font-['Inter'] text-[11px] font-medium text-[#615d59]">Belum</span>}
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
                            <Button type="button" variant="ghost" size="sm" onClick={() => void handleOpenDetail(s)} className="h-8 rounded-lg border border-[#dddddd] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">Detail</Button>
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
                    <Td className="text-right font-['Inter'] text-[13px] font-semibold tabular-nums text-[#000000]">{formatCurrency(p.totalAmount)}</Td>
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
    <article className="rounded-xl border border-[#dddddd] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">{label}</div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-['Inter'] text-[28px] font-bold leading-none tracking-[-0.5px] text-[#000000]">{value}</span>
            {subLabel ? <span className="font-['Inter'] text-[13px] text-[#615d59]">{subLabel}</span> : null}
          </div>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f6f5f4] text-[#31302e]">
          <HugeiconsIcon icon={icon} size={19} strokeWidth={1.9} />
        </span>
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

function NativeSelect({ value, onChange, options, placeholder, placeholderValue = 'all', icon }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string; placeholderValue?: string; icon?: typeof UserGroupIcon }) {
  return (
    <label className="relative inline-flex h-10 items-center rounded-lg border border-[#dddddd] bg-white text-[#000000]">
      {icon ? (
        <span className="pointer-events-none absolute left-3 grid place-items-center text-[#31302e]">
          <HugeiconsIcon icon={icon} size={17} strokeWidth={1.9} />
        </span>
      ) : null}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`h-full appearance-none rounded-lg bg-transparent font-['Inter'] text-[13px] font-medium focus:outline-none focus:ring-0 ${icon ? 'pl-9 pr-8' : 'px-3 pr-8'}`}>
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
