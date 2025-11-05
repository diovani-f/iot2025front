import React, { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Power, Settings, Wifi, WifiOff, X } from "lucide-react"

const API_URL = import.meta.env?.VITE_API_URL || "https://iot2025back.onrender.com"

// tipos basicos de dispositivo e componente
type CompCfg = {
  name?: string
  model?: string
  type?: "sensor" | "actuator" | string
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
  [k: string]: any
}

// util pra timestamp
const pickTimestamp = (obj: any) => {
  const cands = [obj?.timestamp, obj?.ts, obj?.time, obj?.createdAt, obj?.created_at, obj?.date]
  for (const v of cands) {
    const t = typeof v === "string" ? Date.parse(v) : typeof v === "number" ? v : undefined
    if (Number.isFinite(t as number)) return t as number
  }
  return 0
}

// estado inicial de componente
const novoComponente = (): CompCfg => ({
  name: "",
  model: "",
  type: "sensor",
  pin: 0,
  interval: 1000,
  unit: "",
  label: "",
  config: { min: undefined, max: undefined },
})

// valida campos do device
const validar = (d: Device) => {
  if (!d.name?.trim()) return "nome obrigatorio"
  if (!d.espId?.trim()) return "espId obrigatorio"
  if (!Array.isArray(d.components) || d.components.length === 0) return "adicione ao menos um componente"
  return ""
}

