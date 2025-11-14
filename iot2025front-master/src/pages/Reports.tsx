import React, { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileText, Download, Calendar, TrendingUp, Loader2 } from "lucide-react"
import { API_URL } from "@/lib/api"

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
// tipos relacionados a dispositivos e leituras
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
type ReportItem = {
  id: string
  title: string
  type: "Mensal" | "Semanal" | "Trimestral" | "Personalizado"
  date: string
  status: "completed" | "pending"
  size: string
  url?: string
  mime?: string
}

type ReportFormat = "csv" | "pdf" | "docx"

const pickTimestamp = (obj: any) => {
  // tenta extrair um timestamp de varios campos comuns
  const cands = [obj?.timestamp, obj?.ts, obj?.time, obj?.createdAt, obj?.created_at, obj?.date]
  for (const v of cands) {
    const t = typeof v === "string" ? Date.parse(v) : typeof v === "number" ? v : undefined
    if (Number.isFinite(t as number)) return t as number
  }
  // padrao quando nao encontrar
  return 0
}

const flattenAll = (o: any, prefix = "", out: Record<string, any> = {}) => {
  // achata objetos aninhados em chaves ponto-separadas
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

// retorna possiveis containers onde os dados podem estar dentro da leitura
const getRoots = (row: Reading) => [row?.data, row?.payload, row?.values, row?.readings, row?.medidas, row].filter(Boolean)

// extrai o primeiro root util e achata para facilitar processamento
const getFlat = (row: Reading) => {
  const roots = getRoots(row)
  const deep = roots[0] && typeof roots[0] === "object" ? (roots[0] as object) : {}
  return flattenAll(deep)
}

const toNum = (v: any) => {
  // tenta converter valores comuns para numero
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "boolean") return v ? 1 : 0
  if (typeof v === "string") {
    const n = Number(v.trim())
    if (Number.isFinite(n)) return n
  }
  return NaN
}

