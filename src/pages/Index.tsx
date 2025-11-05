import React, { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, Database, Wifi, Bell, ChevronRight, TrendingUp, WifiOff, MapPin, Thermometer, Clock, BarChart3, Gauge } from "lucide-react"
import { LineChart as RLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

// url da api: usa variavel de ambiente ou fallback
const API_URL = import.meta.env?.VITE_API_URL || "https://iot2025back.onrender.com"

/* tipos basicos do backend */
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

/* utils */

// normaliza chave para comparacao
const norm = (s: any) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")

// tenta extrair timestamp numerico de uma leitura
const pickTimestamp = (obj: any, idx: number) => {
  if (!obj || typeof obj !== "object") return Date.now() - 1000 * (50 - idx)
  const cands = [obj.timestamp, obj.ts, obj.time, obj.createdAt, obj.created_at, obj.date]
  for (const v of cands) {
    const t = typeof v === "string" ? Date.parse(v) : typeof v === "number" ? v : undefined
    if (Number.isFinite(t as number)) return t as number
  }
  return Date.now() - 1000 * (50 - idx)
}

// patterns de sensores/atuadores
const sensorPatterns = [
  { regex: /temp|temperatura|ds18|dht/i, keySuffix: "temp" },
  { regex: /umid|humid|dht/i, keySuffix: "umid" },
  { regex: /luz|lux|light|lum/i, keySuffix: "lux" },
  { regex: /press|baro|bmp|bme/i, keySuffix: "press" },
  { regex: /gest|gesture/i, keySuffix: "gest" },
  { regex: /key|tecla|keypad/i, keySuffix: "key" },
  { regex: /ir|infra|code/i, keySuffix: "ir" },
  { regex: /prox|ultra|dist|echo|trig/i, keySuffix: "dist" },
  { regex: /rgb|cor|color/i, keySuffix: "color" },
  { regex: /accel|gyro|mpu/i, keySuffix: "axis" },
  { regex: /joystick/i, keySuffix: "axis" },
  { regex: /rele|relay|vibration|vibracao|motor/i, keySuffix: "bool" },
]

// retorna as raizes candidatas do payload
const getRoots = (row: Reading) => [row?.data, row?.payload, row?.values, row?.readings, row?.medidas, row].filter(Boolean)

// busca profunda por chave
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

// achata objeto mantendo primitivos
const flattenAll = (o: any, prefix = "", out: Record<string, any> = {}) => {
  if (o && typeof o === "object") {
    for (const [k, v] of Object.entries(o)) {
      const key = prefix ? `${prefix}.${k}` : k
      if (v && typeof v === "object" && !Array.isArray(v)) {
        flattenAll(v, key, out)
      } else {
        out[key] = v
      }
    }
  }
  return out
}

// extrai mapas deep e flat
const extractMaps = (row: Reading) => {
  const roots = getRoots(row)
  const deep = roots[0] && typeof roots[0] === "object" ? (roots[0] as object) : {}
  const flat = flattenAll(deep)
  return { deep, flat }
}

// resolve valor bruto para um componente
const resolveRawForComponent = (row: Reading, comp: CompCfg) => {
  const keys = [comp.label, comp.name, comp.model, comp.type, comp.unit].map(norm).filter(Boolean)
  const text = `${comp.label ?? ""} ${comp.name ?? ""} ${comp.model ?? ""} ${comp.type ?? ""} ${comp.unit ?? ""}`
  const { deep, flat } = extractMaps(row)

  for (const root of getRoots(row)) {
    if (!root || typeof root !== "object") continue
    const hit = deepFind(root, (k) => keys.includes(norm(k)))
    if (hit) return { kind: typeof hit.value === "object" ? "object" : "scalar", value: hit.value }
  }

  for (const { regex } of sensorPatterns) {
    if (regex.test(text)) {
      for (const root of getRoots(row)) {
        if (!root || typeof root !== "object") continue
        const hit = deepFind(root, (k) => regex.test(k))
        if (hit) return { kind: typeof hit.value === "object" ? "object" : "scalar", value: hit.value }
      }
    }
  }

  for (const [k, v] of Object.entries(flat)) {
    const nk = norm(k.split(".").slice(-1)[0])
    if (keys.includes(nk)) return { kind: "scalar" as const, value: v }
  }

  for (const { regex } of sensorPatterns) {
    if (regex.test(text)) {
      for (const [k, v] of Object.entries(flat)) {
        if (regex.test(k)) return { kind: "scalar" as const, value: v }
      }
    }
  }

  return { kind: "none" as const, value: undefined as any }
}

// converte para numero quando possivel
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

// status por limites
const statusFrom = (value: any, min?: number, max?: number): "normal" | "alerta" | "critico" => {
  const num = toNum(value)
  if (!Number.isFinite(num)) return "normal"
  if (typeof min !== "number" && typeof max !== "number") return "normal"
  const lo = typeof min === "number" ? min : -Infinity
  const hi = typeof max === "number" ? max : Infinity
  const span = Number.isFinite(min as number) && Number.isFinite(max as number) ? Math.max(1e-9, hi - lo) : 1
  const margin = span * 0.1
  if (num < lo) return num < lo - margin ? "critico" : "alerta"
  if (num > hi) return num > hi + margin ? "critico" : "alerta"
  return "normal"
}

// formatadores
const fmtNum = (v: number) => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)) : "-")
const fmtRaw = (label: string, v: any, unit?: string) => {
  if (v === null || v === undefined) return "-"
  if (typeof v === "number" && Number.isFinite(v)) return `${fmtNum(v)}${unit ? ` ${unit}` : ""}`
  if (typeof v === "boolean") return v ? "on" : "off"
  if (typeof v === "string") {
    const t = v.trim()
    if (/^-?\d+(\.\d+)?$/.test(t)) return `${fmtNum(Number(t))}${unit ? ` ${unit}` : ""}`
    if (/^0x[0-9a-f]+$/i.test(t)) return t.toLowerCase()
    if (/ir|infra/i.test(label)) {
      const asNum = Number(t)
      if (Number.isFinite(asNum)) return `0x${asNum.toString(16)}`
    }
    return t
  }
  return String(v)
}
const fmtTime = (ms: number) => {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  const ss = String(d.getSeconds()).padStart(2, "0")
  return `${hh}:${mm}:${ss}`
}

