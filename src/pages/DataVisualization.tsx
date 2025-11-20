import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LineChart as RLine, Line, BarChart as RBar, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

import { API_URL } from "@/lib/api"
import { useDeviceRegistry } from "@/lib/device-registry"
import {
  flattenFirstRoot,
  formatClock,
  normalizeKey,
  numericValue,
  pickTimestamp,
  type Reading,
} from "@/lib/readings-utils"

const findTempHumKeys = (row?: Reading) => {
  if (!row) return { tempKey: "", humKey: "" }
  const flat = flattenFirstRoot(row)
  const entries = Object.entries(flat)
  let tempKey = ""
  let humKey = ""

  for (const [key] of entries) {
    const leaf = key.split(".").slice(-1)[0] ?? key
    const normalized = normalizeKey(leaf)
    if (!tempKey && /(temp|temperatura|ds18|dht|bme|bmp)/i.test(key) && !/hum|umid/i.test(key)) tempKey = key
    if (!humKey && /(hum|umid)/i.test(key)) humKey = key
    if (!tempKey && /(temp|temperatura)/i.test(normalized)) tempKey = key
    if (!humKey && /(hum|umid)/i.test(normalized)) humKey = key
    if (tempKey && humKey) break
  }

  const numericEntries = entries.filter(([, value]) => Number.isFinite(numericValue(value)))
  if (!tempKey && numericEntries[0]) tempKey = numericEntries[0][0]
  if (!humKey && numericEntries.length > 1) {
    const second = numericEntries.find(([key]) => key !== tempKey)
    if (second) humKey = second[0]
  }

  return { tempKey, humKey }
}

type DeviceStatus = {
  online: boolean
  lastTs: number
}

const formatLastSeen = (timestamp: number) => {
  if (!timestamp) return "sem leituras"
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(timestamp))
  } catch (err) {
    console.warn("Intl formatter falhou", err)
    return new Date(timestamp).toLocaleString()
  }
}

