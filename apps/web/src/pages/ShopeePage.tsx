import { useEffect, useMemo, useState } from 'react'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { readRecentShopeeChatSendsApi, readRecentShopeeOrdersApi, readRecentShippingChatSendsApi, readServerAdminStatusApi, retryShopeeChatSendApi, retryShippingChatSendApi } from '@pakti/api-client'
import type { ChatSendStatus, RecordingChatSend, ShopeeOrder, ShippingChatSend } from '@pakti/types'

type AdminStatus = Awaited<ReturnType<typeof readServerAdminStatusApi>>
type ChatSendFilter = 'all' | ChatSendStatus
type QueueMode = 'all' | 'video' | 'shipping'
type QueueItem = {
  id: string
  type: 'video' | 'shipping'
  buyerUsername: string
  orderNumber: string | null
  trackingNumber: string | null
  message: string
  status: ChatSendStatus
  attempts: number
  errorMessage: string | null
}

const CHAT_SEND_STATUSES: ChatSendStatus[] = ['pending', 'prepared', 'sent', 'failed', 'cancelled']
const QUEUE_MODE_OPTIONS: Array<{ value: QueueMode; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'video', label: 'Video' },
  { value: 'shipping', label: 'Shipping' },
]
const QUEUE_PAGE_SIZE = 10

