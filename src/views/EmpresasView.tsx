import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  Download,
  ExternalLink,
  HeartHandshake,
  History,
  ListPlus,
  Plus,
  Search,
  Trash2,
  UserMinus,
  X,
} from 'lucide-react';
import {
  COMPANY_ACTIVITY_TYPES,
  COMPANY_STATUS_OPTIONS,
  FIDELIZACION_TIPOS,
  TUCUMAN_LOCALIDADES,
  type Company,
  type CompanyActivityRecord,
  type CompanyActivityType,
  type CompanyStatus,
  type FidelizacionRecord,
  type FidelizacionTipo,
  type PlanTask,
} from '../types';
import { CURRENT_PLAN_WEEK } from '../data/seedData';
import {
  buildWhatsAppUrl,
  calcMonthlyAmount,
  formatARS,
  sanitizeFirestoreId,
} from '../utils/calculations';
import { exportEmpresasExcel } from '../utils/planHelpers';
import { QuickTaskModal } from '../components/QuickTaskModal';

interface EmpresasViewProps {
  companies: Company[];
  fidelizaciones: FidelizacionRecord[];
  companyActivities: CompanyActivityRecord[];
  onUpdateCompany: (company: Company) => void;
  onDeleteCompany: (companyId: string) => void;
  onOpenNewCompany: (defaultStatus: CompanyStatus) => void;
  onAddPlanTask: (task: PlanTask) => void;
  onAddFidelizacion: (item: FidelizacionRecord) => void;
  onDeleteFidelizacion: (id: string) => void;
  onAddCompanyActivity: (item: CompanyActivityRecord) => void;
}

type EmpresasSubView = 'empresas' | 'fidelizaciones' | 'historial';
type CategoryFilter = CompanyStatus | 'Todas';

function getStatusLabel(status: CompanyStatus): string {
  return COMPANY_STATUS_OPTIONS.find((opt) => opt.value === status)?.label ?? status;
}

function formatShortDateAR(iso: string): string {
  if (!iso || !iso.includes('-')) return iso;
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path d="M20.52 3.48A11.86 11.86 0 0 0 12.06 0C5.49 0 .14 5.35.14 11.92c0 2.1.55 4.15 1.59 5.96L0 24l6.29-1.65a11.87 11.87 0 0 0 5.76 1.47h.01c6.57 0 11.92-5.35 11.92-11.92 0-3.18-1.24-6.17-3.46-8.42ZM12.06 21.8h-.01a9.86 9.86 0 0 1-5.03-1.38l-.36-.21-3.73.98 1-3.64-.24-.37a9.87 9.87 0 0 1-1.51-5.26c0-5.45 4.44-9.89 9.89-9.89 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.89 9.88Zm5.42-7.41c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.06 2.88 1.21 3.08.15.2 2.09 3.19 5.06 4.47.71.3 1.26.49 1.69.62.71.23 1.35.2 1.86.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35Z" />
  </svg>
);

function getStatusColorClass(status: CompanyStatus): string {
  switch (status) {
    case 'Activa':
      return 'text-[#16A34A]';
    case 'Prospecto':
      return 'text-[#D97706]';
    case 'Prospecto rechazada':
      return 'text-[#DC2626]';
    case 'Dado de baja':
      return 'text-neutral-500';
    case 'Otros':
      return 'text-[#7C3AED]';
    default:
      return 'text-neutral-600';
  }
}

function getActivityColorClass(tipo: CompanyActivityType): string {
  switch (tipo) {
    case 'Paso a Activa':
      return 'text-[#16A34A]';
    case 'Creación':
      return 'text-[#2563EB]';
    case 'Baja':
      return 'text-[#D97706]';
    case 'Cambio de estado':
      return 'text-[#7C3AED]';
    case 'Eliminación':
      return 'text-[#DC2626]';
    default:
      return 'text-neutral-600';
  }
}

