import React, { useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { Company, PlanPriority, PlanSector, PlanTask } from '../types';
import { CURRENT_PLAN_WEEK } from '../data/seedData';
import { ALL_PLAN_SECTORS, SECTOR_VISUALS } from '../utils/planHelpers';
import { sanitizeFirestoreId } from '../utils/calculations';

interface QuickTaskModalProps {
  open: boolean;
  defaultSector: PlanSector;
  defaultCompanyId?: string;
  companies: Company[];
  onClose: () => void;
  onCreateTask: (task: PlanTask) => void;
}

export const QuickTaskModal: React.FC<QuickTaskModalProps> = ({
  open,
  defaultSector,
  defaultCompanyId = '',
  companies,
  onClose,
  onCreateTask,
}) => {
  const [titulo, setTitulo] = useState('');
  const [selectedSectors, setSelectedSectors] = useState<PlanSector[]>([defaultSector]);
  const [fechaObjetivo, setFechaObjetivo] = useState('2026-11-28');
  const [prioridad, setPrioridad] = useState<PlanPriority>('Media');
  const [empresaId, setEmpresaId] = useState(defaultCompanyId);

  useEffect(() => {
    if (open) {
      setSelectedSectors([defaultSector]);
      setEmpresaId(defaultCompanyId);
      setTitulo('');
      setPrioridad('Media');
    }
  }, [open, defaultSector, defaultCompanyId]);

  if (!open) return null;

  const toggleSector = (sec: PlanSector) => {
    setSelectedSectors((prev) =>
      prev.includes(sec) ? prev.filter((s) => s !== sec) : [...prev, sec]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return;
    const linked = companies.find((c) => c.id === empresaId);
    const sectores: PlanSector[] = selectedSectors;

    onCreateTask({
      id: sanitizeFirestoreId('plan'),
      titulo: titulo.trim(),
      sector: sectores[0] ?? '',
      sectores,
      fechaObjetivo,
      semana: CURRENT_PLAN_WEEK,
      prioridad,
      estado: 'Pendiente',
      empresaId: linked?.id || '',
      empresaNombre: linked?.nombre || '',
      linkDrive: '',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-[#F8F6F4]">
          <div>
            <h2 className="text-base font-bold text-[#101014]">
              Nueva Tarea para Planificación Semanal
            </h2>
            <p className="text-xs text-neutral-500">
              Se cargará automáticamente en el tablero Kanban del equipo
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 text-neutral-500 hover:text-[#101014]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Título de la tarea / acuerdo *
            </label>
            <input
              required
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Coordinar difusión presencial y envío de factura..."
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-[#101014] focus:outline-none focus:border-[#101014]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-medium text-neutral-700">
                Etiquetas / Áreas vinculadas
              </label>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSelectedSectors([...ALL_PLAN_SECTORS])}
                  className="text-[#101014] hover:underline font-medium"
                >
                  Tildar todas
                </button>
                <span className="text-neutral-300">·</span>
                <button
                  type="button"
                  onClick={() => setSelectedSectors([])}
                  className="text-neutral-500 hover:text-[#DC2626] font-medium"
                >
                  Destildar todas
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ALL_PLAN_SECTORS.map((sec) => {
                const vis = SECTOR_VISUALS[sec];
                const active = selectedSectors.includes(sec);
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => toggleSector(sec)}
                    className={`px-2.5 py-2 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                      active
                        ? vis.activeButtonClass
                        : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400'
                    }`}
                  >
                    {active ? (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <span
                        className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                        style={{ backgroundColor: vis.hex }}
                      />
                    )}
                    <span>{vis.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Fecha objetivo
              </label>
              <input
                type="date"
                required
                value={fechaObjetivo}
                onChange={(e) => setFechaObjetivo(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Prioridad
              </label>
              <select
                value={prioridad}
                onChange={(e) => setPrioridad(e.target.value as PlanPriority)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white"
              >
                <option value="Baja">Baja</option>
                <option value="Media">Media</option>
                <option value="Alta">Alta</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Empresa vinculada (opcional)
            </label>
            <select
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white"
            >
              <option value="">General / Comunidad Bonus</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.estado})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-600"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#E52421] hover:bg-[#C91D1A] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Agregar a Planificación</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