export function ShopeePage() {
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null)
  const [recentShopeeOrders, setRecentShopeeOrders] = useState<ShopeeOrder[]>([])
  const [recentChatSends, setRecentChatSends] = useState<RecordingChatSend[]>([])
  const [recentShippingChatSends, setRecentShippingChatSends] = useState<ShippingChatSend[]>([])
  const [queueMode, setQueueMode] = useState<QueueMode>('all')
  const [queuePage, setQueuePage] = useState(1)
  const [queueSearch, setQueueSearch] = useState('')
  const [queueStatusFilter, setQueueStatusFilter] = useState<ChatSendFilter>('all')
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('Memuat automation Shopee...')

  const chatSendCounts = useMemo(() => countByStatus(recentChatSends), [recentChatSends])
  const shippingChatCounts = useMemo(() => countByStatus(recentShippingChatSends), [recentShippingChatSends])
  const queueItems = useMemo(() => [
    ...recentChatSends.map((job): QueueItem => ({
      id: job.id,
      type: 'video',
      buyerUsername: job.buyerUsername,
      orderNumber: job.orderNumber,
      trackingNumber: job.resiNumber,
      message: job.messageTemplate || 'Video dokumentasi paket siap dikirim.',
      status: job.status,
      attempts: job.attempts,
      errorMessage: job.errorMessage,
    })),
    ...recentShippingChatSends.map((job): QueueItem => ({
      id: job.id,
      type: 'shipping',
      buyerUsername: job.buyerUsername,
      orderNumber: job.orderNumber,
      trackingNumber: job.trackingNumber,
      message: job.message,
      status: job.status,
      attempts: job.attempts,
      errorMessage: job.errorMessage,
    })),
  ], [recentChatSends, recentShippingChatSends])
  const modeFilteredQueueItems = useMemo(
    () => queueItems.filter((job) => queueMode === 'all' || job.type === queueMode),
    [queueItems, queueMode],
  )
  const queueStatusCounts = useMemo(() => countByStatus(modeFilteredQueueItems), [modeFilteredQueueItems])
  const filteredQueueItems = useMemo(() => {
    const search = queueSearch.trim().toLowerCase()
    return modeFilteredQueueItems.filter((job) => {
      if (queueStatusFilter !== 'all' && job.status !== queueStatusFilter) return false
      if (!search) return true
      return [job.buyerUsername, job.orderNumber, job.trackingNumber, job.message, job.errorMessage]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    })
  }, [modeFilteredQueueItems, queueSearch, queueStatusFilter])

  const automation = adminStatus?.shopeeAutomation
  const sentToday = (automation?.videoChat.sentToday ?? 0) + (automation?.shippingChat.sentToday ?? 0)
  const failedToday = (automation?.videoChat.failedOrCancelledToday ?? 0) + (automation?.shippingChat.failedOrCancelledToday ?? 0)
  const activeTotal = filteredQueueItems.length
  const pageCount = Math.max(1, Math.ceil(activeTotal / QUEUE_PAGE_SIZE))
  const pageStart = (Math.min(queuePage, pageCount) - 1) * QUEUE_PAGE_SIZE
  const pagedQueueItems = filteredQueueItems.slice(pageStart, pageStart + QUEUE_PAGE_SIZE)
  const pendingTotal = chatSendCounts.pending + shippingChatCounts.pending

  useEffect(() => {
    queueMicrotask(() => setQueuePage(1))
  }, [queueMode, queueSearch, queueStatusFilter])

  useEffect(() => {
    queueMicrotask(() => setQueuePage((current) => Math.min(current, pageCount)))
  }, [pageCount])

  async function loadShopeeData() {
    const [status, orders, chatSends, shippingSends] = await Promise.all([
      readServerAdminStatusApi(),
      readRecentShopeeOrdersApi(10),
      readRecentShopeeChatSendsApi(50),
      readRecentShippingChatSendsApi(50),
    ])

    setAdminStatus(status)
    setRecentShopeeOrders(orders)
    setRecentChatSends(chatSends)
    setRecentShippingChatSends(shippingSends)
    setError(null)
    setMessage('Automation Shopee dimuat.')
  }

  useEffect(() => {
    let active = true

    queueMicrotask(() => {
      void loadShopeeData()
        .catch(() => {
          if (!active) return
          setAdminStatus(null)
          setRecentShopeeOrders([])
          setRecentChatSends([])
          setRecentShippingChatSends([])
          setError('Sesi admin diperlukan atau server belum aktif.')
          setMessage('Automation Shopee belum bisa dimuat.')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    function handleChatSendsUpdated() {
      void readRecentShopeeChatSendsApi(50).then(setRecentChatSends).catch(() => {})
    }

    function handleShippingChatSendsUpdated() {
      void readRecentShippingChatSendsApi(50).then(setRecentShippingChatSends).catch(() => {})
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
      await loadShopeeData()
    } catch {
      setError('Automation Shopee belum bisa diperbarui.')
      setMessage('Refresh gagal karena sesi admin diperlukan atau server belum aktif.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRetryShippingChat(id: string) {
    if (retryingId) return
    setRetryingId(id)
    try {
      await retryShippingChatSendApi(id)
      setRecentShippingChatSends(await readRecentShippingChatSendsApi(50))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal me-retry shipping chat.')
    } finally {
      setRetryingId(null)
    }
  }

  function handleClearQueueFilters() {
    setQueueSearch('')
    setQueueMode('all')
    setQueueStatusFilter('all')
  }

  async function handleRetryVideoChat(id: string) {
    if (retryingId) return
    setRetryingId(id)
    try {
      await retryShopeeChatSendApi(id)
      setRecentChatSends(await readRecentShopeeChatSendsApi(50))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal me-retry video chat.')
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <div className="admin-opencode grid w-full gap-5 px-0 py-1">
      <section className="admin-opencode__summary flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-2">
          <div className="admin-opencode__section-label">[+] Shopee</div>
          <h1 className="admin-opencode__title">Shopee Automation</h1>
          <p className="admin-opencode__lede">Monitor order sync dan antrean pesan secara real-time.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="admin-opencode__badge">{automation?.extensionWorker ? '● Automation Running' : loading ? '● Checking' : '● Automation Idle'}</span>
          <span className="admin-opencode__badge">Last sync {formatRelativeTime(automation?.orders.latestUpdatedAt ?? null)}</span>
          <span className="admin-opencode__badge">{automation?.extensionWorker ? 'Worker healthy' : 'Worker offline'}</span>
          <Button type="button" variant="outline" onClick={() => void handleRefresh()}>
            [Refresh]
          </Button>
        </div>
      </section>

      <Alert variant={error ? 'destructive' : 'info'}>
        <div className="admin-opencode__alert grid gap-1">
          <p>{error ? '[!]' : '[+]'} Status</p>
          <p>{error ?? message}</p>
        </div>
      </Alert>

      <Card className="admin-opencode__panel">
        <CardContent className="pt-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <Metric label="Orders Today" value={String(automation?.orders.updatedToday ?? 0)} />
            <Metric label="Sent Today" value={String(sentToday)} />
            <Metric label="Pending" value={String(pendingTotal)} />
            <Metric label="Failed" value={String(failedToday)} />
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className="admin-opencode__panel">
          <CardHeader className="pb-0">
            <CardTitle>System Activity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 pt-3 sm:grid-cols-3 xl:grid-cols-1">
            <ActivityTile label="Webchat Worker" value={automation?.extensionWorker ? '● Active' : '● Offline'} detail={`heartbeat ${formatRelativeTime(automation?.extensionWorker?.updatedAt ?? null)}`} />
            <ActivityTile label="Video Queue" value={`${chatSendCounts.pending} pending`} detail={`${chatSendCounts.failed} failed`} />
            <ActivityTile label="Shipping Queue" value={`${shippingChatCounts.pending} pending`} detail={`${shippingChatCounts.failed} failed`} />
          </CardContent>
        </Card>

        <Card className="admin-opencode__panel">
          <CardHeader className="pb-0">
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 pt-3">
            {recentShopeeOrders.length > 0 ? recentShopeeOrders.slice(0, 3).map((order) => (
              <RecentOrderItem key={order.id ?? order.orderNumber} order={order} />
            )) : <div className="admin-opencode__empty">[-] Belum ada order Shopee.</div>}
          </CardContent>
        </Card>
      </section>

      <section className="history-opencode">
        <section className="history-opencode__filters mb-4">
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-3 border-b border-[rgba(15,0,0,0.08)] pb-3">
              <p className="text-sm font-bold">[+] Filter Pencarian</p>
              <Button type="button" variant="ghost" size="sm" className="history-opencode__button" onClick={handleClearQueueFilters} aria-label="Reset filter" title="Reset filter">
                [reset]
              </Button>
            </div>
            <div className="history-opencode__filter-bar">
              <div className="relative">
                <span className="history-opencode__input-prefix" aria-hidden="true">[?]</span>
                <Input value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="Cari buyer / order / pesan..." className="history-opencode__input pl-12" aria-label="Cari buyer, order, atau pesan" />
                {queueSearch.trim() ? (
                  <Button type="button" variant="ghost" size="sm" className="history-opencode__clear" onClick={() => setQueueSearch('')}>
                    [clear]
                  </Button>
                ) : null}
              </div>

              <div className="grid items-start gap-3 xl:grid-cols-[minmax(260px,auto)_240px]">
                <div className="history-opencode__task-filter" aria-label="Filter tipe antrean">
                  {QUEUE_MODE_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={queueMode === option.value ? 'is-active' : ''}
                      onClick={() => setQueueMode(option.value)}
                    >
                      {queueMode === option.value ? `[${option.label}]` : option.label}
                    </Button>
                  ))}
                </div>
                <StatusFilter
                  id="shopee-queue-status-filter"
                  value={queueStatusFilter}
                  counts={queueStatusCounts}
                  total={modeFilteredQueueItems.length}
                  onChange={setQueueStatusFilter}
                />
              </div>
            </div>
          </div>
        </section>

        <div className="history-opencode__table-section overflow-hidden">
          <div className="history-opencode__table-header flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-1">
              <h2>Chat Queue</h2>
              <p>{activeTotal} jobs</p>
            </div>
          </div>
          <QueueTable jobs={pagedQueueItems} retryingId={retryingId} onRetryVideo={handleRetryVideoChat} onRetryShipping={handleRetryShippingChat} />
          {activeTotal > QUEUE_PAGE_SIZE ? (
            <PaginationControls
              page={Math.min(queuePage, pageCount)}
              pageCount={pageCount}
              total={activeTotal}
              pageSize={QUEUE_PAGE_SIZE}
              onPageChange={setQueuePage}
              onPrevious={() => setQueuePage((current) => Math.max(1, current - 1))}
              onNext={() => setQueuePage((current) => Math.min(pageCount, current + 1))}
            />
          ) : null}
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-opencode__stat">
      <p><strong>{value}</strong><br />{label}</p>
    </div>
  )
}

function ActivityTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[4px] border border-[rgba(15,0,0,0.1)] bg-muted/30 p-3">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-sm font-bold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function RecentOrderItem({ order }: { order: ShopeeOrder }) {
  return (
    <div className="rounded-[4px] border border-[rgba(15,0,0,0.1)] bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-bold text-foreground">#{order.orderNumber}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{order.buyerUsername ?? '-'} · {order.shippingChannel ?? '-'}</p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">order</span>
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">{order.trackingNumber ?? '-'}</p>
    </div>
  )
}

function StatusFilter({ id, value, counts, total, onChange }: { id: string; value: ChatSendFilter; counts: Record<ChatSendStatus, number>; total: number; onChange: (value: ChatSendFilter) => void }) {
  return (
    <label htmlFor={id} className="grid gap-1 text-sm text-muted-foreground">
      <span className="history-opencode__date-label">status</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as ChatSendFilter)} className="history-opencode__select min-w-[180px]">
        <option value="all">Status: All ({total})</option>
        {CHAT_SEND_STATUSES.map((status) => <option key={status} value={status}>{status} ({counts[status]})</option>)}
      </select>
    </label>
  )
}

function QueueTable({
  jobs,
  retryingId,
  onRetryVideo,
  onRetryShipping,
}: {
  jobs: QueueItem[]
  retryingId: string | null
  onRetryVideo: (id: string) => Promise<void>
  onRetryShipping: (id: string) => Promise<void>
}) {
  return (
    <div className="overflow-x-auto">
      <table className="history-opencode__table w-full min-w-[860px] border-collapse">
        <thead>
          <tr>
            <th className="px-3 py-2">Buyer</th>
            <th className="px-3 py-2">Order</th>
            <th className="px-3 py-2">Message</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Retry</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={`${job.type}-${job.id}`} className="history-opencode__row">
              <td className="px-3 py-3 font-medium">{job.buyerUsername}</td>
              <td className="px-3 py-3">
                <span className="block">{job.orderNumber ?? '-'}</span>
                <span className="block text-muted-foreground">{job.type} · {job.trackingNumber ?? '-'}</span>
              </td>
              <td className="max-w-[340px] px-3 py-3 text-muted-foreground"><span className="block truncate" title={job.message}>{job.message}</span></td>
              <td className="px-3 py-3"><StatusBadge status={job.status} /></td>
              <td className="px-3 py-3 text-right">
                {job.status === 'failed' || job.status === 'cancelled' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="history-opencode__button"
                    disabled={retryingId === job.id}
                    onClick={() => void (job.type === 'video' ? onRetryVideo(job.id) : onRetryShipping(job.id))}
                  >
                    {retryingId === job.id ? '[mengantre]' : '[retry]'}
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
          {jobs.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">[-] Tidak ada job dengan kriteria ini.</td></tr> : null}
        </tbody>
      </table>
    </div>
  )
}

function PaginationControls({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  onPrevious,
  onNext,
}: {
  page: number
  pageCount: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  onPrevious: () => void
  onNext: () => void
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(total, page * pageSize)

  return (
    <div className="history-opencode__pagination flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span>
        {total === 0 ? '0 job' : <>Menampilkan <span>{first}-{last}</span> dari <span>{total}</span> job</>}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <Button type="button" variant="outline" size="sm" className="history-opencode__button" disabled={page <= 1} onClick={onPrevious}>
          ‹
        </Button>
        {buildPageItems(page, pageCount).map((item, index) => item === '…' ? (
          <span key={`ellipsis-${index}`} className="px-1 text-slate-400">…</span>
        ) : (
          <Button
            key={item}
            type="button"
            variant={item === page ? 'default' : 'outline'}
            size="sm"
            className={item === page ? 'history-opencode__page-number' : 'history-opencode__button min-w-8'}
            onClick={() => onPageChange(item)}
          >
            {item}
          </Button>
        ))}
        <Button type="button" variant="outline" size="sm" className="history-opencode__button" disabled={page >= pageCount} onClick={onNext}>
          ›
        </Button>
      </div>
    </div>
  )
}

function buildPageItems(currentPage: number, pageCount: number) {
  const pages: Array<number | '…'> = []
  if (pageCount <= 7) {
    for (let index = 1; index <= pageCount; index += 1) pages.push(index)
    return pages
  }

  pages.push(1)
  if (currentPage > 3) pages.push('…')
  for (let index = Math.max(2, currentPage - 1); index <= Math.min(pageCount - 1, currentPage + 1); index += 1) pages.push(index)
  if (currentPage < pageCount - 2) pages.push('…')
  pages.push(pageCount)
  return pages
}

function StatusBadge({ status }: { status: ChatSendStatus }) {
  return <span className="admin-opencode__badge">[{status}]</span>
}

function formatRelativeTime(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const ageSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (ageSeconds < 90) return `${ageSeconds}s ago`
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m ago`
  return `${Math.floor(ageSeconds / 3600)}h ago`
}

function countByStatus(items: Array<{ status: ChatSendStatus }>) {
  return CHAT_SEND_STATUSES.reduce<Record<ChatSendStatus, number>>((counts, status) => {
    counts[status] = items.filter((item) => item.status === status).length
    return counts
  }, { pending: 0, prepared: 0, sent: 0, failed: 0, cancelled: 0 })
}
