import React, { useEffect, useMemo, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LineChart as RLine, Line, BarChart as RBar, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

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

/* utils simples */

// normaliza chave
const norm = (s: any) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")

// timestamp numerico
const pickTimestamp = (obj: any, idx = 0) => {
  if (!obj || typeof obj !== "object") return 0
  const cands = [obj.timestamp, obj.ts, obj.time, obj.createdAt, obj.created_at, obj.date]
  for (const v of cands) {
    const t = typeof v === "string" ? Date.parse(v) : typeof v === "number" ? v : undefined
    if (Number.isFinite(t as number)) return t as number
  }
  return 0
}

// achata objeto
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

// raizes candidatas
const getRoots = (row: Reading) => [row?.data, row?.payload, row?.values, row?.readings, row?.medidas, row].filter(Boolean)

// extrai mapa flat do payload
const getFlat = (row: Reading) => {
  const roots = getRoots(row)
  const deep = roots[0] && typeof roots[0] === "object" ? (roots[0] as object) : {}
  return flattenAll(deep)
}

// tenta encontrar chaves de temperatura e umidade
const findTempHumKeys = (row?: Reading) => {
  if (!row) return { tempKey: "", humKey: "" }
  const flat = getFlat(row)
  const entries = Object.entries(flat)
  let tempKey = ""
  let humKey = ""

  for (const [k] of entries) {
    const nk = norm(k.split(".").slice(-1)[0])
    if (!tempKey && /(temp|temperatura|ds18|dht|bme|bmp)/i.test(k) && !/hum|umid/i.test(k)) tempKey = k
    if (!humKey && /(hum|umid)/i.test(k)) humKey = k
  }

  // fallback: escolhe primeiras chaves numericas distintas
  const nums = entries.filter(([, v]) => {
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n)
  })
  if (!tempKey && nums[0]) tempKey = nums[0][0]
  if (!humKey && nums[1]) humKey = nums.find(([k]) => k !== tempKey)?.[0] || humKey

  return { tempKey, humKey }
}

// pega valor numerico seguro
const toNum = (v: any) => {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return NaN
}