export const EmpresasView: React.FC<EmpresasViewProps> = ({
  companies,
  fidelizaciones,
  companyActivities,
  onUpdateCompany,
  onDeleteCompany,
  onOpenNewCompany,
  onAddPlanTask,
  onAddFidelizacion,
  onDeleteFidelizacion,
  onAddCompanyActivity,
}) => {
  const [subView, setSubView] = useState<EmpresasSubView>('empresas');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('Activa');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>(companies[0]?.id ?? '');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState('');
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  // Unified status-change modal state (motivo optional except Activa -> Dado de baja)
  const [statusChangeModal, setStatusChangeModal] = useState<{
    company: Company;
    nextEstado: CompanyStatus;
  } | null>(null);
  const [statusChangeFecha, setStatusChangeFecha] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [statusChangeMotivo, setStatusChangeMotivo] = useState<string>('');

  // Historial de actividades filter state
  const [actFilterType, setActFilterType] = useState<'Todos' | CompanyActivityType>('Todos');
  const [actFilterStatus, setActFilterStatus] = useState<'Todas' | CompanyStatus>('Todas');
  const [actSearch, setActSearch] = useState<string>('');
  const [actDateFrom, setActDateFrom] = useState<string>('');
  const [actDateTo, setActDateTo] = useState<string>('');

  // Reporte de uso modal state
  const [reporteModalOpen, setReporteModalOpen] = useState(false);
  const [reporteFechaPedido, setReporteFechaPedido] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [reporteFechaEntrega, setReporteFechaEntrega] = useState<string>('');

  // Fidelizaciones form & filter state
  const [fidEmpresaId, setFidEmpresaId] = useState<string>(companies[0]?.id ?? '');
  const [fidFecha, setFidFecha] = useState<string>('2026-11-26');
  const [fidTipo, setFidTipo] = useState<FidelizacionTipo>('Visita');
  const [fidNotas, setFidNotas] = useState<string>('');
  const [fidFilterTipo, setFidFilterTipo] = useState<'Todos' | FidelizacionTipo>('Todos');
  const [fidFilterEmpresa, setFidFilterEmpresa] = useState<string>('Todas');

  const statusCounts = useMemo(() => {
    const counts: Record<CompanyStatus, number> = {
      Activa: 0,
      Prospecto: 0,
      'Prospecto rechazada': 0,
      'Dado de baja': 0,
      Otros: 0,
    };
    for (const c of companies) {
      if (c.estado in counts) {
        counts[c.estado] += 1;
      }
    }
    return counts;
  }, [companies]);

  const filteredList = useMemo(() => {
    return companies
      .filter((c) => (categoryFilter === 'Todas' ? true : c.estado === categoryFilter))
      .filter((c) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          c.nombre.toLowerCase().includes(q) ||
          c.localidad.toLowerCase().includes(q) ||
          c.contactoPrincipal.toLowerCase().includes(q)
        );
      });
  }, [companies, categoryFilter, search]);

  const selectedCompany = useMemo(() => {
    const match = companies.find((c) => c.id === selectedId);
    if (match && (categoryFilter === 'Todas' || match.estado === categoryFilter)) return match;
    return filteredList[0] ?? null;
  }, [companies, selectedId, categoryFilter, filteredList]);

  const filteredFidelizaciones = useMemo(() => {
    return [...fidelizaciones]
      .filter((f) => (fidFilterTipo === 'Todos' ? true : f.tipo === fidFilterTipo))
      .filter((f) => (fidFilterEmpresa === 'Todas' ? true : f.empresaId === fidFilterEmpresa))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [fidelizaciones, fidFilterTipo, fidFilterEmpresa]);

  const filteredActivities = useMemo(() => {
    return [...companyActivities]
      .filter((a) => (actFilterType === 'Todos' ? true : a.tipo === actFilterType))
      .filter((a) => {
        if (actFilterStatus === 'Todas') return true;
        if (a.estadoNuevo === actFilterStatus || a.estadoAnterior === actFilterStatus) return true;
        const linked = companies.find((c) => c.id === a.empresaId);
        return linked ? linked.estado === actFilterStatus : false;
      })
      .filter((a) => {
        if (actDateFrom && (a.fecha || '') < actDateFrom) return false;
        if (actDateTo && (a.fecha || '') > actDateTo) return false;
        return true;
      })
      .filter((a) => {
        if (!actSearch.trim()) return true;
        const q = actSearch.toLowerCase();
        return (
          a.empresaNombre.toLowerCase().includes(q) ||
          a.detalle.toLowerCase().includes(q) ||
          a.tipo.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const byDate = (b.fecha || '').localeCompare(a.fecha || '');
        if (byDate !== 0) return byDate;
        return b.id.localeCompare(a.id);
      });
  }, [companyActivities, companies, actFilterType, actFilterStatus, actDateFrom, actDateTo, actSearch]);

  const showSavedFlash = (msg: string) => {
    setSavedNotice(msg);
    window.setTimeout(() => setSavedNotice(''), 3200);
  };

  const patchSelected = (patch: Partial<Company>) => {
    if (!selectedCompany) return;
    onUpdateCompany({ ...selectedCompany, ...patch });
  };

  const handleChangeCompanyStatus = (company: Company, nextEstado: CompanyStatus) => {
    if (nextEstado === company.estado) return;
    setStatusChangeModal({ company, nextEstado });
    setStatusChangeFecha(new Date().toISOString().slice(0, 10));
    setStatusChangeMotivo('');
  };

  const handleConfirmStatusChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusChangeModal || !statusChangeFecha) return;

    const { company, nextEstado } = statusChangeModal;
    const prevEstado = company.estado;
    const isMotivoRequired = prevEstado === 'Activa' && nextEstado === 'Dado de baja';
    const cleanMotivo = statusChangeMotivo.trim();

    if (isMotivoRequired && !cleanMotivo) return;

    const updatedCompany: Company = {
      ...company,
      estado: nextEstado,
      ...(nextEstado === 'Dado de baja'
        ? { fechaBaja: statusChangeFecha, motivoBaja: cleanMotivo }
        : {}),
    };

    onUpdateCompany(updatedCompany);

    const activityType: CompanyActivityType =
      nextEstado === 'Dado de baja'
        ? 'Baja'
        : nextEstado === 'Activa'
          ? 'Paso a Activa'
          : 'Cambio de estado';

    const defaultDetalle =
      nextEstado === 'Activa'
        ? `Pasó de ${getStatusLabel(prevEstado)} a Clientes activas.`
        : nextEstado === 'Dado de baja'
          ? `Dada de baja desde ${getStatusLabel(prevEstado)}.`
          : `Cambió de ${getStatusLabel(prevEstado)} a ${getStatusLabel(nextEstado)}.`;

    onAddCompanyActivity({
      id: sanitizeFirestoreId('act'),
      empresaId: company.id,
      empresaNombre: company.nombre,
      tipo: activityType,
      fecha: statusChangeFecha,
      detalle: cleanMotivo || defaultDetalle,
      estadoAnterior: prevEstado,
      estadoNuevo: nextEstado,
    });

    if (nextEstado === 'Dado de baja' || categoryFilter !== 'Todas') {
      setCategoryFilter(nextEstado);
    }
    setSubView('empresas');
    setSelectedId(company.id);
    setStatusChangeModal(null);
    setStatusChangeMotivo('');

    showSavedFlash(
      nextEstado === 'Dado de baja'
        ? `${company.nombre} fue dada de baja y recopilada en Clientes dados de baja.`
        : nextEstado === 'Activa'
          ? `${company.nombre} pasó a Clientes activas y ya figura en Cobranzas.`
          : `${company.nombre} pasó a ${getStatusLabel(nextEstado)}.`
    );
  };

  const handleActivateCompany = (company: Company) => {
    handleChangeCompanyStatus(company, 'Activa');
  };

  const handleCreateFidelizacion = (e: React.FormEvent) => {
    e.preventDefault();
    const targetCompany = companies.find((c) => c.id === fidEmpresaId) ?? companies[0];
    if (!targetCompany || !fidFecha) return;

    const planTaskId = sanitizeFirestoreId('plan');
    const fidId = sanitizeFirestoreId('fid');
    const cleanNotas = fidNotas.trim();

    onAddFidelizacion({
      id: fidId,
      empresaId: targetCompany.id,
      empresaNombre: targetCompany.nombre,
      fecha: fidFecha,
      tipo: fidTipo,
      notas: cleanNotas,
      planTaskId,
    });

    // Automatically push to Planificación Semanal with the "Empresas" label
    const taskTitle = cleanNotas
      ? `Fidelización (${fidTipo}) · ${targetCompany.nombre} — ${cleanNotas}`
      : `Fidelización (${fidTipo}) · ${targetCompany.nombre}`;

    onAddPlanTask({
      id: planTaskId,
      titulo: taskTitle,
      sector: 'Empresas',
      sectores: ['Empresas'],
      fechaObjetivo: fidFecha,
      semana: CURRENT_PLAN_WEEK,
      prioridad: 'Media',
      estado: 'Pendiente',
      empresaId: targetCompany.id,
      empresaNombre: targetCompany.nombre,
      linkDrive: '',
    });

    setFidNotas('');
    showSavedFlash(
      `Fidelización (${fidTipo}) creada para ${targetCompany.nombre} y agregada a Planificación Semanal con etiqueta Empresas.`
    );
  };

  const handleCreateReporteUso = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !reporteFechaPedido || !reporteFechaEntrega) return;

    const titulo = `Reporte de uso · ${selectedCompany.nombre} (Pedido: ${formatShortDateAR(
      reporteFechaPedido
    )} · Entrega: ${formatShortDateAR(reporteFechaEntrega)})`;

    onAddPlanTask({
      id: sanitizeFirestoreId('plan'),
      titulo: titulo.slice(0, 200),
      sector: 'Empresas',
      sectores: ['Empresas'],
      fechaObjetivo: reporteFechaEntrega,
      semana: CURRENT_PLAN_WEEK,
      prioridad: 'Alta',
      estado: 'Pendiente',
      empresaId: selectedCompany.id,
      empresaNombre: selectedCompany.nombre,
      linkDrive: '',
    });

    setReporteModalOpen(false);
    setReporteFechaEntrega('');
    showSavedFlash(
      `Reporte de uso de ${selectedCompany.nombre} agendado en Planificación Semanal con prioridad Alta.`
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Top Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-neutral-500 mb-1">
            Ficha Maestra de Empresas y Prospectos · Miguel (Comercial)
          </p>
          <h1 className="text-2xl font-bold text-[#101014] tracking-tight">
            Empresas y Fidelizaciones
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => exportEmpresasExcel(companies)}
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
          <button
            type="button"
            onClick={() =>
              onOpenNewCompany(categoryFilter === 'Todas' ? 'Prospecto' : categoryFilter)
            }
            className="px-4 py-2 bg-[#E52421] hover:bg-[#C91D1A] text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Empresa</span>
          </button>
        </div>
      </div>

      {savedNotice && (
        <div className="px-4 py-2.5 bg-[#101014] text-white text-xs font-medium rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* Navigation Bar: Category Dropdown + Fidelizaciones + Mapa */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Dropdown */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
              subView === 'empresas'
                ? 'bg-[#101014] border-[#101014] text-white'
                : 'bg-white border-neutral-200 text-[#101014]'
            }`}
          >
            <label htmlFor="empresas-category-select" className="sr-only">
              Filtrar categoría de empresas
            </label>
            <select
              id="empresas-category-select"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value as CategoryFilter);
                setSubView('empresas');
              }}
              onClick={() => {
                if (subView !== 'empresas') setSubView('empresas');
              }}
              className={`text-xs font-semibold bg-transparent focus:outline-none cursor-pointer pr-1 ${
                subView === 'empresas' ? 'text-white' : 'text-[#101014]'
              }`}
            >
              {COMPANY_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="text-[#101014] bg-white">
                  {opt.label} ({statusCounts[opt.value]})
                </option>
              ))}
              <option value="Todas" className="text-[#101014] bg-white">
                Todas las empresas ({companies.length})
              </option>
            </select>
          </div>

          {/* Fidelizaciones Space Button */}
          <button
            type="button"
            onClick={() => {
              if (!fidEmpresaId && companies[0]) setFidEmpresaId(companies[0].id);
              setSubView('fidelizaciones');
            }}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              subView === 'fidelizaciones'
                ? 'bg-[#E52421] border-[#E52421] text-white'
                : 'bg-white border-neutral-200 text-[#101014] hover:border-[#101014]'
            }`}
          >
            <HeartHandshake className="w-3.5 h-3.5" />
            <span>Fidelizaciones ({fidelizaciones.length})</span>
          </button>

          {/* Historial de Actividades Button */}
          <button
            type="button"
            onClick={() => setSubView('historial')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              subView === 'historial'
                ? 'bg-[#101014] border-[#101014] text-white'
                : 'bg-white border-neutral-200 text-[#101014] hover:border-[#101014]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Historial de actividades ({companyActivities.length})</span>
          </button>
        </div>

        {subView === 'empresas' && (
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar empresa o contacto..."
                className="pl-8 pr-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs w-56 focus:outline-none focus:border-[#101014]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Body */}
      {subView === 'historial' ? (
        /* HISTORIAL DE ACTIVIDADES DE EMPRESAS */
        <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-200 bg-[#F8F6F4] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#101014]">
                Historial de Actividades ({filteredActivities.length})
              </h2>
              <p className="text-xs text-neutral-500">
                Movimientos relevantes de empresas: creaciones, pasos a activas, bajas con motivo,
                cambios de estado y eliminaciones
              </p>
            </div>

            {(actFilterType !== 'Todos' ||
              actFilterStatus !== 'Todas' ||
              actSearch ||
              actDateFrom ||
              actDateTo) && (
              <button
                type="button"
                onClick={() => {
                  setActFilterType('Todos');
                  setActFilterStatus('Todas');
                  setActSearch('');
                  setActDateFrom('');
                  setActDateTo('');
                }}
                className="px-3 py-1.5 bg-white border border-neutral-200 hover:border-[#101014] text-[#101014] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="px-6 py-3.5 border-b border-neutral-200 bg-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Category Selector matching main selector */}
              <div
                className={`flex items-center px-2.5 py-1 rounded-lg border transition-colors ${
                  actFilterStatus !== 'Todas'
                    ? 'bg-[#101014] border-[#101014] text-white'
                    : 'bg-white border-neutral-300 text-[#101014]'
                }`}
              >
                <label htmlFor="act-status-filter" className="sr-only">
                  Filtrar actividades por categoría de empresa
                </label>
                <select
                  id="act-status-filter"
                  value={actFilterStatus}
                  onChange={(e) => setActFilterStatus(e.target.value as 'Todas' | CompanyStatus)}
                  className={`text-xs font-semibold bg-transparent focus:outline-none cursor-pointer pr-1 ${
                    actFilterStatus !== 'Todas' ? 'text-white' : 'text-[#101014]'
                  }`}
                >
                  <option value="Todas" className="text-[#101014] bg-white">
                    Todas las categorías
                  </option>
                  {COMPANY_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="text-[#101014] bg-white">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <span className="text-neutral-300 px-0.5 hidden sm:inline" aria-hidden="true">
                |
              </span>

              <button
                type="button"
                onClick={() => setActFilterType('Todos')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                  actFilterType === 'Todos'
                    ? 'bg-[#101014] border-[#101014] text-white'
                    : 'bg-white border-neutral-200 text-neutral-600 hover:border-[#101014]'
                }`}
              >
                Todos
              </button>
              {COMPANY_ACTIVITY_TYPES.map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setActFilterType(tipo)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                    actFilterType === tipo
                      ? 'bg-[#101014] border-[#101014] text-white'
                      : 'bg-white border-neutral-200 text-neutral-600 hover:border-[#101014]'
                  }`}
                >
                  {tipo}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={actSearch}
                  onChange={(e) => setActSearch(e.target.value)}
                  placeholder="Buscar empresa o motivo..."
                  className="pl-8 pr-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs w-48 focus:outline-none focus:border-[#101014]"
                />
              </div>
              <input
                type="date"
                aria-label="Fecha desde"
                value={actDateFrom}
                onChange={(e) => setActDateFrom(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-mono tabular-nums text-[#101014]"
              />
              <span className="text-neutral-400">a</span>
              <input
                type="date"
                aria-label="Fecha hasta"
                value={actDateTo}
                onChange={(e) => setActDateTo(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-mono tabular-nums text-[#101014]"
              />
            </div>
          </div>

          {filteredActivities.length === 0 ? (
            <div className="p-10 text-center text-xs text-neutral-500">
              No hay movimientos registrados para el filtro seleccionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200 bg-[#F8F6F4]/70 text-[11px] font-semibold text-neutral-500">
                    <th className="py-2.5 px-5 whitespace-nowrap">Fecha</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">Movimiento</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">Empresa</th>
                    <th className="py-2.5 px-5">Detalle / Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-xs">
                  {filteredActivities.map((act) => {
                    const existingCompany = companies.find((c) => c.id === act.empresaId);
                    return (
                      <tr key={act.id} className="hover:bg-[#F8F6F4]/60 transition-colors">
                        <td className="py-3 px-5 font-mono tabular-nums text-neutral-600 whitespace-nowrap">
                          {act.fecha}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`font-bold ${getActivityColorClass(act.tipo)}`}>
                            {act.tipo}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {existingCompany ? (
                            <button
                              type="button"
                              onClick={() => {
                                setCategoryFilter(existingCompany.estado);
                                setSelectedId(existingCompany.id);
                                setSubView('empresas');
                              }}
                              className="font-semibold text-[#101014] hover:text-[#E52421] hover:underline text-left"
                            >
                              {act.empresaNombre}
                            </button>
                          ) : (
                            <span className="font-semibold text-neutral-500">
                              {act.empresaNombre}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-5 text-neutral-700 leading-relaxed min-w-[260px]">
                          <div>{act.detalle}</div>
                          {act.estadoAnterior && act.estadoNuevo && (
                            <div className="text-[11px] text-neutral-400 mt-0.5">
                              {getStatusLabel(act.estadoAnterior as CompanyStatus)} →{' '}
                              {getStatusLabel(act.estadoNuevo as CompanyStatus)}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : subView === 'fidelizaciones' ? (
        /* ESPACIO DE FIDELIZACIONES */
        <div className="space-y-6">
          {/* Creation Form */}
          <section className="bg-white border border-neutral-200 rounded-xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-5 border-b border-neutral-200">
              <div>
                <h2 className="text-base font-bold text-[#101014]">
                  Nueva Acción de Fidelización
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Al crearla, se agenda automáticamente en{' '}
                  <strong className="text-[#101014]">Planificación Semanal</strong> con la etiqueta{' '}
                  <strong className="text-[#B45309]">Empresas</strong>
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateFidelizacion} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-5">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Empresa *
                  </label>
                  <select
                    required
                    value={fidEmpresaId}
                    onChange={(e) => setFidEmpresaId(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white text-[#101014] focus:outline-none focus:border-[#101014]"
                  >
                    {companies.length === 0 ? (
                      <option value="">Sin empresas cargadas</option>
                    ) : (
                      companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} — {getStatusLabel(c.estado)}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Fecha *
                  </label>
                  <input
                    type="date"
                    required
                    value={fidFecha}
                    onChange={(e) => setFidFecha(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono text-[#101014] focus:outline-none focus:border-[#101014]"
                  />
                </div>

                <div className="md:col-span-4">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Tipo de fidelización *
                  </label>
                  <select
                    required
                    value={fidTipo}
                    onChange={(e) => setFidTipo(e.target.value as FidelizacionTipo)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white text-[#101014] focus:outline-none focus:border-[#101014]"
                  >
                    {FIDELIZACION_TIPOS.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {tipo}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-9">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Detalle / Observaciones (opcional)
                  </label>
                  <input
                    value={fidNotas}
                    onChange={(e) => setFidNotas(e.target.value)}
                    placeholder="Ej. Reunión con RRHH para presentar nuevos comercios adheridos y entregar folletería..."
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-[#101014] focus:outline-none focus:border-[#101014]"
                  />
                </div>

                <div className="md:col-span-3">
                  <button
                    type="submit"
                    disabled={companies.length === 0}
                    className="w-full py-2.5 px-4 bg-[#E52421] hover:bg-[#C91D1A] disabled:bg-neutral-300 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Crear Fidelización</span>
                  </button>
                </div>
              </div>
            </form>
          </section>

          {/* Fidelizaciones List */}
          <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-200 bg-[#F8F6F4] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#101014]">
                  Registro de Fidelizaciones ({filteredFidelizaciones.length})
                </h3>
                <p className="text-xs text-neutral-500">
                  Historial y agenda de acciones vinculadas a tus empresas
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filtrar fidelizaciones por empresa"
                  value={fidFilterEmpresa}
                  onChange={(e) => setFidFilterEmpresa(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs text-[#101014]"
                >
                  <option value="Todas">Todas las empresas</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filtrar fidelizaciones por tipo"
                  value={fidFilterTipo}
                  onChange={(e) => setFidFilterTipo(e.target.value as 'Todos' | FidelizacionTipo)}
                  className="px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs text-[#101014]"
                >
                  <option value="Todos">Todos los tipos</option>
                  {FIDELIZACION_TIPOS.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredFidelizaciones.length === 0 ? (
              <div className="p-10 text-center text-xs text-neutral-500">
                No hay fidelizaciones registradas para el filtro seleccionado.
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {filteredFidelizaciones.map((fid) => (
                  <div
                    key={fid.id}
                    className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F8F6F4]/60 transition-colors"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-[#B45309]">{fid.tipo}</span>
                        <span aria-hidden="true" className="text-neutral-300">
                          ·
                        </span>
                        <span className="font-mono text-neutral-600 tabular-nums inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-neutral-400" />
                          {fid.fecha}
                        </span>
                        <span aria-hidden="true" className="text-neutral-300">
                          ·
                        </span>
                        <span className="text-[11px] font-medium text-neutral-500">
                          Etiqueta Planificación: <strong className="text-[#B45309]">Empresas</strong>
                        </span>
                      </div>

                      <div className="text-sm font-bold text-[#101014]">{fid.empresaNombre}</div>
                      {fid.notas && (
                        <p className="text-xs text-neutral-600 leading-relaxed">{fid.notas}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onDeleteFidelizacion(fid.id)}
                        title="Eliminar fidelización"
                        className="p-2 text-neutral-400 hover:text-[#DC2626] rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        /* EMPRESAS MASTER-DETAIL */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Master List (4 cols) */}
          <div className="lg:col-span-4 bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-200 bg-[#F8F6F4] flex items-center justify-between text-xs gap-2">
              <span className="font-semibold text-[#101014] truncate">
                {categoryFilter === 'Todas' ? 'Todas las empresas' : getStatusLabel(categoryFilter)}
              </span>
              <span className="font-mono text-neutral-500 tabular-nums shrink-0">
                {filteredList.length} resultados
              </span>
            </div>

            {filteredList.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500">
                No se encontraron empresas en esta categoría.
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 max-h-[760px] overflow-y-auto">
                {filteredList.map((company) => {
                  const isCurrent = selectedCompany?.id === company.id;
                  const monthly = calcMonthlyAmount(company.empleados, company.precioIndividual);
                  return (
                    <button
                      key={company.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(company.id);
                        setConfirmDeleteId(null);
                      }}
                      className={`w-full text-left px-4 py-3.5 transition-colors block ${
                        isCurrent ? 'bg-[#101014] text-white' : 'hover:bg-[#F8F6F4] text-[#101014]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-sm leading-snug truncate">
                          {company.nombre}
                        </div>
                        <span
                          className={`text-xs font-mono font-semibold tabular-nums shrink-0 ${
                            isCurrent ? 'text-neutral-200' : 'text-neutral-700'
                          }`}
                        >
                          {company.empleados} emp.
                        </span>
                      </div>
                      <div
                        className={`text-xs mt-1 flex items-center justify-between gap-2 ${
                          isCurrent ? 'text-neutral-300' : 'text-neutral-500'
                        }`}
                      >
                        <span className="truncate">{company.localidad}</span>
                        {company.estado === 'Activa' ? (
                          <span className="font-mono tabular-nums shrink-0">
                            {formatARS(monthly)}/mes
                          </span>
                        ) : company.estado === 'Dado de baja' && company.fechaBaja ? (
                          <span className="font-mono tabular-nums text-[11px] shrink-0">
                            Baja: {formatShortDateAR(company.fechaBaja)}
                          </span>
                        ) : (
                          <span className="text-[11px] truncate">
                            {getStatusLabel(company.estado)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Company Profile (8 cols) */}
          <div className="lg:col-span-8">
            {!selectedCompany ? (
              <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
                <p className="text-sm font-medium text-[#101014] mb-1">
                  Elegí una empresa del listado
                </p>
                <p className="text-xs text-neutral-500">
                  Vas a ver la ficha completa con datos generales, contacto y enlaces a Drive.
                </p>
              </div>
            ) : (
              <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
                {/* Profile Header */}
                <div className="px-6 py-5 border-b border-neutral-200 bg-[#F8F6F4] flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs mb-1">
                      <span className={`font-bold ${getStatusColorClass(selectedCompany.estado)}`}>
                        {getStatusLabel(selectedCompany.estado)}
                      </span>
                      <span aria-hidden="true" className="text-neutral-400">
                        ·
                      </span>
                      <span className="text-neutral-600">{selectedCompany.localidad}</span>
                    </div>
                    <h2 className="text-xl font-bold text-[#101014]">{selectedCompany.nombre}</h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Status / Category Selector matching the main top dropdown */}
                    <div className="flex items-center px-3 py-1.5 rounded-lg border bg-[#101014] border-[#101014] text-white">
                      <label htmlFor="profile-status-select" className="sr-only">
                        Cambiar categoría de la empresa
                      </label>
                      <select
                        id="profile-status-select"
                        value={selectedCompany.estado}
                        onChange={(e) =>
                          handleChangeCompanyStatus(
                            selectedCompany,
                            e.target.value as CompanyStatus
                          )
                        }
                        className="text-xs font-semibold bg-transparent text-white focus:outline-none cursor-pointer pr-1"
                      >
                        {COMPANY_STATUS_OPTIONS.map((opt) => (
                          <option
                            key={opt.value}
                            value={opt.value}
                            className="text-[#101014] bg-white"
                          >
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setFidEmpresaId(selectedCompany.id);
                        setSubView('fidelizaciones');
                      }}
                      className="px-3 py-2 bg-white border border-neutral-300 hover:border-[#101014] text-[#101014] text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <HeartHandshake className="w-3.5 h-3.5 text-[#E52421]" />
                      <span>Fidelizar</span>
                    </button>

                    {confirmDeleteId === selectedCompany.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteCompany(selectedCompany.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-3 py-2 bg-[#DC2626] hover:bg-red-700 text-white text-xs font-semibold rounded-lg whitespace-nowrap"
                        >
                          Eliminar definitivamente
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-2 text-xs text-neutral-600"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(selectedCompany.id)}
                        title="Eliminar empresa definitivamente (no es dar de baja)"
                        className="p-2 text-neutral-400 hover:text-[#DC2626] rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Registro de baja (solo visible para Clientes dados de baja) */}
                  {selectedCompany.estado === 'Dado de baja' && (
                    <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-bold text-[#B45309] flex items-center gap-1.5">
                          <UserMinus className="w-4 h-4" />
                          <span>Registro de baja del cliente</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleActivateCompany(selectedCompany)}
                          className="text-xs font-semibold text-[#16A34A] hover:underline"
                        >
                          Reactivar como Cliente Activa
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                            Fecha de baja
                          </label>
                          <input
                            type="date"
                            value={selectedCompany.fechaBaja || ''}
                            onChange={(e) => patchSelected({ fechaBaja: e.target.value })}
                            className="w-full px-3 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-mono tabular-nums text-[#101014]"
                          />
                        </div>
                        <div className="sm:col-span-8">
                          <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                            Motivo de la baja
                          </label>
                          <input
                            value={selectedCompany.motivoBaja || ''}
                            onChange={(e) => patchSelected({ motivoBaja: e.target.value })}
                            placeholder="Sin motivo especificado"
                            className="w-full px-3 py-1.5 bg-white border border-amber-200 rounded-lg text-xs text-[#101014]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Información General, Contacto y Difusión */}
                  <section className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-[#101014]">
                          Información General, Contacto y Difusión
                        </h3>
                        <span className="text-[11px] text-neutral-500">
                          Los cambios se guardan automáticamente
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setReporteFechaPedido(new Date().toISOString().slice(0, 10));
                          setReporteFechaEntrega('');
                          setReporteModalOpen(true);
                        }}
                        className="px-3.5 py-2 bg-[#101014] hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <BarChart3 className="w-3.5 h-3.5 text-[#E52421]" />
                        <span>Reporte de uso</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">
                          Nombre de la empresa
                        </label>
                        <input
                          value={selectedCompany.nombre}
                          onChange={(e) => patchSelected({ nombre: e.target.value })}
                          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-[#101014]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">
                          Categoría / Estado
                        </label>
                        <select
                          value={selectedCompany.estado}
                          onChange={(e) =>
                            handleChangeCompanyStatus(
                              selectedCompany,
                              e.target.value as CompanyStatus
                            )
                          }
                          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#101014]"
                        >
                          {COMPANY_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:col-span-2">
                        <div>
                          <label className="block text-xs font-medium text-neutral-600 mb-1">
                            Localidad (Tucumán)
                          </label>
                          <select
                            value={selectedCompany.localidad}
                            onChange={(e) => {
                              const loc = TUCUMAN_LOCALIDADES.find((l) => l.name === e.target.value);
                              patchSelected({
                                localidad: e.target.value,
                                ...(loc ? { lat: loc.lat, lng: loc.lng } : {}),
                              });
                            }}
                            className="w-full px-2.5 py-2 border border-neutral-200 rounded-lg text-sm bg-white"
                          >
                            {TUCUMAN_LOCALIDADES.map((loc) => (
                              <option key={loc.name} value={loc.name}>
                                {loc.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-neutral-600 mb-1">
                            Empleados
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={selectedCompany.empleados}
                            onChange={(e) =>
                              patchSelected({
                                empleados: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono tabular-nums"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-neutral-600 mb-1">
                            Fecha de base de empleados
                          </label>
                          <input
                            type="date"
                            value={selectedCompany.fechaBaseEmpleados || ''}
                            onChange={(e) =>
                              patchSelected({
                                fechaBaseEmpleados: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono tabular-nums focus:outline-none focus:border-[#101014]"
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-neutral-600 mb-1">
                          Dirección
                        </label>
                        <input
                          value={selectedCompany.direccion}
                          onChange={(e) => patchSelected({ direccion: e.target.value })}
                          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">
                          Contacto principal
                        </label>
                        <input
                          value={selectedCompany.contactoPrincipal}
                          onChange={(e) => patchSelected({ contactoPrincipal: e.target.value })}
                          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">
                          Teléfono principal
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            value={selectedCompany.telefonoPrincipal}
                            onChange={(e) => patchSelected({ telefonoPrincipal: e.target.value })}
                            placeholder="381..."
                            className="flex-1 min-w-0 px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono focus:outline-none focus:border-[#101014]"
                          />
                          {selectedCompany.telefonoPrincipal.trim() ? (
                            <a
                              href={buildWhatsAppUrl(
                                selectedCompany.telefonoPrincipal,
                                `Hola ${selectedCompany.contactoPrincipal || ''}, te escribimos del equipo de Bonus Ticket Tucumán.`
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Abrir chat de WhatsApp (Contacto principal)"
                              aria-label="Abrir WhatsApp del teléfono principal"
                              className="h-9 w-9 shrink-0 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white flex items-center justify-center transition-colors"
                            >
                              <WhatsAppIcon className="w-4 h-4" />
                            </a>
                          ) : (
                            <span
                              title="Ingresá un teléfono principal para abrir WhatsApp"
                              aria-label="WhatsApp no disponible sin número"
                              className="h-9 w-9 shrink-0 rounded-lg bg-neutral-100 border border-neutral-200 text-neutral-300 flex items-center justify-center cursor-not-allowed"
                            >
                              <WhatsAppIcon className="w-4 h-4" />
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">
                          Contacto de difusión
                        </label>
                        <input
                          value={selectedCompany.contactoDifusion}
                          onChange={(e) => patchSelected({ contactoDifusion: e.target.value })}
                          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-[#101014]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">
                          Teléfono de difusión
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            value={selectedCompany.telefonoDifusion || ''}
                            onChange={(e) => patchSelected({ telefonoDifusion: e.target.value })}
                            placeholder="381..."
                            className="flex-1 min-w-0 px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono focus:outline-none focus:border-[#101014]"
                          />
                          {(selectedCompany.telefonoDifusion || '').trim() ? (
                            <a
                              href={buildWhatsAppUrl(
                                selectedCompany.telefonoDifusion || '',
                                `Hola ${selectedCompany.contactoDifusion || ''}, te escribimos del equipo de Bonus Ticket Tucumán por la difusión de beneficios.`
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Abrir chat de WhatsApp (Contacto de difusión)"
                              aria-label="Abrir WhatsApp del teléfono de difusión"
                              className="h-9 w-9 shrink-0 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white flex items-center justify-center transition-colors"
                            >
                              <WhatsAppIcon className="w-4 h-4" />
                            </a>
                          ) : (
                            <span
                              title="Ingresá un teléfono de difusión para abrir WhatsApp"
                              aria-label="WhatsApp no disponible sin número"
                              className="h-9 w-9 shrink-0 rounded-lg bg-neutral-100 border border-neutral-200 text-neutral-300 flex items-center justify-center cursor-not-allowed"
                            >
                              <WhatsAppIcon className="w-4 h-4" />
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-neutral-600 mb-1">
                          Mail de difusión
                        </label>
                        <input
                          type="email"
                          value={selectedCompany.mailDifusion}
                          onChange={(e) => patchSelected({ mailDifusion: e.target.value })}
                          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-[#101014]"
                        />
                      </div>
                    </div>

                    {/* Google Drive Links */}
                    <div className="pt-2 space-y-2.5">
                      <div className="text-xs font-semibold text-neutral-700">
                        Documentación en Google Drive
                      </div>
                      <div className="grid grid-cols-1 gap-2.5">
                        {(
                          [
                            {
                              key: 'linkBaseEmpleados',
                              label: 'Base de empleados',
                              value: selectedCompany.linkBaseEmpleados,
                            },
                            {
                              key: 'linkContrato',
                              label: 'Contrato firmado',
                              value: selectedCompany.linkContrato,
                            },
                            {
                              key: 'linkPropuesta',
                              label: 'Propuesta comercial',
                              value: selectedCompany.linkPropuesta,
                            },
                          ] as const
                        ).map((item) => (
                          <div key={item.key} className="flex items-center gap-2">
                            <span className="text-xs text-neutral-500 w-36 shrink-0">
                              {item.label}
                            </span>
                            <input
                              value={item.value}
                              onChange={(e) => patchSelected({ [item.key]: e.target.value })}
                              placeholder="Pegá el enlace de Google Drive..."
                              className="flex-1 px-3 py-1.5 border border-neutral-200 rounded-lg text-xs"
                            />
                            {item.value && (
                              <a
                                href={item.value}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1.5 bg-[#F8F6F4] hover:bg-neutral-200/70 border border-neutral-200 rounded-lg text-xs font-medium text-[#101014] flex items-center gap-1 shrink-0"
                              >
                                <span>Abrir</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <QuickTaskModal
        open={taskModalOpen}
        defaultSector="Empresas"
        defaultCompanyId={selectedCompany?.id || ''}
        companies={companies}
        onClose={() => setTaskModalOpen(false)}
        onCreateTask={(task) => {
          onAddPlanTask(task);
          showSavedFlash('Tarea agregada a Planificación Semanal.');
        }}
      />

      {reporteModalOpen && selectedCompany && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 bg-[#F8F6F4]">
              <div>
                <h2 className="text-base font-bold text-[#101014]">Reporte de uso</h2>
                <p className="text-xs text-neutral-500">{selectedCompany.nombre}</p>
              </div>
              <button
                type="button"
                onClick={() => setReporteModalOpen(false)}
                aria-label="Cerrar"
                className="p-1.5 text-neutral-500 hover:text-[#101014] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateReporteUso} className="p-5 space-y-4">
              <p className="text-xs text-neutral-600 leading-relaxed">
                Al confirmar, se generará automáticamente una tarea en{' '}
                <strong className="text-[#101014]">Planificación Semanal</strong> con etiqueta{' '}
                <strong className="text-[#B45309]">Empresas</strong> y prioridad{' '}
                <strong className="text-[#E52421]">Alta</strong>.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Fecha de pedido *
                  </label>
                  <input
                    type="date"
                    required
                    value={reporteFechaPedido}
                    onChange={(e) => setReporteFechaPedido(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono tabular-nums text-[#101014] focus:outline-none focus:border-[#101014]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Fecha de entrega *
                  </label>
                  <input
                    type="date"
                    required
                    value={reporteFechaEntrega}
                    onChange={(e) => setReporteFechaEntrega(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono tabular-nums text-[#101014] focus:outline-none focus:border-[#101014]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setReporteModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-neutral-600 hover:text-[#101014] rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#E52421] hover:bg-[#C91D1A] text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Generar tarea (Prioridad Alta)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CAMBIO DE ESTADO (MOTIVO OPCIONAL, OBLIGATORIO SOLO EN BAJA DE CLIENTE ACTIVO) */}
      {statusChangeModal && (() => {
        const { company, nextEstado } = statusChangeModal;
        const prevEstado = company.estado;
        const isActiveOffboarding = prevEstado === 'Activa' && nextEstado === 'Dado de baja';
        const isOffboarding = nextEstado === 'Dado de baja';

        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 bg-[#F8F6F4]">
                <div>
                  <h2 className="text-base font-bold text-[#101014]">
                    {isActiveOffboarding ? 'Dar de baja cliente activo' : 'Cambio de estado'}
                  </h2>
                  <p className="text-xs text-neutral-500">{company.nombre}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStatusChangeModal(null)}
                  aria-label="Cerrar"
                  className="p-1.5 text-neutral-500 hover:text-[#101014] rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmStatusChange} className="p-5 space-y-4">
                <div className="px-3 py-2 bg-[#F8F6F4] border border-neutral-200 rounded-lg text-xs text-neutral-700">
                  <span className="font-semibold text-[#101014]">
                    {getStatusLabel(prevEstado)}
                  </span>{' '}
                  <span className="text-neutral-400">→</span>{' '}
                  <span className={`font-bold ${getStatusColorClass(nextEstado)}`}>
                    {getStatusLabel(nextEstado)}
                  </span>
                </div>

                <p className="text-xs text-neutral-600 leading-relaxed">
                  {isActiveOffboarding ? (
                    <>
                      El motivo es <strong className="text-[#101014]">obligatorio</strong> cuando un
                      cliente activo pasa a{' '}
                      <strong className="text-[#101014]">Clientes dados de baja</strong>. La empresa
                      no se elimina y conserva todo su historial.
                    </>
                  ) : isOffboarding ? (
                    <>
                      La empresa se recopilará en{' '}
                      <strong className="text-[#101014]">Clientes dados de baja</strong> sin
                      eliminarse. El motivo es opcional y quedará registrado en{' '}
                      <strong className="text-[#101014]">Historial de actividades</strong>.
                    </>
                  ) : (
                    <>
                      Podés indicar un motivo (opcional) para dejar constancia del movimiento en{' '}
                      <strong className="text-[#101014]">Historial de actividades</strong>.
                    </>
                  )}
                </p>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    {isOffboarding ? 'Fecha de baja *' : 'Fecha del movimiento *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={statusChangeFecha}
                    onChange={(e) => setStatusChangeFecha(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono tabular-nums text-[#101014] focus:outline-none focus:border-[#101014]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    {isActiveOffboarding ? 'Motivo de la baja *' : 'Motivo (opcional)'}
                  </label>
                  <textarea
                    required={isActiveOffboarding}
                    rows={3}
                    value={statusChangeMotivo}
                    onChange={(e) => setStatusChangeMotivo(e.target.value)}
                    placeholder={
                      isOffboarding
                        ? 'Ej. Recorte de presupuesto anual, cambio de proveedor de beneficios, cierre de sucursal...'
                        : 'Ej. Propuesta aprobada por directorio, retoman contacto el próximo trimestre...'
                    }
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-[#101014] focus:outline-none focus:border-[#101014] resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
                  <button
                    type="button"
                    onClick={() => setStatusChangeModal(null)}
                    className="px-4 py-2 text-xs font-medium text-neutral-600 hover:text-[#101014] rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className={`px-4 py-2 text-white text-xs font-semibold rounded-lg transition-colors ${
                      isOffboarding
                        ? 'bg-[#D97706] hover:bg-[#B45309]'
                        : nextEstado === 'Activa'
                          ? 'bg-[#E52421] hover:bg-[#C91D1A]'
                          : 'bg-[#101014] hover:bg-neutral-800'
                    }`}
                  >
                    {isOffboarding ? 'Confirmar baja' : 'Confirmar cambio'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
