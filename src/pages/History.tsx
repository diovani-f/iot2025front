import React, { useEffect, useMemo, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Activity, Download, Filter } from "lucide-react"

const API_URL = import.meta.env?.VITE_API_URL || "https://iot2025back.onrender.com"

// tipos basicos
type CompCfg = {
  name?: string
  model?: string
  type?: string
  pin?: number
  interval?: number
  unit?: string
  label?: string
  config?: { min?: number; max?: number }
}
type Device = {
  name: string
  espId: string
  components: CompCfg[]
}
type Reading = {
  espId: string
  timestamp?: string | number
  data?: Record<string, any>
  payload?: Record<string, any>
  values?: Record<string, any>
  readings?: Record<string, any>
  medidas?: Record<string, any>
  [k: string]: any
}
type EventRow = {
  id: string
  ts: number
  timestamp: string
  device: string
  espId: string
  type: "alert" | "data" | "system"
  event: string
  value: string
  severity: "critical" | "high" | "medium" | "normal"
}

// utils
const norm = (s: any) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")

const pickTimestamp = (obj: any) => {
  const cands = [obj?.timestamp, obj?.ts, obj?.time, obj?.createdAt, obj?.created_at, obj?.date]
  for (const v of cands) {
    const t = typeof v === "string" ? Date.parse(v) : typeof v === "number" ? v : undefined
    if (Number.isFinite(t as number)) return t as number
  }
  return 0
}

const flattenAll = (o: any, prefix = "", out: Record<string, any> = {}) => {
  if (o && typeof o === "object") {
    for (const [k, v] of Object.entries(o)) {
      const key = prefix ? `${prefix}.${k}` : k
      if (v && typeof v === "object" && !Array.isArray(v)) flattenAll(v, key, out)
      else out[key] = v
    }
  }
  return out
}

const getRoots = (row: Reading) => [row?.data, row?.payload, row?.values, row?.readings, row?.medidas, row].filter(Boolean)

const getDeepAndFlat = (row: Reading) => {
  const roots = getRoots(row)
  const deep = roots[0] && typeof roots[0] === "object" ? (roots[0] as object) : {}
  const flat = flattenAll(deep)
  return { deep, flat }
}

const deepFind = (obj: any, pred: (k: string, v: any) => boolean): { key: string; value: any } | undefined => {
  if (!obj || typeof obj !== "object") return undefined
  for (const [k, v] of Object.entries(obj)) {
    if (pred(k, v)) return { key: k, value: v }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const hit = deepFind(v, pred)
      if (hit) return hit
    }
  }
  return undefined
}

const resolveRawForComponent = (row: Reading, comp: CompCfg) => {
  const keys = [comp.label, comp.name, comp.model, comp.type, comp.unit].map(norm).filter(Boolean)
  const { deep, flat } = getDeepAndFlat(row)

  for (const root of getRoots(row)) {
    if (!root || typeof root !== "object") continue
    const hit = deepFind(root, (k) => keys.includes(norm(k)))
    if (hit) return { key: hit.key, value: hit.value }
  }

  for (const [k, v] of Object.entries(flat)) {
    const nk = norm(k.split(".").slice(-1)[0])
    if (keys.includes(nk)) return { key: k, value: v }
  }

  // fallback: primeiro numero do flat
  for (const [k, v] of Object.entries(flat)) {
    const n = toNum(v)
    if (Number.isFinite(n)) return { key: k, value: v }
  }

  return { key: "", value: undefined }
}

const toNum = (v: any) => {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "boolean") return v ? 1 : 0
  if (typeof v === "string") {
    const s = v.trim()
    if (/^0x[0-9a-f]+$/i.test(s)) return Number.parseInt(s, 16)
    const n = Number(s)
    if (Number.isFinite(n)) return n
  }
  return NaN
}

