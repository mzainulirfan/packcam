import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Alert01Icon,
  ArrowDown01Icon,
  BubbleChatIcon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Message01Icon,
  RefreshIcon,
  Search01Icon,
  ShoppingBag01Icon,
  ShoppingBagCheckIcon,
  Task01Icon,
  TruckDeliveryIcon,
  VideoReplayIcon,
} from '@hugeicons/core-free-icons'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { readRecentShopeeChatSendsApi, readRecentShippingChatSendsApi, readServerAdminStatusApi, retryShopeeChatSendApi, retryShippingChatSendApi } from '@pakti/api-client'
import type { ChatSendStatus, RecordingChatSend, ShippingChatSend } from '@pakti/types'

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
    const [status, chatSends, shippingSends] = await Promise.all([
      readServerAdminStatusApi(),
      readRecentShopeeChatSendsApi(50),
      readRecentShippingChatSendsApi(50),
    ])

    setAdminStatus(status)
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
    <div className="shopee-page mx-auto max-w-[1240px] bg-[#f6f5f4] px-4 py-8 font-['Inter'] sm:px-6 lg:py-10 xl:px-8">
      <section className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Administrasi / Shopee</div>
          <h1 className="mt-2 text-[32px] font-bold leading-[1.1] tracking-[-0.8px] text-[#000000] sm:text-[36px]">Shopee automation</h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-6 text-[#615d59] sm:text-[15px]">Monitor order sync dan antrean pesan Shopee secara real-time.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-[14px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.035)] ${automation?.extensionWorker ? 'border-[#dddddd] bg-white text-[#0075de]' : 'border-[#dddddd] bg-white text-[#615d59]'}`}>
            <HugeiconsIcon icon={ShoppingBagCheckIcon} size={18} strokeWidth={1.9} /> {automation?.extensionWorker ? 'Automation Running' : loading ? 'Checking' : 'Automation Idle'}
          </span>
          <Button type="button" variant="outline" onClick={() => void handleRefresh()} className="h-11 rounded-full border-[#dddddd] bg-white px-5 text-[14px] font-medium text-[#615d59] hover:bg-[#fbfaf9]">
            <HugeiconsIcon icon={RefreshIcon} size={18} strokeWidth={1.9} /> Refresh
          </Button>
        </div>
      </section>

      <Alert variant={error ? 'destructive' : 'info'} className="mb-5 rounded-[4px] border-[#dddddd] bg-white font-['Inter'] text-[14px]">
        <div className="grid gap-1">
          <p className="font-semibold text-[#000000]">Status</p>
          <p className="text-[#31302e]">{error ?? message}</p>
        </div>
      </Alert>

      <section className="mb-5 grid gap-3 sm:grid-cols-4">
        <ShopeeStat label="Orders today" value={String(automation?.orders.updatedToday ?? 0)} detail={`Last sync ${formatRelativeTime(automation?.orders.latestUpdatedAt ?? null)}`} icon={ShoppingBag01Icon} />
        <ShopeeStat label="Sent today" value={String(sentToday)} detail="Video dan shipping chat" icon={CheckmarkCircle01Icon} />
        <ShopeeStat label="Pending" value={String(pendingTotal)} detail={`${chatSendCounts.pending} video · ${shippingChatCounts.pending} shipping`} icon={BubbleChatIcon} />
        <ShopeeStat label="Failed" value={String(failedToday)} detail="Failed atau cancelled hari ini" icon={Alert01Icon} />
      </section>

      <section className="mb-5 overflow-hidden rounded-xl border border-[#dddddd] bg-white">
          <PanelHeader icon={Task01Icon} title="System activity" description="Status worker dan queue automation Shopee." />
          <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
            <ActivityTile label="Webchat Worker" value={automation?.extensionWorker ? 'Active' : 'Offline'} detail={`heartbeat ${formatRelativeTime(automation?.extensionWorker?.updatedAt ?? null)}`} icon={Message01Icon} />
            <ActivityTile label="Video Queue" value={`${chatSendCounts.pending} pending`} detail={`${chatSendCounts.failed} failed`} icon={VideoReplayIcon} />
            <ActivityTile label="Shipping Queue" value={`${shippingChatCounts.pending} pending`} detail={`${shippingChatCounts.failed} failed`} icon={TruckDeliveryIcon} />
          </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#e6e6e6] bg-white">
        <div className="border-b border-[#e6e6e6] bg-white p-3">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
            <label className="relative flex min-w-[240px] flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 grid w-8 place-items-center text-[#a39e98]"><HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.9} /></span>
              <Input value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="Cari buyer / order / pesan..." className="h-8 w-full rounded-[4px] border-[#e6e6e6] bg-white pl-8 pr-3 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" aria-label="Cari buyer, order, atau pesan" />
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex flex-wrap gap-1.5">
                {QUEUE_MODE_OPTIONS.map((option) => <Button key={option.value} type="button" variant="ghost" size="sm" className={`h-8 rounded-[8px] border px-3 text-[12px] font-medium ${queueMode === option.value ? 'border-[#000000] bg-[#000000] text-white' : 'border-[#e6e6e6] bg-white text-[#31302e] hover:bg-[#f6f5f4]'}`} onClick={() => setQueueMode(option.value)}>{option.label}</Button>)}
              </div>
              <StatusFilter id="shopee-queue-status-filter" value={queueStatusFilter} counts={queueStatusCounts} total={modeFilteredQueueItems.length} onChange={setQueueStatusFilter} />
              <Button type="button" variant="ghost" size="sm" className="grid h-8 w-8 place-items-center rounded-[8px] border border-[#e6e6e6] bg-white p-0 text-[#615d59] hover:bg-[#f6f5f4]" onClick={handleClearQueueFilters} aria-label="Reset filter" title="Reset filter"><HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.9} /></Button>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
          <div><h2 className="text-[16px] font-semibold text-[#000000]">Chat Queue</h2><p className="mt-1 text-[12px] text-[#a39e98]">{activeTotal} jobs dalam antrean filter saat ini.</p></div>
          <span className="inline-flex items-center rounded-full border border-[#dddddd] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0075de]">{activeTotal} jobs</span>
        </div>
        <QueueTable jobs={pagedQueueItems} retryingId={retryingId} onRetryVideo={handleRetryVideoChat} onRetryShipping={handleRetryShippingChat} />
        {activeTotal > QUEUE_PAGE_SIZE ? <PaginationControls page={Math.min(queuePage, pageCount)} pageCount={pageCount} total={activeTotal} pageSize={QUEUE_PAGE_SIZE} onPageChange={setQueuePage} onPrevious={() => setQueuePage((current) => Math.max(1, current - 1))} onNext={() => setQueuePage((current) => Math.min(pageCount, current + 1))} /> : null}
      </section>
    </div>
  )
}

