import { useEffect, useMemo, useState } from "react"
import { Activity, Download, Filter } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
type EventKind = "all" | "data" | "alert" | "system"

type EventRow = {
  id: string
  ts: number
  timestamp: string
  device: string
  espId: string
  type: Exclude<EventKind, "all">
  metric: string
  value: string
  severity: "normal" | "warning" | "critical"
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

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return "-"
  if (Math.abs(value) >= 100) return value.toFixed(0)
  return value.toFixed(2)
}

const severityForValue = (value: number, min?: number, max?: number) => {
  if (!Number.isFinite(value)) return "normal"
  const lower = typeof min === "number" ? min : -Infinity
  const upper = typeof max === "number" ? max : Infinity
  if (value < lower || value > upper) {
    const span = Number.isFinite(upper - lower) ? Math.max(upper - lower, 1e-6) : 1
    const delta = value < lower ? lower - value : value - upper
    return delta > span * 0.2 ? "critical" : "warning"
  }
  return "normal"
}

const findComponentMatch = (device: ReturnType<typeof useDeviceRegistry>["devices"][number], key: string) => {
  const leaf = key.split(".").slice(-1)[0] || key
  const target = normalizeKey(leaf)
  return device.components?.find((component) => {
    const candidates = [component.label, component.name, component.model, component.type]
      .filter(Boolean)
      .map((value) => normalizeKey(value))
    return candidates.includes(target)
  })
}

