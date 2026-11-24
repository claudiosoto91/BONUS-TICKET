import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Download,
  ExternalLink,
  GripVertical,
  History,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type {
  Company,
  PlanColumnStatus,
  PlanPriority,
  PlanSector,
  PlanTask,
  TeamMember,
} from '../types';
import { CURRENT_PLAN_WEEK, PLAN_WEEKS } from '../data/seedData';
import { sanitizeFirestoreId } from '../utils/calculations';
import {
  ALL_PLAN_SECTORS,
  SECTOR_VISUALS,
  exportPlanificacionExcel,
  getTaskSectors,
} from '../utils/planHelpers';

interface PlanificacionViewProps {
  planTasks: PlanTask[];
  companies: Company[];
  activeMember: TeamMember;
  onAddPlanTask: (task: PlanTask) => void;
  onUpdatePlanTask: (task: PlanTask) => void;
  onDeletePlanTask: (taskId: string) => void;
}

const COLUMNS: Array<{
  id: PlanColumnStatus;
  title: string;
  subtitle: string;
  accentText: string;
}> = [
  {
    id: 'Pendiente',
    title: 'Pendiente',
    subtitle: 'Acuerdos cargados para arrancar',
    accentText: 'text-[#101014]',
  },
  {
    id: 'En Proceso',
    title: 'En Proceso',
    subtitle: 'En ejecución esta semana',
    accentText: 'text-[#D97706]',
  },
  {
    id: 'Completado',
    title: 'Completado',
    subtitle: 'Entregado y cerrado',
    accentText: 'text-[#16A34A]',
  },
];

function mapMemberToSector(member: TeamMember): PlanSector {
  switch (member) {
    case 'Marketing':
      return 'Marketing';
    case 'Nahuel':
      return 'Cobranzas';
    case 'Miguel':
      return 'Empresas';
    default:
      return 'General';
  }
}

function getNextStatus(status: PlanColumnStatus): PlanColumnStatus | null {
  if (status === 'Pendiente') return 'En Proceso';
  if (status === 'En Proceso') return 'Completado';
  return null;
}

function getPrevStatus(status: PlanColumnStatus): PlanColumnStatus | null {
  if (status === 'Completado') return 'En Proceso';
  if (status === 'En Proceso') return 'Pendiente';
  return null;
}

const PRIORITY_RANK: Record<PlanPriority, number> = {
  Alta: 0,
  Media: 1,
  Baja: 2,
};

const PRIORITY_TEXT_CLASS: Record<PlanPriority, string> = {
  Alta: 'text-[#E52421]',
  Media: 'text-[#D97706]',
  Baja: 'text-neutral-400',
};

const HISTORY_PAGE_SIZE = 20;
type HistoryLabelOption = PlanSector | 'Sin etiqueta';

