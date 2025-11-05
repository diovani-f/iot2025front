import React, { useEffect, useMemo, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Plus, Bell, Zap, Clock, Trash2, Edit3 } from "lucide-react"

const API_URL = import.meta.env?.VITE_API_URL || "https://iot2025back.onrender.com"

// tipos basicos do backend e da automacao
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
type Operador = ">" | "<" | ">=" | "<=" | "==" | "!="
type Acao = "notify" | "none"
type Automacao = {
  id: string
  name: string
  description?: string
  enabled: boolean
  type: "alert" | "schedule"
  espId: string
  metricKey?: string
  operador?: Operador
  threshold?: number
  action: Acao
  schedule?: { hh: number; mm: number }
  lastTriggered?: string
}
type Evento = {
  id: string
  ts: number
  espId: string
  name: string
  text: string
  kind: "trigger"
}

// utils basicos

// normaliza chave simples
const norm = (s: any) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")

// pega timestamp numerico
const pickTimestamp = (obj: any) => {
  const cand = [obj?.timestamp, obj?.ts, obj?.time, obj?.createdAt, obj?.created_at, obj?.date]
  for (const v of cand) {
    const t = typeof v === "string" ? Date.parse(v) : typeof v === "number" ? v : undefined
    if (Number.isFinite(t as number)) return t as number
  }
  return 0
}

// achata objeto mantendo primitivos
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

// raizes candidatas no payload
const getRoots = (row: Reading) =>
  [row?.data, row?.payload, row?.values, row?.readings, row?.medidas, row].filter(Boolean)

// extrai mapa flat do primeiro root valido
const getFlat = (row: Reading) => {
  const roots = getRoots(row)
  const deep = roots[0] && typeof roots[0] === "object" ? (roots[0] as object) : {}
  return flattenAll(deep)
}

// converte para numero quando possivel
const toNum = (v: any) => {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "boolean") return v ? 1 : 0
  if (typeof v === "string") {
    const n = Number(v.trim())
    if (Number.isFinite(n)) return n
  }
  return NaN
}

// aplica operador seguro
const compara = (a: number, op: Operador, b: number) => {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  switch (op) {
    case ">":
      return a > b
    case "<":
      return a < b
    case ">=":
      return a >= b
    case "<=":
      return a <= b
    case "==":
      return a === b
    case "!=":
      return a !== b
    default:
      return false
  }
}

// cria automacao base
const novaAutomacao = (espId = "", metricKey = ""): Automacao => ({
  id: crypto.randomUUID(),
  name: "",
  description: "",
  enabled: true,
  type: "alert",
  espId,
  metricKey,
  operador: ">",
  threshold: 0,
  action: "notify",
  schedule: { hh: 18, mm: 0 },
})

