export type TeamMember = 'Ramiro' | 'Marketing' | 'Miguel' | 'Nahuel';

export interface TeamProfile {
  id: TeamMember;
  label: string;
  role: string;
  area: string;
  initials: string;
}

export type ViewId = 'dashboard' | 'planificacion' | 'empresas' | 'cobranzas' | 'marketing' | 'datos';

export type CompanyStatus =
  | 'Activa'
  | 'Prospecto'
  | 'Prospecto rechazada'
  | 'Dado de baja'
  | 'Otros';

export const COMPANY_STATUS_OPTIONS: Array<{ value: CompanyStatus; label: string }> = [
  { value: 'Activa', label: 'Clientes activas' },
  { value: 'Prospecto', label: 'Empresas prospecto con propuesta' },
  { value: 'Prospecto rechazada', label: 'Empresas prospecto rechazadas' },
  { value: 'Dado de baja', label: 'Clientes dados de baja' },
  { value: 'Otros', label: 'Otros' },
];

export type FidelizacionTipo =
  | 'Visita'
  | 'Llamada'
  | 'Reunión presencial'
  | 'Reunión virtual'
  | 'Evento'
  | 'Otros';

export const FIDELIZACION_TIPOS: FidelizacionTipo[] = [
  'Visita',
  'Llamada',
  'Reunión presencial',
  'Reunión virtual',
  'Evento',
  'Otros',
];

export interface FidelizacionRecord {
  id: string;
  empresaId: string;
  empresaNombre: string;
  fecha: string; // YYYY-MM-DD
  tipo: FidelizacionTipo;
  notas?: string;
  planTaskId?: string;
}

export type CompanyActivityType =
  | 'Creación'
  | 'Paso a Activa'
  | 'Baja'
  | 'Cambio de estado'
  | 'Eliminación';

export const COMPANY_ACTIVITY_TYPES: CompanyActivityType[] = [
  'Creación',
  'Paso a Activa',
  'Baja',
  'Cambio de estado',
  'Eliminación',
];

export interface CompanyActivityRecord {
  id: string;
  empresaId: string;
  empresaNombre: string;
  tipo: CompanyActivityType;
  fecha: string; // YYYY-MM-DD
  detalle: string;
  estadoAnterior?: string;
  estadoNuevo?: string;
}

export type LoyaltyLevel = 'Fidelización Presencial' | 'Difusión masiva WhatsApp/Email';
export type FormulaAumento = 'porcentaje' | 'ipc' | 'monto_fijo';
export type FrecuenciaActualizacion = 'Mensual' | 'Bimestral' | 'Trimestral' | 'Semestral' | 'Manual';

export const FRECUENCIA_ACTUALIZACION_OPTIONS: FrecuenciaActualizacion[] = [
  'Mensual',
  'Bimestral',
  'Trimestral',
  'Semestral',
  'Manual',
];

export interface Company {
  id: string;
  nombre: string;
  cuit?: string;
  estado: CompanyStatus;
  localidad: string;
  direccion: string;
  lat: number;
  lng: number;
  empleados: number;
  contactoPrincipal: string;
  telefonoPrincipal: string;
  contactoDifusion: string;
  telefonoDifusion?: string;
  mailDifusion: string;
  linkBaseEmpleados: string;
  fechaBaseEmpleados?: string; // YYYY-MM-DD
  linkContrato: string;
  linkPropuesta: string;
  nivelFidelizacion: LoyaltyLevel;
  // Sección 2 — Información para Facturar
  contactoCobranza: string;
  telefonoCobro: string;
  mailCobro: string;
  facturacionControlada?: boolean;
  precioIndividual: number;
  proximaFechaFacturar?: string; // YYYY-MM-DD
  fechaProximoAumento: string; // YYYY-MM-DD
  frecuenciaActualizacion?: FrecuenciaActualizacion;
  formulaAumento: FormulaAumento;
  valorAumento: number;
  // Baja de cliente
  fechaBaja?: string; // YYYY-MM-DD
  motivoBaja?: string;
}

export type TaskStatus = 'Pendiente' | 'En Proceso' | 'Vencida' | 'Listo';

export interface WeeklyTask {
  id: string;
  titulo: string;
  responsable: TeamMember;
  empresaId?: string;
  empresaNombre?: string;
  fecha: string; // YYYY-MM-DD
  estado: TaskStatus;
  notas?: string;
}

export type PlanSector = 'Marketing' | 'Cobranzas' | 'Comercios' | 'Empresas' | 'General';
export type PlanColumnStatus = 'Pendiente' | 'En Proceso' | 'Completado';
export type PlanPriority = 'Baja' | 'Media' | 'Alta';

export interface PlanTask {
  id: string;
  titulo: string;
  sector: PlanSector | ''; // Área principal (vacío si no tiene etiquetas)
  sectores: PlanSector[]; // Cero, una o más etiquetas vinculadas
  fechaObjetivo: string; // YYYY-MM-DD
  semana: string; // e.g. 'Semana 48 · 23 al 29 Nov 2026'
  prioridad: PlanPriority;
  estado: PlanColumnStatus;
  empresaId?: string;
  empresaNombre?: string;
  linkDrive?: string;
}

