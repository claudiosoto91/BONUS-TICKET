import type { Company, FormulaAumento, FrecuenciaActualizacion } from '../types';

export function formatARS(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(safe);
}

export function formatNumber(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('es-AR').format(Math.round(safe));
}

export function calcMonthlyAmount(empleados: number, precioIndividual: number): number {
  return Math.max(0, Math.round((Number(empleados) || 0) * (Number(precioIndividual) || 0)));
}

export interface IncreaseProjection {
  nuevoPrecioIndividual: number;
  nuevoTotalMensual: number;
  diferenciaMensual: number;
  porcentajeEfectivo: number;
  formulaLabel: string;
}

export function calcIncreaseProjection(
  empleados: number,
  precioIndividual: number,
  formula: FormulaAumento,
  valorAumento: number
): IncreaseProjection {
  const emp = Math.max(0, Number(empleados) || 0);
  const actual = Math.max(0, Number(precioIndividual) || 0);
  const val = Math.max(0, Number(valorAumento) || 0);

  let nuevoPrecio = actual;
  let formulaLabel = '';

  if (formula === 'porcentaje') {
    nuevoPrecio = Math.round(actual * (1 + val / 100));
    formulaLabel = `+${val}% sobre precio actual`;
  } else if (formula === 'ipc') {
    nuevoPrecio = Math.round(actual * (1 + val / 100));
    formulaLabel = `Ajuste IPC +${val}%`;
  } else {
    nuevoPrecio = Math.round(actual + val);
    formulaLabel = `+${formatARS(val)} monto fijo`;
  }

  const totalActual = calcMonthlyAmount(emp, actual);
  const nuevoTotalMensual = calcMonthlyAmount(emp, nuevoPrecio);
  const diferenciaMensual = nuevoTotalMensual - totalActual;
  const porcentajeEfectivo =
    actual > 0 ? Math.round(((nuevoPrecio - actual) / actual) * 1000) / 10 : 0;

  return {
    nuevoPrecioIndividual: nuevoPrecio,
    nuevoTotalMensual,
    diferenciaMensual,
    porcentajeEfectivo,
    formulaLabel,
  };
}

export function daysUntilDate(dateStr: string): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function daysOverdue(dueDate: string): number {
  const diff = daysUntilDate(dueDate);
  if (diff === null || diff >= 0) return 0;
  return Math.abs(diff);
}