export default function Automation() {
  // estado base
  const [devices, setDevices] = useState<Device[]>([])
  const [automacoes, setAutomacoes] = useState<Automacao[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [erro, setErro] = useState("")
  const [carregando, setCarregando] = useState(true)

  // form
  const [abrirForm, setAbrirForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Automacao>(novaAutomacao())

  // cache de ultimo ts por espId para evitar disparos duplicados
  const lastTsRef = useRef<Record<string, number>>({})

  // carrega devices e automacoes do storage
  useEffect(() => {
    let vivo = true
    const run = async () => {
      setErro("")
      setCarregando(true)
      try {
        const r = await fetch(`${API_URL}/api/devices`)
        if (!r.ok) throw new Error(`falha ao listar devices: ${r.status}`)
        const data = (await r.json()) as Device[]
        if (!vivo) return
        setDevices(Array.isArray(data) ? data : [])
      } catch (e: any) {
        if (vivo) setErro(e?.message || "erro ao listar devices")
      } finally {
        if (vivo) setCarregando(false)
      }
    }
    run()
    try {
      const raw = localStorage.getItem("automacoes")
      if (raw) setAutomacoes(JSON.parse(raw) as Automacao[])
      const ev = localStorage.getItem("eventos")
      if (ev) setEventos(JSON.parse(ev) as Evento[])
    } catch {}
    return () => {
      vivo = false
    }
  }, [])

  // persiste automacoes e eventos
  useEffect(() => {
    try {
      localStorage.setItem("automacoes", JSON.stringify(automacoes))
    } catch {}
  }, [automacoes])
  useEffect(() => {
    try {
      localStorage.setItem("eventos", JSON.stringify(eventos.slice(0, 200)))
    } catch {}
  }, [eventos])

  // lista de espIds alvo com automacoes ativas
  const espAlvos = useMemo(() => {
    const set = new Set<string>()
    for (const a of automacoes) if (a.enabled && a.espId) set.add(a.espId)
    return Array.from(set)
  }, [automacoes])

  // polling de leituras para avaliar regras
  useEffect(() => {
    if (!espAlvos.length) return
    let vivo = true
    const pull = async () => {
      for (const espId of espAlvos) {
        try {
          const r = await fetch(`${API_URL}/api/readings/${encodeURIComponent(espId)}`)
          if (!r.ok) continue
          const arr = (await r.json()) as Reading[]
          const last = Array.isArray(arr) && arr.length ? arr[0] : null
          if (!last) continue

          const ts = pickTimestamp(last)
          const prev = lastTsRef.current[espId] || 0
          if (ts && ts <= prev) continue
          lastTsRef.current[espId] = ts

          const flat = getFlat(last)

          // avalia todas as automacoes por espId
          const ativas = automacoes.filter((a) => a.enabled && a.espId === espId)
          const novos: Evento[] = []
          for (const a of ativas) {
            if (a.type === "alert") {
              const key = a.metricKey || ""
              const val =
                flat[key] ??
                flat[Object.keys(flat).find((k) => norm(k.split(".").pop()) === norm(key)) || ""]
              const num = toNum(val)
              const ok = compara(num, (a.operador as Operador) || ">", (a.threshold as number) || 0)
              if (ok && a.action === "notify") {
                const evt: Evento = {
                  id: crypto.randomUUID(),
                  ts,
                  espId,
                  name: a.name || "automacao",
                  text: `${a.name || "automacao"} acionada: ${key} ${a.operador} ${a.threshold} (valor ${
                    Number.isFinite(num) ? num : String(val)
                  })`,
                  kind: "trigger",
                }
                novos.push(evt)
                a.lastTriggered = new Date(ts).toLocaleString()
              }
            } else if (a.type === "schedule") {
              // agendamento simples por hora e minuto
              if (a.schedule) {
                const d = new Date(ts)
                const hh = d.getHours()
                const mm = d.getMinutes()
                if (hh === a.schedule.hh && mm === a.schedule.mm) {
                  const evt: Evento = {
                    id: crypto.randomUUID(),
                    ts,
                    espId,
                    name: a.name || "agendamento",
                    text: `${a.name || "agendamento"} executado as ${String(hh).padStart(2, "0")}:${String(
                      mm
                    ).padStart(2, "0")}`,
                    kind: "trigger",
                  }
                  novos.push(evt)
                  a.lastTriggered = new Date(ts).toLocaleString()
                }
              }
            }
          }
          if (!vivo) return
          if (novos.length) {
            setEventos((old) => [...novos, ...old].slice(0, 200))
            setAutomacoes((old) =>
              old.map((x) => {
                const match = ativas.find((a) => a.id === x.id)
                return match ? { ...x, lastTriggered: match.lastTriggered } : x
              })
            )
          }
        } catch {
          // ignora erro individual
        }
      }
    }
    pull()
    const t = setInterval(pull, 3000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [espAlvos, automacoes])

  // chaves metricas sugeridas por device (com base na ultima leitura)
  const metricasPorDevice = useMemo(() => {
    const map = new Map<string, string[]>()
    const load = async (espId: string) => {
      try {
        const r = await fetch(`${API_URL}/api/readings/${encodeURIComponent(espId)}`)
        if (!r.ok) {
          map.set(espId, [])
          return
        }
        const arr = (await r.json()) as Reading[]
        const last = Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null
        if (!last) {
          map.set(espId, [])
          return
        }
        const flat = getFlat(last)
        const keys = Object.entries(flat)
          .filter(([_, v]) => Number.isFinite(toNum(v)))
          .map(([k]) => k)
        map.set(espId, keys.slice(0, 50))
      } catch {
        map.set(espId, [])
      }
    }
    devices.forEach((d) => load(d.espId))
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices.length])

  // helpers de form
  const abrirNovo = () => {
    const esp = devices[0]?.espId || ""
    const met = metricasPorDevice.get(esp)?.[0] || ""
    setForm(novaAutomacao(esp, met))
    setEditId(null)
    setAbrirForm(true)
  }
  const editar = (a: Automacao) => {
    setForm({ ...a })
    setEditId(a.id)
    setAbrirForm(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }
  const remover = (a: Automacao) => {
    if (!confirm(`remover automacao "${a.name}"?`)) return
    setAutomacoes((old) => old.filter((x) => x.id !== a.id))
  }
  const salvar = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name?.trim()) return setErro("nome obrigatorio")
    if (!form.espId) return setErro("selecione um dispositivo")
    if (form.type === "alert" && (!form.metricKey || !form.operador || form.threshold === undefined)) {
      return setErro("preencha metrica, operador e valor")
    }
    setErro("")
    if (editId) {
      setAutomacoes((old) => old.map((x) => (x.id === editId ? { ...form } : x)))
    } else {
      setAutomacoes((old) => [{ ...form, id: crypto.randomUUID() }, ...old])
    }
    setAbrirForm(false)
    setEditId(null)
  }

  const totalAtivas = automacoes.filter((a) => a.enabled).length

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-4xl font-bold text-transparent">
              Configurações e Automação
            </h1>
            <p className="mt-2 text-muted-foreground">configure regras e automatize acoes</p>
          </div>
          <Button className="gap-2" onClick={abrirNovo}>
            <Plus className="h-4 w-4" />
            Nova Automação
          </Button>
        </div>

        {!!erro && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">
            {erro}
          </div>
        )}
        {carregando && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-primary">carregando...</div>
        )}

        {abrirForm && (
          <Card className="border-primary/30 bg-card/60 p-6 backdrop-blur">
            <form onSubmit={salvar} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-muted-foreground">
                    {editId ? "Editar automação" : "Nova automação"}
                  </div>
                  <div className="text-xl font-bold">{form.name || "Sem título"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Ativa</span>
                  <Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Nome</label>
                  <input
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="ex.: alerta de temperatura alta"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Tipo</label>
                  <select
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={form.type}
                    onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as any }))}
                  >
                    <option value="alert">alerta</option>
                    <option value="schedule">agendamento</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Dispositivo</label>
                  <select
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={form.espId}
                    onChange={(e) => {
                      const espId = e.target.value
                      const met = metricasPorDevice.get(espId)?.[0] || ""
                      setForm((p) => ({ ...p, espId, metricKey: met }))
                    }}
                  >
                    <option value="">selecione</option>
                    {devices.map((d) => (
                      <option key={d.espId} value={d.espId}>
                        {d.name} — {d.espId}
                      </option>
                    ))}
                  </select>
                </div>

                {form.type === "alert" ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">Métrica</label>
                      <input
                        list="metricas-sugeridas"
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        placeholder="ex.: data.Temperatura ambiente"
                        value={form.metricKey || ""}
                        onChange={(e) => setForm((p) => ({ ...p, metricKey: e.target.value }))}
                      />
                      <datalist id="metricas-sugeridas">
                        {(metricasPorDevice.get(form.espId) || []).map((k) => (
                          <option key={k} value={k} />
                        ))}
                      </datalist>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-foreground">Operador</label>
                        <select
                          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                          value={form.operador}
                          onChange={(e) => setForm((p) => ({ ...p, operador: e.target.value as Operador }))}
                        >
                          <option value=">">{">"}</option>
                          <option value="<">{"<"}</option>
                          <option value=">=">{">="}</option>
                          <option value="<=">{"<="}</option>
                          <option value="==">==</option>
                          <option value="!=">!=</option>
                        </select>
                      </div>
                      <div className="col-span-2 space-y-2">
                        <label className="text-xs font-semibold text-muted-foreground">Valor</label>
                        <input
                          type="number"
                          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                          value={form.threshold ?? 0}
                          onChange={(e) => setForm((p) => ({ ...p, threshold: Number(e.target.value) }))}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">Hora</label>
                      <input
                        type="time"
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        value={`${String(form.schedule?.hh ?? 18).padStart(2, "0")}:${String(form.schedule?.mm ?? 0).padStart(2, "0")}`}
                        onChange={(e) => {
                          const [hh, mm] = e.target.value.split(":").map((x) => Number(x))
                          setForm((p) => ({ ...p, schedule: { hh, mm } }))
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">Métrica (opcional)</label>
                      <input
                        list="metricas-sugeridas"
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        placeholder="opcional"
                        value={form.metricKey || ""}
                        onChange={(e) => setForm((p) => ({ ...p, metricKey: e.target.value }))}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="grid gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Descrição</label>
                  <textarea
                    className="min-h-[80px] w-full rounded-md border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="ex.: notificar quando temperatura exceder 30c"
                    value={form.description || ""}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit">{editId ? "Salvar alterações" : "Salvar"}</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAbrirForm(false)
                    setEditId(null)
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
            <div className="mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Automações Ativas</h2>
              <span className="text-sm text-muted-foreground">
                • {totalAtivas} de {automacoes.length}
              </span>
            </div>
            <div className="space-y-3">
              {automacoes.map((a) => (
                <div key={a.id} className="rounded-lg border border-border/50 p-4 transition-all hover:border-primary/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        {a.type === "alert" ? (
                          <Bell className="h-4 w-4 text-accent" />
                        ) : (
                          <Clock className="h-4 w-4 text-secondary" />
                        )}
                        <h3 className="font-semibold">{a.name || "Sem título"}</h3>
                        <Badge variant="outline" className="ml-1 text-xs">
                          {a.type}
                        </Badge>
                      </div>
                      <p className="mb-2 text-sm text-muted-foreground">{a.description || "—"}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>device: {a.espId || "—"}</span>
                        {a.type === "alert" && (
                          <>
                            <span>• métrica: {a.metricKey || "—"}</span>
                            <span>
                              • regra: {a.operador} {a.threshold}
                            </span>
                          </>
                        )}
                        {a.type === "schedule" && a.schedule && (
                          <span>
                            • hora: {String(a.schedule.hh).padStart(2, "0")}:
                            {String(a.schedule.mm).padStart(2, "0")}
                          </span>
                        )}
                        <span>• último: {a.lastTriggered || "Nunca"}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Switch
                        checked={a.enabled}
                        onCheckedChange={(v) =>
                          setAutomacoes((old) => old.map((x) => (x.id === a.id ? { ...x, enabled: v } : x)))
                        }
                      />
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => editar(a)}>
                          <Edit3 className="h-4 w-4" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                          onClick={() => remover(a)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remover
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {!automacoes.length && (
                <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                  Nenhuma automação criada
                </div>
              )}
            </div>
          </Card>

          <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
            <div className="mb-4 flex items-center gap-2">
              <Bell className="h-5 w-5 text-accent" />
              <h2 className="text-xl font-semibold">Eventos Recentes</h2>
            </div>
            <div className="space-y-3">
              {eventos.length ? (
                eventos.slice(0, 20).map((ev) => (
                  <div key={ev.id} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{ev.name}</div>
                      <div className="text-xs text-muted-foreground">{new Date(ev.ts).toLocaleTimeString()}</div>
                    </div>
                    <div className="mt-1 text-foreground">{ev.text}</div>
                    <div className="mt-1 text-xs text-muted-foreground">device: {ev.espId}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">Sem eventos</div>
              )}
            </div>
          </Card>
        </div>

        <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
          <h2 className="mb-4 text-xl font-semibold">Configurações Gerais</h2>
          <div className="space-y-4">
            {/* mantido o switch de push como preferencia visual, sem email */}
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
              <div>
                <p className="font-medium">Notificações Push</p>
                <p className="text-sm text-muted-foreground">receber notificacoes no navegador</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
              <div>
                <p className="font-medium">Coleta de Dados Automática</p>
                <p className="text-sm text-muted-foreground">coletar dados dos sensores continuamente</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}