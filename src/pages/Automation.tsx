import type { FormEvent } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Plus, Bell, Zap, Clock, Trash2, Edit3 } from "lucide-react"

import { API_URL } from "@/lib/api"
import { useDeviceRegistry } from "@/lib/device-registry"
import {
  extractPayloadMaps,
  formatClock,
  formatDateTime,
  normalizeKey,
  numericValue,
  pickTimestamp,
  type Reading,
} from "@/lib/readings-utils"

type Operador = ">" | "<" | ">=" | "<=" | "==" | "!="
type AutomationType = "alert" | "schedule"

type Automacao = {
  id: string
  name: string
  description?: string
  enabled: boolean
  type: AutomationType
  espId: string
  metricKey?: string
  operador?: Operador
  threshold?: number
  schedule?: { hh: number; mm: number }
  lastTriggered?: number
}

type Evento = {
  id: string
  ts: number
  espId: string
  name: string
  text: string
}

const AUTOMATIONS_KEY = "iot2025::automations"
const EVENTS_KEY = "iot2025::automation-events"

const createAutomation = (espId = "", metricKey = ""): Automacao => ({
  id: crypto.randomUUID(),
  name: "",
  description: "",
  enabled: true,
  type: "alert",
  espId,
  metricKey,
  operador: ">",
  threshold: 0,
  schedule: { hh: 18, mm: 0 },
})

const compareValues = (value: number, operator: Operador, threshold: number) => {
  switch (operator) {
    case ">":
      return value > threshold
    case "<":
      return value < threshold
    case ">=":
      return value >= threshold
    case "<=":
      return value <= threshold
    case "==":
      return value === threshold
    case "!=":
      return value !== threshold
    default:
      return false
  }
}

const resolveMetricValue = (flat: Record<string, unknown>, key: string | undefined) => {
  if (!key) return undefined
  if (key in flat) return flat[key]
  const leaf = key.split(".").slice(-1)[0] ?? key
  const normalized = normalizeKey(leaf)
  const matched = Object.entries(flat).find(([candidate]) => normalizeKey(candidate.split(".").slice(-1)[0] ?? candidate) === normalized)
  return matched?.[1]
}

const listNumericKeys = (reading?: Reading) => {
  if (!reading) return [] as string[]
  const { flat } = extractPayloadMaps(reading)
  return Object.entries(flat)
    .filter(([, value]) => Number.isFinite(numericValue(value)))
    .map(([key]) => key)
    .slice(0, 50)
}

const readLocal = <T,>(key: string, fallback: T) => {
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as T
    return parsed || fallback
  } catch {
    return fallback
  }
}

const writeLocal = (key: string, value: unknown) => {
  if (typeof window === "undefined") return
  try {
    if (!value || (Array.isArray(value) && !value.length)) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, JSON.stringify(value))
    }
  } catch (err) {
    console.warn("falha ao persistir", err)
  }
}

