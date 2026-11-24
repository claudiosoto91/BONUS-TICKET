import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Map as MapIcon,
  MapPin,
  Navigation,
  Printer,
  Route as RouteIcon,
  Trash2,
  X,
} from 'lucide-react';
import type { Company } from '../types';

interface TucumanMapViewProps {
  companies: Company[];
  onSelectCompany: (companyId: string) => void;
}

const TUCUMAN_CENTER = { lat: -26.8241, lng: -65.2226 };

interface CompanyMarkerProps {
  company: Company;
  routeIndex: number;
  isSelected: boolean;
  onSelect: () => void;
  onCloseInfo: () => void;
  onOpenProfile: () => void;
  onToggleRoute: () => void;
}

const CompanyMarker: React.FC<CompanyMarkerProps> = ({
  company,
  routeIndex,
  isSelected,
  onSelect,
  onCloseInfo,
  onOpenProfile,
  onToggleRoute,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const inRoute = routeIndex >= 0;

  const pinBg = inRoute
    ? '#E52421'
    : company.estado === 'Activa'
    ? '#16A34A'
    : '#D97706';
  const pinBorder = inRoute
    ? '#991B1B'
    : company.estado === 'Activa'
    ? '#166534'
    : '#92400E';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: company.lat, lng: company.lng }}
        title={company.nombre}
        onClick={onSelect}
      >
        <Pin
          background={pinBg}
          borderColor={pinBorder}
          glyphColor="#FFFFFF"
          scale={inRoute ? 1.2 : 1.05}
        >
          {inRoute ? (
            <span className="text-[11px] font-bold text-white">{routeIndex + 1}</span>
          ) : undefined}
        </Pin>
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} maxWidth={260} onCloseClick={onCloseInfo}>
          <div className="p-1 text-[#101014] space-y-2">
            <div>
              <div className="text-[11px] font-semibold text-neutral-500">
                {company.estado} · {company.localidad}
              </div>
              <div className="text-sm font-bold leading-snug">{company.nombre}</div>
              <div className="text-xs text-neutral-600 mt-0.5">{company.direccion}</div>
            </div>
            <div className="text-xs text-neutral-600">
              {company.empleados} empleados · {company.contactoPrincipal || 'Sin contacto'}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onToggleRoute}
                className={`flex-1 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  inRoute
                    ? 'bg-neutral-200 text-[#101014]'
                    : 'bg-[#E52421] text-white hover:bg-[#C91D1A]'
                }`}
              >
                {inRoute ? 'Quitar de ruta' : '+ Sumar a ruta'}
              </button>
              <button
                type="button"
                onClick={onOpenProfile}
                className="px-2.5 py-1.5 text-xs font-medium border border-neutral-300 rounded-md hover:bg-neutral-50"
              >
                Ficha
              </button>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface RouteOverlayProps {
  stops: Company[];
  triggerCompute: number;
  onRouteResult: (info: { distanceKm: number; durationMin: number } | null, error?: string) => void;
}

interface PolylineLike {
  setOptions: (opts: { strokeColor?: string; strokeOpacity?: number; strokeWeight?: number }) => void;
  setMap: (map: unknown) => void;
}

