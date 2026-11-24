import React, { useMemo } from 'react';
import {
  ArrowUpRight,
  Calendar,
  Download,
  FileBarChart2,
} from 'lucide-react';
import type { BonusTicketState, PlanSector, ViewId } from '../types';
import {
  calcMonthlyAmount,
  formatARS,
  formatNumber,
  formatPeriodLabel,
} from '../utils/calculations';
import {
  ALL_PLAN_SECTORS,
  SECTOR_VISUALS,
  exportDashboardConsolidatedExcel,
  getTaskSectors,
} from '../utils/planHelpers';

interface DashboardViewProps {
  state: BonusTicketState;
  activePeriod: string;
  onChangePeriod: (period: string) => void;
  onOpenExecutiveReport: () => void;
  onNavigate: (view: ViewId) => void;
}

const PERIOD_OPTIONS = ['2026-10', '2026-11', '2026-12', '2027-01'];

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  activePeriod,
  onChangePeriod,
  onOpenExecutiveReport,
  onNavigate,
}) => {
  const kpis = useMemo(() => {
    const activeCompanies = state.companies.filter((c) => c.estado === 'Activa');
    const prospects = state.companies.filter((c) => c.estado === 'Prospecto');
    const totalCompanies = state.companies.length;
    const activeRatio =
      totalCompanies > 0 ? Math.round((activeCompanies.length / totalCompanies) * 100) : 0;

    const totalEmployees = activeCompanies.reduce((s, c) => s + c.empleados, 0);
    const prospectEmployees = prospects.reduce((s, c) => s + c.empleados, 0);
    const baseMonthlyBilling = activeCompanies.reduce(
      (s, c) => s + calcMonthlyAmount(c.empleados, c.precioIndividual),
      0
    );

    const periodPayments = state.payments.filter((p) => p.periodo === activePeriod);
    const facturado =
      periodPayments.length > 0
        ? periodPayments.reduce((s, p) => s + p.montoFacturado, 0)
        : baseMonthlyBilling;
    const cobrado = periodPayments.reduce((s, p) => s + p.montoCobrado, 0);
    const retenciones = periodPayments.reduce((s, p) => s + p.retenciones, 0);
    const pendiente = Math.max(0, facturado - cobrado - retenciones);
    const cobradoPct = facturado > 0 ? Math.min(100, Math.round(((cobrado + retenciones) / facturado) * 100)) : 0;
    const pagadasCount = periodPayments.filter((p) => p.estado === 'Al día').length;
    const vencidasCount = periodPayments.filter((p) => p.estado === 'Vencida').length;

    const latestMeta = [...state.metaReports].sort((a, b) =>
      b.fechaCarga.localeCompare(a.fechaCarga)
    )[0];

    const kitsEntregados = state.marketingLogs.filter(
      (l) => l.tipoEntrega === 'Kit Difusión WhatsApp/Email'
    ).length;
    const reelsEntregados = state.marketingLogs.filter(
      (l) => l.tipoEntrega === 'Reel de Fidelización'
    ).length;

    const periodPlanTasks = state.planTasks.filter((t) =>
      t.fechaObjetivo.startsWith(activePeriod)
    );
    const planSource = periodPlanTasks.length > 0 ? periodPlanTasks : state.planTasks;
    const planTasksTotal = planSource.length;
    const planTasksCompletadas = planSource.filter((t) => t.estado === 'Completado').length;
    const planTasksEnProceso = planSource.filter((t) => t.estado === 'En Proceso').length;
    const planTasksPendientes = planSource.filter((t) => t.estado === 'Pendiente').length;
    const planTasksAbiertas = planTasksTotal - planTasksCompletadas;
    const planTasksPct =
      planTasksTotal > 0 ? Math.round((planTasksCompletadas / planTasksTotal) * 100) : 0;

    const planBySector: Array<{
      sector: PlanSector;
      total: number;
      completadas: number;
    }> = ALL_PLAN_SECTORS.map((sec) => {
      const linked = planSource.filter((t) => getTaskSectors(t).includes(sec));
      return {
        sector: sec,
        total: linked.length,
        completadas: linked.filter((t) => t.estado === 'Completado').length,
      };
    });

    const engagementRate =
      latestMeta && latestMeta.alcance > 0
        ? ((latestMeta.interacciones / latestMeta.alcance) * 100).toFixed(1)
        : '0.0';

    return {
      activeCount: activeCompanies.length,
      prospectCount: prospects.length,
      totalCompanies,
      activeRatio,
      totalEmployees,
      prospectEmployees,
      baseMonthlyBilling,
      facturado,
      cobrado,
      retenciones,
      pendiente,
      cobradoPct,
      pagadasCount,
      vencidasCount,
      alcance: latestMeta?.alcance ?? 0,
      visualizaciones: latestMeta?.visualizaciones ?? 0,
      visitasPerfil: latestMeta?.visitasPerfil ?? 0,
      interacciones: latestMeta?.interacciones ?? 0,
      clicsEnlace: latestMeta?.clicsEnlace ?? 0,
      nuevosSeguidores: latestMeta?.nuevosSeguidores ?? 0,
      latestMetaPeriodo: latestMeta?.periodo ?? 'Sin reporte cargado',
      engagementRate,
      kitsEntregados,
      reelsEntregados,
      planTasksTotal,
      planTasksCompletadas,
      planTasksEnProceso,
      planTasksPendientes,
      planTasksAbiertas,
      planTasksPct,
      planBySector,
      planUsingFallback: periodPlanTasks.length === 0 && state.planTasks.length > 0,
    };
  }, [state, activePeriod]);

  return (
    <div className="space-y-6">
      {/* HEADER: Período + Reporte Excel + Reporte Ejecutivo */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-neutral-500 mb-1">
            Tablero Ejecutivo Bonus Ticket · Indicadores consolidados en tiempo real
          </p>
          <h1 className="text-2xl font-bold text-[#101014] tracking-tight">
            Panel de KPIs y Estado General
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-lg px-3 py-2">
            <Calendar className="w-4 h-4 text-neutral-500 shrink-0" />
            <label htmlFor="dash-period" className="text-xs font-medium text-neutral-500">
              Período:
            </label>
            <select
              id="dash-period"
              value={activePeriod}
              onChange={(e) => onChangePeriod(e.target.value)}
              className="text-xs font-semibold text-[#101014] bg-transparent focus:outline-none"
            >
              {PERIOD_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {formatPeriodLabel(p)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => exportDashboardConsolidatedExcel(state, activePeriod)}
            className="px-3.5 py-2 bg-white border border-neutral-200 hover:border-[#101014] text-[#101014] text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Reporte Excel</span>
          </button>

          <button
            type="button"
            onClick={onOpenExecutiveReport}
            className="px-4 py-2 bg-[#101014] hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileBarChart2 className="w-3.5 h-3.5" />
            <span>Reporte Ejecutivo</span>
          </button>
        </div>
      </div>

      {/* 4 VISUAL EXECUTIVE PANELS (2x2 Grid) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PANEL 1: Empresas Activas y Prospectos */}
        <article className="bg-white border border-neutral-200 rounded-xl p-6 flex flex-col justify-between space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-neutral-500">
                01. Cartera Comercial · Miguel
              </div>
              <h2 className="text-lg font-bold text-[#101014] mt-0.5">
                Empresas Activas y Prospectos
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('empresas')}
              className="text-xs font-semibold text-[#101014] hover:text-[#E52421] flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <span>Ver Empresas</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <div className="text-xs text-neutral-500 font-medium">Empresas Activas</div>
              <div className="text-5xl font-bold font-mono tabular-nums text-[#101014] leading-none">
                {kpis.activeCount}
              </div>
              <div className="text-xs text-[#16A34A] font-semibold font-mono tabular-nums pt-1">
                {formatNumber(kpis.totalEmployees)} empleados activos
              </div>
            </div>

            <div className="space-y-1 border-l border-neutral-100 pl-6">
              <div className="text-xs text-neutral-500 font-medium">Prospectos</div>
              <div className="text-5xl font-bold font-mono tabular-nums text-[#D97706] leading-none">
                {kpis.prospectCount}
              </div>
              <div className="text-xs text-neutral-500 font-mono tabular-nums pt-1">
                +{formatNumber(kpis.prospectEmployees)} empleados potenciales
              </div>
            </div>
          </div>

          <div className="space-y-2.5 pt-4 border-t border-neutral-100">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-600 font-medium">
                Composición de cartera ({kpis.totalCompanies} empresas totales)
              </span>
              <span className="font-mono font-bold text-[#101014] tabular-nums">
                {kpis.activeRatio}% activas
              </span>
            </div>
            <div className="w-full h-3 bg-[#F8F6F4] rounded-full overflow-hidden flex">
              <div
                className="h-full bg-[#101014] transition-all duration-300"
                style={{ width: `${kpis.activeRatio}%` }}
              />
              <div
                className="h-full bg-[#D97706] transition-all duration-300"
                style={{ width: `${100 - kpis.activeRatio}%` }}
              />
            </div>
          </div>
        </article>

        {/* PANEL 2: Cobranzas y Facturación */}
        <article className="bg-white border border-neutral-200 rounded-xl p-6 flex flex-col justify-between space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-neutral-500">
                02. Cobranzas y Facturación · Nahuel
              </div>
              <h2 className="text-lg font-bold text-[#101014] mt-0.5">
                Estado Financiero ({formatPeriodLabel(activePeriod)})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('cobranzas')}
              className="text-xs font-semibold text-[#101014] hover:text-[#E52421] flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <span>Ver Cobranzas</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <div className="text-xs text-neutral-500 font-medium mb-1">Total Facturado</div>
              <div className="text-3xl font-bold font-mono tabular-nums text-[#101014]">
                {formatARS(kpis.facturado)}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 font-medium mb-1">Cobrado Efectivo</div>
              <div className="text-3xl font-bold font-mono tabular-nums text-[#16A34A]">
                {formatARS(kpis.cobrado)}
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-neutral-100">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-600 font-medium">Avance de cobranza del mes</span>
              <span className="font-mono font-bold text-[#16A34A] tabular-nums">
                {kpis.cobradoPct}% recaudado
              </span>
            </div>
            <div className="w-full h-3 bg-[#F8F6F4] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#16A34A] transition-all duration-300"
                style={{ width: `${kpis.cobradoPct}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2 text-xs">
              <div>
                <div className="text-neutral-500">Pendiente</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#D97706]">
                  {formatARS(kpis.pendiente)}
                </div>
              </div>
              <div>
                <div className="text-neutral-500">Al día</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#16A34A]">
                  {kpis.pagadasCount} emp.
                </div>
              </div>
              <div>
                <div className="text-neutral-500">Vencidas</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#DC2626]">
                  {kpis.vencidasCount} emp.
                </div>
              </div>
            </div>
          </div>
        </article>

        {/* PANEL 3: Métricas de Redes Sociales (Meta) */}
        <article className="bg-white border border-neutral-200 rounded-xl p-6 flex flex-col justify-between space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-neutral-500">
                03. Métricas de Redes Sociales · Marketing
              </div>
              <h2 className="text-lg font-bold text-[#101014] mt-0.5">
                Rendimiento Meta ({kpis.latestMetaPeriodo})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('marketing')}
              className="text-xs font-semibold text-[#101014] hover:text-[#E52421] flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <span>Ver Marketing</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Alcance</div>
              <div className="text-3xl font-bold font-mono tabular-nums text-[#101014]">
                {formatNumber(kpis.alcance)}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">Interacciones</div>
              <div className="text-3xl font-bold font-mono tabular-nums text-[#101014]">
                {formatNumber(kpis.interacciones)}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">Clics a Web</div>
              <div className="text-3xl font-bold font-mono tabular-nums text-[#E52421]">
                {formatNumber(kpis.clicsEnlace)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-neutral-100 text-xs">
            <div>
              <div className="text-neutral-500 mb-0.5">Visualizaciones</div>
              <div className="text-base font-bold font-mono tabular-nums text-[#101014]">
                {formatNumber(kpis.visualizaciones)}
              </div>
            </div>
            <div>
              <div className="text-neutral-500 mb-0.5">Nuevos seg.</div>
              <div className="text-base font-bold font-mono tabular-nums text-[#16A34A]">
                +{formatNumber(kpis.nuevosSeguidores)}
              </div>
            </div>
            <div>
              <div className="text-neutral-500 mb-0.5">Tasa interacción</div>
              <div className="text-base font-bold font-mono tabular-nums text-[#101014]">
                {kpis.engagementRate}%
              </div>
            </div>
            <div>
              <div className="text-neutral-500 mb-0.5">Kits / Reels</div>
              <div className="text-base font-bold font-mono tabular-nums text-[#101014]">
                {kpis.kitsEntregados} / {kpis.reelsEntregados}
              </div>
            </div>
          </div>
        </article>

        {/* PANEL 4: Resumen de Planificación Semanal */}
        <article className="bg-white border border-neutral-200 rounded-xl p-6 flex flex-col justify-between space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-neutral-500">
                04. Planificación Semanal · Reuniones de Lunes
              </div>
              <h2 className="text-lg font-bold text-[#101014] mt-0.5">
                Tareas Semanales Completadas vs. Pendientes
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('planificacion')}
              className="text-xs font-semibold text-[#101014] hover:text-[#E52421] flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <span>Abrir Tablero</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Completadas</div>
              <div className="text-4xl font-bold font-mono tabular-nums text-[#16A34A]">
                {kpis.planTasksCompletadas}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">En Proceso</div>
              <div className="text-4xl font-bold font-mono tabular-nums text-[#D97706]">
                {kpis.planTasksEnProceso}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">Pendientes</div>
              <div className="text-4xl font-bold font-mono tabular-nums text-[#E52421]">
                {kpis.planTasksPendientes}
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-neutral-100">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-600 font-medium">
                Cumplimiento{' '}
                {kpis.planUsingFallback
                  ? '(total tablero)'
                  : `(${formatPeriodLabel(activePeriod)})`}
              </span>
              <span className="font-mono font-bold text-[#101014] tabular-nums">
                {kpis.planTasksPct}% ({kpis.planTasksCompletadas} de {kpis.planTasksTotal})
              </span>
            </div>
            <div className="w-full h-3 bg-[#F8F6F4] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#E52421] transition-all duration-300"
                style={{ width: `${kpis.planTasksPct}%` }}
              />
            </div>

            {/* Area Breakdown with Representative Colors */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
              {kpis.planBySector.map((item) => {
                const vis = SECTOR_VISUALS[item.sector];
                return (
                  <div key={item.sector} className="text-xs">
                    <div className="flex items-center gap-1.5 text-neutral-600 font-medium">
                      <span
                        className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                        style={{ backgroundColor: vis.hex }}
                      />
                      <span className="truncate">{vis.label}</span>
                    </div>
                    <div className="font-mono font-bold text-[#101014] tabular-nums mt-0.5">
                      {item.completadas}/{item.total}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </article>
      </section>
    </div>
  );
};