// formata hora curta
const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export default function DataVisualization() {
  // estado base
  const [devices, setDevices] = useState<Device[]>([])
  const [selected, setSelected] = useState<string>("")
  const [period, setPeriod] = useState<"1h" | "24h" | "7d" | "30d">("24h")

  // leituras do device selecionado
  const [readings, setReadings] = useState<Reading[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>("")

  // status por device
  const [statusMap, setStatusMap] = useState<Record<string, { online: boolean; lastTs: number }>>({})

  // carrega devices
  useEffect(() => {
    let alive = true
    const run = async () => {
      setLoading(true)
      setError("")
      try {
        const r = await fetch(`${API_URL}/api/devices`)
        if (!r.ok) throw new Error(`falha ao listar: ${r.status}`)
        const data = (await r.json()) as Device[]
        if (!alive) return
        setDevices(Array.isArray(data) ? data : [])
        if (!selected && data?.length) setSelected(data[0].espId)
      } catch (e: any) {
        if (alive) setError(e?.message || "erro ao listar")
      } finally {
        if (alive) setLoading(false)
      }
    }
    run()
    return () => {
      alive = false
    }
  }, [])

  // polling das leituras do selecionado
  useEffect(() => {
    if (!selected) return
    let alive = true
    const pull = async () => {
      try {
        const r = await fetch(`${API_URL}/api/readings/${encodeURIComponent(selected)}`)
        if (!r.ok) throw new Error(`falha ao buscar: ${r.status}`)
        const data = (await r.json()) as Reading[]
        if (!alive) return
        setReadings(Array.isArray(data) ? data.reverse() : [])
      } catch (e: any) {
        if (alive) setError(e?.message || "erro ao buscar leituras")
      }
    }
    pull()
    const t = setInterval(pull, 3000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [selected])

  // sondagem do status de todos os dispositivos
  useEffect(() => {
    let cancelled = false
    const probe = async () => {
      try {
        const entries = await Promise.all(
          (devices || []).map(async (d) => {
            try {
              const r = await fetch(`${API_URL}/api/readings/${encodeURIComponent(d.espId)}`)
              if (!r.ok) return [d.espId, { online: false, lastTs: 0 }] as const
              const arr = (await r.json()) as Reading[]
              const last = arr?.[0]
              const ts = last ? pickTimestamp(last) : 0
              const online = !!(ts && Date.now() - ts < 60_000)
              return [d.espId, { online, lastTs: ts }] as const
            } catch {
              return [d.espId, { online: false, lastTs: 0 }] as const
            }
          })
        )
        if (!cancelled) {
          const map: Record<string, { online: boolean; lastTs: number }> = {}
          for (const [k, v] of entries) map[k] = v
          setStatusMap(map)
        }
      } catch {
        /* ignora erro */
      }
    }
    if (devices.length) {
      probe()
      const t = setInterval(probe, 10000)
      return () => clearInterval(t)
    }
  }, [devices])

  // device selecionado
  const current = useMemo(() => devices.find((d) => d.espId === selected), [devices, selected])

  // filtro por periodo
  const filtered = useMemo(() => {
    if (!readings?.length) return []
    const now = Date.now()
    const span =
      period === "1h" ? 1 * 3600_000 : period === "24h" ? 24 * 3600_000 : period === "7d" ? 7 * 24 * 3600_000 : 30 * 24 * 3600_000
    return readings.filter((r, i) => {
      const ts = pickTimestamp(r, i)
      return ts && now - ts <= span
    })
  }, [readings, period])

  // detecta chaves de temperatura e umidade
  const keys = useMemo(() => {
    const last = filtered.length ? filtered[filtered.length - 1] : readings[readings.length - 1]
    return findTempHumKeys(last)
  }, [filtered, readings])

  // dados para graficos temporais
  const temporalSeries = useMemo(() => {
    const arr = filtered.length ? filtered : readings
    const data = arr.map((row, i) => {
      const ts = pickTimestamp(row, i)
      const flat = getFlat(row)
      const temp = toNum(flat[keys.tempKey])
      const hum = toNum(flat[keys.humKey])
      return {
        time: hhmm(ts || 0),
        temperatura: Number.isFinite(temp) ? temp : undefined,
        umidade: Number.isFinite(hum) ? hum : undefined,
      }
    })
    return data
  }, [filtered, readings, keys])

  // dados comparativos entre devices
  const comparison = useMemo(() => {
    return devices.map((d) => {
      const st = statusMap[d.espId]
      const lastTs = st?.lastTs || 0
      const label = d.name || d.espId
      return { device: label, ts: lastTs }
    })
  }, [devices, statusMap])

  // metricas do comparativo para temp/hum por device
  const comparisonWithMetrics = useMemo(() => {
    return Promise.all(
      devices.map(async (d) => {
        try {
          const r = await fetch(`${API_URL}/api/readings/${encodeURIComponent(d.espId)}`)
          if (!r.ok) return { device: d.name || d.espId, temperatura: undefined, umidade: undefined }
          const arr = (await r.json()) as Reading[]
          const last = arr?.[arr.length - 1]
          const { tempKey, humKey } = findTempHumKeys(last)
          const flat = last ? getFlat(last) : {}
          const t = toNum(flat[tempKey])
          const h = toNum(flat[humKey])
          return {
            device: d.name || d.espId,
            temperatura: Number.isFinite(t) ? t : undefined,
            umidade: Number.isFinite(h) ? h : undefined,
          }
        } catch {
          return { device: d.name || d.espId, temperatura: undefined, umidade: undefined }
        }
      })
    )
    // nota: promise resolvida no efeito abaixo
  }, [devices]) as unknown as { device: string; temperatura?: number; umidade?: number }[]

  // cache local dos dados comparativos
  const [compData, setCompData] = useState<{ device: string; temperatura?: number; umidade?: number }[]>([])
  const compLoadRef = useRef(0)
  useEffect(() => {
    let alive = true
    ;(async () => {
      // impede excesso de disparos
      const now = Date.now()
      if (now - compLoadRef.current < 1500) return
      compLoadRef.current = now
      try {
        const out = (await Promise.all(
          devices.map(async (d) => {
            try {
              const r = await fetch(`${API_URL}/api/readings/${encodeURIComponent(d.espId)}`)
              if (!r.ok) return { device: d.name || d.espId, temperatura: undefined, umidade: undefined }
              const arr = (await r.json()) as Reading[]
              const last = arr?.[arr.length - 1]
              const { tempKey, humKey } = findTempHumKeys(last)
              const flat = last ? getFlat(last) : {}
              const t = toNum(flat[tempKey])
              const h = toNum(flat[humKey])
              return {
                device: d.name || d.espId,
                temperatura: Number.isFinite(t) ? t : undefined,
                umidade: Number.isFinite(h) ? h : undefined,
              }
            } catch {
              return { device: d.name || d.espId, temperatura: undefined, umidade: undefined }
            }
          })
        )) as { device: string; temperatura?: number; umidade?: number }[]
        if (alive) setCompData(out)
      } catch {
        /* ignora */
      }
    })()
    return () => {
      alive = false
    }
  }, [devices])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-4xl font-bold text-transparent">
              Dados e Visualização
            </h1>
            <p className="mt-2 text-muted-foreground">Análise detalhada dos dados dos sensores</p>
          </div>
          <div className="flex gap-2">
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

            <Select value={selected} onValueChange={(v) => setSelected(v)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Dispositivo" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d) => (
                  <SelectItem key={d.espId} value={d.espId}>
                    {d.name} — {d.espId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!!error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">erro: {error}</div>
        )}
        {loading && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-primary">carregando...</div>
        )}

        <Tabs defaultValue="temporal" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="temporal">Temporal</TabsTrigger>
            <TabsTrigger value="comparison">Comparativo</TabsTrigger>
            <TabsTrigger value="realtime">Tempo Real</TabsTrigger>
          </TabsList>

          <TabsContent value="temporal" className="space-y-4">
            <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
              <h3 className="mb-4 text-lg font-semibold">
                Temperatura ao Longo do Tempo {keys.tempKey ? `(${keys.tempKey})` : ""}
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <RLine data={temporalSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" stroke="hsl(var(--foreground))" />
                  <YAxis stroke="hsl(var(--foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="temperatura"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))" }}
                    isAnimationActive={false}
                    connectNulls
                  />
                </RLine>
              </ResponsiveContainer>
            </Card>

            <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
              <h3 className="mb-4 text-lg font-semibold">
                Umidade ao Longo do Tempo {keys.humKey ? `(${keys.humKey})` : ""}
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <RLine data={temporalSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" stroke="hsl(var(--foreground))" />
                  <YAxis stroke="hsl(var(--foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="umidade"
                    stroke="hsl(var(--accent))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--accent))" }}
                    isAnimationActive={false}
                    connectNulls
                  />
                </RLine>
              </ResponsiveContainer>
            </Card>
          </TabsContent>

          <TabsContent value="comparison" className="space-y-4">
            <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
              <h3 className="mb-4 text-lg font-semibold">Comparação entre Dispositivos</h3>
              <ResponsiveContainer width="100%" height={400}>
                <RBar data={compData.length ? compData : devices.map((d) => ({ device: d.name || d.espId }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="device" stroke="hsl(var(--foreground))" />
                  <YAxis stroke="hsl(var(--foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="temperatura" fill="hsl(var(--primary))" />
                  <Bar dataKey="umidade" fill="hsl(var(--accent))" />
                </RBar>
              </ResponsiveContainer>
            </Card>
          </TabsContent>

          <TabsContent value="realtime" className="space-y-4">
            <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
              <h3 className="mb-4 text-lg font-semibold">Monitoramento em Tempo Real</h3>
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                {devices.map((d) => {
                  const st = statusMap[d.espId]
                  const online = !!st?.online
                  const ts = st?.lastTs || 0
                  const last = ts ? new Date(ts).toLocaleTimeString() : "—"
                  return (
                    <div
                      key={d.espId}
                      className={`rounded-lg border p-4 ${
                        online
                          ? "border-primary/20 bg-gradient-to-br from-primary/5 to-transparent"
                          : "border-border/50 bg-muted/30"
                      }`}
                    >
                      <p className="text-sm text-muted-foreground">{d.name || d.espId}</p>
                      <p className={`mt-2 text-3xl font-bold ${online ? "" : "text-muted-foreground"}`}>
                        {online ? "online" : "--"}
                      </p>
                      <p className={`mt-1 text-sm ${online ? "text-accent" : "text-destructive"}`}>
                        {online ? `ultimo: ${last}` : "offline"}
                      </p>
                    </div>
                  )
                })}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}