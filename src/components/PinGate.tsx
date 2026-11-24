import React, { useState } from 'react';
import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';
import { TEAM_PROFILES, type TeamMember } from '../types';

interface PinGateProps {
  onUnlock: (member: TeamMember) => void;
}

const VALID_PIN = '2026';

export const PinGate: React.FC<PinGateProps> = ({ onUnlock }) => {
  const [pin, setPin] = useState('');
  const [selectedMember, setSelectedMember] = useState<TeamMember>('Ramiro');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.trim() === VALID_PIN) {
      setError('');
      onUnlock(selectedMember);
    } else {
      setError('PIN incorrecto. Usá 2026 o entrá directo en modo demo.');
    }
  };

  return (
    <div className="min-h-screen bg-[#101014] text-white flex flex-col lg:flex-row">
      {/* Left Brand Panel */}
      <div className="lg:w-[46%] p-8 lg:p-14 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-white/10">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-lg bg-[#E52421] flex items-center justify-center font-extrabold text-white text-lg tracking-tight">
              BT
            </div>
            <span className="font-bold text-xl tracking-tight text-white">Bonus Ticket</span>
          </div>

          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight max-w-md mb-5">
            Central de Gestión, Empresas y Facturación
          </h1>
          <p className="text-neutral-400 text-base leading-relaxed max-w-md">
            Plataforma interna del equipo en Tucumán. Cada área carga y sigue sus tareas sin
            pisarse, compartiendo la Ficha Maestra de Empresas y el tablero ejecutivo.
          </p>
        </div>

        <div className="mt-10 pt-8 border-t border-white/10 grid grid-cols-3 gap-6 max-w-md">
          <div>
            <div className="text-xs text-neutral-400 mb-1">Empresas</div>
            <div className="text-sm font-semibold text-white">Activas y Mapa</div>
          </div>
          <div>
            <div className="text-xs text-neutral-400 mb-1">Cobranzas</div>
            <div className="text-sm font-semibold text-white">Cálculo y Aumentos</div>
          </div>
          <div>
            <div className="text-xs text-neutral-400 mb-1">Marketing</div>
            <div className="text-sm font-semibold text-white">Meta CSV + IA</div>
          </div>
        </div>
      </div>

      {/* Right Access Form */}
      <div className="flex-1 bg-[#F8F6F4] text-[#101014] flex items-center justify-center p-6 lg:p-14">
        <div className="w-full max-w-md bg-white border border-neutral-200 rounded-xl p-8">
          <div className="flex items-center gap-2 text-xs font-medium text-neutral-500 mb-2">
            <ShieldCheck className="w-4 h-4 text-[#E52421]" />
            <span>Acceso interno de equipo · bonusticket.com.ar</span>
          </div>
          <h2 className="text-2xl font-bold text-[#101014] mb-6">Elegí tu perfil para ingresar</h2>

          <div className="grid grid-cols-2 gap-2.5 mb-6">
            {TEAM_PROFILES.map((profile) => {
              const active = selectedMember === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setSelectedMember(profile.id)}
                  className={`text-left p-3.5 rounded-lg border transition-colors ${
                    active
                      ? 'border-[#101014] bg-[#101014] text-white'
                      : 'border-neutral-200 bg-white text-[#101014] hover:border-neutral-400'
                  }`}
                >
                  <div className="text-sm font-semibold truncate">{profile.label}</div>
                  <div
                    className={`text-xs mt-0.5 truncate ${
                      active ? 'text-neutral-300' : 'text-neutral-500'
                    }`}
                  >
                    {profile.role}
                  </div>
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="team-pin"
                className="block text-xs font-medium text-neutral-600 mb-1.5"
              >
                PIN de equipo (demo: <span className="font-mono font-semibold text-[#101014]">2026</span>)
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="team-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="Ingresá 2026"
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-neutral-300 rounded-lg text-sm font-mono tracking-widest focus:outline-none focus:border-[#101014]"
                />
              </div>
              {error && <p className="text-xs text-[#DC2626] mt-1.5 font-medium">{error}</p>}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-[#E52421] hover:bg-[#C91D1A] text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <span>Ingresar con PIN</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-neutral-100">
            <button
              type="button"
              onClick={() => onUnlock(selectedMember)}
              className="w-full py-2.5 px-4 bg-[#F8F6F4] hover:bg-neutral-200/70 text-[#101014] text-sm font-semibold rounded-lg border border-neutral-200 transition-colors"
            >
              Entrar directo en modo demo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
