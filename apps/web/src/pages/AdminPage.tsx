import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Activity01Icon,
  AddCircleIcon,
  ArrowRight01Icon,
  Cancel01Icon,
  Database02Icon,
  Delete02Icon,
  DollarCircleIcon,
  Download01Icon,
  Package01Icon,
  RefreshIcon,
  Search01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { navigateTo } from '../app/uiState'
import {
  closePackingSessionApi,
  readPackingPayRulesApi,
  createPackingPayRuleApi,
  deletePackingPayRuleApi,
  readPackingSessionsApi,
  readServerAdminStatusApi,
  readServerHistoryRecordingsApi,
  updatePackingPayRuleApi,
} from '@pakti/api-client'
import type { PackingPayRule, PackingWorkSession } from '@pakti/types'
import { downloadTextFile } from '@pakti/shared'
import { recordsToCsv } from '@pakti/shared/exporters'
import { ModalOverlay } from '../components/ui/ModalOverlay'

type AdminStatus = Awaited<ReturnType<typeof readServerAdminStatusApi>>

export function AdminPage() {
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('Memuat status server...')
  const [packingSessions, setPackingSessions] = useState<Awaited<ReturnType<typeof readPackingSessionsApi>>>([])
  const [payRules, setPayRules] = useState<PackingPayRule[]>([])
  const [payForm, setPayForm] = useState({ name: '', matchType: 'default' as PackingPayRule['matchType'], matchValue: '', payType: 'per_package' as PackingPayRule['payType'], amount: '1500', priority: '0' })
  const [selectedSession, setSelectedSession] = useState<PackingWorkSession | null>(null)
  const [sessionRecords, setSessionRecords] = useState<Awaited<ReturnType<typeof readServerHistoryRecordingsApi>>['records']>([])
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false)
  const [sessionFilterText, setSessionFilterText] = useState('')

  async function loadAdminData() {
    const status = await readServerAdminStatusApi()
    setAdminStatus(status)
    setError(null)
    setMessage('Status server dimuat.')
  }

  useEffect(() => {
    let active = true

    queueMicrotask(() => {
      void loadAdminData()
        .catch(() => {
          if (!active) return
          setAdminStatus(null)
          setError('Sesi login diperlukan atau server belum aktif, panel admin memakai mode terbatas.')
          setMessage('Sesi login diperlukan atau server belum aktif, panel admin memakai mode terbatas.')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    })

    void Promise.all([readPackingSessionsApi(20).catch(() => []), readPackingPayRulesApi().catch(() => [])]).then(([sessions, rules]) => {
      if (!active) return
      setPackingSessions(sessions as unknown as typeof packingSessions)
      setPayRules(rules)
    })

    return () => {
      active = false
    }
  }, [])

  async function handleRefresh() {
    setLoading(true)
    setError(null)

    try {
      await loadAdminData()
      const [sessions, rules] = await Promise.all([readPackingSessionsApi(20).catch(() => []), readPackingPayRulesApi().catch(() => [])])
      setPackingSessions(sessions as unknown as typeof packingSessions)
      setPayRules(rules)
    } catch {
      setAdminStatus(null)
      setError('Sesi login diperlukan atau server belum aktif, panel admin memakai mode terbatas.')
      setMessage('Status belum bisa diperbarui karena sesi login diperlukan atau server belum aktif.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreatePayRule() {
    try {
      const created = await createPackingPayRuleApi({
        name: payForm.name.trim(),
        matchType: payForm.matchType,
        matchValue: payForm.matchValue.trim() || null,
        payType: payForm.payType,
        amount: Number(payForm.amount),
        priority: Number(payForm.priority),
      })
      setPayRules((prev) => [created, ...prev.filter((r) => r.id !== created.id)].sort((a, b) => b.priority - a.priority))
      setPayForm({ name: '', matchType: 'default', matchValue: '', payType: 'per_package', amount: '1500', priority: '0' })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal buat rule')
    }
  }

  async function handleDeletePayRule(id: string) {
    if (!confirm('Hapus pay rule ini?')) return
    try {
      await deletePackingPayRuleApi(id)
      setPayRules((prev) => prev.filter((r) => r.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal hapus')
    }
  }

  async function handleCloseSession(id: string) {
    if (!confirm('Tutup sesi packing ini?')) return
    try {
      const updated = await closePackingSessionApi(id)
      setPackingSessions((prev) => prev.map((s) => (s.id === updated.id ? { ...s, status: updated.status, endedAt: updated.endedAt } as unknown as typeof s : s)))
      if (selectedSession?.id === id) setSelectedSession(updated)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal tutup sesi')
    }
  }

  async function handleToggleRuleActive(rule: PackingPayRule) {
    try {
      const updated = await updatePackingPayRuleApi(rule.id, { active: !rule.active })
      setPayRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal update rule')
    }
  }

  async function handleInlineUpdateRule(rule: PackingPayRule, patch: Partial<Pick<PackingPayRule, 'amount' | 'priority'>>) {
    try {
      const updated = await updatePackingPayRuleApi(rule.id, patch)
      setPayRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal update rule')
    }
  }

  async function handleOpenSessionDetail(session: PackingWorkSession) {
    setSelectedSession(session)
    setSessionDetailLoading(true)
    try {
      const result = await readServerHistoryRecordingsApi({ taskType: 'packing' })
      const filtered = result.records.filter((rec) => (rec as unknown as { packingSessionId?: string | null }).packingSessionId === session.id)
      setSessionRecords(filtered)
    } catch {
      setSessionRecords([])
    } finally {
      setSessionDetailLoading(false)
    }
  }

  function handleExportPayroll(session: PackingWorkSession | null, scope: 'session' | 'all') {
    const records = scope === 'session' && session ? sessionRecords : []
    const exportRecords = scope === 'session' ? records : []
    // for 'all' we export packing sessions summary via CSV manual
    if (scope === 'all') {
      const csv = [
        'session_id,packer_name,packer_code,status,paket,upah,mulai,ended',
        ...packingSessions.map((s) => `${s.id},${s.packerNameSnapshot},${s.packerCodeSnapshot},${s.status},${s.completedPackingCount},${s.totalPayAmount},${s.startedAt},${s.endedAt ?? ''}`),
      ].join('\n')
      downloadTextFile(`payroll-sessions-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8')
      return
    }
    if (exportRecords.length === 0) {
      alert('Tidak ada data untuk export.')
      return
    }
    const csv = recordsToCsv(exportRecords)
    downloadTextFile(`payroll-${session?.packerCodeSnapshot ?? 'session'}-${session?.id.slice(0, 8) ?? 'unknown'}.csv`, csv, 'text/csv;charset=utf-8')
  }

  const filteredPackingSessions = packingSessions.filter((s) => !sessionFilterText.trim() || `${s.packerNameSnapshot} ${s.packerCodeSnapshot}`.toLowerCase().includes(sessionFilterText.trim().toLowerCase()))

  return (
    <div className="admin-page mx-auto max-w-[1240px] bg-[#f6f5f4] px-4 py-8 font-['Inter'] sm:px-6 lg:py-10 xl:px-8">
      <section className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">System / Admin</div>
          <h1 className="mt-2 text-[32px] font-bold leading-[1.1] tracking-[-0.8px] text-[#000000] sm:text-[36px]">Admin console</h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-6 text-[#615d59] sm:text-[15px]">Pantau status server, aktivitas terbaru, sesi packing payroll, dan variasi aturan upah.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex h-11 items-center justify-center rounded-full border px-4 text-[14px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.035)] ${error ? 'border-[#f2c8a4] bg-[#fff7ed] text-[#dd5b00]' : 'border-[#dddddd] bg-white text-[#0075de]'}`}>{loading ? 'Loading' : error ? 'Error' : 'Ready'}</span>
          <Button type="button" variant="outline" onClick={() => void handleRefresh()} className="h-11 rounded-full border-[#dddddd] bg-white px-5 text-[14px] font-medium text-[#615d59] hover:bg-[#fbfaf9]">
            <HugeiconsIcon icon={RefreshIcon} size={18} strokeWidth={1.9} /> Refresh
          </Button>
        </div>
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <AdminStat label="Operators" value={String(adminStatus?.bootstrap.operatorCount ?? 0)} detail={`${adminStatus?.bootstrap.adminCount ?? 0} admin aktif`} icon={UserGroupIcon} />
        <AdminStat label="Recordings" value={String(adminStatus?.counts.recordings ?? 0)} detail={`${adminStatus?.counts.scanLogs ?? 0} scan log`} icon={Database02Icon} />
        <AdminStat label="Sessions" value={String(adminStatus?.counts.sessions ?? packingSessions.length)} detail={`${payRules.length} pay rule`} icon={Package01Icon} />
      </section>

      <Alert variant={error ? 'destructive' : 'info'} className="mb-5 rounded-[4px] border-[#dddddd] bg-white font-['Inter'] text-[14px]">
        <div className="grid gap-1">
          <p className="font-semibold text-[#000000]">Status</p>
          <p className="text-[#31302e]">{message}</p>
        </div>
      </Alert>

      <section className="mb-5 overflow-hidden rounded-xl border border-[#dddddd] bg-white">
        <PanelHeader icon={Activity01Icon} title="Recent activity" description="Aktivitas recording dan scan log terbaru dari server." />
        <div className="grid gap-4 p-4 md:grid-cols-2 sm:p-5">
          <ActivityBlock title="Recent recordings" emptyText="Belum ada recording di server.">
            {adminStatus?.recentRecordings.slice(0, 6).map((recording) => <ActivityRow key={recording.id} primary={recording.resiNumber} secondary={recording.status} />)}
          </ActivityBlock>
          <ActivityBlock title="Recent scan logs" emptyText="Belum ada scan log di server.">
            {adminStatus?.recentScanLogs.slice(0, 6).map((log) => <ActivityRow key={log.id} primary={log.resiNumber} secondary={log.action} />)}
          </ActivityBlock>
        </div>
      </section>

      <section className="mb-5 overflow-hidden rounded-xl border border-[#dddddd] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#dddddd] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="text-[16px] font-semibold text-[#000000]">Packing sessions payroll</h2>
            <p className="mt-1 text-[12px] text-[#a39e98]">Ringkasan sesi packing dan nominal upah.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg border-[#dddddd] bg-white px-3 text-[13px] font-medium text-[#615d59]" onClick={() => navigateTo('packing-sessions')}><HugeiconsIcon icon={ArrowRight01Icon} size={15} strokeWidth={1.9} /> Buka sesi</Button>
            <label className="relative">
              <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.9} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a39e98]" />
              <Input placeholder="Filter packer..." value={sessionFilterText} onChange={(e) => setSessionFilterText(e.target.value)} className="h-9 w-[190px] rounded-lg border-[#dddddd] bg-white pl-9 text-[13px] focus-visible:border-[#0075de] focus-visible:ring-0" />
            </label>
            <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg border-[#dddddd] bg-white px-3 text-[13px] font-medium text-[#615d59]" onClick={() => handleExportPayroll(null, 'all')}><HugeiconsIcon icon={Download01Icon} size={15} strokeWidth={1.9} /> Export CSV</Button>
          </div>
        </div>
        {packingSessions.length === 0 ? <EmptyState>Belum ada sesi packing.</EmptyState> : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[860px] border-collapse">
              <thead className="bg-[#f6f5f4]"><tr className="text-left"><Th>Packer</Th><Th>Status</Th><Th>Paket</Th><Th>Upah</Th><Th>Mulai</Th><Th className="text-right">Aksi</Th></tr></thead>
              <tbody className="divide-y divide-[#e6e6e6]">
                {filteredPackingSessions.map((s) => (
                  <tr key={s.id} className="bg-white hover:bg-[#fbfaf9]"><Td className="font-medium text-[#000000]">{s.packerNameSnapshot} ({s.packerCodeSnapshot})</Td><Td><StatusBadge value={s.status} /></Td><Td>{s.completedPackingCount}</Td><Td>{formatCurrency(s.totalPayAmount)}</Td><Td>{formatDateTime(s.startedAt)}</Td><Td className="text-right"><div className="flex justify-end gap-1"><SmallAction onClick={() => void handleOpenSessionDetail(s as unknown as PackingWorkSession)}>Detail</SmallAction>{s.status === 'active' ? <SmallAction onClick={() => void handleCloseSession(s.id)}>Tutup</SmallAction> : null}</div></Td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-[#dddddd] bg-white">
        <PanelHeader icon={DollarCircleIcon} title="Pay rules" description="Aturan variasi upah packing berdasarkan default, produk, SKU, atau channel pengiriman." />
        <div className="grid gap-4 p-4 sm:p-5">
          <div className="grid gap-3 rounded-[12px] border border-[#dddddd] bg-[#f6f5f4] p-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <AdminInput placeholder="Nama rule" value={payForm.name} onChange={(e) => setPayForm((p) => ({ ...p, name: e.target.value }))} />
              <AdminSelect value={payForm.matchType} onChange={(e) => setPayForm((p) => ({ ...p, matchType: e.target.value as PackingPayRule['matchType'] }))}><option value="default">default</option><option value="product_contains">product_contains</option><option value="variation_contains">variation_contains</option><option value="sku_contains">sku_contains</option><option value="shipping_channel">shipping_channel</option></AdminSelect>
              <AdminInput placeholder="Match value" value={payForm.matchValue} onChange={(e) => setPayForm((p) => ({ ...p, matchValue: e.target.value }))} />
              <AdminSelect value={payForm.payType} onChange={(e) => setPayForm((p) => ({ ...p, payType: e.target.value as PackingPayRule['payType'] }))}><option value="per_package">per_package</option><option value="per_qty">per_qty</option></AdminSelect>
              <AdminInput placeholder="Amount" type="number" value={payForm.amount} onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))} />
              <AdminInput placeholder="Priority" type="number" value={payForm.priority} onChange={(e) => setPayForm((p) => ({ ...p, priority: e.target.value }))} />
            </div>
            <Button type="button" variant="outline" size="sm" className="h-9 w-fit rounded-lg border-[#dddddd] bg-white px-3 text-[13px] font-medium text-[#000000]" onClick={() => void handleCreatePayRule()}><HugeiconsIcon icon={AddCircleIcon} size={15} strokeWidth={1.9} /> Tambah rule</Button>
          </div>

          <div className="overflow-x-auto scrollbar-thin rounded-xl border border-[#dddddd]">
            <table className="w-full min-w-[860px] border-collapse">
              <thead className="bg-[#f6f5f4]"><tr className="text-left"><Th>Nama</Th><Th>Match</Th><Th>Pay</Th><Th>Amount</Th><Th>Priority</Th><Th>Aktif</Th><Th className="text-right">Aksi</Th></tr></thead>
              <tbody className="divide-y divide-[#e6e6e6]">
                {payRules.map((r) => (
                  <tr key={r.id} className="bg-white hover:bg-[#fbfaf9]"><Td className="font-medium text-[#000000]">{r.name}</Td><Td>{r.matchType}{r.matchValue ? `:${r.matchValue}` : ''}</Td><Td>{r.payType}</Td><Td><InlineNumber defaultValue={r.amount} className="w-[90px]" onCommit={(v) => { if (v !== r.amount && Number.isFinite(v) && v > 0) void handleInlineUpdateRule(r, { amount: v }) }} /></Td><Td><InlineNumber defaultValue={r.priority} className="w-[70px]" onCommit={(v) => { if (v !== r.priority && Number.isFinite(v)) void handleInlineUpdateRule(r, { priority: v }) }} /></Td><Td><Button type="button" variant={r.active ? 'default' : 'outline'} size="sm" className={`h-8 rounded-full px-3 text-[12px] font-medium ${r.active ? 'bg-[#0075de] text-white hover:bg-[#005bab]' : 'border-[#dddddd] bg-white text-[#615d59]'}`} onClick={() => void handleToggleRuleActive(r)}>{r.active ? 'Aktif' : 'Nonaktif'}</Button></Td><Td className="text-right"><SmallAction onClick={() => void handleDeletePayRule(r.id)}><HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.9} /></SmallAction></Td></tr>
                ))}
                {payRules.length === 0 ? <tr><td colSpan={7} className="px-6 py-10 text-center text-[14px] text-[#615d59]">Belum ada rule.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {selectedSession ? (
        <ModalOverlay onClose={() => setSelectedSession(null)} contentClassName="admin-modal max-w-3xl gap-0 overflow-hidden rounded-2xl border-[#dddddd] bg-white p-0 font-['Inter'] shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
          <div>
            <div className="border-b border-[#dddddd] p-6"><div className="flex items-start justify-between gap-5"><div className="grid gap-1"><p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Detail sesi packing</p><h3 className="text-[18px] font-semibold text-[#000000]">{selectedSession.packerNameSnapshot} ({selectedSession.packerCodeSnapshot}) · {selectedSession.status}</h3><p className="text-[13px] leading-5 text-[#615d59]">{formatDateTime(selectedSession.startedAt)} {'->'} {selectedSession.endedAt ? formatDateTime(selectedSession.endedAt) : 'masih aktif'} · {selectedSession.completedPackingCount} paket · {formatCurrency(selectedSession.totalPayAmount)}</p></div><Button type="button" variant="ghost" size="icon" onClick={() => setSelectedSession(null)} className="h-9 w-9 shrink-0 rounded-lg text-[#615d59] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={Cancel01Icon} size={19} strokeWidth={1.9} /></Button></div></div>
            <div className="flex flex-wrap gap-2 p-4"><Button type="button" variant="outline" size="sm" className="h-9 rounded-lg border-[#dddddd] bg-white px-3 text-[13px]" onClick={() => handleExportPayroll(selectedSession, 'session')}><HugeiconsIcon icon={Download01Icon} size={15} strokeWidth={1.9} /> Export CSV sesi</Button>{selectedSession.status === 'active' ? <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg border-[#dddddd] bg-white px-3 text-[13px]" onClick={() => void handleCloseSession(selectedSession.id)}>Tutup sesi</Button> : null}</div>
            {sessionDetailLoading ? <EmptyState>Memuat detail sesi...</EmptyState> : sessionRecords.length === 0 ? <EmptyState>Belum ada paket completed di sesi ini.</EmptyState> : <SessionRecordsTable records={sessionRecords} />}
          </div>
        </ModalOverlay>
      ) : null}
    </div>
  )
}

function ActivityBlock({ title, emptyText, children }: { title: string; emptyText: string; children: ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)

  return (
    <div className="rounded-[12px] border border-[#dddddd] bg-[#f6f5f4] p-4">
      <p className="text-[13px] font-semibold text-[#000000]">{title}</p>
      <div className="mt-3 grid gap-2 text-[13px]">
        {hasChildren ? children : <p className="text-[#615d59]">{emptyText}</p>}
      </div>
    </div>
  )
}

function AdminStat({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: typeof Activity01Icon }) {
  return (
    <article className="rounded-xl border border-[#dddddd] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">{label}</div>
          <div className="mt-3 text-[28px] font-bold leading-none tracking-[-0.5px] text-[#000000]">{value}</div>
          <p className="mt-2 text-[12px] text-[#615d59]">{detail}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f6f5f4] text-[#31302e]"><HugeiconsIcon icon={icon} size={19} strokeWidth={1.9} /></span>
      </div>
    </article>
  )
}

function PanelHeader({ icon, title, description }: { icon: typeof Activity01Icon; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-[#dddddd] px-4 py-4 sm:px-5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f6f5f4] text-[#31302e]"><HugeiconsIcon icon={icon} size={19} strokeWidth={1.9} /></span>
      <div className="min-w-0"><h2 className="text-[16px] font-semibold text-[#000000]">{title}</h2><p className="mt-1 text-[12px] leading-5 text-[#a39e98]">{description}</p></div>
    </div>
  )
}

// @ts-ignore TS6133 - kept for future use
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[4px] border border-[#dddddd] bg-[#f6f5f4] p-3"><div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">{label}</div><div className="mt-2 text-[18px] font-semibold text-[#000000]">{value}</div></div>
}

function ActivityRow({ primary, secondary }: { primary: string; secondary: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-[4px] border border-[#dddddd] bg-white px-3 py-2"><span className="truncate font-medium text-[#000000]">{primary}</span><span className="shrink-0 rounded-full border border-[#dddddd] px-2 py-0.5 text-[11px] font-semibold text-[#0075de]">{secondary}</span></div>
}

function StatusBadge({ value }: { value: string }) {
  return <span className="inline-flex rounded-[4px] border border-[#dddddd] bg-white px-2 py-1 text-[12px] font-medium text-[#615d59]">{value}</span>
}

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98] ${className}`}>{children}</th>
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top text-[13px] text-[#31302e] ${className}`}>{children}</td>
}

function SmallAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg border-[#dddddd] bg-white px-3 text-[12px] font-medium text-[#615d59] hover:bg-[#f6f5f4]" onClick={onClick}>{children}</Button>
}

function AdminInput(props: React.ComponentProps<typeof Input>) {
  return <Input {...props} className={`h-10 rounded-[4px] border-[#dddddd] bg-white px-3 text-[13px] focus-visible:border-[#0075de] focus-visible:ring-0 ${props.className ?? ''}`} />
}

function AdminSelect({ children, ...props }: React.ComponentProps<'select'>) {
  return <select {...props} className={`h-10 rounded-[4px] border border-[#dddddd] bg-white px-3 text-[13px] focus:border-[#0075de] focus:outline-none ${props.className ?? ''}`}>{children}</select>
}

function InlineNumber({ defaultValue, className, onCommit }: { defaultValue: number; className?: string; onCommit: (value: number) => void }) {
  return <Input className={`h-8 rounded-[4px] border-[#dddddd] bg-white px-2 text-[13px] focus-visible:border-[#0075de] focus-visible:ring-0 ${className ?? ''}`} type="number" defaultValue={defaultValue} onBlur={(e) => onCommit(Number(e.target.value))} />
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="p-6 text-center text-[14px] font-medium text-[#615d59]">{children}</div>
}

function SessionRecordsTable({ records }: { records: Awaited<ReturnType<typeof readServerHistoryRecordingsApi>>['records'] }) {
  return (
    <div className="overflow-x-auto scrollbar-thin border-t border-[#dddddd]">
      <table className="w-full min-w-[640px] border-collapse"><thead className="bg-[#f6f5f4]"><tr><Th>Resi</Th><Th>Order</Th><Th>Media</Th><Th>Upah</Th><Th>Breakdown</Th></tr></thead><tbody className="divide-y divide-[#e6e6e6]">
        {records.map((rec) => {
          const r = rec as unknown as { resiNumber: string; orderNumber?: string | null; mediaType?: string; packingPayAmount?: number | null; packingPayBreakdown?: { ruleName?: string; payType?: string; amount?: number; quantity?: number } | null; orderSnapshot?: { items?: Array<{ productName: string; quantity: number }> } | null }
          return <tr key={r.resiNumber + rec.id} className="bg-white hover:bg-[#fbfaf9]"><Td className="font-medium text-[#000000]">{r.resiNumber}</Td><Td>{r.orderNumber ?? '-'}{r.orderSnapshot?.items ? ` · ${r.orderSnapshot.items.map((it) => `${it.productName} x${it.quantity}`).join(', ')}` : ''}</Td><Td>{r.mediaType ?? 'video'}</Td><Td>{r.packingPayAmount != null ? formatCurrency(r.packingPayAmount) : '-'}</Td><Td>{r.packingPayBreakdown ? `${r.packingPayBreakdown.ruleName ?? '-'} · ${r.packingPayBreakdown.payType ?? '-'} · Rp${r.packingPayBreakdown.amount ?? 0} x${r.packingPayBreakdown.quantity ?? 1}` : '-'}</Td></tr>
        })}
      </tbody></table>
    </div>
  )
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