export default function History() {
  const { devices } = useDeviceRegistry()
  const [period, setPeriod] = useState<Period>("24h")
  const [typeFilter, setTypeFilter] = useState<EventKind>("all")
  const [espFilter, setEspFilter] = useState<string>("all")
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (espFilter === "all" && devices.length) {
      setEspFilter("all")
    }
  }, [devices, espFilter])

  useEffect(() => {
    if (!devices.length) {
      setEvents([])
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError("")
      const since = sinceForPeriod(period)
      const targets = espFilter === "all" ? devices : devices.filter((device) => device.espId === espFilter)
      const collected: EventRow[] = []

      for (const device of targets) {
        try {
          const response = await fetch(`${API_URL}/api/readings/${encodeURIComponent(device.espId)}`)
          if (!response.ok) throw new Error(`leituras indisponiveis (${response.status})`)
          const payload = (await response.json()) as Reading[] | undefined
          const list = Array.isArray(payload) ? payload.slice().reverse() : []
          let lastSeen = 0

          list.forEach((reading, index) => {
            const ts = pickTimestamp(reading, index)
            if (ts && ts > lastSeen) lastSeen = ts
            if (ts && ts < since) return
            const { flat } = extractPayloadMaps(reading)

            const numericEntries = Object.entries(flat)
              .filter(([, value]) => Number.isFinite(numericValue(value)))
              .slice(0, 3)

            numericEntries.forEach(([key, value], slot) => {
              const num = numericValue(value)
              const formatted = Number.isFinite(num) ? formatNumber(num as number) : String(value ?? "-")
              collected.push({
                id: `${device.espId}-${ts}-data-${slot}`,
                ts: ts || Date.now(),
                timestamp: ts ? formatDateTime(ts) : formatDateTime(Date.now()),
                device: device.name,
                espId: device.espId,
                type: "data",
                metric: key,
                value: formatted,
                severity: "normal",
              })
            })

            for (const [key, value] of numericEntries) {
              const component = findComponentMatch(device, key)
              if (!component) continue
              const num = numericValue(value)
              const severity = severityForValue(num as number, component.config?.min, component.config?.max)
              if (severity === "normal") continue
              const formatted = Number.isFinite(num) ? formatNumber(num as number) : String(value ?? "-")
              collected.push({
                id: `${device.espId}-${ts}-alert-${key}`,
                ts: ts || Date.now(),
                timestamp: ts ? formatDateTime(ts) : formatDateTime(Date.now()),
                device: device.name,
                espId: device.espId,
                type: "alert",
                metric: `${component.label || component.name || key} fora do limite`,
                value: `${formatted}${component.unit ? ` ${component.unit}` : ""}`,
                severity,
              })
            }
          })

          if (!lastSeen || Date.now() - lastSeen > 10 * 60_000) {
            const ts = lastSeen || since
            collected.push({
              id: `${device.espId}-offline-${ts}`,
              ts,
              timestamp: formatDateTime(ts || Date.now()),
              device: device.name,
              espId: device.espId,
              type: "system",
              metric: "dispositivo offline",
              value: "-",
              severity: "critical",
            })
          }
        } catch (err) {
          console.warn(`falha ao carregar leituras de ${device.espId}`, err)
          if (!cancelled) setError(`falha ao carregar leituras de ${device.name || device.espId}`)
        }
      }

      if (!cancelled) {
        collected.sort((a, b) => b.ts - a.ts)
        setEvents(collected)
      }
      setLoading(false)
    }
    load()
    const timer = setInterval(load, 10_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [devices, period, espFilter])

  const filtered = useMemo(() => {
    return events.filter((event) => (typeFilter === "all" ? true : event.type === typeFilter))
  }, [events, typeFilter])

  const stats = useMemo(() => {
    const total = filtered.length
    const alerts = filtered.filter((event) => event.type === "alert").length
    const critical = filtered.filter((event) => event.severity === "critical").length
    return [
      { label: "Eventos capturados", value: total },
      { label: "Alertas", value: alerts },
      { label: "Criticos", value: critical },
    ]
  }, [filtered])

  const handleExport = () => {
    const header = ["timestamp", "device", "espId", "type", "metric", "value", "severity"]
    const rows = filtered.map((event) => [
      event.timestamp,
      event.device,
      event.espId,
      event.type,
      event.metric,
      event.value,
      event.severity,
    ])
    const csv = [header, ...rows]
      .map((line) => line.map((field) => `"${String(field ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const filename = `historico-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-4xl font-bold text-transparent">Historico de Eventos</h1>
            <p className="mt-2 text-muted-foreground">Eventos gerados a partir de /api/readings para todos os dispositivos</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={period}
              onChange={(event) => setPeriod(event.target.value as Period)}
            >
              <option value="1h">Ultima hora</option>
              <option value="24h">Ultimas 24h</option>
              <option value="7d">Ultimos 7 dias</option>
              <option value="30d">Ultimos 30 dias</option>
            </select>
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={espFilter}
              onChange={(event) => setEspFilter(event.target.value)}
            >
              <option value="all">Todos os dispositivos</option>
              {devices.map((device) => (
                <option key={device.espId} value={device.espId}>
                  {device.name}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as EventKind)}
            >
              <option value="all">Todos</option>
              <option value="data">Dados</option>
              <option value="alert">Alertas</option>
              <option value="system">Sistema</option>
            </select>
            <Button variant="outline" className="gap-2" onClick={handleExport} disabled={!filtered.length}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">{error}</div>}
        {loading && <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">Carregando eventos...</div>}

        <div className="grid gap-4 md:grid-cols-3">
          {stats.map((item) => (
            <Card key={item.label} className="border-primary/20 bg-card/60 p-4 backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">{item.label}</div>
                  <div className="text-2xl font-bold">{item.value}</div>
                </div>
                <Activity className="h-5 w-5 text-primary" />
              </div>
            </Card>
          ))}
        </div>

        <Card className="border-primary/30 bg-card/60 backdrop-blur">
          <div className="flex items-center justify-between border-b border-border/40 p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              Exibindo {filtered.length} eventos
            </div>
          </div>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Horario</TableHead>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Detalhe</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{event.timestamp}</TableCell>
                    <TableCell>
                      <div className="font-semibold">{event.device}</div>
                      <div className="text-xs text-muted-foreground">{event.espId}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={event.type === "alert" ? "destructive" : event.type === "system" ? "outline" : "secondary"}>
                        {event.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{event.metric}</TableCell>
                    <TableCell className="text-right font-semibold">{event.value}</TableCell>
                  </TableRow>
                ))}
                {!filtered.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                      Nenhum evento encontrado para os filtros escolhidos.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  )
}
