import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  COMPANY_STATUS_OPTIONS,
  TUCUMAN_LOCALIDADES,
  type Company,
  type CompanyStatus,
  type FormulaAumento,
} from '../types';
import { calcMonthlyAmount, formatARS, sanitizeFirestoreId } from '../utils/calculations';

interface CompanyModalProps {
  open: boolean;
  defaultStatus?: CompanyStatus;
  onClose: () => void;
  onSave: (company: Company) => void;
}

export const CompanyModal: React.FC<CompanyModalProps> = ({
  open,
  defaultStatus = 'Prospecto',
  onClose,
  onSave,
}) => {
  const [nombre, setNombre] = useState('');
  const [estado, setEstado] = useState<CompanyStatus>(defaultStatus);
  const [localidad, setLocalidad] = useState(TUCUMAN_LOCALIDADES[0].name);
  const [direccion, setDireccion] = useState('');
  const [empleados, setEmpleados] = useState('50');
  const [contactoPrincipal, setContactoPrincipal] = useState('');
  const [telefonoPrincipal, setTelefonoPrincipal] = useState('');
  const [contactoDifusion, setContactoDifusion] = useState('');
  const [telefonoDifusion, setTelefonoDifusion] = useState('');
  const [mailDifusion, setMailDifusion] = useState('');
  const [linkBaseEmpleados, setLinkBaseEmpleados] = useState('');
  const [fechaBaseEmpleados, setFechaBaseEmpleados] = useState('');
  const [linkContrato, setLinkContrato] = useState('');
  const [linkPropuesta, setLinkPropuesta] = useState('');
  // Billing
  const [contactoCobranza, setContactoCobranza] = useState('');
  const [telefonoCobro, setTelefonoCobro] = useState('');
  const [mailCobro, setMailCobro] = useState('');
  const [precioIndividual, setPrecioIndividual] = useState('1800');
  const [fechaProximoAumento, setFechaProximoAumento] = useState('2027-01-01');
  const [formulaAumento, setFormulaAumento] = useState<FormulaAumento>('porcentaje');
  const [valorAumento, setValorAumento] = useState('12');

  useEffect(() => {
    if (open) {
      setEstado(defaultStatus);
    }
  }, [open, defaultStatus]);

  if (!open) return null;

  const empNum = Math.max(0, Number(empleados) || 0);
  const priceNum = Math.max(0, Number(precioIndividual) || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;

    const locData =
      TUCUMAN_LOCALIDADES.find((l) => l.name === localidad) || TUCUMAN_LOCALIDADES[0];
    // Slight jitter so pins in the same locality don't stack identically
    const jitterLat = (Math.random() - 0.5) * 0.012;
    const jitterLng = (Math.random() - 0.5) * 0.012;

    const newCompany: Company = {
      id: sanitizeFirestoreId(estado === 'Activa' ? 'emp' : 'pros'),
      nombre: nombre.trim(),
      estado,
      localidad,
      direccion: direccion.trim() || `${localidad}, Tucumán`,
      lat: Number((locData.lat + jitterLat).toFixed(5)),
      lng: Number((locData.lng + jitterLng).toFixed(5)),
      empleados: empNum,
      contactoPrincipal: contactoPrincipal.trim(),
      telefonoPrincipal: telefonoPrincipal.trim(),
      contactoDifusion: contactoDifusion.trim(),
      telefonoDifusion: telefonoDifusion.trim(),
      mailDifusion: mailDifusion.trim(),
      linkBaseEmpleados: linkBaseEmpleados.trim(),
      fechaBaseEmpleados: fechaBaseEmpleados.trim(),
      linkContrato: linkContrato.trim(),
      linkPropuesta: linkPropuesta.trim(),
      nivelFidelizacion: 'Fidelización Presencial',
      contactoCobranza: contactoCobranza.trim(),
      telefonoCobro: telefonoCobro.trim(),
      mailCobro: mailCobro.trim(),
      precioIndividual: priceNum,
      fechaProximoAumento,
      formulaAumento,
      valorAumento: Math.max(0, Number(valorAumento) || 0),
    };

    onSave(newCompany);
    setNombre('');
    setDireccion('');
    setContactoPrincipal('');
    setTelefonoPrincipal('');
    setContactoDifusion('');
    setTelefonoDifusion('');
    setMailDifusion('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-[#F8F6F4]">
          <div>
            <h2 className="text-lg font-bold text-[#101014]">Alta Rápida de Empresa</h2>
            <p className="text-xs text-neutral-500">
              Queda compartida al instante en la Ficha Maestra para todo el equipo
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 text-neutral-500 hover:text-[#101014] rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
          {/* Section 1 */}
          <div>
            <h3 className="text-xs font-bold text-neutral-500 mb-3">
              01. Información General, Contacto y Difusión
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Nombre de la empresa *
                </label>
                <input
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Clínica del Norte S.A."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:border-[#101014]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Estado</label>
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value as CompanyStatus)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white"
                >
                  {COMPANY_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Localidad (Tucumán)
                </label>
                <select
                  value={localidad}
                  onChange={(e) => setLocalidad(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white"
                >
                  {TUCUMAN_LOCALIDADES.map((loc) => (
                    <option key={loc.name} value={loc.name}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Dirección</label>
                <input
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Ej. Av. Aconquija 1200"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Cantidad de empleados
                </label>
                <input
                  type="number"
                  min={0}
                  value={empleados}
                  onChange={(e) => setEmpleados(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Contacto principal
                </label>
                <input
                  value={contactoPrincipal}
                  onChange={(e) => setContactoPrincipal(e.target.value)}
                  placeholder="Nombre y apellido"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Teléfono</label>
                <input
                  value={telefonoPrincipal}
                  onChange={(e) => setTelefonoPrincipal(e.target.value)}
                  placeholder="381..."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Contacto de difusión
                </label>
                <input
                  value={contactoDifusion}
                  onChange={(e) => setContactoDifusion(e.target.value)}
                  placeholder="RRHH / Comunicación"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Teléfono de difusión
                </label>
                <input
                  value={telefonoDifusion}
                  onChange={(e) => setTelefonoDifusion(e.target.value)}
                  placeholder="381..."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Mail de difusión
                </label>
                <input
                  type="email"
                  value={mailDifusion}
                  onChange={(e) => setMailDifusion(e.target.value)}
                  placeholder="rrhh@empresa.com.ar"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                />
              </div>

              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Link Base Empleados (Drive)
                  </label>
                  <input
                    value={linkBaseEmpleados}
                    onChange={(e) => setLinkBaseEmpleados(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Fecha de base de empleados
                  </label>
                  <input
                    type="date"
                    value={fechaBaseEmpleados}
                    onChange={(e) => setFechaBaseEmpleados(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Link Contrato (Drive)
                  </label>
                  <input
                    value={linkContrato}
                    onChange={(e) => setLinkContrato(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Link Propuesta (Drive)
                  </label>
                  <input
                    value={linkPropuesta}
                    onChange={(e) => setLinkPropuesta(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2 */}
          {estado === 'Activa' && (
            <div className="pt-5 border-t border-neutral-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-neutral-500">
                  02. Información para Facturar (Cobranzas)
                </h3>
                <span className="text-xs font-mono font-bold text-[#101014] tabular-nums">
                  Estimado: {formatARS(calcMonthlyAmount(empNum, priceNum))} / mes
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Persona de cobranza
                  </label>
                  <input
                    value={contactoCobranza}
                    onChange={(e) => setContactoCobranza(e.target.value)}
                    placeholder="Tesorería / CPN"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Teléfono de cobro
                  </label>
                  <input
                    value={telefonoCobro}
                    onChange={(e) => setTelefonoCobro(e.target.value)}
                    placeholder="381..."
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Mail de cobro
                  </label>
                  <input
                    type="email"
                    value={mailCobro}
                    onChange={(e) => setMailCobro(e.target.value)}
                    placeholder="pagos@empresa.com.ar"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Precio individual ($)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={precioIndividual}
                    onChange={(e) => setPrecioIndividual(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Fecha próximo aumento
                  </label>
                  <input
                    type="date"
                    value={fechaProximoAumento}
                    onChange={(e) => setFechaProximoAumento(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Fórmula de aumento
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={formulaAumento}
                      onChange={(e) => setFormulaAumento(e.target.value as FormulaAumento)}
                      className="flex-1 px-2 py-2 border border-neutral-300 rounded-lg text-xs bg-white"
                    >
                      <option value="porcentaje">% Actual</option>
                      <option value="ipc">IPC %</option>
                      <option value="monto_fijo">Fijo $</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={valorAumento}
                      onChange={(e) => setValorAumento(e.target.value)}
                      className="w-20 px-2 py-2 border border-neutral-300 rounded-lg text-xs font-mono tabular-nums"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-[#101014] rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#E52421] hover:bg-[#C91D1A] text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Guardar empresa
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
