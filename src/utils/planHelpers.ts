import * as XLSX from 'xlsx';
import type {
  BonusTicketState,
  Company,
  MarketingLog,
  MetaReport,
  PlanSector,
  PlanTask,
} from '../types';
import { calcIncreaseProjection, calcMonthlyAmount } from './calculations';

export const ALL_PLAN_SECTORS: PlanSector[] = [
  'Marketing',
  'Cobranzas',
  'Comercios',
  'Empresas',
  'General',
];

export interface SectorVisualMeta {
  id: PlanSector;
  label: string;
  owner: string;
  hex: string;
  textClass: string;
  surfaceClass: string;
  borderClass: string;
  activeButtonClass: string;
}

export const SECTOR_VISUALS: Record<PlanSector, SectorVisualMeta> = {
  Marketing: {
    id: 'Marketing',
    label: 'Marketing',
    owner: 'Redes y Difusión',
    hex: '#E52421',
    textClass: 'text-[#C91D1A]',
    surfaceClass: 'bg-red-50/45',
    borderClass: 'border-red-200/80',
    activeButtonClass: 'bg-[#E52421] text-white border-[#E52421]',
  },
  Cobranzas: {
    id: 'Cobranzas',
    label: 'Cobranzas',
    owner: 'Nahuel',
    hex: '#059669',
    textClass: 'text-[#047857]',
    surfaceClass: 'bg-emerald-50/45',
    borderClass: 'border-emerald-200/80',
    activeButtonClass: 'bg-[#059669] text-white border-[#059669]',
  },
  Comercios: {
    id: 'Comercios',
    label: 'Comercios',
    owner: 'Miguel',
    hex: '#2563EB',
    textClass: 'text-[#1D4ED8]',
    surfaceClass: 'bg-blue-50/45',
    borderClass: 'border-blue-200/80',
    activeButtonClass: 'bg-[#2563EB] text-white border-[#2563EB]',
  },
  Empresas: {
    id: 'Empresas',
    label: 'Empresas',
    owner: 'Convenios y RRHH',
    hex: '#D97706',
    textClass: 'text-[#B45309]',
    surfaceClass: 'bg-amber-50/45',
    borderClass: 'border-amber-200/80',
    activeButtonClass: 'bg-[#D97706] text-white border-[#D97706]',
  },
  General: {
    id: 'General',
    label: 'General',
    owner: 'Ramiro · Dirección',
    hex: '#7C3AED',
    textClass: 'text-[#6D28D9]',
    surfaceClass: 'bg-violet-50/45',
    borderClass: 'border-violet-200/80',
    activeButtonClass: 'bg-[#7C3AED] text-white border-[#7C3AED]',
  },
};

export function getTaskSectors(task: PlanTask): PlanSector[] {
  if (Array.isArray(task.sectores)) {
    return task.sectores.filter((s): s is PlanSector => ALL_PLAN_SECTORS.includes(s));
  }
  if (task.sector && ALL_PLAN_SECTORS.includes(task.sector)) {
    return [task.sector];
  }
  return [];
}

export function normalizePlanTask(task: Partial<PlanTask> & { id: string }): PlanTask {
  let sectores: PlanSector[];
  if (Array.isArray(task.sectores)) {
    sectores = task.sectores.filter((s): s is PlanSector =>
      ALL_PLAN_SECTORS.includes(s as PlanSector)
    );
  } else if (task.sector && ALL_PLAN_SECTORS.includes(task.sector as PlanSector)) {
    sectores = [task.sector as PlanSector];
  } else {
    sectores = [];
  }

  return {
    id: task.id,
    titulo: task.titulo || 'Tarea semanal',
    sector: sectores[0] ?? '',
    sectores,
    fechaObjetivo: task.fechaObjetivo || new Date().toISOString().slice(0, 10),
    semana: task.semana || 'Semana 48 · 23 al 29 Nov 2026',
    prioridad:
      task.prioridad === 'Alta'
        ? 'Alta'
        : task.prioridad === 'Baja'
          ? 'Baja'
          : 'Media',
    estado:
      task.estado === 'En Proceso' || task.estado === 'Completado'
        ? task.estado
        : 'Pendiente',
    empresaId: task.empresaId || '',
    empresaNombre: task.empresaNombre || '',
    linkDrive: task.linkDrive || '',
  };
}

