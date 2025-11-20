import { useEffect, useMemo, useState } from "react"
import { Calendar, Download, FileText, Loader2, TrendingUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { API_URL } from "@/lib/api"
import { useDeviceRegistry } from "@/lib/device-registry"
import {
  extractPayloadMaps,
  formatDateTime,
  normalizeKey,
  numericValue,
  pickTimestamp,
  type Reading,
} from "@/lib/readings-utils"

type Period = "1h" | "24h" | "7d" | "30d"
type ReportFormat = "csv"

type MetricSummary = {
  key: string
  count: number
  min: number
  max: number
  avg: number
  last: number
  unit?: string
}

type DeviceSummary = {
  espId: string
  name: string
  online: boolean
  lastSeen: number
  metrics: MetricSummary[]
  alerts: number
}

type ReportEntry = {
  id: string
  createdAt: number
  period: Period
  format: ReportFormat
  items: number
  filename: string
  size: string
}

const REPORT_KEY = "iot2025::reports"

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return "-"
  if (Math.abs(value) >= 100) return value.toFixed(0)
  return value.toFixed(2)
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const sinceForPeriod = (period: Period) => {
  const now = Date.now()
  switch (period) {
    case "1h":
      return now - 1 * 3600_000
    case "24h":
      return now - 24 * 3600_000
    case "7d":
      return now - 7 * 24 * 3600_000
    case "30d":
    default:
      return now - 30 * 24 * 3600_000
  }
}

const matchUnit = (device: ReturnType<typeof useDeviceRegistry>["devices"][number], key: string) => {
  const leaf = key.split(".").slice(-1)[0] || key
  const target = normalizeKey(leaf)
  for (const component of device.components ?? []) {
    const candidates = [component.label, component.name, component.model, component.type, component.unit]
      .filter(Boolean)
      .map((item) => normalizeKey(item))
    if (candidates.includes(target)) return component.unit
  }
  return undefined
}

const buildCsv = (summaries: DeviceSummary[], period: Period) => {
  const lines: string[] = []
  lines.push(`# relatorio agregado ${period} - ${new Date().toISOString()}`)
  lines.push(`dispositivos;${summaries.length}`)
  lines.push("dispositivo;espId;online;ultima_leitura;metric;count;min;max;avg;last;unit")
  for (const summary of summaries) {
    if (!summary.metrics.length) {
      lines.push(`${summary.name};${summary.espId};${summary.online ? "online" : "offline"};${summary.lastSeen || "-"};-;-;-;-;-;-;-`)
      continue
    }
    for (const metric of summary.metrics) {
      lines.push(
        `${summary.name};${summary.espId};${summary.online ? "online" : "offline"};${summary.lastSeen || "-"};${metric.key};${metric.count};${formatNumber(metric.min)};${formatNumber(metric.max)};${formatNumber(metric.avg)};${formatNumber(metric.last)};${metric.unit ?? ""}`
      )
    }
  }
  return lines.join("\n")
}

export default function Reports() {
  const { devices } = useDeviceRegistry()
  const [period, setPeriod] = useState<Period>("24h")
  const [format] = useState<ReportFormat>("csv")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [summaries, setSummaries] = useState<DeviceSummary[]>([])
  const [reports, setReports] = useState<ReportEntry[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const raw = window.localStorage.getItem(REPORT_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as ReportEntry[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(REPORT_KEY, JSON.stringify(reports))
    } catch (err) {
      console.warn("falha ao persistir relatorios", err)
    }
  }, [reports])

  useEffect(() => {
    if (!devices.length) {
      setSummaries([])
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError("")
      const since = sinceForPeriod(period)
      const collected: DeviceSummary[] = []
      let deviceAlerts = 0

      for (const device of devices) {
        try {
          const response = await fetch(`${API_URL}/api/readings/${encodeURIComponent(device.espId)}`)
          if (!response.ok) throw new Error(`leituras indisponiveis (${response.status})`)
          const payload = (await response.json()) as Reading[] | undefined
          const list = Array.isArray(payload) ? payload.slice().reverse() : []
          const metrics = new Map<string, { count: number; min: number; max: number; sum: number; last: number; unit?: string }>()
          let lastSeen = 0
          let alerts = 0

          list.forEach((reading, index) => {
            const ts = pickTimestamp(reading, index)
            if (ts && ts > lastSeen) lastSeen = ts
            if (ts && ts < since) return
            const { flat } = extractPayloadMaps(reading)
            for (const [key, value] of Object.entries(flat)) {
              const num = numericValue(value)
              if (!Number.isFinite(num)) continue
              const entry = metrics.get(key)
              if (entry) {
                entry.count += 1
                entry.sum += num as number
                entry.min = Math.min(entry.min, num as number)
                entry.max = Math.max(entry.max, num as number)
                entry.last = num as number
              } else {
                metrics.set(key, {
                  count: 1,
                  min: num as number,
                  max: num as number,
                  sum: num as number,
                  last: num as number,
                  unit: matchUnit(device, key),
                })
              }

              const component = device.components?.find((item) => {
                const leaf = key.split(".").slice(-1)[0] || key
                const target = normalizeKey(leaf)
                const candidates = [item.label, item.name, item.model, item.type]
                  .filter(Boolean)
                  .map((val) => normalizeKey(val))
                return candidates.includes(target)
              })
              if (!component) continue
              const { min, max } = component.config ?? {}
              if (typeof min === "number" && num < min) alerts += 1
              if (typeof max === "number" && num > max) alerts += 1
            }
          })

          const metricSummaries: MetricSummary[] = Array.from(metrics.entries())
            .map(([key, entry]) => ({
              key,
              count: entry.count,
              min: entry.min,
              max: entry.max,
              avg: entry.sum / Math.max(1, entry.count),
              last: entry.last,
              unit: entry.unit,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20)

          collected.push({
            espId: device.espId,
            name: device.name,
            online: !!(lastSeen && Date.now() - lastSeen < 60_000),
            lastSeen,
            metrics: metricSummaries,
            alerts,
          })
          deviceAlerts += alerts
        } catch (err) {
          console.warn(`falha ao carregar leituras de ${device.espId}`, err)
          collected.push({
            espId: device.espId,
            name: device.name,
            online: false,
            lastSeen: 0,
            metrics: [],
            alerts: 0,
          })
        }
      }

      if (!cancelled) {
        setSummaries(collected)
        if (!deviceAlerts) setError("")
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [devices, period])

  const onlineCount = useMemo(() => summaries.filter((item) => item.online).length, [summaries])
  const totalAlerts = useMemo(() => summaries.reduce((acc, item) => acc + item.alerts, 0), [summaries])
  const metricCount = useMemo(() => summaries.reduce((acc, item) => acc + item.metrics.length, 0), [summaries])

  const handleExport = () => {
    if (!summaries.length) return
    const csv = buildCsv(summaries, period)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const filename = `relatorio-${period}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)

    setReports((current) => [
      {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        period,
        format,
        items: summaries.length,
        filename,
        size: formatBytes(blob.size),
      },
      ...current,
    ].slice(0, 10))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-4xl font-bold text-transparent">Relatorios</h1>
            <p className="mt-2 text-muted-foreground">Gere exportacoes locais a partir das leituras disponiveis</p>
          </div>
          <div className="flex gap-2">
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={period}
              onChange={(event) => setPeriod(event.target.value as Period)}
            >
              <option value="1h">Ultima hora</option>
              <option value="24h">Ultimas 24h</option>
              <option value="7d">Ultimos 7 dias</option>
              <option value="30d">Ultimos 30 dias</option>
            </select>
            <Button className="gap-2" onClick={handleExport} disabled={!summaries.length || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Baixar CSV
            </Button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">{error}</div>}
        {!devices.length && (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">Cadastre dispositivos para gerar relatorios.</div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-primary/20 bg-card/60 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Dispositivos avaliados</div>
                <div className="text-2xl font-bold">{summaries.length}</div>
              </div>
              <FileText className="h-5 w-5 text-primary" />
            </div>
          </Card>
          <Card className="border-primary/20 bg-card/60 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Online</div>
                <div className="text-2xl font-bold">{onlineCount}</div>
              </div>
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            </div>
          </Card>
          <Card className="border-primary/20 bg-card/60 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Metricas agregadas</div>
                <div className="text-2xl font-bold">{metricCount}</div>
              </div>
              <Calendar className="h-5 w-5 text-blue-500" />
            </div>
          </Card>
          <Card className="border-primary/20 bg-card/60 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Alertas por limites</div>
                <div className="text-2xl font-bold">{totalAlerts}</div>
              </div>
              <Badge variant="outline">limites configurados</Badge>
            </div>
          </Card>
        </div>

        <Card className="border-primary/30 bg-card/60 p-6 backdrop-blur">
          <h2 className="text-xl font-semibold">Sumario por dispositivo</h2>
          <div className="mt-4 grid gap-4">
            {summaries.map((summary) => (
              <div key={summary.espId} className="rounded-lg border border-border/40 bg-background/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-muted-foreground">{summary.espId}</div>
                    <div className="text-lg font-bold">{summary.name}</div>
                  </div>
                  <Badge variant={summary.online ? "default" : "outline"}>{summary.online ? "online" : "offline"}</Badge>
                  <div className="text-xs text-muted-foreground">Ultima leitura: {summary.lastSeen ? formatDateTime(summary.lastSeen) : "-"}</div>
                  <div className="text-xs text-muted-foreground">Alertas: {summary.alerts}</div>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {summary.metrics.length ? (
                    summary.metrics.map((metric) => (
                      <div key={metric.key} className="rounded border border-border/40 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-muted-foreground">{metric.key}</span>
                          <span className="text-xs text-muted-foreground">{metric.unit ?? ""}</span>
                        </div>
                        <div className="mt-1 grid grid-cols-2 gap-1 text-xs">
                          <span>min: {formatNumber(metric.min)}</span>
                          <span>max: {formatNumber(metric.max)}</span>
                          <span>avg: {formatNumber(metric.avg)}</span>
                          <span>last: {formatNumber(metric.last)}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">leituras: {metric.count}</div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded border border-dashed p-3 text-sm text-muted-foreground">Sem metricas numericas para o periodo.</div>
                  )}
                </div>
              </div>
            ))}
            {!summaries.length && <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">Sem dados para o periodo selecionado.</div>}
          </div>
        </Card>

        <Card className="border-primary/30 bg-card/60 p-6 backdrop-blur">
          <h2 className="text-xl font-semibold">Exportacoes recentes</h2>
          <div className="mt-4 space-y-3">
            {reports.length ? (
              reports.map((report) => (
                <div key={report.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/60 p-3 text-sm">
                  <div>
                    <div className="font-semibold">{report.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(report.createdAt).toLocaleString()}  periodo {report.period}  itens {report.items}
                    </div>
                  </div>
                  <Badge variant="outline">{report.size}</Badge>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">Ainda nao ha exportacoes salvas.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
