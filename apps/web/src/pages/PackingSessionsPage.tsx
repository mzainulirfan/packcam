import { useEffect, useMemo, useState } from 'react'
import { Lock, Pencil, Loader2 } from 'lucide-react'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
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
  const [showStaleOnly, setShowStaleOnly] = useState(false)
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
      const isStale = s.status === 'active' && !s.createdBySessionId
      const matchesStale = !showStaleOnly || isStale
      return matchesSearch && matchesStatus && matchesPacker && matchesPaid && matchesStale
    })
  }, [sessions, search, statusFilter, packerFilter, paidFilter, showStaleOnly])

  const totals = useMemo(() => {
    const selectedSessions = selectedSessionIds.size > 0
      ? filtered.filter((s) => selectedSessionIds.has(s.id))
      : filtered
    const totalPaket = selectedSessions.reduce((acc, s) => acc + (s.completedPackingCount ?? 0), 0)
    const totalUpah = selectedSessions.reduce((acc, s) => acc + (s.totalPayAmount ?? 0), 0)
    const activeSessions = selectedSessions.filter((s) => s.status === 'active').length
    const closedSessions = selectedSessions.filter((s) => s.status === 'closed').length
    const paidSessions = selectedSessions.filter((s) => Boolean(s.paidAt)).length
    const unpaidSessions = selectedSessions.length - paidSessions
    return {
      activeSessions,
      closedSessions,
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
    const selected = filtered.filter((s) => selectedSessionIds.has(s.id))
    if (selected.length === 0) return null
    const first = selected[0]
    const mixedPacker = selected.some((s) => s.packerOperatorName !== first.packerOperatorName || s.packerOperatorCode !== first.packerOperatorCode)
    const notClosed = selected.filter((s) => s.status !== 'closed')
    const alreadyPaid = selected.filter((s) => Boolean(s.paidAt))
    return {
      count: selected.length,
      packerLabel: `${first.packerNameSnapshot} (${first.packerCodeSnapshot})`,
      mixedPacker,
      notClosedCount: notClosed.length,
      alreadyPaidCount: alreadyPaid.length,
      totalPaket: selected.reduce((acc, s) => acc + (s.completedPackingCount ?? 0), 0),
      totalUpah: selected.reduce((acc, s) => acc + (s.totalPayAmount ?? 0), 0),
      sessions: selected,
      valid: !mixedPacker && notClosed.length === 0 && alreadyPaid.length === 0,
    }
  }, [filtered, selectedSessionIds])

  const deletePreview = useMemo(() => {
    const selected = filtered.filter((s) => selectedSessionIds.has(s.id))
    const deletable = selected.filter(canDeleteSession)
    return {
      selected,
      deletable,
      invalidCount: selected.length - deletable.length,
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

  if (selected) {
    const selectedIsPaid = Boolean(selected.paidAt)
    const selectedCanDelete = canDeleteSession(selected)
    const selectedStatusTone = selected.status === 'closed' ? 'bg-foreground text-background' : selected.status === 'active' ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700' : 'border bg-muted text-muted-foreground'

    return (
      <div className="admin-opencode grid w-full gap-4 px-0 py-1">
        <Card className="admin-opencode__panel">
          <CardContent className="grid gap-4 pt-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="grid min-w-0 gap-2">
                <button type="button" className="admin-opencode__section-label w-fit text-left" onClick={() => setSelected(null)}>[←] Riwayat Sesi Packing</button>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="admin-opencode__title min-w-0">{selected.packerNameSnapshot}</h1>
                  <span className="admin-opencode__badge">{selected.packerCodeSnapshot}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${selectedStatusTone}`}>[{selected.status}]</span>
                  <span className={selectedIsPaid ? 'rounded bg-foreground px-1.5 py-0.5 text-[11px] font-medium text-background' : 'rounded border bg-white px-1.5 py-0.5 text-[11px]'}>{selectedIsPaid ? '[dibayar]' : '[belum dibayar]'}</span>
                </div>
                <p className="admin-opencode__lede max-w-[80ch] text-[0.82rem] leading-snug">
                  <span className="font-mono">{selected.id.slice(0, 12)}</span> · {formatPeriode(selected.startedAt, selected.endedAt)} · dibuat oleh {selected.createdByOperatorName ? `${selected.createdByOperatorName} (${selected.createdByOperatorCode ?? '-'})` : '-'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setSelected(null)}>[kembali]</Button>
                <Button type="button" variant="outline" size="sm" onClick={handleExportDetail} disabled={records.length === 0}>[export]</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => { window.sessionStorage.setItem('pakti.historyPackingSessionId', selected.id); navigateTo('history') }}>[history]</Button>
                {selected.status === 'active' ? <Button type="button" variant="outline" size="sm" onClick={() => void handleClose(selected.id)}>[tutup]</Button> : null}
                {selectedCanDelete ? <Button type="button" variant="outline" size="sm" onClick={() => void handleDeleteSession(selected)}>[hapus]</Button> : null}
              </div>
            </div>

            <div className="grid gap-2 border-t pt-3 sm:grid-cols-3">
              <SessionMetric label="Paket" value={String(selected.completedPackingCount)} />
              <SessionMetric label="Upah" value={formatCurrency(selected.totalPayAmount)} />
              <SessionMetric label="Payment" value={selectedIsPaid ? formatCurrency(selected.paidAmount ?? selected.totalPayAmount) : '-'} />
            </div>

            <div className="grid gap-2 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-3">
              <span>Mulai <strong className="block text-foreground">{new Date(selected.startedAt).toLocaleString('id-ID')}</strong></span>
              <span>Selesai <strong className="block text-foreground">{selected.endedAt ? new Date(selected.endedAt).toLocaleString('id-ID') : 'masih aktif'}</strong></span>
              <span>Dibayar <strong className="block text-foreground">{selected.paidAt ? new Date(selected.paidAt).toLocaleString('id-ID') : '-'}</strong></span>
            </div>
          </CardContent>
        </Card>

        <Card className="admin-opencode__panel">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div className="grid gap-0.5">
                <CardTitle>Detail paket sesi</CardTitle>
                <p className="text-xs text-muted-foreground">Daftar paket completed yang masuk ke sesi ini. Produk dibersihkan dari metadata Shopee.</p>
              </div>
              <span className="admin-opencode__badge">{detailLoading ? '[~] loading' : `${records.length} record`}</span>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {detailLoading ? (
              <div className="space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-20 animate-pulse rounded bg-muted/50" />
              </div>
            ) : records.length === 0 ? (
              <div className="admin-opencode__empty grid gap-2 py-8 text-center">
                <p>[-] Belum ada paket completed di sesi ini.</p>
                <p className="text-xs text-muted-foreground">Sesi kosong yang sudah closed bisa dihapus dari halaman ini.</p>
                {selectedCanDelete ? <Button type="button" variant="outline" size="sm" className="mx-auto" onClick={() => void handleDeleteSession(selected)}>[hapus sesi kosong]</Button> : null}
              </div>
            ) : (
              <div className="overflow-hidden rounded-[4px] border">
                <table className="history-opencode__table w-full min-w-[820px] border-collapse">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="w-[54px] px-3 py-2 text-left text-[0.72rem] uppercase tracking-wide text-muted-foreground">No</th>
                      <th className="px-3 py-2 text-left text-[0.72rem] uppercase tracking-wide text-muted-foreground">Paket</th>
                      <th className="px-3 py-2 text-left text-[0.72rem] uppercase tracking-wide text-muted-foreground">Produk</th>
                      <th className="px-3 py-2 text-right text-[0.72rem] uppercase tracking-wide text-muted-foreground">Upah</th>
                      <th className="px-3 py-2 text-left text-[0.72rem] uppercase tracking-wide text-muted-foreground">Waktu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((rec, index) => {
                      const r = rec as unknown as { id: string; resiNumber: string; orderNumber?: string | null; mediaType?: string; packingPayAmount?: number | null; packingPayStatus?: string | null; packingPayRuleId?: string | null; packingPayBreakdown?: { ruleName?: string; payType?: string; amount?: number; quantity?: number; total?: number; manualOverride?: boolean } | null; orderSnapshot?: { items?: SessionOrderItem[] } | null; startTime?: string }
                      const itemsLabel = r.orderSnapshot?.items ? formatSessionOrderItems(r.orderSnapshot.items) : '-'
                      const currentRule = payRules.find((rule) => rule.id === r.packingPayRuleId)
                      const currentRuleName = currentRule?.name ?? r.packingPayBreakdown?.ruleName ?? '-'
                      const canEditRule = !selectedIsPaid && payRules.length > 0
                      return (
                        <tr key={r.id ?? `${r.resiNumber}-${index}`} className="history-opencode__row border-b last:border-0 hover:bg-muted/30">
                          <td className="px-3 py-3 align-top font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, '0')}</td>
                          <td className="px-3 py-3 align-top">
                            <div className="grid gap-1">
                              <span className="font-mono text-sm font-bold leading-none">{r.resiNumber}</span>
                              <span className="text-[11px] text-muted-foreground">{r.orderNumber ? `Order ${r.orderNumber}` : 'Order -'} · [{r.mediaType ?? 'video'}]</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="grid max-w-[56rem] gap-1">
                              <p className="text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">{itemsLabel}</p>
                              <div className="mt-1 inline-flex items-center gap-1.5">
                                <span className="text-xs font-medium text-foreground">{currentRuleName}</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => openPayRuleEdit({ id: r.id, resiNumber: r.resiNumber, packingPayRuleId: r.packingPayRuleId, packingPayBreakdown: r.packingPayBreakdown, packingPayAmount: r.packingPayAmount })}
                                  disabled={!canEditRule || payRuleBusyId === r.id}
                                  title={selectedIsPaid ? 'Terkunci: sudah dibayar' : !canEditRule ? 'Tidak ada pay rule' : 'Ubah pay rule'}
                                  aria-label={`Ubah pay rule ${r.resiNumber}`}
                                >
                                  {payRuleBusyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : selectedIsPaid ? <Lock className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                                </Button>
                                {payRuleBusyId === r.id ? <span className="text-[11px] text-muted-foreground">menyimpan...</span> : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right align-top font-mono text-sm tabular-nums">{r.packingPayAmount != null ? formatCurrency(r.packingPayAmount) : '-'}</td>
                          <td className="px-3 py-3 align-top text-xs text-muted-foreground">{r.startTime ? new Date(r.startTime).toLocaleString('id-ID') : '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={Boolean(payRuleEditTarget)} onOpenChange={(open) => { if (!open) closePayRuleEdit() }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Ubah Pay Rule</DialogTitle>
              <DialogDescription>Pilih pay rule baru untuk paket ini. Perubahan akan menghitung ulang upah paket dan total sesi.</DialogDescription>
            </DialogHeader>
            {payRuleEditTarget ? (
              <div className="grid gap-4">
                <div className="rounded-[4px] border bg-muted/20 p-3">
                  <p className="font-mono text-sm font-bold">{payRuleEditTarget.resiNumber}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Saat ini: {payRuleEditTarget.packingPayBreakdown?.ruleName ?? '-'} · {payRuleEditTarget.packingPayBreakdown?.payType ?? '-'} · {payRuleEditTarget.packingPayAmount != null ? formatCurrency(payRuleEditTarget.packingPayAmount) : '-'}
                    {payRuleEditTarget.packingPayBreakdown?.manualOverride ? ' · manual' : ''}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label>Pay rule baru</Label>
                  <Select value={payRuleEditSelectedId} onValueChange={setPayRuleEditSelectedId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Pilih pay rule" />
                    </SelectTrigger>
                    <SelectContent>
                      {payRules.map((rule) => (
                        <SelectItem key={rule.id} value={rule.id}>
                          {rule.name} · {formatCurrency(rule.amount)} · {rule.payType}{rule.active ? '' : ' · nonaktif'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Rule aktif dengan prioritas lebih tinggi akan dipakai otomatis untuk paket baru; pilihan di sini overrides manual.</p>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={closePayRuleEdit} disabled={Boolean(payRuleBusyId)}>[batal]</Button>
                  <Button type="button" onClick={() => void handleConfirmPayRuleEdit()} disabled={Boolean(payRuleBusyId) || !payRuleEditSelectedId || payRuleEditSelectedId === (payRuleEditTarget.packingPayRuleId ?? '')}>
                    {payRuleBusyId ? '[~] menyimpan' : '[simpan]'}
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="admin-opencode grid w-full gap-5 px-0 py-1">
      <section className="admin-opencode__summary flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <div className="admin-opencode__section-label">[+] Sesi Packing</div>
          <h1 className="admin-opencode__title">Riwayat Sesi Packing</h1>
          <p className="admin-opencode__lede max-w-[72ch] text-[0.82rem] leading-snug">Filter per petugas & status bayar, centang untuk hitung total dan bayar. Share ringkasan langsung ke WhatsApp tanpa export manual.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="admin-opencode__badge">{loading ? '[~] loading' : '[x] ready'}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            [refresh]
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleExportAll}>
            [export sesi csv]
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleExportPayments}>
            [export bayar csv]
          </Button>
        </div>
      </section>

      {error ? (
        <Alert variant="destructive">
          <p>{error}</p>
        </Alert>
      ) : null}

      <Card className="admin-opencode__panel">
        <CardHeader className="pb-2">
          <div className="flex items-baseline justify-between gap-2">
            <CardTitle className="text-[0.95rem]">Ringkasan</CardTitle>
            <span className="text-xs text-muted-foreground">{selectedSessionIds.size > 0 ? `${totals.selectedSessions.length} terpilih` : `${filtered.length} terfilter`} · {loading ? 'memuat' : 'siap'}</span>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="admin-opencode__stats gap-2">
            <div className="admin-opencode__stat">
              <span>01</span>
              <p>Sesi<br /><strong className="tabular-nums">{totals.selectedSessions.length}</strong></p>
            </div>
            <div className="admin-opencode__stat">
              <span>02</span>
              <p>Paket<br /><strong className="tabular-nums">{totals.totalPaket}</strong></p>
            </div>
            <div className="admin-opencode__stat">
              <span>03</span>
              <p>Upah<br /><strong className="tabular-nums">{formatCurrency(totals.totalUpah)}</strong></p>
            </div>
            <div className="admin-opencode__stat">
              <span>04</span>
              <p>Belum / sudah<br /><strong className="tabular-nums">{totals.unpaidSessions} / {totals.paidSessions}</strong></p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const t = buildSelectionShareText()
                  if (t) void copyText(t, 'selection')
                }}
                disabled={totals.selectedSessions.length === 0}
              >
                {copiedKey === 'selection' ? '[copied]' : '[copy ringkasan]'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const t = buildSelectionShareText()
                  if (t) setShareDraft({ title: 'Ringkasan packing', text: t })
                }}
                disabled={totals.selectedSessions.length === 0}
              >
                [share WA]
              </Button>
            </div>
            <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={openPayDialog} disabled={payPreview ? !payPreview.valid : true}>
                [bayar terpilih]
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleDeleteSelectedSessions()} disabled={deleteBusy || deletePreview.deletable.length === 0}>
                {deleteBusy ? '[hapus...]' : '[hapus kosong]'}
              </Button>
              {payPreview && !payPreview.valid ? (
                <span className="max-w-[28ch] text-xs leading-snug text-muted-foreground">
                  {payPreview.mixedPacker ? 'Pilih 1 petugas saja.' : payPreview.notClosedCount > 0 ? `${payPreview.notClosedCount} sesi belum closed.` : payPreview.alreadyPaidCount > 0 ? `${payPreview.alreadyPaidCount} sesi sudah dibayar.` : ''}
                </span>
              ) : deletePreview.selected.length > 0 && deletePreview.invalidCount > 0 ? (
                <span className="max-w-[28ch] text-xs leading-snug text-muted-foreground">{deletePreview.deletable.length} bisa dihapus · {deletePreview.invalidCount} dilewati.</span>
              ) : deletePreview.deletable.length > 0 ? (
                <span className="text-xs text-muted-foreground">{deletePreview.deletable.length} sesi kosong bisa dihapus</span>
              ) : selectedSessionIds.size === 0 && totals.selectedSessions.length > 0 ? (
                <span className="text-xs text-muted-foreground">Centang sesi untuk bayar</span>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="sticky top-0 z-10 -mx-4 border-b bg-white/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:bg-[#111113]/80">
        <Card className="admin-opencode__panel shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Filter</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 pt-2">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_190px_150px_140px_auto]">
              <Input placeholder="Cari packer / kode / ID sesi..." value={search} onChange={(e) => setSearch(e.target.value)} className="history-opencode__input h-8" />
            <Select value={packerFilter} onValueChange={(v) => setPackerFilter(v)}>
              <SelectTrigger className="history-opencode__select h-8">
                <SelectValue placeholder="Petugas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua petugas</SelectItem>
                {packerOptions.map((op) => (
                  <SelectItem key={`${op.name}::${op.code}`} value={`${op.name}::${op.code}`}>{op.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={paidFilter} onValueChange={(v) => setPaidFilter(v as typeof paidFilter)}>
              <SelectTrigger className="history-opencode__select h-8">
                <SelectValue placeholder="Status bayar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua bayar</SelectItem>
                <SelectItem value="unpaid">Belum dibayar</SelectItem>
                <SelectItem value="paid">Sudah dibayar</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="history-opencode__select h-8">
                <SelectValue placeholder="Status sesi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="closed">closed</SelectItem>
                <SelectItem value="cancelled">cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" className="history-opencode__button h-8" onClick={() => { setSearch(''); setStatusFilter('all'); setPackerFilter('all'); setPaidFilter('all'); setShowStaleOnly(false) }}>
              [reset]
            </Button>
            </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={showStaleOnly} onChange={(e) => setShowStaleOnly(e.target.checked)} className="size-4 rounded border-input" />
            <span>Hanya menggantung (active tanpa device) — {sessions.filter((s) => s.status === 'active' && !s.createdBySessionId).length} sesi</span>
          </label>
        </CardContent>
        </Card>
      </div>

      {lastPayment ? (
        <Alert className="flex flex-col gap-2 border-foreground/15 bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-snug">
            <span className="font-mono text-xs font-bold">{lastPayment.paymentNo}</span>
            <span className="mx-1 text-muted-foreground">·</span>
            {lastPayment.packerNameSnapshot} ({lastPayment.packerCodeSnapshot}) · {lastPayment.totalSessions} sesi · {lastPayment.totalPackages} paket · {formatCurrency(lastPayment.totalAmount)}
            <span className="ml-2 rounded bg-foreground px-1.5 py-0.5 text-[11px] text-background">barusan dibayar</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => void copyText(buildPaymentShareText(lastPayment), `last-${lastPayment.id}`)}>
              {copiedKey === `last-${lastPayment.id}` ? '[copied]' : '[copy]'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setShareDraft({ title: `Pembayaran ${lastPayment.paymentNo}`, text: buildPaymentShareText(lastPayment) })}>[wa]</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setLastPayment(null)}>[tutup]</Button>
          </div>
        </Alert>
      ) : null}

      <Card className="admin-opencode__panel">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid gap-0.5">
              <CardTitle className="text-sm">Daftar sesi</CardTitle>
              <p className="text-xs text-muted-foreground">{filtered.length} sesi terfilter · {selectedSessionIds.size} terpilih</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" variant="outline" size="sm" className="history-opencode__button h-7" onClick={selectAllFilteredSessions} disabled={filtered.length === 0}>
                [pilih semua]
              </Button>
              <Button type="button" variant="outline" size="sm" className="history-opencode__button h-7" onClick={() => setSelectedSessionIds(new Set())} disabled={selectedSessionIds.size === 0}>
                [kosongkan]
              </Button>
              <Button type="button" variant="default" size="sm" className="history-opencode__button h-7" onClick={openPayDialog} disabled={selectedSessionIds.size === 0 || (payPreview ? !payPreview.valid : true)}>
                [bayar]
              </Button>
              <Button type="button" variant="outline" size="sm" className="history-opencode__button h-7" onClick={() => void handleDeleteSelectedSessions()} disabled={deleteBusy || deletePreview.deletable.length === 0} title={deletePreview.selected.length > 0 ? `${deletePreview.deletable.length} bisa dihapus · ${deletePreview.invalidCount} dilewati` : 'Centang sesi closed kosong untuk hapus'}>
                {deleteBusy ? '[hapus...]' : `[hapus kosong${deletePreview.deletable.length > 0 ? ` ${deletePreview.deletable.length}` : ''}]`}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {loading ? (
            <div className="space-y-2">
              <div className="h-8 animate-pulse rounded bg-muted" />
              <div className="h-24 animate-pulse rounded bg-muted/50" />
              <div className="h-24 animate-pulse rounded bg-muted/30" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="admin-opencode__empty flex flex-col items-center gap-2 py-8 text-center">
              <p className="text-sm">[-] Tidak ada sesi sesuai filter.</p>
              <p className="max-w-[42ch] text-xs text-muted-foreground">Coba ubah petugas, status bayar, atau kata kunci pencarian.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => { setSearch(''); setStatusFilter('all'); setPackerFilter('all'); setPaidFilter('all') }}>[reset filter]</Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[4px] border">
              <table className="history-opencode__table w-full min-w-[1080px] border-collapse">
                <thead className="sticky top-0 z-[1] bg-white">
                  <tr className="border-b bg-muted/30">
                    <th className="w-[42px] px-2 py-2 text-left text-[0.72rem] uppercase tracking-wide text-muted-foreground">Pilih</th>
                    <th className="px-3 py-2 text-left text-[0.72rem] uppercase tracking-wide text-muted-foreground">Packer</th>
                    <th className="px-2 py-2 text-left text-[0.72rem] uppercase tracking-wide text-muted-foreground">Status</th>
                    <th className="px-2 py-2 text-left text-[0.72rem] uppercase tracking-wide text-muted-foreground">Bayar</th>
                    <th className="px-2 py-2 text-right text-[0.72rem] uppercase tracking-wide text-muted-foreground">Paket</th>
                    <th className="px-3 py-2 text-right text-[0.72rem] uppercase tracking-wide text-muted-foreground">Upah</th>
                    <th className="px-3 py-2 text-left text-[0.72rem] uppercase tracking-wide text-muted-foreground">Periode</th>
                    <th className="px-3 py-2 text-left text-[0.72rem] uppercase tracking-wide text-muted-foreground">Dibuat oleh</th>
                    <th className="px-3 py-2 text-right text-[0.72rem] uppercase tracking-wide text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="history-opencode__row border-b last:border-0 hover:bg-muted/30">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          className="size-4 rounded-[4px] border-input"
                          checked={selectedSessionIds.has(s.id)}
                          onChange={() => toggleSessionSelection(s.id)}
                          aria-label={`Pilih sesi ${s.packerNameSnapshot}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="grid gap-0.5">
                          <span className="text-sm font-medium leading-none">{s.packerNameSnapshot}</span>
                          <span className="font-mono text-xs text-muted-foreground">{s.packerCodeSnapshot} · {s.id.slice(0, 8)}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-xs">[{s.status}]{s.status === 'active' && !s.createdBySessionId ? <span className="ml-1 rounded bg-amber-500/15 px-1 py-0.5 text-[10px] font-medium text-amber-700">menggantung</span> : null}</td>
                      <td className="px-2 py-2">{s.paidAt ? <span className="rounded bg-foreground px-1.5 py-0.5 text-[11px] font-medium text-background">[dibayar]</span> : <span className="rounded border bg-white px-1.5 py-0.5 text-[11px]">[belum]</span>}</td>
                      <td className="px-2 py-2 text-right text-sm tabular-nums">{s.completedPackingCount}</td>
                      <td className="px-3 py-2 text-right font-mono text-sm tabular-nums">{formatCurrency(s.totalPayAmount)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground" title={`${new Date(s.startedAt).toLocaleString('id-ID')} → ${s.endedAt ? new Date(s.endedAt).toLocaleString('id-ID') : '— masih aktif'}`}>{formatPeriode(s.startedAt, s.endedAt)}</td>
                      <td className="px-3 py-2 text-xs">
                        {s.createdByOperatorName ? (
                          <span className={s.createdByOperatorName !== s.packerOperatorName || s.createdByOperatorCode !== s.packerOperatorCode ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                            {s.createdByOperatorName} ({s.createdByOperatorCode})
                            {s.createdByOperatorName !== s.packerOperatorName || s.createdByOperatorCode !== s.packerOperatorCode ? ' • atas nama' : ''}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="outline" size="sm" className="history-opencode__button h-7" onClick={() => { window.sessionStorage.setItem('pakti.historyPackingSessionId', s.id); navigateTo('history') }}>
                            [history]
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="history-opencode__button h-7" onClick={() => void handleOpenDetail(s)}>
                            [detail]
                          </Button>
                          {s.status === 'active' ? (
                            <Button type="button" variant="outline" size="sm" className="history-opencode__button h-7" onClick={() => void handleClose(s.id)}>
                              [tutup]
                            </Button>
                          ) : null}
                          {canDeleteSession(s) ? (
                            <Button type="button" variant="outline" size="sm" className="history-opencode__button h-7" onClick={() => void handleDeleteSession(s)}>
                              [hapus]
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Menampilkan {filtered.length} dari {sessions.length} sesi · Centang untuk hitung total & share.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="admin-opencode__panel">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid gap-0.5">
              <CardTitle className="text-sm">Riwayat Pembayaran</CardTitle>
              <p className="text-xs text-muted-foreground">{payments.length} pembayaran · terbaru di atas</p>
            </div>
            <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => void loadPayments()} disabled={paymentsLoading}>
              {paymentsLoading ? '[~] memuat' : '[refresh]'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {payments.length === 0 ? (
            <div className="admin-opencode__empty py-6 text-center text-sm text-muted-foreground">[-] Belum ada pembayaran.</div>
          ) : (
            <div className="overflow-x-auto rounded-[4px] border">
              <table className="history-opencode__table w-full min-w-[980px] border-collapse">
                <thead className="sticky top-0 z-[1] bg-white">
                  <tr className="border-b bg-muted/30">
                    <th className="px-3 py-2 text-left text-[0.72rem] uppercase tracking-wide text-muted-foreground">No. Bayar</th>
                    <th className="px-3 py-2 text-left text-[0.72rem] uppercase tracking-wide text-muted-foreground">Petugas</th>
                    <th className="px-2 py-2 text-center text-[0.72rem] uppercase tracking-wide text-muted-foreground">Sesi</th>
                    <th className="px-2 py-2 text-right text-[0.72rem] uppercase tracking-wide text-muted-foreground">Paket</th>
                    <th className="px-3 py-2 text-right text-[0.72rem] uppercase tracking-wide text-muted-foreground">Total</th>
                    <th className="px-2 py-2 text-left text-[0.72rem] uppercase tracking-wide text-muted-foreground">Metode</th>
                    <th className="px-3 py-2 text-left text-[0.72rem] uppercase tracking-wide text-muted-foreground">Waktu</th>
                    <th className="px-3 py-2 text-right text-[0.72rem] uppercase tracking-wide text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="history-opencode__row border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs">{p.paymentNo}</td>
                      <td className="px-3 py-2 text-sm">{p.packerNameSnapshot} <span className="text-xs text-muted-foreground">({p.packerCodeSnapshot})</span></td>
                      <td className="px-2 py-2 text-center text-sm tabular-nums">{p.totalSessions}</td>
                      <td className="px-2 py-2 text-right text-sm tabular-nums">{p.totalPackages}</td>
                      <td className="px-3 py-2 text-right font-mono text-sm tabular-nums">{formatCurrency(p.totalAmount)}</td>
                      <td className="px-2 py-2 text-xs">[{p.paymentMethod}]</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(p.paidAt).toLocaleString('id-ID')}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => {
                              const t = buildPaymentShareText(p)
                              void copyText(t, `pay-${p.id}`)
                            }}
                          >
                            {copiedKey === `pay-${p.id}` ? '[copied]' : '[copy]'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => {
                              const t = buildPaymentShareText(p)
                              setShareDraft({ title: `Pembayaran ${p.paymentNo}`, text: t })
                            }}
                          >
                            [wa]
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => downloadTextFile(`pembayaran-${p.paymentNo}.txt`, buildPaymentShareText(p), 'text/plain;charset=utf-8')}>[txt]</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(shareDraft)} onOpenChange={(open) => !open && setShareDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{shareDraft?.title ?? 'Bagikan rincian'}</DialogTitle>
            <DialogDescription>Copy teks di bawah atau langsung share ke WhatsApp. Format siap tempel.</DialogDescription>
          </DialogHeader>
          {shareDraft ? (
            <div className="grid gap-3">
              <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-[4px] border bg-muted/20 p-3 font-mono text-xs leading-relaxed">{shareDraft.text}</pre>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => void copyText(shareDraft.text, 'draft')}>
                  {copiedKey === 'draft' ? '[copied]' : '[copy]'}
                </Button>
                <Button type="button" variant="outline" onClick={() => shareToWhatsApp(shareDraft.text)}>[buka WhatsApp]</Button>
                <Button type="button" variant="outline" onClick={() => downloadTextFile(`${shareDraft.title.replace(/[^a-zA-Z0-9-_]+/g, '_')}.txt`, shareDraft.text, 'text/plain;charset=utf-8')}>[download txt]</Button>
                <Button type="button" onClick={() => setShareDraft(null)}>[tutup]</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bayar upah packing</DialogTitle>
            <DialogDescription>Periksa ringkasan sebelum konfirmasi. Hanya sesi closed & belum dibayar dari 1 petugas yang bisa dibayar.</DialogDescription>
          </DialogHeader>
          {payPreview ? (
            <div className="grid gap-3 text-sm">
              <div className="rounded-[4px] border bg-muted/20 p-3">
                <p className="text-sm font-medium">{payPreview.packerLabel}</p>
                <p className="text-xs text-muted-foreground">{payPreview.count} sesi · {payPreview.totalPaket} paket · {formatCurrency(payPreview.totalUpah)}</p>
                <ul className="mt-2 max-h-[18vh] overflow-y-auto text-xs">
                  {payPreview.sessions.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2 border-b py-1.5 last:border-0">
                      <span className="truncate font-mono" title={s.id}>{new Date(s.startedAt).toLocaleDateString('id-ID')} · {s.id.slice(0, 8)}</span>
                      <span className="shrink-0 tabular-nums">{s.completedPackingCount} paket · {formatCurrency(s.totalPayAmount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid gap-2">
                <Label>Metode pembayaran</Label>
                <Select value={payMethod} onValueChange={(v) => setPayMethod(v as typeof payMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">cash</SelectItem>
                    <SelectItem value="transfer">transfer</SelectItem>
                    <SelectItem value="other">other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Catatan (opsional)</Label>
                <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="mis: periode 1-7 Agu, tunai" />
              </div>
              {payError ? (
                <Alert variant="destructive"><p>{payError}</p></Alert>
              ) : null}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowPayDialog(false)} disabled={payBusy}>[batal]</Button>
                <Button type="button" onClick={() => void handleConfirmPay()} disabled={payBusy || !payPreview.valid}>
                  {payBusy ? '[~] memproses' : '[konfirmasi bayar]'}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
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
    labels.push(`${productName}${variationName ? ` · ${variationName}` : ''} x${quantity}`)
  }

  return labels.join(', ') || '-'
}

function SessionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[4px] border bg-muted/10 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <strong className="mt-1 block truncate font-mono text-sm text-foreground" title={value}>{value}</strong>
    </div>
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
