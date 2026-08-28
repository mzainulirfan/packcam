import { useEffect, useState } from 'react'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { readPackingPayRulesApi, createPackingPayRuleApi, deletePackingPayRuleApi, readPackingSessionsApi, readServerAdminStatusApi } from '@pakti/api-client'
import type { PackingPayRule } from '@pakti/types'

type AdminStatus = Awaited<ReturnType<typeof readServerAdminStatusApi>>

export function AdminPage() {
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('Memuat status server...')
  const [packingSessions, setPackingSessions] = useState<Awaited<ReturnType<typeof readPackingSessionsApi>>>([])
  const [payRules, setPayRules] = useState<PackingPayRule[]>([])
  const [payForm, setPayForm] = useState({ name: '', matchType: 'default' as PackingPayRule['matchType'], matchValue: '', payType: 'per_package' as PackingPayRule['payType'], amount: '1500', priority: '0' })

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
          <CardTitle>Packing sessions (payroll)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4">
          {packingSessions.length === 0 ? (
            <div className="admin-opencode__empty">[-] Belum ada sesi packing.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="history-opencode__table w-full min-w-[720px] border-collapse">
                <thead>
                  <tr>
                    <th className="px-3 py-2">Packer</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Paket</th>
                    <th className="px-3 py-2">Upah</th>
                    <th className="px-3 py-2">Mulai</th>
                  </tr>
                </thead>
                <tbody>
                  {packingSessions.map((s) => (
                    <tr key={s.id} className="history-opencode__row">
                      <td className="px-3 py-2 font-medium">{s.packerNameSnapshot} ({s.packerCodeSnapshot})</td>
                      <td className="px-3 py-2">[{s.status}]</td>
                      <td className="px-3 py-2">{s.completedPackingCount}</td>
                      <td className="px-3 py-2">{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(s.totalPayAmount)}</td>
                      <td className="px-3 py-2 text-xs">{new Date(s.startedAt).toLocaleString('id-ID')}</td>
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
            <table className="history-opencode__table w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">Match</th>
                  <th className="px-3 py-2">Pay</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {payRules.map((r) => (
                  <tr key={r.id} className="history-opencode__row">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{r.matchType}{r.matchValue ? `:${r.matchValue}` : ''}</td>
                    <td className="px-3 py-2">{r.payType}</td>
                    <td className="px-3 py-2">{r.amount}</td>
                    <td className="px-3 py-2">{r.priority}</td>
                    <td className="px-3 py-2 text-right">
                      <Button type="button" variant="outline" size="sm" className="history-opencode__button" onClick={() => void handleDeletePayRule(r.id)}>
                        [hapus]
                      </Button>
                    </td>
                  </tr>
                ))}
                {payRules.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">[-] Belum ada rule.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
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
