import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  Archive,
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  Edit3,
  FileCheck2,
  FileSpreadsheet,
  History,
  Info,
  Layers,
  MessageCircle,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Undo2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  FRECUENCIA_ACTUALIZACION_OPTIONS,
  type BonusTicketState,
  type CobranzaEvent,
  type CobranzaEventType,
  type CobranzaResetItem,
  type CobranzaResetRecord,
  type Company,
  type FormulaAumento,
  type FrecuenciaActualizacion,
  type PaymentRecord,
  type PaymentStatus,
  type PlanTask,
} from '../types';
import {
  advanceDateByFrequency,
  advanceDateByMonths,
  buildWhatsAppUrl,
  calcIncreaseProjection,
  calcMonthlyAmount,
  daysOverdue,
  daysUntilDate,
  formatARS,
  formatNumber,
  formatPeriodLabel,
  hasUpcomingIncrease,
  sanitizeFirestoreId,
} from '../utils/calculations';
import { CURRENT_PLAN_WEEK } from '../data/seedData';
import { normalizePlanTask } from '../utils/planHelpers';

interface CobranzasViewProps {
  companies: Company[];
  payments: PaymentRecord[];
  cobranzaEvents: CobranzaEvent[];
  cobranzaResets: CobranzaResetRecord[];
  fullState: BonusTicketState;
  activePeriod: string;
  onChangePeriod: (period: string) => void;
  onSavePayment: (payment: PaymentRecord) => void;
  onDeletePayment: (paymentId: string) => void;
  onUpdateCompany: (company: Company) => void;
  onAddPlanTask: (task: PlanTask) => void;
  onAddCobranzaEvent: (event: CobranzaEvent) => void;
  onUpdateCobranzaEvent: (event: CobranzaEvent) => void;
  onDeleteCobranzaEvent: (eventId: string) => void;
  onAddCobranzaReset: (record: CobranzaResetRecord) => void;
  onDeleteCobranzaReset: (resetId: string) => void;
  onRestoreState: (nextState: BonusTicketState) => void;
  onResetSeedData: () => void;
  autoResetNotice?: string;
  onDismissAutoResetNotice?: () => void;
}

type CobranzaSubView = 'inicio' | 'lote' | 'ajustes' | 'agenda';
type StatusFilter = 'Todos' | 'Pendiente' | 'Parcial' | 'Pagada' | 'Vencida' | 'Marcada';
type SortOption = 'prioridad' | 'atraso' | 'proxima_factura' | 'mayor_saldo';

interface BillingRow {
  company: Company;
  payment?: PaymentRecord;
  facturado: number;
  cobrado: number;
  retenciones: number;
  saldo: number;
  estado: PaymentStatus;
  diasAtraso: number;
  fechaPrevista: string;
  marcadoFacturar: boolean;
  facturada: boolean;
  isFacturada: boolean;
  isPagada: boolean;
  fechaFacturacion: string;
  fechaPago: string;
  loteId?: string;
  subtotalEstimado: number;
  diasAjuste: number | null;
  alertaAjuste: boolean;
  alertaBase: 'faltante' | 'desactualizada' | 'ok';
  diasSinBase: number | null;
}

type ProcessAlertModalState =
  | {
      kind: 'must_bill_first';
      row: BillingRow;
    }
  | {
      kind: 'already_billed_or_paid';
      row: BillingRow;
      source: 'pago' | 'facturar';
    };

interface BatchExportRow {
  ID_Lote: string;
  Período: string;
  Empresa: string;
  CUIT: string;
  Empleados: number;
  Precio_Unitario_Empleado: number;
  Subtotal_Facturar: number;
  Fecha_Prevista: string;
}

const PERIOD_OPTIONS = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];
const HISTORY_PAGE_SIZE = 5;

const FORMULA_LABELS: Record<FormulaAumento, string> = {
  porcentaje: 'Porcentaje (%)',
  ipc: 'Índice / IPC (%)',
  monto_fijo: 'Monto fijo (+$)',
};

function computeEffectiveStatus(
  facturado: number,
  cobrado: number,
  retenciones: number,
  fechaVencimiento: string,
  explicitStatus?: PaymentStatus
): PaymentStatus {
  const saldo = Math.max(0, facturado - cobrado - retenciones);
  if (facturado > 0 && saldo <= 0) return 'Al día';
  if (facturado > 0 && explicitStatus === 'Al día' && saldo <= 0) return 'Al día';
  if (cobrado + retenciones > 0 && saldo > 0) return 'Parcial';
  if (facturado > 0 && (explicitStatus === 'Vencida' || (saldo > 0 && daysOverdue(fechaVencimiento) > 0))) {
    return 'Vencida';
  }
  return 'Pendiente';
}

