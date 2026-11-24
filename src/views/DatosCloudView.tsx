import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type { User } from 'firebase/auth';
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  Download,
  FileSpreadsheet,
  LogOut,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  TUCUMAN_LOCALIDADES,
  type BonusTicketState,
  type Company,
  type PaymentRecord,
} from '../types';
import { provisionedFirebaseConfig } from '../lib/firebase';
import { CURRENT_PERIOD } from '../data/seedData';
import { sanitizeFirestoreId } from '../utils/calculations';
import { exportDashboardConsolidatedExcel, normalizePlanTask } from '../utils/planHelpers';

interface DatosCloudViewProps {
  state: BonusTicketState;
  firebaseUser: User | null;
  cloudSyncActive: boolean;
  cloudBusy: boolean;
  cloudError: string;
  onSignInGoogle: () => Promise<void>;
  onSignOutGoogle: () => Promise<void>;
  onPushLocalToCloud: () => Promise<void>;
  onBulkImportCompanies: (companies: Company[]) => void;
  onBulkImportPayments: (payments: PaymentRecord[]) => void;
  onRestoreState: (nextState: BonusTicketState) => void;
  onResetSeedData: () => void;
  onClearAllData: () => void;
}

const CUSTOM_CONFIG_KEY = 'bonusticket_custom_firebase_config';

const COMPANY_FIELDS = [
  { key: 'nombre', label: 'Nombre Empresa *' },
  { key: 'estado', label: 'Estado (Activa / Prospecto)' },
  { key: 'localidad', label: 'Localidad Tucumán' },
  { key: 'empleados', label: 'Cantidad de Empleados' },
  { key: 'contactoPrincipal', label: 'Contacto Principal' },
  { key: 'telefonoPrincipal', label: 'Teléfono' },
  { key: 'mailDifusion', label: 'Mail Difusión' },
  { key: 'precioIndividual', label: 'Precio Individual ($)' },
  { key: 'fechaProximoAumento', label: 'Fecha Próximo Aumento' },
] as const;

const PAYMENT_FIELDS = [
  { key: 'empresaNombre', label: 'Nombre Empresa *' },
  { key: 'periodo', label: 'Período (YYYY-MM)' },
  { key: 'montoFacturado', label: 'Monto Facturado ($)' },
  { key: 'montoCobrado', label: 'Monto Cobrado ($)' },
  { key: 'retenciones', label: 'Retenciones ($)' },
  { key: 'estado', label: 'Estado (Al día / Pendiente / Vencida)' },
  { key: 'numeroFactura', label: 'Número de Factura' },
] as const;

function autoGuessMapping(
  headers: string[],
  targetType: 'companies' | 'payments'
): Record<string, string> {
  const map: Record<string, string> = {};
  const lowerHeaders = headers.map((h) => ({ raw: h, norm: h.toLowerCase().trim() }));

  const findMatch = (keywords: string[]): string => {
    const found = lowerHeaders.find((h) => keywords.some((kw) => h.norm.includes(kw)));
    return found ? found.raw : '';
  };

  if (targetType === 'companies') {
    map.nombre = findMatch(['empresa', 'razon', 'razón', 'nombre', 'cliente']);
    map.estado = findMatch(['estado', 'status']);
    map.localidad = findMatch(['localidad', 'ciudad', 'zona']);
    map.empleados = findMatch(['empleado', 'personal', 'nomina', 'nómina', 'cant']);
    map.contactoPrincipal = findMatch(['contacto', 'referente', 'responsable']);
    map.telefonoPrincipal = findMatch(['tel', 'cel', 'whatsapp']);
    map.mailDifusion = findMatch(['mail', 'correo', 'email']);
    map.precioIndividual = findMatch(['precio', 'unitario', 'tarifa', 'valor']);
    map.fechaProximoAumento = findMatch(['aumento', 'actualiz']);
  } else {
    map.empresaNombre = findMatch(['empresa', 'cliente', 'razon', 'nombre']);
    map.periodo = findMatch(['periodo', 'período', 'mes']);
    map.montoFacturado = findMatch(['facturado', 'total', 'importe', 'monto']);
    map.montoCobrado = findMatch(['cobrado', 'pagado', 'recibido']);
    map.retenciones = findMatch(['retencion', 'retención', 'iibb']);
    map.estado = findMatch(['estado', 'status']);
    map.numeroFactura = findMatch(['factura', 'comprobante', 'nro']);
  }
  return map;
}

