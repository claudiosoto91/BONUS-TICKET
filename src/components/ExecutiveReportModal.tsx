import React, { useMemo, useState } from 'react';
import { Printer, X } from 'lucide-react';
import type { BonusTicketState } from '../types';
import { calcMonthlyAmount, formatARS, formatNumber } from '../utils/calculations';

interface ExecutiveReportModalProps {
  open: boolean;
  onClose: () => void;
  state: BonusTicketState;
}

export const ExecutiveReportModal: React.FC<ExecutiveReportModalProps> = ({
  open,
  onClose,
  state,
}) => {
  const [dateFrom, setDateFrom] = useState('2026-11-01');
  const [dateTo, setDateTo] = useState('2026-11-30');

  const summary = useMemo(() => {
    const activeCompanies = state.companies.filter((c) => c.estado === 'Activa');
    const prospects = state.companies.filter((c) => c.estado === 'Prospecto');
    const totalEmployees = activeCompanies.reduce((acc, c) => acc + c.empleados, 0);
    const projectedMonthlyMRR = activeCompanies.reduce(
      (acc, c) => acc + calcMonthlyAmount(c.empleados, c.precioIndividual),
      0
    );

    const periodFrom = dateFrom.slice(0, 7);
    const periodTo = dateTo.slice(0, 7);

    const filteredPayments = state.payments.filter(
      (p) => p.periodo >= periodFrom && p.periodo <= periodTo
    );
    const facturado = filteredPayments.reduce((s, p) => s + p.montoFacturado, 0);
    const cobrado = filteredPayments.reduce((s, p) => s + p.montoCobrado, 0);
    const retenciones = filteredPayments.reduce((s, p) => s + p.retenciones, 0);
    const pendiente = Math.max(0, facturado - cobrado - retenciones);
    const vencidas = filteredPayments.filter((p) => p.estado === 'Vencida');

    const filteredReports = state.metaReports.filter(
      (r) => r.fechaCarga >= dateFrom && r.fechaCarga <= dateTo
    );
    const activeReports = filteredReports.length > 0 ? filteredReports : state.metaReports.slice(0, 1);
    const alcance = activeReports.reduce((s, r) => s + r.alcance, 0);
    const interacciones = activeReports.reduce((s, r) => s + r.interacciones, 0);
    const clics = activeReports.reduce((s, r) => s + r.clicsEnlace, 0);
    const seguidores = activeReports.reduce((s, r) => s + r.nuevosSeguidores, 0);

    const filteredLogs = state.marketingLogs.filter(
      (l) => l.fecha >= dateFrom && l.fecha <= dateTo
    );
    const kitsEntregados = filteredLogs.filter(
      (l) => l.tipoEntrega === 'Kit Difusión WhatsApp/Email'
    ).length;
    const reelsEntregados = filteredLogs.filter(
      (l) => l.tipoEntrega === 'Reel de Fidelización'
    ).length;

    const filteredTasks = state.tasks.filter((t) => t.fecha >= dateFrom && t.fecha <= dateTo);

    return {
      activeCompanies,
      prospects,
      totalEmployees,
      projectedMonthlyMRR,
      facturado,
      cobrado,
      retenciones,
      pendiente,
      vencidas,
      alcance,
      interacciones,
      clics,
      seguidores,
      latestReport: activeReports[0],
      kitsEntregados,
      reelsEntregados,
      filteredTasks,
    };
  }, [state, dateFrom, dateTo]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Controls Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-neutral-200 bg-[#F8F6F4] no-print">
          <div>
            <h2 className="text-lg font-bold text-[#101014]">Reporte Ejecutivo Consolidado</h2>
            <p className="text-xs text-neutral-500">
              Resumen imprimible / PDF con los datos de Empresas, Cobranzas y Marketing
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <label className="text-neutral-600 font-medium">Desde</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-md font-mono text-xs"
              />
              <label className="text-neutral-600 font-medium">Hasta</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-md font-mono text-xs"
              />
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 bg-[#E52421] hover:bg-[#C91D1A] text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Guardar PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar reporte"
              className="p-2 text-neutral-500 hover:text-[#101014] rounded-lg hover:bg-neutral-200/70 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="p-8 overflow-y-auto space-y-8 bg-white">
          <div className="flex items-start justify-between border-b border-neutral-200 pb-6">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded bg-[#E52421] text-white font-bold text-sm flex items-center justify-center">
                  BT
                </div>
                <span className="text-lg font-bold text-[#101014]">Bonus Ticket Tucumán</span>
              </div>
              <h1 className="text-2xl font-bold text-[#101014]">
                Informe Ejecutivo de Gestión
              </h1>
              <p className="text-xs text-neutral-500 mt-1">
                Período analizado: <span className="font-mono font-medium text-[#101014]">{dateFrom}</span> al{' '}
                <span className="font-mono font-medium text-[#101014]">{dateTo}</span> · www.bonusticket.com.ar
              </p>
            </div>
            <div className="text-right text-xs text-neutral-500">
              <div>Emitido para: Dirección (Ramiro)</div>
              <div className="font-mono mt-0.5">{new Date().toLocaleDateString('es-AR')}</div>
            </div>
          </div>

          {/* 3 Sectors Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-neutral-200 rounded-lg p-5">
              <div className="text-xs font-medium text-neutral-500 mb-3">
                01. Empresas · Miguel
              </div>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-600">Empresas Activas</span>
                  <span className="font-mono font-bold tabular-nums">{summary.activeCompanies.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600">Prospectos en seguimiento</span>
                  <span className="font-mono font-bold tabular-nums">{summary.prospects.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600">Empleados adheridos</span>
                  <span className="font-mono font-bold tabular-nums">{formatNumber(summary.totalEmployees)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-neutral-100">
                  <span className="text-neutral-600">Base mensual estimada</span>
                  <span className="font-mono font-bold text-[#101014] tabular-nums">
                    {formatARS(summary.projectedMonthlyMRR)}
                  </span>
                </div>
              </div>
            </div>

            <div className="border border-neutral-200 rounded-lg p-5">
              <div className="text-xs font-medium text-neutral-500 mb-3">
                02. Cobranzas · Nahuel
              </div>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-600">Facturado período</span>
                  <span className="font-mono font-bold tabular-nums">{formatARS(summary.facturado)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600">Cobrado</span>
                  <span className="font-mono font-bold text-[#16A34A] tabular-nums">
                    {formatARS(summary.cobrado)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600">Pendiente</span>
                  <span className="font-mono font-bold text-[#D97706] tabular-nums">
                    {formatARS(summary.pendiente)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-neutral-100">
                  <span className="text-neutral-600">Facturas vencidas</span>
                  <span className="font-mono font-bold text-[#DC2626] tabular-nums">
                    {summary.vencidas.length}
                  </span>
                </div>
              </div>
            </div>

            <div className="border border-neutral-200 rounded-lg p-5">
              <div className="text-xs font-medium text-neutral-500 mb-3">
                03. Marketing · Redes y Difusión
              </div>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-600">Alcance Meta</span>
                  <span className="font-mono font-bold tabular-nums">{formatNumber(summary.alcance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600">Interacciones</span>
                  <span className="font-mono font-bold tabular-nums">{formatNumber(summary.interacciones)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600">Clics a web</span>
                  <span className="font-mono font-bold tabular-nums">{formatNumber(summary.clics)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-neutral-100">
                  <span className="text-neutral-600">Kits / Reels entregados</span>
                  <span className="font-mono font-bold tabular-nums">
                    {summary.kitsEntregados} / {summary.reelsEntregados}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {summary.latestReport?.analisisEjecutivo && (
            <div className="border border-neutral-200 rounded-lg p-5 bg-[#F8F6F4]">
              <div className="text-xs font-semibold text-[#101014] mb-1.5">
                Síntesis de Marketing ({summary.latestReport.periodo})
              </div>
              <p className="text-sm text-neutral-700 leading-relaxed">
                {summary.latestReport.analisisEjecutivo}
              </p>
            </div>
          )}

          {/* Active Companies Summary Table */}
          <div>
            <h3 className="text-sm font-bold text-[#101014] mb-3">
              Cartera de Empresas Activas ({summary.activeCompanies.length})
            </h3>
            <div className="border border-neutral-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8F6F4] text-neutral-600 border-b border-neutral-200">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Empresa</th>
                    <th className="py-2.5 px-3 font-semibold">Localidad</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Empleados</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Precio Unit.</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Total Mensual</th>
                    <th className="py-2.5 px-3 font-semibold">Próx. Aumento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {summary.activeCompanies.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2.5 px-3 font-medium text-[#101014]">{c.nombre}</td>
                      <td className="py-2.5 px-3 text-neutral-600">{c.localidad}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{c.empleados}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatARS(c.precioIndividual)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                        {formatARS(calcMonthlyAmount(c.empleados, c.precioIndividual))}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-neutral-600">
                        {c.fechaProximoAumento || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tasks in Period */}
          <div>
            <h3 className="text-sm font-bold text-[#101014] mb-3">
              Acuerdos y Tareas del Período ({summary.filteredTasks.length})
            </h3>
            {summary.filteredTasks.length === 0 ? (
              <p className="text-xs text-neutral-500">
                No se registran tareas con fecha dentro del rango seleccionado.
              </p>
            ) : (
              <div className="divide-y divide-neutral-200 border border-neutral-200 rounded-lg">
                {summary.filteredTasks.map((t) => (
                  <div key={t.id} className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs">
                    <div>
                      <div className="font-medium text-[#101014]">{t.titulo}</div>
                      <div className="text-neutral-500 mt-0.5">
                        {t.responsable} {t.empresaNombre ? `· ${t.empresaNombre}` : ''} · {t.fecha}
                      </div>
                    </div>
                    <span
                      className={`font-semibold whitespace-nowrap ${
                        t.estado === 'Listo'
                          ? 'text-[#16A34A]'
                          : t.estado === 'Vencida'
                          ? 'text-[#DC2626]'
                          : 'text-[#D97706]'
                      }`}
                    >
                      {t.estado}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