export type PaymentStatus = 'Al día' | 'Parcial' | 'Pendiente' | 'Vencida';

export interface PaymentRecord {
  id: string;
  empresaId: string;
  periodo: string; // YYYY-MM
  montoFacturado: number;
  montoCobrado: number;
  retenciones: number;
  estado: PaymentStatus;
  fechaPago: string;
  fechaVencimiento: string;
  numeroFactura: string;
  medioPago: string;
  observaciones: string;
  marcadoFacturar?: boolean;
  facturada?: boolean;
  fechaFacturacion?: string; // YYYY-MM-DD
  loteId?: string;
}

export type CobranzaEventType = 'Pago' | 'Cambio de tarifa' | 'Lote facturado' | 'Compromiso';

export interface CobranzaEvent {
  id: string;
  empresaId: string;
  empresaNombre: string;
  periodo: string; // YYYY-MM
  fecha: string; // YYYY-MM-DD
  tipo: CobranzaEventType;
  monto?: number;
  retenciones?: number;
  detalle: string;
  loteId?: string;
}

export interface CobranzaResetItem {
  paymentId: string;
  empresaId: string;
  empresaNombre: string;
  cuit: string;
  empleados: number;
  precioIndividual: number;
  montoFacturado: number;
  montoCobrado: number;
  retenciones: number;
  saldoPendiente: number;
  estado: PaymentStatus;
  fechaPago: string;
  fechaVencimiento: string;
  numeroFactura: string;
  medioPago: string;
  observaciones: string;
  marcadoFacturar: boolean;
  facturada: boolean;
  fechaFacturacion?: string;
  loteId: string;
}

export interface CobranzaResetRecord {
  id: string;
  periodo: string; // YYYY-MM
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:mm
  motivo: string;
  totalClientes: number;
  totalFacturado: number;
  totalCobrado: number;
  totalRetenciones: number;
  totalSaldoPendiente: number;
  pagadas: number;
  parciales: number;
  vencidas: number;
  items: CobranzaResetItem[];
}

export type MetaReportOrigin = 'CSV Meta' | 'Gemini Vision' | 'Manual';

export interface MetaReport {
  id: string;
  periodo: string;
  fechaCarga: string; // YYYY-MM-DD
  origen: MetaReportOrigin;
  alcance: number;
  visualizaciones: number;
  visitasPerfil: number;
  interacciones: number;
  clicsEnlace: number;
  nuevosSeguidores: number;
  analisisEjecutivo: string;
}

export type MarketingLogType =
  | 'Checklist Semanal'
  | 'Kit Difusión WhatsApp/Email'
  | 'Reel de Fidelización';

export interface MarketingLog {
  id: string;
  semana: string; // e.g. 'Semana 47 · Nov 2026'
  grillaDiaria?: boolean;
  colaboraciones?: boolean;
  magoyaVideos?: boolean;
  promoDuplica?: boolean;
  tipoEntrega: MarketingLogType;
  empresaId?: string;
  empresaNombre?: string;
  fecha: string; // YYYY-MM-DD
  notas?: string;
}

export interface BonusTicketState {
  companies: Company[];
  tasks: WeeklyTask[];
  planTasks: PlanTask[];
  payments: PaymentRecord[];
  metaReports: MetaReport[];
  marketingLogs: MarketingLog[];
  fidelizaciones: FidelizacionRecord[];
  companyActivities: CompanyActivityRecord[];
  cobranzaEvents: CobranzaEvent[];
  cobranzaResets: CobranzaResetRecord[];
}

export const TEAM_PROFILES: TeamProfile[] = [
  { id: 'Ramiro', label: 'Ramiro - Líder', role: 'Dirección General', area: 'Visibilidad Total', initials: 'RL' },
  { id: 'Marketing', label: 'Marketing', role: 'Redes, Difusión y Fidelización', area: 'Marketing', initials: 'MK' },
  { id: 'Miguel', label: 'Miguel - Empresas', role: 'Comercial y Territorio', area: 'Empresas', initials: 'ME' },
  { id: 'Nahuel', label: 'Nahuel - Cobranzas', role: 'Facturación y Finanzas', area: 'Cobranzas', initials: 'NC' },
];

export const TUCUMAN_LOCALIDADES: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'San Miguel de Tucumán', lat: -26.8241, lng: -65.2226 },
  { name: 'Yerba Buena', lat: -26.8167, lng: -65.3167 },
  { name: 'Tafí Viejo', lat: -26.7322, lng: -65.2597 },
  { name: 'Banda del Río Salí', lat: -26.8358, lng: -65.1656 },
  { name: 'Concepción', lat: -27.3458, lng: -65.5886 },
  { name: 'Alderetes', lat: -26.8167, lng: -65.1333 },
  { name: 'Lules', lat: -26.9228, lng: -65.3375 },
  { name: 'Monteros', lat: -27.1675, lng: -65.4983 },
];