export const DatosCloudView: React.FC<DatosCloudViewProps> = ({
  state,
  firebaseUser,
  cloudSyncActive,
  cloudBusy,
  cloudError,
  onSignInGoogle,
  onSignOutGoogle,
  onPushLocalToCloud,
  onBulkImportCompanies,
  onBulkImportPayments,
  onRestoreState,
  onResetSeedData,
  onClearAllData,
}) => {
  // Excel/CSV Migration State
  const [importTarget, setImportTarget] = useState<'companies' | 'payments'>('companies');
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [sheetRows, setSheetRows] = useState<Array<Record<string, unknown>>>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [importMessage, setImportMessage] = useState('');

  // Custom Firebase Config State
  const [customConfigText, setCustomConfigText] = useState<string>(() => {
    const saved = localStorage.getItem(CUSTOM_CONFIG_KEY);
    if (saved) return saved;
    return JSON.stringify(
      {
        apiKey: provisionedFirebaseConfig.apiKey,
        authDomain: provisionedFirebaseConfig.authDomain,
        projectId: provisionedFirebaseConfig.projectId,
        storageBucket: provisionedFirebaseConfig.storageBucket,
        messagingSenderId: provisionedFirebaseConfig.messagingSenderId,
        appId: provisionedFirebaseConfig.appId,
      },
      null,
      2
    );
  });
  const [configFeedback, setConfigFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');

  const activeFields = importTarget === 'companies' ? COMPANY_FIELDS : PAYMENT_FIELDS;

  const handleSpreadsheetUpload = async (file: File | null) => {
    if (!file) return;
    setImportMessage('');
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
      if (rows.length === 0) {
        setImportMessage('La planilla está vacía.');
        return;
      }
      const headers = Object.keys(rows[0]);
      setSheetHeaders(headers);
      setSheetRows(rows);
      setColumnMap(autoGuessMapping(headers, importTarget));
      setImportMessage(`Planilla leída: ${rows.length} filas y ${headers.length} columnas detectadas.`);
    } catch (err: unknown) {
      setImportMessage(
        `No se pudo leer el archivo: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleExecuteImport = () => {
    if (sheetRows.length === 0) return;

    if (importTarget === 'companies') {
      const imported: Company[] = [];
      for (const row of sheetRows) {
        const nombre = String(row[columnMap.nombre] ?? '').trim();
        if (!nombre) continue;

        const rawEstado = String(row[columnMap.estado] ?? '').toLowerCase();
        const estado = rawEstado.includes('prosp') ? 'Prospecto' : 'Activa';
        const rawLoc = String(row[columnMap.localidad] ?? 'San Miguel de Tucumán').trim();
        const locObj =
          TUCUMAN_LOCALIDADES.find((l) => l.name.toLowerCase() === rawLoc.toLowerCase()) ||
          TUCUMAN_LOCALIDADES[0];

        imported.push({
          id: sanitizeFirestoreId('emp'),
          nombre,
          estado,
          localidad: locObj.name,
          direccion: `${locObj.name}, Tucumán`,
          lat: Number((locObj.lat + (Math.random() - 0.5) * 0.015).toFixed(5)),
          lng: Number((locObj.lng + (Math.random() - 0.5) * 0.015).toFixed(5)),
          empleados: Math.max(0, Math.round(Number(row[columnMap.empleados]) || 0)),
          contactoPrincipal: String(row[columnMap.contactoPrincipal] ?? '').trim(),
          telefonoPrincipal: String(row[columnMap.telefonoPrincipal] ?? '').trim(),
          contactoDifusion: '',
          mailDifusion: String(row[columnMap.mailDifusion] ?? '').trim(),
          linkBaseEmpleados: '',
          linkContrato: '',
          linkPropuesta: '',
          nivelFidelizacion: 'Difusión masiva WhatsApp/Email',
          contactoCobranza: '',
          telefonoCobro: '',
          mailCobro: '',
          precioIndividual: Math.max(0, Number(row[columnMap.precioIndividual]) || 1800),
          fechaProximoAumento: String(row[columnMap.fechaProximoAumento] ?? '2027-01-01').slice(0, 10),
          formulaAumento: 'porcentaje',
          valorAumento: 12,
        });
      }
      onBulkImportCompanies(imported);
      setImportMessage(`¡Listo! Se importaron ${imported.length} empresas a la Ficha Maestra.`);
      setSheetRows([]);
      setSheetHeaders([]);
    } else {
      const importedPayments: PaymentRecord[] = [];
      for (const row of sheetRows) {
        const empName = String(row[columnMap.empresaNombre] ?? '').trim();
        if (!empName) continue;
        const matchedCompany = state.companies.find(
          (c) => c.nombre.toLowerCase() === empName.toLowerCase()
        );
        const empresaId = matchedCompany?.id || state.companies[0]?.id || 'emp_sin_vincular';
        const rawPeriod = String(row[columnMap.periodo] ?? CURRENT_PERIOD).trim();
        const periodo = /^\d{4}-\d{2}$/.test(rawPeriod) ? rawPeriod : CURRENT_PERIOD;
        const rawEstado = String(row[columnMap.estado] ?? '').toLowerCase();
        const estado = rawEstado.includes('venc')
          ? 'Vencida'
          : rawEstado.includes('al d') || rawEstado.includes('pag')
          ? 'Al día'
          : 'Pendiente';

        importedPayments.push({
          id: sanitizeFirestoreId('pay'),
          empresaId,
          periodo,
          montoFacturado: Math.max(0, Number(row[columnMap.montoFacturado]) || 0),
          montoCobrado: Math.max(0, Number(row[columnMap.montoCobrado]) || 0),
          retenciones: Math.max(0, Number(row[columnMap.retenciones]) || 0),
          estado,
          fechaPago: estado === 'Al día' ? new Date().toISOString().slice(0, 10) : '',
          fechaVencimiento: `${periodo}-20`,
          numeroFactura: String(row[columnMap.numeroFactura] ?? '').trim(),
          medioPago: 'Transferencia Bancaria',
          observaciones: `Importado desde planilla (${empName})`,
        });
      }
      onBulkImportPayments(importedPayments);
      setImportMessage(`¡Listo! Se importaron ${importedPayments.length} registros de cobranza.`);
      setSheetRows([]);
      setSheetHeaders([]);
    }
  };

  const downloadTemplate = (type: 'companies' | 'payments') => {
    const sample =
      type === 'companies'
        ? [
            {
              Empresa: 'Metalúrgica Tucumán S.A.',
              Estado: 'Activa',
              Localidad: 'Banda del Río Salí',
              Empleados: 120,
              Contacto: 'Laura Díaz',
              Telefono: '3815123456',
              Mail: 'rrhh@metalurgicatuc.com.ar',
              Precio_Individual: 1950,
              Proximo_Aumento: '2027-01-01',
            },
          ]
        : [
            {
              Empresa: state.companies[0]?.nombre || 'Sanatorio Modelo Tucumán',
              Periodo: CURRENT_PERIOD,
              Facturado: 592000,
              Cobrado: 592000,
              Retenciones: 0,
              Estado: 'Al día',
              Factura: 'FC-A 0003-00001900',
            },
          ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type === 'companies' ? 'Empresas' : 'Cobranzas');
    XLSX.writeFile(
      wb,
      type === 'companies'
        ? 'Plantilla_Miguel_Empresas.xlsx'
        : 'Plantilla_Nahuel_Cobranzas.xlsx'
    );
  };

  const handleValidateCustomConfig = () => {
    try {
      const parsed = JSON.parse(customConfigText);
      const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
      const missing = required.filter((k) => !parsed[k]);
      if (missing.length > 0) {
        setConfigFeedback({
          ok: false,
          text: `Faltan claves obligatorias en firebaseConfig: ${missing.join(', ')}`,
        });
        return;
      }
      localStorage.setItem(CUSTOM_CONFIG_KEY, JSON.stringify(parsed, null, 2));
      setConfigFeedback({
        ok: true,
        text: `Configuración validada y guardada para el proyecto "${parsed.projectId}".`,
      });
    } catch {
      setConfigFeedback({
        ok: false,
        text: 'El texto pegado no es un JSON válido. Pegá el objeto firebaseConfig con claves entre comillas.',
      });
    }
  };

  const handleExportJsonBackup = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BonusTicket_Respaldo_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupMessage('Respaldo JSON descargado correctamente.');
  };

  const handleImportJsonBackup = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<BonusTicketState>;
      if (!Array.isArray(parsed.companies) || !Array.isArray(parsed.tasks)) {
        setBackupMessage('El archivo JSON no tiene el formato de respaldo de Bonus Ticket.');
        return;
      }
      onRestoreState({
        companies: parsed.companies,
        tasks: parsed.tasks,
        planTasks: Array.isArray(parsed.planTasks)
          ? parsed.planTasks.map((t) => normalizePlanTask(t))
          : [],
        payments: Array.isArray(parsed.payments) ? parsed.payments : [],
        metaReports: Array.isArray(parsed.metaReports) ? parsed.metaReports : [],
        marketingLogs: Array.isArray(parsed.marketingLogs) ? parsed.marketingLogs : [],
        fidelizaciones: Array.isArray(parsed.fidelizaciones) ? parsed.fidelizaciones : [],
        companyActivities: Array.isArray(parsed.companyActivities)
          ? parsed.companyActivities
          : [],
        cobranzaEvents: Array.isArray(parsed.cobranzaEvents) ? parsed.cobranzaEvents : [],
        cobranzaResets: Array.isArray(parsed.cobranzaResets) ? parsed.cobranzaResets : [],
      });
      setBackupMessage(`Respaldo restaurado: ${parsed.companies.length} empresas cargadas.`);
    } catch {
      setBackupMessage('No se pudo leer el archivo JSON de respaldo.');
    }
  };

  const previewRows = useMemo(() => sheetRows.slice(0, 5), [sheetRows]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-neutral-500 mb-1">
            Migración sin re-tipear + Sincronización en tiempo real entre los 4 integrantes
          </p>
          <h1 className="text-2xl font-bold text-[#101014] tracking-tight">
            Migración de Datos (Excel/CSV) y Base de Datos Cloud
          </h1>
        </div>
        <button
          type="button"
          onClick={() => exportDashboardConsolidatedExcel(state, CURRENT_PERIOD)}
          className="px-3.5 py-2 bg-white border border-neutral-200 hover:border-[#101014] text-[#101014] text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap self-start md:self-auto"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Reporte Excel</span>
        </button>
      </div>

      {/* PANEL 1: Importador Excel / CSV */}
      <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 bg-[#F8F6F4] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-[#E52421]" />
            <div>
              <h2 className="text-base font-bold text-[#101014]">
                Importador de Planillas Excel / CSV (Miguel y Nahuel)
              </h2>
              <p className="text-xs text-neutral-500">
                Subí planillas `.xlsx`, `.xls` o `.csv`, mapeá las columnas y cargá todo en bloque
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => downloadTemplate('companies')}
              className="px-3 py-1.5 bg-white border border-neutral-200 hover:border-[#101014] rounded-lg text-xs font-medium text-[#101014] flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Plantilla Empresas</span>
            </button>
            <button
              type="button"
              onClick={() => downloadTemplate('payments')}
              className="px-3 py-1.5 bg-white border border-neutral-200 hover:border-[#101014] rounded-lg text-xs font-medium text-[#101014] flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Plantilla Cobranzas</span>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-neutral-600">Destino de importación:</span>
            <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setImportTarget('companies');
                  if (sheetHeaders.length > 0) {
                    setColumnMap(autoGuessMapping(sheetHeaders, 'companies'));
                  }
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                  importTarget === 'companies'
                    ? 'bg-white text-[#101014] shadow-xs'
                    : 'text-neutral-600'
                }`}
              >
                Empresas (Miguel)
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportTarget('payments');
                  if (sheetHeaders.length > 0) {
                    setColumnMap(autoGuessMapping(sheetHeaders, 'payments'));
                  }
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                  importTarget === 'payments'
                    ? 'bg-white text-[#101014] shadow-xs'
                    : 'text-neutral-600'
                }`}
              >
                Cobranzas (Nahuel)
              </button>
            </div>
          </div>

          <label className="block border-2 border-dashed border-neutral-300 hover:border-[#E52421] rounded-xl p-7 text-center cursor-pointer transition-colors bg-[#F8F6F4]/60">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => void handleSpreadsheetUpload(e.target.files?.[0] ?? null)}
            />
            <Upload className="w-6 h-6 text-neutral-400 mx-auto mb-2" />
            <div className="text-sm font-semibold text-[#101014]">
              Elegí o arrastrá una planilla Excel (.xlsx / .xls) o CSV
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Procesamiento 100% local en tu navegador mediante SheetJS
            </p>
          </label>

          {importMessage && (
            <div className="text-xs font-medium text-[#101014] bg-[#F8F6F4] border border-neutral-200 rounded-lg px-4 py-2.5">
              {importMessage}
            </div>
          )}

          {sheetHeaders.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="text-xs font-bold text-[#101014]">
                Mapeo de columnas detectadas ({sheetRows.length} filas listas)
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                      {field.label}
                    </label>
                    <select
                      value={columnMap[field.key] || ''}
                      onChange={(e) =>
                        setColumnMap((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      className="w-full px-2.5 py-1.5 border border-neutral-300 rounded-lg text-xs bg-white"
                    >
                      <option value="">— No importar —</option>
                      {sheetHeaders.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview Table */}
              <div className="border border-neutral-200 rounded-lg overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8F6F4] border-b border-neutral-200">
                    <tr>
                      {sheetHeaders.slice(0, 6).map((h) => (
                        <th key={h} className="py-2 px-3 font-semibold text-neutral-600">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {previewRows.map((row, idx) => (
                      <tr key={idx}>
                        {sheetHeaders.slice(0, 6).map((h) => (
                          <td key={h} className="py-2 px-3 text-neutral-700 truncate max-w-[160px]">
                            {String(row[h] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleExecuteImport}
                  className="px-5 py-2.5 bg-[#E52421] hover:bg-[#C91D1A] text-white text-xs font-semibold rounded-lg"
                >
                  Importar {sheetRows.length} registros ahora
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* PANEL 2: Google Cloud Firestore Sync & firebaseConfig */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 bg-white border border-neutral-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold mb-1">
                {cloudSyncActive ? (
                  <>
                    <Cloud className="w-4 h-4 text-[#16A34A]" />
                    <span className="text-[#16A34A]">Sincronizado en tiempo real</span>
                  </>
                ) : (
                  <>
                    <CloudOff className="w-4 h-4 text-neutral-500" />
                    <span className="text-neutral-500">Modo local (listo para conectar Cloud)</span>
                  </>
                )}
              </div>
              <h2 className="text-base font-bold text-[#101014]">
                Google Cloud Firestore · Sincronización de Equipo
              </h2>
            </div>
          </div>

          <p className="text-xs text-neutral-600 leading-relaxed">
            La base de datos Firestore del proyecto{' '}
            <span className="font-mono font-semibold text-[#101014]">
              {provisionedFirebaseConfig.projectId}
            </span>{' '}
            ya está provisionada con reglas de seguridad activas. Iniciá sesión con Google para
            sincronizar empresas, tareas, cobranzas y reportes en tiempo real.
          </p>

          {firebaseUser ? (
            <div className="p-4 bg-[#F8F6F4] border border-neutral-200 rounded-lg space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs">
                  <div className="font-semibold text-[#101014]">
                    {firebaseUser.displayName || 'Usuario autenticado'}
                  </div>
                  <div className="text-neutral-500 font-mono">{firebaseUser.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void onSignOutGoogle()}
                  className="px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-medium text-neutral-700 hover:text-[#101014] flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Desconectar</span>
                </button>
              </div>

              <button
                type="button"
                disabled={cloudBusy}
                onClick={() => void onPushLocalToCloud()}
                className="w-full py-2 px-4 bg-[#101014] hover:bg-neutral-800 disabled:bg-neutral-400 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                {cloudBusy
                  ? 'Sincronizando registros...'
                  : 'Subir todos los datos actuales a Firestore'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={cloudBusy}
              onClick={() => void onSignInGoogle()}
              className="w-full py-2.5 px-4 bg-[#E52421] hover:bg-[#C91D1A] text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Cloud className="w-4 h-4" />
              <span>Conectar Google Cloud Firestore (Google Sign-In)</span>
            </button>
          )}

          {cloudError && (
            <p className="text-xs text-[#DC2626] bg-red-50 border border-red-200 rounded-lg p-3">
              {cloudError}
            </p>
          )}
        </div>

        {/* Custom firebaseConfig Panel */}
        <div className="lg:col-span-6 bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#E52421]" />
            <h2 className="text-base font-bold text-[#101014]">
              Configuración Firebase (`firebaseConfig`)
            </h2>
          </div>
          <p className="text-xs text-neutral-500">
            Pegá acá un `firebaseConfig` JSON si querés vincular otro proyecto de Google Cloud
            Firestore en producción.
          </p>

          <textarea
            rows={8}
            value={customConfigText}
            onChange={(e) => setCustomConfigText(e.target.value)}
            className="w-full p-3 bg-[#F8F6F4] border border-neutral-200 rounded-lg font-mono text-[11px] text-[#101014] focus:outline-none focus:border-[#101014]"
          />

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleValidateCustomConfig}
              className="px-4 py-2 bg-[#101014] hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg"
            >
              Validar y guardar configuración
            </button>
            {configFeedback && (
              <span
                className={`text-xs font-medium ${
                  configFeedback.ok ? 'text-[#16A34A]' : 'text-[#DC2626]'
                }`}
              >
                {configFeedback.text}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* PANEL 3: Respaldo JSON y Datos de Ejemplo */}
      <section className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-[#101014]">
            Respaldo JSON y Gestión de Datos de Ejemplo
          </h2>
          <p className="text-xs text-neutral-500">
            Exportá una copia completa en JSON, restaurá desde archivo o reiniciá los datos demo de
            Bonus Ticket Tucumán
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportJsonBackup}
            className="px-4 py-2 bg-[#101014] hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Descargar Respaldo JSON</span>
          </button>

          <label className="px-4 py-2 bg-[#F8F6F4] hover:bg-neutral-200/70 border border-neutral-200 text-[#101014] text-xs font-semibold rounded-lg flex items-center gap-2 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Restaurar desde JSON</span>
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => void handleImportJsonBackup(e.target.files?.[0] ?? null)}
            />
          </label>

          <button
            type="button"
            onClick={() => {
              onResetSeedData();
              setBackupMessage('Se cargaron nuevamente los datos de ejemplo de Bonus Ticket.');
            }}
            className="px-4 py-2 bg-white border border-neutral-300 hover:border-[#101014] text-[#101014] text-xs font-semibold rounded-lg flex items-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Cargar datos de ejemplo</span>
          </button>

          {confirmClear ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onClearAllData();
                  setConfirmClear(false);
                  setBackupMessage('Base local limpiada.');
                }}
                className="px-4 py-2 bg-[#DC2626] text-white text-xs font-semibold rounded-lg"
              >
                Confirmar limpieza total
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-3 py-2 text-xs text-neutral-600"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="px-4 py-2 bg-white border border-red-200 hover:border-[#DC2626] text-[#DC2626] text-xs font-semibold rounded-lg flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpiar datos</span>
            </button>
          )}
        </div>

        {backupMessage && (
          <div className="text-xs font-medium text-[#16A34A] flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>{backupMessage}</span>
          </div>
        )}
      </section>
    </div>
  );
};