const ymd = (d = new Date()) => {
  const yyyy = d.getFullYear()
  const MM = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${MM}-${dd}`
}

const prettySize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type MetricAgg = { count: number; min: number; max: number; sum: number; last: number | string; unit?: string }
type DeviceAgg = {
  espId: string
  name: string
  online: boolean
  lastTs: number
  components: number
  metrics: Record<string, MetricAgg>
}

// atualiza agregacao estatistica com novo valor
const addAgg = (agg: MetricAgg, v: any, unit?: string) => {
  const n = toNum(v)
  if (!Number.isFinite(n)) return
  agg.count += 1
  agg.sum += n
  agg.min = Math.min(agg.min, n)
  agg.max = Math.max(agg.max, n)
  agg.last = n
  if (unit && !agg.unit) agg.unit = unit
}

export default function Reports() {
  // pagina de relatorios: mostra metadados, lista arquivos e gera novos relatorios
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [period, setPeriod] = useState<"1h" | "24h" | "7d" | "30d">("24h")
  const [format, setFormat] = useState<ReportFormat>("pdf")
  const [reports, setReports] = useState<ReportItem[]>([
    { id: "r1", title: "Relatório Mensal - Outubro 2025", type: "Mensal", date: "2025-10-31", status: "completed", size: "2.4 MB" },
    { id: "r2", title: "Análise de Performance - Q3 2025", type: "Trimestral", date: "2025-09-30", status: "completed", size: "5.8 MB" },
    { id: "r3", title: "Relatório Semanal - Semana 44", type: "Semanal", date: "2025-11-03", status: "completed", size: "1.2 MB" },
    { id: "r4", title: "Relatório Mensal - Novembro 2025", type: "Mensal", date: "2025-11-30", status: "pending", size: "-" },
  ])
  const [generating, setGenerating] = useState(false)

  const [uptimePct, setUptimePct] = useState<string>("—")
  const [alertsCount, setAlertsCount] = useState<number>(0)
  const [activeDevices, setActiveDevices] = useState<number>(0)

  useEffect(() => {
    let alive = true
    const run = async () => {
      setLoading(true)
      setError("")
      try {
        // busca lista de dispositivos da api
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
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    const probe = async () => {
      try {
        const now = Date.now()
        let on = 0
        let total = devices.length
        let alerts = 0

        for (const d of devices) {
          try {
            const r = await fetch(`${API_URL}/api/readings/${encodeURIComponent(d.espId)}`)
            if (!r.ok) continue
            const arr = (await r.json()) as Reading[]
            const last = Array.isArray(arr) && arr.length ? arr[0] : null
            const ts = last ? pickTimestamp(last) : 0
            const online = ts && now - ts < 60_000
            if (online) on++

            if (last) {
              const flat = getFlat(last)
              for (const c of d.components || []) {
                const keys = [c.label, c.name, c.model, c.type, c.unit].filter(Boolean) as string[]
                let hitVal: any = undefined
                for (const k of Object.keys(flat)) {
                  const base = k.split(".").slice(-1)[0].toLowerCase()
                  if (keys.some((x) => String(x).toLowerCase() === base)) {
                    hitVal = flat[k]
                    break
                  }
                }
                if (hitVal === undefined) continue
                const num = toNum(hitVal)
                if (!Number.isFinite(num)) continue
                const min = c?.config?.min
                const max = c?.config?.max
                // checa limites configurados e conta alertas
                if (typeof min === "number" && num < min) alerts++
                if (typeof max === "number" && num > max) alerts++
              }
            }
          } catch {}
        }

        if (!alive) return
        setActiveDevices(on)
        setUptimePct(total ? `${((on / Math.max(1, total)) * 100).toFixed(1)}%` : "—")
        setAlertsCount(alerts)
      } catch {}
    }
    if (devices.length) probe()
  }, [devices])

  const buildAggregates = async () => {
    // agrega leituras por device para o periodo selecionado
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

    const result: DeviceAgg[] = []

    for (const d of devices) {
      try {
        const r = await fetch(`${API_URL}/api/readings/${encodeURIComponent(d.espId)}`)
        if (!r.ok) {
          result.push({
            espId: d.espId,
            name: d.name || d.espId,
            online: false,
            lastTs: 0,
            components: d.components?.length || 0,
            metrics: {},
          })
          continue
        }
        const arr = (await r.json()) as Reading[]
        const list = Array.isArray(arr) ? arr.reverse() : []
        const metrics: Record<string, MetricAgg> = {}

        let lastTs = 0
        for (let i = 0; i < list.length; i++) {
          const row = list[i]
          const ts = pickTimestamp(row)
          if (!ts || ts < since) continue
          if (ts > lastTs) lastTs = ts
          const flat = getFlat(row)

          for (const [k, v] of Object.entries(flat)) {
            const n = toNum(v)
            if (!Number.isFinite(n)) continue
            if (!metrics[k]) metrics[k] = { count: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY, sum: 0, last: n }
            const unit = d.components?.find((c) => {
              const base = k.split(".").slice(-1)[0].toLowerCase()
              const cand = [c.label, c.name, c.model, c.type, c.unit].filter(Boolean).map((x) => String(x).toLowerCase())
              return cand.includes(base)
            })?.unit
            addAgg(metrics[k], n, unit)
          }
        }

        const online = lastTs && now - lastTs < 60_000

        result.push({
          espId: d.espId,
          name: d.name || d.espId,
          online: !!online,
          lastTs,
          components: d.components?.length || 0,
          metrics,
        })
      } catch {
        result.push({
          espId: d.espId,
          name: d.name || d.espId,
          online: false,
          lastTs: 0,
          components: d.components?.length || 0,
          metrics: {},
        })
      }
    }

    return result
  }

  const makeCsv = (aggs: DeviceAgg[]) => {
    // gera um csv simples com estatisticas por device e metric
    const lines: string[] = []
    lines.push(`# relatorio agregado ${period} - ${new Date().toISOString()}`)
    lines.push(`# dispositivos: ${aggs.length}`)
    lines.push("")
    lines.push("device,espId,online,lastTs,components,metric,count,min,max,avg,last,unit")
    for (const d of aggs) {
      const metrics = Object.entries(d.metrics)
      if (!metrics.length) {
        lines.push(`"${d.name.replace(/"/g, '""')}",${d.espId},${d.online ? "online" : "offline"},${d.lastTs},${d.components},-,-,-,-,-,-`)
        continue
      }
      for (const [k, m] of metrics) {
        const avg = m.count ? m.sum / m.count : 0
        lines.push(
          `"${d.name.replace(/"/g, '""')}",${d.espId},${d.online ? "online" : "offline"},${d.lastTs},${d.components},"${k.replace(
            /"/g,
            '""'
          )}",${m.count},${Number.isFinite(m.min) ? m.min : ""},${Number.isFinite(m.max) ? m.max : ""},${avg.toFixed(3)},${m.last},${m.unit || ""}`
        )
      }
    }
    const csv = lines.join("\n")
    return new Blob([csv], { type: "text/csv;charset=utf-8;" })
  }

  async function makePdf(aggs: DeviceAgg[]) {
  // gera um pdf usando jspdf + autotable (import dinamico so no cliente)
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40
  let y = margin

  // pagina inicial / capa
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('Relatório IoT', margin, y)
  y += 26
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(`Gerado em: ${new Date().toLocaleString()}`, margin, y)
  y += 18
  doc.text(`Período: ${period.toUpperCase()}`, margin, y)
  y += 18
  doc.text(`Dispositivos: ${aggs.length}`, margin, y)
  y += 30

  // sumario rapido
  const ativos = aggs.filter((d) => d.online).length
  doc.setFont('helvetica', 'bold')
  doc.text('Sumário', margin, y)
  y += 16
  doc.setFont('helvetica', 'normal')
  doc.text(`Online: ${ativos} • Offline: ${aggs.length - ativos}`, margin, y)

  // utilitario de quebra de pagina
  const maybePageBreak = () => {
    if (y > 760) {
      doc.addPage()
      y = margin
    }
  }

  // monta tabela por dispositivo
  for (let idx = 0; idx < aggs.length; idx++) {
    const d = aggs[idx]
    y += 18
    maybePageBreak()

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text(`${d.name} (${d.espId})`, margin, y)
    y += 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text(
      `Status: ${d.online ? 'online' : 'offline'} • Último: ${d.lastTs ? new Date(d.lastTs).toLocaleString() : '—'} • Comp.: ${d.components}`,
      margin,
      y
    )

    const rows = Object.entries(d.metrics)
      .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
      .slice(0, 30)
      .map(([k, m]) => {
        const avg = m.count ? m.sum / m.count : 0
        return [
          k,
          String(m.count),
          Number.isFinite(m.min) ? String(m.min) : '',
          Number.isFinite(m.max) ? String(m.max) : '',
          avg.toFixed(3),
          `${m.last}${m.unit ? ` ${m.unit}` : ''}`,
        ]
      })

    // plugin para tabelas
    autoTable(doc, {
      head: [['Métrica', 'Count', 'Min', 'Max', 'Avg', 'Último']],
      body: rows,
      startY: y + 10,
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
    })

    // atualiza posicao apos tabela gerada
    y = ((doc as any).lastAutoTable?.finalY || y) + 6

    // quebra de pagina se necessario
    if (idx < aggs.length - 1 && y > 720) {
      doc.addPage()
      y = margin
    }
  }

  const blob = doc.output('blob')
  return blob as Blob
}

  const makeDocx = async (aggs: DeviceAgg[]) => {
    // gera docx dinamicamente (carrega a biblioteca so no cliente)
    const docx = await import("docx")
    const { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } = docx as any

    const sections: any[] = []

    sections.push(
      new Paragraph({ text: "Relatório IoT", heading: HeadingLevel.TITLE, alignment: AlignmentType.LEFT }),
    )
    sections.push(new Paragraph({ text: `Gerado em: ${new Date().toLocaleString()}` }))
    sections.push(new Paragraph({ text: `Período: ${period.toUpperCase()}` }))
    sections.push(new Paragraph({ text: `Dispositivos: ${aggs.length}` }))
    sections.push(new Paragraph({ text: "" }))

    for (const d of aggs) {
      sections.push(
        new Paragraph({ text: `${d.name} (${d.espId})`, heading: HeadingLevel.HEADING_2 })
      )
      sections.push(
        new Paragraph({
          children: [
            new TextRun(`Status: ${d.online ? "online" : "offline"} • Último: ${d.lastTs ? new Date(d.lastTs).toLocaleString() : "—"} • Comp.: ${d.components}`),
          ],
        })
      )

      const rows = [
        new TableRow({
          children: ["Métrica", "Count", "Min", "Max", "Avg", "Último"].map(
            (t) => new TableCell({ children: [new Paragraph({ text: t })] })
          ),
        }),
      ]

      const sorted = Object.entries(d.metrics)
        .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
        .slice(0, 50)

      for (const [k, m] of sorted) {
        const avg = m.count ? m.sum / m.count : 0
        rows.push(
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: k })] }),
              new TableCell({ children: [new Paragraph({ text: String(m.count) })] }),
              new TableCell({ children: [new Paragraph({ text: Number.isFinite(m.min) ? String(m.min) : "" })] }),
              new TableCell({ children: [new Paragraph({ text: Number.isFinite(m.max) ? String(m.max) : "" })] }),
              new TableCell({ children: [new Paragraph({ text: avg.toFixed(3) })] }),
              new TableCell({ children: [new Paragraph({ text: `${m.last}${m.unit ? ` ${m.unit}` : ""}` })] }),
            ],
          })
        )
      }

      sections.push(
        new Table({
          rows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        })
      )
      sections.push(new Paragraph({ text: "" }))
    }

    const doc = new Document({
      sections: [{ children: sections }],
    })
    const blob = await Packer.toBlob(doc)
    return blob as Blob
  }

  const handleGenerate = async () => {
    // gerador principal: constroi agregados e produz arquivo no formato escolhido
    setGenerating(true)
    setError("")
    try {
      const aggs = await buildAggregates()

      let blob: Blob
      let mime = ""
      let ext = ""

      if (format === "csv") {
        blob = makeCsv(aggs)
        mime = "text/csv"
        ext = "csv"
      } else if (format === "pdf") {
        blob = await makePdf(aggs)
        mime = "application/pdf"
        ext = "pdf"
      } else {
        blob = await makeDocx(aggs)
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ext = "docx"
      }

      const url = URL.createObjectURL(blob)
      const size = prettySize(blob.size)
      const title = `Relatório ${period.toUpperCase()} - ${ymd(new Date())}.${ext}`

      const item: ReportItem = {
        id: crypto.randomUUID(),
        title,
        type: "Personalizado",
        date: ymd(new Date()),
        status: "completed",
        size,
        url,
        mime,
      }
      setReports((prev) => [item, ...prev])
    } catch (e: any) {
      setError(e?.message || "falha ao gerar relatorio")
    } finally {
      setGenerating(false)
    }
  }

  const metrics = useMemo(() => {
    return [
      { label: "Uptime Médio", value: uptimePct, icon: TrendingUp, trend: uptimePct === "—" ? "—" : "+0%" },
      { label: "Alertas (ult. leitura por device)", value: String(alertsCount), icon: FileText, trend: "+0%" },
      { label: "Dispositivos Ativos", value: String(activeDevices), icon: Calendar, trend: "+0" },
    ]
  }, [uptimePct, alertsCount, activeDevices])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-4xl font-bold text-transparent">
              Relatórios
            </h1>
            <p className="mt-2 text-muted-foreground">acesse e gere relatorios do sistema</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="h-10 min-w-[140px] rounded-md border border-border bg-background px-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
              value={format}
              onChange={(e) => setFormat(e.target.value as ReportFormat)}
            >
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
              <option value="csv">CSV</option>
            </select>
            <select
              className="h-10 min-w-[160px] rounded-md border border-border bg-background px-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
            >
              <option value="1h">ultima hora</option>
              <option value="24h">ultimas 24h</option>
              <option value="7d">ultimos 7 dias</option>
              <option value="30d">ultimos 30 dias</option>
            </select>
            <Button className="gap-2" onClick={handleGenerate} disabled={generating || loading || !!error}>
              {generating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {generating ? "Gerando..." : "Gerar Relatório"}
            </Button>
          </div>
        </div>

        {!!error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">{error}</div>
        )}
        {loading && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-primary">carregando...</div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {metrics.map((metric, index) => (
            <Card key={index} className="border-primary/20 bg-card/50 p-6 backdrop-blur">
              <div className="mb-2 flex items-center gap-2">
                <metric.icon className="h-4 w-4 text-primary" />
                <p className="text-sm text-muted-foreground">{metric.label}</p>
              </div>
              <p className="text-3xl font-bold">{metric.value}</p>
              <p className="mt-1 text-sm text-accent">{metric.trend} vs. anterior</p>
            </Card>
          ))}
        </div>

        <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
          <h2 className="mb-4 text-xl font-semibold">Relatórios Disponíveis</h2>
          <div className="space-y-3">
            {reports.map((report) => (
              <div key={report.id} className="rounded-lg border border-border/50 p-4 transition-all hover:border-primary/40">
                <div className="flex items-start justify-between">
                  <div className="flex flex-1 items-start gap-3">
                    <FileText className="mt-1 h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <h3 className="mb-1 font-semibold">{report.title}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="outline">{report.type}</Badge>
                        <span>•</span>
                        <span>{report.date}</span>
                        <span>•</span>
                        <span>{report.size}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={report.status === "completed" ? "default" : "secondary"}>
                      {report.status === "completed" ? "Concluído" : "Pendente"}
                    </Badge>
                    {report.status === "completed" && report.url && (
                      <a href={report.url} download className="inline-flex">
                        <Button variant="outline" size="sm" className="gap-2">
                          <Download className="h-4 w-4" />
                          Download
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!reports.length && (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                nenhum relatorio disponivel
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}