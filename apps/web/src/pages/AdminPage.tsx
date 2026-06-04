import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Database, HardDriveDownload, RefreshCcw, ShieldCheck, SquareActivity } from 'lucide-react'

import { StageCard } from '../components/StageCard'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { readServerAdminStatusApi } from '@pakti/api-client'

type AdminStatus = Awaited<ReturnType<typeof readServerAdminStatusApi>>

export function AdminPage() {
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('Memuat status server...')

  useEffect(() => {
    let active = true

    void readServerAdminStatusApi()
      .then((status) => {
        if (!active) {
          return
        }

        setAdminStatus(status)
        setError(null)
        setMessage('Status server dimuat.')
      })
      .catch(() => {
        if (!active) {
          return
        }

        setAdminStatus(null)
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
      const status = await readServerAdminStatusApi()
      setAdminStatus(status)
      setMessage('Status server dimuat.')
    } catch {
      setAdminStatus(null)
      setError('Sesi login diperlukan atau server belum aktif, panel admin memakai mode terbatas.')
      setMessage('Status belum bisa diperbarui karena sesi login diperlukan atau server belum aktif.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <StageCard title="Admin">
      <div className="grid gap-4">
        <section className="grid gap-4 rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 p-4 shadow-xl shadow-slate-900/5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-2">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                <ShieldCheck className="size-3.5" />
                Server audit
              </div>
              <h3 className="text-2xl font-semibold tracking-tight text-slate-950">Audit server dan migrasi</h3>
              <p className="max-w-3xl text-sm leading-6 text-slate-500">
                Pantau status server SQLite, lihat data terbaru, dan sinkronkan cache browser ke server bila perlu.
              </p>
            </div>

            <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
              <div className="flex items-center justify-between gap-10">
                <span>Status</span>
                <strong className="text-slate-950">{loading ? 'Loading' : error ? 'Error' : 'Ready'}</strong>
              </div>
              <div className="flex items-center justify-between gap-10">
                <span>Mode</span>
                <strong className="text-slate-950">Server only</strong>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Operator profiles" value={adminStatus?.counts.operatorProfiles ?? 0} icon={Database} />
            <StatCard label="Recordings" value={adminStatus?.counts.recordings ?? 0} icon={HardDriveDownload} />
            <StatCard label="Scan logs" value={adminStatus?.counts.scanLogs ?? 0} icon={SquareActivity} />
            <StatCard
              label="Sessions"
              value={adminStatus?.counts.sessions ?? 0}
              icon={ShieldCheck}
            />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <Card className="border-slate-200/80 shadow-xl shadow-slate-900/5">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">Status server</CardTitle>
              <CardDescription>Bootstrap dan ringkasan kesehatan database server.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {loading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Memuat status server...
                </div>
              ) : error ? (
                <Alert variant="destructive">
                  <div className="grid gap-1">
                    <p className="font-medium">Status server belum tersedia</p>
                    <p className="text-sm leading-6 text-current/80">{error}</p>
                  </div>
                </Alert>
              ) : adminStatus ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoCard label="Bootstrap" value={adminStatus.bootstrap.needsSetup ? 'Needed' : 'Ready'} />
                  <InfoCard label="User count" value={String(adminStatus.bootstrap.operatorCount)} />
                  <InfoCard label="Admin count" value={String(adminStatus.bootstrap.adminCount)} />
                  <InfoCard label="Last error" value={adminStatus.lastError ? 'Ada' : 'Tidak ada'} />
                  <InfoCard label="Health" value="OK" />
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" onClick={() => void handleRefresh()}>
                  <RefreshCcw className="size-4" />
                  Refresh status
                </Button>
              </div>

              <Alert variant={error ? 'destructive' : 'info'}>
                <div className="grid gap-1">
                  <p className="font-medium">Pesan</p>
                  <p className="text-sm leading-6 text-current/80">{message}</p>
                </div>
              </Alert>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-xl shadow-slate-900/5">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">Recent data</CardTitle>
              <CardDescription>Audit cepat terhadap data terbaru yang tersimpan di server.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 pt-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recent recordings</p>
                <div className="mt-3 grid gap-2">
                  {adminStatus?.recentRecordings.slice(0, 5).map((recording) => (
                    <div key={recording.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                      <span className="min-w-0 truncate font-medium text-slate-950">{recording.resiNumber}</span>
                      <span className="shrink-0 text-slate-500">{recording.status}</span>
                    </div>
                  ))}
                  {adminStatus?.recentRecordings.length === 0 ? (
                    <p className="text-sm text-slate-500">Belum ada recording di server.</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recent scan logs</p>
                <div className="mt-3 grid gap-2">
                  {adminStatus?.recentScanLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                      <span className="min-w-0 truncate font-medium text-slate-950">{log.resiNumber}</span>
                      <span className="shrink-0 text-slate-500">{log.action}</span>
                    </div>
                  ))}
                  {adminStatus?.recentScanLogs.length === 0 ? (
                    <p className="text-sm text-slate-500">Belum ada scan log di server.</p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </StageCard>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: ComponentType<{ className?: string }>
}) {
  return (
    <Card className="border-slate-200/80 shadow-sm shadow-slate-900/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
          <div className="grid size-9 place-items-center rounded-xl bg-slate-950 text-white">
            <Icon className="size-4" />
          </div>
        </div>
        <div className="text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
      </CardContent>
    </Card>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <strong className="mt-2 block text-2xl tracking-tight text-slate-950">{value}</strong>
    </div>
  )
}