export default function Automation() {
  const { devices } = useDeviceRegistry()
  const [automacoes, setAutomacoes] = useState<Automacao[]>(() => readLocal(AUTOMATIONS_KEY, []))
  const [eventos, setEventos] = useState<Evento[]>(() => readLocal(EVENTS_KEY, []))
  const [erro, setErro] = useState("")
  const [abrirForm, setAbrirForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Automacao>(() => createAutomation())
  const [metricas, setMetricas] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const lastSeenRef = useRef<Record<string, number>>({})

  // Load rules from backend on mount
  useEffect(() => {
    const loadRules = async () => {
      setLoading(true)
      try {
        const response = await fetch(`${API_URL}/api/rules`)
        if (response.ok) {
          const backendRules = await response.json() as any[]
          // Merge backend rules with local rules
          const merged = new Map<string, Automacao>()

          // Add local rules first
          automacoes.forEach(rule => merged.set(rule.id, rule))

          // Add/update with backend rules
          backendRules.forEach(rule => {
            const automacao: Automacao = {
              id: rule._id || rule.id || crypto.randomUUID(),
              name: rule.name || "",
              description: rule.description,
              enabled: rule.enabled !== false,
              type: rule.type || "alert",
              espId: rule.espId || "",
              metricKey: rule.metricKey,
              operador: rule.operador,
              threshold: rule.threshold,
              schedule: rule.schedule,
              lastTriggered: rule.lastTriggered,
            }
            merged.set(automacao.id, automacao)
          })

          setAutomacoes(Array.from(merged.values()))
        }
      } catch (err) {
        console.warn("Erro ao carregar regras do backend:", err)
      } finally {
        setLoading(false)
      }
    }
    loadRules()
  }, [])

  useEffect(() => {
    writeLocal(AUTOMATIONS_KEY, automacoes)
  }, [automacoes])

  useEffect(() => {
    writeLocal(EVENTS_KEY, eventos.slice(0, 200))
  }, [eventos])

  const espAlvos = useMemo(() => {
    const set = new Set<string>()
    automacoes
      .filter((automation) => automation.enabled && automation.espId)
      .forEach((automation) => set.add(automation.espId))
    return Array.from(set)
  }, [automacoes])

  useEffect(() => {
    if (!abrirForm) return
    if (!form.espId) {
      setMetricas([])
      return
    }
    const run = async () => {
      try {
        const response = await fetch(`${API_URL}/api/readings/${encodeURIComponent(form.espId)}/latest`)
        if (!response.ok) {
          setMetricas([])
          return
        }
        const payload = (await response.json()) as Reading | undefined
        setMetricas(listNumericKeys(payload))
      } catch (err) {
        console.warn("falha ao sugerir metricas", err)
        setMetricas([])
      }
    }
    run()
  }, [abrirForm, form.espId])

  useEffect(() => {
    if (!espAlvos.length) return
    const evaluate = async () => {
      const updates = new Map<string, number>()
      const novosEventos: Evento[] = []

      for (const espId of espAlvos) {
        try {
          const response = await fetch(`${API_URL}/api/readings/${encodeURIComponent(espId)}/latest`)
          if (!response.ok) continue
          const payload = (await response.json()) as Reading | undefined
          if (!payload) continue
          const ts = pickTimestamp(payload, 0)
          if (!ts || ts <= (lastSeenRef.current[espId] || 0)) continue
          lastSeenRef.current[espId] = ts

          const { flat } = extractPayloadMaps(payload)
          const ativos = automacoes.filter((automation) => automation.enabled && automation.espId === espId)

          for (const automation of ativos) {
            if (automation.type === "alert") {
              const rawValue = resolveMetricValue(flat, automation.metricKey)
              const num = numericValue(rawValue)
              if (!Number.isFinite(num) || automation.threshold === undefined || !automation.operador) continue
              if (compareValues(num as number, automation.operador, automation.threshold)) {
                const textValue = Number.isFinite(num) ? num.toString() : String(rawValue ?? "-")
                novosEventos.push({
                  id: crypto.randomUUID(),
                  ts,
                  espId,
                  name: automation.name || "Automacao",
                  text: `${automation.name || "Automacao"} disparada: ${automation.metricKey || "valor"} ${automation.operador} ${automation.threshold} (valor ${textValue})`,
                })
                updates.set(automation.id, ts)
              }
            } else if (automation.type === "schedule" && automation.schedule) {
              const current = new Date(ts)
              if (current.getHours() === automation.schedule.hh && current.getMinutes() === automation.schedule.mm) {
                const previous = automation.lastTriggered || 0
                if (!previous || ts - previous > 60_000) {
                  novosEventos.push({
                    id: crypto.randomUUID(),
                    ts,
                    espId,
                    name: automation.name || "Agendamento",
                    text: `${automation.name || "Agendamento"} executado as ${formatClock(ts)}`,
                  })
                  updates.set(automation.id, ts)
                }
              }
            }
          }
        } catch (err) {
          console.warn("falha ao avaliar automacoes", err)
        }
      }

      if (updates.size) {
        setAutomacoes((current) =>
          current.map((automation) =>
            updates.has(automation.id)
              ? { ...automation, lastTriggered: updates.get(automation.id) }
              : automation
          )
        )
      }
      if (novosEventos.length) {
        setEventos((current) => [...novosEventos.reverse(), ...current].slice(0, 200))
      }
    }

    evaluate()
    const timer = setInterval(evaluate, 5000)
    return () => {
      clearInterval(timer)
    }
  }, [espAlvos, automacoes])

  const abrirNovo = () => {
    const firstDevice = devices[0]?.espId || ""
    const sugestao = metricas.length ? metricas[0] : ""
    setForm(createAutomation(firstDevice, sugestao))
    setEditId(null)
    setAbrirForm(true)
    setErro("")
  }

  const editar = (automation: Automacao) => {
    setForm({ ...automation })
    setEditId(automation.id)
    setAbrirForm(true)
    setErro("")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const remover = async (automation: Automacao) => {
    if (!window.confirm(`remover automacao "${automation.name || automation.id}"?`)) return

    // Remove from backend if it has an _id (backend rule)
    try {
      const response = await fetch(`${API_URL}/api/rules/${automation.id}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        console.warn("Erro ao remover regra do backend:", response.status)
      }
    } catch (err) {
      console.warn("Erro ao remover regra do backend:", err)
    }

    // Remove from local state
    setAutomacoes((current) => current.filter((item) => item.id !== automation.id))
  }

  const salvar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim()) return setErro("informe um nome")
    if (!form.espId.trim()) return setErro("selecione um dispositivo")
    if (form.type === "alert") {
      if (!form.metricKey?.trim()) return setErro("informe a metrica")
      if (!form.operador) return setErro("selecione o operador")
      if (typeof form.threshold !== "number" || Number.isNaN(form.threshold)) return setErro("informe o valor de limiar")
    }
    setErro("")

    const rulePayload = {
      name: form.name,
      description: form.description,
      enabled: form.enabled,
      type: form.type,
      espId: form.espId,
      metricKey: form.metricKey,
      operador: form.operador,
      threshold: form.threshold,
      schedule: form.schedule,
    }

    // Save to backend
    try {
      const response = await fetch(`${API_URL}/api/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rulePayload),
      })

      if (response.ok) {
        const result = await response.json()
        const newRule: Automacao = {
          ...form,
          id: result.rule?._id || result.rule?.id || form.id,
        }

        if (editId) {
          setAutomacoes((current) => current.map((item) => (item.id === editId ? newRule : item)))
        } else {
          setAutomacoes((current) => [newRule, ...current])
        }
      } else {
        throw new Error("Falha ao salvar regra no backend")
      }
    } catch (err) {
      console.warn("Erro ao salvar regra no backend:", err)
      setErro("Regra salva localmente, mas falhou ao sincronizar com backend")

      // Fallback: save locally only
      if (editId) {
        setAutomacoes((current) => current.map((item) => (item.id === editId ? { ...form } : item)))
      } else {
        setAutomacoes((current) => [{ ...form, id: crypto.randomUUID() }, ...current])
      }
    }

    setAbrirForm(false)
    setEditId(null)
  }

  const totalAtivas = automacoes.filter((automation) => automation.enabled).length

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-4xl font-bold text-transparent">
              Configuracoes e Automacao
            </h1>
            <p className="mt-2 text-muted-foreground">Crie automacoes locais baseadas nas leituras disponiveis</p>
          </div>
          <div className="flex gap-2">
            <Button className="gap-2" onClick={abrirNovo} disabled={!devices.length}>
              <Plus className="h-4 w-4" />
              Nova Automacao
            </Button>
          </div>
        </div>

        {!!erro && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">{erro}</div>
        )}
        {!devices.length && (
          <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
            Cadastre ao menos um dispositivo para configurar automacoes.
          </div>
        )}

        {abrirForm && (
          <Card className="border-primary/30 bg-card/60 p-6 backdrop-blur">
            <form onSubmit={salvar} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-muted-foreground">
                    {editId ? "Editar automacao" : "Nova automacao"}
                  </div>
                  <div className="text-xl font-bold">{form.name || "Sem titulo"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Ativa</span>
                  <Switch checked={form.enabled} onCheckedChange={(value) => setForm((current) => ({ ...current, enabled: value }))} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Nome</label>
                  <input
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="ex.: alerta de temperatura"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Tipo</label>
                  <select
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={form.type}
                    onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as AutomationType }))}
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
                    onChange={(event) => {
                      const espId = event.target.value
                      setForm((current) => ({ ...current, espId }))
                    }}
                  >
                    <option value="">selecione</option>
                    {devices.map((device) => (
                      <option key={device.espId} value={device.espId}>
                        {device.name} - {device.espId}
                      </option>
                    ))}
                  </select>
                </div>

                {form.type === "alert" ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">Metrica</label>
                      <input
                        list="metricas-sugeridas"
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        placeholder="ex.: data.temperatura"
                        value={form.metricKey || ""}
                        onChange={(event) => setForm((current) => ({ ...current, metricKey: event.target.value }))}
                      />
                      <datalist id="metricas-sugeridas">
                        {metricas.map((key) => (
                          <option key={key} value={key} />
                        ))}
                      </datalist>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">Operador</label>
                      <select
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        value={form.operador}
                        onChange={(event) => setForm((current) => ({ ...current, operador: event.target.value as Operador }))}
                      >
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<=">&lt;=</option>
                        <option value="==">==</option>
                        <option value="!=">!=</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">Valor</label>
                      <input
                        type="number"
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        value={form.threshold ?? 0}
                        onChange={(event) => setForm((current) => ({ ...current, threshold: Number(event.target.value) }))}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">Horario</label>
                      <input
                        type="time"
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        value={`${String(form.schedule?.hh ?? 18).padStart(2, "0")}:${String(form.schedule?.mm ?? 0).padStart(2, "0")}`}
                        onChange={(event) => {
                          const [hh, mm] = event.target.value.split(":").map((part) => Number(part))
                          setForm((current) => ({ ...current, schedule: { hh, mm } }))
                        }}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-semibold text-muted-foreground">Metrica (opcional)</label>
                      <input
                        list="metricas-sugeridas"
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        placeholder="opcional"
                        value={form.metricKey || ""}
                        onChange={(event) => setForm((current) => ({ ...current, metricKey: event.target.value }))}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Descricao</label>
                <textarea
                  className="min-h-[80px] w-full rounded-md border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="ex.: notificar quando temperatura exceder 30 C"
                  value={form.description || ""}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit">{editId ? "Salvar alteracoes" : "Salvar"}</Button>
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
              <h2 className="text-xl font-semibold">Automacoes</h2>
              <span className="text-sm text-muted-foreground">{totalAtivas} de {automacoes.length}</span>
            </div>
            <div className="space-y-3">
              {automacoes.map((automation) => (
                <div key={automation.id} className="rounded-lg border border-border/50 p-4 transition-all hover:border-primary/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        {automation.type === "alert" ? <Bell className="h-4 w-4 text-accent" /> : <Clock className="h-4 w-4 text-secondary" />}
                        <h3 className="font-semibold">{automation.name || "Sem titulo"}</h3>
                        <Badge variant="outline" className="ml-1 text-xs">{automation.type}</Badge>
                      </div>
                      <p className="mb-2 text-sm text-muted-foreground">{automation.description || "-"}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>device: {automation.espId || "-"}</span>
                        {automation.type === "alert" && (
                          <>
                            <span>metric: {automation.metricKey || "-"}</span>
                            <span>rule: {automation.operador} {automation.threshold}</span>
                          </>
                        )}
                        {automation.type === "schedule" && automation.schedule && (
                          <span>
                            horario: {String(automation.schedule.hh).padStart(2, "0")}:{String(automation.schedule.mm).padStart(2, "0")}
                          </span>
                        )}
                        <span>ultimo: {automation.lastTriggered ? formatDateTime(automation.lastTriggered) : "Nunca"}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Switch
                        checked={automation.enabled}
                        onCheckedChange={(value) =>
                          setAutomacoes((current) =>
                            current.map((item) => (item.id === automation.id ? { ...item, enabled: value } : item))
                          )
                        }
                      />
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => editar(automation)}>
                          <Edit3 className="h-4 w-4" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                          onClick={() => remover(automation)}
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
                  Nenhuma automacao criada
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
                eventos.slice(0, 20).map((evento) => (
                  <div key={evento.id} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{evento.name}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(evento.ts)}</div>
                    </div>
                    <div className="mt-1 text-foreground">{evento.text}</div>
                    <div className="mt-1 text-xs text-muted-foreground">device: {evento.espId}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">Sem eventos</div>
              )}
            </div>
          </Card>
        </div>

        <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
          <h2 className="mb-4 text-xl font-semibold">Configuracoes gerais</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
              <div>
                <p className="font-medium">Notificacoes Push</p>
                <p className="text-sm text-muted-foreground">preferencia local, sem envio real</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
              <div>
                <p className="font-medium">Coleta automatica</p>
                <p className="text-sm text-muted-foreground">monitoramento continuo das leituras</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