function ShopeeStat({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: typeof ShoppingBag01Icon }) {
  return (
    <article className="rounded-xl border border-[#dddddd] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">{label}</div>
          <div className="mt-3 text-[28px] font-bold leading-none tracking-[-0.5px] text-[#000000]">{value}</div>
          <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[#615d59]">{detail}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f6f5f4] text-[#31302e]"><HugeiconsIcon icon={icon} size={19} strokeWidth={1.9} /></span>
      </div>
    </article>
  )
}

function PanelHeader({ icon, title, description }: { icon: typeof ShoppingBag01Icon; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-[#dddddd] px-4 py-4 sm:px-5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f6f5f4] text-[#31302e]"><HugeiconsIcon icon={icon} size={19} strokeWidth={1.9} /></span>
      <div className="min-w-0"><h2 className="text-[16px] font-semibold text-[#000000]">{title}</h2><p className="mt-1 text-[12px] leading-5 text-[#a39e98]">{description}</p></div>
    </div>
  )
}

function ActivityTile({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: typeof ShoppingBag01Icon }) {
  return <div className="rounded-[12px] border border-[#dddddd] bg-[#f6f5f4] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">{label}</p><p className="mt-2 text-[16px] font-semibold text-[#000000]">{value}</p><p className="mt-1 text-[12px] text-[#615d59]">{detail}</p></div><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#31302e]"><HugeiconsIcon icon={icon} size={17} strokeWidth={1.9} /></span></div></div>
}

function StatusFilter({ id, value, counts, total, onChange }: { id: string; value: ChatSendFilter; counts: Record<ChatSendStatus, number>; total: number; onChange: (value: ChatSendFilter) => void }) {
  return (
    <label htmlFor={id} className="relative inline-flex h-8 items-center rounded-[8px] border border-[#e6e6e6] bg-white text-[#000000]">
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as ChatSendFilter)} className="h-full min-w-[160px] appearance-none rounded-[8px] bg-transparent px-3 pr-7 text-[12px] font-medium focus:outline-none focus:ring-0">
        <option value="all">Status: All ({total})</option>
        {CHAT_SEND_STATUSES.map((status) => <option key={status} value={status}>{status} ({counts[status]})</option>)}
      </select>
      <span className="pointer-events-none absolute right-3 grid place-items-center text-[#a39e98]"><HugeiconsIcon icon={ArrowDown01Icon} size={15} strokeWidth={1.9} /></span>
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
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[860px] border-collapse">
        <thead className="bg-[#f6f5f4]">
          <tr className="text-left">
            <Th>Buyer</Th>
            <Th>Order</Th>
            <Th>Message</Th>
            <Th>Status</Th>
            <Th className="text-right">Retry</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e6e6e6]">
          {jobs.map((job) => (
            <tr key={`${job.type}-${job.id}`} className="bg-white transition-colors hover:bg-[#fbfaf9]">
              <Td className="font-medium text-[#000000]">{job.buyerUsername}</Td>
              <Td><span className="block text-[#000000]">{job.orderNumber ?? '-'}</span><span className="mt-0.5 block text-[12px] text-[#a39e98]">{job.type} · {job.trackingNumber ?? '-'}</span></Td>
              <Td className="max-w-[340px] text-[#615d59]"><span className="block truncate" title={job.message}>{job.message}</span></Td>
              <Td><StatusBadge status={job.status} /></Td>
              <Td className="text-right">
                {job.status === 'failed' || job.status === 'cancelled' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg border-[#dddddd] bg-white px-3 text-[12px] font-medium text-[#615d59] hover:bg-[#f6f5f4]"
                    disabled={retryingId === job.id}
                    onClick={() => void (job.type === 'video' ? onRetryVideo(job.id) : onRetryShipping(job.id))}
                  >
                    {retryingId === job.id ? 'Mengantre' : 'Retry'}
                  </Button>
                ) : null}
              </Td>
            </tr>
          ))}
          {jobs.length === 0 ? <tr><td colSpan={5} className="px-6 py-10 text-center text-[14px] text-[#615d59]">Tidak ada job dengan kriteria ini.</td></tr> : null}
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
    <div className="flex flex-col gap-3 border-t border-[#dddddd] px-5 py-3 text-[13px] text-[#615d59] sm:flex-row sm:items-center sm:justify-between">
      <span>
        {total === 0 ? '0 job' : <>Menampilkan <span>{first}-{last}</span> dari <span>{total}</span> job</>}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <Button type="button" variant="outline" size="sm" className="h-8 min-w-8 rounded-lg border-[#dddddd] bg-white px-2" disabled={page <= 1} onClick={onPrevious}>
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
            className={`h-8 min-w-8 rounded-lg px-2 text-[12px] ${item === page ? 'bg-[#0075de] text-white hover:bg-[#005bab]' : 'border-[#dddddd] bg-white text-[#615d59]'}`}
            onClick={() => onPageChange(item)}
          >
            {item}
          </Button>
        ))}
        <Button type="button" variant="outline" size="sm" className="h-8 min-w-8 rounded-lg border-[#dddddd] bg-white px-2" disabled={page >= pageCount} onClick={onNext}>
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
  const isBad = status === 'failed' || status === 'cancelled'
  const isGood = status === 'sent'
  return <span className={`inline-flex rounded-[4px] border px-2 py-1 text-[12px] font-medium ${isBad ? 'border-[#f2c8a4] bg-[#fff7ed] text-[#dd5b00]' : isGood ? 'border-[#dddddd] bg-white text-[#0075de]' : 'border-[#dddddd] bg-white text-[#615d59]'}`}>{status}</span>
}

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98] ${className}`}>{children}</th>
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top text-[13px] text-[#31302e] ${className}`}>{children}</td>
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
