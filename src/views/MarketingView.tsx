import React, { useMemo, useState } from 'react';
import {
  Check,
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  ListPlus,
  Loader2,
  Plus,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Company, MarketingLog, MetaReport, PlanTask } from '../types';
import { formatNumber, parseMetaCsvTexts, sanitizeFirestoreId } from '../utils/calculations';
import { exportMarketingExcel } from '../utils/planHelpers';
import { QuickTaskModal } from '../components/QuickTaskModal';

interface MarketingViewProps {
  companies: Company[];
  metaReports: MetaReport[];
  marketingLogs: MarketingLog[];
  onAddMetaReport: (report: MetaReport) => void;
  onDeleteMetaReport: (id: string) => void;
  onSaveMarketingLog: (log: MarketingLog) => void;
  onDeleteMarketingLog: (id: string) => void;
  onAddPlanTask: (task: PlanTask) => void;
}

const SAMPLE_META_CSV = `Fecha,Alcance,Visualizaciones,Visitas al perfil,Interacciones,Clics en el enlace,Nuevos seguidores
2026-11-17,22400,48900,1410,1890,420,135
2026-11-18,24100,52300,1520,2140,465,152
2026-11-19,21800,46200,1380,1750,390,118
2026-11-20,26900,59400,1790,2480,540,184
2026-11-21,28400,63100,1920,2690,595,205
2026-11-22,25000,42500,1400,1900,430,146`;

interface UploadedPreview {
  name: string;
  mimeType: string;
  base64: string;
  previewUrl: string;
}