const fmtTime = (ms: number) => {
  if (!ms) return "-"
  const d = new Date(ms)
  const yyyy = d.getFullYear()
  const MM = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  const ss = String(d.getSeconds()).padStart(2, "0")
  return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}`
}

const sevFromLimits = (num: number, min?: number, max?: number): "normal" | "medium" | "high" | "critical" => {
  if (!Number.isFinite(num)) return "normal"
  const lo = typeof min === "number" ? min : -Infinity
  const hi = typeof max === "number" ? max : Infinity
  if (num >= lo && num <= hi) return "normal"
  if (num < lo) {
    const delta = lo - num
    return delta > Math.max(1e-6, (Number.isFinite(hi - lo) ? (hi - lo) : 1) * 0.2) ? "critical" : "high"
  }
  if (num > hi) {
    const delta = num - hi
    return delta > Math.max(1e-6, (Number.isFinite(hi - lo) ? (hi - lo) : 1) * 0.2) ? "critical" : "high"
  }
  return "normal"
}

const asPrimaryValue = (row: Reading) => {
  const { flat } = getDeepAndFlat(row)
  for (const [k, v] of Object.entries(flat)) {
    const n = toNum(v)
    if (Number.isFinite(n)) {
      return { key: k, value: v }
    }
  }
  const anyK = Object.keys(flat)[0]
  return { key: anyK || "", value: anyK ? flat[anyK] : undefined }
}

export default function History() {
  // estado de filtros
  const [typeFilter, setTypeFilter] = useState<"all" | "alert" | "data" | "system">("all")
  const [deviceFilter, setDeviceFilter] = useState<string>("all-devices")
  const [period, setPeriod] = useState<"1h" | "24h" | "7d" | "30d">("24h")

  // dados
  const [devices, setDevices] = useState<Device[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>("")

  // carregar dispositivos
  useEffect(() => {
    let alive = true
    const run = async () => {
      setLoading(true)
      setError("")
      try {
        const r = await fetch(`${API_URL}/api/devices`)
        if (!r.ok) throw new Error(`falha ao listar devices: ${r.status}`)
        const data = (await r.json()) as Device[]
        if (!alive) return
        setDevices(Array.isArray(data) ? data : [])
      } catch (e: any) {
        if (alive) setError(e?.message || "erro ao listar devices")
      } finally {
        if (alive) setLoading(false)
      }
    }
    run()
    return () => {
      alive = false
    }
  }, [])

  // construir eventos a partir das leituras
  useEffect(() => {
    let alive = true
    const build = async () => {
      if (!devices.length) return
      setLoading(true)
      setError("")
      try {
        const targets =
          deviceFilter === "all-devices"
            ? devices
            : devices.filter((d) => d.espId.toLowerCase() === deviceFilter.toLowerCase())
        const now = Date.now()
        const span =
          period === "1h"
            ? 1 * 3600_000
            : period === "24h"
            ? 24 * 3600_000
            : period === "7d"
            ? 7 * 24 * 3600_000
            : 30 * 24 * 3600_000
        const since = now - span

        const perDevice = await Promise.all(
          targets.map(async (d) => {
            try {
              const r = await fetch(`${API_URL}/api/readings/${encodeURIComponent(d.espId)}`)
              if (!r.ok) return [] as EventRow[]
              const arr = (await r.json()) as Reading[]
              // backend devolve desc, entao inverto para cronologico
              const list = Array.isArray(arr) ? arr.reverse() : []
              const rows: EventRow[] = []

              // eventos de dados e alerta
              for (let i = 0; i < list.length; i++) {
                const row = list[i]
                const ts = pickTimestamp(row)
                if (!ts || ts < since) continue

                // dado principal
                const primary = asPrimaryValue(row)
                const valueStr =
                  typeof primary.value === "number"
                    ? String(primary.value)
                    : typeof primary.value === "boolean"
                    ? primary.value
                      ? "on"
                      : "off"
                    : typeof primary.value === "string"
                    ? primary.value
                    : "-"

                rows.push({
                  id: `${d.espId}-${ts}-data-${i}`,
                  ts,
                  timestamp: fmtTime(ts),
                  device: d.name || d.espId,
                  espId: d.espId,
                  type: "data",
                  event: primary.key || "leitura",
                  value: valueStr,
                  severity: "normal",
                })

                // avaliar limites por componente
                for (const c of d.components || []) {
                  const rmatch = resolveRawForComponent(row, c)
                  const num = toNum(rmatch.value)
                  if (!Number.isFinite(num)) continue
                  const min = c?.config?.min
                  const max = c?.config?.max
                  const sev = sevFromLimits(num, min, max)
                  if (sev === "normal") continue
                  rows.push({
                    id: `${d.espId}-${ts}-alert-${c.label || c.name || c.model || c.type || c.pin}-${i}`,
                    ts,
                    timestamp: fmtTime(ts),
                    device: d.name || d.espId,
                    espId: d.espId,
                    type: "alert",
                    event: `${c.label || c.name || c.model || c.type || "componente"} fora do limite`,
                    value: Number.isFinite(num) ? `${num}${c.unit ? ` ${c.unit}` : ""}` : String(rmatch.value ?? "-"),
                    severity: sev,
                  })
                }
              }

              // evento de sistema (offline > 10 min)
              const last = list.length ? list[list.length - 1] : undefined
              const lastTs = last ? pickTimestamp(last) : 0
              if (!lastTs || now - lastTs > 10 * 60_000) {
                const ts = Math.max(lastTs, since)
                rows.push({
                  id: `${d.espId}-system-offline-${ts}`,
                  ts,
                  timestamp: ts ? fmtTime(ts) : fmtTime(now),
                  device: d.name || d.espId,
                  espId: d.espId,
                  type: "system",
                  event: "dispositivo offline",
                  value: "-",
                  severity: "critical",
                })
              }

              return rows
            } catch {
              return [] as EventRow[]
            }
          })
        )

        const merged = perDevice.flat().sort((a, b) => b.ts - a.ts)
        if (!alive) return
        setEvents(merged)
      } catch (e: any) {
        if (alive) setError(e?.message || "erro ao montar historico")
      } finally {
        if (alive) setLoading(false)
      }
    }
    build()
    // atualiza periodicamente para simular tempo real
    const t = setInterval(build, 10_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [devices, deviceFilter, period])

  // filtros de exibicao
  const filtered = useMemo(() => {
    return events.filter((e) => (typeFilter === "all" ? true : e.type === typeFilter))
  }, [events, typeFilter])

  // estatisticas
  const stats = useMemo(() => {
    const total = filtered.length
    const crit = filtered.filter((e) => e.type === "alert" && (e.severity === "critical" || e.severity === "high")).length
    const today = filtered.filter((e) => {
      const d = new Date(e.ts)
      const n = new Date()
      return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
    }).length
    return [
      { label: "Total de Eventos", value: total.toLocaleString("pt-BR"), change: "+0%", trend: "up" as const },
      { label: "Alertas Críticos", value: String(crit), change: "+0%", trend: "down" as const },
      { label: "Eventos Hoje", value: String(today), change: "+0%", trend: "up" as const },
    ]
  }, [filtered])

  // exportacao csv
  const onExport = () => {
    const header = ["timestamp", "device", "espId", "type", "event", "value", "severity"]
    const lines = [header.join(",")]
    for (const e of filtered) {
      const row = [
        e.timestamp,
        `"${e.device.replace(/"/g, '""')}"`,
        `"${e.espId.replace(/"/g, '""')}"`,
        e.type,
        `"${e.event.replace(/"/g, '""')}"`,
        `"${String(e.value ?? "").replace(/"/g, '""')}"`,
        e.severity,
      ]
      lines.push(row.join(","))
    }
    const csv = lines.join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `historico_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-4xl font-bold text-transparent">
              Histórico de Eventos
            </h1>
            <p className="mt-2 text-muted-foreground">Visualize todos os eventos e alertas do sistema</p>
          </div>
          <Button variant="outline" className="gap-2" onClick={onExport}>
            <Download className="h-4 w-4" />
            Exportar
          </Button>
        </div>

        {!!error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
            {error}
          </div>
        )}
        {loading && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-primary">carregando...</div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {stats.map((stat, index) => (
            <Card key={index} className="border-primary/20 bg-card/50 p-6 backdrop-blur">
              <div className="mb-2 flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
              <p className="text-3xl font-bold">{stat.value}</p>
        
            </Card>
          ))}
        </div>

        <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
          <div className="mb-6 flex flex-wrap gap-4">
            <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo de Evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="alert">Alertas</SelectItem>
                <SelectItem value="data">Dados</SelectItem>
                <SelectItem value="system">Sistema</SelectItem>
              </SelectContent>
            </Select>

            <Select value={deviceFilter} onValueChange={(v) => setDeviceFilter(v)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Dispositivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-devices">Todos</SelectItem>
                {devices.map((d) => (
                  <SelectItem key={d.espId} value={d.espId}>
                    {d.name} — {d.espId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Última hora</SelectItem>
                <SelectItem value="24h">Últimas 24h</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" className="gap-2" onClick={() => { /* gatilho manual do filtro */ }}>
              <Filter className="h-4 w-4" />
              Filtrar
            </Button>
          </div>

          <div className="overflow-hidden rounded-lg border border-border/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Severidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id} className="hover:bg-muted/50">
                    <TableCell className="font-mono text-sm">{e.timestamp}</TableCell>
                    <TableCell>{e.device}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{e.type}</Badge>
                    </TableCell>
                    <TableCell>{e.event}</TableCell>
                    <TableCell className="font-medium">{e.value}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          e.severity === "critical"
                            ? "destructive"
                            : e.severity === "high"
                            ? "destructive"
                            : e.severity === "medium"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {e.severity}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!filtered.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      sem eventos para os filtros selecionados
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