const RouteOverlay: React.FC<RouteOverlayProps> = ({ stops, triggerCompute, onRouteResult }) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<PolylineLike[]>([]);

  useEffect(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (!map || !routesLib || stops.length < 2 || triggerCompute === 0) {
      return;
    }

    const origin = { lat: stops[0].lat, lng: stops[0].lng };
    const destination = { lat: stops[stops.length - 1].lat, lng: stops[stops.length - 1].lng };
    const intermediates = stops.slice(1, -1).map((s) => ({
      location: { lat: s.lat, lng: s.lng },
    }));

    const request: Record<string, unknown> = {
      origin,
      destination,
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    };
    if (intermediates.length > 0) {
      request.intermediates = intermediates;
    }

    let cancelled = false;

    const RouteClass = (
      routesLib as unknown as {
        Route?: {
          computeRoutes: (req: unknown) => Promise<{ routes?: Array<Record<string, unknown>> }>;
        };
      }
    ).Route;

    if (!RouteClass?.computeRoutes) {
      onRouteResult(null, 'La librería de rutas todavía está cargando. Probá nuevamente en un segundo.');
      return;
    }

    RouteClass.computeRoutes(request)
      .then((res) => {
        if (cancelled) return;
        const primaryRoute = res?.routes?.[0] as
          | {
              createPolylines?: () => PolylineLike[];
              viewport?: Parameters<typeof map.fitBounds>[0];
              distanceMeters?: number;
              durationMillis?: number;
            }
          | undefined;

        if (!primaryRoute) {
          onRouteResult(null, 'No se pudo calcular el recorrido entre los puntos seleccionados.');
          return;
        }

        if (typeof primaryRoute.createPolylines === 'function') {
          const lines = primaryRoute.createPolylines();
          lines.forEach((line) => {
            line.setOptions({
              strokeColor: '#E52421',
              strokeOpacity: 0.9,
              strokeWeight: 5,
            });
            line.setMap(map);
          });
          polylinesRef.current = lines;
        }

        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport);
        }

        const distanceKm = Math.round(((primaryRoute.distanceMeters ?? 0) / 1000) * 10) / 10;
        const durationMin = Math.round((primaryRoute.durationMillis ?? 0) / 60000);
        onRouteResult({ distanceKm, durationMin });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('429')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        onRouteResult(
          null,
          'No se pudo trazar la ruta en vivo. Podés usar el Mapa Visual Tucumán o abrir el recorrido directo en Google Maps.'
        );
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, routesLib, stops, triggerCompute, onRouteResult]);

  return null;
};

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function estimateRouteStats(stops: Company[]): { distanceKm: number; durationMin: number } | null {
  if (stops.length < 2) return null;
  let totalKm = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    // Urban road detour factor ~1.3x over straight-line distance
    totalKm += haversineKm(stops[i], stops[i + 1]) * 1.3;
  }
  const distanceKm = Math.round(totalKm * 10) / 10;
  const durationMin = Math.max(8, Math.round((distanceKm / 32) * 60));
  return { distanceKm, durationMin };
}

interface VisualTucumanCanvasProps {
  companies: Company[];
  routeIds: string[];
  routeStops: Company[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onToggleRoute: (id: string) => void;
  onOpenProfile: (id: string) => void;
  quotaFallbackActive: boolean;
}

const REFERENCE_ZONES = [
  { name: 'Tafí Viejo', lat: -26.7322, lng: -65.2597 },
  { name: 'Yerba Buena', lat: -26.8167, lng: -65.3167 },
  { name: 'San Miguel de Tucumán', lat: -26.8241, lng: -65.2226 },
  { name: 'Banda del Río Salí', lat: -26.8358, lng: -65.1656 },
  { name: 'Lules', lat: -26.9228, lng: -65.3375 },
  { name: 'Concepción', lat: -27.3458, lng: -65.5886 },
];

const VisualTucumanCanvas: React.FC<VisualTucumanCanvasProps> = ({
  companies,
  routeIds,
  routeStops,
  selectedId,
  onSelect,
  onToggleRoute,
  onOpenProfile,
  quotaFallbackActive,
}) => {
  // Compute dynamic bounding box covering visible companies + Gran San Miguel core
  const bounds = useMemo(() => {
    const pts = [
      ...companies.map((c) => ({ lat: c.lat, lng: c.lng })),
      { lat: -26.72, lng: -65.36 },
      { lat: -26.94, lng: -65.13 },
    ];
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const p of pts) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    const padLat = Math.max(0.03, (maxLat - minLat) * 0.14);
    const padLng = Math.max(0.03, (maxLng - minLng) * 0.14);
    return {
      minLat: minLat - padLat,
      maxLat: maxLat + padLat,
      minLng: minLng - padLng,
      maxLng: maxLng + padLng,
    };
  }, [companies]);

  const project = (lat: number, lng: number) => {
    const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
    const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 100;
    return {
      x: Math.max(5, Math.min(95, x)),
      y: Math.max(7, Math.min(93, y)),
    };
  };

  const selectedCompany = companies.find((c) => c.id === selectedId) ?? null;

  const polylinePoints = useMemo(() => {
    if (routeStops.length < 2) return '';
    return routeStops
      .map((s) => {
        const pt = project(s.lat, s.lng);
        return `${pt.x},${pt.y}`;
      })
      .join(' ');
  }, [routeStops, bounds]);

