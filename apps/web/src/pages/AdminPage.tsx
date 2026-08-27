import { useEffect, useState } from 'react'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { readRecentShopeeChatSendsApi, readRecentShopeeOrdersApi, readServerAdminStatusApi } from '@pakti/api-client'
import type { RecordingChatSend, ShopeeOrder } from '@pakti/types'

type AdminStatus = Awaited<ReturnType<typeof readServerAdminStatusApi>>

export function AdminPage() {
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null)
  const [recentShopeeOrders, setRecentShopeeOrders] = useState<ShopeeOrder[]>([])
  const [recentChatSends, setRecentChatSends] = useState<RecordingChatSend[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('Memuat status server...')

  useEffect(() => {
    let active = true

    void Promise.all([readServerAdminStatusApi(), readRecentShopeeOrdersApi(10), readRecentShopeeChatSendsApi(10)])
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

    return () => {
      active = false
    }
  }, [])

  async function handleRefresh() {
    setLoading(true)
    setError(null)

    try {
      const [status, orders, chatSends] = await Promise.all([readServerAdminStatusApi(), readRecentShopeeOrdersApi(10), readRecentShopeeChatSendsApi(10)])
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