function formatDateAR(iso?: string): string {
  if (!iso) return 'Sin fecha';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function downloadBatchCsv(rows: BatchExportRow[], loteId: string) {
  const headers = [
    'ID_Lote',
    'Período',
    'Empresa',
    'CUIT',
    'Empleados',
    'Precio_Unitario_Empleado',
    'Subtotal_Facturar',
    'Fecha_Prevista',
  ];
  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '');
    if (/[",;\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const lines = [
    headers.join(';'),
    ...rows.map((r) =>
      [
        r.ID_Lote,
        r.Período,
        r.Empresa,
        r.CUIT,
        r.Empleados,
        r.Precio_Unitario_Empleado,
        r.Subtotal_Facturar,
        r.Fecha_Prevista,
      ]
        .map(escapeCsv)
        .join(';')
    ),
  ];
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${loteId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBatchXlsx(rows: BatchExportRow[], loteId: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lote_Facturacion');
  XLSX.writeFile(wb, `${loteId}.xlsx`);
}

function buildSmartWhatsAppMessage(row: BillingRow, activePeriod: string): string {
  const periodLabel = formatPeriodLabel(activePeriod);
  const contacto = row.company.contactoCobranza || row.company.contactoPrincipal || 'equipo';
  const facturaTxt = row.payment?.numeroFactura ? ` (${row.payment.numeroFactura})` : '';

  if (row.estado === 'Vencida') {
    return `Hola ${contacto}, ¿cómo estás? Te escribimos desde Cobranzas de Bonus Ticket por el abono de ${row.company.nombre} del período ${periodLabel}${facturaTxt}. Registra un saldo pendiente de ${formatARS(row.saldo)} con ${row.diasAtraso} día${row.diasAtraso === 1 ? '' : 's'} de atraso (vencimiento ${formatDateAR(row.fechaPrevista)}). ¿Nos confirmás fecha estimada de pago o envío de comprobante? ¡Muchas gracias!`;
  }
  if (row.estado === 'Parcial') {
    return `Hola ${contacto}, ¿cómo estás? Desde Bonus Ticket te confirmamos que recibimos un pago parcial de ${formatARS(row.cobrado)}${row.retenciones > 0 ? ` más retenciones por ${formatARS(row.retenciones)}` : ''} para ${row.company.nombre} (${periodLabel}${facturaTxt}). Queda un saldo pendiente de ${formatARS(row.saldo)} con fecha prevista ${formatDateAR(row.fechaPrevista)}. ¡Quedamos atentos al comprobante del saldo!`;
  }
  if (row.estado === 'Al día') {
    return `Hola ${contacto}, ¿cómo estás? Te escribimos desde Bonus Ticket para confirmar que el período ${periodLabel}${facturaTxt} de ${row.company.nombre} se encuentra acreditado y al día (${formatARS(row.facturado)}). ¡Muchas gracias por la puntualidad!`;
  }
  return `Hola ${contacto}, ¿cómo estás? Te escribimos desde Cobranzas de Bonus Ticket recordando el abono de ${row.company.nombre} correspondiente a ${periodLabel}${facturaTxt} por ${formatARS(row.saldo)} (fecha prevista ${formatDateAR(row.fechaPrevista)}). Ante cualquier consulta o envío de comprobante, quedamos a disposición.`;
}

function extractPreviousPriceFromDetail(detalle: string): number | null {
  const match = detalle.match(/\$\s*([\d.]+)\s*(?:→|->)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(/\./g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export const CobranzasView: React.FC<CobranzasViewProps> = ({
  companies,
  payments,
  cobranzaEvents,
  cobranzaResets,
  fullState,
  activePeriod,
  onChangePeriod,
  onSavePayment,
  onDeletePayment,
  onUpdateCompany,
  onAddPlanTask,
  onAddCobranzaEvent,
  onUpdateCobranzaEvent,
  onDeleteCobranzaEvent,
  onAddCobranzaReset,
  onDeleteCobranzaReset,
  onRestoreState,
  onResetSeedData,
  autoResetNotice,
  onDismissAutoResetNotice,
}) => {
  // Navigation between the 4 mobile-first sub-views
  const [subView, setSubView] = useState<CobranzaSubView>('inicio');

  // Filters & sorting on Inicio
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Todos');
  const [sortBy, setSortBy] = useState<SortOption>('prioridad');
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

  // Expanded collapsible sections per company card
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  // Toast / feedback banner
  const [feedback, setFeedback] = useState<string>('');
  const notify = (msg: string) => {
    setFeedback(msg);
  };

  // Modal: + Pago (supports cumulative partial payments + retenciones)
  const [payModalRow, setPayModalRow] = useState<BillingRow | null>(null);
  const [payMode, setPayMode] = useState<'abono' | 'editar'>('abono');
  const [payMonto, setPayMonto] = useState<number>(0);
  const [payRetenciones, setPayRetenciones] = useState<number>(0);
  const [payFacturado, setPayFacturado] = useState<number>(0);
  const [payFecha, setPayFecha] = useState<string>(new Date().toISOString().slice(0, 10));
  const [payVencimiento, setPayVencimiento] = useState<string>('');
  const [payFactura, setPayFactura] = useState<string>('');
  const [payMedio, setPayMedio] = useState<string>('Transferencia Bancaria');
  const [payObs, setPayObs] = useState<string>('');

  // Modal: Editar empresa / corregir o eliminar facturación del período
  const [editModalRow, setEditModalRow] = useState<BillingRow | null>(null);
  const [editCuit, setEditCuit] = useState('');
  const [editContacto, setEditContacto] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editMail, setEditMail] = useState('');
  const [editEmpleados, setEditEmpleados] = useState(0);
  const [editFechaBase, setEditFechaBase] = useState('');
  const [editControlada, setEditControlada] = useState(false);
  const [editProxFacturar, setEditProxFacturar] = useState('');
  const [editVencimiento, setEditVencimiento] = useState('');
  const [editFacturaNro, setEditFacturaNro] = useState('');
  const [editMontoFacturado, setEditMontoFacturado] = useState(0);
  const [editMontoCobrado, setEditMontoCobrado] = useState(0);
  const [editRetenciones, setEditRetenciones] = useState(0);
  const [editLoteId, setEditLoteId] = useState('');
  const [editObs, setEditObs] = useState('');
  const [confirmEditAction, setConfirmEditAction] = useState<'none' | 'reset_cobros' | 'delete_billing'>('none');

  // Modal: Historial rápido de una empresa
  const [historyCompany, setHistoryCompany] = useState<Company | null>(null);

  // Modals: Corregir o Eliminar/Revertir un movimiento del historial
  const [editEventModal, setEditEventModal] = useState<CobranzaEvent | null>(null);
  const [evEditFecha, setEvEditFecha] = useState('');
  const [evEditMonto, setEvEditMonto] = useState<number>(0);
  const [evEditRetenciones, setEvEditRetenciones] = useState<number>(0);
  const [evEditDetalle, setEvEditDetalle] = useState('');
  const [evSyncLedger, setEvSyncLedger] = useState(true);

  const [deleteEventModal, setDeleteEventModal] = useState<CobranzaEvent | null>(null);
  const [evRevertAction, setEvRevertAction] = useState(true);
  const [evRestorePrice, setEvRestorePrice] = useState<number>(0);

  // Batch annulment inline confirmation
  const [confirmAnnulBatchId, setConfirmAnnulBatchId] = useState<string | null>(null);

  // Ajuste Precios filter
  const [ajusteFilter, setAjusteFilter] = useState<'todos' | 'urgentes' | 'al_dia'>('todos');

  // Agenda / Historial state
  const [histCompanyFilter, setHistCompanyFilter] = useState<string>('all');
  const [histTypeFilter, setHistTypeFilter] = useState<'all' | CobranzaEventType>('all');
  const [compEmpresaId, setCompEmpresaId] = useState<string>('');
  const [compFecha, setCompFecha] = useState<string>(new Date().toISOString().slice(0, 10));
  const [compMonto, setCompMonto] = useState<string>('');
  const [compDetalle, setCompDetalle] = useState<string>('');
  const [confirmResetSeed, setConfirmResetSeed] = useState(false);

  // Period Reset + Reset History Modal state
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetMotivo, setResetMotivo] = useState('');
  const [resetHistoryModalOpen, setResetHistoryModalOpen] = useState(false);
  const [resetHistoryPeriodFilter, setResetHistoryPeriodFilter] = useState<string>('all');
  const [expandedResetIds, setExpandedResetIds] = useState<Record<string, boolean>>({});
  const [confirmRestoreResetId, setConfirmRestoreResetId] = useState<string | null>(null);
  const [confirmDeleteResetId, setConfirmDeleteResetId] = useState<string | null>(null);

  // Pagination states (cada 5 registros)
  const [eventsPage, setEventsPage] = useState(1);
  const [resetHistoryPage, setResetHistoryPage] = useState(1);
  const [companyHistoryPage, setCompanyHistoryPage] = useState(1);

  // Billing-before-payment process alert modal & individual billing modal
  const [processAlertModal, setProcessAlertModal] = useState<ProcessAlertModalState | null>(null);
  const [billModalRow, setBillModalRow] = useState<BillingRow | null>(null);
  const [billMonto, setBillMonto] = useState<number>(0);
  const [billFecha, setBillFecha] = useState<string>(new Date().toISOString().slice(0, 10));
  const [billVencimiento, setBillVencimiento] = useState<string>('');
  const [billFactura, setBillFactura] = useState<string>('');

  // Last generated batch preview
  const [lastBatch, setLastBatch] = useState<{
    loteId: string;
    rows: BatchExportRow[];
    totalAmount: number;
    totalEmployees: number;
  } | null>(null);

  // Dynamic period selector (always includes activePeriod + current calendar month)
  const periodOptions = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const set = new Set<string>([...PERIOD_OPTIONS, currentMonth, activePeriod]);
    for (const p of payments) {
      if (p.periodo) set.add(p.periodo);
    }
    for (const r of cobranzaResets) {
      if (r.periodo) set.add(r.periodo);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activePeriod, payments, cobranzaResets]);

  const activeCompanies = useMemo(
    () => companies.filter((c) => c.estado === 'Activa'),
    [companies]
  );

  // Build unified BillingRows for active period
  const rows: BillingRow[] = useMemo(() => {
    return activeCompanies.map((company) => {
      const payment = payments.find(
        (p) => p.empresaId === company.id && p.periodo === activePeriod
      );
      const subtotalEstimado = calcMonthlyAmount(company.empleados, company.precioIndividual);
      const isFacturada = Boolean(payment && (payment.facturada || payment.montoFacturado > 0));
      const facturado = isFacturada ? (payment?.montoFacturado ?? 0) : 0;
      const cobrado = payment ? payment.montoCobrado : 0;
      const retenciones = payment ? payment.retenciones : 0;
      const saldo = Math.max(0, facturado - cobrado - retenciones);
      const fechaPrevista = payment?.fechaVencimiento || `${activePeriod}-20`;
      const estado = computeEffectiveStatus(
        facturado,
        cobrado,
        retenciones,
        fechaPrevista,
        payment?.estado
      );
      const isPagada = isFacturada && saldo <= 0 && (cobrado > 0 || retenciones > 0 || estado === 'Al día');
      const fechaFacturacion = payment?.fechaFacturacion || (isFacturada ? `${activePeriod}-05` : '');
      const fechaPago = payment?.fechaPago || '';
      const diasAtraso = isFacturada && saldo > 0 ? daysOverdue(fechaPrevista) : 0;
      const diasAjuste = daysUntilDate(company.fechaProximoAumento);
      const alertaAjuste = diasAjuste !== null && diasAjuste <= 30;

      let alertaBase: 'faltante' | 'desactualizada' | 'ok' = 'ok';
      let diasSinBase: number | null = null;
      if (!company.fechaBaseEmpleados) {
        alertaBase = 'faltante';
      } else {
        const diffBase = daysUntilDate(company.fechaBaseEmpleados);
        if (diffBase !== null) {
          diasSinBase = Math.max(0, -diffBase);
          if (diasSinBase > 35) alertaBase = 'desactualizada';
        }
      }

      return {
        company,
        payment,
        facturado,
        cobrado,
        retenciones,
        saldo,
        estado,
        diasAtraso,
        fechaPrevista,
        marcadoFacturar: Boolean(payment?.marcadoFacturar),
        facturada: isFacturada,
        isFacturada,
        isPagada,
        fechaFacturacion,
        fechaPago,
        loteId: payment?.loteId,
        subtotalEstimado,
        diasAjuste,
        alertaAjuste,
        alertaBase,
        diasSinBase,
      };
    });
  }, [activeCompanies, payments, activePeriod]);

  const unbilledRows = useMemo(() => rows.filter((r) => !r.isFacturada), [rows]);
  const unbilledUnmarkedRows = useMemo(
    () => rows.filter((r) => !r.isFacturada && !r.marcadoFacturar),
    [rows]
  );

  // KPI metrics (all 9 requested + billing progress)
  const kpis = useMemo(() => {
    const clientes = rows.length;
    const totalFacturado = rows.reduce((s, r) => s + r.facturado, 0);
    const totalCobrado = rows.reduce((s, r) => s + r.cobrado, 0);
    const totalRetenciones = rows.reduce((s, r) => s + r.retenciones, 0);
    const totalPendiente = rows.reduce((s, r) => s + r.saldo, 0);
    const pagadas = rows.filter((r) => r.estado === 'Al día').length;
    const parciales = rows.filter((r) => r.estado === 'Parcial').length;
    const vencidas = rows.filter((r) => r.estado === 'Vencida').length;
    const porActualizar = rows.filter((r) => hasUpcomingIncrease(r.company, 45)).length;
    const marcadas = rows.filter((r) => r.marcadoFacturar).length;
    const facturadas = rows.filter((r) => r.isFacturada).length;
    const sinFacturar = clientes - facturadas;
    return {
      clientes,
      totalFacturado,
      totalCobrado,
      totalRetenciones,
      totalPendiente,
      pagadas,
      parciales,
      vencidas,
      porActualizar,
      marcadas,
      facturadas,
      sinFacturar,
    };
  }, [rows]);

  // Filtered + sorted rows for Inicio view
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (statusFilter === 'Pagada' && r.estado !== 'Al día') return false;
      if (statusFilter === 'Pendiente' && r.estado !== 'Pendiente') return false;
      if (statusFilter === 'Parcial' && r.estado !== 'Parcial') return false;
      if (statusFilter === 'Vencida' && r.estado !== 'Vencida') return false;
      if (statusFilter === 'Marcada' && !r.marcadoFacturar) return false;

      if (q) {
        const hay = [
          r.company.nombre,
          r.company.cuit || '',
          r.company.contactoCobranza || '',
          r.company.contactoPrincipal || '',
          r.company.telefonoCobro || '',
          r.company.telefonoPrincipal || '',
          r.payment?.numeroFactura || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      if (sortBy === 'atraso') {
        return b.diasAtraso - a.diasAtraso || b.saldo - a.saldo;
      }
      if (sortBy === 'proxima_factura') {
        const da = a.company.proximaFechaFacturar || '9999-12-31';
        const db = b.company.proximaFechaFacturar || '9999-12-31';
        return da.localeCompare(db);
      }
      if (sortBy === 'mayor_saldo') {
        return b.saldo - a.saldo || b.diasAtraso - a.diasAtraso;
      }
      // Default: prioridad de cobranza
      const prio: Record<PaymentStatus, number> = {
        Vencida: 0,
        Parcial: 1,
        Pendiente: 2,
        'Al día': 3,
      };
      return (
        prio[a.estado] - prio[b.estado] ||
        b.diasAtraso - a.diasAtraso ||
        b.saldo - a.saldo
      );
    });
  }, [rows, search, statusFilter, sortBy]);

  // Marked rows for Lote Facturar
  const markedRows = useMemo(() => rows.filter((r) => r.marcadoFacturar), [rows]);
  const unmarkedRows = useMemo(() => rows.filter((r) => !r.marcadoFacturar), [rows]);
  const batchSummary = useMemo(() => {
    const count = markedRows.length;
    const employees = markedRows.reduce((s, r) => s + r.company.empleados, 0);
    const total = markedRows.reduce((s, r) => s + r.subtotalEstimado, 0);
    return { count, employees, total };
  }, [markedRows]);

  // Issued batches in active period (for re-download or full annulment)
  const issuedBatches = useMemo(() => {
    const map = new Map<
      string,
      { loteId: string; rows: BatchExportRow[]; totalAmount: number; totalEmployees: number }
    >();
    for (const row of rows) {
      if (!row.loteId) continue;
      const existing = map.get(row.loteId) || {
        loteId: row.loteId,
        rows: [],
        totalAmount: 0,
        totalEmployees: 0,
      };
      existing.rows.push({
        ID_Lote: row.loteId,
        Período: formatPeriodLabel(activePeriod),
        Empresa: row.company.nombre,
        CUIT: row.company.cuit || 'Sin CUIT',
        Empleados: row.company.empleados,
        Precio_Unitario_Empleado: row.company.precioIndividual,
        Subtotal_Facturar: row.facturado,
        Fecha_Prevista: row.fechaPrevista,
      });
      existing.totalAmount += row.facturado;
      existing.totalEmployees += row.company.empleados;
      map.set(row.loteId, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.loteId.localeCompare(a.loteId));
  }, [rows, activePeriod]);

  // Sorted companies for Ajuste Precios
  const ajusteRows = useMemo(() => {
    return [...rows]
      .filter((r) => {
        if (ajusteFilter === 'urgentes') return r.alertaAjuste;
        if (ajusteFilter === 'al_dia') return !r.alertaAjuste;
        return true;
      })
      .sort((a, b) => {
        const da = a.diasAjuste ?? 9999;
        const db = b.diasAjuste ?? 9999;
        return da - db;
      });
  }, [rows, ajusteFilter]);

  // Upcoming agenda items (due dates + price updates)
  const agendaItems = useMemo(() => {
    const items: Array<{
      id: string;
      fecha: string;
      empresaNombre: string;
      empresaId: string;
      categoria: 'Vencimiento' | 'Ajuste de precio' | 'Compromiso';
      detalle: string;
      monto?: number;
      urgente: boolean;
    }> = [];

    for (const r of rows) {
      if (r.saldo > 0) {
        items.push({
          id: `due_${r.company.id}`,
          fecha: r.fechaPrevista,
          empresaNombre: r.company.nombre,
          empresaId: r.company.id,
          categoria: 'Vencimiento',
          detalle:
            r.diasAtraso > 0
              ? `Vencida hace ${r.diasAtraso} día${r.diasAtraso === 1 ? '' : 's'} · ${r.estado}`
              : `Vencimiento previsto · ${r.estado}`,
          monto: r.saldo,
          urgente: r.diasAtraso > 0 || (daysUntilDate(r.fechaPrevista) ?? 99) <= 5,
        });
      }
      if (r.alertaAjuste && r.company.fechaProximoAumento) {
        const proj = calcIncreaseProjection(
          r.company.empleados,
          r.company.precioIndividual,
          r.company.formulaAumento,
          r.company.valorAumento
        );
        items.push({
          id: `adj_${r.company.id}`,
          fecha: r.company.fechaProximoAumento,
          empresaNombre: r.company.nombre,
          empresaId: r.company.id,
          categoria: 'Ajuste de precio',
          detalle: `${formatARS(r.company.precioIndividual)} → ${formatARS(proj.nuevoPrecioIndividual)} (${proj.formulaLabel})`,
          monto: proj.nuevoTotalMensual,
          urgente: (r.diasAjuste ?? 99) <= 7,
        });
      }
    }

    for (const ev of cobranzaEvents) {
      if (ev.tipo === 'Compromiso') {
        const d = daysUntilDate(ev.fecha);
        if (d === null || d >= -10) {
          items.push({
            id: ev.id,
            fecha: ev.fecha,
            empresaNombre: ev.empresaNombre,
            empresaId: ev.empresaId,
            categoria: 'Compromiso',
            detalle: ev.detalle,
            monto: ev.monto,
            urgente: d !== null && d <= 2,
          });
        }
      }
    }

    return items.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [rows, cobranzaEvents]);

  // Filtered event history + pagination (cada 5)
  const filteredEvents = useMemo(() => {
    return [...cobranzaEvents]
      .filter((ev) => {
        if (histCompanyFilter !== 'all' && ev.empresaId !== histCompanyFilter) return false;
        if (histTypeFilter !== 'all' && ev.tipo !== histTypeFilter) return false;
        return true;
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
  }, [cobranzaEvents, histCompanyFilter, histTypeFilter]);

  const eventsTotalPages = Math.max(1, Math.ceil(filteredEvents.length / HISTORY_PAGE_SIZE));
  const safeEventsPage = Math.min(eventsPage, eventsTotalPages);
  const paginatedEvents = useMemo(() => {
    const start = (safeEventsPage - 1) * HISTORY_PAGE_SIZE;
    return filteredEvents.slice(start, start + HISTORY_PAGE_SIZE);
  }, [filteredEvents, safeEventsPage]);

  // Quick company history modal list + pagination (cada 5)
  const companyHistoryEvents = useMemo(() => {
    if (!historyCompany) return [];
    return cobranzaEvents
      .filter((ev) => ev.empresaId === historyCompany.id)
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
  }, [cobranzaEvents, historyCompany]);

  const companyHistoryTotalPages = Math.max(
    1,
    Math.ceil(companyHistoryEvents.length / HISTORY_PAGE_SIZE)
  );
  const safeCompanyHistoryPage = Math.min(companyHistoryPage, companyHistoryTotalPages);
  const paginatedCompanyHistoryEvents = useMemo(() => {
    const start = (safeCompanyHistoryPage - 1) * HISTORY_PAGE_SIZE;
    return companyHistoryEvents.slice(start, start + HISTORY_PAGE_SIZE);
  }, [companyHistoryEvents, safeCompanyHistoryPage]);

  // Sorted & filtered period resets history + pagination (cada 5)
  const sortedResets = useMemo(() => {
    return [...cobranzaResets]
      .filter((r) => resetHistoryPeriodFilter === 'all' || r.periodo === resetHistoryPeriodFilter)
      .sort(
        (a, b) =>
          b.fecha.localeCompare(a.fecha) ||
          (b.hora || '').localeCompare(a.hora || '') ||
          b.id.localeCompare(a.id)
      );
  }, [cobranzaResets, resetHistoryPeriodFilter]);

  const resetsTotalPages = Math.max(1, Math.ceil(sortedResets.length / HISTORY_PAGE_SIZE));
  const safeResetHistoryPage = Math.min(resetHistoryPage, resetsTotalPages);
  const paginatedResets = useMemo(() => {
    const start = (safeResetHistoryPage - 1) * HISTORY_PAGE_SIZE;
    return sortedResets.slice(start, start + HISTORY_PAGE_SIZE);
  }, [sortedResets, safeResetHistoryPage]);

  const resetHistoryPeriods = useMemo(() => {
    const set = new Set<string>(cobranzaResets.map((r) => r.periodo));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [cobranzaResets]);

  // --- ACTIONS ---

  const ensurePaymentRecord = (row: BillingRow, patch: Partial<PaymentRecord>): PaymentRecord => {
    const base: PaymentRecord = row.payment || {
      id: sanitizeFirestoreId('pay'),
      empresaId: row.company.id,
      periodo: activePeriod,
      montoFacturado: row.facturado,
      montoCobrado: 0,
      retenciones: 0,
      estado: row.estado,
      fechaPago: '',
      fechaFacturacion: row.fechaFacturacion || '',
      fechaVencimiento: row.fechaPrevista,
      numeroFactura: '',
      medioPago: 'Transferencia Bancaria',
      observaciones: '',
      marcadoFacturar: false,
      facturada: row.isFacturada,
    };
    const merged: PaymentRecord = { ...base, ...patch };
    merged.estado = computeEffectiveStatus(
      merged.montoFacturado,
      merged.montoCobrado,
      merged.retenciones,
      merged.fechaVencimiento,
      patch.estado
    );
    return merged;
  };

  const handleToggleMarcarFacturar = (row: BillingRow) => {
    const nextVal = !row.marcadoFacturar;
    if (nextVal && (row.isFacturada || row.isPagada)) {
      setProcessAlertModal({ kind: 'already_billed_or_paid', row, source: 'facturar' });
      return;
    }
    const updated = ensurePaymentRecord(row, { marcadoFacturar: nextVal });
    onSavePayment(updated);
    notify(
      nextVal
        ? `${row.company.nombre} marcada para el lote de ${formatPeriodLabel(activePeriod)}.`
        : `${row.company.nombre} quitada del lote de facturación.`
    );
  };

  const handleMarkAllUnbilled = () => {
    if (unbilledUnmarkedRows.length === 0) return;
    for (const row of unbilledUnmarkedRows) {
      const updated = ensurePaymentRecord(row, { marcadoFacturar: true });
      onSavePayment(updated);
    }
    notify(
      `Se marcaron ${unbilledUnmarkedRows.length} empresa${unbilledUnmarkedRows.length === 1 ? '' : 's'} pendientes para el lote de ${formatPeriodLabel(activePeriod)}.`
    );
  };

  const openBillModal = (row: BillingRow) => {
    if (row.isFacturada || row.isPagada) {
      setProcessAlertModal({ kind: 'already_billed_or_paid', row, source: 'facturar' });
      return;
    }
    setBillModalRow(row);
    setBillMonto(row.subtotalEstimado);
    setBillFecha(new Date().toISOString().slice(0, 10));
    setBillVencimiento(row.fechaPrevista || `${activePeriod}-20`);
    setBillFactura(row.payment?.numeroFactura || '');
  };

  const handleConfirmSingleBill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!billModalRow) return;
    const monto = Math.max(0, Number(billMonto) || 0);
    if (monto <= 0) {
      notify('Ingresá un monto facturado mayor a $0.');
      return;
    }
    const fechaFact = billFecha || new Date().toISOString().slice(0, 10);
    const fechaPrev = billVencimiento || billModalRow.fechaPrevista || `${activePeriod}-20`;

    const updatedPayment = ensurePaymentRecord(billModalRow, {
      montoFacturado: monto,
      fechaFacturacion: fechaFact,
      fechaVencimiento: fechaPrev,
      numeroFactura: billFactura.trim(),
      marcadoFacturar: false,
      facturada: true,
      observaciones: billModalRow.payment?.observaciones
        ? `${billModalRow.payment.observaciones} | Facturado individualmente el ${formatDateAR(fechaFact)}`
        : `Facturado el ${formatDateAR(fechaFact)}`,
    });
    onSavePayment(updatedPayment);

    const nextBillingDate = advanceDateByMonths(
      billModalRow.company.proximaFechaFacturar || `${activePeriod}-05`,
      1
    );
    onUpdateCompany({
      ...billModalRow.company,
      proximaFechaFacturar: nextBillingDate,
    });

    onAddCobranzaEvent({
      id: sanitizeFirestoreId('cev'),
      empresaId: billModalRow.company.id,
      empresaNombre: billModalRow.company.nombre,
      periodo: activePeriod,
      fecha: fechaFact,
      tipo: 'Lote facturado',
      monto,
      detalle: `Facturación individual emitida para ${formatPeriodLabel(activePeriod)}${billFactura.trim() ? ` (${billFactura.trim()})` : ''}: ${formatARS(monto)} (${billModalRow.company.empleados} emp.).`,
    });

    notify(
      `${billModalRow.company.nombre} facturada para ${formatPeriodLabel(activePeriod)} (${formatARS(monto)}).`
    );
    setBillModalRow(null);
  };

  const handleToggleControlada = (company: Company) => {
    const nextVal = !company.facturacionControlada;
    onUpdateCompany({ ...company, facturacionControlada: nextVal });
  };

  const handleInlineUnitPriceChange = (company: Company, rawVal: string) => {
    const parsed = Math.max(0, Number(rawVal) || 0);
    onUpdateCompany({ ...company, precioIndividual: parsed });
  };

  const handleInlineCompanyPatch = (company: Company, patch: Partial<Company>) => {
    onUpdateCompany({ ...company, ...patch });
  };

  const handleApplyNewPrice = (company: Company) => {
    const proj = calcIncreaseProjection(
      company.empleados,
      company.precioIndividual,
      company.formulaAumento,
      company.valorAumento
    );
    if (proj.nuevoPrecioIndividual <= 0) return;

    const precioAnterior = company.precioIndividual;
    const freq: FrecuenciaActualizacion = company.frecuenciaActualizacion || 'Trimestral';
    const nextAdjustmentDate = advanceDateByFrequency(
      company.fechaProximoAumento || new Date().toISOString().slice(0, 10),
      freq
    );

    onUpdateCompany({
      ...company,
      precioIndividual: proj.nuevoPrecioIndividual,
      fechaProximoAumento: nextAdjustmentDate,
    });

    onAddCobranzaEvent({
      id: sanitizeFirestoreId('cev'),
      empresaId: company.id,
      empresaNombre: company.nombre,
      periodo: activePeriod,
      fecha: new Date().toISOString().slice(0, 10),
      tipo: 'Cambio de tarifa',
      monto: proj.nuevoPrecioIndividual,
      detalle: `Precio unitario actualizado: ${formatARS(precioAnterior)} → ${formatARS(proj.nuevoPrecioIndividual)} (${proj.formulaLabel}). Nuevo subtotal: ${formatARS(proj.nuevoTotalMensual)} (${company.empleados} emp.). Próximo ajuste: ${formatDateAR(nextAdjustmentDate)}.`,
    });

    notify(
      `Nuevo precio aplicado en ${company.nombre}: ${formatARS(proj.nuevoPrecioIndividual)} / emp. (${formatARS(proj.nuevoTotalMensual)}).`
    );
  };

  const handleScheduleIncreaseTask = (company: Company) => {
    const proj = calcIncreaseProjection(
      company.empleados,
      company.precioIndividual,
      company.formulaAumento,
      company.valorAumento
    );
    onAddPlanTask({
      id: sanitizeFirestoreId('plan'),
      titulo: `Enviar aviso de actualización de tarifa (${formatARS(company.precioIndividual)} → ${formatARS(proj.nuevoPrecioIndividual)}) a ${company.nombre}`,
      sector: 'Cobranzas',
      sectores: ['Cobranzas'],
      fechaObjetivo: company.fechaProximoAumento || new Date().toISOString().slice(0, 10),
      semana: CURRENT_PLAN_WEEK,
      prioridad: 'Alta',
      estado: 'Pendiente',
      empresaId: company.id,
      empresaNombre: company.nombre,
      linkDrive: company.linkContrato || '',
    });
    notify(`Recordatorio de actualización creado en Planificación Semanal para ${company.nombre}.`);
  };

  // Open + Pago modal directly (after process checks pass)
  const openPayModalDirect = (row: BillingRow) => {
    setPayModalRow(row);
    setPayMode('abono');
    setPayMonto(row.saldo > 0 ? row.saldo : 0);
    setPayRetenciones(0);
    setPayFacturado(row.facturado);
    setPayFecha(new Date().toISOString().slice(0, 10));
    setPayVencimiento(row.fechaPrevista);
    setPayFactura(row.payment?.numeroFactura || '');
    setPayMedio(row.payment?.medioPago || 'Transferencia Bancaria');
    setPayObs('');
  };

  // Open + Pago with per-company billing-first & already-paid workflow checks
  const openPayModal = (row: BillingRow) => {
    // 1. If the company is already paid, show "Ya pagado" notice with date
    if (row.isPagada) {
      setProcessAlertModal({ kind: 'already_billed_or_paid', row, source: 'pago' });
      return;
    }

    // 2. Must bill THIS company for the current month before recording its payment
    if (!row.isFacturada) {
      setProcessAlertModal({
        kind: 'must_bill_first',
        row,
      });
      return;
    }

    openPayModalDirect(row);
  };

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalRow) return;

    const addCobro = Math.max(0, Number(payMonto) || 0);
    const addRet = Math.max(0, Number(payRetenciones) || 0);
    const nextFacturado = Math.max(0, Number(payFacturado) || 0);

    const nextCobrado =
      payMode === 'abono' ? payModalRow.cobrado + addCobro : addCobro;
    const nextRetenciones =
      payMode === 'abono' ? payModalRow.retenciones + addRet : addRet;
    const nextSaldo = Math.max(0, nextFacturado - nextCobrado - nextRetenciones);
    const nextEstado = computeEffectiveStatus(
      nextFacturado,
      nextCobrado,
      nextRetenciones,
      payVencimiento || payModalRow.fechaPrevista
    );

    const combinedObs = payObs.trim()
      ? payModalRow.payment?.observaciones && payMode === 'abono'
        ? `${payModalRow.payment.observaciones} | ${formatDateAR(payFecha)}: ${payObs.trim()}`
        : payObs.trim()
      : payModalRow.payment?.observaciones || '';

    const updated = ensurePaymentRecord(payModalRow, {
      montoFacturado: nextFacturado,
      montoCobrado: nextCobrado,
      retenciones: nextRetenciones,
      estado: nextEstado,
      fechaPago: nextCobrado > 0 || nextRetenciones > 0 ? payFecha : '',
      fechaVencimiento: payVencimiento || payModalRow.fechaPrevista,
      numeroFactura: payFactura.trim(),
      medioPago: payMedio,
      observaciones: combinedObs.slice(0, 500),
    });

    onSavePayment(updated);

    if (addCobro > 0 || addRet > 0) {
      const tipoLabel = nextSaldo <= 0 ? 'Cancelación total' : 'Pago parcial';
      onAddCobranzaEvent({
        id: sanitizeFirestoreId('cev'),
        empresaId: payModalRow.company.id,
        empresaNombre: payModalRow.company.nombre,
        periodo: activePeriod,
        fecha: payFecha,
        tipo: 'Pago',
        monto: addCobro,
        retenciones: addRet,
        detalle: `${tipoLabel} (${payMedio})${payFactura.trim() ? ` · ${payFactura.trim()}` : ''}${addRet > 0 ? ` · Retenciones ${formatARS(addRet)}` : ''}${payObs.trim() ? ` · ${payObs.trim()}` : ''}. Saldo restante: ${formatARS(nextSaldo)}.`,
      });
    }

    notify(
      nextSaldo <= 0
        ? `Pago completo registrado para ${payModalRow.company.nombre}.`
        : `Abono registrado en ${payModalRow.company.nombre}. Saldo pendiente: ${formatARS(nextSaldo)}.`
    );
    setPayModalRow(null);
  };

  // Open Edit Modal (corregir empresa, facturación, cobros o eliminar registro del período)
  const openEditModal = (row: BillingRow) => {
    setEditModalRow(row);
    setEditCuit(row.company.cuit || '');
    setEditContacto(row.company.contactoCobranza || row.company.contactoPrincipal || '');
    setEditTelefono(row.company.telefonoCobro || row.company.telefonoPrincipal || '');
    setEditMail(row.company.mailCobro || '');
    setEditEmpleados(row.company.empleados);
    setEditFechaBase(row.company.fechaBaseEmpleados || '');
    setEditControlada(Boolean(row.company.facturacionControlada));
    setEditProxFacturar(row.company.proximaFechaFacturar || '');
    setEditVencimiento(row.fechaPrevista);
    setEditFacturaNro(row.payment?.numeroFactura || '');
    setEditMontoFacturado(row.facturado);
    setEditMontoCobrado(row.cobrado);
    setEditRetenciones(row.retenciones);
    setEditLoteId(row.loteId || '');
    setEditObs(row.payment?.observaciones || '');
    setConfirmEditAction('none');
  };

  const handleSaveEditModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalRow) return;
    const nextEmpleados = Math.max(0, Math.round(Number(editEmpleados) || 0));
    onUpdateCompany({
      ...editModalRow.company,
      cuit: editCuit.trim(),
      contactoCobranza: editContacto.trim(),
      telefonoCobro: editTelefono.trim(),
      mailCobro: editMail.trim(),
      empleados: nextEmpleados,
      fechaBaseEmpleados: editFechaBase,
      facturacionControlada: editControlada,
      proximaFechaFacturar: editProxFacturar,
    });

    const nextFact = Math.max(0, Number(editMontoFacturado) || 0);
    const nextCob = Math.max(0, Number(editMontoCobrado) || 0);
    const nextRet = Math.max(0, Number(editRetenciones) || 0);
    const cleanLote = editLoteId.trim();

    const paymentChanged =
      editVencimiento !== editModalRow.fechaPrevista ||
      editFacturaNro !== (editModalRow.payment?.numeroFactura || '') ||
      nextFact !== editModalRow.facturado ||
      nextCob !== editModalRow.cobrado ||
      nextRet !== editModalRow.retenciones ||
      cleanLote !== (editModalRow.loteId || '') ||
      editObs !== (editModalRow.payment?.observaciones || '');

    if (paymentChanged) {
      const nextIsFacturada = nextFact > 0 || Boolean(cleanLote);
      const updatedPayment = ensurePaymentRecord(editModalRow, {
        montoFacturado: nextFact,
        montoCobrado: nextCob,
        retenciones: nextRet,
        fechaPago:
          nextCob > 0 || nextRet > 0
            ? editModalRow.payment?.fechaPago || new Date().toISOString().slice(0, 10)
            : '',
        fechaFacturacion: nextIsFacturada
          ? editModalRow.payment?.fechaFacturacion || new Date().toISOString().slice(0, 10)
          : '',
        fechaVencimiento: editVencimiento || editModalRow.fechaPrevista,
        numeroFactura: editFacturaNro.trim(),
        loteId: cleanLote,
        facturada: nextIsFacturada,
        observaciones: editObs.trim().slice(0, 500),
      });
      onSavePayment(updatedPayment);
    }

    notify(`Datos y facturación corregidos para ${editModalRow.company.nombre}.`);
    setEditModalRow(null);
  };

  const handleResetPeriodCollections = () => {
    if (!editModalRow) return;
    const updatedPayment = ensurePaymentRecord(editModalRow, {
      montoCobrado: 0,
      retenciones: 0,
      fechaPago: '',
      observaciones: editModalRow.payment?.observaciones
        ? `${editModalRow.payment.observaciones} | Cobros reiniciados por corrección`
        : 'Cobros reiniciados a $0 por corrección.',
    });
    onSavePayment(updatedPayment);
    setEditMontoCobrado(0);
    setEditRetenciones(0);
    setConfirmEditAction('none');
    notify(`Cobros y retenciones de ${editModalRow.company.nombre} reiniciados a $0 en ${formatPeriodLabel(activePeriod)}.`);
    setEditModalRow(null);
  };

  const handleDeletePeriodBilling = () => {
    if (!editModalRow?.payment) return;
    onDeletePayment(editModalRow.payment.id);
    setConfirmEditAction('none');
    notify(
      `Registro de facturación de ${editModalRow.company.nombre} eliminado para ${formatPeriodLabel(activePeriod)}.`
    );
    setEditModalRow(null);
  };

  // Annul an entire issued batch (unmarks facturada, clears loteId, puts companies back in queue)
  const handleAnnulBatch = (loteId: string, returnToQueue = true) => {
    const affectedPayments = payments.filter((p) => p.loteId === loteId);
    for (const p of affectedPayments) {
      const resetAmount = p.montoCobrado === 0 && p.retenciones === 0 ? 0 : p.montoFacturado;
      const nextStatus = computeEffectiveStatus(
        resetAmount,
        p.montoCobrado,
        p.retenciones,
        p.fechaVencimiento
      );
      onSavePayment({
        ...p,
        montoFacturado: resetAmount,
        fechaFacturacion: resetAmount > 0 ? p.fechaFacturacion || '' : '',
        loteId: '',
        facturada: false,
        marcadoFacturar: returnToQueue,
        estado: nextStatus,
        observaciones: p.observaciones
          ? `${p.observaciones.replace(new RegExp(`\\s*\\|?\\s*Facturado en( lote)? ${loteId}`, 'g'), '').trim()}`
          : '',
      });

      const comp = companies.find((c) => c.id === p.empresaId);
      if (comp?.proximaFechaFacturar) {
        onUpdateCompany({
          ...comp,
          proximaFechaFacturar: advanceDateByMonths(comp.proximaFechaFacturar, -1),
        });
      }
    }

    // Remove associated batch event(s) from history
    const batchEvents = cobranzaEvents.filter(
      (ev) => ev.tipo === 'Lote facturado' && ev.loteId === loteId
    );
    batchEvents.forEach((ev) => onDeleteCobranzaEvent(ev.id));

    if (lastBatch?.loteId === loteId) {
      setLastBatch(null);
    }
    setConfirmAnnulBatchId(null);
    notify(
      `Lote ${loteId} anulado (${affectedPayments.length} empresa${affectedPayments.length === 1 ? '' : 's'}). ${returnToQueue ? 'Volvieron a la cola de Lote Facturar para corregir.' : ''}`
    );
  };

  // Open Edit Event Modal
  const openEditEventModal = (ev: CobranzaEvent) => {
    setEditEventModal(ev);
    setEvEditFecha(ev.fecha || new Date().toISOString().slice(0, 10));
    setEvEditMonto(ev.monto ?? 0);
    setEvEditRetenciones(ev.retenciones ?? 0);
    setEvEditDetalle(ev.detalle || '');
    setEvSyncLedger(ev.tipo === 'Pago');
  };

  const handleSaveEditedEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEventModal) return;

    const newMonto = Math.max(0, Number(evEditMonto) || 0);
    const newRet = Math.max(0, Number(evEditRetenciones) || 0);

    // Sync payment totals if editing a Pago event
    if (editEventModal.tipo === 'Pago' && evSyncLedger && editEventModal.empresaId) {
      const targetPeriod = editEventModal.periodo || activePeriod;
      const payment = payments.find(
        (p) => p.empresaId === editEventModal.empresaId && p.periodo === targetPeriod
      );
      if (payment) {
        const diffMonto = newMonto - (editEventModal.monto ?? 0);
        const diffRet = newRet - (editEventModal.retenciones ?? 0);
        const nextCobrado = Math.max(0, payment.montoCobrado + diffMonto);
        const nextRetenciones = Math.max(0, payment.retenciones + diffRet);
        const nextEstado = computeEffectiveStatus(
          payment.montoFacturado,
          nextCobrado,
          nextRetenciones,
          payment.fechaVencimiento
        );
        onSavePayment({
          ...payment,
          montoCobrado: nextCobrado,
          retenciones: nextRetenciones,
          fechaPago: nextCobrado > 0 || nextRetenciones > 0 ? evEditFecha : '',
          estado: nextEstado,
        });
      }
    }

    // Sync company price if editing a Cambio de tarifa event
    if (editEventModal.tipo === 'Cambio de tarifa' && evSyncLedger && editEventModal.empresaId && newMonto > 0) {
      const comp = companies.find((c) => c.id === editEventModal.empresaId);
      if (comp) {
        onUpdateCompany({ ...comp, precioIndividual: newMonto });
      }
    }

    onUpdateCobranzaEvent({
      ...editEventModal,
      fecha: evEditFecha || editEventModal.fecha,
      monto: newMonto,
      retenciones: editEventModal.tipo === 'Pago' ? newRet : editEventModal.retenciones,
      detalle: evEditDetalle.trim() || editEventModal.detalle,
    });

    notify(`Movimiento corregido en ${editEventModal.empresaNombre}.`);
    setEditEventModal(null);
  };

  // Open Delete / Revert Event Modal
  const openDeleteEventModal = (ev: CobranzaEvent) => {
    setDeleteEventModal(ev);
    setEvRevertAction(true);
    if (ev.tipo === 'Cambio de tarifa') {
      const detected = extractPreviousPriceFromDetail(ev.detalle);
      const comp = companies.find((c) => c.id === ev.empresaId);
      setEvRestorePrice(detected ?? comp?.precioIndividual ?? 0);
    } else {
      setEvRestorePrice(0);
    }
  };

  const handleConfirmDeleteEvent = () => {
    if (!deleteEventModal) return;
    const ev = deleteEventModal;

    if (ev.tipo === 'Pago' && evRevertAction && ev.empresaId) {
      const targetPeriod = ev.periodo || activePeriod;
      const payment = payments.find(
        (p) => p.empresaId === ev.empresaId && p.periodo === targetPeriod
      );
      if (payment) {
        const nextCobrado = Math.max(0, payment.montoCobrado - (ev.monto ?? 0));
        const nextRetenciones = Math.max(0, payment.retenciones - (ev.retenciones ?? 0));
        const nextEstado = computeEffectiveStatus(
          payment.montoFacturado,
          nextCobrado,
          nextRetenciones,
          payment.fechaVencimiento
        );
        onSavePayment({
          ...payment,
          montoCobrado: nextCobrado,
          retenciones: nextRetenciones,
          fechaPago: nextCobrado > 0 || nextRetenciones > 0 ? payment.fechaPago : '',
          estado: nextEstado,
        });
      }
    } else if (ev.tipo === 'Cambio de tarifa' && evRevertAction && ev.empresaId) {
      const comp = companies.find((c) => c.id === ev.empresaId);
      const restored = Math.max(0, Number(evRestorePrice) || 0);
      if (comp && restored > 0) {
        onUpdateCompany({ ...comp, precioIndividual: restored });
      }
    } else if (ev.tipo === 'Lote facturado' && evRevertAction && ev.loteId) {
      handleAnnulBatch(ev.loteId, true);
      setDeleteEventModal(null);
      return;
    }

    onDeleteCobranzaEvent(ev.id);
    notify(
      evRevertAction && ev.tipo !== 'Compromiso'
        ? `${ev.tipo} revertido y eliminado para ${ev.empresaNombre}.`
        : `Movimiento eliminado del historial (${ev.empresaNombre}).`
    );
    setDeleteEventModal(null);
  };

  // Execute Batch Billing ("Facturar")
  const handleExecuteBatchBilling = () => {
    if (markedRows.length === 0) return;

    const billableRows = markedRows.filter((r) => !r.isFacturada);
    if (billableRows.length === 0) {
      const firstAlready = markedRows[0];
      if (firstAlready) {
        setProcessAlertModal({
          kind: 'already_billed_or_paid',
          row: firstAlready,
          source: 'facturar',
        });
      }
      return;
    }

    // Generate sequential Batch ID: LOTE-YYYY-MM-01
    const prefix = `LOTE-${activePeriod}-`;
    const existingSeqs = new Set<number>();
    for (const p of payments) {
      if (p.loteId?.startsWith(prefix)) {
        const n = Number(p.loteId.slice(prefix.length));
        if (Number.isFinite(n)) existingSeqs.add(n);
      }
    }
    for (const ev of cobranzaEvents) {
      if (ev.loteId?.startsWith(prefix)) {
        const n = Number(ev.loteId.slice(prefix.length));
        if (Number.isFinite(n)) existingSeqs.add(n);
      }
    }
    let nextSeq = 1;
    while (existingSeqs.has(nextSeq)) nextSeq += 1;
    const loteId = `${prefix}${String(nextSeq).padStart(2, '0')}`;

    const exportRows: BatchExportRow[] = [];
    const todayIso = new Date().toISOString().slice(0, 10);

    for (const row of billableRows) {
      const subtotal = calcMonthlyAmount(row.company.empleados, row.company.precioIndividual);
      const fechaPrevista = row.fechaPrevista || `${activePeriod}-20`;

      // Update payment record: mark as facturada, set montoFacturado, fechaFacturacion & loteId, clear marcadoFacturar
      const updatedPayment = ensurePaymentRecord(row, {
        montoFacturado: subtotal,
        fechaFacturacion: todayIso,
        fechaVencimiento: fechaPrevista,
        marcadoFacturar: false,
        facturada: true,
        loteId,
        observaciones: row.payment?.observaciones
          ? `${row.payment.observaciones} | Facturado en ${loteId}`
          : `Facturado en lote ${loteId}`,
      });
      onSavePayment(updatedPayment);

      // Advance company's proximaFechaFacturar to the next monthly cycle
      const nextBillingDate = advanceDateByMonths(
        row.company.proximaFechaFacturar || `${activePeriod}-05`,
        1
      );
      onUpdateCompany({
        ...row.company,
        proximaFechaFacturar: nextBillingDate,
      });

      exportRows.push({
        ID_Lote: loteId,
        Período: formatPeriodLabel(activePeriod),
        Empresa: row.company.nombre,
        CUIT: row.company.cuit || 'Sin CUIT',
        Empleados: row.company.empleados,
        Precio_Unitario_Empleado: row.company.precioIndividual,
        Subtotal_Facturar: subtotal,
        Fecha_Prevista: fechaPrevista,
      });
    }

    const totalEmployees = exportRows.reduce((s, r) => s + r.Empleados, 0);
    const totalAmount = exportRows.reduce((s, r) => s + r.Subtotal_Facturar, 0);

    // Log batch event in Agenda / Historial
    onAddCobranzaEvent({
      id: sanitizeFirestoreId('cev'),
      empresaId: billableRows.length === 1 ? billableRows[0].company.id : '',
      empresaNombre:
        billableRows.length === 1
          ? billableRows[0].company.nombre
          : `Lote ${exportRows.length} empresas`,
      periodo: activePeriod,
      fecha: todayIso,
      tipo: 'Lote facturado',
      monto: totalAmount,
      loteId,
      detalle: `${loteId} emitido para ${formatPeriodLabel(activePeriod)}: ${exportRows.length} empresa${exportRows.length === 1 ? '' : 's'}, ${formatNumber(totalEmployees)} empleados, total ${formatARS(totalAmount)}. Próxima fecha de facturación avanzada al ciclo siguiente.`,
    });

    setLastBatch({ loteId, rows: exportRows, totalAmount, totalEmployees });
    downloadBatchCsv(exportRows, loteId);
    notify(
      `${loteId} facturado (${exportRows.length} empresas · ${formatARS(totalAmount)}). Planilla CSV descargada.`
    );
  };

  // Add commitment in Agenda
  const handleAddCommitment = (e: React.FormEvent) => {
    e.preventDefault();
    const targetCompany = activeCompanies.find((c) => c.id === compEmpresaId) || activeCompanies[0];
    if (!targetCompany || !compDetalle.trim()) return;
    onAddCobranzaEvent({
      id: sanitizeFirestoreId('cev'),
      empresaId: targetCompany.id,
      empresaNombre: targetCompany.nombre,
      periodo: activePeriod,
      fecha: compFecha || new Date().toISOString().slice(0, 10),
      tipo: 'Compromiso',
      monto: Math.max(0, Number(compMonto) || 0),
      detalle: compDetalle.trim(),
    });
    setCompDetalle('');
    setCompMonto('');
    notify(`Compromiso agendado para ${targetCompany.nombre}.`);
  };

  // JSON Backup Export / Import inside Cobranzas
  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(fullState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BonusTicket_Cobranzas_Respaldo_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Respaldo JSON exportado correctamente.');
  };

  const handleImportJson = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<BonusTicketState>;
      if (!Array.isArray(parsed.companies)) {
        notify('El archivo seleccionado no corresponde a un respaldo JSON válido de Bonus Ticket.');
        return;
      }
      onRestoreState({
        companies: parsed.companies,
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : fullState.tasks,
        planTasks: Array.isArray(parsed.planTasks)
          ? parsed.planTasks.map((t) => normalizePlanTask(t))
          : fullState.planTasks,
        payments: Array.isArray(parsed.payments) ? parsed.payments : fullState.payments,
        metaReports: Array.isArray(parsed.metaReports) ? parsed.metaReports : fullState.metaReports,
        marketingLogs: Array.isArray(parsed.marketingLogs)
          ? parsed.marketingLogs
          : fullState.marketingLogs,
        fidelizaciones: Array.isArray(parsed.fidelizaciones)
          ? parsed.fidelizaciones
          : fullState.fidelizaciones,
        companyActivities: Array.isArray(parsed.companyActivities)
          ? parsed.companyActivities
          : fullState.companyActivities,
        cobranzaEvents: Array.isArray(parsed.cobranzaEvents)
          ? parsed.cobranzaEvents
          : [],
        cobranzaResets: Array.isArray(parsed.cobranzaResets)
          ? parsed.cobranzaResets
          : fullState.cobranzaResets || [],
      });
      notify(`Respaldo restaurado: ${parsed.companies.length} empresas cargadas.`);
    } catch {
      notify('No se pudo leer el archivo JSON de respaldo.');
    }
  };

  // --- PERIOD RESET & RESET HISTORY HANDLERS ---
  const handleConfirmPeriodReset = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date();
    const fechaIso = now.toISOString().slice(0, 10);
    const horaStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const items: CobranzaResetItem[] = rows.map((row) => ({
      paymentId: row.payment?.id || '',
      empresaId: row.company.id,
      empresaNombre: row.company.nombre,
      cuit: row.company.cuit || '',
      empleados: row.company.empleados,
      precioIndividual: row.company.precioIndividual,
      montoFacturado: row.facturado,
      montoCobrado: row.cobrado,
      retenciones: row.retenciones,
      saldoPendiente: row.saldo,
      estado: row.estado,
      fechaPago: row.payment?.fechaPago || '',
      fechaFacturacion: row.fechaFacturacion || '',
      fechaVencimiento: row.fechaPrevista,
      numeroFactura: row.payment?.numeroFactura || '',
      medioPago: row.payment?.medioPago || 'Transferencia Bancaria',
      observaciones: row.payment?.observaciones || '',
      marcadoFacturar: row.marcadoFacturar,
      facturada: row.facturada,
      loteId: row.loteId || '',
    }));

    const snapshot: CobranzaResetRecord = {
      id: sanitizeFirestoreId('rst'),
      periodo: activePeriod,
      fecha: fechaIso,
      hora: horaStr,
      motivo: resetMotivo.trim(),
      totalClientes: kpis.clientes,
      totalFacturado: kpis.totalFacturado,
      totalCobrado: kpis.totalCobrado,
      totalRetenciones: kpis.totalRetenciones,
      totalSaldoPendiente: kpis.totalPendiente,
      pagadas: kpis.pagadas,
      parciales: kpis.parciales,
      vencidas: kpis.vencidas,
      items,
    };

    // 1. Archive complete snapshot into Reset History
    onAddCobranzaReset(snapshot);

    // 2. Reset all active companies' billing/collection numbers for activePeriod to $0
    for (const row of rows) {
      const resetPayment: PaymentRecord = {
        id: row.payment?.id || sanitizeFirestoreId('pay'),
        empresaId: row.company.id,
        periodo: activePeriod,
        montoFacturado: 0,
        montoCobrado: 0,
        retenciones: 0,
        estado: 'Pendiente',
        fechaPago: '',
        fechaFacturacion: '',
        fechaVencimiento: row.fechaPrevista || `${activePeriod}-20`,
        numeroFactura: '',
        medioPago: row.payment?.medioPago || 'Transferencia Bancaria',
        observaciones: '',
        marcadoFacturar: false,
        facturada: false,
        loteId: '',
      };
      onSavePayment(resetPayment);
    }

    setLastBatch(null);
    setResetMotivo('');
    setResetModalOpen(false);
    notify(
      `Período ${formatPeriodLabel(activePeriod)} reseteado a $0. Todo lo anterior quedó guardado en el Historial de reseteos.`
    );
  };

  const handleRestoreResetSnapshot = (rec: CobranzaResetRecord) => {
    for (const item of rec.items) {
      const existing = payments.find(
        (p) =>
          (item.paymentId && p.id === item.paymentId) ||
          (p.empresaId === item.empresaId && p.periodo === rec.periodo)
      );
      const restored: PaymentRecord = {
        id: existing?.id || item.paymentId || sanitizeFirestoreId('pay'),
        empresaId: item.empresaId,
        periodo: rec.periodo,
        montoFacturado: item.montoFacturado,
        montoCobrado: item.montoCobrado,
        retenciones: item.retenciones,
        estado: item.estado,
        fechaPago: item.fechaPago,
        fechaFacturacion: item.fechaFacturacion || (item.facturada ? `${rec.periodo}-05` : ''),
        fechaVencimiento: item.fechaVencimiento || `${rec.periodo}-20`,
        numeroFactura: item.numeroFactura,
        medioPago: item.medioPago || 'Transferencia Bancaria',
        observaciones: item.observaciones,
        marcadoFacturar: item.marcadoFacturar,
        facturada: item.facturada,
        loteId: item.loteId,
      };
      onSavePayment(restored);
    }

    if (activePeriod !== rec.periodo) {
      onChangePeriod(rec.periodo);
    }
    setConfirmRestoreResetId(null);
    setResetHistoryModalOpen(false);
    notify(
      `Se restauraron los importes de ${formatPeriodLabel(rec.periodo)} desde el reseteo del ${formatDateAR(rec.fecha)}.`
    );
  };

  const handleExportResetSnapshotExcel = (rec: CobranzaResetRecord) => {
    const data = rec.items.map((item) => ({
      Período: formatPeriodLabel(rec.periodo),
      Fecha_Reseteo: `${formatDateAR(rec.fecha)} ${rec.hora || ''}`.trim(),
      Motivo: rec.motivo || '',
      Empresa: item.empresaNombre,
      CUIT: item.cuit || '',
      Empleados: item.empleados,
      Precio_Unitario: item.precioIndividual,
      Facturado: item.montoFacturado,
      Cobrado_Efectivo: item.montoCobrado,
      Retenciones: item.retenciones,
      Saldo_Pendiente: item.saldoPendiente,
      Estado: item.estado === 'Al día' ? 'Pagada' : item.estado,
      Fecha_Pago: item.fechaPago || '',
      Fecha_Prevista: item.fechaVencimiento || '',
      Factura: item.numeroFactura || '',
      Lote: item.loteId || '',
      Observaciones: item.observaciones || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reseteo_Archivado');
    XLSX.writeFile(wb, `BonusTicket_Reseteo_${rec.periodo}_${rec.fecha}.xlsx`);
    notify(`Planilla Excel del reseteo de ${formatPeriodLabel(rec.periodo)} descargada.`);
  };

  const handleExportMonthlyExcel = () => {
    const data = rows.map((r) => ({
      Período: formatPeriodLabel(activePeriod),
      Empresa: r.company.nombre,
      CUIT: r.company.cuit || '',
      Control: r.company.facturacionControlada ? 'Controlada' : 'Sin controlar',
      Empleados: r.company.empleados,
      Precio_Unitario: r.company.precioIndividual,
      Subtotal_Estimado: r.subtotalEstimado,
      Facturado: r.facturado,
      Cobrado: r.cobrado,
      Retenciones: r.retenciones,
      Saldo_Neto: r.saldo,
      Estado: r.estado === 'Al día' ? 'Pagada' : r.estado,
      Dias_Atraso: r.diasAtraso,
      Fecha_Prevista: r.fechaPrevista,
      Proxima_Facturacion: r.company.proximaFechaFacturar || '',
      Lote: r.loteId || '',
      Factura: r.payment?.numeroFactura || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cobranzas');
    XLSX.writeFile(wb, `BonusTicket_Cobranzas_${activePeriod}.xlsx`);
    notify(`Planilla Excel de ${formatPeriodLabel(activePeriod)} descargada.`);
  };

  const toggleCardExpanded = (id: string) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const navTabs: Array<{
    id: CobranzaSubView;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'inicio', label: 'Inicio / Cobranzas', shortLabel: 'Cobranzas', icon: Receipt },
    {
      id: 'lote',
      label: 'Lote Facturar',
      shortLabel: 'Lote',
      icon: Layers,
      badge: kpis.marcadas,
    },
    {
      id: 'ajustes',
      label: 'Ajuste Precios',
      shortLabel: 'Precios',
      icon: TrendingUp,
      badge: kpis.porActualizar,
    },
    { id: 'agenda', label: 'Agenda / Historial', shortLabel: 'Agenda', icon: CalendarClock },
  ];

  return (
    <div className="space-y-5 pb-24 lg:pb-8">
      {/* Compact Header with Period Selector & Quick Batch Trigger */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-neutral-500">
            Módulo Cobranzas · Nahuel · Gestión móvil y facturación en lote
          </p>
          <h1 className="text-xl sm:text-2xl font-bold text-[#101014] tracking-tight mt-0.5">
            {navTabs.find((t) => t.id === subView)?.label}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Seleccionar período de cobranza"
            value={activePeriod}
            onChange={(e) => onChangePeriod(e.target.value)}
            className="min-h-[44px] px-3.5 py-2 bg-white border border-neutral-300 rounded-lg text-base sm:text-sm font-semibold text-[#101014] focus:outline-none focus:border-[#101014]"
          >
            {periodOptions.map((p) => (
              <option key={p} value={p}>
                {formatPeriodLabel(p)}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setResetHistoryPage(1);
              setResetHistoryModalOpen(true);
            }}
            className="min-h-[44px] px-3.5 py-2 bg-white border border-neutral-300 hover:border-[#101014] text-[#101014] text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <Archive className="w-4 h-4 shrink-0" />
            <span>Historial reseteos</span>
            {cobranzaResets.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-mono font-bold bg-[#101014] text-white rounded">
                {cobranzaResets.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setResetMotivo('');
              setResetModalOpen(true);
            }}
            className="min-h-[44px] px-3.5 py-2 bg-white border border-red-200 hover:bg-red-50 hover:border-[#DC2626] text-[#DC2626] text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>Resetear</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('lote')}
            className="min-h-[44px] px-4 py-2 bg-[#E52421] hover:bg-[#C91D1A] text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>Facturar</span>
            {kpis.marcadas > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-mono font-bold bg-white/20 rounded">
                {kpis.marcadas}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Desktop Sub-View Tabs (Mobile uses Fixed Bottom Bar) */}
      <div className="hidden lg:flex items-center gap-1 p-1 bg-white border border-neutral-200 rounded-xl w-fit">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const active = subView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubView(tab.id)}
              className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                active
                  ? 'bg-[#101014] text-white'
                  : 'text-neutral-600 hover:text-[#101014] hover:bg-neutral-100'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
              {typeof tab.badge === 'number' && tab.badge > 0 && (
                <span
                  className={`px-1.5 py-0.5 text-[11px] font-mono font-bold rounded ${
                    active ? 'bg-[#E52421] text-white' : 'bg-neutral-200 text-[#101014]'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Automatic Start-of-Month Reset Banner */}
      {autoResetNotice && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 bg-amber-50 border border-amber-300 text-amber-950 rounded-xl text-sm">
          <div className="flex items-start gap-2.5 min-w-0">
            <Archive className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
            <span className="leading-snug font-medium">{autoResetNotice}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setResetHistoryPage(1);
                setResetHistoryModalOpen(true);
              }}
              className="min-h-[38px] px-3 py-1.5 bg-[#101014] text-white text-xs font-bold rounded-lg whitespace-nowrap"
            >
              Ver historial reseteos
            </button>
            {onDismissAutoResetNotice && (
              <button
                type="button"
                onClick={onDismissAutoResetNotice}
                aria-label="Cerrar aviso de reseteo automático"
                className="p-1.5 text-amber-700 hover:text-amber-950 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#101014] text-white rounded-xl text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
            <span className="leading-snug">{feedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback('')}
            aria-label="Cerrar notificación"
            className="p-1.5 text-neutral-400 hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB-VIEW 1: INICIO / COBRANZAS                                    */}
      {/* ================================================================= */}
      {subView === 'inicio' && (
        <div className="space-y-5">
          {/* 9 Compact KPIs (2-column mobile grid, responsive desktop) */}
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
            <div className="bg-white border border-neutral-200 rounded-xl p-3.5">
              <div className="text-[11px] font-medium text-neutral-500">Clientes activos</div>
              <div className="text-xl font-bold font-mono tabular-nums text-[#101014] mt-1">
                {kpis.clientes}
              </div>
              <div className="text-[11px] text-neutral-400 mt-0.5">
                {kpis.marcadas} marcada{kpis.marcadas === 1 ? '' : 's'} p/ lote
              </div>
            </div>

            <div className="bg-white border border-neutral-200 rounded-xl p-3.5">
              <div className="text-[11px] font-medium text-neutral-500">Facturado</div>
              <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-[#101014] mt-1 truncate">
                {formatARS(kpis.totalFacturado)}
              </div>
              <div className="text-[11px] text-neutral-400 mt-0.5">
                {formatPeriodLabel(activePeriod)}
              </div>
            </div>

            <div className="bg-white border border-neutral-200 rounded-xl p-3.5">
              <div className="text-[11px] font-medium text-neutral-500">Cobrado efectivo</div>
              <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-[#16A34A] mt-1 truncate">
                {formatARS(kpis.totalCobrado)}
              </div>
              <div className="text-[11px] text-neutral-400 mt-0.5">
                {kpis.totalFacturado > 0
                  ? `${Math.round(((kpis.totalCobrado + kpis.totalRetenciones) / kpis.totalFacturado) * 100)}% recuperado`
                  : '0%'}
              </div>
            </div>

            <div className="bg-white border border-neutral-200 rounded-xl p-3.5">
              <div className="text-[11px] font-medium text-neutral-500">Retenciones</div>
              <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-[#101014] mt-1 truncate">
                {formatARS(kpis.totalRetenciones)}
              </div>
              <div className="text-[11px] text-neutral-400 mt-0.5">IIBB / Certificados</div>
            </div>

            <div className="bg-white border border-neutral-200 rounded-xl p-3.5 col-span-2 sm:col-span-1">
              <div className="text-[11px] font-medium text-neutral-500">Saldo pendiente</div>
              <div
                className={`text-lg sm:text-xl font-bold font-mono tabular-nums mt-1 truncate ${
                  kpis.totalPendiente > 0 ? 'text-[#E52421]' : 'text-[#16A34A]'
                }`}
              >
                {formatARS(kpis.totalPendiente)}
              </div>
              <div className="text-[11px] text-neutral-400 mt-0.5">Neto a cobrar</div>
            </div>

            {/* 4 Operational Counters */}
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'Pagada' ? 'Todos' : 'Pagada')}
              className={`text-left rounded-xl p-3 border transition-colors min-h-[68px] ${
                statusFilter === 'Pagada'
                  ? 'bg-[#16A34A] text-white border-[#16A34A]'
                  : 'bg-white border-neutral-200 hover:border-[#16A34A]'
              }`}
            >
              <div className={`text-[11px] font-medium ${statusFilter === 'Pagada' ? 'text-white/80' : 'text-neutral-500'}`}>
                Pagadas
              </div>
              <div className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${statusFilter === 'Pagada' ? 'text-white' : 'text-[#16A34A]'}`}>
                {kpis.pagadas}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'Parcial' ? 'Todos' : 'Parcial')}
              className={`text-left rounded-xl p-3 border transition-colors min-h-[68px] ${
                statusFilter === 'Parcial'
                  ? 'bg-[#D97706] text-white border-[#D97706]'
                  : 'bg-white border-neutral-200 hover:border-[#D97706]'
              }`}
            >
              <div className={`text-[11px] font-medium ${statusFilter === 'Parcial' ? 'text-white/80' : 'text-neutral-500'}`}>
                Parciales
              </div>
              <div className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${statusFilter === 'Parcial' ? 'text-white' : 'text-[#D97706]'}`}>
                {kpis.parciales}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'Vencida' ? 'Todos' : 'Vencida')}
              className={`text-left rounded-xl p-3 border transition-colors min-h-[68px] ${
                statusFilter === 'Vencida'
                  ? 'bg-[#DC2626] text-white border-[#DC2626]'
                  : 'bg-white border-neutral-200 hover:border-[#DC2626]'
              }`}
            >
              <div className={`text-[11px] font-medium ${statusFilter === 'Vencida' ? 'text-white/80' : 'text-neutral-500'}`}>
                Vencidas
              </div>
              <div className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${statusFilter === 'Vencida' ? 'text-white' : 'text-[#DC2626]'}`}>
                {kpis.vencidas}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSubView('ajustes')}
              className="text-left bg-white border border-neutral-200 hover:border-[#101014] rounded-xl p-3 transition-colors min-h-[68px] col-span-2 sm:col-span-3 lg:col-span-2 flex items-center justify-between gap-2"
            >
              <div>
                <div className="text-[11px] font-medium text-neutral-500">Por actualizar tarifa</div>
                <div className="text-xl font-bold font-mono tabular-nums text-[#D97706] mt-0.5">
                  {kpis.porActualizar}
                </div>
              </div>
              <span className="text-xs font-semibold text-[#101014] flex items-center gap-1">
                <span>Ajustes</span>
                <ArrowUpRight className="w-4 h-4" />
              </span>
            </button>
          </section>

          {/* Monthly Billing Progress Bar (informative, per-company billing) */}
          {rows.length > 0 &&
            (unbilledRows.length > 0 ? (
              <section className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <AlertTriangle className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-amber-950">
                      Facturación de {formatPeriodLabel(activePeriod)}: {kpis.facturadas} de{' '}
                      {kpis.clientes} empresas facturadas
                    </div>
                    <p className="text-xs text-amber-900 mt-0.5 leading-snug">
                      Cada empresa habilita su carga de pagos apenas se factura ({unbilledRows.length}{' '}
                      sin facturar este mes).
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSubView('lote')}
                    className="min-h-[42px] px-3.5 py-2 bg-[#E52421] hover:bg-[#C91D1A] text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Ir a Lote Facturar</span>
                  </button>
                </div>
              </section>
            ) : (
              <section className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-emerald-900">
                  <FileCheck2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                  <span>
                    Todas las empresas de {formatPeriodLabel(activePeriod)} están facturadas (
                    {kpis.facturadas}/{kpis.clientes}).
                  </span>
                </div>
              </section>
            ))}

          {/* Agile Search, Status Filter & Sort Bar */}
          <section className="bg-white border border-neutral-200 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por empresa, CUIT o contacto..."
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 bg-[#F8F6F4] border border-neutral-200 rounded-lg text-base sm:text-sm text-[#101014] focus:outline-none focus:bg-white focus:border-[#101014]"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowFiltersMobile((v) => !v)}
                className="lg:hidden min-h-[44px] px-3 bg-[#F8F6F4] border border-neutral-200 rounded-lg text-xs font-semibold text-[#101014] flex items-center gap-1.5 shrink-0"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>Orden</span>
              </button>

              <div className="hidden lg:flex items-center gap-2 shrink-0">
                <label htmlFor="sort-desktop" className="text-xs font-medium text-neutral-500">
                  Ordenar:
                </label>
                <select
                  id="sort-desktop"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="min-h-[44px] px-3 py-2 bg-[#F8F6F4] border border-neutral-200 rounded-lg text-sm font-semibold text-[#101014]"
                >
                  <option value="prioridad">Prioridad de cobranza</option>
                  <option value="atraso">Días de atraso</option>
                  <option value="proxima_factura">Próxima fecha a facturar</option>
                  <option value="mayor_saldo">Mayor saldo</option>
                </select>
              </div>
            </div>

            {showFiltersMobile && (
              <div className="lg:hidden pt-1">
                <label htmlFor="sort-mobile" className="block text-xs font-medium text-neutral-500 mb-1">
                  Ordenar tarjetas por
                </label>
                <select
                  id="sort-mobile"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="w-full min-h-[44px] px-3 py-2 bg-[#F8F6F4] border border-neutral-200 rounded-lg text-base font-semibold text-[#101014]"
                >
                  <option value="prioridad">Prioridad de cobranza</option>
                  <option value="atraso">Días de atraso</option>
                  <option value="proxima_factura">Próxima fecha a facturar</option>
                  <option value="mayor_saldo">Mayor saldo</option>
                </select>
              </div>
            )}

            {/* Status Filter Buttons (horizontal scroll on mobile, clean wrap on desktop) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
              {(
                ['Todos', 'Pendiente', 'Parcial', 'Pagada', 'Vencida', 'Marcada'] as StatusFilter[]
              ).map((st) => {
                const active = statusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors border ${
                      active
                        ? 'bg-[#101014] text-white border-[#101014]'
                        : 'bg-[#F8F6F4] text-neutral-700 border-neutral-200 hover:border-neutral-400'
                    }`}
                  >
                    {st}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Vertical Company Cards */}
          <section className="space-y-3.5">
            {filteredRows.length === 0 ? (
              <div className="bg-white border border-neutral-200 rounded-xl p-8 text-center">
                <p className="text-sm font-semibold text-[#101014]">
                  No hay empresas que coincidan con los filtros seleccionados.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('Todos');
                  }}
                  className="mt-3 min-h-[44px] px-4 py-2 bg-[#101014] text-white text-xs font-semibold rounded-lg"
                >
                  Limpiar filtros
                </button>
              </div>
            ) : (
              filteredRows.map((row) => {
                const { company } = row;
                const proj = calcIncreaseProjection(
                  company.empleados,
                  company.precioIndividual,
                  company.formulaAumento,
                  company.valorAumento
                );
                const isExpanded = Boolean(expandedCards[company.id]);
                const borderAccent =
                  row.estado === 'Vencida'
                    ? 'border-l-[#DC2626]'
                    : row.estado === 'Al día'
                      ? 'border-l-[#16A34A]'
                      : row.estado === 'Parcial' || row.alertaAjuste
                        ? 'border-l-[#D97706]'
                        : 'border-l-neutral-300';

                const statusTextColor =
                  row.estado === 'Vencida'
                    ? 'text-[#DC2626]'
                    : row.estado === 'Al día'
                      ? 'text-[#16A34A]'
                      : row.estado === 'Parcial'
                        ? 'text-[#D97706]'
                        : 'text-neutral-700';

                const phone = company.telefonoCobro || company.telefonoPrincipal;
                const waUrl = buildWhatsAppUrl(phone, buildSmartWhatsAppMessage(row, activePeriod));

                return (
                  <article
                    key={company.id}
                    className={`bg-white border border-neutral-200 border-l-4 ${borderAccent} rounded-xl overflow-hidden shadow-2xs`}
                  >
                    {/* SECTION A: Datos operativos y saldo */}
                    <div className="p-4 sm:p-5 space-y-3.5">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <h2 className="text-base sm:text-lg font-bold text-[#101014] leading-snug">
                              {company.nombre}
                            </h2>
                            <span className={`text-xs font-bold uppercase tracking-wide ${statusTextColor}`}>
                              · {row.estado === 'Al día' ? 'Pagada' : row.estado}
                            </span>
                            {row.diasAtraso > 0 && (
                              <span className="text-xs font-mono font-bold text-[#DC2626]">
                                ({row.diasAtraso}d atraso)
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 mt-1">
                            <span className="font-mono">
                              CUIT: <strong className="text-neutral-700">{company.cuit || 'Sin cargar'}</strong>
                            </span>
                            <span>·</span>
                            <span>
                              {company.contactoCobranza || company.contactoPrincipal || 'Sin contacto'}
                              {phone ? ` (${phone})` : ''}
                            </span>
                            {row.loteId && (
                              <>
                                <span>·</span>
                                <span className="font-mono text-[#101014] font-semibold">
                                  {row.loteId}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Facturación controlada toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleControlada(company)}
                          className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 self-start shrink-0 transition-colors ${
                            company.facturacionControlada
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-amber-50 border-amber-200 text-amber-800'
                          }`}
                        >
                          {company.facturacionControlada ? (
                            <>
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Facturación controlada</span>
                            </>
                          ) : (
                            <>
                              <ShieldOff className="w-3.5 h-3.5" />
                              <span>Sin controlar</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Financial Ledger Strip */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#F8F6F4] border border-neutral-200/80 rounded-lg p-3">
                        <div>
                          <div className="text-[11px] text-neutral-500">Facturado</div>
                          <div className="text-sm font-bold font-mono tabular-nums text-[#101014] mt-0.5">
                            {formatARS(row.facturado)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-neutral-500">Cobrado</div>
                          <div className="text-sm font-bold font-mono tabular-nums text-[#16A34A] mt-0.5">
                            {formatARS(row.cobrado)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-neutral-500">Retenciones</div>
                          <div className="text-sm font-bold font-mono tabular-nums text-neutral-700 mt-0.5">
                            {formatARS(row.retenciones)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-neutral-500">Saldo neto</div>
                          <div
                            className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${
                              row.saldo > 0 ? 'text-[#E52421]' : 'text-[#16A34A]'
                            }`}
                          >
                            {formatARS(row.saldo)}
                          </div>
                        </div>
                      </div>

                      {/* Billing / Payment Process Status Notice Cartel */}
                      {row.isPagada ? (
                        <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 text-emerald-900 font-semibold">
                            <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                            <span>
                              <strong>Ya pagado</strong>
                              {row.fechaPago ? ` · Fecha de pago: ${formatDateAR(row.fechaPago)}` : ''}
                            </span>
                          </div>
                          {row.fechaFacturacion && (
                            <span className="text-[11px] font-mono text-emerald-800">
                              Facturado: {formatDateAR(row.fechaFacturacion)}
                            </span>
                          )}
                        </div>
                      ) : row.isFacturada ? (
                        <div className="px-3 py-2 bg-sky-50 border border-sky-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 text-sky-950 font-semibold">
                            <FileCheck2 className="w-4 h-4 text-sky-700 shrink-0" />
                            <span>
                              <strong>Ya facturado</strong>
                              {row.fechaFacturacion
                                ? ` · Fecha: ${formatDateAR(row.fechaFacturacion)}`
                                : ''}
                            </span>
                          </div>
                          {row.cobrado > 0 && row.fechaPago && (
                            <span className="text-[11px] font-mono text-sky-800">
                              Último abono: {formatDateAR(row.fechaPago)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="px-3 py-2 bg-amber-50 border border-amber-300 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 text-amber-950 font-semibold">
                            <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0" />
                            <span>
                              Sin facturar en {formatPeriodLabel(activePeriod)} · Primero facturar mes corriente
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => openBillModal(row)}
                            className="min-h-[34px] px-3 py-1 bg-[#101014] hover:bg-neutral-800 text-white text-[11px] font-bold rounded-lg shrink-0"
                          >
                            Facturar mes
                          </button>
                        </div>
                      )}

                      {/* Operational Strip: Fecha prevista, Empleados & Última carga base */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-neutral-600">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-neutral-400" />
                            <span>
                              Prevista:{' '}
                              <strong className="font-mono text-[#101014]">
                                {formatDateAR(row.fechaPrevista)}
                              </strong>
                            </span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-neutral-400" />
                            <span>
                              <strong className="font-mono text-[#101014]">{company.empleados}</strong> emp.
                            </span>
                          </span>
                          <span
                            className={`flex items-center gap-1 font-medium ${
                              row.alertaBase === 'ok'
                                ? 'text-neutral-600'
                                : 'text-[#DC2626] font-semibold'
                            }`}
                          >
                            {row.alertaBase !== 'ok' && (
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>
                              {row.alertaBase === 'faltante'
                                ? 'Falta fecha de base de empleados'
                                : row.alertaBase === 'desactualizada'
                                  ? `Base desactualizada (${formatDateAR(company.fechaBaseEmpleados)} · ${row.diasSinBase}d)`
                                  : `Última carga: ${formatDateAR(company.fechaBaseEmpleados)}`}
                            </span>
                          </span>
                        </div>

                        {row.alertaAjuste && (
                          <span className="text-xs font-semibold text-[#D97706] flex items-center gap-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>
                              {row.diasAjuste !== null && row.diasAjuste < 0
                                ? `Ajuste vencido hace ${Math.abs(row.diasAjuste)}d`
                                : `Ajuste en ${row.diasAjuste}d`}
                            </span>
                          </span>
                        )}
                      </div>

                      {/* SECTION B: Precio Individual por Empleado (always crisp & live) */}
                      <div className="border-t border-neutral-100 pt-3.5">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                          <div>
                            <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                              Precio individual / empleado ($)
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={50}
                              value={company.precioIndividual}
                              onChange={(e) => handleInlineUnitPriceChange(company, e.target.value)}
                              className="w-full min-h-[44px] px-3 py-2 bg-[#F8F6F4] border border-neutral-300 rounded-lg font-mono font-bold text-base sm:text-sm text-[#101014] focus:bg-white focus:border-[#101014] focus:outline-none"
                            />
                          </div>

                          <div className="bg-[#F8F6F4] rounded-lg px-3 py-2 min-h-[44px] flex items-center justify-between sm:block">
                            <div className="text-[11px] text-neutral-500">Cálculo base</div>
                            <div className="text-xs sm:text-sm font-mono font-semibold text-[#101014]">
                              {formatNumber(company.empleados)} × {formatARS(company.precioIndividual)}
                            </div>
                          </div>

                          <div className="bg-[#101014] text-white rounded-lg px-3.5 py-2 min-h-[44px] flex items-center justify-between sm:block">
                            <div className="text-[11px] text-neutral-300">Subtotal estimado a facturar</div>
                            <div className="text-base font-bold font-mono tabular-nums text-white">
                              {formatARS(row.subtotalEstimado)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Collapsible Trigger for SECTION C: Próxima Fecha y Fórmula de Actualización */}
                      <div className="border-t border-neutral-100 pt-3">
                        <button
                          type="button"
                          onClick={() => toggleCardExpanded(company.id)}
                          className="w-full min-h-[44px] px-3 py-2 bg-[#F8F6F4] hover:bg-neutral-200/60 rounded-lg flex items-center justify-between gap-2 text-left transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-[#101014]">
                              Próxima facturación y fórmula de actualización
                            </div>
                            <div className="text-[11px] text-neutral-600 truncate mt-0.5">
                              Facturar: <strong className="font-mono">{formatDateAR(company.proximaFechaFacturar)}</strong> · Ajuste:{' '}
                              <strong className="font-mono">{formatDateAR(company.fechaProximoAumento)}</strong> · Proyectado:{' '}
                              <strong className="font-mono text-[#E52421]">{formatARS(proj.nuevoPrecioIndividual)}</strong>
                            </div>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-neutral-500 shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-neutral-500 shrink-0" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="mt-3 p-3.5 bg-[#F8F6F4] border border-neutral-200 rounded-xl space-y-3.5">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              <div>
                                <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                                  Próxima fecha a facturar
                                </label>
                                <input
                                  type="date"
                                  value={company.proximaFechaFacturar || ''}
                                  onChange={(e) =>
                                    handleInlineCompanyPatch(company, {
                                      proximaFechaFacturar: e.target.value,
                                    })
                                  }
                                  className="w-full min-h-[44px] px-3 py-2 bg-white border border-neutral-300 rounded-lg text-base sm:text-sm font-mono text-[#101014]"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                                  Fecha de próximo ajuste
                                </label>
                                <input
                                  type="date"
                                  value={company.fechaProximoAumento || ''}
                                  onChange={(e) =>
                                    handleInlineCompanyPatch(company, {
                                      fechaProximoAumento: e.target.value,
                                    })
                                  }
                                  className="w-full min-h-[44px] px-3 py-2 bg-white border border-neutral-300 rounded-lg text-base sm:text-sm font-mono text-[#101014]"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                                  Frecuencia de actualización
                                </label>
                                <select
                                  value={company.frecuenciaActualizacion || 'Trimestral'}
                                  onChange={(e) =>
                                    handleInlineCompanyPatch(company, {
                                      frecuenciaActualizacion: e.target.value as FrecuenciaActualizacion,
                                    })
                                  }
                                  className="w-full min-h-[44px] px-3 py-2 bg-white border border-neutral-300 rounded-lg text-base sm:text-sm font-semibold text-[#101014]"
                                >
                                  {FRECUENCIA_ACTUALIZACION_OPTIONS.map((f) => (
                                    <option key={f} value={f}>
                                      {f}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <div>
                                <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                                  Fórmula de actualización
                                </label>
                                <select
                                  value={company.formulaAumento}
                                  onChange={(e) =>
                                    handleInlineCompanyPatch(company, {
                                      formulaAumento: e.target.value as FormulaAumento,
                                    })
                                  }
                                  className="w-full min-h-[44px] px-3 py-2 bg-white border border-neutral-300 rounded-lg text-base sm:text-sm font-semibold text-[#101014]"
                                >
                                  <option value="porcentaje">Porcentaje (%)</option>
                                  <option value="ipc">Índice / IPC (%)</option>
                                  <option value="monto_fijo">Monto fijo (+$)</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                                  {company.formulaAumento === 'monto_fijo'
                                    ? 'Monto fijo a sumar ($)'
                                    : company.formulaAumento === 'ipc'
                                      ? 'Variación Índice / IPC (%)'
                                      : 'Porcentaje de ajuste (%)'}
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step={company.formulaAumento === 'monto_fijo' ? 50 : 1}
                                  value={company.valorAumento}
                                  onChange={(e) =>
                                    handleInlineCompanyPatch(company, {
                                      valorAumento: Math.max(0, Number(e.target.value) || 0),
                                    })
                                  }
                                  className="w-full min-h-[44px] px-3 py-2 bg-white border border-neutral-300 rounded-lg font-mono font-bold text-base sm:text-sm text-[#101014]"
                                />
                              </div>
                            </div>

                            <div className="bg-white border border-neutral-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <div className="text-[11px] font-medium text-neutral-500">
                                  Precio proyectado ({proj.formulaLabel})
                                </div>
                                <div className="flex flex-wrap items-baseline gap-2 mt-0.5">
                                  <span className="text-lg font-bold font-mono text-[#E52421]">
                                    {formatARS(proj.nuevoPrecioIndividual)} / emp.
                                  </span>
                                  <span className="text-xs font-mono text-neutral-600">
                                    → Subtotal {formatARS(proj.nuevoTotalMensual)} (+{proj.porcentajeEfectivo}%)
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleApplyNewPrice(company)}
                                  className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 bg-[#E52421] hover:bg-[#C91D1A] text-white text-xs font-bold rounded-lg transition-colors"
                                >
                                  Aplicar nuevo precio
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleScheduleIncreaseTask(company)}
                                  className="min-h-[44px] px-3 py-2 bg-white border border-neutral-300 hover:border-[#101014] text-[#101014] text-xs font-semibold rounded-lg"
                                >
                                  Agendar aviso
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* SECTION D: Touch Quick Actions Bar */}
                    <div className="px-4 sm:px-5 py-3 bg-[#F8F6F4] border-t border-neutral-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      {/* Persistent Toggle: Marcar p/ facturar */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={row.marcadoFacturar}
                        onClick={() => handleToggleMarcarFacturar(row)}
                        className={`min-h-[44px] px-3.5 py-2 rounded-lg border text-xs font-bold flex items-center justify-between sm:justify-start gap-2.5 transition-colors ${
                          row.marcadoFacturar
                            ? 'bg-[#101014] text-white border-[#101014]'
                            : 'bg-white text-[#101014] border-neutral-300 hover:border-[#101014]'
                        }`}
                      >
                        <span>Marcar p/ facturar</span>
                        <span
                          className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${
                            row.marcadoFacturar ? 'bg-[#E52421] justify-end' : 'bg-neutral-300 justify-start'
                          }`}
                        >
                          <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                        </span>
                      </button>

                      {/* 4 Touch Action Buttons */}
                      <div className="grid grid-cols-4 sm:flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openPayModal(row)}
                          className="min-h-[44px] px-2.5 sm:px-3.5 py-2 bg-[#E52421] hover:bg-[#C91D1A] text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5 shrink-0" />
                          <span>Pago</span>
                        </button>

                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-disabled={!phone}
                          onClick={(e) => {
                            if (!phone) {
                              e.preventDefault();
                              notify(`Cargá un teléfono en ${company.nombre} para abrir WhatsApp.`);
                            }
                          }}
                          className={`min-h-[44px] px-2.5 sm:px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors ${
                            phone
                              ? 'bg-[#16A34A] hover:bg-[#15803D] text-white'
                              : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                          }`}
                        >
                          <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                          <span className="hidden xs:inline sm:inline">WSP</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          className="min-h-[44px] px-2.5 sm:px-3 py-2 bg-white border border-neutral-300 hover:border-[#101014] text-[#101014] text-xs font-semibold rounded-lg flex items-center justify-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5 shrink-0" />
                          <span className="hidden sm:inline">Editar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setCompanyHistoryPage(1);
                            setHistoryCompany(company);
                          }}
                          className="min-h-[44px] px-2.5 sm:px-3 py-2 bg-white border border-neutral-300 hover:border-[#101014] text-[#101014] text-xs font-semibold rounded-lg flex items-center justify-center gap-1"
                        >
                          <History className="w-3.5 h-3.5 shrink-0" />
                          <span className="hidden sm:inline">Historial</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </section>
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB-VIEW 2: LOTE FACTURAR                                         */}
      {/* ================================================================= */}
      {subView === 'lote' && (
        <div className="space-y-5">
          {/* Batch Summary Panel */}
          <section className="bg-[#101014] text-white rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs text-neutral-400">
                  Lote de facturación · {formatPeriodLabel(activePeriod)}
                </div>
                <h2 className="text-lg font-bold mt-0.5">
                  Resumen de empresas marcadas
                </h2>
              </div>
              <button
                type="button"
                disabled={markedRows.length === 0}
                onClick={handleExecuteBatchBilling}
                className="min-h-[48px] px-5 py-2.5 bg-[#E52421] hover:bg-[#C91D1A] disabled:bg-neutral-700 disabled:text-neutral-400 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Facturar lote y descargar CSV</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div className="bg-white/8 rounded-xl p-3">
                <div className="text-[11px] text-neutral-400">Empresas</div>
                <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums mt-0.5">
                  {batchSummary.count}
                </div>
              </div>
              <div className="bg-white/8 rounded-xl p-3">
                <div className="text-[11px] text-neutral-400">Empleados</div>
                <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums mt-0.5">
                  {formatNumber(batchSummary.employees)}
                </div>
              </div>
              <div className="bg-white/8 rounded-xl p-3">
                <div className="text-[11px] text-neutral-400">Monto estimado</div>
                <div className="text-base sm:text-2xl font-bold font-mono tabular-nums text-[#22C55E] mt-0.5 truncate">
                  {formatARS(batchSummary.total)}
                </div>
              </div>
            </div>
          </section>

          {/* Issued Batches in Active Period (Re-download or Annul Batch) */}
          {(issuedBatches.length > 0 || lastBatch) && (
            <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3.5 border-b border-neutral-200 bg-[#F8F6F4] flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#101014]">
                  Lotes facturados en {formatPeriodLabel(activePeriod)} ({issuedBatches.length || 1})
                </h3>
                <span className="text-[11px] text-neutral-500">
                  Podés re-descargar o anular un lote con error
                </span>
              </div>
              <div className="divide-y divide-neutral-100">
                {(issuedBatches.length > 0 ? issuedBatches : lastBatch ? [lastBatch] : []).map((batch) => (
                  <div
                    key={batch.loteId}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-bold font-mono text-[#101014]">
                        {batch.loteId}
                      </div>
                      <div className="text-xs text-neutral-600 mt-0.5">
                        {batch.rows.length} empresa{batch.rows.length === 1 ? '' : 's'} ·{' '}
                        {formatNumber(batch.totalEmployees)} emp. ·{' '}
                        <strong className="font-mono text-[#101014]">
                          {formatARS(batch.totalAmount)}
                        </strong>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => downloadBatchCsv(batch.rows, batch.loteId)}
                        className="min-h-[42px] px-3 py-1.5 bg-[#F8F6F4] border border-neutral-300 hover:border-[#101014] text-[#101014] text-xs font-bold rounded-lg flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>CSV</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadBatchXlsx(batch.rows, batch.loteId)}
                        className="min-h-[42px] px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Excel</span>
                      </button>

                      {confirmAnnulBatchId === batch.loteId ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleAnnulBatch(batch.loteId, true)}
                            className="min-h-[42px] px-3 py-1.5 bg-[#DC2626] text-white text-xs font-bold rounded-lg"
                          >
                            Confirmar anulación
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmAnnulBatchId(null)}
                            className="min-h-[42px] px-2.5 py-1.5 text-xs font-semibold text-neutral-600"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmAnnulBatchId(batch.loteId)}
                          className="min-h-[42px] px-3 py-1.5 bg-white border border-red-200 hover:border-[#DC2626] text-[#DC2626] text-xs font-bold rounded-lg flex items-center gap-1.5"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          <span>Anular lote</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Marked companies list */}
          <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-neutral-200 bg-[#F8F6F4] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#101014]">
                Empresas incluidas en el lote ({markedRows.length})
              </h3>
              {markedRows.length > 0 && (
                <span className="text-xs font-mono font-bold text-[#101014]">
                  {formatARS(batchSummary.total)}
                </span>
              )}
            </div>

            {markedRows.length === 0 ? (
              <div className="p-6 text-center text-sm text-neutral-500">
                No tenés empresas marcadas para facturar en {formatPeriodLabel(activePeriod)}.
                Marcá las que necesites desde abajo o desde Inicio / Cobranzas.
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {markedRows.map((row) => (
                  <div
                    key={row.company.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-[#101014]">{row.company.nombre}</div>
                      <div className="text-xs text-neutral-500 font-mono mt-0.5">
                        CUIT: {row.company.cuit || 'Sin CUIT'} · {row.company.empleados} emp. ×{' '}
                        {formatARS(row.company.precioIndividual)} · Próx:{' '}
                        {formatDateAR(row.company.proximaFechaFacturar)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3">
                      <div className="text-right">
                        <div className="text-sm font-bold font-mono tabular-nums text-[#101014]">
                          {formatARS(row.subtotalEstimado)}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          Prevista {formatDateAR(row.fechaPrevista)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleMarcarFacturar(row)}
                        className="min-h-[44px] px-3 py-2 bg-[#F8F6F4] hover:bg-red-50 hover:text-[#DC2626] border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-700"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Quick-add unmarked companies */}
          <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-neutral-200 bg-[#F8F6F4] flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#101014]">
                Sumar otras empresas activas al lote ({unmarkedRows.length})
              </h3>
              {unbilledUnmarkedRows.length > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllUnbilled}
                  className="min-h-[38px] px-3 py-1.5 bg-[#E52421] hover:bg-[#C91D1A] text-white text-xs font-bold rounded-lg"
                >
                  Marcar todas las sin facturar ({unbilledUnmarkedRows.length})
                </button>
              )}
            </div>
            <div className="divide-y divide-neutral-100">
              {unmarkedRows.map((row) => (
                <div
                  key={row.company.id}
                  className="p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#101014] truncate">
                      {row.company.nombre}
                    </div>
                    <div className="text-xs text-neutral-500 font-mono mt-0.5">
                      {row.company.empleados} emp. · {formatARS(row.subtotalEstimado)}
                      {row.isPagada
                        ? ` · Ya pagado (${formatDateAR(row.fechaPago || row.fechaFacturacion)})`
                        : row.isFacturada
                          ? ` · Ya facturado (${formatDateAR(row.fechaFacturacion)})${row.loteId ? ` · ${row.loteId}` : ''}`
                          : ' · Sin facturar'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleMarcarFacturar(row)}
                    className={`min-h-[44px] px-3.5 py-2 text-xs font-semibold rounded-lg shrink-0 flex items-center gap-1 ${
                      row.isFacturada || row.isPagada
                        ? 'bg-neutral-100 text-neutral-600 border border-neutral-200 hover:bg-neutral-200'
                        : 'bg-[#101014] hover:bg-neutral-800 text-white'
                    }`}
                  >
                    {row.isPagada ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" />
                        <span>Ya pagado</span>
                      </>
                    ) : row.isFacturada ? (
                      <>
                        <FileCheck2 className="w-3.5 h-3.5 text-sky-700" />
                        <span>Ya facturado</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Sumar</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB-VIEW 3: AJUSTE PRECIOS                                        */}
      {/* ================================================================= */}
      {subView === 'ajustes' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-neutral-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'todos', label: `Todas (${rows.length})` },
                  {
                    id: 'urgentes',
                    label: `Próximas / Vencidas (${rows.filter((r) => r.alertaAjuste).length})`,
                  },
                  {
                    id: 'al_dia',
                    label: `Programadas (${rows.filter((r) => !r.alertaAjuste).length})`,
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAjusteFilter(opt.id)}
                  className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    ajusteFilter === opt.id
                      ? 'bg-[#101014] text-white border-[#101014]'
                      : 'bg-[#F8F6F4] text-neutral-700 border-neutral-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3.5">
            {ajusteRows.map((row) => {
              const { company } = row;
              const proj = calcIncreaseProjection(
                company.empleados,
                company.precioIndividual,
                company.formulaAumento,
                company.valorAumento
              );
              const isOverdueAdj = row.diasAjuste !== null && row.diasAjuste < 0;
              return (
                <article
                  key={company.id}
                  className={`bg-white border border-neutral-200 border-l-4 rounded-xl p-4 sm:p-5 space-y-4 ${
                    isOverdueAdj
                      ? 'border-l-[#DC2626]'
                      : row.alertaAjuste
                        ? 'border-l-[#D97706]'
                        : 'border-l-neutral-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-[#101014]">{company.nombre}</h3>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {company.empleados} empleados · Frecuencia:{' '}
                        <strong className="text-[#101014]">
                          {company.frecuenciaActualizacion || 'Trimestral'}
                        </strong>{' '}
                        · Próx. facturación:{' '}
                        <strong className="font-mono text-[#101014]">
                          {formatDateAR(company.proximaFechaFacturar)}
                        </strong>
                      </p>
                    </div>

                    <span
                      className={`text-xs font-bold self-start ${
                        isOverdueAdj
                          ? 'text-[#DC2626]'
                          : row.alertaAjuste
                            ? 'text-[#D97706]'
                            : 'text-neutral-500'
                      }`}
                    >
                      {row.diasAjuste === null
                        ? 'Sin fecha de ajuste'
                        : isOverdueAdj
                          ? `Ajuste vencido hace ${Math.abs(row.diasAjuste)}d (${formatDateAR(company.fechaProximoAumento)})`
                          : `Ajuste en ${row.diasAjuste}d (${formatDateAR(company.fechaProximoAumento)})`}
                    </span>
                  </div>

                  {/* Formula Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                        Próxima facturación
                      </label>
                      <input
                        type="date"
                        value={company.proximaFechaFacturar || ''}
                        onChange={(e) =>
                          handleInlineCompanyPatch(company, {
                            proximaFechaFacturar: e.target.value,
                          })
                        }
                        className="w-full min-h-[44px] px-2.5 py-2 bg-[#F8F6F4] border border-neutral-300 rounded-lg font-mono text-base sm:text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                        Fecha de ajuste
                      </label>
                      <input
                        type="date"
                        value={company.fechaProximoAumento || ''}
                        onChange={(e) =>
                          handleInlineCompanyPatch(company, {
                            fechaProximoAumento: e.target.value,
                          })
                        }
                        className="w-full min-h-[44px] px-2.5 py-2 bg-[#F8F6F4] border border-neutral-300 rounded-lg font-mono text-base sm:text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                        Frecuencia
                      </label>
                      <select
                        value={company.frecuenciaActualizacion || 'Trimestral'}
                        onChange={(e) =>
                          handleInlineCompanyPatch(company, {
                            frecuenciaActualizacion: e.target.value as FrecuenciaActualizacion,
                          })
                        }
                        className="w-full min-h-[44px] px-2.5 py-2 bg-[#F8F6F4] border border-neutral-300 rounded-lg text-base sm:text-xs font-semibold"
                      >
                        {FRECUENCIA_ACTUALIZACION_OPTIONS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                        Fórmula
                      </label>
                      <select
                        value={company.formulaAumento}
                        onChange={(e) =>
                          handleInlineCompanyPatch(company, {
                            formulaAumento: e.target.value as FormulaAumento,
                          })
                        }
                        className="w-full min-h-[44px] px-2.5 py-2 bg-[#F8F6F4] border border-neutral-300 rounded-lg text-base sm:text-xs font-semibold"
                      >
                        {Object.entries(FORMULA_LABELS).map(([k, lbl]) => (
                          <option key={k} value={k}>
                            {lbl}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                        {company.formulaAumento === 'monto_fijo' ? 'Suma fija ($)' : 'Variación (%)'}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={company.formulaAumento === 'monto_fijo' ? 50 : 1}
                        value={company.valorAumento}
                        onChange={(e) =>
                          handleInlineCompanyPatch(company, {
                            valorAumento: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="w-full min-h-[44px] px-2.5 py-2 bg-[#F8F6F4] border border-neutral-300 rounded-lg font-mono font-bold text-base sm:text-sm"
                      />
                    </div>
                  </div>

                  {/* Projection Summary & Apply (with direct price correction input) */}
                  <div className="bg-[#F8F6F4] border border-neutral-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="grid grid-cols-1 sm:flex sm:items-center gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-500 mb-1">
                          Precio actual / emp. (corregible)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={50}
                          value={company.precioIndividual}
                          onChange={(e) => handleInlineUnitPriceChange(company, e.target.value)}
                          className="w-full sm:w-32 min-h-[40px] px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg text-sm font-bold font-mono text-[#101014]"
                        />
                        <div className="text-[11px] font-mono text-neutral-500 mt-0.5">
                          {formatARS(row.subtotalEstimado)}/mes
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-neutral-500">Precio proyectado</div>
                        <div className="text-base font-bold font-mono text-[#E52421]">
                          {formatARS(proj.nuevoPrecioIndividual)}
                        </div>
                        <div className="text-[11px] font-mono text-[#16A34A] font-semibold">
                          {formatARS(proj.nuevoTotalMensual)}/mes (+{formatARS(proj.diferenciaMensual)})
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleApplyNewPrice(company)}
                      className="min-h-[46px] px-5 py-2.5 bg-[#E52421] hover:bg-[#C91D1A] text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shrink-0"
                    >
                      <Check className="w-4 h-4" />
                      <span>Aplicar nuevo precio</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB-VIEW 4: AGENDA / HISTORIAL + RESPALDO                         */}
      {/* ================================================================= */}
      {subView === 'agenda' && (
        <div className="space-y-6">
          {/* Agenda: Vencimientos & Compromisos */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3.5 border-b border-neutral-200 bg-[#F8F6F4]">
                <h2 className="text-sm font-bold text-[#101014]">
                  Agenda de vencimientos, ajustes y compromisos ({agendaItems.length})
                </h2>
              </div>

              {agendaItems.length === 0 ? (
                <div className="p-6 text-center text-sm text-neutral-500">
                  Sin vencimientos ni compromisos pendientes.
                </div>
              ) : (
                <div className="divide-y divide-neutral-100 max-h-[420px] overflow-y-auto">
                  {agendaItems.map((item) => (
                    <div key={item.id} className="p-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-[11px] font-bold uppercase tracking-wide ${
                              item.categoria === 'Vencimiento'
                                ? 'text-[#DC2626]'
                                : item.categoria === 'Ajuste de precio'
                                  ? 'text-[#D97706]'
                                  : 'text-[#101014]'
                            }`}
                          >
                            {item.categoria}
                          </span>
                          <span className="text-xs font-mono text-neutral-500">
                            {formatDateAR(item.fecha)}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-[#101014] mt-0.5">
                          {item.empresaNombre}
                        </div>
                        <p className="text-xs text-neutral-600 mt-0.5">{item.detalle}</p>
                      </div>
                      {typeof item.monto === 'number' && item.monto > 0 && (
                        <div className="text-sm font-bold font-mono tabular-nums text-[#101014] shrink-0">
                          {formatARS(item.monto)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Commitment Form */}
            <form
              onSubmit={handleAddCommitment}
              className="lg:col-span-5 bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 space-y-3.5"
            >
              <h2 className="text-sm font-bold text-[#101014]">
                Registrar compromiso de pago
              </h2>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Empresa</label>
                <select
                  value={compEmpresaId || activeCompanies[0]?.id || ''}
                  onChange={(e) => setCompEmpresaId(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-[#F8F6F4] border border-neutral-300 rounded-lg text-base sm:text-sm font-semibold"
                >
                  {activeCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    Fecha prometida
                  </label>
                  <input
                    type="date"
                    required
                    value={compFecha}
                    onChange={(e) => setCompFecha(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 bg-[#F8F6F4] border border-neutral-300 rounded-lg font-mono text-base sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    Monto acordado ($)
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="Opcional"
                    value={compMonto}
                    onChange={(e) => setCompMonto(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 bg-[#F8F6F4] border border-neutral-300 rounded-lg font-mono text-base sm:text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">
                  Detalle del compromiso
                </label>
                <textarea
                  rows={2}
                  required
                  value={compDetalle}
                  onChange={(e) => setCompDetalle(e.target.value)}
                  placeholder="Ej: Tesorería confirmó transferencia bancaria el viernes antes de las 13 hs."
                  className="w-full px-3 py-2 bg-[#F8F6F4] border border-neutral-300 rounded-lg text-base sm:text-sm focus:bg-white focus:outline-none focus:border-[#101014]"
                />
              </div>
              <button
                type="submit"
                className="w-full min-h-[44px] px-4 py-2.5 bg-[#101014] hover:bg-neutral-800 text-white text-sm font-bold rounded-lg transition-colors"
              >
                Guardar compromiso en agenda
              </button>
            </form>
          </section>

          {/* Complete History Log */}
          <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-neutral-200 bg-[#F8F6F4] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-[#101014]">
                Historial de pagos, cambios de tarifa y lotes ({filteredEvents.length})
              </h2>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filtrar historial por empresa"
                  value={histCompanyFilter}
                  onChange={(e) => {
                    setHistCompanyFilter(e.target.value);
                    setEventsPage(1);
                  }}
                  className="min-h-[40px] px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs font-semibold"
                >
                  <option value="all">Todas las empresas</option>
                  {activeCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filtrar historial por tipo"
                  value={histTypeFilter}
                  onChange={(e) => {
                    setHistTypeFilter(e.target.value as 'all' | CobranzaEventType);
                    setEventsPage(1);
                  }}
                  className="min-h-[40px] px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs font-semibold"
                >
                  <option value="all">Todos los movimientos</option>
                  <option value="Pago">Pagos y parciales</option>
                  <option value="Cambio de tarifa">Cambios de tarifa</option>
                  <option value="Lote facturado">Lotes facturados</option>
                  <option value="Compromiso">Compromisos</option>
                </select>
              </div>
            </div>

            {filteredEvents.length === 0 ? (
              <div className="p-6 text-center text-sm text-neutral-500">
                No hay movimientos registrados con los filtros actuales.
              </div>
            ) : (
              <>
                <div className="divide-y divide-neutral-100">
                  {paginatedEvents.map((ev) => (
                    <div key={ev.id} className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-[11px] font-bold uppercase tracking-wide ${
                              ev.tipo === 'Pago'
                                ? 'text-[#16A34A]'
                                : ev.tipo === 'Cambio de tarifa'
                                  ? 'text-[#D97706]'
                                  : ev.tipo === 'Lote facturado'
                                    ? 'text-[#E52421]'
                                    : 'text-neutral-700'
                            }`}
                          >
                            {ev.tipo}
                          </span>
                          <span className="text-xs font-mono text-neutral-500">
                            {formatDateAR(ev.fecha)}
                          </span>
                          {ev.loteId && (
                            <span className="text-xs font-mono font-semibold text-[#101014]">
                              · {ev.loteId}
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-bold text-[#101014] mt-0.5">
                          {ev.empresaNombre}
                        </div>
                        <p className="text-xs text-neutral-600 mt-0.5 leading-relaxed">
                          {ev.detalle}
                        </p>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                        {typeof ev.monto === 'number' && ev.monto > 0 && (
                          <div className="text-left sm:text-right">
                            <div className="text-sm font-bold font-mono tabular-nums text-[#101014]">
                              {formatARS(ev.monto)}
                            </div>
                            {typeof ev.retenciones === 'number' && ev.retenciones > 0 && (
                              <div className="text-[11px] font-mono text-neutral-500">
                                + {formatARS(ev.retenciones)} ret.
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditEventModal(ev)}
                            className="min-h-[38px] px-2.5 py-1.5 bg-[#F8F6F4] hover:bg-neutral-200/70 border border-neutral-200 rounded-lg text-xs font-semibold text-[#101014] flex items-center gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Corregir</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteEventModal(ev)}
                            className="min-h-[38px] px-2.5 py-1.5 bg-white hover:bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-[#DC2626] flex items-center gap-1"
                          >
                            {ev.tipo === 'Compromiso' ? (
                              <Trash2 className="w-3.5 h-3.5" />
                            ) : (
                              <Undo2 className="w-3.5 h-3.5" />
                            )}
                            <span>{ev.tipo === 'Compromiso' ? 'Eliminar' : 'Revertir'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination Bar (cada 5) */}
                {filteredEvents.length > HISTORY_PAGE_SIZE && (
                  <div className="px-4 py-3 border-t border-neutral-200 bg-[#F8F6F4] flex flex-col sm:flex-row items-center justify-between gap-2.5">
                    <span className="text-xs text-neutral-600 font-mono">
                      Mostrando {(safeEventsPage - 1) * HISTORY_PAGE_SIZE + 1}–
                      {Math.min(safeEventsPage * HISTORY_PAGE_SIZE, filteredEvents.length)} de{' '}
                      {filteredEvents.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={safeEventsPage <= 1}
                        onClick={() => setEventsPage((p) => Math.max(1, p - 1))}
                        className="min-h-[40px] px-3 py-1.5 bg-white border border-neutral-300 hover:border-[#101014] disabled:opacity-40 text-xs font-bold text-[#101014] rounded-lg flex items-center gap-1"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Anterior</span>
                      </button>
                      <span className="text-xs font-mono font-bold text-[#101014] px-1">
                        {safeEventsPage} / {eventsTotalPages}
                      </span>
                      <button
                        type="button"
                        disabled={safeEventsPage >= eventsTotalPages}
                        onClick={() => setEventsPage((p) => Math.min(eventsTotalPages, p + 1))}
                        className="min-h-[40px] px-3 py-1.5 bg-white border border-neutral-300 hover:border-[#101014] disabled:opacity-40 text-xs font-bold text-[#101014] rounded-lg flex items-center gap-1"
                      >
                        <span>Siguiente</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Respaldo JSON & Restaurar Datos de Ejemplo */}
          <section className="bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 space-y-3.5">
            <div>
              <h2 className="text-sm font-bold text-[#101014]">
                Exportación, respaldo JSON y datos de ejemplo
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Descargá la planilla mensual, guardá o importá tu respaldo completo en JSON, o
                restaurá los datos de ejemplo para pruebas.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-2.5">
              <button
                type="button"
                onClick={handleExportMonthlyExcel}
                className="min-h-[44px] px-4 py-2 bg-[#101014] hover:bg-neutral-800 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Exportar Excel ({formatPeriodLabel(activePeriod)})</span>
              </button>

              <button
                type="button"
                onClick={handleExportJson}
                className="min-h-[44px] px-4 py-2 bg-white border border-neutral-300 hover:border-[#101014] text-[#101014] text-xs font-bold rounded-lg flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Exportar respaldo (JSON)</span>
              </button>

              <label className="min-h-[44px] px-4 py-2 bg-[#F8F6F4] hover:bg-neutral-200/70 border border-neutral-300 text-[#101014] text-xs font-bold rounded-lg flex items-center justify-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Importar respaldo (JSON)</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => void handleImportJson(e.target.files?.[0] ?? null)}
                />
              </label>

              {confirmResetSeed ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onResetSeedData();
                      setConfirmResetSeed(false);
                      notify('Se restauraron los datos de ejemplo de Bonus Ticket.');
                    }}
                    className="min-h-[44px] px-4 py-2 bg-[#E52421] text-white text-xs font-bold rounded-lg"
                  >
                    Confirmar restauración
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResetSeed(false)}
                    className="min-h-[44px] px-3 py-2 text-xs font-semibold text-neutral-600"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmResetSeed(true)}
                  className="min-h-[44px] px-4 py-2 bg-white border border-neutral-300 hover:border-[#E52421] hover:text-[#E52421] text-neutral-700 text-xs font-bold rounded-lg flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Restaurar datos de ejemplo</span>
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ================================================================= */}
      {/* FIXED BOTTOM NAVIGATION BAR (MOBILE-FIRST, < 1024px)              */}
      {/* ================================================================= */}
      <nav
        aria-label="Navegación de Cobranzas"
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white/95 backdrop-blur border-t border-neutral-200 px-2 py-1.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] no-print"
      >
        <div className="grid grid-cols-4 gap-1 max-w-lg mx-auto">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const active = subView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubView(tab.id)}
                className={`relative min-h-[54px] rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active
                    ? 'bg-[#101014] text-white'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] font-semibold leading-tight">
                  {tab.shortLabel}
                </span>
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span
                    className={`absolute top-1 right-2 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-mono font-bold flex items-center justify-center ${
                      active ? 'bg-[#E52421] text-white' : 'bg-[#E52421] text-white'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ================================================================= */}
      {/* MODAL: + PAGO (PARCIAL / TOTAL + RETENCIONES)                     */}
      {/* ================================================================= */}
      {payModalRow && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between sticky top-0 bg-white">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-neutral-500">
                  Registrar cobro · {formatPeriodLabel(activePeriod)}
                </div>
                <h2 className="text-base font-bold text-[#101014] truncate">
                  {payModalRow.company.nombre}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPayModalRow(null)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-500 hover:text-[#101014]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPayment} className="p-5 space-y-4">
              {/* Current balance summary */}
              <div className="grid grid-cols-3 gap-2 bg-[#F8F6F4] border border-neutral-200 rounded-xl p-3 text-center">
                <div>
                  <div className="text-[11px] text-neutral-500">Facturado</div>
                  <div className="text-xs font-bold font-mono">{formatARS(payModalRow.facturado)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-neutral-500">Ya cobrado</div>
                  <div className="text-xs font-bold font-mono text-[#16A34A]">
                    {formatARS(payModalRow.cobrado + payModalRow.retenciones)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-neutral-500">Saldo actual</div>
                  <div className="text-xs font-bold font-mono text-[#E52421]">
                    {formatARS(payModalRow.saldo)}
                  </div>
                </div>
              </div>

              {/* Mode toggle */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-neutral-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setPayMode('abono');
                    setPayMonto(payModalRow.saldo > 0 ? payModalRow.saldo : 0);
                    setPayRetenciones(0);
                  }}
                  className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors ${
                    payMode === 'abono' ? 'bg-white text-[#101014] shadow-xs' : 'text-neutral-600'
                  }`}
                >
                  + Sumar pago / parcial
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPayMode('editar');
                    setPayMonto(payModalRow.cobrado);
                    setPayRetenciones(payModalRow.retenciones);
                  }}
                  className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors ${
                    payMode === 'editar' ? 'bg-white text-[#101014] shadow-xs' : 'text-neutral-600'
                  }`}
                >
                  Editar totales del mes
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    {payMode === 'abono' ? 'Efectivo / Transferencia a sumar ($)' : 'Total cobrado ($)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={payMonto}
                    onChange={(e) => setPayMonto(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono font-bold text-base sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    {payMode === 'abono' ? 'Retenciones a sumar ($)' : 'Total retenciones ($)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={payRetenciones}
                    onChange={(e) => setPayRetenciones(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono font-bold text-base sm:text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Monto facturado ($)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={payFacturado}
                    onChange={(e) => setPayFacturado(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono text-base sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Fecha de pago
                  </label>
                  <input
                    type="date"
                    value={payFecha}
                    onChange={(e) => setPayFecha(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono text-base sm:text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Medio de pago
                  </label>
                  <select
                    value={payMedio}
                    onChange={(e) => setPayMedio(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg text-base sm:text-sm bg-white"
                  >
                    <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                    <option value="Cheque Electrónico (Echeq)">Cheque Electrónico (Echeq)</option>
                    <option value="Débito Automático">Débito Automático</option>
                    <option value="Efectivo">Efectivo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    N° de Factura / Comprobante
                  </label>
                  <input
                    type="text"
                    value={payFactura}
                    onChange={(e) => setPayFactura(e.target.value)}
                    placeholder="FC-A 0003-00001850"
                    className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono text-base sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Observación / Nota para el historial
                </label>
                <input
                  type="text"
                  value={payObs}
                  onChange={(e) => setPayObs(e.target.value)}
                  placeholder="Ej: Adelanto 50%, certificado IIBB recibido por mail"
                  className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg text-base sm:text-sm"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPayModalRow(null)}
                  className="flex-1 min-h-[46px] px-4 py-2.5 bg-[#F8F6F4] text-neutral-700 text-sm font-semibold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 min-h-[46px] px-4 py-2.5 bg-[#E52421] hover:bg-[#C91D1A] text-white text-sm font-bold rounded-xl"
                >
                  Guardar cobro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: EDITAR EMPRESA / DATOS OPERATIVOS DE COBRANZA              */}
      {/* ================================================================= */}
      {editModalRow && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between sticky top-0 bg-white">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-neutral-500">
                  Editar datos de cobranza
                </div>
                <h2 className="text-base font-bold text-[#101014] truncate">
                  {editModalRow.company.nombre}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditModalRow(null)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-500 hover:text-[#101014]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditModal} className="p-5 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">CUIT</label>
                  <input
                    type="text"
                    value={editCuit}
                    onChange={(e) => setEditCuit(e.target.value)}
                    placeholder="30-12345678-9"
                    className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono text-base sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Cantidad de empleados
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editEmpleados}
                    onChange={(e) => setEditEmpleados(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono font-bold text-base sm:text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Contacto cobranza
                  </label>
                  <input
                    type="text"
                    value={editContacto}
                    onChange={(e) => setEditContacto(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg text-base sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Teléfono cobro / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={editTelefono}
                    onChange={(e) => setEditTelefono(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono text-base sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Email facturación
                </label>
                <input
                  type="email"
                  value={editMail}
                  onChange={(e) => setEditMail(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg text-base sm:text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Última carga de base
                  </label>
                  <input
                    type="date"
                    value={editFechaBase}
                    onChange={(e) => setEditFechaBase(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono text-base sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Próxima fecha a facturar
                  </label>
                  <input
                    type="date"
                    value={editProxFacturar}
                    onChange={(e) => setEditProxFacturar(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono text-base sm:text-sm"
                  />
                </div>
              </div>

              <div className="border-t border-neutral-200 pt-3.5 space-y-3">
                <div className="text-xs font-bold text-[#101014] uppercase tracking-wide">
                  Corregir facturación y cobros · {formatPeriodLabel(activePeriod)}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Facturado ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editMontoFacturado}
                      onChange={(e) => setEditMontoFacturado(Number(e.target.value))}
                      className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono font-bold text-base sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Cobrado ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editMontoCobrado}
                      onChange={(e) => setEditMontoCobrado(Number(e.target.value))}
                      className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono font-bold text-base sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Retenciones ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editRetenciones}
                      onChange={(e) => setEditRetenciones(Number(e.target.value))}
                      className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono font-bold text-base sm:text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Fecha prevista ({formatPeriodLabel(activePeriod)})
                    </label>
                    <input
                      type="date"
                      value={editVencimiento}
                      onChange={(e) => setEditVencimiento(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono text-base sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      N° de Factura del período
                    </label>
                    <input
                      type="text"
                      value={editFacturaNro}
                      onChange={(e) => setEditFacturaNro(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono text-base sm:text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      ID de Lote (vaciá para desvincular)
                    </label>
                    <input
                      type="text"
                      value={editLoteId}
                      onChange={(e) => setEditLoteId(e.target.value)}
                      placeholder="Sin lote"
                      className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono text-base sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Observaciones del período
                    </label>
                    <input
                      type="text"
                      value={editObs}
                      onChange={(e) => setEditObs(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg text-base sm:text-sm"
                    />
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-3 bg-[#F8F6F4] rounded-xl cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={editControlada}
                  onChange={(e) => setEditControlada(e.target.checked)}
                  className="w-5 h-5 accent-[#101014]"
                />
                <span className="text-xs font-semibold text-[#101014]">
                  Facturación controlada (verificada con base de empleados y tarifa)
                </span>
              </label>

              {/* Zona de corrección / eliminación de errores del período */}
              <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-xl space-y-2.5">
                <div className="text-xs font-bold text-[#DC2626]">
                  Corregir errores o eliminar facturación del período
                </div>

                {confirmEditAction === 'none' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmEditAction('reset_cobros')}
                      className="min-h-[42px] px-3 py-1.5 bg-white border border-red-200 hover:border-[#DC2626] text-[#DC2626] text-xs font-bold rounded-lg flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reiniciar cobros a $0</span>
                    </button>

                    {editModalRow.payment && (
                      <button
                        type="button"
                        onClick={() => setConfirmEditAction('delete_billing')}
                        className="min-h-[42px] px-3 py-1.5 bg-[#DC2626] hover:bg-red-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Eliminar facturación del mes</span>
                      </button>
                    )}
                  </div>
                )}

                {confirmEditAction === 'reset_cobros' && (
                  <div className="space-y-2">
                    <p className="text-xs text-red-900">
                      ¿Confirmás poner en <strong>$0</strong> el cobrado y las retenciones de{' '}
                      <strong>{editModalRow.company.nombre}</strong> en {formatPeriodLabel(activePeriod)}?
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResetPeriodCollections}
                        className="min-h-[42px] px-3.5 py-1.5 bg-[#DC2626] text-white text-xs font-bold rounded-lg"
                      >
                        Sí, reiniciar cobros
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmEditAction('none')}
                        className="min-h-[42px] px-3 py-1.5 text-xs font-semibold text-neutral-700"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {confirmEditAction === 'delete_billing' && (
                  <div className="space-y-2">
                    <p className="text-xs text-red-900">
                      ¿Confirmás eliminar por completo el registro de facturación y cobro de{' '}
                      <strong>{editModalRow.company.nombre}</strong> para{' '}
                      <strong>{formatPeriodLabel(activePeriod)}</strong>? Volverá al monto estimado base.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDeletePeriodBilling}
                        className="min-h-[42px] px-3.5 py-1.5 bg-[#DC2626] text-white text-xs font-bold rounded-lg"
                      >
                        Sí, eliminar facturación
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmEditAction('none')}
                        className="min-h-[42px] px-3 py-1.5 text-xs font-semibold text-neutral-700"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditModalRow(null)}
                  className="flex-1 min-h-[46px] px-4 py-2.5 bg-[#F8F6F4] text-neutral-700 text-sm font-semibold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 min-h-[46px] px-4 py-2.5 bg-[#101014] hover:bg-neutral-800 text-white text-sm font-bold rounded-xl"
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: HISTORIAL RÁPIDO POR EMPRESA                               */}
      {/* ================================================================= */}
      {historyCompany && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[88vh] flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-neutral-500">
                  Historial de cobranza · Corregir o revertir
                </div>
                <h2 className="text-base font-bold text-[#101014] truncate">
                  {historyCompany.nombre}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setHistoryCompany(null)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-500 hover:text-[#101014]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {companyHistoryEvents.length === 0 ? (
                <p className="text-sm text-neutral-500 text-center py-6">
                  Todavía no hay movimientos registrados para esta empresa.
                </p>
              ) : (
                <>
                  {paginatedCompanyHistoryEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3.5 bg-[#F8F6F4] border border-neutral-200 rounded-xl space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#101014]">{ev.tipo}</span>
                        <span className="text-xs font-mono text-neutral-500">
                          {formatDateAR(ev.fecha)}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-700 leading-relaxed">{ev.detalle}</p>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        {typeof ev.monto === 'number' && ev.monto > 0 ? (
                          <div className="text-xs font-mono font-bold text-[#16A34A]">
                            {formatARS(ev.monto)}
                            {ev.retenciones ? ` (+ ${formatARS(ev.retenciones)} ret.)` : ''}
                          </div>
                        ) : (
                          <span />
                        )}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setHistoryCompany(null);
                              openEditEventModal(ev);
                            }}
                            className="min-h-[36px] px-2.5 py-1 bg-white border border-neutral-300 rounded-lg text-[11px] font-bold text-[#101014] flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Corregir</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setHistoryCompany(null);
                              openDeleteEventModal(ev);
                            }}
                            className="min-h-[36px] px-2.5 py-1 bg-white border border-red-200 rounded-lg text-[11px] font-bold text-[#DC2626] flex items-center gap-1"
                          >
                            <Undo2 className="w-3 h-3" />
                            <span>{ev.tipo === 'Compromiso' ? 'Eliminar' : 'Revertir'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {companyHistoryEvents.length > HISTORY_PAGE_SIZE && (
                    <div className="pt-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={safeCompanyHistoryPage <= 1}
                        onClick={() => setCompanyHistoryPage((p) => Math.max(1, p - 1))}
                        className="min-h-[38px] px-3 py-1 bg-white border border-neutral-300 disabled:opacity-40 text-xs font-bold text-[#101014] rounded-lg flex items-center gap-1"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Anterior</span>
                      </button>
                      <span className="text-xs font-mono font-bold text-neutral-600">
                        {safeCompanyHistoryPage} / {companyHistoryTotalPages} ({companyHistoryEvents.length})
                      </span>
                      <button
                        type="button"
                        disabled={safeCompanyHistoryPage >= companyHistoryTotalPages}
                        onClick={() =>
                          setCompanyHistoryPage((p) => Math.min(companyHistoryTotalPages, p + 1))
                        }
                        className="min-h-[38px] px-3 py-1 bg-white border border-neutral-300 disabled:opacity-40 text-xs font-bold text-[#101014] rounded-lg flex items-center gap-1"
                      >
                        <span>Siguiente</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-4 border-t border-neutral-200 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setHistCompanyFilter(historyCompany.id);
                  setEventsPage(1);
                  setHistoryCompany(null);
                  setSubView('agenda');
                }}
                className="flex-1 min-h-[44px] px-4 py-2 bg-[#101014] text-white text-xs font-bold rounded-xl"
              >
                Abrir en Agenda / Historial
              </button>
              <button
                type="button"
                onClick={() => setHistoryCompany(null)}
                className="min-h-[44px] px-4 py-2 bg-[#F8F6F4] text-neutral-700 text-xs font-semibold rounded-xl"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: CORREGIR MOVIMIENTO (PAGO / AJUSTE / COMPROMISO / LOTE)    */}
      {/* ================================================================= */}
      {editEventModal && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between sticky top-0 bg-white">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-neutral-500">
                  Corregir movimiento · {editEventModal.tipo}
                </div>
                <h2 className="text-base font-bold text-[#101014] truncate">
                  {editEventModal.empresaNombre}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditEventModal(null)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-500 hover:text-[#101014]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedEvent} className="p-5 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    required
                    value={evEditFecha}
                    onChange={(e) => setEvEditFecha(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono text-base sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    {editEventModal.tipo === 'Cambio de tarifa'
                      ? 'Precio unitario ($)'
                      : 'Monto ($)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={evEditMonto}
                    onChange={(e) => setEvEditMonto(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono font-bold text-base sm:text-sm"
                  />
                </div>
              </div>

              {editEventModal.tipo === 'Pago' && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Retenciones ($)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={evEditRetenciones}
                    onChange={(e) => setEvEditRetenciones(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono font-bold text-base sm:text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Detalle / descripción
                </label>
                <textarea
                  rows={3}
                  required
                  value={evEditDetalle}
                  onChange={(e) => setEvEditDetalle(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-base sm:text-sm focus:outline-none focus:border-[#101014]"
                />
              </div>

              {(editEventModal.tipo === 'Pago' || editEventModal.tipo === 'Cambio de tarifa') &&
                editEventModal.empresaId && (
                  <label className="flex items-start gap-2.5 p-3 bg-[#F8F6F4] rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={evSyncLedger}
                      onChange={(e) => setEvSyncLedger(e.target.checked)}
                      className="w-5 h-5 mt-0.5 accent-[#101014]"
                    />
                    <span className="text-xs font-semibold text-[#101014] leading-snug">
                      {editEventModal.tipo === 'Pago'
                        ? 'Recalcular automáticamente el cobrado, retenciones y saldo del período con esta corrección'
                        : 'Actualizar también el precio unitario actual de la empresa a este valor'}
                    </span>
                  </label>
                )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditEventModal(null)}
                  className="flex-1 min-h-[46px] px-4 py-2.5 bg-[#F8F6F4] text-neutral-700 text-sm font-semibold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 min-h-[46px] px-4 py-2.5 bg-[#101014] hover:bg-neutral-800 text-white text-sm font-bold rounded-xl"
                >
                  Guardar corrección
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: ELIMINAR O REVERTIR MOVIMIENTO                             */}
      {/* ================================================================= */}
      {deleteEventModal && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase text-[#DC2626]">
                  Eliminar o revertir · {deleteEventModal.tipo}
                </div>
                <h2 className="text-base font-bold text-[#101014] truncate">
                  {deleteEventModal.empresaNombre}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDeleteEventModal(null)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-500 hover:text-[#101014]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 bg-[#F8F6F4] border border-neutral-200 rounded-xl text-xs text-neutral-700 space-y-1">
                <div className="font-mono text-neutral-500">
                  {formatDateAR(deleteEventModal.fecha)}
                  {deleteEventModal.loteId ? ` · ${deleteEventModal.loteId}` : ''}
                </div>
                <div>{deleteEventModal.detalle}</div>
              </div>

              {deleteEventModal.tipo === 'Pago' && (
                <label className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={evRevertAction}
                    onChange={(e) => setEvRevertAction(e.target.checked)}
                    className="w-5 h-5 mt-0.5 accent-[#DC2626]"
                  />
                  <span className="text-xs font-semibold text-red-950 leading-snug">
                    Descontar {formatARS(deleteEventModal.monto ?? 0)}
                    {deleteEventModal.retenciones
                      ? ` y ${formatARS(deleteEventModal.retenciones)} de retenciones`
                      : ''}{' '}
                    del total cobrado del período y recalcular el saldo
                  </span>
                </label>
              )}

              {deleteEventModal.tipo === 'Cambio de tarifa' && (
                <div className="space-y-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={evRevertAction}
                      onChange={(e) => setEvRevertAction(e.target.checked)}
                      className="w-5 h-5 mt-0.5 accent-[#101014]"
                    />
                    <span className="text-xs font-semibold text-amber-950 leading-snug">
                      Revertir también el precio individual por empleado en la empresa
                    </span>
                  </label>
                  {evRevertAction && (
                    <div>
                      <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                        Precio unitario a restaurar ($)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={50}
                        value={evRestorePrice}
                        onChange={(e) => setEvRestorePrice(Number(e.target.value))}
                        className="w-full min-h-[44px] px-3 py-2 bg-white border border-amber-300 rounded-lg font-mono font-bold text-base sm:text-sm text-[#101014]"
                      />
                    </div>
                  )}
                </div>
              )}

              {deleteEventModal.tipo === 'Lote facturado' && deleteEventModal.loteId && (
                <label className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={evRevertAction}
                    onChange={(e) => setEvRevertAction(e.target.checked)}
                    className="w-5 h-5 mt-0.5 accent-[#DC2626]"
                  />
                  <span className="text-xs font-semibold text-red-950 leading-snug">
                    Anular el lote completo ({deleteEventModal.loteId}) y devolver las empresas a la
                    cola de Lote Facturar para corregir y volver a facturar
                  </span>
                </label>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDeleteEventModal(null)}
                  className="flex-1 min-h-[46px] px-4 py-2.5 bg-[#F8F6F4] text-neutral-700 text-sm font-semibold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteEvent}
                  className="flex-1 min-h-[46px] px-4 py-2.5 bg-[#DC2626] hover:bg-red-700 text-white text-sm font-bold rounded-xl"
                >
                  {evRevertAction && deleteEventModal.tipo !== 'Compromiso'
                    ? 'Revertir y eliminar'
                    : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: RESETEAR PERÍODO DE COBRANZAS (ARCHIVA EN HISTORIAL)       */}
      {/* ================================================================= */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between sticky top-0 bg-white">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase text-[#E52421]">
                  Resetear cobranzas · {formatPeriodLabel(activePeriod)}
                </div>
                <h2 className="text-base font-bold text-[#101014]">
                  Poner en $0 y archivar en historial
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-500 hover:text-[#101014]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPeriodReset} className="p-5 space-y-4">
              <p className="text-xs text-neutral-600 leading-relaxed">
                Esta acción reseteará a <strong>$0</strong> el <strong>Facturado</strong>,{' '}
                <strong>Cobrado efectivo</strong>, <strong>Retenciones</strong>,{' '}
                <strong>Saldo pendiente</strong>, comprobantes y lotes de las{' '}
                <strong>{kpis.clientes}</strong> empresas activas en{' '}
                <strong>{formatPeriodLabel(activePeriod)}</strong>. Todos los datos actuales quedarán
                guardados automáticamente en <strong>Historial reseteos</strong> para consultarlos,
                exportarlos o restaurarlos cuando necesites.
              </p>

              <div className="px-3 py-2.5 bg-sky-50 border border-sky-200 rounded-xl flex items-start gap-2 text-xs text-sky-950">
                <Info className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
                <span>
                  <strong>Reseteo automático mensual activo:</strong> cada inicio de mes el sistema
                  archiva automáticamente el mes saliente en <strong>Historial reseteos</strong> e
                  inicia el nuevo período en $0.
                </span>
              </div>

              {/* Snapshot Preview of what will be archived */}
              <div className="bg-[#F8F6F4] border border-neutral-200 rounded-xl p-3.5 space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
                  Resumen que se guardará en el historial
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
                    <div className="text-[11px] text-neutral-500">Facturado</div>
                    <div className="text-sm font-bold font-mono text-[#101014] mt-0.5">
                      {formatARS(kpis.totalFacturado)}
                    </div>
                  </div>
                  <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
                    <div className="text-[11px] text-neutral-500">Cobrado efectivo</div>
                    <div className="text-sm font-bold font-mono text-[#16A34A] mt-0.5">
                      {formatARS(kpis.totalCobrado)}
                    </div>
                  </div>
                  <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
                    <div className="text-[11px] text-neutral-500">Retenciones</div>
                    <div className="text-sm font-bold font-mono text-[#101014] mt-0.5">
                      {formatARS(kpis.totalRetenciones)}
                    </div>
                  </div>
                  <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
                    <div className="text-[11px] text-neutral-500">Saldo pendiente</div>
                    <div className="text-sm font-bold font-mono text-[#E52421] mt-0.5">
                      {formatARS(kpis.totalPendiente)}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-neutral-600 flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                  <span>
                    <strong className="text-[#16A34A]">{kpis.pagadas}</strong> pagadas
                  </span>
                  <span>·</span>
                  <span>
                    <strong className="text-[#D97706]">{kpis.parciales}</strong> parciales
                  </span>
                  <span>·</span>
                  <span>
                    <strong className="text-[#DC2626]">{kpis.vencidas}</strong> vencidas
                  </span>
                  <span>·</span>
                  <span>
                    <strong>{kpis.clientes}</strong> empresas incluidas
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Motivo o nota de referencia (opcional)
                </label>
                <input
                  type="text"
                  maxLength={400}
                  value={resetMotivo}
                  onChange={(e) => setResetMotivo(e.target.value)}
                  placeholder="Ej: Cierre de período / Inicio limpio de facturación / Corrección general"
                  className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg text-base sm:text-sm focus:outline-none focus:border-[#101014]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setResetModalOpen(false)}
                  className="flex-1 min-h-[46px] px-4 py-2.5 bg-[#F8F6F4] text-neutral-700 text-sm font-semibold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 min-h-[46px] px-4 py-2.5 bg-[#E52421] hover:bg-[#C91D1A] text-white text-sm font-bold rounded-xl flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Resetear y archivar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: HISTORIAL DE RESETEOS (ACCESO COMPLETO A LO RESETEADO)     */}
      {/* ================================================================= */}
      {resetHistoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-neutral-500">
                  Respaldo histórico de importes reseteados
                </div>
                <h2 className="text-base sm:text-lg font-bold text-[#101014] truncate">
                  Historial de reseteos ({cobranzaResets.length})
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {resetHistoryPeriods.length > 0 && (
                  <select
                    aria-label="Filtrar historial de reseteos por período"
                    value={resetHistoryPeriodFilter}
                    onChange={(e) => {
                      setResetHistoryPeriodFilter(e.target.value);
                      setResetHistoryPage(1);
                    }}
                    className="min-h-[40px] px-3 py-1.5 bg-[#F8F6F4] border border-neutral-300 rounded-lg text-xs font-semibold text-[#101014]"
                  >
                    <option value="all">Todos los períodos</option>
                    {resetHistoryPeriods.map((p) => (
                      <option key={p} value={p}>
                        {formatPeriodLabel(p)}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setResetHistoryModalOpen(false);
                    setConfirmRestoreResetId(null);
                    setConfirmDeleteResetId(null);
                  }}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-500 hover:text-[#101014]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {sortedResets.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <Archive className="w-8 h-8 text-neutral-300 mx-auto" />
                  <p className="text-sm font-semibold text-[#101014]">
                    Todavía no hay reseteos archivados
                  </p>
                  <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                    Cuando presiones <strong>Resetear</strong> o comience un nuevo mes
                    automáticamente, todos los importes de facturado, cobro efectivo, retenciones y
                    saldos pendientes quedarán guardados acá.
                  </p>
                </div>
              ) : (
                paginatedResets.map((rec) => {
                  const isOpen = Boolean(expandedResetIds[rec.id]);
                  const isConfirmingRestore = confirmRestoreResetId === rec.id;
                  const isConfirmingDelete = confirmDeleteResetId === rec.id;

                  return (
                    <article
                      key={rec.id}
                      className="border border-neutral-200 rounded-xl overflow-hidden bg-white"
                    >
                      <div className="p-4 bg-[#F8F6F4] border-b border-neutral-200 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wide text-[#E52421]">
                                {formatPeriodLabel(rec.periodo)}
                              </span>
                              <span className="text-xs font-mono text-neutral-500">
                                · Reseteado el {formatDateAR(rec.fecha)}
                                {rec.hora ? ` a las ${rec.hora} hs` : ''}
                              </span>
                            </div>
                            {rec.motivo && (
                              <p className="text-xs text-neutral-700 mt-1">
                                <strong>Motivo:</strong> {rec.motivo}
                              </p>
                            )}
                          </div>
                          <div className="text-xs text-neutral-600 font-medium shrink-0">
                            {rec.totalClientes} emp. ·{' '}
                            <span className="text-[#16A34A] font-semibold">{rec.pagadas} pag.</span> ·{' '}
                            <span className="text-[#D97706] font-semibold">{rec.parciales} parc.</span> ·{' '}
                            <span className="text-[#DC2626] font-semibold">{rec.vencidas} venc.</span>
                          </div>
                        </div>

                        {/* Archived KPI Strip */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
                            <div className="text-[11px] text-neutral-500">Facturado</div>
                            <div className="text-sm font-bold font-mono tabular-nums text-[#101014]">
                              {formatARS(rec.totalFacturado)}
                            </div>
                          </div>
                          <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
                            <div className="text-[11px] text-neutral-500">Cobrado efectivo</div>
                            <div className="text-sm font-bold font-mono tabular-nums text-[#16A34A]">
                              {formatARS(rec.totalCobrado)}
                            </div>
                          </div>
                          <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
                            <div className="text-[11px] text-neutral-500">Retenciones</div>
                            <div className="text-sm font-bold font-mono tabular-nums text-neutral-700">
                              {formatARS(rec.totalRetenciones)}
                            </div>
                          </div>
                          <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
                            <div className="text-[11px] text-neutral-500">Saldo pendiente</div>
                            <div className="text-sm font-bold font-mono tabular-nums text-[#E52421]">
                              {formatARS(rec.totalSaldoPendiente)}
                            </div>
                          </div>
                        </div>

                        {/* Actions Bar */}
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedResetIds((prev) => ({ ...prev, [rec.id]: !prev[rec.id] }))
                            }
                            className="min-h-[40px] px-3 py-1.5 bg-white border border-neutral-300 hover:border-[#101014] text-[#101014] text-xs font-bold rounded-lg flex items-center gap-1.5"
                          >
                            {isOpen ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {isOpen
                                ? 'Ocultar detalle'
                                : `Ver detalle (${rec.items.length} empresas)`}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleExportResetSnapshotExcel(rec)}
                            className="min-h-[40px] px-3 py-1.5 bg-[#101014] hover:bg-neutral-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>Excel</span>
                          </button>

                          {isConfirmingRestore ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleRestoreResetSnapshot(rec)}
                                className="min-h-[40px] px-3 py-1.5 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold rounded-lg"
                              >
                                Confirmar restauración
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmRestoreResetId(null)}
                                className="min-h-[40px] px-2.5 py-1.5 text-xs font-semibold text-neutral-600"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteResetId(null);
                                setConfirmRestoreResetId(rec.id);
                              }}
                              className="min-h-[40px] px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 text-xs font-bold rounded-lg flex items-center gap-1.5"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                              <span>Restaurar</span>
                            </button>
                          )}

                          {isConfirmingDelete ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteCobranzaReset(rec.id);
                                  setConfirmDeleteResetId(null);
                                  notify('Registro eliminado del historial de reseteos.');
                                }}
                                className="min-h-[40px] px-3 py-1.5 bg-[#DC2626] text-white text-xs font-bold rounded-lg"
                              >
                                Confirmar borrado
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteResetId(null)}
                                className="min-h-[40px] px-2.5 py-1.5 text-xs font-semibold text-neutral-600"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmRestoreResetId(null);
                                setConfirmDeleteResetId(rec.id);
                              }}
                              className="min-h-[40px] px-3 py-1.5 bg-white border border-red-200 hover:bg-red-50 text-[#DC2626] text-xs font-bold rounded-lg flex items-center gap-1.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Eliminar</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expandable Company-by-Company Breakdown */}
                      {isOpen && (
                        <div className="divide-y divide-neutral-100">
                          {rec.items.map((item, idx) => (
                            <div
                              key={`${rec.id}_${item.empresaId}_${idx}`}
                              className="p-3.5 sm:px-4 space-y-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-bold text-[#101014]">
                                    {item.empresaNombre}
                                  </div>
                                  <div className="text-[11px] text-neutral-500 flex flex-wrap items-center gap-x-2">
                                    {item.cuit && <span className="font-mono">CUIT: {item.cuit}</span>}
                                    <span>{item.empleados} emp.</span>
                                    {item.numeroFactura && (
                                      <span className="font-mono">· {item.numeroFactura}</span>
                                    )}
                                    {item.loteId && (
                                      <span className="font-mono font-semibold text-[#101014]">
                                        · {item.loteId}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span
                                  className={`text-[11px] font-bold uppercase ${
                                    item.estado === 'Al día'
                                      ? 'text-[#16A34A]'
                                      : item.estado === 'Vencida'
                                        ? 'text-[#DC2626]'
                                        : item.estado === 'Parcial'
                                          ? 'text-[#D97706]'
                                          : 'text-neutral-600'
                                  }`}
                                >
                                  {item.estado === 'Al día' ? 'Pagada' : item.estado}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-[#F8F6F4] rounded-lg p-2.5">
                                <div>
                                  <span className="text-[11px] text-neutral-500 block">Facturado</span>
                                  <span className="font-mono font-bold text-[#101014]">
                                    {formatARS(item.montoFacturado)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[11px] text-neutral-500 block">Cobrado</span>
                                  <span className="font-mono font-bold text-[#16A34A]">
                                    {formatARS(item.montoCobrado)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[11px] text-neutral-500 block">Retenciones</span>
                                  <span className="font-mono font-bold text-neutral-700">
                                    {formatARS(item.retenciones)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[11px] text-neutral-500 block">Saldo</span>
                                  <span
                                    className={`font-mono font-bold ${
                                      item.saldoPendiente > 0 ? 'text-[#E52421]' : 'text-[#16A34A]'
                                    }`}
                                  >
                                    {formatARS(item.saldoPendiente)}
                                  </span>
                                </div>
                              </div>

                              {(item.fechaFacturacion || item.fechaPago || item.observaciones) && (
                                <div className="text-[11px] text-neutral-500 flex flex-wrap gap-x-3 gap-y-0.5">
                                  {item.fechaFacturacion && (
                                    <span>
                                      Facturado:{' '}
                                      <strong className="font-mono">
                                        {formatDateAR(item.fechaFacturacion)}
                                      </strong>
                                    </span>
                                  )}
                                  {item.fechaPago && (
                                    <span>
                                      Pago: <strong className="font-mono">{formatDateAR(item.fechaPago)}</strong>
                                    </span>
                                  )}
                                  {item.observaciones && <span>Nota: {item.observaciones}</span>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>

            {/* Footer with 5-per-page Pagination + Close */}
            <div className="p-4 border-t border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {sortedResets.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2.5">
                  <span className="text-xs text-neutral-600 font-mono">
                    Mostrando {(safeResetHistoryPage - 1) * HISTORY_PAGE_SIZE + 1}–
                    {Math.min(safeResetHistoryPage * HISTORY_PAGE_SIZE, sortedResets.length)} de{' '}
                    {sortedResets.length}
                  </span>
                  {sortedResets.length > HISTORY_PAGE_SIZE && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={safeResetHistoryPage <= 1}
                        onClick={() => setResetHistoryPage((p) => Math.max(1, p - 1))}
                        className="min-h-[40px] px-3 py-1.5 bg-[#F8F6F4] border border-neutral-300 hover:border-[#101014] disabled:opacity-40 text-xs font-bold text-[#101014] rounded-lg flex items-center gap-1"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Anterior</span>
                      </button>
                      <span className="text-xs font-mono font-bold text-[#101014] px-1">
                        {safeResetHistoryPage} / {resetsTotalPages}
                      </span>
                      <button
                        type="button"
                        disabled={safeResetHistoryPage >= resetsTotalPages}
                        onClick={() =>
                          setResetHistoryPage((p) => Math.min(resetsTotalPages, p + 1))
                        }
                        className="min-h-[40px] px-3 py-1.5 bg-[#F8F6F4] border border-neutral-300 hover:border-[#101014] disabled:opacity-40 text-xs font-bold text-[#101014] rounded-lg flex items-center gap-1"
                      >
                        <span>Siguiente</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <span />
              )}

              <button
                type="button"
                onClick={() => {
                  setResetHistoryModalOpen(false);
                  setConfirmRestoreResetId(null);
                  setConfirmDeleteResetId(null);
                }}
                className="min-h-[44px] px-5 py-2 bg-[#101014] text-white text-xs font-bold rounded-xl self-end sm:self-auto"
              >
                Cerrar historial
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: CARTEL DE ADVERTENCIA / AVISO DE PROCESO DE FACTURACIÓN    */}
      {/* ================================================================= */}
      {processAlertModal && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
            {processAlertModal.kind === 'must_bill_first' ? (
              <>
                <div className="px-5 py-4 bg-amber-50 border-b border-amber-200 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <AlertTriangle className="w-6 h-6 text-[#D97706] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-[#D97706]">
                        Advertencia de proceso · {formatPeriodLabel(activePeriod)}
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-[#101014] leading-snug">
                        Primero facturar mes corriente
                      </h2>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProcessAlertModal(null)}
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center text-neutral-500 hover:text-[#101014]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <p className="text-sm text-neutral-700 leading-relaxed">
                    Para cargar un pago en <strong>{processAlertModal.row.company.nombre}</strong>,
                    primero tenés que facturar esta empresa en{' '}
                    <strong>{formatPeriodLabel(activePeriod)}</strong>.
                  </p>

                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const target = processAlertModal.row;
                        setProcessAlertModal(null);
                        openBillModal(target);
                      }}
                      className="w-full min-h-[46px] px-4 py-2.5 bg-[#E52421] hover:bg-[#C91D1A] text-white text-sm font-bold rounded-xl"
                    >
                      Facturar {processAlertModal.row.company.nombre} ahora
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setProcessAlertModal(null);
                        setSubView('lote');
                      }}
                      className="w-full min-h-[46px] px-4 py-2.5 bg-[#101014] hover:bg-neutral-800 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2"
                    >
                      <Layers className="w-4 h-4" />
                      <span>Ir a Lote Facturar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setProcessAlertModal(null)}
                      className="w-full min-h-[44px] px-4 py-2 bg-[#F8F6F4] text-neutral-700 text-sm font-semibold rounded-xl"
                    >
                      Entendido
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div
                  className={`px-5 py-4 border-b flex items-start justify-between gap-3 ${
                    processAlertModal.row.isPagada
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-sky-50 border-sky-200'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    {processAlertModal.row.isPagada ? (
                      <CheckCircle2 className="w-6 h-6 text-[#16A34A] shrink-0 mt-0.5" />
                    ) : (
                      <FileCheck2 className="w-6 h-6 text-sky-700 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div
                        className={`text-[11px] font-bold uppercase tracking-wide ${
                          processAlertModal.row.isPagada ? 'text-[#16A34A]' : 'text-sky-700'
                        }`}
                      >
                        Aviso · {formatPeriodLabel(activePeriod)}
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-[#101014] leading-snug">
                        {processAlertModal.row.isPagada ? 'Ya pagado' : 'Ya facturado'}
                      </h2>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProcessAlertModal(null)}
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center text-neutral-500 hover:text-[#101014]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <p className="text-sm text-neutral-700 leading-relaxed">
                    <strong>{processAlertModal.row.company.nombre}</strong>{' '}
                    {processAlertModal.row.isPagada
                      ? `ya figura como pagada en ${formatPeriodLabel(activePeriod)}.`
                      : `ya fue facturada en ${formatPeriodLabel(activePeriod)}.`}
                  </p>

                  <div className="bg-[#F8F6F4] border border-neutral-200 rounded-xl p-3.5 space-y-2 text-xs">
                    {processAlertModal.row.fechaFacturacion && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-neutral-500">Fecha de facturación</span>
                        <strong className="font-mono text-[#101014]">
                          {formatDateAR(processAlertModal.row.fechaFacturacion)}
                        </strong>
                      </div>
                    )}
                    {processAlertModal.row.isPagada && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-neutral-500">Fecha de pago</span>
                        <strong className="font-mono text-[#16A34A]">
                          {formatDateAR(
                            processAlertModal.row.fechaPago || processAlertModal.row.fechaFacturacion
                          )}
                        </strong>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-500">Importe facturado</span>
                      <strong className="font-mono text-[#101014]">
                        {formatARS(processAlertModal.row.facturado)}
                      </strong>
                    </div>
                    {processAlertModal.row.cobrado + processAlertModal.row.retenciones > 0 && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-neutral-500">Total acreditado (cobro + ret.)</span>
                        <strong className="font-mono text-[#16A34A]">
                          {formatARS(
                            processAlertModal.row.cobrado + processAlertModal.row.retenciones
                          )}
                        </strong>
                      </div>
                    )}
                    {processAlertModal.row.loteId && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-neutral-500">Lote</span>
                        <strong className="font-mono text-[#101014]">
                          {processAlertModal.row.loteId}
                        </strong>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    {!processAlertModal.row.isPagada && processAlertModal.source === 'facturar' && (
                      <button
                        type="button"
                        onClick={() => {
                          const target = processAlertModal.row;
                          setProcessAlertModal(null);
                          openPayModal(target);
                        }}
                        className="w-full min-h-[46px] px-4 py-2.5 bg-[#E52421] hover:bg-[#C91D1A] text-white text-sm font-bold rounded-xl"
                      >
                        Registrar pago de esta empresa
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const target = processAlertModal.row;
                        setProcessAlertModal(null);
                        openEditModal(target);
                      }}
                      className="w-full min-h-[44px] px-4 py-2 bg-white border border-neutral-300 hover:border-[#101014] text-[#101014] text-xs font-bold rounded-xl"
                    >
                      Editar o corregir comprobante / importes
                    </button>

                    <button
                      type="button"
                      onClick={() => setProcessAlertModal(null)}
                      className="w-full min-h-[44px] px-4 py-2 bg-[#101014] text-white text-sm font-bold rounded-xl"
                    >
                      Entendido
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: FACTURAR EMPRESA INDIVIDUAL DEL MES CORRIENTE              */}
      {/* ================================================================= */}
      {billModalRow && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between sticky top-0 bg-white">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase text-[#E52421]">
                  Facturar mes corriente · {formatPeriodLabel(activePeriod)}
                </div>
                <h2 className="text-base font-bold text-[#101014] truncate">
                  {billModalRow.company.nombre}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setBillModalRow(null)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-500 hover:text-[#101014]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSingleBill} className="p-5 space-y-4">
              <div className="p-3 bg-[#F8F6F4] border border-neutral-200 rounded-xl text-xs flex items-center justify-between">
                <span className="text-neutral-600">
                  Base: <strong className="font-mono">{billModalRow.company.empleados}</strong> emp. ×{' '}
                  <strong className="font-mono">
                    {formatARS(billModalRow.company.precioIndividual)}
                  </strong>
                </span>
                <strong className="font-mono text-[#101014]">
                  {formatARS(billModalRow.subtotalEstimado)}
                </strong>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Monto a facturar ($)
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={billMonto}
                  onChange={(e) => setBillMonto(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono font-bold text-base sm:text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Fecha de facturación
                  </label>
                  <input
                    type="date"
                    required
                    value={billFecha}
                    onChange={(e) => setBillFecha(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono text-base sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Fecha prevista de cobro
                  </label>
                  <input
                    type="date"
                    required
                    value={billVencimiento}
                    onChange={(e) => setBillVencimiento(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono text-base sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  N° de Factura (opcional)
                </label>
                <input
                  type="text"
                  value={billFactura}
                  onChange={(e) => setBillFactura(e.target.value)}
                  placeholder="FC-A 0003-00001860"
                  className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 rounded-lg font-mono text-base sm:text-sm"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setBillModalRow(null)}
                  className="flex-1 min-h-[46px] px-4 py-2.5 bg-[#F8F6F4] text-neutral-700 text-sm font-semibold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 min-h-[46px] px-4 py-2.5 bg-[#E52421] hover:bg-[#C91D1A] text-white text-sm font-bold rounded-xl"
                >
                  Confirmar facturación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