  return (
    <div className="w-full h-full relative bg-[#F3F1ED] overflow-hidden select-none">
      {/* Subtle topographic / urban grid backdrop */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        <defs>
          <pattern id="bt-grid" width="8" height="8" patternUnits="userSpaceOnUse">
            <path
              d="M 8 0 L 0 0 0 8"
              fill="none"
              stroke="#E5E1DA"
              strokeWidth="0.25"
            />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#bt-grid)" />

        {/* Stylized Río Salí vertical corridor */}
        <path
          d="M 76 0 Q 73 35 77 65 T 72 100"
          fill="none"
          stroke="#CBD5E1"
          strokeWidth="1.4"
          strokeLinecap="round"
        />

        {/* Stylized Ruta 9 / Ruta 38 spine */}
        <path
          d="M 68 0 Q 65 25 60 40 T 22 98"
          fill="none"
          stroke="#D6D3CD"
          strokeWidth="0.7"
          strokeDasharray="1.5 1.2"
        />

        {/* Active Route Polyline */}
        {polylinePoints && (
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="#E52421"
            strokeWidth="0.85"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="2 1"
          />
        )}
      </svg>

      {/* Locality labels */}
      {REFERENCE_ZONES.map((zone) => {
        const pt = project(zone.lat, zone.lng);
        return (
          <div
            key={zone.name}
            style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
            className="absolute -translate-x-1/2 translate-y-4 pointer-events-none text-[10px] font-medium text-neutral-400 whitespace-nowrap"
          >
            {zone.name}
          </div>
        );
      })}

      {/* Status notice bar inside map */}
      <div className="absolute top-3 left-3 z-10 bg-white/95 border border-neutral-200 rounded-lg px-3 py-1.5 text-[11px] text-neutral-600 shadow-xs">
        {quotaFallbackActive
          ? 'Vista visual interactiva de Tucumán activa (Google Maps alcanzó su cuota diaria).'
          : 'Mapa Visual Territorial de Tucumán · Hacé clic en cualquier pin para ver la ficha o armar ruta.'}
      </div>

      {/* Interactive Company Pins */}
      {companies.map((company) => {
        const pt = project(company.lat, company.lng);
        const routeIndex = routeIds.indexOf(company.id);
        const inRoute = routeIndex >= 0;
        const isCurrent = selectedId === company.id;

        const pinClasses = inRoute
          ? 'bg-[#E52421] border-[#991B1B] text-white'
          : company.estado === 'Activa'
          ? 'bg-[#16A34A] border-[#166534] text-white'
          : 'bg-[#D97706] border-[#92400E] text-white';

        return (
          <button
            key={company.id}
            type="button"
            onClick={() => onSelect(isCurrent ? null : company.id)}
            style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 group transition-transform ${
              isCurrent ? 'z-30 scale-115' : inRoute ? 'z-20' : 'z-10 hover:scale-110'
            }`}
            title={`${company.nombre} (${company.localidad})`}
          >
            <div
              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shadow-sm text-[11px] font-mono font-bold ${pinClasses}`}
            >
              {inRoute ? routeIndex + 1 : <MapPin className="w-3.5 h-3.5" />}
            </div>
            <div className="mt-1 px-1.5 py-0.5 bg-white/95 border border-neutral-200 rounded text-[10px] font-semibold text-[#101014] whitespace-nowrap max-w-[140px] truncate shadow-xs">
              {company.nombre}
            </div>
          </button>
        );
      })}

      {/* Floating Info Card for Selected Pin */}
      {selectedCompany && (
        <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-80 z-30 bg-white border border-neutral-200 rounded-xl p-4 shadow-md">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div>
              <div className="text-[11px] font-semibold text-neutral-500">
                {selectedCompany.estado} · {selectedCompany.localidad}
              </div>
              <div className="text-sm font-bold text-[#101014] leading-snug">
                {selectedCompany.nombre}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="p-1 text-neutral-400 hover:text-[#101014]"
              aria-label="Cerrar detalle"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="text-xs text-neutral-600 mb-1">{selectedCompany.direccion}</div>
          <div className="text-xs text-neutral-500 mb-3">
            {selectedCompany.empleados} empleados · {selectedCompany.contactoPrincipal || 'Sin contacto'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleRoute(selectedCompany.id)}
              className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                routeIds.includes(selectedCompany.id)
                  ? 'bg-neutral-200 text-[#101014]'
                  : 'bg-[#E52421] text-white hover:bg-[#C91D1A]'
              }`}
            >
              {routeIds.includes(selectedCompany.id) ? 'Quitar de ruta' : '+ Sumar a ruta'}
            </button>
            <button
              type="button"
              onClick={() => onOpenProfile(selectedCompany.id)}
              className="px-3 py-1.5 text-xs font-medium border border-neutral-300 rounded-lg hover:bg-neutral-50 text-[#101014]"
            >
              Abrir Ficha
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const TucumanMapView: React.FC<TucumanMapViewProps> = ({ companies, onSelectCompany }) => {
  const rawKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const apiKey = rawKey && !rawKey.includes('MY_GOOGLE_MAPS') ? rawKey : '';

  const [quotaFallback, setQuotaFallback] = useState(false);
  const [mapMode, setMapMode] = useState<'google' | 'visual'>(apiKey ? 'google' : 'visual');
  const [statusFilter, setStatusFilter] = useState<'Todas' | 'Activa' | 'Prospecto'>('Todas');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeIds, setRouteIds] = useState<string[]>(() =>
    companies.slice(0, 3).map((c) => c.id)
  );
  const [triggerCompute, setTriggerCompute] = useState(0);
  const [routeSummary, setRouteSummary] = useState<{
    distanceKm: number;
    durationMin: number;
  } | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Automatically switch to Visual Interactive Map when Google Maps hits quota/auth error
  useEffect(() => {
    const onQuota = () => {
      setQuotaFallback(true);
      setMapMode('visual');
    };
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  const visibleCompanies = useMemo(() => {
    return companies.filter((c) => (statusFilter === 'Todas' ? true : c.estado === statusFilter));
  }, [companies, statusFilter]);

  const routeStops = useMemo(() => {
    const byId: Record<string, Company> = {};
    for (const c of companies) byId[c.id] = c;
    return routeIds.map((id) => byId[id]).filter((c): c is Company => Boolean(c));
  }, [companies, routeIds]);

  const visualStats = useMemo(() => estimateRouteStats(routeStops), [routeStops]);

  const toggleStop = (id: string) => {
    setRouteSummary(null);
    setRouteError(null);
    setRouteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const moveStop = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= routeIds.length) return;
    setRouteIds((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      return next;
    });
    setRouteSummary(null);
  };

  const externalMapsUrl = useMemo(() => {
    if (routeStops.length < 2) return '';
    const origin = `${routeStops[0].lat},${routeStops[0].lng}`;
    const dest = `${routeStops[routeStops.length - 1].lat},${routeStops[routeStops.length - 1].lng}`;
    const waypoints = routeStops
      .slice(1, -1)
      .map((s) => `${s.lat},${s.lng}`)
      .join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
      origin
    )}&destination=${encodeURIComponent(dest)}${
      waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''
    }&travelmode=driving`;
  }, [routeStops]);

