import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  BonusTicketState,
  CobranzaEvent,
  CobranzaResetRecord,
  Company,
  CompanyActivityRecord,
  CompanyStatus,
  FidelizacionRecord,
  FrecuenciaActualizacion,
  MarketingLog,
  MetaReport,
  PaymentRecord,
  PlanTask,
  WeeklyTask,
} from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const app: FirebaseApp = initializeApp(firebaseConfig);
export const db: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth: Auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const provisionedFirebaseConfig = firebaseConfig;

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    // Permission denied means Firestore responded online
    return true;
  }
}

void testConnection();

export async function signInWithGoogleTeam(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutTeam(): Promise<void> {
  await signOut(auth);
}

export async function ensureUserWorkspace(user: User): Promise<string> {
  const workspaceId = user.uid;
  const wsPath = `workspaces/${workspaceId}`;
  const wsRef = doc(db, 'workspaces', workspaceId);
  try {
    const snap = await getDoc(wsRef);
    if (!snap.exists()) {
      await setDoc(wsRef, {
        ownerId: user.uid,
        name: 'Bonus Ticket Tucumán',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return workspaceId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, wsPath);
  }
}

function clampString(val: string | undefined, max: number): string {
  return String(val ?? '').slice(0, max);
}

function toCompanyDoc(company: Company, ownerId: string, workspaceId: string) {
  const allowedStatuses: readonly CompanyStatus[] = [
    'Activa',
    'Prospecto',
    'Prospecto rechazada',
    'Dado de baja',
    'Otros',
  ];
  const safeEstado: CompanyStatus = allowedStatuses.includes(company.estado)
    ? company.estado
    : 'Prospecto';
  const allowedFreqs: readonly FrecuenciaActualizacion[] = [
    'Mensual',
    'Bimestral',
    'Trimestral',
    'Semestral',
    'Manual',
  ];
  const safeFreq: FrecuenciaActualizacion =
    company.frecuenciaActualizacion && allowedFreqs.includes(company.frecuenciaActualizacion)
      ? company.frecuenciaActualizacion
      : 'Trimestral';
  return {
    ownerId,
    workspaceId,
    nombre: clampString(company.nombre || 'Sin nombre', 160),
    cuit: clampString(company.cuit, 30),
    estado: safeEstado,
    localidad: clampString(company.localidad || 'San Miguel de Tucumán', 100),
    direccion: clampString(company.direccion, 200),
    lat: Number.isFinite(company.lat) ? company.lat : -26.8241,
    lng: Number.isFinite(company.lng) ? company.lng : -65.2226,
    empleados: Math.max(0, Math.min(100000, Math.round(Number(company.empleados) || 0))),
    contactoPrincipal: clampString(company.contactoPrincipal, 120),
    telefonoPrincipal: clampString(company.telefonoPrincipal, 50),
    contactoDifusion: clampString(company.contactoDifusion, 120),
    telefonoDifusion: clampString(company.telefonoDifusion, 50),
    mailDifusion: clampString(company.mailDifusion, 160),
    linkBaseEmpleados: clampString(company.linkBaseEmpleados, 500),
    fechaBaseEmpleados: clampString(company.fechaBaseEmpleados, 20),
    linkContrato: clampString(company.linkContrato, 500),
    linkPropuesta: clampString(company.linkPropuesta, 500),
    nivelFidelizacion:
      company.nivelFidelizacion === 'Fidelización Presencial'
        ? 'Fidelización Presencial'
        : 'Difusión masiva WhatsApp/Email',
    contactoCobranza: clampString(company.contactoCobranza, 120),
    telefonoCobro: clampString(company.telefonoCobro, 50),
    mailCobro: clampString(company.mailCobro, 160),
    facturacionControlada: Boolean(company.facturacionControlada),
    precioIndividual: Math.max(0, Number(company.precioIndividual) || 0),
    proximaFechaFacturar: clampString(company.proximaFechaFacturar, 20),
    fechaProximoAumento: clampString(company.fechaProximoAumento, 20),
    frecuenciaActualizacion: safeFreq,
    formulaAumento:
      company.formulaAumento === 'ipc' || company.formulaAumento === 'monto_fijo'
        ? company.formulaAumento
        : 'porcentaje',
    valorAumento: Math.max(0, Number(company.valorAumento) || 0),
    fechaBaja: clampString(company.fechaBaja, 20),
    motivoBaja: clampString(company.motivoBaja, 600),
  };
}

function toTaskDoc(task: WeeklyTask, ownerId: string, workspaceId: string) {
  return {
    ownerId,
    workspaceId,
    titulo: clampString(task.titulo || 'Tarea', 200),
    responsable: task.responsable,
    empresaId: clampString(task.empresaId, 128),
    empresaNombre: clampString(task.empresaNombre, 160),
    fecha: clampString(task.fecha || new Date().toISOString().slice(0, 10), 20),
    estado: task.estado,
    notas: clampString(task.notas, 600),
  };
}

function toPlanTaskDoc(task: PlanTask, ownerId: string, workspaceId: string) {
  const allowed = ['Marketing', 'Cobranzas', 'Comercios', 'Empresas', 'General'] as const;
  const rawSectors = Array.isArray(task.sectores)
    ? task.sectores
    : task.sector
      ? [task.sector]
      : [];
  const safeSectors = Array.from(
    new Set(rawSectors.filter((s) => (allowed as readonly string[]).includes(s)))
  ).slice(0, 5);

  return {
    ownerId,
    workspaceId,
    titulo: clampString(task.titulo || 'Tarea semanal', 200),
    sector: safeSectors[0] ?? '',
    sectores: safeSectors,
    fechaObjetivo: clampString(task.fechaObjetivo || new Date().toISOString().slice(0, 10), 20),
    semana: clampString(task.semana || 'Semana actual', 60),
    prioridad:
      task.prioridad === 'Alta'
        ? 'Alta'
        : task.prioridad === 'Baja'
          ? 'Baja'
          : 'Media',
    estado: task.estado,
    empresaId: clampString(task.empresaId, 128),
    empresaNombre: clampString(task.empresaNombre, 160),
    linkDrive: clampString(task.linkDrive, 500),
  };
}

function toPaymentDoc(payment: PaymentRecord, ownerId: string, workspaceId: string) {
  const allowedStatus = ['Al día', 'Parcial', 'Pendiente', 'Vencida'] as const;
  const safeEstado = (allowedStatus as readonly string[]).includes(payment.estado)
    ? payment.estado
    : 'Pendiente';
  return {
    ownerId,
    workspaceId,
    empresaId: clampString(payment.empresaId, 128),
    periodo: /^\d{4}-\d{2}$/.test(payment.periodo) ? payment.periodo : '2026-11',
    montoFacturado: Math.max(0, Number(payment.montoFacturado) || 0),
    montoCobrado: Math.max(0, Number(payment.montoCobrado) || 0),
    retenciones: Math.max(0, Number(payment.retenciones) || 0),
    estado: safeEstado,
    fechaPago: clampString(payment.fechaPago, 20),
    fechaVencimiento: clampString(payment.fechaVencimiento, 20),
    numeroFactura: clampString(payment.numeroFactura, 60),
    medioPago: clampString(payment.medioPago, 60),
    observaciones: clampString(payment.observaciones, 500),
    marcadoFacturar: Boolean(payment.marcadoFacturar),
    facturada: Boolean(payment.facturada),
    fechaFacturacion: clampString(payment.fechaFacturacion, 20),
    loteId: clampString(payment.loteId, 40),
  };
}

function toMetaReportDoc(report: MetaReport, ownerId: string, workspaceId: string) {
  return {
    ownerId,
    workspaceId,
    periodo: clampString(report.periodo || 'Período', 40),
    fechaCarga: clampString(report.fechaCarga || new Date().toISOString().slice(0, 10), 20),
    origen: report.origen,
    alcance: Math.max(0, Number(report.alcance) || 0),
    visualizaciones: Math.max(0, Number(report.visualizaciones) || 0),
    visitasPerfil: Math.max(0, Number(report.visitasPerfil) || 0),
    interacciones: Math.max(0, Number(report.interacciones) || 0),
    clicsEnlace: Math.max(0, Number(report.clicsEnlace) || 0),
    nuevosSeguidores: Math.max(0, Number(report.nuevosSeguidores) || 0),
    analisisEjecutivo: clampString(report.analisisEjecutivo, 3000),
  };
}

function toMarketingLogDoc(log: MarketingLog, ownerId: string, workspaceId: string) {
  return {
    ownerId,
    workspaceId,
    semana: clampString(log.semana || 'Semana actual', 40),
    grillaDiaria: Boolean(log.grillaDiaria),
    colaboraciones: Boolean(log.colaboraciones),
    magoyaVideos: Boolean(log.magoyaVideos),
    promoDuplica: Boolean(log.promoDuplica),
    tipoEntrega: log.tipoEntrega,
    empresaId: clampString(log.empresaId, 128),
    empresaNombre: clampString(log.empresaNombre, 160),
    fecha: clampString(log.fecha || new Date().toISOString().slice(0, 10), 20),
    notas: clampString(log.notas, 600),
  };
}

function toFidelizacionDoc(item: FidelizacionRecord, ownerId: string, workspaceId: string) {
  const allowedTipos = [
    'Visita',
    'Llamada',
    'Reunión presencial',
    'Reunión virtual',
    'Evento',
    'Otros',
  ] as const;
  const safeTipo = (allowedTipos as readonly string[]).includes(item.tipo) ? item.tipo : 'Otros';
  return {
    ownerId,
    workspaceId,
    empresaId: clampString(item.empresaId, 128),
    empresaNombre: clampString(item.empresaNombre || 'Empresa', 160),
    fecha: clampString(item.fecha || new Date().toISOString().slice(0, 10), 20),
    tipo: safeTipo,
    notas: clampString(item.notas, 600),
    planTaskId: clampString(item.planTaskId, 128),
  };
}

function toCompanyActivityDoc(
  item: CompanyActivityRecord,
  ownerId: string,
  workspaceId: string
) {
  const allowedTipos = [
    'Creación',
    'Paso a Activa',
    'Baja',
    'Cambio de estado',
    'Eliminación',
  ] as const;
  const safeTipo = (allowedTipos as readonly string[]).includes(item.tipo)
    ? item.tipo
    : 'Cambio de estado';
  return {
    ownerId,
    workspaceId,
    empresaId: clampString(item.empresaId, 128),
    empresaNombre: clampString(item.empresaNombre || 'Empresa', 160),
    tipo: safeTipo,
    fecha: clampString(item.fecha || new Date().toISOString().slice(0, 10), 20),
    detalle: clampString(item.detalle, 600),
    estadoAnterior: clampString(item.estadoAnterior, 60),
    estadoNuevo: clampString(item.estadoNuevo, 60),
  };
}

function toCobranzaEventDoc(item: CobranzaEvent, ownerId: string, workspaceId: string) {
  const allowedTipos = ['Pago', 'Cambio de tarifa', 'Lote facturado', 'Compromiso'] as const;
  const safeTipo = (allowedTipos as readonly string[]).includes(item.tipo) ? item.tipo : 'Pago';
  return {
    ownerId,
    workspaceId,
    empresaId: clampString(item.empresaId, 128),
    empresaNombre: clampString(item.empresaNombre || 'Empresa', 160),
    periodo: clampString(item.periodo, 20),
    fecha: clampString(item.fecha || new Date().toISOString().slice(0, 10), 20),
    tipo: safeTipo,
    monto: Math.max(0, Number(item.monto) || 0),
    retenciones: Math.max(0, Number(item.retenciones) || 0),
    detalle: clampString(item.detalle, 600),
    loteId: clampString(item.loteId, 40),
  };
}

function toCobranzaResetDoc(item: CobranzaResetRecord, ownerId: string, workspaceId: string) {
  const safeItems = (Array.isArray(item.items) ? item.items : []).slice(0, 500).map((row) => ({
    paymentId: clampString(row.paymentId, 128),
    empresaId: clampString(row.empresaId, 128),
    empresaNombre: clampString(row.empresaNombre || 'Empresa', 160),
    cuit: clampString(row.cuit, 30),
    empleados: Math.max(0, Math.round(Number(row.empleados) || 0)),
    precioIndividual: Math.max(0, Number(row.precioIndividual) || 0),
    montoFacturado: Math.max(0, Number(row.montoFacturado) || 0),
    montoCobrado: Math.max(0, Number(row.montoCobrado) || 0),
    retenciones: Math.max(0, Number(row.retenciones) || 0),
    saldoPendiente: Math.max(0, Number(row.saldoPendiente) || 0),
    estado: row.estado || 'Pendiente',
    fechaPago: clampString(row.fechaPago, 20),
    fechaVencimiento: clampString(row.fechaVencimiento, 20),
    numeroFactura: clampString(row.numeroFactura, 60),
    medioPago: clampString(row.medioPago, 60),
    observaciones: clampString(row.observaciones, 500),
    marcadoFacturar: Boolean(row.marcadoFacturar),
    facturada: Boolean(row.facturada),
    fechaFacturacion: clampString(row.fechaFacturacion, 20),
    loteId: clampString(row.loteId, 40),
  }));

  return {
    ownerId,
    workspaceId,
    periodo: /^\d{4}-\d{2}$/.test(item.periodo) ? item.periodo : '2026-11',
    fecha: clampString(item.fecha || new Date().toISOString().slice(0, 10), 20),
    hora: clampString(item.hora, 10),
    motivo: clampString(item.motivo, 400),
    totalClientes: Math.max(0, Math.min(10000, Math.round(Number(item.totalClientes) || 0))),
    totalFacturado: Math.max(0, Number(item.totalFacturado) || 0),
    totalCobrado: Math.max(0, Number(item.totalCobrado) || 0),
    totalRetenciones: Math.max(0, Number(item.totalRetenciones) || 0),
    totalSaldoPendiente: Math.max(0, Number(item.totalSaldoPendiente) || 0),
    pagadas: Math.max(0, Math.min(10000, Math.round(Number(item.pagadas) || 0))),
    parciales: Math.max(0, Math.min(10000, Math.round(Number(item.parciales) || 0))),
    vencidas: Math.max(0, Math.min(10000, Math.round(Number(item.vencidas) || 0))),
    items: safeItems,
  };
}

export async function pushStateToFirestore(user: User, state: BonusTicketState): Promise<void> {
  const workspaceId = await ensureUserWorkspace(user);
  const ownerId = user.uid;
  const batch = writeBatch(db);

  for (const company of state.companies) {
    const id = company.id.replace(/[^a-zA-Z0-9_-]/g, '') || `emp_${Date.now()}`;
    const ref = doc(db, 'workspaces', workspaceId, 'companies', id);
    batch.set(ref, {
      ...toCompanyDoc(company, ownerId, workspaceId),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  for (const task of state.tasks) {
    const id = task.id.replace(/[^a-zA-Z0-9_-]/g, '') || `task_${Date.now()}`;
    const ref = doc(db, 'workspaces', workspaceId, 'tasks', id);
    batch.set(ref, {
      ...toTaskDoc(task, ownerId, workspaceId),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  for (const planTask of state.planTasks) {
    const id = planTask.id.replace(/[^a-zA-Z0-9_-]/g, '') || `plan_${Date.now()}`;
    const ref = doc(db, 'workspaces', workspaceId, 'planTasks', id);
    batch.set(ref, {
      ...toPlanTaskDoc(planTask, ownerId, workspaceId),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  for (const payment of state.payments) {
    const id = payment.id.replace(/[^a-zA-Z0-9_-]/g, '') || `pay_${Date.now()}`;
    const ref = doc(db, 'workspaces', workspaceId, 'payments', id);
    batch.set(ref, {
      ...toPaymentDoc(payment, ownerId, workspaceId),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  for (const report of state.metaReports) {
    const id = report.id.replace(/[^a-zA-Z0-9_-]/g, '') || `meta_${Date.now()}`;
    const ref = doc(db, 'workspaces', workspaceId, 'metaReports', id);
    batch.set(ref, {
      ...toMetaReportDoc(report, ownerId, workspaceId),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  for (const log of state.marketingLogs) {
    const id = log.id.replace(/[^a-zA-Z0-9_-]/g, '') || `mlog_${Date.now()}`;
    const ref = doc(db, 'workspaces', workspaceId, 'marketingLogs', id);
    batch.set(ref, {
      ...toMarketingLogDoc(log, ownerId, workspaceId),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  for (const fid of state.fidelizaciones || []) {
    const id = fid.id.replace(/[^a-zA-Z0-9_-]/g, '') || `fid_${Date.now()}`;
    const ref = doc(db, 'workspaces', workspaceId, 'fidelizaciones', id);
    batch.set(ref, {
      ...toFidelizacionDoc(fid, ownerId, workspaceId),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  for (const act of state.companyActivities || []) {
    const id = act.id.replace(/[^a-zA-Z0-9_-]/g, '') || `act_${Date.now()}`;
    const ref = doc(db, 'workspaces', workspaceId, 'companyActivities', id);
    batch.set(ref, {
      ...toCompanyActivityDoc(act, ownerId, workspaceId),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  for (const ev of state.cobranzaEvents || []) {
    const id = ev.id.replace(/[^a-zA-Z0-9_-]/g, '') || `cev_${Date.now()}`;
    const ref = doc(db, 'workspaces', workspaceId, 'cobranzaEvents', id);
    batch.set(ref, {
      ...toCobranzaEventDoc(ev, ownerId, workspaceId),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  for (const rst of state.cobranzaResets || []) {
    const id = rst.id.replace(/[^a-zA-Z0-9_-]/g, '') || `rst_${Date.now()}`;
    const ref = doc(db, 'workspaces', workspaceId, 'cobranzaResets', id);
    batch.set(ref, {
      ...toCobranzaResetDoc(rst, ownerId, workspaceId),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `workspaces/${workspaceId}`);
  }
}

export async function upsertEntityInFirestore(
  user: User,
  colName:
    | 'companies'
    | 'tasks'
    | 'planTasks'
    | 'payments'
    | 'metaReports'
    | 'marketingLogs'
    | 'fidelizaciones'
    | 'companyActivities'
    | 'cobranzaEvents'
    | 'cobranzaResets',
  id: string,
  entity:
    | Company
    | WeeklyTask
    | PlanTask
    | PaymentRecord
    | MetaReport
    | MarketingLog
    | FidelizacionRecord
    | CompanyActivityRecord
    | CobranzaEvent
    | CobranzaResetRecord
): Promise<void> {
  const workspaceId = user.uid;
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  const docPath = `workspaces/${workspaceId}/${colName}/${safeId}`;
  const ref = doc(db, 'workspaces', workspaceId, colName, safeId);

  let payload: Record<string, unknown>;
  if (colName === 'companies') payload = toCompanyDoc(entity as Company, user.uid, workspaceId);
  else if (colName === 'tasks') payload = toTaskDoc(entity as WeeklyTask, user.uid, workspaceId);
  else if (colName === 'planTasks') payload = toPlanTaskDoc(entity as PlanTask, user.uid, workspaceId);
  else if (colName === 'payments') payload = toPaymentDoc(entity as PaymentRecord, user.uid, workspaceId);
  else if (colName === 'metaReports') payload = toMetaReportDoc(entity as MetaReport, user.uid, workspaceId);
  else if (colName === 'fidelizaciones') payload = toFidelizacionDoc(entity as FidelizacionRecord, user.uid, workspaceId);
  else if (colName === 'companyActivities') payload = toCompanyActivityDoc(entity as CompanyActivityRecord, user.uid, workspaceId);
  else if (colName === 'cobranzaEvents') payload = toCobranzaEventDoc(entity as CobranzaEvent, user.uid, workspaceId);
  else if (colName === 'cobranzaResets') payload = toCobranzaResetDoc(entity as CobranzaResetRecord, user.uid, workspaceId);
  else payload = toMarketingLogDoc(entity as MarketingLog, user.uid, workspaceId);

  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      const existingData = existingSnap.data();
      await setDoc(ref, {
        ...payload,
        createdAt: existingData.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteEntityInFirestore(
  user: User,
  colName:
    | 'companies'
    | 'tasks'
    | 'planTasks'
    | 'payments'
    | 'metaReports'
    | 'marketingLogs'
    | 'fidelizaciones'
    | 'companyActivities'
    | 'cobranzaEvents'
    | 'cobranzaResets',
  id: string
): Promise<void> {
  const workspaceId = user.uid;
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  const docPath = `workspaces/${workspaceId}/${colName}/${safeId}`;
  try {
    await deleteDoc(doc(db, 'workspaces', workspaceId, colName, safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export function subscribeWorkspace(
  user: User,
  callbacks: {
    onCompanies: (items: Company[]) => void;
    onTasks: (items: WeeklyTask[]) => void;
    onPlanTasks: (items: PlanTask[]) => void;
    onPayments: (items: PaymentRecord[]) => void;
    onMetaReports: (items: MetaReport[]) => void;
    onMarketingLogs: (items: MarketingLog[]) => void;
    onFidelizaciones: (items: FidelizacionRecord[]) => void;
    onCompanyActivities: (items: CompanyActivityRecord[]) => void;
    onCobranzaEvents: (items: CobranzaEvent[]) => void;
    onCobranzaResets: (items: CobranzaResetRecord[]) => void;
  }
): () => void {
  const workspaceId = user.uid;
  const unsubs: Array<() => void> = [];

  const sub = <T extends { id: string }>(
    colName:
      | 'companies'
      | 'tasks'
      | 'planTasks'
      | 'payments'
      | 'metaReports'
      | 'marketingLogs'
      | 'fidelizaciones'
      | 'companyActivities'
      | 'cobranzaEvents'
      | 'cobranzaResets',
    handler: (items: T[]) => void
  ) => {
    const path = `workspaces/${workspaceId}/${colName}`;
    const q = query(collection(db, 'workspaces', workspaceId, colName), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ ...(d.data() as Omit<T, 'id'>), id: d.id }) as T);
        handler(rows);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
    unsubs.push(unsub);
  };

  sub<Company>('companies', callbacks.onCompanies);
  sub<WeeklyTask>('tasks', callbacks.onTasks);
  sub<PlanTask>('planTasks', callbacks.onPlanTasks);
  sub<PaymentRecord>('payments', callbacks.onPayments);
  sub<MetaReport>('metaReports', callbacks.onMetaReports);
  sub<MarketingLog>('marketingLogs', callbacks.onMarketingLogs);
  sub<FidelizacionRecord>('fidelizaciones', callbacks.onFidelizaciones);
  sub<CompanyActivityRecord>('companyActivities', callbacks.onCompanyActivities);
  sub<CobranzaEvent>('cobranzaEvents', callbacks.onCobranzaEvents);
  sub<CobranzaResetRecord>('cobranzaResets', callbacks.onCobranzaResets);

  return () => {
    unsubs.forEach((u) => u());
  };
}