export const MarketingView: React.FC<MarketingViewProps> = ({
  companies,
  metaReports,
  marketingLogs,
  onAddMetaReport,
  onDeleteMetaReport,
  onSaveMarketingLog,
  onDeleteMarketingLog,
  onAddPlanTask,
}) => {
  const [importMode, setImportMode] = useState<'csv' | 'vision'>('csv');
  const [periodLabel, setPeriodLabel] = useState('Noviembre 2026 · Cierre Semanal');
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  // Draft metrics populated by CSV parser or Gemini Vision
  const [draft, setDraft] = useState<{
    alcance: number;
    visualizaciones: number;
    visitasPerfil: number;
    interacciones: number;
    clicsEnlace: number;
    nuevosSeguidores: number;
    analisisEjecutivo: string;
    recomendaciones: string[];
    origen: 'CSV Meta' | 'Gemini Vision';
    ready: boolean;
  }>({
    alcance: 0,
    visualizaciones: 0,
    visitasPerfil: 0,
    interacciones: 0,
    clicsEnlace: 0,
    nuevosSeguidores: 0,
    analisisEjecutivo: '',
    recomendaciones: [],
    origen: 'CSV Meta',
    ready: false,
  });

  const [csvStatus, setCsvStatus] = useState('');
  const [visionImages, setVisionImages] = useState<UploadedPreview[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [visionError, setVisionError] = useState('');
  const [reportSavedMsg, setReportSavedMsg] = useState('');

  // Bitácora Semanal state
  const currentChecklist = useMemo(() => {
    return (
      marketingLogs.find((l) => l.tipoEntrega === 'Checklist Semanal') ?? {
        id: 'mlog_sem48_actual',
        semana: 'Semana 48 · 23 al 29 Nov 2026',
        grillaDiaria: true,
        colaboraciones: true,
        magoyaVideos: false,
        promoDuplica: false,
        tipoEntrega: 'Checklist Semanal' as const,
        fecha: new Date().toISOString().slice(0, 10),
        notas: '',
      }
    );
  }, [marketingLogs]);

  const [deliveryType, setDeliveryType] = useState<
    'Kit Difusión WhatsApp/Email' | 'Reel de Fidelización'
  >('Kit Difusión WhatsApp/Email');
  const [deliveryCompanyId, setDeliveryCompanyId] = useState(companies[0]?.id ?? '');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  const deliveries = useMemo(
    () =>
      marketingLogs
        .filter((l) => l.tipoEntrega !== 'Checklist Semanal')
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [marketingLogs]
  );

  // CSV Drop / File handler
  const handleCsvFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files: Array<{ name: string; content: string }> = [];
    for (const file of Array.from(fileList)) {
      const text = await file.text();
      files.push({ name: file.name, content: text });
    }
    const parsed = parseMetaCsvTexts(files);
    setDraft({
      alcance: parsed.alcance,
      visualizaciones: parsed.visualizaciones,
      visitasPerfil: parsed.visitasPerfil,
      interacciones: parsed.interacciones,
      clicsEnlace: parsed.clicsEnlace,
      nuevosSeguidores: parsed.nuevosSeguidores,
      analisisEjecutivo: `Reporte importado desde ${parsed.filesProcessed} archivo(s) CSV de Meta Business Suite. Métricas detectadas: ${
        parsed.detectedMetrics.join(', ') || 'verificá los campos debajo'
      }.`,
      recomendaciones: [],
      origen: 'CSV Meta',
      ready: true,
    });
    setCsvStatus(
      `Se procesaron ${parsed.filesProcessed} archivo(s) CSV (${parsed.detectedMetrics.length} métricas detectadas).`
    );
  };

  const handleLoadSampleCsv = () => {
    const parsed = parseMetaCsvTexts([{ name: 'meta_resultados_noviembre.csv', content: SAMPLE_META_CSV }]);
    setDraft({
      alcance: parsed.alcance,
      visualizaciones: parsed.visualizaciones,
      visitasPerfil: parsed.visitasPerfil,
      interacciones: parsed.interacciones,
      clicsEnlace: parsed.clicsEnlace,
      nuevosSeguidores: parsed.nuevosSeguidores,
      analisisEjecutivo:
        'Importación nativa desde CSV de Meta Business Suite. Pico de alcance e interacciones durante jueves, viernes y sábado.',
      recomendaciones: [],
      origen: 'CSV Meta',
      ready: true,
    });
    setCsvStatus('CSV de prueba procesado automáticamente.');
  };

  // Screenshot upload handler
  const handleImageFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setVisionError('');
    const nextImages: UploadedPreview[] = [];
    for (const file of Array.from(fileList).slice(0, 6)) {
      if (!file.type.startsWith('image/')) continue;
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(',')[1] || '';
      nextImages.push({
        name: file.name,
        mimeType: file.type,
        base64,
        previewUrl: dataUrl,
      });
    }
    setVisionImages((prev) => [...prev, ...nextImages].slice(0, 6));
  };

  const handleAnalyzeWithGemini = async () => {
    if (visionImages.length === 0) {
      setVisionError('Subí al menos una captura de Instagram o Meta para analizar.');
      return;
    }
    setAnalyzing(true);
    setVisionError('');
    try {
      const response = await fetch('/api/marketing/analyze-screenshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodLabel,
          images: visionImages.map((img) => ({
            mimeType: img.mimeType,
            data: img.base64,
            name: img.name,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Error al analizar las capturas.');
      }

      setDraft({
        alcance: Number(payload.alcance) || 0,
        visualizaciones: Number(payload.visualizaciones) || 0,
        visitasPerfil: Number(payload.visitasPerfil) || 0,
        interacciones: Number(payload.interacciones) || 0,
        clicsEnlace: Number(payload.clicsEnlace) || 0,
        nuevosSeguidores: Number(payload.nuevosSeguidores) || 0,
        analisisEjecutivo: String(payload.analisisEjecutivo || ''),
        recomendaciones: Array.isArray(payload.recomendaciones) ? payload.recomendaciones : [],
        origen: 'Gemini Vision',
        ready: true,
      });
    } catch (err: unknown) {
      setVisionError(err instanceof Error ? err.message : 'No se pudieron procesar las imágenes.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveDraftReport = () => {
    const newReport: MetaReport = {
      id: sanitizeFirestoreId('meta'),
      periodo: periodLabel.trim() || 'Período Meta',
      fechaCarga: new Date().toISOString().slice(0, 10),
      origen: draft.origen,
      alcance: draft.alcance,
      visualizaciones: draft.visualizaciones,
      visitasPerfil: draft.visitasPerfil,
      interacciones: draft.interacciones,
      clicsEnlace: draft.clicsEnlace,
      nuevosSeguidores: draft.nuevosSeguidores,
      analisisEjecutivo: draft.analisisEjecutivo,
    };
    onAddMetaReport(newReport);
    setDraft((prev) => ({ ...prev, ready: false }));
    setVisionImages([]);
    setCsvStatus('');
    setReportSavedMsg('Reporte Meta guardado y reflejado en el Dashboard Ejecutivo.');
    window.setTimeout(() => setReportSavedMsg(''), 3000);
  };

  const toggleChecklistField = (
    field: 'grillaDiaria' | 'colaboraciones' | 'magoyaVideos' | 'promoDuplica'
  ) => {
    onSaveMarketingLog({
      ...currentChecklist,
      [field]: !currentChecklist[field],
    });
  };

  const handleLogDelivery = (e: React.FormEvent) => {
    e.preventDefault();
    const company = companies.find((c) => c.id === deliveryCompanyId);
    onSaveMarketingLog({
      id: sanitizeFirestoreId('mlog'),
      semana: currentChecklist.semana,
      tipoEntrega: deliveryType,
      empresaId: company?.id || '',
      empresaNombre: company?.nombre || '',
      fecha: new Date().toISOString().slice(0, 10),
      notas: deliveryNotes.trim(),
    });
    setDeliveryNotes('');
  };

  const checklistCompletedCount = [
    currentChecklist.grillaDiaria,
    currentChecklist.colaboraciones,
    currentChecklist.magoyaVideos,
    currentChecklist.promoDuplica,
  ].filter(Boolean).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-neutral-500 mb-1">
            Cero burocracia diaria · Carga automática de métricas y bitácora semanal en 2 minutos
          </p>
          <h1 className="text-2xl font-bold text-[#101014] tracking-tight">
            Marketing — Reportes Meta (CSV + IA) y Bitácora
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportMarketingExcel(metaReports, marketingLogs)}
            className="px-3.5 py-2 bg-white border border-neutral-200 hover:border-[#101014] text-[#101014] text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Reporte Excel</span>
          </button>
          <button
            type="button"
            onClick={() => setTaskModalOpen(true)}
            className="px-3.5 py-2 bg-[#101014] hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <ListPlus className="w-4 h-4" />
            <span>Nueva Tarea</span>
          </button>
        </div>
      </div>

      {reportSavedMsg && (
        <div className="px-4 py-2.5 bg-[#101014] text-white text-xs font-medium rounded-lg flex items-center gap-2">
          <Check className="w-4 h-4 text-[#16A34A]" />
          <span>{reportSavedMsg}</span>
        </div>
      )}

      {/* BLOCK 1: Importador Automático Meta (CSV + Gemini Vision) */}
      <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 bg-[#F8F6F4] flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#101014]">
              Importador Automático de Reportes Meta
            </h2>
            <p className="text-xs text-neutral-500">
              Arrastrá archivos .CSV de Meta Business Suite o capturas de pantalla para extraer
              métricas con IA
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-neutral-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setImportMode('csv')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                importMode === 'csv'
                  ? 'bg-white text-[#101014] shadow-xs'
                  : 'text-neutral-600 hover:text-[#101014]'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>CSV Meta Business Suite</span>
            </button>
            <button
              type="button"
              onClick={() => setImportMode('vision')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                importMode === 'vision'
                  ? 'bg-white text-[#101014] shadow-xs'
                  : 'text-neutral-600 hover:text-[#101014]'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Lector de Capturas (Gemini)</span>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-xs font-medium text-neutral-600 shrink-0">
              Etiqueta del período:
            </label>
            <input
              value={periodLabel}
              onChange={(e) => setPeriodLabel(e.target.value)}
              className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm flex-1 max-w-md focus:outline-none focus:border-[#101014]"
            />
          </div>

          {importMode === 'csv' ? (
            <div className="space-y-3">
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleCsvFiles(e.dataTransfer.files);
                }}
                className="block border-2 border-dashed border-neutral-300 hover:border-[#E52421] rounded-xl p-8 text-center cursor-pointer transition-colors bg-[#F8F6F4]/60"
              >
                <input
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  className="hidden"
                  onChange={(e) => void handleCsvFiles(e.target.files)}
                />
                <Upload className="w-7 h-7 text-neutral-400 mx-auto mb-2.5" />
                <div className="text-sm font-semibold text-[#101014]">
                  Arrastrá uno o varios archivos .CSV de Meta Business Suite
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  Detecta automáticamente Alcance, Visualizaciones, Visitas al perfil,
                  Interacciones, Clics en el enlace y Nuevos seguidores
                </p>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-neutral-500">{csvStatus || 'Listo para importar .CSV'}</span>
                <button
                  type="button"
                  onClick={handleLoadSampleCsv}
                  className="text-[#E52421] hover:underline font-semibold"
                >
                  Probar con CSV de ejemplo Meta
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleImageFiles(e.dataTransfer.files);
                }}
                className="block border-2 border-dashed border-neutral-300 hover:border-[#E52421] rounded-xl p-7 text-center cursor-pointer transition-colors bg-[#F8F6F4]/60"
              >
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => void handleImageFiles(e.target.files)}
                />
                <ImageIcon className="w-7 h-7 text-neutral-400 mx-auto mb-2" />
                <div className="text-sm font-semibold text-[#101014]">
                  Subí capturas de Instagram Insights o Meta Business Suite
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  Gemini 2.5 Flash extrae los indicadores numéricos y redacta el análisis ejecutivo
                  para Ramiro
                </p>
              </label>

              {visionImages.length > 0 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {visionImages.map((img, i) => (
                      <div
                        key={`${img.name}-${i}`}
                        className="relative border border-neutral-200 rounded-lg overflow-hidden bg-neutral-100 aspect-4/3"
                      >
                        <img
                          src={img.previewUrl}
                          alt={img.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setVisionImages((prev) => prev.filter((_, idx) => idx !== i))
                          }
                          className="absolute top-1.5 right-1.5 p-1 bg-[#101014]/80 text-white rounded"
                          aria-label="Quitar captura"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={analyzing}
                    onClick={() => void handleAnalyzeWithGemini()}
                    className="px-5 py-2.5 bg-[#E52421] hover:bg-[#C91D1A] disabled:bg-neutral-400 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Analizando capturas con Gemini Vision...</span>
                      </>
                    ) : (
                      <span>Extraer métricas y generar análisis ejecutivo</span>
                    )}
                  </button>
                </div>
              )}

              {visionError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-[#DC2626] font-medium">
                  {visionError}
                </div>
              )}
            </div>
          )}

          {/* Extracted Preview & Confirm Save */}
          {draft.ready && (
            <div className="mt-4 p-5 bg-[#F8F6F4] border border-neutral-200 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-[#101014]">
                  Métricas extraídas ({draft.origen}) — Revisá y confirmá para guardar
                </div>
                <button
                  type="button"
                  onClick={handleSaveDraftReport}
                  className="px-4 py-2 bg-[#101014] hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg"
                >
                  Guardar en historial Meta
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {(
                  [
                    { key: 'alcance', label: 'Alcance' },
                    { key: 'visualizaciones', label: 'Visualizaciones' },
                    { key: 'visitasPerfil', label: 'Visitas perfil' },
                    { key: 'interacciones', label: 'Interacciones' },
                    { key: 'clicsEnlace', label: 'Clics enlace' },
                    { key: 'nuevosSeguidores', label: 'Nuevos seg.' },
                  ] as const
                ).map((item) => (
                  <div key={item.key} className="bg-white border border-neutral-200 rounded-lg p-3">
                    <label className="block text-[11px] text-neutral-500 mb-1">{item.label}</label>
                    <input
                      type="number"
                      min={0}
                      value={draft[item.key]}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [item.key]: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                      className="w-full font-mono font-bold text-base tabular-nums text-[#101014] focus:outline-none"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">
                  Análisis ejecutivo del período
                </label>
                <textarea
                  rows={3}
                  value={draft.analisisEjecutivo}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, analisisEjecutivo: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-xs leading-relaxed"
                />
              </div>

              {draft.recomendaciones.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-[#101014] mb-1.5">
                    Recomendaciones sugeridas
                  </div>
                  <ul className="space-y-1 text-xs text-neutral-700 list-disc pl-4">
                    {draft.recomendaciones.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* BLOCK 2: Historial de Reportes Meta */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-[#101014]">
          Historial de Reportes Meta ({metaReports.length})
        </h2>
        <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8F6F4] border-b border-neutral-200 text-neutral-600">
              <tr>
                <th className="py-3 px-4 font-semibold">Período</th>
                <th className="py-3 px-3 font-semibold text-right">Alcance</th>
                <th className="py-3 px-3 font-semibold text-right">Visualizaciones</th>
                <th className="py-3 px-3 font-semibold text-right">Visitas Perfil</th>
                <th className="py-3 px-3 font-semibold text-right">Interacciones</th>
                <th className="py-3 px-3 font-semibold text-right">Clics Web</th>
                <th className="py-3 px-3 font-semibold text-right">Seguidores</th>
                <th className="py-3 px-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {metaReports.map((r) => (
                <tr key={r.id} className="hover:bg-[#F8F6F4]/60">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-[#101014]">{r.periodo}</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                      {r.origen} · {r.fechaCarga}
                    </div>
                    {r.analisisEjecutivo && (
                      <p className="text-[11px] text-neutral-600 mt-1 max-w-md leading-relaxed">
                        {r.analisisEjecutivo}
                      </p>
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono font-bold tabular-nums">
                    {formatNumber(r.alcance)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                    {formatNumber(r.visualizaciones)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                    {formatNumber(r.visitasPerfil)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono font-bold tabular-nums">
                    {formatNumber(r.interacciones)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono font-bold text-[#E52421] tabular-nums">
                    {formatNumber(r.clicsEnlace)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-[#16A34A] font-semibold tabular-nums">
                    +{formatNumber(r.nuevosSeguidores)}
                  </td>
                  <td className="py-3.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => onDeleteMetaReport(r.id)}
                      className="p-1 text-neutral-400 hover:text-[#DC2626]"
                      aria-label="Eliminar reporte"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* BLOCK 3: Bitácora Semanal Rápida (2 minutos) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Weekly Routine Checklist (6 cols) */}
        <div className="lg:col-span-6 bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-neutral-500">{currentChecklist.semana}</div>
              <h2 className="text-base font-bold text-[#101014]">
                Bitácora Semanal Rápida (2 minutos)
              </h2>
            </div>
            <span className="text-xs font-mono font-bold text-[#101014] tabular-nums">
              {checklistCompletedCount}/4 completos
            </span>
          </div>

          <div className="space-y-2.5">
            {(
              [
                {
                  key: 'grillaDiaria',
                  title: 'Grilla diaria 8–12 historias de comercios',
                  desc: 'Publicación sostenida de beneficios activos sin carga manual historia por historia.',
                },
                {
                  key: 'colaboraciones',
                  title: 'Colaboraciones Lun USPT / Mié Psicólogos / Vie Abogados / Dom TP',
                  desc: 'Publicaciones cruzadas con instituciones y convenios estratégicos.',
                },
                {
                  key: 'magoyaVideos',
                  title: 'Magoya y Videos emocionales Mar / Jue / Sáb',
                  desc: 'Contenido orgánico de alto alcance y recordación de marca en Tucumán.',
                },
                {
                  key: 'promoDuplica',
                  title: 'Especial Mensual Promo Duplica',
                  desc: 'Campaña destacada de beneficios duplicados y tráfico hacia la web.',
                },
              ] as const
            ).map((item) => {
              const checked = Boolean(currentChecklist[item.key]);
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggleChecklistField(item.key)}
                  className={`w-full text-left p-3.5 rounded-lg border transition-colors flex items-start gap-3 ${
                    checked
                      ? 'bg-[#F8F6F4] border-[#101014]'
                      : 'bg-white border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 mt-0.5 ${
                      checked
                        ? 'bg-[#101014] border-[#101014] text-white'
                        : 'border-neutral-300 bg-white'
                    }`}
                  >
                    {checked && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <div
                      className={`text-sm font-semibold ${
                        checked ? 'text-[#101014]' : 'text-neutral-800'
                      }`}
                    >
                      {item.title}
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">{item.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Quick Kit / Reel Delivery Logger (6 cols) */}
        <div className="lg:col-span-6 bg-white border border-neutral-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-[#101014]">
              Entregas a Empresas (Kits y Reels de Fidelización)
            </h2>
            <p className="text-xs text-neutral-500">
              Vinculá cada entrega a la Ficha Maestra para que Ramiro vea el impacto por empresa
            </p>
          </div>

          <form onSubmit={handleLogDelivery} className="space-y-3 pb-5 border-b border-neutral-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">
                  Tipo de entrega
                </label>
                <select
                  value={deliveryType}
                  onChange={(e) =>
                    setDeliveryType(
                      e.target.value as 'Kit Difusión WhatsApp/Email' | 'Reel de Fidelización'
                    )
                  }
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white"
                >
                  <option value="Kit Difusión WhatsApp/Email">Kit Difusión WhatsApp/Email</option>
                  <option value="Reel de Fidelización">Reel de Fidelización</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">
                  Empresa vinculada
                </label>
                <select
                  value={deliveryCompanyId}
                  onChange={(e) => setDeliveryCompanyId(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="Detalle rápido (ej. Pack 4 placas WhatsApp + correo noviembre)..."
                className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-xs"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-[#E52421] hover:bg-[#C91D1A] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Registrar</span>
              </button>
            </div>
          </form>

          {/* Recent Deliveries */}
          <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
            {deliveries.length === 0 ? (
              <p className="text-xs text-neutral-500">Todavía no registraste entregas.</p>
            ) : (
              deliveries.map((d) => (
                <div
                  key={d.id}
                  className="p-3 bg-[#F8F6F4] border border-neutral-200 rounded-lg flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Send className="w-3 h-3 text-[#E52421] shrink-0" />
                      <span className="font-semibold text-[#101014]">{d.tipoEntrega}</span>
                      <span aria-hidden="true" className="text-neutral-400">
                        ·
                      </span>
                      <span className="font-mono text-neutral-500">{d.fecha}</span>
                    </div>
                    <div className="text-xs font-medium text-neutral-700 mt-0.5">
                      {d.empresaNombre || 'General'}
                    </div>
                    {d.notas && <p className="text-[11px] text-neutral-500 mt-0.5">{d.notas}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteMarketingLog(d.id)}
                    className="p-1 text-neutral-400 hover:text-[#DC2626]"
                    aria-label="Eliminar entrega"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <QuickTaskModal
        open={taskModalOpen}
        defaultSector="Marketing"
        companies={companies}
        onClose={() => setTaskModalOpen(false)}
        onCreateTask={(task) => {
          onAddPlanTask(task);
          setReportSavedMsg('Tarea de Marketing agregada a Planificación Semanal.');
          window.setTimeout(() => setReportSavedMsg(''), 2800);
        }}
      />
    </div>
  );
};