export function exportEmpresasExcel(companies: Company[]) {
  const rows = companies.map((c) => {
    const mensual = calcMonthlyAmount(c.empleados, c.precioIndividual);
    const proj = calcIncreaseProjection(
      c.empleados,
      c.precioIndividual,
      c.formulaAumento,
      c.valorAumento
    );
    return {
      Empresa: c.nombre,
      Estado: c.estado,
      Localidad: c.localidad,
      Direccion: c.direccion,
      Empleados: c.empleados,
      Fecha_Base_Empleados: c.fechaBaseEmpleados || '',
      Fidelizacion: c.nivelFidelizacion,
      Contacto_Principal: c.contactoPrincipal,
      Telefono: c.telefonoPrincipal,
      Contacto_Difusion: c.contactoDifusion,
      Telefono_Difusion: c.telefonoDifusion || '',
      Mail_Difusion: c.mailDifusion,
      Contacto_Cobranza: c.contactoCobranza,
      Mail_Cobro: c.mailCobro,
      Precio_Individual: c.precioIndividual,
      Monto_Mensual_Estimado: mensual,
      Proximo_Aumento: c.fechaProximoAumento,
      Formula_Aumento: proj.formulaLabel,
      Nuevo_Total_Proyectado: proj.nuevoTotalMensual,
      Fecha_Baja: c.fechaBaja || '',
      Motivo_Baja: c.motivoBaja || '',
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Empresas');
  XLSX.writeFile(wb, `BonusTicket_Empresas_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportMarketingExcel(metaReports: MetaReport[], marketingLogs: MarketingLog[]) {
  const metaRows = metaReports.map((r) => ({
    Periodo: r.periodo,
    Fecha_Carga: r.fechaCarga,
    Origen: r.origen,
    Alcance: r.alcance,
    Visualizaciones: r.visualizaciones,
    Visitas_Perfil: r.visitasPerfil,
    Interacciones: r.interacciones,
    Clics_Enlace: r.clicsEnlace,
    Nuevos_Seguidores: r.nuevosSeguidores,
    Analisis_Ejecutivo: r.analisisEjecutivo,
  }));

  const logRows = marketingLogs.map((l) => ({
    Semana: l.semana,
    Fecha: l.fecha,
    Tipo_Entrega: l.tipoEntrega,
    Empresa: l.empresaNombre || 'General',
    Grilla_Diaria: l.grillaDiaria ? 'Sí' : 'No',
    Colaboraciones: l.colaboraciones ? 'Sí' : 'No',
    Magoya_Videos: l.magoyaVideos ? 'Sí' : 'No',
    Promo_Duplica: l.promoDuplica ? 'Sí' : 'No',
    Notas: l.notas || '',
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metaRows), 'Reportes_Meta');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logRows), 'Bitacora_y_Kits');
  XLSX.writeFile(wb, `BonusTicket_Marketing_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportPlanificacionExcel(planTasks: PlanTask[], label = 'General') {
  const rows = planTasks.map((t) => ({
    Semana: t.semana,
    Titulo: t.titulo,
    Areas_Vinculadas: getTaskSectors(t).join(' + ') || 'Sin etiqueta',
    Estado: t.estado,
    Prioridad: t.prioridad,
    Fecha_Objetivo: t.fechaObjetivo,
    Empresa_Comunidad: t.empresaNombre || 'General',
    Link_Drive: t.linkDrive || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planificacion_Semanal');
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  XLSX.writeFile(
    wb,
    `BonusTicket_Planificacion_${safeLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

export function exportDashboardConsolidatedExcel(state: BonusTicketState, activePeriod: string) {
  const activeCompanies = state.companies.filter((c) => c.estado === 'Activa');
  const prospects = state.companies.filter((c) => c.estado === 'Prospecto');
  const periodPayments = state.payments.filter((p) => p.periodo === activePeriod);
  const facturado =
    periodPayments.length > 0
      ? periodPayments.reduce((s, p) => s + p.montoFacturado, 0)
      : activeCompanies.reduce((s, c) => s + calcMonthlyAmount(c.empleados, c.precioIndividual), 0);
  const cobrado = periodPayments.reduce((s, p) => s + p.montoCobrado, 0);
  const retenciones = periodPayments.reduce((s, p) => s + p.retenciones, 0);
  const pendiente = Math.max(0, facturado - cobrado - retenciones);
  const latestMeta = [...state.metaReports].sort((a, b) =>
    b.fechaCarga.localeCompare(a.fechaCarga)
  )[0];
  const periodPlan = state.planTasks.filter((t) => t.fechaObjetivo.startsWith(activePeriod));
  const completadas = periodPlan.filter((t) => t.estado === 'Completado').length;

  const kpiSummary = [
    { Indicador: 'Período Analizado', Valor: activePeriod },
    { Indicador: 'Empresas Activas', Valor: activeCompanies.length },
    { Indicador: 'Prospectos en Seguimiento', Valor: prospects.length },
    {
      Indicador: 'Empleados Adheridos (Activas)',
      Valor: activeCompanies.reduce((s, c) => s + c.empleados, 0),
    },
    { Indicador: 'Facturado del Período ($)', Valor: facturado },
    { Indicador: 'Cobrado ($)', Valor: cobrado },
    { Indicador: 'Pendiente de Cobro ($)', Valor: pendiente },
    { Indicador: 'Alcance Redes (Meta)', Valor: latestMeta?.alcance ?? 0 },
    { Indicador: 'Interacciones (Meta)', Valor: latestMeta?.interacciones ?? 0 },
    { Indicador: 'Clics a Web (Meta)', Valor: latestMeta?.clicsEnlace ?? 0 },
    { Indicador: 'Tareas Semanales Completadas', Valor: completadas },
    { Indicador: 'Tareas Semanales Pendientes/En Proceso', Valor: periodPlan.length - completadas },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiSummary), 'Resumen_KPIs');

  const empRows = state.companies.map((c) => ({
    Empresa: c.nombre,
    Estado: c.estado,
    Localidad: c.localidad,
    Empleados: c.empleados,
    Monto_Mensual: calcMonthlyAmount(c.empleados, c.precioIndividual),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empRows), 'Empresas');

  const planRows = state.planTasks.map((t) => ({
    Semana: t.semana,
    Titulo: t.titulo,
    Areas: getTaskSectors(t).join(' + ') || 'Sin etiqueta',
    Estado: t.estado,
    Prioridad: t.prioridad,
    Fecha_Objetivo: t.fechaObjetivo,
    Empresa: t.empresaNombre || 'General',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(planRows), 'Planificacion');

  XLSX.writeFile(wb, `BonusTicket_Dashboard_${activePeriod}.xlsx`);
}