export default function Devices() {
  // lista e status
  const [devices, setDevices] = useState<Device[]>([])
  const [statusMap, setStatusMap] = useState<Record<string, { online: boolean; lastTs: number }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [msg, setMsg] = useState("")

  // formulario
  const [openForm, setOpenForm] = useState(false)
  const [mode, setMode] = useState<"create" | "edit">("create")
  const [originalEspId, setOriginalEspId] = useState<string>("")
  const [form, setForm] = useState<Device>({ name: "", espId: "", components: [novoComponente()] })

  // carrega dispositivos
  const carregar = async () => {
    setLoading(true)
    setError("")
    try {
      const r = await fetch(`${API_URL}/api/devices`)
      if (!r.ok) throw new Error(`falha ao carregar: ${r.status}`)
      const data = (await r.json()) as Device[]
      setDevices(Array.isArray(data) ? data : [])
    } catch (e: any) {
      setError(e?.message || "erro ao carregar")
    } finally {
      setLoading(false)
    }
  }

  // consulta ultimo visto por device
  const sondarStatus = async (list: Device[]) => {
    try {
      const entries = await Promise.all(
        list.map(async (d) => {
          try {
            const rr = await fetch(`${API_URL}/api/readings/${encodeURIComponent(d.espId)}`)
            if (!rr.ok) return [d.espId, { online: false, lastTs: 0 }] as const
            const arr = (await rr.json()) as Reading[]
            const last = Array.isArray(arr) && arr.length ? arr[0] : null
            const ts = last ? pickTimestamp(last) : 0
            const online = !!(ts && Date.now() - ts < 60_000)
            return [d.espId, { online, lastTs: ts }] as const
          } catch {
            return [d.espId, { online: false, lastTs: 0 }] as const
          }
        })
      )
      const map: Record<string, { online: boolean; lastTs: number }> = {}
      for (const [k, v] of entries) map[k] = v
      setStatusMap(map)
    } catch {
      /* ignora erro de status */
    }
  }

  useEffect(() => {
    carregar()
  }, [])
  useEffect(() => {
    if (devices.length) sondarStatus(devices)
  }, [devices])

  // helpers de form
  const setCampo = (k: keyof Device, v: any) => setForm((p) => ({ ...p, [k]: v }))
  const addComp = () => setForm((p) => ({ ...p, components: [...p.components, novoComponente()] }))
  const rmComp = (idx: number) =>
    setForm((p) => ({ ...p, components: p.components.filter((_, i) => i !== idx) }))
  const setCompCampo = (idx: number, k: keyof CompCfg, v: any) =>
    setForm((p) => {
      const next = [...p.components]
      next[idx] = { ...next[idx], [k]: v }
      return { ...p, components: next }
    })
  const setCompCfg = (idx: number, k: "min" | "max", v: any) =>
    setForm((p) => {
      const next = [...p.components]
      next[idx] = { ...next[idx], config: { ...(next[idx].config || {}), [k]: v } }
      return { ...p, components: next }
    })

  // salvar form
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setMsg("")
    const inval = validar(form)
    if (inval) {
      setError(inval)
      return
    }

    const payload: Device = {
      name: form.name.trim(),
      espId: form.espId.trim(),
      components: form.components.map((c) => ({
        name: (c.name || "").trim(),
        model: (c.model || "").trim(),
        type: (c.type as any) || "sensor",
        pin: Number.isFinite(Number(c.pin)) ? Number(c.pin) : 0,
        interval: Number.isFinite(Number(c.interval)) ? Number(c.interval) : 1000,
        unit: (c.unit || "").trim(),
        label: (c.label || "").trim(),
        config: {
          ...(c.config || {}),
          min:
            c.config?.min !== "" && c.config?.min !== undefined ? Number(c.config?.min) : undefined,
          max:
            c.config?.max !== "" && c.config?.max !== undefined ? Number(c.config?.max) : undefined,
        },
      })),
    }

    try {
      let r: Response
      if (mode === "edit" && originalEspId) {
        r = await fetch(`${API_URL}/api/device/${encodeURIComponent(originalEspId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: payload.name, components: payload.components }),
        })
      } else {
        r = await fetch(`${API_URL}/api/configure`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }
      if (!r.ok) throw new Error(`falha ao salvar: ${r.status}`)
      await carregar()
      setMsg("salvo com sucesso")
      setOpenForm(false)
      setMode("create")
      setOriginalEspId("")
      setForm({ name: "", espId: "", components: [novoComponente()] })
      setTimeout(() => setMsg(""), 2000)
    } catch (e: any) {
      setError(e?.message || "erro ao salvar")
    }
  }

  // editar
  const editar = (d: Device) => {
    setMode("edit")
    setOriginalEspId(d.espId)
    setForm({
      name: d.name || "",
      espId: d.espId || "",
      components: (d.components || []).map((c) => ({
        name: c.name || "",
        model: c.model || "",
        type: (c.type as any) || "sensor",
        pin: c.pin ?? 0,
        interval: c.interval ?? 1000,
        unit: c.unit || "",
        label: c.label || "",
        config: { ...(c.config || {}) },
      })),
    })
    setOpenForm(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  // remover
  const remover = async (d: Device) => {
    if (!confirm(`remover dispositivo ${d.name} (${d.espId})?`)) return
    setError("")
    try {
      const r = await fetch(`${API_URL}/api/device/${encodeURIComponent(d.espId)}`, {
        method: "DELETE",
      })
      if (!r.ok) throw new Error(`falha ao remover: ${r.status}`)
      await carregar()
    } catch (e: any) {
      setError(e?.message || "erro ao remover")
    }
  }

  // total de sensores exibido no topo
  const totalSensors = useMemo(
    () => devices.reduce((acc, d) => acc + (d.components?.length || 0), 0),
    [devices]
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto p-6 space-y-6">
        {/* topo com titulo e acoes */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-4xl font-bold text-transparent">
              Dispositivos IoT
            </h1>
            <p className="mt-2 text-muted-foreground">Gerencie todos os dispositivos conectados</p>
          </div>
          <div className="flex gap-2">
            <Button className="gap-2" onClick={() => setOpenForm((v) => !v)}>
              <Plus className="h-4 w-4" />
              {openForm ? "Fechar" : "Adicionar Dispositivo"}
            </Button>
          </div>
        </div>

        {/* alertas de status */}
        {!!error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">
            {error}
          </div>
        )}
        {!!msg && (
          <div className="rounded-lg border border-emerald-300/40 bg-emerald-200/20 p-3 text-emerald-700">
            {msg}
          </div>
        )}

        {/* formulario de cadastro/edicao */}
        {openForm && (
          <Card className="border-border/60 bg-card/60 backdrop-blur">
            <form onSubmit={salvar} className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-muted-foreground">
                    {mode === "edit" ? `Editando ${originalEspId}` : "Novo dispositivo"}
                  </div>
                  <div className="text-xl font-bold">
                    {mode === "edit" ? "Editar dispositivo" : "Cadastrar dispositivo"}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setOpenForm(false)
                    setMode("create")
                    setOriginalEspId("")
                    setForm({ name: "", espId: "", components: [novoComponente()] })
                  }}
                >
                  <X className="h-4 w-4" />
                  Fechar
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Nome</label>
                  <input
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="ex.: esp32 sala"
                    value={form.name}
                    onChange={(e) => setCampo("name", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">espId</label>
                  <input
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="ex.: esp32_sala_01"
                    value={form.espId}
                    onChange={(e) => setCampo("espId", e.target.value)}
                    disabled={mode === "edit"}
                  />
                </div>
              </div>

              <div className="mt-2">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold">Componentes</div>
                  <Button type="button" className="gap-2" onClick={addComp}>
                    <Plus className="h-4 w-4" />
                    Adicionar componente
                  </Button>
                </div>

                <div className="space-y-4">
                  {form.components.map((c, idx) => (
                    <Card
                      key={idx}
                      className="border-border/60 bg-card/60 p-4 backdrop-blur transition-all hover:border-primary/40"
                    >
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-muted-foreground">
                            Label
                          </label>
                          <input
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            placeholder="ex.: Temperatura ambiente"
                            value={c.label || ""}
                            onChange={(e) => setCompCampo(idx, "label", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-muted-foreground">
                            Name
                          </label>
                          <input
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            placeholder="ex.: Sensor de Temperatura"
                            value={c.name || ""}
                            onChange={(e) => setCompCampo(idx, "name", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-muted-foreground">
                            Model
                          </label>
                          <input
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            placeholder="ex.: DS18B20"
                            value={c.model || ""}
                            onChange={(e) => setCompCampo(idx, "model", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-muted-foreground">
                            Type
                          </label>
                          <select
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            value={(c.type as any) || "sensor"}
                            onChange={(e) => setCompCampo(idx, "type", e.target.value)}
                          >
                            <option value="sensor">sensor</option>
                            <option value="actuator">actuator</option>
                          </select>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-4">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-muted-foreground">
                            Pin
                          </label>
                          <input
                            type="number"
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            value={c.pin ?? 0}
                            onChange={(e) => setCompCampo(idx, "pin", Number(e.target.value))}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-muted-foreground">
                            Interval (ms)
                          </label>
                          <input
                            type="number"
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            value={c.interval ?? 1000}
                            onChange={(e) => setCompCampo(idx, "interval", Number(e.target.value))}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-muted-foreground">
                            Unit
                          </label>
                          <input
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            placeholder="ex.: °C, %, cm"
                            value={c.unit || ""}
                            onChange={(e) => setCompCampo(idx, "unit", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-muted-foreground">
                            Limites (min / max)
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                              placeholder="min"
                              value={c.config?.min ?? ""}
                              onChange={(e) => setCompCfg(idx, "min", e.target.value)}
                            />
                            <input
                              type="number"
                              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                              placeholder="max"
                              value={c.config?.max ?? ""}
                              onChange={(e) => setCompCfg(idx, "max", e.target.value)}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          className="border-destructive/40 text-destructive hover:bg-destructive/10"
                          onClick={() => rmComp(idx)}
                        >
                          Remover
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {mode === "edit" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setMode("create")
                      setOriginalEspId("")
                      setForm({ name: "", espId: "", components: [novoComponente()] })
                      setOpenForm(false)
                    }}
                  >
                    Cancelar
                  </Button>
                )}
                <Button type="submit">{mode === "edit" ? "Salvar alterações" : "Salvar"}</Button>
              </div>
            </form>
          </Card>
        )}

        {/* grade de dispositivos */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {devices.length} dispositivos • {totalSensors} componentes
          </div>
          <Button variant="outline" onClick={carregar}>
            Recarregar
          </Button>
        </div>

        {loading && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-primary">
            carregando...
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => {
            const st = statusMap[device.espId]
            const isOnline = !!st?.online
            const sensors = (device.components || []).map((c) => c.label || c.name || c.model || c.type || "comp")
            return (
              <Card
                key={device.espId}
                className="group relative border border-primary/20 bg-card/50 p-6 backdrop-blur transition-all duration-300 hover:border-primary/40"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{device.name}</h3>
                    <p className="text-sm text-muted-foreground">{device.espId}</p>
                  </div>
                  {isOnline ? (
                    <Wifi className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <WifiOff className="h-5 w-5 text-destructive" />
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant={isOnline ? "default" : "destructive"} className={isOnline ? "bg-emerald-500" : ""}>
                      {isOnline ? "online" : "offline"}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tipo</span>
                    <span className="text-sm font-medium">ESP32 TTGO</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Última atualização</span>
                    <span className="text-sm">
                      {st?.lastTs ? new Date(st.lastTs).toLocaleTimeString() : "—"}
                    </span>
                  </div>

                  <div className="border-border/50 pt-2">
                    <span className="text-sm text-muted-foreground">Sensores:</span>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {sensors.slice(0, 6).map((sensor, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {sensor}
                        </Badge>
                      ))}
                      {sensors.length > 6 && (
                        <Badge variant="outline" className="text-xs">
                          +{sensors.length - 6}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 border-t border-border/50 pt-4">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => editar(device)}>
                      <Settings className="h-4 w-4" />
                      Configurar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-2"
                      onClick={() => alert("controle do atuador ainda nao implementado")}
                    >
                      <Power className="h-4 w-4" />
                      Controlar
                    </Button>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10"
                      onClick={() => remover(device)}
                    >
                      Remover
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}