// pagina principal / dashboard
// mostra lista de dispositivos, grafico de series temporais e alertas
export default function Dashboard() {
  // estado principal
  const [devices, setDevices] = useState<Device[]>([])
  const [espId, setEspId] = useState<string>("")
  const [readings, setReadings] = useState<Reading[]>([])
  const [error, setError] = useState<string>("")
  const [loading, setLoading] = useState<boolean>(true)
  const [alerts, setAlerts] = useState<{ ts: number; kind: "normal" | "alerta" | "critico"; text: string }[]>([])
  const [metricKey, setMetricKey] = useState<string>("")

  // mapa de presenca
  const [statusMap, setStatusMap] = useState<Record<string, { lastTs: number; online: boolean }>>({})

  // refs de controle
  const prevStatusRef = useRef<Record<string, "normal" | "alerta" | "critico">>({})
  const prevValueRef = useRef<Record<string, any>>({})
  const lastStampRef = useRef<number>(0)

  // carregar dispositivos
  useEffect(() => {
    let alive = true
    const run = async () => {
      setLoading(true)
      setError("")
      try {
        const r = await fetch(`${API_URL}/api/devices`)
        if (!r.ok) throw new Error(`falha ao carregar dispositivos: ${r.status}`)
        const data = (await r.json()) as Device[]
        if (!alive) return
        setDevices(Array.isArray(data) ? data : [])
        if (!espId && Array.isArray(data) && data.length) setEspId(data[0].espId)
      } catch (e: any) {
        if (alive) setError(e?.message || "erro ao carregar dispositivos")
      } finally {
        if (alive) setLoading(false)
      }
    }
    run()
    return () => {
      alive = false
    }
  }, [])

  // polling de leituras do dispositivo selecionado
  useEffect(() => {
    if (!espId) return
    let alive = true
    const pull = async () => {
      try {
        const r = await fetch(`${API_URL}/api/readings/${encodeURIComponent(espId)}`)
        if (!r.ok) throw new Error(`falha ao carregar leituras: ${r.status}`)
        const data = (await r.json()) as Reading[]
        if (!alive) return
        setReadings(Array.isArray(data) ? data.reverse() : [])
      } catch (e: any) {
        if (alive) setError(e?.message || "erro ao carregar leituras")
      }
    }
    pull()
    const timer = setInterval(pull, 3000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [espId])

  // sondar ultimo visto de cada device
  useEffect(() => {
    let cancelled = false
    const checkAll = async () => {
      try {
        const entries = await Promise.all(
          (devices || []).map(async (d) => {
            try {
              const rr = await fetch(`${API_URL}/api/readings/${encodeURIComponent(d.espId)}`)
              if (!rr.ok) return [d.espId, null] as const
              const arr = (await rr.json()) as Reading[]
              const first = Array.isArray(arr) && arr.length ? arr[0] : null
              const ts = first ? pickTimestamp(first, 0) : 0
              const online = !!(ts && Date.now() - ts < 60_000)
              return [d.espId, { lastTs: ts, online }] as const
            } catch {
              return [d.espId, null] as const
            }
          })
        )
        if (!cancelled) {
          const map: Record<string, { lastTs: number; online: boolean }> = {}
          for (const [k, v] of entries) {
            if (v) map[k] = v
          }
          setStatusMap(map)
        }
      } catch {}
    }
    if (devices.length) checkAll()
    return () => {
      cancelled = true
    }
  }, [devices])

  // dispositivo selecionado
  const device = useMemo(() => devices.find((d) => d.espId === espId), [devices, espId])

  // snapshot do ultimo registro
  const snapshot = useMemo(() => {
    const comp = device?.components || []
    const last = Array.isArray(readings) && readings.length ? readings[readings.length - 1] : null
    const t = last ? pickTimestamp(last, readings.length - 1) : 0
    const byKey: Record<
      string,
      {
        raw: any
        num: number
        unidade: string
        status: "normal" | "alerta" | "critico"
        min?: number
        max?: number
        pin?: number
        interval?: number
        type?: string
      }
    > = {}

    if (last) {
      for (const c of comp) {
        const baseKey = c.label || c.name || c.model || c.type || `comp_${c.pin}`
        const found = resolveRawForComponent(last, c)
        if (found.kind === "object" && found.value && typeof found.value === "object") {
          for (const [subk, subv] of Object.entries(found.value)) {
            const subName = `${baseKey}.${subk}`
            const num = toNum(subv)
            byKey[subName] = {
              raw: subv,
              num: Number.isFinite(num) ? (num as number) : NaN,
              unidade: c.unit || "",
              status: statusFrom(subv, c?.config?.min, c?.config?.max),
              min: c?.config?.min,
              max: c?.config?.max,
              pin: c.pin,
              interval: c.interval,
              type: c.type,
            }
          }
        } else {
          const raw = found.value
          const num = toNum(raw)
          byKey[baseKey] = {
            raw,
            num: Number.isFinite(num) ? (num as number) : NaN,
            unidade: c.unit || "",
            status: statusFrom(raw, c?.config?.min, c?.config?.max),
            min: c?.config?.min,
            max: c?.config?.max,
            pin: c.pin,
            interval: c.interval,
            type: c.type,
          }
        }
      }
    }

    return { time: t, byKey }
  }, [device, readings])

  // alertas basicos
  useEffect(() => {
    if (!snapshot?.time) return
    if (snapshot.time === lastStampRef.current) return
    lastStampRef.current = snapshot.time

    const now = snapshot.time
    const updates: { ts: number; kind: "normal" | "alerta" | "critico"; text: string }[] = []
    const prevSt = prevStatusRef.current
    const prevVal = prevValueRef.current
    const keys = Object.keys(snapshot.byKey)

    for (const k of keys) {
      const cur = snapshot.byKey[k]
      const p = prevSt[k]
      const pv = prevVal[k]

      if (p === undefined) {
        prevSt[k] = cur.status
      } else if (p !== cur.status) {
        if ((p === "alerta" || p === "critico") && cur.status === "normal") {
          updates.push({ ts: now, kind: "normal", text: `${k} voltou ao normal (${fmtRaw(k, cur.raw, cur.unidade)})` })
        } else if (p === "normal" && (cur.status === "alerta" || cur.status === "critico")) {
          updates.push({ ts: now, kind: cur.status, text: `${k} fora do limite (${fmtRaw(k, cur.raw, cur.unidade)})` })
        }
        prevSt[k] = cur.status
      }

      if (pv === undefined) {
        prevVal[k] = cur.raw
      } else if (pv !== cur.raw && !Number.isFinite(toNum(pv)) && !Number.isFinite(cur.num)) {
        updates.push({ ts: now, kind: "normal", text: `${k} mudou para ${fmtRaw(k, cur.raw, cur.unidade)}` })
        prevVal[k] = cur.raw
      } else {
        prevVal[k] = cur.raw
      }
    }

    if (updates.length) {
      setAlerts((old) => {
        const next = [...updates.reverse(), ...old].slice(0, 30)
        return next
      })
    }
  }, [snapshot])

  // chaves numericas para grafico
  const metricKeys = useMemo(() => {
    const byKey = snapshot.byKey || {}
    return Object.keys(byKey).filter((k) => Number.isFinite(byKey[k]?.num))
  }, [snapshot])

  // selecionar metrica padrao
  useEffect(() => {
    if (!metricKey && metricKeys.length) setMetricKey(metricKeys[0])
    if (metricKey && !metricKeys.includes(metricKey)) setMetricKey(metricKeys[0] || "")
  }, [metricKeys, metricKey])

  // dados para recharts
  const chartSeries = useMemo(() => {
    if (!metricKey || !device) return { data: [] as { t: string; value: number }[], unit: "" }
    const unit = snapshot.byKey?.[metricKey]?.unidade || ""
    const parts = metricKey.split(".")
    const base = parts[0]
    const sub = parts[1]

    const data = (Array.isArray(readings) ? readings : [])
      .map((row, idx) => {
        const tms = pickTimestamp(row, idx)
        let raw: any
        const comp = device.components.find((c) => (c.label || c.name || c.model || c.type) === base)
        if (comp) {
          const found = resolveRawForComponent(row, comp)
          raw = found.kind === "object" && sub && found.value && typeof found.value === "object" ? found.value[sub] : found.value
        }
        const v = toNum(raw)
        return { t: fmtTime(tms), value: Number.isFinite(v) ? (v as number) : NaN }
      })
      .filter((d) => Number.isFinite(d.value))
      .slice(-200)

    return { data, unit }
  }, [metricKey, device, readings, snapshot])

  // estatisticas
  const stats = useMemo(() => {
    const devicesActive = Object.values(statusMap).filter((v) => v?.online).length
    const totalDevices = devices.length
    const totalSensors = devices.reduce((acc, d) => acc + (d.components?.length || 0), 0)
    const activeAlerts = alerts.filter((a) => a.kind !== "normal").length
    const processed = readings.length
    return [
      { title: "Dispositivos Ativos", value: `${devicesActive}/${totalDevices}`, icon: Wifi, trend: "+0%" },
      { title: "Sensores Registrados", value: `${totalSensors}`, icon: Activity, trend: "+0%" },
      { title: "Alertas Ativos", value: `${activeAlerts}`, icon: Bell, trend: activeAlerts ? "+100%" : "+0%" },
      { title: "Dados Processados", value: `${processed}`, icon: Database, trend: "+0%" },
    ]
  }, [statusMap, devices, alerts, readings])

  return (
    <div className="min-h-screen bg-background">
      {/* hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 gradient-tech opacity-50" />
        <div className="container relative mx-auto px-4 py-16 md:py-24">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="mb-6 text-4xl font-bold md:text-6xl lg:text-7xl">
              Plataforma de <br />
             <span className="bg-gradient-to-r from-sky-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent animate-gradient-x font-semibold">
  Aplicações IoT
</span>


            </h1>
            <p className="mb-8 text-lg text-muted-foreground md:text-xl">
              Gerencie dispositivos, processe dados e visualize informações em tempo real. 
            </p>
          </div>
        </div>
      </section>

      {/* stats */}
      <section className="container mx-auto px-4 py-12">
        {!!error && <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">erro: {error}</div>}
        {loading && <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 p-3 text-primary">carregando...</div>}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <Card key={index} className="relative overflow-hidden border-border/50 bg-card/50 backdrop-blur">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <stat.icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="flex items-center text-xs text-emerald-600">
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* controles */}
      <section className="container mx-auto px-4">
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Dispositivo</label>
            <select
              className="h-10 min-w-[220px] rounded-md border border-border bg-background px-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
              value={espId}
              onChange={(e) => setEspId(e.target.value)}
            >
              <option value="" disabled>
                Selecione
              </option>
              {devices.map((d) => (
                <option key={d.espId} value={d.espId}>
                  {d.name} — {d.espId}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Métrica</label>
            <select
              className="h-10 min-w-[220px] rounded-md border border-border bg-background px-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
              value={metricKey}
              onChange={(e) => setMetricKey(e.target.value)}
            >
              {metricKeys.length ? metricKeys.map((k) => <option key={k}>{k}</option>) : <option>Sem métricas</option>}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Gauge className="h-4 w-4" />
            {snapshot?.time ? `Última leitura: ${fmtTime(snapshot.time)}` : "Aguardando leituras"}
          </div>
        </div>
      </section>

      {/* dispositivos */}
      <section className="container mx-auto px-4 py-12">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Dispositivos Conectados</h2>
            <p className="text-muted-foreground">Monitore todos os seus dispositivos ESP32 em tempo real</p>
          </div>
          <Button variant="outline">Adicionar Dispositivo</Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => {
            const st = statusMap[d.espId]
            const isOnline = !!st?.online
            const lastUpdate = st?.lastTs ? `${fmtTime(st.lastTs)}` : "—"
            return (
              <Card key={d.espId} className="group relative overflow-hidden border-border/50 bg-card/50 backdrop-blur transition-all hover:border-primary/50">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <CardHeader className="relative pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-lg p-2 ${isOnline ? "bg-emerald-500/10" : "bg-muted"}`}>
                        {isOnline ? <Wifi className="h-5 w-5 text-emerald-600" /> : <WifiOff className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <div>
                        <h3 className="font-semibold">{d.name}</h3>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {d.espId}
                        </div>
                      </div>
                    </div>
                    <Badge variant={isOnline ? "default" : "secondary"} className={isOnline ? "bg-emerald-500" : ""}>
                      {isOnline ? "Online" : "Offline"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="relative space-y-4">
                  <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Componentes</span>
                    </div>
                    <span className="text-xl font-bold">{d.components?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Última atualização: {lastUpdate}
                    </div>
                  </div>
                  <Button variant="outline" className="w-full" size="sm" onClick={() => setEspId(d.espId)}>
                    Ver no Gráfico
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* grafico e alertas */}
      <section className="container mx-auto grid gap-6 px-4 pb-16 lg:grid-cols-2">
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle>Monitoramento — {metricKey || "Métrica"}</CardTitle>
            <CardDescription>Série temporal do dispositivo selecionado</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <RLineChart data={chartSeries.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="t" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))" }} isAnimationActive={false} />
              </RLineChart>
            </ResponsiveContainer>
            {chartSeries.unit && <div className="mt-2 text-right text-xs text-muted-foreground">Unidade: {chartSeries.unit}</div>}
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle>Alertas</CardTitle>
            <CardDescription>Eventos recentes do dispositivo</CardDescription>
          </CardHeader>
          <CardContent>
            {alerts.length ? (
              <ul className="flex flex-col gap-2">
                {alerts.map((a, i) => (
                  <li
                    key={i}
                    className={`grid grid-cols-[auto_1fr] items-center gap-3 rounded-lg border p-3 text-sm ${
                      a.kind === "critico" ? "border-red-200 bg-red-50" : a.kind === "alerta" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"
                    }`}
                  >
                    <span className="w-5 text-center">{a.kind === "critico" ? "🔴" : a.kind === "alerta" ? "🟠" : "🟢"}</span>
                    <span className="text-foreground">{a.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">Nenhum alerta ativo</div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* componentes do dispositivo selecionado */}
      <section className="container mx-auto px-4 pb-20">
        <div className="mb-6">
          <h2 className="text-3xl font-bold">Componentes</h2>
          <p className="text-muted-foreground">Valores atuais do dispositivo selecionado</p>
        </div>
        {device?.components?.length ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {device.components.map((c) => {
              const baseKey = c.label || c.name || c.model || c.type || `comp_${c.pin}`
              const info = snapshot.byKey?.[baseKey as string]
              const st: "normal" | "alerta" | "critico" = (info?.status as any) || "normal"
              return (
                <Card key={baseKey as string} className="border-border/50 bg-card/50 backdrop-blur">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base font-semibold">{baseKey}</CardTitle>
                    <Badge className={st === "critico" ? "bg-red-500" : st === "alerta" ? "bg-amber-500" : "bg-emerald-500"}>{st.toUpperCase()}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
                      <div className="flex items-center gap-2">
                        <Thermometer className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Valor</span>
                      </div>
                      <span className="text-xl font-bold">{info ? fmtRaw(baseKey as string, info.raw, info.unidade) : "-"}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {c.interval ? `${Math.round((c.interval || 0) / 1000)}s` : "—"}
                      </span>
                      <span className="inline-flex items-center gap-1">pino {c.pin}</span>
                      {Number.isFinite(info?.min) && <span>min {fmtNum(info!.min as number)}</span>}
                      {Number.isFinite(info?.max) && <span>max {fmtNum(info!.max as number)}</span>}
                    </div>

                    {/* submetricas */}
                    <div className="grid grid-cols-2 gap-2">
                      {Object.keys(snapshot.byKey || {})
                        .filter((k) => k.startsWith(`${baseKey}.`))
                        .sort()
                        .map((subK) => {
                          const si = snapshot.byKey[subK]
                          const sst = si?.status || "normal"
                          return (
                            <div key={subK} className="rounded-lg border bg-muted/10 p-3">
                              <div className="mb-1 flex items-center justify-between">
                                <div className="text-xs text-muted-foreground">{subK.split(".").slice(-1)[0]}</div>
                                <span className="text-sm">{sst === "critico" ? "🔴" : sst === "alerta" ? "🟠" : "🟢"}</span>
                              </div>
                              <div className="text-base font-semibold">{fmtRaw(subK, si?.raw, si?.unidade)}</div>
                            </div>
                          )
                        })}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">Selecione um dispositivo para ver os dados</div>
        )}
      </section>
    </div>
  )
}