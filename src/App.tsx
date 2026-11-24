import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  Building2,
  Database,
  Kanban,
  LayoutDashboard,
  Lock,
  Megaphone,
  Menu,
  Plus,
  Receipt,
  X,
} from 'lucide-react';
import {
  COMPANY_STATUS_OPTIONS,
  TEAM_PROFILES,
  type BonusTicketState,
  type CobranzaEvent,
  type CobranzaResetItem,
  type CobranzaResetRecord,
  type Company,
  type CompanyActivityRecord,
  type CompanyStatus,
  type FidelizacionRecord,
  type MarketingLog,
  type MetaReport,
  type PaymentRecord,
  type PaymentStatus,
  type PlanTask,
  type TeamMember,
  type ViewId,
  type WeeklyTask,
} from './types';
import { CURRENT_PERIOD, SEED_DATA } from './data/seedData';
import { daysOverdue, formatPeriodLabel, sanitizeFirestoreId } from './utils/calculations';
import {
  auth,
  deleteEntityInFirestore,
  ensureUserWorkspace,
  pushStateToFirestore,
  signInWithGoogleTeam,
  signOutTeam,
  subscribeWorkspace,
  upsertEntityInFirestore,
} from './lib/firebase';
import { PinGate } from './components/PinGate';
import { CompanyModal } from './components/CompanyModal';
import { ExecutiveReportModal } from './components/ExecutiveReportModal';
import { DashboardView } from './views/DashboardView';
import { PlanificacionView } from './views/PlanificacionView';
import { EmpresasView } from './views/EmpresasView';
import { CobranzasView } from './views/CobranzasView';
import { MarketingView } from './views/MarketingView';
import { DatosCloudView } from './views/DatosCloudView';
import { normalizePlanTask } from './utils/planHelpers';

const STORAGE_KEY = 'bonusticket_hub_state_v1';
const SESSION_KEY = 'bonusticket_unlocked_member_v1';
const AUTO_RESET_MONTH_KEY = 'bonusticket_cobranza_last_month_v1';

const NAV_ITEMS: Array<{ id: ViewId; label: string; sector: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Dashboard Principal', sector: 'Dirección · Ramiro', icon: LayoutDashboard },
  { id: 'planificacion', label: 'Planificación Semanal', sector: 'Reuniones de Lunes', icon: Kanban },
  { id: 'empresas', label: 'Empresas y Mapa', sector: 'Comercial · Miguel', icon: Building2 },
  { id: 'cobranzas', label: 'Cobranzas', sector: 'Facturación · Nahuel', icon: Receipt },
  { id: 'marketing', label: 'Marketing y Meta', sector: 'Redes y Difusión', icon: Megaphone },
  { id: 'datos', label: 'Migración y Cloud', sector: 'Excel / Firestore', icon: Database },
];

function loadInitialState(): BonusTicketState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_DATA;
    const parsed = JSON.parse(raw) as Partial<BonusTicketState>;
    if (!Array.isArray(parsed.companies)) return SEED_DATA;
    return {
      companies: parsed.companies,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : SEED_DATA.tasks,
      planTasks: Array.isArray(parsed.planTasks)
        ? parsed.planTasks.map((t) => normalizePlanTask(t))
        : SEED_DATA.planTasks,
      payments: Array.isArray(parsed.payments) ? parsed.payments : SEED_DATA.payments,
      metaReports: Array.isArray(parsed.metaReports) ? parsed.metaReports : SEED_DATA.metaReports,
      marketingLogs: Array.isArray(parsed.marketingLogs)
        ? parsed.marketingLogs
        : SEED_DATA.marketingLogs,
      fidelizaciones: Array.isArray(parsed.fidelizaciones)
        ? parsed.fidelizaciones
        : SEED_DATA.fidelizaciones,
      companyActivities: Array.isArray(parsed.companyActivities)
        ? parsed.companyActivities
        : SEED_DATA.companyActivities,
      cobranzaEvents: Array.isArray(parsed.cobranzaEvents)
        ? parsed.cobranzaEvents
        : SEED_DATA.cobranzaEvents,
      cobranzaResets: Array.isArray(parsed.cobranzaResets)
        ? parsed.cobranzaResets
        : SEED_DATA.cobranzaResets,
    };
  } catch {
    return SEED_DATA;
  }
}