export const PlanificacionView: React.FC<PlanificacionViewProps> = ({
  planTasks,
  companies,
  activeMember,
  onAddPlanTask,
  onUpdatePlanTask,
  onDeletePlanTask,
}) => {
  const mySector = mapMemberToSector(activeMember);

  // Filters: "Todas" mode groups all tasks, or multi-select individual labels (can uncheck all!)
  const [selectedWeek, setSelectedWeek] = useState<string>(CURRENT_PLAN_WEEK);
  const [showAllMode, setShowAllMode] = useState<boolean>(true);
  const [selectedFilterSectors, setSelectedFilterSectors] = useState<PlanSector[]>([
    ...ALL_PLAN_SECTORS,
  ]);
  const [priorityFilter, setPriorityFilter] = useState<'Todas' | PlanPriority>('Todas');
  const [copiedFeedback, setCopiedFeedback] = useState(false);

  // Trello Drag & Drop state
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<PlanColumnStatus | null>(null);
  const [editingAreasTaskId, setEditingAreasTaskId] = useState<string | null>(null);

  // Quick Monday live-capture form state (multi-area, allows unchecking all)
  const [titulo, setTitulo] = useState('');
  const [formSectors, setFormSectors] = useState<PlanSector[]>([mySector]);
  const [fechaObjetivo, setFechaObjetivo] = useState('2026-11-27');
  const [prioridad, setPrioridad] = useState<PlanPriority>('Media');
  const [empresaId, setEmpresaId] = useState('');

  // Full Card Edit Modal state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitulo, setEditTitulo] = useState('');
  const [editSectors, setEditSectors] = useState<PlanSector[]>([]);
  const [editFechaObjetivo, setEditFechaObjetivo] = useState('2026-11-27');
  const [editPrioridad, setEditPrioridad] = useState<PlanPriority>('Media');
  const [editEstado, setEditEstado] = useState<PlanColumnStatus>('Pendiente');
  const [editEmpresaId, setEditEmpresaId] = useState('');

  // Finished Tasks History Table state (independent label & date filters + 20/page pagination)
  const [historyShowAllLabels, setHistoryShowAllLabels] = useState<boolean>(true);
  const [historySelectedLabels, setHistorySelectedLabels] = useState<HistoryLabelOption[]>([]);
  const [historyDateFrom, setHistoryDateFrom] = useState<string>('');
  const [historyDateTo, setHistoryDateTo] = useState<string>('');
  const [historyPage, setHistoryPage] = useState<number>(1);

  const weekOptions = useMemo(() => {
    const set = new Set<string>(PLAN_WEEKS);
    planTasks.forEach((t) => {
      if (t.semana) set.add(t.semana);
    });
    return Array.from(set);
  }, [planTasks]);

  const weekScopedTasks = useMemo(() => {
    return planTasks.filter((t) =>
      selectedWeek === 'TODAS' ? true : t.semana === selectedWeek
    );
  }, [planTasks, selectedWeek]);

  const visibleTasks = useMemo(() => {
    return weekScopedTasks
      .filter((t) => {
        if (showAllMode) return true;
        if (selectedFilterSectors.length === 0) return false;
        const taskSectors = getTaskSectors(t);
        return taskSectors.some((s) => selectedFilterSectors.includes(s));
      })
      .filter((t) => (priorityFilter === 'Todas' ? true : t.prioridad === priorityFilter))
      .sort((a, b) => {
        if (a.prioridad !== b.prioridad) {
          return PRIORITY_RANK[a.prioridad] - PRIORITY_RANK[b.prioridad];
        }
        return a.fechaObjetivo.localeCompare(b.fechaObjetivo);
      });
  }, [weekScopedTasks, showAllMode, selectedFilterSectors, priorityFilter]);

  const stats = useMemo(() => {
    const total = visibleTasks.length;
    const completadas = visibleTasks.filter((t) => t.estado === 'Completado').length;
    const enProceso = visibleTasks.filter((t) => t.estado === 'En Proceso').length;
    const pendientes = visibleTasks.filter((t) => t.estado === 'Pendiente').length;
    const pct = total > 0 ? Math.round((completadas / total) * 100) : 0;
    return { total, completadas, enProceso, pendientes, pct };
  }, [visibleTasks]);

  // All finished tasks across all weeks, ordered newest first
  const allCompletedTasks = useMemo(() => {
    return planTasks
      .filter((t) => t.estado === 'Completado')
      .sort((a, b) => {
        const byDate = (b.fechaObjetivo || '').localeCompare(a.fechaObjetivo || '');
        if (byDate !== 0) return byDate;
        return b.id.localeCompare(a.id);
      });
  }, [planTasks]);

  const filteredHistoryTasks = useMemo(() => {
    return allCompletedTasks
      .filter((t) => {
        if (historyShowAllLabels) return true;
        if (historySelectedLabels.length === 0) return false;
        const sectors = getTaskSectors(t);
        if (sectors.length === 0) {
          return historySelectedLabels.includes('Sin etiqueta');
        }
        return sectors.some((s) => historySelectedLabels.includes(s));
      })
      .filter((t) => {
        if (historyDateFrom && (t.fechaObjetivo || '') < historyDateFrom) return false;
        if (historyDateTo && (t.fechaObjetivo || '') > historyDateTo) return false;
        return true;
      });
  }, [
    allCompletedTasks,
    historyShowAllLabels,
    historySelectedLabels,
    historyDateFrom,
    historyDateTo,
  ]);

  const historyTotalPages = Math.max(1, Math.ceil(filteredHistoryTasks.length / HISTORY_PAGE_SIZE));
  const safeHistoryPage = Math.min(historyPage, historyTotalPages);
  const historyStartIdx = (safeHistoryPage - 1) * HISTORY_PAGE_SIZE;
  const paginatedHistoryTasks = useMemo(() => {
    return filteredHistoryTasks.slice(historyStartIdx, historyStartIdx + HISTORY_PAGE_SIZE);
  }, [filteredHistoryTasks, historyStartIdx]);

  const handleToggleHistoryLabel = (label: HistoryLabelOption) => {
    setHistoryPage(1);
    if (historyShowAllLabels) {
      setHistoryShowAllLabels(false);
      setHistorySelectedLabels([label]);
      return;
    }
    setHistorySelectedLabels((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    );
  };

  const handleResetHistoryLabels = () => {
    setHistoryShowAllLabels(true);
    setHistorySelectedLabels([]);
    setHistoryPage(1);
  };

  const handleClearHistoryDates = () => {
    setHistoryDateFrom('');
    setHistoryDateTo('');
    setHistoryPage(1);
  };

  // Filter toggle handlers
  const handleSelectAllFilter = () => {
    setShowAllMode(true);
    setSelectedFilterSectors([...ALL_PLAN_SECTORS]);
  };

  const handleUncheckAllFilters = () => {
    setShowAllMode(false);
    setSelectedFilterSectors([]);
  };

  const handleSelectOnlyMyArea = () => {
    setShowAllMode(false);
    setSelectedFilterSectors([mySector]);
  };

  const handleToggleFilterSector = (sec: PlanSector) => {
    if (showAllMode) {
      // Leaving "Todas" mode: uncheck the clicked label from the full set
      setShowAllMode(false);
      setSelectedFilterSectors(ALL_PLAN_SECTORS.filter((s) => s !== sec));
      return;
    }
    setSelectedFilterSectors((prev) =>
      prev.includes(sec) ? prev.filter((s) => s !== sec) : [...prev, sec]
    );
  };

  // Form multi-label toggle (allows unchecking ALL labels)
  const toggleFormSector = (sec: PlanSector) => {
    setFormSectors((prev) =>
      prev.includes(sec) ? prev.filter((s) => s !== sec) : [...prev, sec]
    );
  };

  // Card inline multi-label toggle (allows unchecking ALL labels)
  const toggleCardSector = (task: PlanTask, sec: PlanSector) => {
    const current = getTaskSectors(task);
    const next: PlanSector[] = current.includes(sec)
      ? current.filter((s) => s !== sec)
      : [...current, sec];
    onUpdatePlanTask({
      ...task,
      sector: next[0] ?? '',
      sectores: next,
    });
  };

  const setCardSectors = (task: PlanTask, next: PlanSector[]) => {
    onUpdatePlanTask({
      ...task,
      sector: next[0] ?? '',
      sectores: next,
    });
  };

  const openEditModal = (task: PlanTask) => {
    setEditingTaskId(task.id);
    setEditTitulo(task.titulo);
    setEditSectors(getTaskSectors(task));
    setEditFechaObjetivo(task.fechaObjetivo);
    setEditPrioridad(task.prioridad);
    setEditEstado(task.estado);
    setEditEmpresaId(task.empresaId || '');
  };

  const closeEditModal = () => {
    setEditingTaskId(null);
  };

  const toggleEditSector = (sec: PlanSector) => {
    setEditSectors((prev) =>
      prev.includes(sec) ? prev.filter((s) => s !== sec) : [...prev, sec]
    );
  };

  const handleSaveEditedTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTaskId || !editTitulo.trim()) return;
    const original = planTasks.find((t) => t.id === editingTaskId);
    if (!original) return;

    const linkedCompany = companies.find((c) => c.id === editEmpresaId);

    onUpdatePlanTask({
      ...original,
      titulo: editTitulo.trim(),
      sector: editSectors[0] ?? '',
      sectores: editSectors,
      fechaObjetivo: editFechaObjetivo,
      prioridad: editPrioridad,
      estado: editEstado,
      empresaId: linkedCompany?.id || '',
      empresaNombre: linkedCompany?.nombre || '',
    });

    closeEditModal();
  };

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return;
    const linkedCompany = companies.find((c) => c.id === empresaId);
    const chosenWeek = selectedWeek !== 'TODAS' ? selectedWeek : CURRENT_PLAN_WEEK;

    onAddPlanTask({
      id: sanitizeFirestoreId('plan'),
      titulo: titulo.trim(),
      sector: formSectors[0] ?? '',
      sectores: formSectors,
      fechaObjetivo,
      semana: chosenWeek,
      prioridad,
      estado: 'Pendiente',
      empresaId: linkedCompany?.id || '',
      empresaNombre: linkedCompany?.nombre || '',
      linkDrive: '',
    });

    setTitulo('');
    setEmpresaId('');
    setPrioridad('Media');
  };

  // Drag & Drop Handlers (Trello movement)
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggingTaskId(taskId);
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverColumn = (e: React.DragEvent, colId: PlanColumnStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== colId) {
      setDragOverCol(colId);
    }
  };

  const handleDropOnColumn = (e: React.DragEvent, colId: PlanColumnStatus) => {
    e.preventDefault();
    const droppedId = e.dataTransfer.getData('text/plain') || draggingTaskId;
    setDraggingTaskId(null);
    setDragOverCol(null);
    if (!droppedId) return;
    const target = planTasks.find((t) => t.id === droppedId);
    if (target && target.estado !== colId) {
      onUpdatePlanTask({ ...target, estado: colId });
    }
  };

  const handleCopyWhatsAppSummary = async () => {
    const headerWeek = selectedWeek === 'TODAS' ? 'Todas las semanas' : selectedWeek;
    const scopeTitle = showAllMode
      ? 'Todas las tareas'
      : selectedFilterSectors.length > 0
      ? `Etiquetas: ${selectedFilterSectors.join(', ')}`
      : 'Sin etiquetas seleccionadas';

    const lines: string[] = [
      `*BONUS TICKET · PLANIFICACIÓN SEMANAL*`,
      `${headerWeek} (${scopeTitle})`,
      `Cumplimiento: ${stats.completadas}/${stats.total} (${stats.pct}%)`,
      '',
    ];

    const sectorsToPrint: PlanSector[] = showAllMode
      ? ALL_PLAN_SECTORS
      : selectedFilterSectors;

    for (const sec of sectorsToPrint) {
      const secTasks = visibleTasks.filter((t) => getTaskSectors(t).includes(sec));
      if (secTasks.length === 0) continue;

      const vis = SECTOR_VISUALS[sec];
      lines.push(`*${vis.label.toUpperCase()} (${vis.owner})*`);

      secTasks.forEach((t) => {
        const sectors = getTaskSectors(t);
        const multiLabel = sectors.length > 1 ? ` [${sectors.join(' + ')}]` : '';
        const prio = t.prioridad === 'Alta' ? ' [ALTA]' : t.prioridad === 'Media' ? ' [MEDIA]' : ' [BAJA]';
        const emp = t.empresaNombre ? ` · ${t.empresaNombre}` : '';
        if (t.estado === 'Completado') {
          lines.push(`- [x] ${t.titulo}${emp}${multiLabel} (Completado)`);
        } else {
          const st = t.estado === 'En Proceso' ? ' (En Proceso)' : ' (Pendiente)';
          lines.push(`- [ ] ${t.titulo}${emp}${multiLabel}${prio}${st} · Obj: ${t.fechaObjetivo}`);
        }
      });

      lines.push('');
    }

    const unlabeled = visibleTasks.filter((t) => getTaskSectors(t).length === 0);
    if (unlabeled.length > 0) {
      lines.push('*SIN ETIQUETA*');
      unlabeled.forEach((t) => {
        const emp = t.empresaNombre ? ` · ${t.empresaNombre}` : '';
        if (t.estado === 'Completado') {
          lines.push(`- [x] ${t.titulo}${emp} (Completado)`);
        } else {
          lines.push(`- [ ] ${t.titulo}${emp} (${t.estado}) · Obj: ${t.fechaObjetivo}`);
        }
      });
      lines.push('');
    }

    if (visibleTasks.length === 0) {
      lines.push('Sin tareas registradas para el filtro seleccionado.');
    }

    const text = lines.join('\n').trim();

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setCopiedFeedback(true);
    window.setTimeout(() => setCopiedFeedback(false), 2600);
  };

  const isOnlyMyAreaActive =
    !showAllMode &&
    selectedFilterSectors.length === 1 &&
    selectedFilterSectors[0] === mySector;

  const isNoneSelected = !showAllMode && selectedFilterSectors.length === 0;

  return (
    <div className="space-y-6">
      {/* HEADER + EXCEL + WHATSAPP SUMMARY */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-neutral-500 mb-1">
            Tablero estilo Trello · Arrastrá tarjetas entre columnas y etiquetá una o varias áreas
          </p>
          <h1 className="text-2xl font-bold text-[#101014] tracking-tight">
            Planificación Semanal (Reuniones de Lunes)
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-lg px-3 py-2">
            <Calendar className="w-4 h-4 text-neutral-500 shrink-0" />
            <select
              aria-label="Seleccionar semana"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="text-xs font-semibold text-[#101014] bg-transparent focus:outline-none"
            >
              {weekOptions.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
              <option value="TODAS">Todas las semanas</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() =>
              exportPlanificacionExcel(
                visibleTasks,
                selectedWeek === 'TODAS' ? 'Todas' : selectedWeek
              )
            }
            className="px-3.5 py-2 bg-white border border-neutral-200 hover:border-[#101014] text-[#101014] text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Reporte Excel</span>
          </button>

          <button
            type="button"
            onClick={() => void handleCopyWhatsAppSummary()}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
              copiedFeedback
                ? 'bg-[#16A34A] text-white'
                : 'bg-[#101014] hover:bg-neutral-800 text-white'
            }`}
          >
            {copiedFeedback ? (
              <>
                <Check className="w-4 h-4" />
                <span>Resumen copiado para WhatsApp</span>
              </>
            ) : (
              <>
                <ClipboardCopy className="w-4 h-4" />
                <span>Copiar Resumen para WhatsApp</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* PROGRESS BAR + COLOR LEGEND BY LABEL */}
      <section className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-neutral-500">
              Cumplimiento semanal ·{' '}
              <span className="text-[#101014] font-semibold">
                {selectedWeek === 'TODAS' ? 'Todas las semanas' : selectedWeek}
              </span>
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-3xl font-bold font-mono tabular-nums text-[#101014]">
                {stats.pct}%
              </span>
              <span className="text-xs text-neutral-500">
                <strong className="font-mono text-[#16A34A] tabular-nums">
                  {stats.completadas}
                </strong>{' '}
                completadas ·{' '}
                <strong className="font-mono text-[#D97706] tabular-nums">
                  {stats.enProceso}
                </strong>{' '}
                en proceso ·{' '}
                <strong className="font-mono text-[#101014] tabular-nums">
                  {stats.pendientes}
                </strong>{' '}
                pendientes
              </span>
            </div>
          </div>

          {/* Label Color Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            {ALL_PLAN_SECTORS.map((sec) => {
              const vis = SECTOR_VISUALS[sec];
              const count = weekScopedTasks.filter((t) =>
                getTaskSectors(t).includes(sec)
              ).length;
              return (
                <div key={sec} className="flex items-center gap-1.5 text-neutral-600">
                  <span
                    className="w-3 h-3 rounded-[3px] shrink-0"
                    style={{ backgroundColor: vis.hex }}
                  />
                  <span className="font-semibold text-[#101014]">{vis.label}</span>
                  <span className="font-mono text-neutral-400 tabular-nums">({count})</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="w-full h-2.5 bg-[#F8F6F4] border border-neutral-200/80 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#E52421] transition-all duration-300"
            style={{ width: `${stats.pct}%` }}
          />
        </div>
      </section>

      {/* QUICK LIVE MONDAY MEETING CAPTURE FORM (MULTI-LABEL + UNCHECK ALL) */}
      <section className="bg-white border border-neutral-200 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-bold text-[#101014]">
              Nueva Tarea · Carga rápida para Reunión de Lunes
            </h2>
            <p className="text-xs text-neutral-500">
              Tildá una o varias etiquetas (o destildá todas si es general sin etiqueta); también
              aparecen acá las tareas creadas desde Empresas, Cobranzas y Marketing
            </p>
          </div>
          <span className="text-xs text-neutral-500">
            Ingresan en <strong className="text-[#101014]">Pendiente</strong>
          </span>
        </div>

        <form onSubmit={handleQuickAdd} className="space-y-3.5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-6">
              <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                Título de la tarea / acuerdo *
              </label>
              <input
                required
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej. Lanzar campaña conjunta con Sanatorio Modelo y enviar factura"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-[#101014] focus:outline-none focus:border-[#101014]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                Fecha objetivo
              </label>
              <input
                type="date"
                required
                value={fechaObjetivo}
                onChange={(e) => setFechaObjetivo(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono text-[#101014] focus:outline-none focus:border-[#101014]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                Prioridad
              </label>
              <select
                value={prioridad}
                onChange={(e) => setPrioridad(e.target.value as PlanPriority)}
                className="w-full px-2.5 py-2 border border-neutral-300 rounded-lg text-sm bg-white text-[#101014] focus:outline-none focus:border-[#101014]"
              >
                <option value="Baja">Baja</option>
                <option value="Media">Media</option>
                <option value="Alta">Alta</option>
              </select>
            </div>

            <div className="lg:col-span-2 flex items-end">
              <button
                type="submit"
                className="w-full py-2 px-4 bg-[#E52421] hover:bg-[#C91D1A] text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 h-[38px]"
              >
                <Plus className="w-4 h-4" />
                <span>Nueva Tarea</span>
              </button>
            </div>
          </div>

          {/* Multi-label selector with Todas & Destildar todas */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span className="text-[11px] font-semibold text-neutral-600 mr-1">
              Etiquetas:
            </span>
            {ALL_PLAN_SECTORS.map((sec) => {
              const vis = SECTOR_VISUALS[sec];
              const isSelected = formSectors.includes(sec);
              return (
                <button
                  key={sec}
                  type="button"
                  onClick={() => toggleFormSector(sec)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    isSelected
                      ? vis.activeButtonClass
                      : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400'
                  }`}
                >
                  {isSelected ? (
                    <Check className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <span
                      className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                      style={{ backgroundColor: vis.hex }}
                    />
                  )}
                  <span>{vis.label}</span>
                </button>
              );
            })}

            <span className="text-neutral-300 px-0.5" aria-hidden="true">
              |
            </span>

            <button
              type="button"
              onClick={() => setFormSectors([...ALL_PLAN_SECTORS])}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#101014] hover:bg-neutral-100 transition-colors"
            >
              Todas
            </button>

            <button
              type="button"
              onClick={() => setFormSectors([])}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-500 hover:text-[#DC2626] hover:bg-red-50/50 transition-colors"
            >
              Destildar todas
            </button>
          </div>

          <div className="pt-1">
            <div className="max-w-md">
              <label className="block text-[11px] font-medium text-neutral-500 mb-1">
                Empresa / Comunidad vinculada (opcional)
              </label>
              <select
                value={empresaId}
                onChange={(e) => setEmpresaId(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#F8F6F4] border border-neutral-200 rounded-lg text-xs text-[#101014]"
              >
                <option value="">Sin empresa específica / Comunidad Bonus</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({c.estado})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>
      </section>

      {/* FILTER BAR: "Todas" + "Solo mi área" + MULTI-CHECK LABELS + "Destildar todas" */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-neutral-200/70 rounded-xl">
          <button
            type="button"
            onClick={handleSelectAllFilter}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              showAllMode
                ? 'bg-[#101014] text-white'
                : 'text-neutral-700 hover:bg-white/70 hover:text-[#101014]'
            }`}
          >
            Todas ({weekScopedTasks.length})
          </button>

          <button
            type="button"
            onClick={handleSelectOnlyMyArea}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              isOnlyMyAreaActive
                ? 'bg-[#E52421] text-white'
                : 'text-neutral-700 hover:bg-white/70 hover:text-[#101014]'
            }`}
          >
            Solo mi área ({mySector})
          </button>

          <span className="text-neutral-300 px-0.5 hidden sm:inline" aria-hidden="true">
            |
          </span>

          {ALL_PLAN_SECTORS.map((sec) => {
            const vis = SECTOR_VISUALS[sec];
            const isChecked = showAllMode || selectedFilterSectors.includes(sec);
            return (
              <button
                key={sec}
                type="button"
                onClick={() => handleToggleFilterSector(sec)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  isChecked
                    ? vis.activeButtonClass
                    : 'bg-white border-neutral-200 text-neutral-500 hover:text-[#101014]'
                }`}
              >
                {isChecked ? (
                  <Check className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <span
                    className="w-2.5 h-2.5 rounded-[2px] shrink-0 opacity-60"
                    style={{ backgroundColor: vis.hex }}
                  />
                )}
                <span>{vis.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={handleUncheckAllFilters}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              isNoneSelected
                ? 'bg-white text-[#DC2626] font-semibold'
                : 'text-neutral-600 hover:text-[#DC2626] hover:bg-white/70'
            }`}
          >
            Destildar todas
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-neutral-500">Prioridad:</span>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as 'Todas' | PlanPriority)}
            className="px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-medium text-[#101014]"
          >
            <option value="Todas">Todas</option>
            <option value="Alta">Solo Alta</option>
            <option value="Media">Solo Media</option>
            <option value="Baja">Solo Baja</option>
          </select>
        </div>
      </div>

      {/* EMPTY STATE WHEN ALL LABELS ARE UNCHECKED */}
      {isNoneSelected && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-[#101014]">
              Todas las etiquetas están destildadas
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Tildá una o más etiquetas arriba para filtrar por área, o presioná{' '}
              <strong className="text-[#101014]">Todas</strong> para agrupar todas las tareas.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSelectAllFilter}
            className="px-4 py-2 bg-[#101014] hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg whitespace-nowrap"
          >
            Ver Todas las tareas
          </button>
        </div>
      )}

      {/* TRELLO-STYLE 3-COLUMN DRAG-AND-DROP BOARD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {COLUMNS.map((col) => {
          const colTasks = visibleTasks.filter((t) => t.estado === col.id);
          const isDropTarget = dragOverCol === col.id;

          return (
            <section
              key={col.id}
              onDragOver={(e) => handleDragOverColumn(e, col.id)}
              onDragLeave={() => {
                if (dragOverCol === col.id) setDragOverCol(null);
              }}
              onDrop={(e) => handleDropOnColumn(e, col.id)}
              className={`rounded-xl border p-4 space-y-3 min-h-[420px] transition-colors ${
                isDropTarget
                  ? 'bg-red-50/40 border-[#E52421] ring-2 ring-[#E52421]/20'
                  : 'bg-[#F8F6F4] border-neutral-200'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
                <div>
                  <h3 className={`text-sm font-bold ${col.accentText}`}>{col.title}</h3>
                  <p className="text-[11px] text-neutral-500">{col.subtitle}</p>
                </div>
                <span className="font-mono text-sm font-bold text-[#101014] tabular-nums">
                  {colTasks.length}
                </span>
              </div>

              {colTasks.length === 0 ? (
                <div className="py-12 px-4 text-center text-xs text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
                  {isDropTarget
                    ? `Soltá la tarjeta acá para pasarla a ${col.title}`
                    : `Sin tareas en ${col.title.toLowerCase()} · Arrastrá una tarjeta acá`}
                </div>
              ) : (
                <div className="space-y-3">
                  {colTasks.map((task) => {
                    const prevStatus = getPrevStatus(task.estado);
                    const nextStatus = getNextStatus(task.estado);
                    const isDone = task.estado === 'Completado';
                    const taskSectors = getTaskSectors(task);
                    const primaryVisual =
                      taskSectors.length > 0 ? SECTOR_VISUALS[taskSectors[0]] : null;
                    const isDragging = draggingTaskId === task.id;
                    const isEditingAreas = editingAreasTaskId === task.id;

                    return (
                      <article
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragEnd={() => {
                          setDraggingTaskId(null);
                          setDragOverCol(null);
                        }}
                        className={`rounded-xl border overflow-hidden cursor-grab active:cursor-grabbing transition-all ${
                          isDragging
                            ? 'opacity-50 scale-[0.98]'
                            : isDone || !primaryVisual
                            ? 'bg-white border-neutral-200'
                            : `${primaryVisual.surfaceClass} bg-white ${primaryVisual.borderClass} hover:shadow-xs`
                        }`}
                      >
                        {/* Trello-style Multi-Label Top Color Bar */}
                        <div className="w-full h-2 flex" aria-hidden="true">
                          {taskSectors.length > 0 ? (
                            taskSectors.map((sec) => (
                              <div
                                key={sec}
                                className="flex-1 h-full"
                                style={{ backgroundColor: SECTOR_VISUALS[sec].hex }}
                              />
                            ))
                          ) : (
                            <div className="flex-1 h-full bg-neutral-300" />
                          )}
                        </div>

                        <div className="p-4">
                          {/* Clean unboxed multi-label header + drag grip */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                              <GripVertical className="w-3.5 h-3.5 text-neutral-400 shrink-0 -ml-1" />
                              {taskSectors.length > 0 ? (
                                taskSectors.map((sec, idx) => {
                                  const vis = SECTOR_VISUALS[sec];
                                  return (
                                    <React.Fragment key={sec}>
                                      {idx > 0 && (
                                        <span aria-hidden="true" className="text-neutral-300">
                                          +
                                        </span>
                                      )}
                                      <span className={`font-bold ${vis.textClass}`}>
                                        {vis.label}
                                      </span>
                                    </React.Fragment>
                                  );
                                })
                              ) : (
                                <span className="font-medium text-neutral-400">Sin etiqueta</span>
                              )}
                              <span aria-hidden="true" className="text-neutral-300">
                                ·
                              </span>
                              <span className="font-mono text-neutral-500 tabular-nums">
                                {task.fechaObjetivo}
                              </span>
                            </div>

                            <span
                              className={`text-[11px] font-bold whitespace-nowrap shrink-0 ${PRIORITY_TEXT_CLASS[task.prioridad]}`}
                            >
                              {task.prioridad}
                            </span>
                          </div>

                          <h4
                            className={`text-sm font-semibold leading-snug mb-2 ${
                              isDone ? 'line-through text-neutral-500' : 'text-[#101014]'
                            }`}
                          >
                            {task.titulo}
                          </h4>

                          {(task.empresaNombre || task.linkDrive) && (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600 mb-3">
                              {task.empresaNombre && (
                                <span className="truncate max-w-full font-medium">
                                  {task.empresaNombre}
                                </span>
                              )}
                              {task.linkDrive && (
                                <a
                                  href={task.linkDrive}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#E52421] hover:underline font-medium inline-flex items-center gap-1 whitespace-nowrap"
                                >
                                  <span>Drive</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          )}

                          {/* Inline Multi-Label Editor (allows unchecking all) */}
                          {isEditingAreas && (
                            <div className="mb-3 p-2.5 bg-white border border-neutral-200 rounded-lg space-y-2">
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="font-semibold text-neutral-600">
                                  Etiquetas de esta tarjeta:
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setCardSectors(task, [...ALL_PLAN_SECTORS])}
                                    className="text-[#101014] hover:underline font-medium"
                                  >
                                    Todas
                                  </button>
                                  <span className="text-neutral-300">·</span>
                                  <button
                                    type="button"
                                    onClick={() => setCardSectors(task, [])}
                                    className="text-neutral-500 hover:text-[#DC2626] font-medium"
                                  >
                                    Destildar
                                  </button>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {ALL_PLAN_SECTORS.map((sec) => {
                                  const vis = SECTOR_VISUALS[sec];
                                  const active = taskSectors.includes(sec);
                                  return (
                                    <button
                                      key={sec}
                                      type="button"
                                      onClick={() => toggleCardSector(task, sec)}
                                      className={`px-2 py-1 rounded border text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                                        active
                                          ? vis.activeButtonClass
                                          : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400'
                                      }`}
                                    >
                                      {active && <Check className="w-3 h-3" />}
                                      <span>{vis.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 1-Click Move + Edit Labels + Delete */}
                          <div className="pt-3 border-t border-neutral-200/60 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {prevStatus && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdatePlanTask({ ...task, estado: prevStatus })
                                  }
                                  title={`Retroceder a ${prevStatus}`}
                                  className="px-2 py-1 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-md text-[11px] font-medium text-[#101014] transition-colors inline-flex items-center gap-1"
                                >
                                  <ArrowLeft className="w-3 h-3" />
                                  <span>{prevStatus}</span>
                                </button>
                              )}

                              {nextStatus && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdatePlanTask({ ...task, estado: nextStatus })
                                  }
                                  title={`Avanzar a ${nextStatus}`}
                                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors inline-flex items-center gap-1 ${
                                    nextStatus === 'Completado'
                                      ? 'bg-[#16A34A] hover:bg-[#15803D] text-white'
                                      : 'bg-[#101014] hover:bg-neutral-800 text-white'
                                  }`}
                                >
                                  <span>{nextStatus}</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              )}

                              {task.estado === 'Pendiente' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdatePlanTask({ ...task, estado: 'Completado' })
                                  }
                                  title="Marcar directo como Completado"
                                  className="p-1 text-neutral-400 hover:text-[#16A34A] rounded-md transition-colors"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openEditModal(task)}
                                title="Editar tarjeta"
                                className="p-1.5 rounded-md text-neutral-400 hover:text-[#101014] hover:bg-neutral-100 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingAreasTaskId(isEditingAreas ? null : task.id)
                                }
                                title="Editar etiquetas de esta tarjeta"
                                className={`p-1.5 rounded-md transition-colors ${
                                  isEditingAreas
                                    ? 'bg-[#101014] text-white'
                                    : 'text-neutral-400 hover:text-[#101014]'
                                }`}
                              >
                                <Users className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeletePlanTask(task.id)}
                                title="Eliminar tarea"
                                className="p-1.5 text-neutral-400 hover:text-[#DC2626] rounded-md transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* HISTORIAL DE TAREAS FINALIZADAS (ÚLTIMAS 20 + PAGINACIÓN + FILTROS INDEPENDIENTES) */}
      <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 bg-[#F8F6F4] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <History className="w-4 h-4 text-[#16A34A] mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-[#101014]">
                Historial de Tareas Finalizadas ({filteredHistoryTasks.length})
              </h2>
              <p className="text-xs text-neutral-500">
                Muestra siempre las últimas 20 finalizadas por página · Filtros de etiquetas y
                fechas independientes entre sí
              </p>
            </div>
          </div>

          {(!historyShowAllLabels || historyDateFrom || historyDateTo) && (
            <button
              type="button"
              onClick={() => {
                handleResetHistoryLabels();
                handleClearHistoryDates();
              }}
              className="px-3 py-1.5 bg-white border border-neutral-200 hover:border-[#101014] text-[#101014] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              Limpiar todos los filtros
            </button>
          )}
        </div>

        {/* Independent Filters Bar: Etiquetas (left) + Fechas (right) */}
        <div className="px-5 py-3.5 border-b border-neutral-200 bg-white flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Independent Label Filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-neutral-500 mr-1">Etiquetas:</span>
            <button
              type="button"
              onClick={handleResetHistoryLabels}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                historyShowAllLabels
                  ? 'bg-[#101014] border-[#101014] text-white'
                  : 'bg-white border-neutral-200 text-neutral-600 hover:border-[#101014] hover:text-[#101014]'
              }`}
            >
              Todas
            </button>

            {ALL_PLAN_SECTORS.map((sec) => {
              const vis = SECTOR_VISUALS[sec];
              const isSelected = !historyShowAllLabels && historySelectedLabels.includes(sec);
              return (
                <button
                  key={sec}
                  type="button"
                  onClick={() => handleToggleHistoryLabel(sec)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    isSelected
                      ? vis.activeButtonClass
                      : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400 hover:text-[#101014]'
                  }`}
                >
                  {isSelected ? (
                    <Check className="w-3 h-3 shrink-0" />
                  ) : (
                    <span
                      className="w-2 h-2 rounded-[2px] shrink-0"
                      style={{ backgroundColor: vis.hex }}
                    />
                  )}
                  <span>{vis.label}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => handleToggleHistoryLabel('Sin etiqueta')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap flex items-center gap-1 ${
                !historyShowAllLabels && historySelectedLabels.includes('Sin etiqueta')
                  ? 'bg-neutral-700 border-neutral-700 text-white'
                  : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-400 hover:text-[#101014]'
              }`}
            >
              {!historyShowAllLabels && historySelectedLabels.includes('Sin etiqueta') && (
                <Check className="w-3 h-3 shrink-0" />
              )}
              <span>Sin etiqueta</span>
            </button>
          </div>

          {/* Independent Date Range Filter */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[11px] font-semibold text-neutral-500">Fechas:</span>
            <div className="flex items-center gap-1.5">
              <label htmlFor="history-date-from" className="text-[11px] text-neutral-500">
                Desde
              </label>
              <input
                id="history-date-from"
                type="date"
                value={historyDateFrom}
                onChange={(e) => {
                  setHistoryDateFrom(e.target.value);
                  setHistoryPage(1);
                }}
                className="px-2.5 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-mono tabular-nums text-[#101014] focus:outline-none focus:border-[#101014]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label htmlFor="history-date-to" className="text-[11px] text-neutral-500">
                Hasta
              </label>
              <input
                id="history-date-to"
                type="date"
                value={historyDateTo}
                onChange={(e) => {
                  setHistoryDateTo(e.target.value);
                  setHistoryPage(1);
                }}
                className="px-2.5 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-mono tabular-nums text-[#101014] focus:outline-none focus:border-[#101014]"
              />
            </div>
            {(historyDateFrom || historyDateTo) && (
              <button
                type="button"
                onClick={handleClearHistoryDates}
                className="px-2 py-1 text-[11px] font-medium text-neutral-500 hover:text-[#DC2626] transition-colors whitespace-nowrap"
              >
                Limpiar fechas
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {paginatedHistoryTasks.length === 0 ? (
          <div className="p-10 text-center text-xs text-neutral-500">
            {allCompletedTasks.length === 0
              ? 'Todavía no hay tareas finalizadas registradas.'
              : 'No se encontraron tareas finalizadas para los filtros seleccionados.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-[#F8F6F4]/70 text-[11px] font-semibold text-neutral-500">
                  <th className="py-2.5 px-4 whitespace-nowrap">Fecha</th>
                  <th className="py-2.5 px-4">Tarea finalizada</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Etiquetas</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Empresa</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Prioridad</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-xs">
                {paginatedHistoryTasks.map((task) => {
                  const sectors = getTaskSectors(task);
                  return (
                    <tr
                      key={task.id}
                      className="hover:bg-[#F8F6F4]/60 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono tabular-nums text-neutral-600 whitespace-nowrap">
                        {task.fechaObjetivo || '—'}
                      </td>
                      <td className="py-3 px-4 min-w-[240px]">
                        <div className="font-semibold text-[#101014] leading-snug">
                          {task.titulo}
                        </div>
                        {task.semana && (
                          <div className="text-[11px] text-neutral-400 mt-0.5">{task.semana}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {sectors.length > 0 ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {sectors.map((sec, idx) => {
                              const vis = SECTOR_VISUALS[sec];
                              return (
                                <React.Fragment key={sec}>
                                  {idx > 0 && (
                                    <span aria-hidden="true" className="text-neutral-300">
                                      +
                                    </span>
                                  )}
                                  <span
                                    className={`inline-flex items-center gap-1 font-bold ${vis.textClass}`}
                                  >
                                    <span
                                      className="w-2 h-2 rounded-[2px] shrink-0"
                                      style={{ backgroundColor: vis.hex }}
                                    />
                                    {vis.label}
                                  </span>
                                </React.Fragment>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-neutral-400">Sin etiqueta</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-neutral-700 whitespace-nowrap">
                        {task.empresaNombre || '—'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`font-bold ${PRIORITY_TEXT_CLASS[task.prioridad]}`}>
                          {task.prioridad}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(task)}
                            title="Editar tarea"
                            className="p-1.5 text-neutral-400 hover:text-[#101014] hover:bg-neutral-100 rounded-md transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdatePlanTask({ ...task, estado: 'En Proceso' })}
                            title="Reabrir (volver a En Proceso)"
                            className="p-1.5 text-neutral-400 hover:text-[#D97706] hover:bg-amber-50 rounded-md transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeletePlanTask(task.id)}
                            title="Eliminar tarea"
                            className="p-1.5 text-neutral-400 hover:text-[#DC2626] hover:bg-red-50 rounded-md transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="px-5 py-3 border-t border-neutral-200 bg-[#F8F6F4]/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-neutral-600 font-mono tabular-nums">
            {filteredHistoryTasks.length === 0 ? (
              <span>0 resultados</span>
            ) : (
              <span>
                Mostrando {historyStartIdx + 1}–
                {Math.min(historyStartIdx + HISTORY_PAGE_SIZE, filteredHistoryTasks.length)} de{' '}
                {filteredHistoryTasks.length} tareas finalizadas
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safeHistoryPage <= 1}
              onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1.5 bg-white border border-neutral-200 hover:border-[#101014] disabled:opacity-40 disabled:hover:border-neutral-200 rounded-lg text-xs font-medium text-[#101014] inline-flex items-center gap-1 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Anterior</span>
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: historyTotalPages }, (_, idx) => idx + 1)
                .filter(
                  (pageNum) =>
                    pageNum === 1 ||
                    pageNum === historyTotalPages ||
                    Math.abs(pageNum - safeHistoryPage) <= 1
                )
                .map((pageNum, idx, arr) => {
                  const prevPage = arr[idx - 1];
                  const showEllipsis = prevPage !== undefined && pageNum - prevPage > 1;
                  return (
                    <React.Fragment key={pageNum}>
                      {showEllipsis && (
                        <span className="px-1 text-neutral-400 select-none">…</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setHistoryPage(pageNum)}
                        className={`min-w-[30px] h-7 px-2 rounded-lg text-xs font-mono font-semibold tabular-nums border transition-colors ${
                          pageNum === safeHistoryPage
                            ? 'bg-[#101014] border-[#101014] text-white'
                            : 'bg-white border-neutral-200 text-[#101014] hover:border-[#101014]'
                        }`}
                      >
                        {pageNum}
                      </button>
                    </React.Fragment>
                  );
                })}
            </div>

            <button
              type="button"
              disabled={safeHistoryPage >= historyTotalPages}
              onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
              className="px-2.5 py-1.5 bg-white border border-neutral-200 hover:border-[#101014] disabled:opacity-40 disabled:hover:border-neutral-200 rounded-lg text-xs font-medium text-[#101014] inline-flex items-center gap-1 transition-colors"
            >
              <span>Siguiente</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* EDIT EXISTING CARD MODAL */}
      {editingTaskId && (
        <div
          className="fixed inset-0 z-50 bg-[#101014]/65 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={closeEditModal}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl border border-neutral-200 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#101014] text-white px-5 py-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold tracking-tight">Editar tarjeta</h2>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Modificá título, etiquetas, fecha, prioridad, columna o empresa vinculada
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                aria-label="Cerrar modal de edición"
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedTask} className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                  Título de la tarea / acuerdo *
                </label>
                <input
                  required
                  autoFocus
                  value={editTitulo}
                  onChange={(e) => setEditTitulo(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-[#101014] focus:outline-none focus:border-[#101014]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="text-[11px] font-semibold text-neutral-700">
                    Etiquetas / áreas vinculadas
                  </label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setEditSectors([...ALL_PLAN_SECTORS])}
                      className="font-semibold text-[#101014] hover:underline"
                    >
                      Todas
                    </button>
                    <span className="text-neutral-300">·</span>
                    <button
                      type="button"
                      onClick={() => setEditSectors([])}
                      className="font-medium text-neutral-500 hover:text-[#DC2626]"
                    >
                      Destildar todas
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ALL_PLAN_SECTORS.map((sec) => {
                    const vis = SECTOR_VISUALS[sec];
                    const selected = editSectors.includes(sec);
                    return (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => toggleEditSector(sec)}
                        className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-between gap-2 ${
                          selected
                            ? vis.activeButtonClass
                            : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span
                            className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                            style={{ backgroundColor: selected ? '#FFFFFF' : vis.hex }}
                          />
                          <span className="truncate">{vis.label}</span>
                        </span>
                        {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                    Fecha objetivo
                  </label>
                  <input
                    type="date"
                    required
                    value={editFechaObjetivo}
                    onChange={(e) => setEditFechaObjetivo(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs font-mono text-[#101014] focus:outline-none focus:border-[#101014]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                    Prioridad
                  </label>
                  <select
                    value={editPrioridad}
                    onChange={(e) => setEditPrioridad(e.target.value as PlanPriority)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white text-[#101014] focus:outline-none focus:border-[#101014]"
                  >
                    <option value="Baja">Baja</option>
                    <option value="Media">Media</option>
                    <option value="Alta">Alta</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                    Columna / Estado
                  </label>
                  <select
                    value={editEstado}
                    onChange={(e) => setEditEstado(e.target.value as PlanColumnStatus)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white text-[#101014] focus:outline-none focus:border-[#101014]"
                  >
                    <option value="Pendiente">Pendiente</option>
                    <option value="En Proceso">En Proceso</option>
                    <option value="Completado">Completado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                  Empresa / Comunidad vinculada
                </label>
                <select
                  value={editEmpresaId}
                  onChange={(e) => setEditEmpresaId(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white text-[#101014] focus:outline-none focus:border-[#101014]"
                >
                  <option value="">Sin empresa específica</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.estado})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="px-4 py-2 text-xs font-medium text-neutral-600 hover:text-[#101014] rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#E52421] hover:bg-[#C91D1A] text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
