import { useEffect, useState } from 'react'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
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
import { DialogCloseButton, DialogHeader, DialogTitle } from '../components/ui/dialog'

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

  return (
    <div className="admin-opencode grid w-full gap-5 px-0 py-1">
      <section className="admin-opencode__summary flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-2">
          <div className="admin-opencode__section-label">[+] Admin</div>
          <h1 className="admin-opencode__title">Admin Console</h1>
          <p className="admin-opencode__lede">Pantau status server, sesi, operator, dan aktivitas sistem inti.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="admin-opencode__badge">{loading ? '[~] loading' : error ? '[!] error' : '[x] ready'}</span>
          <span className="admin-opencode__badge">server only</span>
          <Button type="button" variant="outline" onClick={() => void handleRefresh()}>
            [refresh]
          </Button>
        </div>
      </section>

      <Alert variant={error ? 'destructive' : 'info'}>
        <div className="admin-opencode__alert grid gap-1">
          <p>{error ? '[!]' : '[+]'} Status</p>
          <p>{message}</p>
        </div>
      </Alert>

      <Card className="admin-opencode__panel">
        <CardHeader>
          <CardTitle>System overview</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <div className="admin-opencode__empty">[~] Memuat status server...</div>
          ) : error ? (
            <div className="admin-opencode__empty">[!] Status server belum tersedia.</div>
          ) : adminStatus ? (
            <div className="admin-opencode__stats">
              <Metric index="01" label="Bootstrap" value={adminStatus.bootstrap.needsSetup ? 'needed' : 'ready'} />
              <Metric index="02" label="Operators" value={String(adminStatus.bootstrap.operatorCount)} />
              <Metric index="03" label="Admins" value={String(adminStatus.bootstrap.adminCount)} />
              <Metric index="04" label="Recordings" value={String(adminStatus.counts.recordings)} />
              <Metric index="05" label="Scan logs" value={String(adminStatus.counts.scanLogs)} />
              <Metric index="06" label="Sessions" value={String(adminStatus.counts.sessions)} />
              <Metric index="07" label="Last error" value={adminStatus.lastError ? 'ada' : 'clear'} />
              <Metric index="08" label="Database" value={adminStatus.health ? 'online' : 'unknown'} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="admin-opencode__panel">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 md:grid-cols-2">
          <ActivityBlock title="Recent recordings" emptyText="[-] Belum ada recording di server.">
            {adminStatus?.recentRecordings.slice(0, 6).map((recording) => (
              <div key={recording.id} className="admin-opencode__list-row">
                <span>{recording.resiNumber}</span>
                <span>[{recording.status}]</span>
              </div>
            ))}
          </ActivityBlock>

          <ActivityBlock title="Recent scan logs" emptyText="[-] Belum ada scan log di server.">
            {adminStatus?.recentScanLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="admin-opencode__list-row">
                <span>{log.resiNumber}</span>
                <span>[{log.action}]</span>
              </div>
            ))}
          </ActivityBlock>
        </CardContent>
      </Card>

      <Card className="admin-opencode__panel">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle>Packing sessions (payroll)</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Filter packer..." value={sessionFilterText} onChange={(e) => setSessionFilterText(e.target.value)} className="history-opencode__input h-9 w-[180px]" />
              <Button type="button" variant="outline" size="sm" className="history-opencode__button" onClick={() => handleExportPayroll(null, 'all')}>
                [export payroll csv]
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4">
          {packingSessions.length === 0 ? (
            <div className="admin-opencode__empty">[-] Belum ada sesi packing.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="history-opencode__table w-full min-w-[860px] border-collapse">
                <thead>
                  <tr>
                    <th className="px-3 py-2">Packer</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Paket</th>
                    <th className="px-3 py-2">Upah</th>
                    <th className="px-3 py-2">Mulai</th>
                    <th className="px-3 py-2 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {packingSessions
                    .filter((s) =>
                      !sessionFilterText.trim() ||
                      `${s.packerNameSnapshot} ${s.packerCodeSnapshot}`.toLowerCase().includes(sessionFilterText.trim().toLowerCase()),
                    )
                    .map((s) => (
                      <tr key={s.id} className="history-opencode__row">
                        <td className="px-3 py-2 font-medium">{s.packerNameSnapshot} ({s.packerCodeSnapshot})</td>
                        <td className="px-3 py-2">[{s.status}]</td>
                        <td className="px-3 py-2">{s.completedPackingCount}</td>
                        <td className="px-3 py-2">{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(s.totalPayAmount)}</td>
                        <td className="px-3 py-2 text-xs">{new Date(s.startedAt).toLocaleString('id-ID')}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button type="button" variant="outline" size="sm" className="history-opencode__button" onClick={() => void handleOpenSessionDetail(s as unknown as PackingWorkSession)}>
                              [detail]
                            </Button>
                            {s.status === 'active' ? (
                              <Button type="button" variant="outline" size="sm" className="history-opencode__button" onClick={() => void handleCloseSession(s.id)}>
                                [tutup]
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
        </CardContent>
      </Card>

      <Card className="admin-opencode__panel">
        <CardHeader>
          <CardTitle>Pay rules (variasi upah)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          <div className="grid gap-2 rounded-[4px] border border-[rgba(15,0,0,0.12)] bg-muted/20 p-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <Input placeholder="Nama rule" value={payForm.name} onChange={(e) => setPayForm((p) => ({ ...p, name: e.target.value }))} className="history-opencode__input" />
              <select value={payForm.matchType} onChange={(e) => setPayForm((p) => ({ ...p, matchType: e.target.value as PackingPayRule['matchType'] }))} className="history-opencode__select h-10">
                <option value="default">default</option>
                <option value="product_contains">product_contains</option>
                <option value="variation_contains">variation_contains</option>
                <option value="sku_contains">sku_contains</option>
                <option value="shipping_channel">shipping_channel</option>
              </select>
              <Input placeholder="Match value" value={payForm.matchValue} onChange={(e) => setPayForm((p) => ({ ...p, matchValue: e.target.value }))} className="history-opencode__input" />
              <select value={payForm.payType} onChange={(e) => setPayForm((p) => ({ ...p, payType: e.target.value as PackingPayRule['payType'] }))} className="history-opencode__select h-10">
                <option value="per_package">per_package</option>
                <option value="per_qty">per_qty</option>
              </select>
              <Input placeholder="Amount" type="number" value={payForm.amount} onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))} className="history-opencode__input" />
              <Input placeholder="Priority" type="number" value={payForm.priority} onChange={(e) => setPayForm((p) => ({ ...p, priority: e.target.value }))} className="history-opencode__input" />
            </div>
            <Button type="button" variant="outline" size="sm" className="history-opencode__button w-fit" onClick={() => void handleCreatePayRule()}>
              [tambah rule]
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="history-opencode__table w-full min-w-[860px] border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">Match</th>
                  <th className="px-3 py-2">Pay</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Aktif</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {payRules.map((r) => (
                  <tr key={r.id} className="history-opencode__row">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{r.matchType}{r.matchValue ? `:${r.matchValue}` : ''}</td>
                    <td className="px-3 py-2">{r.payType}</td>
                    <td className="px-3 py-2">
                      <Input className="history-opencode__input h-8 w-[90px]" type="number" defaultValue={r.amount} onBlur={(e) => {
                        const v = Number(e.target.value)
                        if (v !== r.amount && Number.isFinite(v) && v > 0) void handleInlineUpdateRule(r, { amount: v })
                      }} />
                    </td>
                    <td className="px-3 py-2">
                      <Input className="history-opencode__input h-8 w-[70px]" type="number" defaultValue={r.priority} onBlur={(e) => {
                        const v = Number(e.target.value)
                        if (v !== r.priority && Number.isFinite(v)) void handleInlineUpdateRule(r, { priority: v })
                      }} />
                    </td>
                    <td className="px-3 py-2">
                      <Button type="button" variant={r.active ? 'default' : 'outline'} size="sm" className="history-opencode__button" onClick={() => void handleToggleRuleActive(r)}>
                        {r.active ? '[aktif]' : '[nonaktif]'}
                      </Button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button type="button" variant="outline" size="sm" className="history-opencode__button" onClick={() => void handleDeletePayRule(r.id)}>
                        [hapus]
                      </Button>
                    </td>
                  </tr>
                ))}
                {payRules.length === 0 ? <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">[-] Belum ada rule.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedSession ? (
        <ModalOverlay onClose={() => setSelectedSession(null)} contentClassName="max-w-3xl">
          <div className="grid gap-4">
            <DialogHeader className="flex items-start justify-between gap-4 text-left">
              <div className="grid gap-1">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Detail sesi packing</p>
                <DialogTitle className="text-lg">{selectedSession.packerNameSnapshot} ({selectedSession.packerCodeSnapshot}) · [{selectedSession.status}]</DialogTitle>
                <p className="text-sm text-slate-500">{new Date(selectedSession.startedAt).toLocaleString('id-ID')} → {selectedSession.endedAt ? new Date(selectedSession.endedAt).toLocaleString('id-ID') : 'masih aktif'} · {selectedSession.completedPackingCount} paket · {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(selectedSession.totalPayAmount)}</p>
              </div>
              <DialogCloseButton onClick={() => setSelectedSession(null)} />
            </DialogHeader>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="history-opencode__button" onClick={() => handleExportPayroll(selectedSession, 'session')}>
                [export csv sesi]
              </Button>
              {selectedSession.status === 'active' ? (
                <Button type="button" variant="outline" size="sm" className="history-opencode__button" onClick={() => void handleCloseSession(selectedSession.id)}>
                  [tutup sesi]
                </Button>
              ) : null}
            </div>
            {sessionDetailLoading ? (
              <div className="text-sm">[~] Memuat detail sesi...</div>
            ) : sessionRecords.length === 0 ? (
              <div className="text-sm">[-] Belum ada paket completed di sesi ini.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="history-opencode__table w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr>
                      <th className="px-3 py-2">Resi</th>
                      <th className="px-3 py-2">Order</th>
                      <th className="px-3 py-2">Media</th>
                      <th className="px-3 py-2">Upah</th>
                      <th className="px-3 py-2">Breakdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionRecords.map((rec) => {
                      const r = rec as unknown as { resiNumber: string; orderNumber?: string | null; mediaType?: string; packingPayAmount?: number | null; packingPayBreakdown?: { ruleName?: string; payType?: string; amount?: number; quantity?: number; total?: number } | null; orderSnapshot?: { items?: Array<{ productName: string; variationName?: string | null; quantity: number }> } | null }
                      return (
                        <tr key={r.resiNumber + rec.id} className="history-opencode__row">
                          <td className="px-3 py-2 font-mono text-xs">{r.resiNumber}</td>
                          <td className="px-3 py-2 text-xs">{r.orderNumber ?? (r.orderSnapshot ? '-' : '-')}{r.orderSnapshot?.items ? ` · ${r.orderSnapshot.items.map((it) => `${it.productName} x${it.quantity}`).join(', ')}` : ''}</td>
                          <td className="px-3 py-2">[{r.mediaType ?? 'video'}]</td>
                          <td className="px-3 py-2">{r.packingPayAmount != null ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(r.packingPayAmount) : '-'}</td>
                          <td className="px-3 py-2 text-xs">{r.packingPayBreakdown ? `${r.packingPayBreakdown.ruleName ?? '-'} · ${r.packingPayBreakdown.payType ?? '-'} · Rp${r.packingPayBreakdown.amount ?? 0} x${r.packingPayBreakdown.quantity ?? 1}` : '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </ModalOverlay>
      ) : null}
    </div>
  )
}

function Metric({ index, label, value }: { index: string; label: string; value: string }) {
  return (
    <div className="admin-opencode__stat">
      <span>{index}</span>
      <p>{label}<br /><strong>{value}</strong></p>
    </div>
  )
}

function ActivityBlock({ title, emptyText, children }: { title: string; emptyText: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)

  return (
    <div className="admin-opencode__list-block">
      <p>[+] {title}</p>
      <div className="mt-3 grid gap-2">
        {hasChildren ? children : <p>{emptyText}</p>}
      </div>
    </div>
  )
}