  const displayedStats = mapMode === 'google' ? routeSummary : visualStats;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
      {/* Map Canvas (8 cols) */}
      <div className="lg:col-span-8 bg-white border border-neutral-200 rounded-xl overflow-hidden flex flex-col">
        <div className="px-5 py-3.5 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-bold text-[#101014]">Mapa Territorial · Tucumán</span>
            <span className="text-neutral-500">
              Verde: Activas · Ámbar: Prospectos · Rojo: Hoja de Ruta
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Mode Switcher: Google Maps vs Mapa Visual */}
            <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg">
              <button
                type="button"
                disabled={!apiKey}
                onClick={() => setMapMode('google')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1 disabled:opacity-40 ${
                  mapMode === 'google'
                    ? 'bg-white text-[#101014] shadow-xs'
                    : 'text-neutral-600 hover:text-[#101014]'
                }`}
              >
                <MapIcon className="w-3 h-3" />
                <span>Google Maps</span>
              </button>
              <button
                type="button"
                onClick={() => setMapMode('visual')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  mapMode === 'visual'
                    ? 'bg-white text-[#101014] shadow-xs'
                    : 'text-neutral-600 hover:text-[#101014]'
                }`}
              >
                Mapa Visual
              </button>
            </div>

            <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg">
              {(['Todas', 'Activa', 'Prospecto'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    statusFilter === st
                      ? 'bg-white text-[#101014] shadow-xs'
                      : 'text-neutral-600 hover:text-[#101014]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="h-[560px] w-full relative bg-[#F8F6F4]">
          {mapMode === 'google' && apiKey ? (
            <APIProvider apiKey={apiKey} language="es" region="AR" libraries={['marker']}>
              <GoogleMap
                mapId="DEMO_MAP_ID"
                defaultCenter={TUCUMAN_CENTER}
                defaultZoom={12}
                gestureHandling="greedy"
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                className="w-full h-full"
              >
                {visibleCompanies.map((company) => (
                  <CompanyMarker
                    key={company.id}
                    company={company}
                    routeIndex={routeIds.indexOf(company.id)}
                    isSelected={selectedId === company.id}
                    onSelect={() => setSelectedId(company.id)}
                    onCloseInfo={() => setSelectedId(null)}
                    onOpenProfile={() => onSelectCompany(company.id)}
                    onToggleRoute={() => toggleStop(company.id)}
                  />
                ))}
                <RouteOverlay
                  stops={routeStops}
                  triggerCompute={triggerCompute}
                  onRouteResult={(info, err) => {
                    setRouteSummary(info);
                    setRouteError(err || null);
                  }}
                />
              </GoogleMap>
            </APIProvider>
          ) : (
            <VisualTucumanCanvas
              companies={visibleCompanies}
              routeIds={routeIds}
              routeStops={routeStops}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onToggleRoute={toggleStop}
              onOpenProfile={onSelectCompany}
              quotaFallbackActive={quotaFallback}
            />
          )}
        </div>
      </div>

      {/* Right Column: Armador de Hoja de Ruta (4 cols) */}
      <div className="lg:col-span-4 bg-white border border-neutral-200 rounded-xl p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-bold text-[#101014]">Hoja de Ruta · Visitas en Calle</h3>
            <span className="text-xs font-mono font-semibold text-neutral-500 tabular-nums">
              {routeStops.length} paradas
            </span>
          </div>
          <p className="text-xs text-neutral-500 mb-4">
            Seleccioná pines en el mapa o sumá empresas debajo para armar el recorrido del día de
            Miguel.
          </p>

          {/* Add quick stop selector */}
          <div className="mb-4">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) toggleStop(e.target.value);
              }}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white text-[#101014]"
            >
              <option value="">+ Sumar empresa o prospecto a la ruta...</option>
              {companies
                .filter((c) => !routeIds.includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} — {c.localidad} ({c.estado})
                  </option>
                ))}
            </select>
          </div>

          {routeStops.length === 0 ? (
            <div className="border border-dashed border-neutral-300 rounded-lg p-6 text-center text-xs text-neutral-500">
              Todavía no agregaste paradas. Hacé clic en cualquier pin del mapa para empezar tu
              hoja de ruta.
            </div>
          ) : (
            <ol className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {routeStops.map((stop, idx) => (
                <li
                  key={stop.id}
                  className="p-3 bg-[#F8F6F4] border border-neutral-200 rounded-lg flex items-start justify-between gap-2"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded bg-[#E52421] text-white text-[11px] font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#101014] truncate">
                        {stop.nombre}
                      </div>
                      <div className="text-[11px] text-neutral-500 truncate">
                        {stop.localidad} · {stop.contactoPrincipal || 'Sin contacto'}
                      </div>
                      {stop.telefonoPrincipal && (
                        <div className="text-[11px] font-mono text-neutral-500">
                          Tel: {stop.telefonoPrincipal}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveStop(idx, -1)}
                      className="p-1 text-neutral-400 hover:text-[#101014] disabled:opacity-30"
                      aria-label="Subir parada"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === routeStops.length - 1}
                      onClick={() => moveStop(idx, 1)}
                      className="p-1 text-neutral-400 hover:text-[#101014] disabled:opacity-30"
                      aria-label="Bajar parada"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleStop(stop.id)}
                      className="p-1 text-neutral-400 hover:text-[#DC2626]"
                      aria-label="Quitar parada"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {displayedStats && (
            <div className="mt-4 p-3.5 bg-[#101014] text-white rounded-lg grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-neutral-400">
                  {mapMode === 'google' ? 'Distancia real' : 'Distancia estimada'}
                </div>
                <div className="text-base font-mono font-bold tabular-nums">
                  {displayedStats.distanceKm} km
                </div>
              </div>
              <div>
                <div className="text-neutral-400">Tiempo estimado</div>
                <div className="text-base font-mono font-bold tabular-nums">
                  {displayedStats.durationMin} min
                </div>
              </div>
            </div>
          )}

          {routeError && (
            <p className="mt-3 text-xs text-[#D97706] leading-relaxed">{routeError}</p>
          )}
        </div>

        <div className="mt-5 pt-4 border-t border-neutral-200 space-y-2.5">
          {mapMode === 'google' && apiKey && (
            <button
              type="button"
              disabled={routeStops.length < 2}
              onClick={() => setTriggerCompute((n) => n + 1)}
              className="w-full py-2.5 px-4 bg-[#E52421] hover:bg-[#C91D1A] disabled:bg-neutral-300 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <RouteIcon className="w-4 h-4" />
              <span>Trazar Ruta en Google Maps</span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            {externalMapsUrl ? (
              <a
                href={externalMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 bg-[#E52421] hover:bg-[#C91D1A] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Abrir GPS</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="py-2 px-3 bg-neutral-100 text-neutral-400 text-xs font-medium rounded-lg text-center">
                Sumá 2+ paradas
              </span>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="py-2.5 px-3 bg-[#F8F6F4] hover:bg-neutral-200/70 border border-neutral-200 text-[#101014] text-xs font-medium rounded-lg flex items-center justify-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
