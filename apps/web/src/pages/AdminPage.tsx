import { useEffect, useMemo, useState } from 'react'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { readRecentShopeeChatSendsApi, readRecentShopeeOrdersApi, readServerAdminStatusApi, readRecentShippingChatSendsApi, retryShopeeChatSendApi, retryShippingChatSendApi } from '@pakti/api-client'
import type { ChatSendStatus, RecordingChatSend, ShopeeOrder, ShippingChatSend } from '@pakti/types'

type AdminStatus = Awaited<ReturnType<typeof readServerAdminStatusApi>>
type ChatSendFilter = 'all' | ChatSendStatus

const CHAT_SEND_STATUSES: ChatSendStatus[] = ['pending', 'prepared', 'sent', 'failed', 'cancelled']

export function AdminPage() {
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null)
  const [recentShopeeOrders, setRecentShopeeOrders] = useState<ShopeeOrder[]>([])
  const [recentChatSends, setRecentChatSends] = useState<RecordingChatSend[]>([])
  const [recentShippingChatSends, setRecentShippingChatSends] = useState<ShippingChatSend[]>([])
  const [chatSendFilter, setChatSendFilter] = useState<ChatSendFilter>('all')
  const [shippingChatFilter, setShippingChatFilter] = useState<ChatSendFilter>('all')
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('Memuat status server...')

  const chatSendCounts = useMemo(() => countByStatus(recentChatSends), [recentChatSends])
  const shippingChatCounts = useMemo(() => countByStatus(recentShippingChatSends), [recentShippingChatSends])
  const filteredChatSends = useMemo(
    () => recentChatSends.filter((job) => chatSendFilter === 'all' || job.status === chatSendFilter),
    [chatSendFilter, recentChatSends],
  )
  const filteredShippingChatSends = useMemo(
    () => recentShippingChatSends.filter((job) => shippingChatFilter === 'all' || job.status === shippingChatFilter),
    [recentShippingChatSends, shippingChatFilter],
  )

  async function loadCoreAdminData() {
    const [status, orders, chatSends] = await Promise.all([
      readServerAdminStatusApi(),
      readRecentShopeeOrdersApi(10),
      readRecentShopeeChatSendsApi(50),
    ])

    setAdminStatus(status)
    setRecentShopeeOrders(orders)
    setRecentChatSends(chatSends)
    setError(null)
    setMessage('Status server dimuat.')
  }

  async function loadShippingChatSends() {
    setRecentShippingChatSends(await readRecentShippingChatSendsApi(50))
  }

  useEffect(() => {
    let active = true

    void loadCoreAdminData()
      .then(() => {
        if (!active) {
          return
        }
      })
      .catch(() => {
        if (!active) {
          return
        }

        setAdminStatus(null)
        setRecentShopeeOrders([])
        setRecentChatSends([])
        setError('Sesi login diperlukan atau server belum aktif, panel admin memakai mode terbatas.')
        setMessage('Sesi login diperlukan atau server belum aktif, panel admin memakai mode terbatas.')
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    void loadShippingChatSends()
      .then(() => {
        if (!active) return
      })
      .catch(() => {
        if (active) setRecentShippingChatSends([])
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    function handleChatSendsUpdated() {
      void readRecentShopeeChatSendsApi(50)
        .then((sends) => {
          setRecentChatSends(sends)
        })
        .catch(() => {})
    }

    function handleShippingChatSendsUpdated() {
      void readRecentShippingChatSendsApi(50)
        .then((sends) => {
          setRecentShippingChatSends(sends)
        })
        .catch(() => {})
    }

    window.addEventListener('pakti:chat-sends-updated', handleChatSendsUpdated)
    window.addEventListener('pakti:shipping-chat-sends-updated', handleShippingChatSendsUpdated)
    return () => {
      window.removeEventListener('pakti:chat-sends-updated', handleChatSendsUpdated)
      window.removeEventListener('pakti:shipping-chat-sends-updated', handleShippingChatSendsUpdated)
    }
  }, [])

  async function handleRefresh() {
    setLoading(true)
    setError(null)

    try {
      await loadCoreAdminData()
    } catch {
      setAdminStatus(null)
      setRecentShopeeOrders([])
      setRecentChatSends([])
      setError('Sesi login diperlukan atau server belum aktif, panel admin memakai mode terbatas.')
      setMessage('Status belum bisa diperbarui karena sesi login diperlukan atau server belum aktif.')
    } finally {
      setLoading(false)
    }

    void loadShippingChatSends()
      .catch(() => {})
  }

  async function handleRetryShippingChat(id: string) {
    if (retryingId) return
    setRetryingId(id)
    try {
      await retryShippingChatSendApi(id)
      const sends = await readRecentShippingChatSendsApi(50)
      setRecentShippingChatSends(sends)
    } catch (err) {
      console.error('Retry failed', err)
      alert(err instanceof Error ? err.message : 'Gagal me-retry shipping chat.')
    } finally {
      setRetryingId(null)
    }
  }

  async function handleRetryVideoChat(id: string) {
    if (retryingId) return
    setRetryingId(id)
    try {
      await retryShopeeChatSendApi(id)
      const sends = await readRecentShopeeChatSendsApi(50)
      setRecentChatSends(sends)
    } catch (err) {
      console.error('Retry failed', err)
      alert(err instanceof Error ? err.message : 'Gagal me-retry video chat.')
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <div className="admin-opencode grid w-full gap-5 px-0 py-1">
      <section className="admin-opencode__summary flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-2">
          <div className="admin-opencode__section-label">[+] Admin</div>
          <h1 className="admin-opencode__title">Admin Console</h1>
          <p className="admin-opencode__lede">Pantau server, integrasi Shopee, dan antrean chat dari satu halaman.</p>
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
              <Metric index="08" label="Shopee jobs" value={String(recentChatSends.length + recentShippingChatSends.length)} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="admin-opencode__panel">
        <CardHeader>
          <CardTitle>Shopee automation</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {adminStatus ? (
            <div className="admin-opencode__stats">
              <Metric index="01" label="Orders synced" value={String(adminStatus.shopeeAutomation.orders.total)} />
              <Metric index="02" label="Orders today" value={String(adminStatus.shopeeAutomation.orders.updatedToday)} />
              <Metric index="03" label="Video pending" value={String(adminStatus.shopeeAutomation.videoChat.counts.pending)} />
              <Metric index="04" label="Shipping pending" value={String(adminStatus.shopeeAutomation.shippingChat.counts.pending)} />
              <Metric index="05" label="Sent today" value={String(adminStatus.shopeeAutomation.videoChat.sentToday + adminStatus.shopeeAutomation.shippingChat.sentToday)} />
              <Metric index="06" label="Failed today" value={String(adminStatus.shopeeAutomation.videoChat.failedOrCancelledToday + adminStatus.shopeeAutomation.shippingChat.failedOrCancelledToday)} />
              <Metric index="07" label="Last order sync" value={formatOptionalDateTime(adminStatus.shopeeAutomation.orders.latestUpdatedAt)} />
              <Metric index="08" label="Worker heartbeat" value={formatWorkerHeartbeat(adminStatus.shopeeAutomation.extensionWorker?.updatedAt ?? null)} />
            </div>
          ) : (
            <div className="admin-opencode__empty">[-] Metrik Shopee belum tersedia.</div>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="admin-opencode__panel">
          <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Shopee video chat</CardTitle>
            <StatusFilter id="chat-send-status-filter" value={chatSendFilter} counts={chatSendCounts} total={recentChatSends.length} onChange={setChatSendFilter} />
          </CardHeader>
          <CardContent className="pt-4">
            <ChatSendTable jobs={filteredChatSends} retryingId={retryingId} onRetry={handleRetryVideoChat} emptyText="[-] Tidak ada job video chat dengan kriteria ini." />
          </CardContent>
        </Card>

        <Card className="admin-opencode__panel">
          <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Shipping chat</CardTitle>
            <StatusFilter id="shipping-chat-status-filter" value={shippingChatFilter} counts={shippingChatCounts} total={recentShippingChatSends.length} onChange={setShippingChatFilter} />
          </CardHeader>
          <CardContent className="pt-4">
            <ShippingChatTable jobs={filteredShippingChatSends} retryingId={retryingId} onRetry={handleRetryShippingChat} />
          </CardContent>
        </Card>
      </section>

      <Card className="admin-opencode__panel">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 lg:grid-cols-3">
          <ActivityBlock title="Recent recordings" emptyText="[-] Belum ada recording di server.">
            {adminStatus?.recentRecordings.slice(0, 5).map((recording) => (
              <div key={recording.id} className="admin-opencode__list-row">
                <span>{recording.resiNumber}</span>
                <span>[{recording.status}]</span>
              </div>
            ))}
          </ActivityBlock>

          <ActivityBlock title="Recent scan logs" emptyText="[-] Belum ada scan log di server.">
            {adminStatus?.recentScanLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="admin-opencode__list-row">
                <span>{log.resiNumber}</span>
                <span>[{log.action}]</span>
              </div>
            ))}
          </ActivityBlock>

          <ActivityBlock title="Recent Shopee orders" emptyText="[-] Belum ada order Shopee di server.">
            {recentShopeeOrders.slice(0, 5).map((order) => (
              <div key={order.id ?? order.orderNumber} className="admin-opencode__list-row items-start gap-3">
                <span className="min-w-0">
                  <strong>{order.orderNumber}</strong>
                  <small className="block">{order.trackingNumber ?? '-'} · {order.buyerUsername ?? '-'}</small>
                </span>
                <span>[{order.shippingChannel ?? '-'}]</span>
              </div>
            ))}
          </ActivityBlock>
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

function StatusFilter({
  id,
  value,
  counts,
  total,
  onChange,
}: {
  id: string
  value: ChatSendFilter
  counts: Record<ChatSendStatus, number>
  total: number
  onChange: (value: ChatSendFilter) => void
}) {
  return (
    <label htmlFor={id} className="grid gap-1 text-sm text-muted-foreground">
      Filter status
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as ChatSendFilter)}
        className="h-8 rounded-[4px] border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-foreground"
      >
        <option value="all">all ({total})</option>
        {CHAT_SEND_STATUSES.map((status) => (
          <option key={status} value={status}>{status} ({counts[status]})</option>
        ))}
      </select>
    </label>
  )
}

function ChatSendTable({
  jobs,
  retryingId,
  onRetry,
  emptyText,
}: {
  jobs: RecordingChatSend[]
  retryingId: string | null
  onRetry: (id: string) => Promise<void>
  emptyText: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase text-muted-foreground">
            <th className="px-3 py-2">Pembeli</th>
            <th className="px-3 py-2">Pesanan</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Attempts</th>
            <th className="px-3 py-2">Catatan</th>
            <th className="px-3 py-2 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-border/70">
              <td className="px-3 py-3 font-medium">{job.buyerUsername}</td>
              <td className="px-3 py-3">
                <span className="block">{job.orderNumber ?? '-'}</span>
                <span className="block text-muted-foreground">{job.resiNumber}</span>
              </td>
              <td className="px-3 py-3"><StatusBadge status={job.status} /></td>
              <td className="px-3 py-3">{job.attempts} / 3</td>
              <td className="px-3 py-3 text-muted-foreground">{job.errorMessage ?? job.videoFilePath}</td>
              <td className="px-3 py-3 text-right">
                {job.status === 'failed' || job.status === 'cancelled' ? (
                  <Button type="button" variant="outline" size="sm" disabled={retryingId === job.id} onClick={() => void onRetry(job.id)}>
                    {retryingId === job.id ? '[mengantre]' : '[retry]'}
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
          {jobs.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">{emptyText}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

function ShippingChatTable({
  jobs,
  retryingId,
  onRetry,
}: {
  jobs: ShippingChatSend[]
  retryingId: string | null
  onRetry: (id: string) => Promise<void>
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase text-muted-foreground">
            <th className="px-3 py-2">Pembeli</th>
            <th className="px-3 py-2">Pesanan</th>
            <th className="px-3 py-2">Pesan</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Attempts</th>
            <th className="px-3 py-2">Catatan</th>
            <th className="px-3 py-2 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-border/70">
              <td className="px-3 py-3 font-medium">{job.buyerUsername}</td>
              <td className="px-3 py-3">
                <span className="block">{job.orderNumber}</span>
                <span className="block text-muted-foreground">{job.trackingNumber ?? '-'}</span>
              </td>
              <td className="max-w-[260px] px-3 py-3 text-muted-foreground"><span className="block truncate" title={job.message}>{job.message}</span></td>
              <td className="px-3 py-3"><StatusBadge status={job.status} /></td>
              <td className="px-3 py-3">{job.attempts} / 3</td>
              <td className="max-w-[220px] px-3 py-3 text-muted-foreground">{job.errorMessage || '-'}</td>
              <td className="px-3 py-3 text-right">
                {job.status === 'failed' || job.status === 'cancelled' ? (
                  <Button type="button" variant="outline" size="sm" disabled={retryingId === job.id} onClick={() => void onRetry(job.id)}>
                    {retryingId === job.id ? '[mengantre]' : '[retry]'}
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
          {jobs.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">[-] Tidak ada antrean chat pengiriman dengan kriteria ini.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

function StatusBadge({ status }: { status: ChatSendStatus }) {
  return <span className="admin-opencode__badge">[{status}]</span>
}

function formatOptionalDateTime(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function formatWorkerHeartbeat(value: string | null) {
  if (!value) return 'offline'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  const ageSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (ageSeconds < 90) return `${ageSeconds}s ago`
  const ageMinutes = Math.floor(ageSeconds / 60)

  return `${ageMinutes}m ago`
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

function countByStatus(items: Array<{ status: ChatSendStatus }>) {
  return CHAT_SEND_STATUSES.reduce<Record<ChatSendStatus, number>>((counts, status) => {
    counts[status] = items.filter((item) => item.status === status).length
    return counts
  }, { pending: 0, prepared: 0, sent: 0, failed: 0, cancelled: 0 })
}