export default function App() {
  const [unlockedMember, setUnlockedMember] = useState<TeamMember | null>(() => {
    const saved = sessionStorage.getItem(SESSION_KEY) as TeamMember | null;
    return saved || null;
  });

  const [activeView, setActiveView] = useState<ViewId>('dashboard');
  const [activePeriod, setActivePeriod] = useState<string>(CURRENT_PERIOD);
  const [state, setState] = useState<BonusTicketState>(loadInitialState);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Modals
  const [newCompanyModal, setNewCompanyModal] = useState<{
    open: boolean;
    defaultStatus: CompanyStatus;
  }>({ open: false, defaultStatus: 'Prospecto' });
  const [reportModalOpen, setReportModalOpen] = useState(false);

  // Google Maps Quota Banner (Case A Demo Key)
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  // Firebase Auth & Live Sync
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [cloudSyncActive, setCloudSyncActive] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState('');

  // Automatic start-of-month reset notice
  const [autoResetNotice, setAutoResetNotice] = useState('');

  // Persist local state automatically
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }, [state]);

  // Automatic Start-of-Month Reset: when a new calendar month begins, archive closing month to cobranzaResets and reset new month to $0
  useEffect(() => {
    const checkMonthlyAutoReset = () => {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      let lastMonth: string | null = null;
      try {
        lastMonth = localStorage.getItem(AUTO_RESET_MONTH_KEY);
      } catch {
        return;
      }

      if (!lastMonth) {
        try {
          localStorage.setItem(AUTO_RESET_MONTH_KEY, currentMonth);
        } catch {
          // Ignore storage error
        }
        return;
      }

      if (currentMonth <= lastMonth) return;

      try {
        localStorage.setItem(AUTO_RESET_MONTH_KEY, currentMonth);
      } catch {
        // Ignore storage error
      }

      const closingPeriod = lastMonth;
      const fechaIso = now.toISOString().slice(0, 10);
      const horaStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      setState((prev) => {
        const activeCos = prev.companies.filter((c) => c.estado === 'Activa');
        const items: CobranzaResetItem[] = activeCos.map((company) => {
          const payment = prev.payments.find(
            (p) => p.empresaId === company.id && p.periodo === closingPeriod
          );
          const isFacturada = Boolean(payment && (payment.facturada || payment.montoFacturado > 0));
          const facturado = isFacturada ? payment?.montoFacturado ?? 0 : 0;
          const cobrado = payment?.montoCobrado ?? 0;
          const retenciones = payment?.retenciones ?? 0;
          const saldo = Math.max(0, facturado - cobrado - retenciones);
          const fechaPrevista = payment?.fechaVencimiento || `${closingPeriod}-20`;
          let estado: PaymentStatus = 'Pendiente';
          if (facturado > 0 && saldo <= 0) estado = 'Al día';
          else if (cobrado + retenciones > 0 && saldo > 0) estado = 'Parcial';
          else if (saldo > 0 && daysOverdue(fechaPrevista) > 0) estado = 'Vencida';

          return {
            paymentId: payment?.id || '',
            empresaId: company.id,
            empresaNombre: company.nombre,
            cuit: company.cuit || '',
            empleados: company.empleados,
            precioIndividual: company.precioIndividual,
            montoFacturado: facturado,
            montoCobrado: cobrado,
            retenciones,
            saldoPendiente: saldo,
            estado,
            fechaPago: payment?.fechaPago || '',
            fechaVencimiento: fechaPrevista,
            numeroFactura: payment?.numeroFactura || '',
            medioPago: payment?.medioPago || 'Transferencia Bancaria',
            observaciones: payment?.observaciones || '',
            marcadoFacturar: Boolean(payment?.marcadoFacturar),
            facturada: isFacturada,
            fechaFacturacion: payment?.fechaFacturacion || '',
            loteId: payment?.loteId || '',
          };
        });

        const snapshot: CobranzaResetRecord = {
          id: sanitizeFirestoreId('rst'),
          periodo: closingPeriod,
          fecha: fechaIso,
          hora: horaStr,
          motivo: `Reseteo automático de inicio de mes (${formatPeriodLabel(closingPeriod)} → ${formatPeriodLabel(currentMonth)})`,
          totalClientes: items.length,
          totalFacturado: items.reduce((s, i) => s + i.montoFacturado, 0),
          totalCobrado: items.reduce((s, i) => s + i.montoCobrado, 0),
          totalRetenciones: items.reduce((s, i) => s + i.retenciones, 0),
          totalSaldoPendiente: items.reduce((s, i) => s + i.saldoPendiente, 0),
          pagadas: items.filter((i) => i.estado === 'Al día').length,
          parciales: items.filter((i) => i.estado === 'Parcial').length,
          vencidas: items.filter((i) => i.estado === 'Vencida').length,
          items,
        };

        // Initialize fresh $0 unbilled records for the new month
        const existingNewMonthIds = new Set(
          prev.payments.filter((p) => p.periodo === currentMonth).map((p) => p.empresaId)
        );
        const newMonthPayments: PaymentRecord[] = activeCos
          .filter((c) => !existingNewMonthIds.has(c.id))
          .map((c) => ({
            id: sanitizeFirestoreId('pay'),
            empresaId: c.id,
            periodo: currentMonth,
            montoFacturado: 0,
            montoCobrado: 0,
            retenciones: 0,
            estado: 'Pendiente' as PaymentStatus,
            fechaPago: '',
            fechaVencimiento: `${currentMonth}-20`,
            numeroFactura: '',
            medioPago: 'Transferencia Bancaria',
            observaciones: '',
            marcadoFacturar: false,
            facturada: false,
            fechaFacturacion: '',
            loteId: '',
          }));

        if (firebaseUser && cloudSyncActive) {
          void upsertEntityInFirestore(firebaseUser, 'cobranzaResets', snapshot.id, snapshot).catch(
            (err) => console.error('Error sincronizando reseteo automático:', err)
          );
          newMonthPayments.forEach((p) => {
            void upsertEntityInFirestore(firebaseUser, 'payments', p.id, p).catch((err) =>
              console.error('Error sincronizando período inicializado:', err)
            );
          });
        }

        return {
          ...prev,
          payments: [...newMonthPayments, ...prev.payments],
          cobranzaResets: [snapshot, ...(prev.cobranzaResets || [])],
        };
      });

      setActivePeriod(currentMonth);
      setAutoResetNotice(
        `Inicio de mes automático: ${formatPeriodLabel(closingPeriod)} se archivó en Historial reseteos y ${formatPeriodLabel(currentMonth)} comenzó en $0.`
      );
    };

    checkMonthlyAutoReset();
    const timer = window.setInterval(checkMonthlyAutoReset, 60_000);
    return () => window.clearInterval(timer);
  }, [firebaseUser, cloudSyncActive]);

  // Listen for Google Maps Platform quota events
  useEffect(() => {
    const handler = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  // Listen for Firebase Auth state & attach Firestore real-time sync when signed in
  useEffect(() => {
    let unsubWorkspace: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (unsubWorkspace) {
        unsubWorkspace();
        unsubWorkspace = null;
      }
      if (!user) {
        setCloudSyncActive(false);
        return;
      }
      try {
        await ensureUserWorkspace(user);
        setCloudSyncActive(true);
        setCloudError('');
        unsubWorkspace = subscribeWorkspace(user, {
          onCompanies: (companies) => {
            if (companies.length > 0) setState((prev) => ({ ...prev, companies }));
          },
          onTasks: (tasks) => {
            if (tasks.length > 0) setState((prev) => ({ ...prev, tasks }));
          },
          onPlanTasks: (planTasks) => {
            if (planTasks.length > 0) {
              setState((prev) => ({
                ...prev,
                planTasks: planTasks.map((t) => normalizePlanTask(t)),
              }));
            }
          },
          onPayments: (payments) => {
            if (payments.length > 0) setState((prev) => ({ ...prev, payments }));
          },
          onMetaReports: (metaReports) => {
            if (metaReports.length > 0) setState((prev) => ({ ...prev, metaReports }));
          },
          onMarketingLogs: (marketingLogs) => {
            if (marketingLogs.length > 0) setState((prev) => ({ ...prev, marketingLogs }));
          },
          onFidelizaciones: (fidelizaciones) => {
            if (fidelizaciones.length > 0) setState((prev) => ({ ...prev, fidelizaciones }));
          },
          onCompanyActivities: (companyActivities) => {
            if (companyActivities.length > 0) {
              setState((prev) => ({ ...prev, companyActivities }));
            }
          },
          onCobranzaEvents: (cobranzaEvents) => {
            if (cobranzaEvents.length > 0) {
              setState((prev) => ({ ...prev, cobranzaEvents }));
            }
          },
          onCobranzaResets: (cobranzaResets) => {
            if (cobranzaResets.length > 0) {
              setState((prev) => ({ ...prev, cobranzaResets }));
            }
          },
        });
      } catch (err: unknown) {
        setCloudSyncActive(false);
        setCloudError(err instanceof Error ? err.message : 'No se pudo conectar a Firestore.');
      }
    });

    return () => {
      unsubAuth();
      if (unsubWorkspace) unsubWorkspace();
    };
  }, []);

  const syncUpsert = (
    col:
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
    item:
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
  ) => {
    if (firebaseUser && cloudSyncActive) {
      void upsertEntityInFirestore(firebaseUser, col, item.id, item).catch((err) => {
        console.error('Error sincronizando en Firestore:', err);
      });
    }
  };

  const syncDelete = (
    col:
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
  ) => {
    if (firebaseUser && cloudSyncActive) {
      void deleteEntityInFirestore(firebaseUser, col, id).catch((err) => {
        console.error('Error eliminando en Firestore:', err);
      });
    }
  };

  // Handlers
  const handleUnlock = (member: TeamMember) => {
    setUnlockedMember(member);
    sessionStorage.setItem(SESSION_KEY, member);
    if (member === 'Miguel') setActiveView('empresas');
    else if (member === 'Nahuel') setActiveView('cobranzas');
    else if (member === 'Marketing') setActiveView('marketing');
    else setActiveView('dashboard');
  };

  const handleLock = () => {
    setUnlockedMember(null);
    sessionStorage.removeItem(SESSION_KEY);
  };

  const getCompanyStatusLabel = (status: CompanyStatus) =>
    COMPANY_STATUS_OPTIONS.find((opt) => opt.value === status)?.label ?? status;

  const handleAddCompanyActivity = (activity: CompanyActivityRecord) => {
    setState((prev) => ({
      ...prev,
      companyActivities: [activity, ...(prev.companyActivities || [])],
    }));
    syncUpsert('companyActivities', activity);
  };

  const handleAddCompany = (company: Company) => {
    const activity: CompanyActivityRecord = {
      id: sanitizeFirestoreId('act'),
      empresaId: company.id,
      empresaNombre: company.nombre,
      tipo: 'Creación',
      fecha: new Date().toISOString().slice(0, 10),
      detalle: `Empresa creada en ${getCompanyStatusLabel(company.estado)} (${company.localidad}, ${company.empleados} empleados).`,
      estadoNuevo: company.estado,
    };
    setState((prev) => ({
      ...prev,
      companies: [company, ...prev.companies],
      companyActivities: [activity, ...(prev.companyActivities || [])],
    }));
    syncUpsert('companies', company);
    syncUpsert('companyActivities', activity);
  };

  const handleUpdateCompany = (company: Company) => {
    setState((prev) => ({
      ...prev,
      companies: prev.companies.map((c) => (c.id === company.id ? company : c)),
    }));
    syncUpsert('companies', company);
  };

  const handleDeleteCompany = (companyId: string) => {
    const target = state.companies.find((c) => c.id === companyId);
    const activity: CompanyActivityRecord | null = target
      ? {
          id: sanitizeFirestoreId('act'),
          empresaId: target.id,
          empresaNombre: target.nombre,
          tipo: 'Eliminación',
          fecha: new Date().toISOString().slice(0, 10),
          detalle: `Empresa eliminada definitivamente del sistema (estaba en ${getCompanyStatusLabel(target.estado)}).`,
          estadoAnterior: target.estado,
        }
      : null;

    setState((prev) => ({
      ...prev,
      companies: prev.companies.filter((c) => c.id !== companyId),
      companyActivities: activity
        ? [activity, ...(prev.companyActivities || [])]
        : prev.companyActivities || [],
    }));
    syncDelete('companies', companyId);
    if (activity) syncUpsert('companyActivities', activity);
  };

  const handleAddTask = (task: WeeklyTask) => {
    setState((prev) => ({ ...prev, tasks: [task, ...prev.tasks] }));
    syncUpsert('tasks', task);
  };

  const handleUpdateTask = (task: WeeklyTask) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === task.id ? task : t)),
    }));
    syncUpsert('tasks', task);
  };

  const handleDeleteTask = (taskId: string) => {
    setState((prev) => ({ ...prev, tasks: prev.tasks.filter((t) => t.id !== taskId) }));
    syncDelete('tasks', taskId);
  };

  const handleAddPlanTask = (task: PlanTask) => {
    setState((prev) => ({ ...prev, planTasks: [task, ...prev.planTasks] }));
    syncUpsert('planTasks', task);
  };

  const handleUpdatePlanTask = (task: PlanTask) => {
    setState((prev) => ({
      ...prev,
      planTasks: prev.planTasks.map((t) => (t.id === task.id ? task : t)),
    }));
    syncUpsert('planTasks', task);
  };

  const handleDeletePlanTask = (taskId: string) => {
    setState((prev) => ({ ...prev, planTasks: prev.planTasks.filter((t) => t.id !== taskId) }));
    syncDelete('planTasks', taskId);
  };

  const handleSavePayment = (payment: PaymentRecord) => {
    setState((prev) => {
      const exists = prev.payments.some((p) => p.id === payment.id);
      return {
        ...prev,
        payments: exists
          ? prev.payments.map((p) => (p.id === payment.id ? payment : p))
          : [payment, ...prev.payments],
      };
    });
    syncUpsert('payments', payment);
  };

  const handleDeletePayment = (paymentId: string) => {
    setState((prev) => ({
      ...prev,
      payments: prev.payments.filter((p) => p.id !== paymentId),
    }));
    syncDelete('payments', paymentId);
  };

  const handleAddCobranzaEvent = (event: CobranzaEvent) => {
    setState((prev) => ({
      ...prev,
      cobranzaEvents: [event, ...(prev.cobranzaEvents || [])],
    }));
    syncUpsert('cobranzaEvents', event);
  };

  const handleUpdateCobranzaEvent = (event: CobranzaEvent) => {
    setState((prev) => ({
      ...prev,
      cobranzaEvents: (prev.cobranzaEvents || []).map((ev) =>
        ev.id === event.id ? event : ev
      ),
    }));
    syncUpsert('cobranzaEvents', event);
  };

  const handleDeleteCobranzaEvent = (eventId: string) => {
    setState((prev) => ({
      ...prev,
      cobranzaEvents: (prev.cobranzaEvents || []).filter((ev) => ev.id !== eventId),
    }));
    syncDelete('cobranzaEvents', eventId);
  };

  const handleAddCobranzaReset = (record: CobranzaResetRecord) => {
    setState((prev) => ({
      ...prev,
      cobranzaResets: [record, ...(prev.cobranzaResets || [])],
    }));
    syncUpsert('cobranzaResets', record);
  };

  const handleDeleteCobranzaReset = (resetId: string) => {
    setState((prev) => ({
      ...prev,
      cobranzaResets: (prev.cobranzaResets || []).filter((r) => r.id !== resetId),
    }));
    syncDelete('cobranzaResets', resetId);
  };

  const handleAddMetaReport = (report: MetaReport) => {
    setState((prev) => ({ ...prev, metaReports: [report, ...prev.metaReports] }));
    syncUpsert('metaReports', report);
  };

  const handleDeleteMetaReport = (id: string) => {
    setState((prev) => ({
      ...prev,
      metaReports: prev.metaReports.filter((r) => r.id !== id),
    }));
    syncDelete('metaReports', id);
  };

  const handleSaveMarketingLog = (log: MarketingLog) => {
    setState((prev) => {
      const exists = prev.marketingLogs.some((l) => l.id === log.id);
      return {
        ...prev,
        marketingLogs: exists
          ? prev.marketingLogs.map((l) => (l.id === log.id ? log : l))
          : [log, ...prev.marketingLogs],
      };
    });
    syncUpsert('marketingLogs', log);
  };

  const handleDeleteMarketingLog = (id: string) => {
    setState((prev) => ({
      ...prev,
      marketingLogs: prev.marketingLogs.filter((l) => l.id !== id),
    }));
    syncDelete('marketingLogs', id);
  };

  const handleAddFidelizacion = (item: FidelizacionRecord) => {
    setState((prev) => ({
      ...prev,
      fidelizaciones: [item, ...(prev.fidelizaciones || [])],
    }));
    syncUpsert('fidelizaciones', item);
  };

  const handleDeleteFidelizacion = (id: string) => {
    setState((prev) => ({
      ...prev,
      fidelizaciones: (prev.fidelizaciones || []).filter((f) => f.id !== id),
    }));
    syncDelete('fidelizaciones', id);
  };

  const handleSignInGoogle = async () => {
    setCloudBusy(true);
    setCloudError('');
    try {
      const user = await signInWithGoogleTeam();
      await pushStateToFirestore(user, state);
    } catch (err: unknown) {
      setCloudError(err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google.');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleSignOutGoogle = async () => {
    setCloudBusy(true);
    try {
      await signOutTeam();
    } finally {
      setCloudBusy(false);
    }
  };

  const handlePushLocalToCloud = async () => {
    if (!firebaseUser) return;
    setCloudBusy(true);
    setCloudError('');
    try {
      await pushStateToFirestore(firebaseUser, state);
    } catch (err: unknown) {
      setCloudError(err instanceof Error ? err.message : 'Error subiendo datos a Firestore.');
    } finally {
      setCloudBusy(false);
    }
  };

  if (!unlockedMember) {
    return (
      <>
        {mapsQuotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm flex items-center justify-center gap-3 sticky top-0 z-50 shadow-sm">
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 hover:text-amber-800"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
            <button
              type="button"
              onClick={() => setMapsQuotaExceeded(false)}
              aria-label="Cerrar aviso"
              className="p-1 text-amber-800 hover:text-amber-950 rounded shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <PinGate onUnlock={handleUnlock} />
      </>
    );
  }

  const currentNav = NAV_ITEMS.find((n) => n.id === activeView) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-[#F8F6F4] text-[#101014] flex flex-col">
      {/* Required Google Maps Platform Demo Quota Banner (Case A) */}
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm flex items-center justify-center gap-3 sticky top-0 z-50 shadow-sm no-print">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
          <button
            type="button"
            onClick={() => setMapsQuotaExceeded(false)}
            aria-label="Cerrar aviso"
            className="p-1 text-amber-800 hover:text-amber-950 rounded shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Desktop Dark Institutional Sidebar */}
        <aside className="hidden lg:flex lg:w-[264px] bg-[#101014] text-white flex-col justify-between shrink-0 no-print">
          <div>
            {/* Brand */}
            <div className="px-6 py-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#E52421] flex items-center justify-center font-extrabold text-white text-base tracking-tight shrink-0">
                  BT
                </div>
                <span className="font-bold text-lg tracking-tight text-white whitespace-nowrap">
                  Bonus Ticket
                </span>
              </div>
            </div>

            {/* 5 Views Navigation */}
            <nav className="p-3.5 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveView(item.id)}
                    className={`w-full text-left px-3.5 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                      isActive
                        ? 'bg-[#E52421] text-white'
                        : 'text-neutral-300 hover:bg-white/8 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold leading-tight truncate">
                        {item.label}
                      </div>
                      <div
                        className={`text-[11px] truncate mt-0.5 ${
                          isActive ? 'text-white/80' : 'text-neutral-400'
                        }`}
                      >
                        {item.sector}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Bottom: Quick User Switcher & Lock */}
          <div className="p-4 border-t border-white/10 space-y-3">
            <div>
              <label
                htmlFor="sidebar-user-select"
                className="block text-[11px] text-neutral-400 mb-1.5"
              >
                Usuario activo
              </label>
              <select
                id="sidebar-user-select"
                value={unlockedMember}
                onChange={(e) => {
                  const next = e.target.value as TeamMember;
                  setUnlockedMember(next);
                  sessionStorage.setItem(SESSION_KEY, next);
                }}
                className="w-full px-3 py-2 bg-white/10 border border-white/15 rounded-lg text-xs font-semibold text-white focus:outline-none"
              >
                {TEAM_PROFILES.map((p) => (
                  <option key={p.id} value={p.id} className="text-[#101014]">
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleLock}
              className="w-full py-2 px-3 text-xs text-neutral-400 hover:text-white hover:bg-white/8 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Cambiar PIN / Bloquear</span>
            </button>
          </div>
        </aside>

        {/* Mobile Drawer Sidebar */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div className="w-72 bg-[#101014] text-white flex flex-col justify-between p-4">
              <div>
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#E52421] flex items-center justify-center font-extrabold text-sm">
                      BT
                    </div>
                    <span className="font-bold text-base">Bonus Ticket</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1.5 text-neutral-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <nav className="space-y-1">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeView === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveView(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 ${
                          isActive ? 'bg-[#E52421] text-white' : 'text-neutral-300'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="text-sm font-semibold">{item.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="pt-4 border-t border-white/10 space-y-2.5">
                <select
                  value={unlockedMember}
                  onChange={(e) => setUnlockedMember(e.target.value as TeamMember)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/15 rounded-lg text-xs font-semibold text-white"
                >
                  {TEAM_PROFILES.map((p) => (
                    <option key={p.id} value={p.id} className="text-[#101014]">
                      {p.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleLock}
                  className="w-full py-2 text-xs text-neutral-400 hover:text-white flex items-center justify-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Bloquear acceso</span>
                </button>
              </div>
            </div>
            <div className="flex-1 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}

        {/* Main Workspace Viewport */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Clean 3-Zone Top Bar */}
          <header className="bg-white border-b border-neutral-200 px-5 lg:px-8 h-16 flex items-center justify-between gap-8 shrink-0 no-print">
            {/* Zone 1: Mobile Menu + Breadcrumb */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Abrir menú"
                className="lg:hidden p-2 -ml-2 text-[#101014] rounded-lg hover:bg-neutral-100"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 text-sm truncate">
                <span className="font-semibold text-neutral-400 hidden sm:inline whitespace-nowrap">
                  Bonus Ticket
                </span>
                <span className="text-neutral-300 hidden sm:inline" aria-hidden="true">
                  /
                </span>
                <span className="font-bold text-[#101014] truncate">{currentNav.label}</span>
              </div>
            </div>

            {/* Zone 2: Active Team Member Selector (clean single-line) */}
            <div className="hidden md:flex items-center gap-2 text-xs text-neutral-600 shrink-0">
              <span>Perfil activo:</span>
              <select
                aria-label="Cambiar perfil activo"
                value={unlockedMember}
                onChange={(e) => {
                  const next = e.target.value as TeamMember;
                  setUnlockedMember(next);
                  sessionStorage.setItem(SESSION_KEY, next);
                }}
                className="px-2.5 py-1.5 bg-[#F8F6F4] border border-neutral-200 rounded-md font-semibold text-[#101014] text-xs"
              >
                {TEAM_PROFILES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Zone 3: 1 Primary Contextual Action */}
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => setNewCompanyModal({ open: true, defaultStatus: 'Prospecto' })}
                className="px-4 py-2 bg-[#E52421] hover:bg-[#C91D1A] text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Nueva Empresa</span>
              </button>
            </div>
          </header>

          {/* Main Content Container */}
          <main className="flex-1 p-5 lg:p-8 max-w-[1440px] w-full mx-auto">
            {activeView === 'dashboard' && (
              <DashboardView
                state={state}
                activePeriod={activePeriod}
                onChangePeriod={setActivePeriod}
                onOpenExecutiveReport={() => setReportModalOpen(true)}
                onNavigate={setActiveView}
              />
            )}

            {activeView === 'planificacion' && (
              <PlanificacionView
                planTasks={state.planTasks}
                companies={state.companies}
                activeMember={unlockedMember}
                onAddPlanTask={handleAddPlanTask}
                onUpdatePlanTask={handleUpdatePlanTask}
                onDeletePlanTask={handleDeletePlanTask}
              />
            )}

            {activeView === 'empresas' && (
              <EmpresasView
                companies={state.companies}
                fidelizaciones={state.fidelizaciones || []}
                companyActivities={state.companyActivities || []}
                onUpdateCompany={handleUpdateCompany}
                onDeleteCompany={handleDeleteCompany}
                onOpenNewCompany={(defaultStatus) =>
                  setNewCompanyModal({ open: true, defaultStatus })
                }
                onAddPlanTask={handleAddPlanTask}
                onAddFidelizacion={handleAddFidelizacion}
                onDeleteFidelizacion={handleDeleteFidelizacion}
                onAddCompanyActivity={handleAddCompanyActivity}
              />
            )}

            {activeView === 'cobranzas' && (
              <CobranzasView
                companies={state.companies}
                payments={state.payments}
                cobranzaEvents={state.cobranzaEvents || []}
                cobranzaResets={state.cobranzaResets || []}
                fullState={state}
                activePeriod={activePeriod}
                autoResetNotice={autoResetNotice}
                onDismissAutoResetNotice={() => setAutoResetNotice('')}
                onChangePeriod={setActivePeriod}
                onSavePayment={handleSavePayment}
                onDeletePayment={handleDeletePayment}
                onUpdateCompany={handleUpdateCompany}
                onAddPlanTask={handleAddPlanTask}
                onAddCobranzaEvent={handleAddCobranzaEvent}
                onUpdateCobranzaEvent={handleUpdateCobranzaEvent}
                onDeleteCobranzaEvent={handleDeleteCobranzaEvent}
                onAddCobranzaReset={handleAddCobranzaReset}
                onDeleteCobranzaReset={handleDeleteCobranzaReset}
                onRestoreState={(nextState) => setState(nextState)}
                onResetSeedData={() => setState(SEED_DATA)}
              />
            )}

            {activeView === 'marketing' && (
              <MarketingView
                companies={state.companies}
                metaReports={state.metaReports}
                marketingLogs={state.marketingLogs}
                onAddMetaReport={handleAddMetaReport}
                onDeleteMetaReport={handleDeleteMetaReport}
                onSaveMarketingLog={handleSaveMarketingLog}
                onDeleteMarketingLog={handleDeleteMarketingLog}
                onAddPlanTask={handleAddPlanTask}
              />
            )}

            {activeView === 'datos' && (
              <DatosCloudView
                state={state}
                firebaseUser={firebaseUser}
                cloudSyncActive={cloudSyncActive}
                cloudBusy={cloudBusy}
                cloudError={cloudError}
                onSignInGoogle={handleSignInGoogle}
                onSignOutGoogle={handleSignOutGoogle}
                onPushLocalToCloud={handlePushLocalToCloud}
                onBulkImportCompanies={(newCompanies) => {
                  setState((prev) => ({
                    ...prev,
                    companies: [...newCompanies, ...prev.companies],
                  }));
                  newCompanies.forEach((c) => syncUpsert('companies', c));
                }}
                onBulkImportPayments={(newPayments) => {
                  setState((prev) => ({
                    ...prev,
                    payments: [...newPayments, ...prev.payments],
                  }));
                  newPayments.forEach((p) => syncUpsert('payments', p));
                }}
                onRestoreState={(nextState) => setState(nextState)}
                onResetSeedData={() => setState(SEED_DATA)}
                onClearAllData={() =>
                  setState({
                    companies: [],
                    tasks: [],
                    planTasks: [],
                    payments: [],
                    metaReports: [],
                    marketingLogs: [],
                    fidelizaciones: [],
                    companyActivities: [],
                    cobranzaEvents: [],
                    cobranzaResets: [],
                  })
                }
              />
            )}
          </main>
        </div>
      </div>

      {/* Global Modals */}
      <CompanyModal
        open={newCompanyModal.open}
        defaultStatus={newCompanyModal.defaultStatus}
        onClose={() => setNewCompanyModal((prev) => ({ ...prev, open: false }))}
        onSave={handleAddCompany}
      />

      <ExecutiveReportModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        state={state}
      />
    </div>
  );
}
