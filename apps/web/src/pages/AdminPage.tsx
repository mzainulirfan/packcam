import { useEffect, useState } from 'react'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { readServerAdminStatusApi } from '@pakti/api-client'

type AdminStatus = Awaited<ReturnType<typeof readServerAdminStatusApi>>

export function AdminPage() {
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('Memuat status server...')

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

    return () => {
      active = false
    }
  }, [])

  async function handleRefresh() {
    setLoading(true)
    setError(null)

    try {
      await loadAdminData()
    } catch {
      setAdminStatus(null)
      setError('Sesi login diperlukan atau server belum aktif, panel admin memakai mode terbatas.')
      setMessage('Status belum bisa diperbarui karena sesi login diperlukan atau server belum aktif.')
    } finally {
      setLoading(false)
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
