import { useEffect, useState } from 'react'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { readRecentShopeeChatSendsApi, readRecentShopeeOrdersApi, readServerAdminStatusApi, readRecentShippingChatSendsApi, retryShippingChatSendApi } from '@pakti/api-client'
import type { RecordingChatSend, ShopeeOrder, ShippingChatSend } from '@pakti/types'

type AdminStatus = Awaited<ReturnType<typeof readServerAdminStatusApi>>
type ShippingChatFilter = 'all' | 'pending' | 'prepared' | 'sent' | 'failed'

export function AdminPage() {
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null)
  const [recentShopeeOrders, setRecentShopeeOrders] = useState<ShopeeOrder[]>([])
  const [recentChatSends, setRecentChatSends] = useState<RecordingChatSend[]>([])
  const [recentShippingChatSends, setRecentShippingChatSends] = useState<ShippingChatSend[]>([])
  const [shippingChatFilter, setShippingChatFilter] = useState<ShippingChatFilter>('all')
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('Memuat status server...')

  useEffect(() => {
    let active = true

    // Fetch admin status, orders, dan recording chat sends — bagian utama yang memerlukan sesi admin
    void Promise.all([
      readServerAdminStatusApi(),
      readRecentShopeeOrdersApi(10),
      readRecentShopeeChatSendsApi(10),
    ])
      .then(([status, orders, chatSends]) => {
        if (!active) {
          return
        }

        setAdminStatus(status)
        setRecentShopeeOrders(orders)
        setRecentChatSends(chatSends)
        setError(null)
        setMessage('Status server dimuat.')
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

    // Fetch shipping chat sends secara terpisah — kegagalan tidak memengaruhi tampilan admin status
    void readRecentShippingChatSendsApi(50)
      .then((sends) => {
        if (active) setRecentShippingChatSends(sends)
      })
      .catch(() => {
        if (active) setRecentShippingChatSends([])
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    function handleShippingChatSendsUpdated() {
      void readRecentShippingChatSendsApi(50)
        .then((sends) => {
          setRecentShippingChatSends(sends)
        })
        .catch(() => {})
    }

    window.addEventListener('pakti:shipping-chat-sends-updated', handleShippingChatSendsUpdated)
    return () => {
      window.removeEventListener('pakti:shipping-chat-sends-updated', handleShippingChatSendsUpdated)
    }
  }, [])

  async function handleRefresh() {
    setLoading(true)
    setError(null)

    try {
      const [status, orders, chatSends] = await Promise.all([
        readServerAdminStatusApi(),
        readRecentShopeeOrdersApi(10),
        readRecentShopeeChatSendsApi(10),
      ])
      setAdminStatus(status)
      setRecentShopeeOrders(orders)
      setRecentChatSends(chatSends)
      setMessage('Status server dimuat.')
    } catch {
      setAdminStatus(null)
      setRecentShopeeOrders([])
      setRecentChatSends([])
      setError('Sesi login diperlukan atau server belum aktif, panel admin memakai mode terbatas.')
      setMessage('Status belum bisa diperbarui karena sesi login diperlukan atau server belum aktif.')
    } finally {
      setLoading(false)
    }

    // Refresh shipping chat secara terpisah
    void readRecentShippingChatSendsApi(50)
      .then(setRecentShippingChatSends)
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

  return (
    <div className="admin-opencode mx-auto grid w-full max-w-[1520px] gap-5 px-0 py-1">
      <section className="admin-opencode__summary flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-2">
            <div className="admin-opencode__section-label">[+] Admin</div>
            <h1 className="admin-opencode__title">Admin</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="admin-opencode__badge">{loading ? '[~] loading' : error ? '[!] error' : '[x] ready'}</span>
            <span className="admin-opencode__badge">server only</span>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="admin-opencode__panel">
            <CardHeader className="space-y-2">
              <CardTitle>Status server</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {loading ? (
                <div className="admin-opencode__empty">
                  [~] Memuat status server...
                </div>
              ) : error ? (
                <Alert variant="destructive">
                  <div className="admin-opencode__alert grid gap-1">
                    <p>[!] Status server belum tersedia</p>
                    <p>{error}</p>
                  </div>
                </Alert>
              ) : adminStatus ? (
                <div className="grid gap-2">
                  <InfoLine label="Bootstrap" value={adminStatus.bootstrap.needsSetup ? 'Needed' : 'Ready'} />
                  <InfoLine label="Operators" value={String(adminStatus.bootstrap.operatorCount)} />
                  <InfoLine label="Admins" value={String(adminStatus.bootstrap.adminCount)} />
                  <InfoLine label="Recordings" value={String(adminStatus.counts.recordings)} />
                  <InfoLine label="Scan logs" value={String(adminStatus.counts.scanLogs)} />
                  <InfoLine label="Sessions" value={String(adminStatus.counts.sessions)} />
                  <InfoLine label="Last error" value={adminStatus.lastError ? 'Ada' : 'Tidak ada'} />
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" onClick={() => void handleRefresh()}>
                  [refresh]
                </Button>
              </div>

              <Alert variant={error ? 'destructive' : 'info'}>
                <div className="admin-opencode__alert grid gap-1">
                  <p>{error ? '[!]' : '[+]'} Pesan</p>
                  <p>{message}</p>
                </div>
              </Alert>
            </CardContent>
          </Card>

          <Card className="admin-opencode__panel">
            <CardHeader className="space-y-2">
              <CardTitle>Recent data</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 pt-4">
              <div className="admin-opencode__list-block">
                <p>[+] Recent recordings</p>
                <div className="mt-3 grid gap-2">
                  {adminStatus?.recentRecordings.slice(0, 5).map((recording) => (
                    <div key={recording.id} className="admin-opencode__list-row">
                      <span>{recording.resiNumber}</span>
                      <span>[{recording.status}]</span>
                    </div>
                  ))}
                  {adminStatus?.recentRecordings.length === 0 ? (
                    <p>[-] Belum ada recording di server.</p>
                  ) : null}
                </div>
              </div>

              <div className="admin-opencode__list-block">
                <p>[+] Recent scan logs</p>
                <div className="mt-3 grid gap-2">
                  {adminStatus?.recentScanLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="admin-opencode__list-row">
                      <span>{log.resiNumber}</span>
                      <span>[{log.action}]</span>
                    </div>
                  ))}
                  {adminStatus?.recentScanLogs.length === 0 ? (
                    <p>[-] Belum ada scan log di server.</p>
                  ) : null}
                </div>
              </div>

              <div className="admin-opencode__list-block">
                <p>[+] Recent Shopee orders</p>
                <div className="mt-3 grid gap-2">
                  {recentShopeeOrders.slice(0, 10).map((order) => (
                    <div key={order.id ?? order.orderNumber} className="admin-opencode__list-row items-start gap-3">
                      <span className="min-w-0">
                        <strong>{order.orderNumber}</strong>
                        <small className="block">{order.trackingNumber ?? '-'} · {order.buyerUsername ?? '-'}</small>
                        <small className="block">{order.items.map((item) => `${item.productName} x${item.quantity}`).join(', ') || '-'}</small>
                      </span>
                      <span>[{order.shippingChannel ?? '-'}]</span>
                    </div>
                  ))}
                  {recentShopeeOrders.length === 0 ? (
                    <p>[-] Belum ada order Shopee di server.</p>
                  ) : null}
                </div>
              </div>

              <div className="admin-opencode__list-block">
                <p>[+] Recent Shopee chat sends</p>
                <div className="mt-3 grid gap-2">
                  {recentChatSends.slice(0, 10).map((job) => (
                    <div key={job.id} className="admin-opencode__list-row items-start gap-3">
                      <span className="min-w-0">
                        <strong>{job.buyerUsername}</strong>
                        <small className="block">{job.orderNumber ?? '-'} · {job.resiNumber}</small>
                        <small className="block">{job.errorMessage ?? job.videoFilePath}</small>
                      </span>
                      <span>[{job.status}]</span>
                    </div>
                  ))}
                  {recentChatSends.length === 0 ? (
                    <p>[-] Belum ada job Shopee Chat.</p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="admin-opencode__panel w-full">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0 pb-4 border-b border-slate-100">
            <CardTitle className="text-lg font-bold text-slate-900">[+] Antrean Chat Pengiriman Shopee</CardTitle>
            <div className="flex items-center gap-2">
              <label htmlFor="shipping-chat-status-filter" className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Filter Status:</label>
              <select
                id="shipping-chat-status-filter"
                value={shippingChatFilter}
                onChange={(e) => setShippingChatFilter(e.target.value as ShippingChatFilter)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="all">Semua ({recentShippingChatSends.length})</option>
                <option value="pending">Pending ({recentShippingChatSends.filter(s => s.status === 'pending').length})</option>
                <option value="prepared">Prepared ({recentShippingChatSends.filter(s => s.status === 'prepared').length})</option>
                <option value="sent">Sent ({recentShippingChatSends.filter(s => s.status === 'sent').length})</option>
                <option value="failed">Failed ({recentShippingChatSends.filter(s => s.status === 'failed').length})</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="pt-4 px-0 sm:px-6">
            <div className="overflow-x-auto rounded-lg border border-slate-100 bg-white">
              <table className="w-full min-w-[800px] border-collapse text-left text-sm text-slate-600">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Pembeli / Pesanan</th>
                    <th className="px-4 py-3">Pesan</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Percobaan</th>
                    <th className="px-4 py-3">Catatan / Error</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentShippingChatSends
                    .filter((job) => shippingChatFilter === 'all' || job.status === shippingChatFilter)
                    .map((job) => {
                      const statusStyles = {
                        pending: 'bg-blue-50 text-blue-700 border-blue-200',
                        prepared: 'bg-amber-50 text-amber-700 border-amber-200',
                        sent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                        failed: 'bg-rose-50 text-rose-700 border-rose-200',
                        cancelled: 'bg-slate-50 text-slate-700 border-slate-200',
                      }[job.status] || 'bg-slate-50 text-slate-700'

                      return (
                        <tr key={job.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{job.buyerUsername}</div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">{job.orderNumber}</div>
                            {job.trackingNumber && (
                              <div className="text-xs text-slate-400 mt-0.5">Resi: {job.trackingNumber}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 max-w-[280px]">
                            <span title={job.message} className="cursor-help text-xs text-slate-500 block truncate leading-relaxed">
                              {job.message}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${statusStyles}`}>
                              {job.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 font-medium">
                            {job.attempts} / 3
                          </td>
                          <td className="px-4 py-3 text-xs max-w-[200px] break-words text-rose-600 font-medium">
                            {job.errorMessage || '-'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {(job.status === 'failed' || job.status === 'cancelled') && (
                              <button
                                type="button"
                                disabled={retryingId === job.id}
                                onClick={() => void handleRetryShippingChat(job.id)}
                                className="inline-flex items-center rounded bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-indigo-700 transition shadow-sm disabled:opacity-50"
                              >
                                {retryingId === job.id ? 'Mengantre...' : '[retry]'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  {recentShippingChatSends.filter((job) => shippingChatFilter === 'all' || job.status === shippingChatFilter).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        [-] Tidak ada antrean chat pengiriman dengan kriteria ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
    </div>
  )
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-opencode__list-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