export function advanceDateByMonths(isoDate: string, monthsToAdd: number): string {
  const base = isoDate ? new Date(`${isoDate}T00:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) {
    const fallback = new Date();
    fallback.setMonth(fallback.getMonth() + monthsToAdd);
    return fallback.toISOString().slice(0, 10);
  }
  const day = base.getDate();
  const next = new Date(base.getFullYear(), base.getMonth() + monthsToAdd, 1);
  const lastDayOfMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDayOfMonth));
  const yyyy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, '0');
  const dd = String(next.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function advanceDateByFrequency(
  isoDate: string,
  frecuencia?: FrecuenciaActualizacion
): string {
  if (!frecuencia || frecuencia === 'Manual') return isoDate;
  const monthsMap: Record<Exclude<FrecuenciaActualizacion, 'Manual'>, number> = {
    Mensual: 1,
    Bimestral: 2,
    Trimestral: 3,
    Semestral: 6,
  };
  return advanceDateByMonths(isoDate, monthsMap[frecuencia]);
}

export function hasUpcomingIncrease(company: Company, windowDays = 45): boolean {
  if (!company.fechaProximoAumento || company.valorAumento <= 0) return false;
  const diff = daysUntilDate(company.fechaProximoAumento);
  return diff !== null && diff <= windowDays;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '#';
  const normalized = digits.startsWith('54') ? digits : `549${digits.replace(/^0+/, '')}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function formatPeriodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  return `${months[month - 1] ?? month} ${year}`;
}

export function sanitizeFirestoreId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export interface ParsedMetaCsvResult {
  alcance: number;
  visualizaciones: number;
  visitasPerfil: number;
  interacciones: number;
  clicsEnlace: number;
  nuevosSeguidores: number;
  filesProcessed: number;
  detectedMetrics: string[];
}

function parseLocaleNumber(raw: string): number {
  const cleaned = raw.replace(/["'\s]/g, '');
  if (!cleaned) return 0;
  // Handle 12.450 or 12,450 or 12.450,50
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
    return Number(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned)) {
    return Number(cleaned.replace(/,/g, '')) || 0;
  }
  return Number(cleaned.replace(',', '.')) || 0;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseMetaCsvTexts(files: Array<{ name: string; content: string }>): ParsedMetaCsvResult {
  const totals: ParsedMetaCsvResult = {
    alcance: 0,
    visualizaciones: 0,
    visitasPerfil: 0,
    interacciones: 0,
    clicsEnlace: 0,
    nuevosSeguidores: 0,
    filesProcessed: files.length,
    detectedMetrics: [],
  };

  const detected = new Set<string>();

  for (const file of files) {
    const normalizedText = file.content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const lines = normalizedText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) continue;

    const fileNameLower = file.name.toLowerCase();
    const headerContext = lines.slice(0, 3).join(' ').toLowerCase();

    // Detect single-metric Meta Business Suite export (e.g., "Alcance", "Fecha,Instagram reach")
    const isSingleSeries =
      lines.some((l) => /^"?(fecha|date)"?[,;]/i.test(l)) &&
      lines.some((l) => splitCsvLine(l, l.includes(';') ? ';' : ',').length <= 3);

    if (isSingleSeries) {
      const dateHeaderIdx = lines.findIndex((l) => /^"?(fecha|date)"?[,;]/i.test(l));
      const delimiter = lines[dateHeaderIdx].includes(';') ? ';' : ',';
      const headerCols = splitCsvLine(lines[dateHeaderIdx], delimiter).map((c) => c.toLowerCase());
      const metricHint = `${fileNameLower} ${headerContext} ${headerCols.join(' ')}`;

      let sum = 0;
      for (let i = dateHeaderIdx + 1; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i], delimiter);
        if (cols.length >= 2) {
          sum += parseLocaleNumber(cols[1]);
        }
      }

      if (metricHint.includes('alcance') || metricHint.includes('reach')) {
        totals.alcance += sum;
        detected.add('Alcance');
      } else if (
        metricHint.includes('visualiz') ||
        metricHint.includes('impresion') ||
        metricHint.includes('views') ||
        metricHint.includes('impression')
      ) {
        totals.visualizaciones += sum;
        detected.add('Visualizaciones');
      } else if (metricHint.includes('visita') || metricHint.includes('profile visit')) {
        totals.visitasPerfil += sum;
        detected.add('Visitas al perfil');
      } else if (metricHint.includes('clic') || metricHint.includes('link click')) {
        totals.clicsEnlace += sum;
        detected.add('Clics en enlace');
      } else if (metricHint.includes('seguidor') || metricHint.includes('follow')) {
        totals.nuevosSeguidores += sum;
        detected.add('Nuevos seguidores');
      } else if (metricHint.includes('interacci') || metricHint.includes('engag')) {
        totals.interacciones += sum;
        detected.add('Interacciones');
      }
      continue;
    }

    // Multi-column Meta Content / Results table export
    const headerIdx = lines.findIndex((l) => {
      const lower = l.toLowerCase();
      return (
        lower.includes('alcance') ||
        lower.includes('reach') ||
        lower.includes('interacci') ||
        lower.includes('visualiz') ||
        lower.includes('impresion') ||
        lower.includes('clics') ||
        lower.includes('clicks') ||
        lower.includes('visitas')
      );
    });

    if (headerIdx === -1) continue;

    const delimiter = lines[headerIdx].includes(';') ? ';' : ',';
    const headers = splitCsvLine(lines[headerIdx], delimiter).map((h) => h.toLowerCase());

    const idxAlcance = headers.findIndex((h) => h.includes('alcance') || h.includes('reach'));
    const idxVisualizaciones = headers.findIndex(
      (h) =>
        h.includes('visualiz') ||
        h.includes('impresion') ||
        h.includes('views') ||
        h.includes('impressions') ||
        h.includes('reproduccion')
    );
    const idxVisitas = headers.findIndex((h) => h.includes('visita') || h.includes('profile visit'));
    const idxInteracciones = headers.findIndex(
      (h) => h.includes('interacci') || h.includes('engagement') || h.includes('me gusta') || h.includes('likes')
    );
    const idxClics = headers.findIndex(
      (h) => h.includes('clic') || h.includes('link click') || h.includes('website')
    );
    const idxSeguidores = headers.findIndex((h) => h.includes('seguidor') || h.includes('follow'));

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i], delimiter);
      if (idxAlcance >= 0 && cols[idxAlcance]) {
        totals.alcance += parseLocaleNumber(cols[idxAlcance]);
        detected.add('Alcance');
      }
      if (idxVisualizaciones >= 0 && cols[idxVisualizaciones]) {
        totals.visualizaciones += parseLocaleNumber(cols[idxVisualizaciones]);
        detected.add('Visualizaciones');
      }
      if (idxVisitas >= 0 && cols[idxVisitas]) {
        totals.visitasPerfil += parseLocaleNumber(cols[idxVisitas]);
        detected.add('Visitas al perfil');
      }
      if (idxInteracciones >= 0 && cols[idxInteracciones]) {
        totals.interacciones += parseLocaleNumber(cols[idxInteracciones]);
        detected.add('Interacciones');
      }
      if (idxClics >= 0 && cols[idxClics]) {
        totals.clicsEnlace += parseLocaleNumber(cols[idxClics]);
        detected.add('Clics en enlace');
      }
      if (idxSeguidores >= 0 && cols[idxSeguidores]) {
        totals.nuevosSeguidores += parseLocaleNumber(cols[idxSeguidores]);
        detected.add('Nuevos seguidores');
      }
    }
  }

  totals.detectedMetrics = Array.from(detected);
  return totals;
}