export default function DataVisualization() {
  const { devices } = useDeviceRegistry()
  const [selected, setSelected] = useState<string>("")
  const [period, setPeriod] = useState<"1h" | "24h" | "7d" | "30d">("24h")
  const [readings, setReadings] = useState<Reading[]>([])
  const [loadingReadings, setLoadingReadings] = useState(false)
  const [error, setError] = useState("")
  const [statusMap, setStatusMap] = useState<Record<string, DeviceStatus>>({})
  const [loadingStatus, setLoadingStatus] = useState(false)

  const [compData, setCompData] = useState<{ device: string; temperatura?: number; umidade?: number }[]>([])
  const compLoadRef = useRef(0)

  useEffect(() => {
    if (!devices.length) {
      setSelected("")
      setReadings([])
      return
    }
    setSelected((prev) => {
      if (prev && devices.some((device) => device.espId === prev)) return prev
      return devices[0].espId
    })
  }, [devices])

  const refreshStatus = useCallback(async () => {
    if (!devices.length) {
      setStatusMap({})
      return
    }
    setLoadingStatus(true)
    try {
      const now = Date.now()
      const entries = await Promise.all(
        devices.map(async (device) => {
          try {
            const response = await fetch(`${API_URL}/api/readings/${encodeURIComponent(device.espId)}/latest`)
            if (!response.ok) return [device.espId, { online: false, lastTs: 0 }] as const
            const payload = (await response.json()) as Reading | undefined
            const ts = payload ? pickTimestamp(payload, 0) : 0
            const online = !!(ts && now - ts < 60_000)
            return [device.espId, { online, lastTs: ts }] as const
          } catch (err) {
            console.warn("falha ao consultar status", err)
            return [device.espId, { online: false, lastTs: 0 }] as const
          }
        })
      )
      const next: Record<string, DeviceStatus> = {}
      for (const [espId, data] of entries) next[espId] = data
      setStatusMap(next)
    } finally {
      setLoadingStatus(false)
    }
  }, [devices])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (!selected) {
      setReadings([])
      return
    }
    let cancelled = false
    const load = async () => {
      setLoadingReadings(true)
      setError("")
      try {
        const response = await fetch(`${API_URL}/api/readings/${encodeURIComponent(selected)}`)
        if (!response.ok) throw new Error(`falha ao buscar leituras: ${response.status}`)
        const payload = (await response.json()) as Reading[]
        if (!cancelled) setReadings(Array.isArray(payload) ? payload.reverse() : [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "erro ao buscar leituras")
      } finally {
        if (!cancelled) setLoadingReadings(false)
      }
    }
    load()
    const timer = setInterval(load, 3000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [selected])

  useEffect(() => {
    let alive = true
    const run = async () => {
      const now = Date.now()
      if (now - compLoadRef.current < 1500) return
      compLoadRef.current = now
      try {
        const results = await Promise.all(
          devices.map(async (device) => {
            try {
              const response = await fetch(`${API_URL}/api/readings/${encodeURIComponent(device.espId)}`)
              if (!response.ok) return { device: device.name || device.espId, temperatura: undefined, umidade: undefined }
              const payload = (await response.json()) as Reading[]
              const last = Array.isArray(payload) && payload.length ? payload[payload.length - 1] : undefined
              const { tempKey, humKey } = findTempHumKeys(last)
              const flat = last ? flattenFirstRoot(last) : {}
              const temp = tempKey ? numericValue(flat[tempKey]) : Number.NaN
              const hum = humKey ? numericValue(flat[humKey]) : Number.NaN
              return {
                device: device.name || device.espId,
                temperatura: Number.isFinite(temp) ? (temp as number) : undefined,
                umidade: Number.isFinite(hum) ? (hum as number) : undefined,
              }
            } catch (err) {
              console.warn("falha ao montar comparativo", err)
              return { device: device.name || device.espId, temperatura: undefined, umidade: undefined }
            }
          })
        )
        if (alive) setCompData(results)
      } catch (err) {
        console.warn("falha geral no comparativo", err)
      }
    }
    if (devices.length) run()
    const timer = setInterval(run, 10_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [devices])

  const totalSensors = useMemo(
    () => devices.reduce((acc, device) => acc + (device.components?.length || 0), 0),
    [devices]
  )

  const filteredReadings = useMemo(() => {
    if (!readings.length) return [] as Reading[]
    const now = Date.now()
    const span =
      period === "1h"
        ? 3600_000
        : period === "24h"
          ? 24 * 3600_000
          : period === "7d"
            ? 7 * 24 * 3600_000
            : 30 * 24 * 3600_000
    return readings.filter((row, index) => {
      const fallback = now - (readings.length - index) * 1000
      const ts = pickTimestamp(row, fallback)
      return ts && now - ts <= span
    })
  }, [readings, period])

  const keys = useMemo(() => {
    const last = filteredReadings.length ? filteredReadings[filteredReadings.length - 1] : readings[readings.length - 1]
    return findTempHumKeys(last)
  }, [filteredReadings, readings])

  const temporalSeries = useMemo(() => {
    const source = filteredReadings.length ? filteredReadings : readings
    return source.map((row, index) => {
      const fallback = Date.now() - (source.length - index) * 1000
      const ts = pickTimestamp(row, fallback)
      const flat = flattenFirstRoot(row)
      const temp = keys.tempKey ? numericValue(flat[keys.tempKey]) : Number.NaN
      const hum = keys.humKey ? numericValue(flat[keys.humKey]) : Number.NaN
      return {
        time: formatClock(ts),
        temperatura: Number.isFinite(temp) ? (temp as number) : undefined,
        umidade: Number.isFinite(hum) ? (hum as number) : undefined,
      }
    })
  }, [filteredReadings, readings, keys])

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
            <Select value={period} onValueChange={(value) => setPeriod(value as typeof period)}>
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

            <Select value={selected} onValueChange={(value) => setSelected(value)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Dispositivo" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((device) => (
                  <SelectItem key={device.espId} value={device.espId}>
                    {device.name}  {device.espId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!!error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">erro: {error}</div>
        )}
        {loadingReadings && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-primary">carregando leituras...</div>
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
                <RBar data={compData.length ? compData : devices.map((device) => ({ device: device.name || device.espId }))}>
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
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Monitoramento em Tempo Real</h3>
                <button
                  type="button"
                  className="text-sm text-primary"
                  onClick={() => refreshStatus()}
                  disabled={loadingStatus}
                >
                  {loadingStatus ? "Atualizando..." : "Atualizar status"}
                </button>
              </div>
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                {devices.map((device) => {
                  const status = statusMap[device.espId]
                  const online = !!status?.online
                  const last = status?.lastTs ? formatLastSeen(status.lastTs) : ""
                  return (
                    <div
                      key={device.espId}
                      className={`rounded-lg border p-4 ${online ? "border-primary/20 bg-gradient-to-br from-primary/5 to-transparent" : "border-border/50 bg-muted/30"
                        }`}
                    >
                      <p className="text-sm text-muted-foreground">{device.name || device.espId}</p>
                      <p className={`mt-2 text-3xl font-bold ${online ? "" : "text-muted-foreground"}`}>
                        {online ? "online" : "offline"}
                      </p>
                      <p className={`mt-1 text-sm ${online ? "text-accent" : "text-destructive"}`}>
                        {online ? `Último: ${last}` : "sem atividade recente"}
                      </p>
                    </div>
                  )
                })}
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-sm text-muted-foreground">Dispositivos cadastrados</div>
              <div className="text-3xl font-semibold">{devices.length}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Sensores/atuadores</div>
              <div className="text-3xl font-semibold">{totalSensors}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Dispositivos online</div>
              <div className="text-3xl font-semibold">
                {devices.reduce((acc, device) => (statusMap[device.espId]?.online ? acc + 1 : acc), 0)}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
