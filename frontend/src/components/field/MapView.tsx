/**
 * Live map (OpenStreetMap + Leaflet).
 *  Admin / Leader: households coloured by today's pick-up and this week's payment, live trucks with GPS trails,
 *                  QR scan points, and "pin household" mode to fix house locations.
 *  Collector:      own routes for the day and the households to visit.
 *  Resident:       own house + the live truck in their purok ("Where is the truck?").
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, LocateFixed, Map as MapIcon, MapPin, RefreshCw, Truck } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { MapOverview } from '../../types';
import { formatDateTime, localDateStr } from '../../utils/format';
import { currentPosition } from '../../utils/geo';

type HouseholdPin = MapOverview['households'][number];

const truckIcon = (status: string) =>
  L.divIcon({
    className: '',
    html: `<div style="font-size:26px;line-height:26px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.4));${status === 'In Progress' ? '' : 'opacity:.55'}">🚛</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

const homeIcon = L.divIcon({
  className: '',
  html: '<div style="font-size:24px;line-height:24px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.4))">🏠</div>',
  iconSize: [26, 26],
  iconAnchor: [13, 20]
});

const ROUTE_COLORS = ['#0ea5e9', '#f97316', '#a855f7', '#ef4444', '#14b8a6', '#eab308'];

function householdStyle(h: HouseholdPin) {
  const fill = h.scanned_today ? '#16a34a' : h.logged_today ? '#2563eb' : '#9ca3af';
  const stroke = h.payment_status === 'Verified' ? '#065f46' : h.payment_status === 'Pending' ? '#f59e0b' : '#dc2626';
  return { fill, stroke };
}

/** Distance in metres between two points (haversine). */
function metres(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const FlyTo: React.FC<{ target: [number, number] | null }> = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 17), { duration: 0.6 });
  }, [target, map]);
  return null;
};

const ClickToPin: React.FC<{ enabled: boolean; onPick: (lat: number, lng: number) => void }> = ({ enabled, onPick }) => {
  useMapEvents({
    click(e) {
      if (enabled) onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    }
  });
  return null;
};

export const MapView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const role = user?.role;
  const isResident = role === 'resident';
  const canPin = role === 'admin' || role === 'leader';
  const [date, setDate] = useState(localDateStr());
  const [data, setData] = useState<MapOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [pinFor, setPinFor] = useState<string>(''); // household id being pinned
  const [filter, setFilter] = useState<'all' | 'pending' | 'unpaid' | 'nolocation'>('all');
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await api.getMapOverview(date);
      setData(res);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Map not loaded', message: err.message });
    } finally {
      setLoading(false);
    }
  }, [date, showToast]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // live refresh
    return () => clearInterval(t);
  }, [load]);

  const center = useMemo<[number, number]>(() => {
    if (isResident && data?.households[0]?.latitude != null) return [data.households[0].latitude!, data.households[0].longitude!];
    return data ? [data.center.latitude, data.center.longitude] : [10.2588, 123.9445];
  }, [data, isResident]);

  const pinned = (data?.households || []).filter((h) => h.latitude != null && h.longitude != null);
  const listed = (data?.households || []).filter((h) => {
    if (filter === 'pending') return !h.scanned_today;
    if (filter === 'unpaid') return !h.payment_status;
    if (filter === 'nolocation') return h.latitude == null;
    return true;
  });

  const savePin = async (lat: number, lng: number) => {
    const hh = data?.households.find((h) => h.id === pinFor);
    if (!hh) return;
    try {
      await api.updateHousehold(hh.id, { latitude: lat, longitude: lng });
      showToast({ type: 'success', title: 'Location saved', message: `${hh.household_number} pinned on the map.` });
      setPinFor('');
      load();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Location not saved', message: err.message });
    }
  };

  const pinMyHouse = async () => {
    const pos = await currentPosition(10000);
    if (!pos) {
      showToast({ type: 'error', title: 'Location unavailable', message: 'Allow location access and stand at your house, then try again.' });
      return;
    }
    try {
      await api.setMyHouseholdLocation(pos.latitude, pos.longitude);
      showToast({ type: 'success', title: 'House pinned', message: 'Your collector and Purok Leader can now find your house on the map.' });
      setFlyTarget([pos.latitude, pos.longitude]);
      load();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Not saved', message: err.message });
    }
  };

  const myHouse = isResident ? data?.households[0] : undefined;
  const liveTruck = data?.routes.find((r) => r.status === 'In Progress' && r.last_position);
  const truckDistance = myHouse?.latitude != null && liveTruck?.last_position ? metres(myHouse as { latitude: number; longitude: number }, liveTruck.last_position) : null;

  useEffect(() => {
    if (firstLoad.current && data) firstLoad.current = false;
  }, [data]);

  const stats = useMemo(() => {
    const hh = data?.households || [];
    return {
      total: hh.length,
      collected: hh.filter((h) => h.scanned_today).length,
      paid: hh.filter((h) => h.payment_status === 'Verified').length,
      noLoc: hh.filter((h) => h.latitude == null).length,
      trucks: (data?.routes || []).filter((r) => r.status === 'In Progress').length
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
            <MapIcon className="w-4 h-4 text-emerald-700" />
            <span>{isResident ? 'Truck Tracker' : 'Live Collection Map'}</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mt-1">
            {isResident ? 'Where is the garbage truck?' : role === 'collector' ? 'My Routes Map' : role === 'leader' ? `${user?.purok_name || 'Purok'} Map` : 'Barangay Bang-Bang Map'}
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">Updates automatically every 15 seconds.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {!isResident && (
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Map date" className="rounded-lg border border-neutral-300 px-2 py-1.5 text-neutral-900" />
          )}
          <button type="button" onClick={load} className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-3 py-1.5 font-semibold text-neutral-700 hover:bg-neutral-100">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {isResident && (
            <button type="button" onClick={pinMyHouse} className="inline-flex items-center gap-1 rounded-lg bg-emerald-800 px-3 py-1.5 font-semibold text-white hover:bg-emerald-900">
              <LocateFixed className="h-3.5 w-3.5" /> {myHouse?.latitude != null ? 'Update my house location' : 'Pin my house (GPS)'}
            </button>
          )}
        </div>
      </div>

      {isResident ? (
        <div className={`rounded-xl border p-4 text-sm ${liveTruck ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-neutral-200 bg-white text-neutral-600'}`}>
          {liveTruck ? (
            <p>
              🚛 <strong>{liveTruck.waste_type}</strong> collection is <strong>in progress</strong> in {liveTruck.purok_name} with {liveTruck.collector_name}.
              {truckDistance != null && <> The truck is about <strong>{truckDistance < 1000 ? `${Math.round(truckDistance)} m` : `${(truckDistance / 1000).toFixed(1)} km`}</strong> from your house.</>}
              {' '}Last seen {formatDateTime(liveTruck.last_position!.recorded_at)}.
            </p>
          ) : (
            <p>No truck is collecting in your purok right now. You will get a notification when the truck starts.</p>
          )}
          {myHouse && myHouse.latitude == null && <p className="mt-1 text-xs text-amber-700">Your house is not pinned yet — tap "Pin my house (GPS)" while you are at home.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          {[
            ['Households', stats.total],
            ['Collected today', stats.collected],
            ['Paid this week', stats.paid],
            ['Trucks on route', stats.trucks],
            ['No location yet', stats.noLoc]
          ].map(([label, value]) => (
            <div key={label as string} className="bg-white border border-neutral-200 rounded-xl p-3">
              <p className="text-[10px] font-semibold uppercase text-neutral-400">{label}</p>
              <p className="text-lg font-bold font-mono text-neutral-900">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className={`${isResident ? 'xl:col-span-4' : 'xl:col-span-3'} relative rounded-xl overflow-hidden border border-neutral-200 shadow-xs`}>
          {pinFor && (
            <div className="absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white shadow-lg flex items-center gap-2">
              <Crosshair className="h-4 w-4" /> Click the map to pin {data?.households.find((h) => h.id === pinFor)?.household_number}
              <button type="button" onClick={() => setPinFor('')} className="underline">Cancel</button>
            </div>
          )}
          <MapContainer center={center} zoom={16} scrollWheelZoom className={`h-[520px] w-full ${pinFor ? 'cursor-crosshair' : ''}`} key={`${center[0]}-${center[1]}-${isResident}`}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
            <FlyTo target={flyTarget} />
            <ClickToPin enabled={!!pinFor} onPick={savePin} />

            {!isResident &&
              data?.puroks
                .filter((p) => p.latitude != null)
                .map((p) => (
                  <CircleMarker key={p.id} center={[p.latitude!, p.longitude!]} radius={4} pathOptions={{ color: '#065f46', fillOpacity: 0.2, weight: 1 }}>
                    <Tooltip permanent direction="top" offset={[0, -6]} opacity={0.8} className="!px-1.5 !py-0.5 !text-[9px] !font-bold">
                      {p.name}
                    </Tooltip>
                  </CircleMarker>
                ))}

            {pinned.map((h) =>
              isResident ? (
                <Marker key={h.id} position={[h.latitude!, h.longitude!]} icon={homeIcon}>
                  <Popup>Your house · {h.household_number}</Popup>
                </Marker>
              ) : (
                <CircleMarker
                  key={h.id}
                  center={[h.latitude!, h.longitude!]}
                  radius={8}
                  pathOptions={{ color: householdStyle(h).stroke, weight: 3, fillColor: householdStyle(h).fill, fillOpacity: 0.9 }}
                >
                  <Popup>
                    <div className="text-xs space-y-0.5">
                      <p className="font-bold font-mono">{h.household_number}</p>
                      <p className="font-semibold">{h.head_name}</p>
                      <p className="text-neutral-500">{h.purok_name} · {h.address_details}</p>
                      <p>Pick-up today: <strong>{h.scanned_today ? 'Collected (QR scanned)' : h.logged_today ? 'Logged by resident' : 'Not yet'}</strong></p>
                      <p>This week's fee: <strong>{h.payment_status || 'Unpaid'}</strong></p>
                      {canPin && (
                        <button type="button" className="mt-1 text-emerald-700 underline" onClick={() => setPinFor(h.id)}>
                          Move pin
                        </button>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              )
            )}

            {data?.routes.map((r, i) => (
              <React.Fragment key={r.id}>
                {r.trail.length > 1 && (
                  <Polyline positions={r.trail.map((p) => [p.latitude, p.longitude] as [number, number])} pathOptions={{ color: ROUTE_COLORS[i % ROUTE_COLORS.length], weight: 4, opacity: 0.8 }} />
                )}
                {r.last_position && (
                  <Marker position={[r.last_position.latitude, r.last_position.longitude]} icon={truckIcon(r.status)}>
                    <Popup>
                      <div className="text-xs space-y-0.5">
                        <p className="font-bold">{r.truck_number || 'Truck'} · {r.status}</p>
                        <p>{r.collector_name} — {r.purok_name}</p>
                        <p>{r.waste_type} · {r.time_slot}</p>
                        {!isResident && <p>{r.scans} household(s) scanned · {r.collected_volume_kg ?? 0} kg</p>}
                        <p className="text-neutral-500">Last seen {formatDateTime(r.last_position.recorded_at)}</p>
                      </div>
                    </Popup>
                  </Marker>
                )}
              </React.Fragment>
            ))}

            {data?.scans
              .filter((s) => s.latitude != null)
              .map((s) => (
                <CircleMarker key={s.id} center={[s.latitude!, s.longitude!]} radius={3} pathOptions={{ color: s.scan_type === 'Payment' ? '#d97706' : '#15803d', fillOpacity: 1 }}>
                  <Tooltip>
                    {s.scan_type === 'Payment' ? '💵' : '🗑'} {s.household_number} · {s.scanned_by_name} · {formatDateTime(s.created_at)}
                  </Tooltip>
                </CircleMarker>
              ))}
          </MapContainer>

          {!isResident && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-neutral-200 bg-white px-3 py-2 text-[10px] text-neutral-600">
              <span><span className="inline-block h-2.5 w-2.5 rounded-full bg-green-600 align-middle" /> Collected (QR scan)</span>
              <span><span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-600 align-middle" /> Logged by resident</span>
              <span><span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400 align-middle" /> Not yet collected</span>
              <span><span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-emerald-800 align-middle" /> Paid</span>
              <span><span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-amber-500 align-middle" /> Payment pending</span>
              <span><span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-red-600 align-middle" /> Unpaid</span>
              <span>🚛 Truck (live GPS)</span>
            </div>
          )}
        </div>

        {!isResident && (
          <div className="space-y-4">
            <div className="bg-white border border-neutral-200 rounded-xl shadow-xs">
              <div className="p-3 border-b border-neutral-200 text-xs font-bold uppercase text-neutral-800 flex items-center gap-1.5">
                <Truck className="h-4 w-4 text-amber-600" /> Routes ({data?.routes.length || 0})
              </div>
              <ul className="divide-y divide-neutral-100 text-xs max-h-56 overflow-y-auto">
                {(data?.routes || []).length === 0 && <li className="p-3 text-neutral-400">No routes on this date.</li>}
                {data?.routes.map((r, i) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={!r.last_position}
                      onClick={() => r.last_position && setFlyTarget([r.last_position.latitude, r.last_position.longitude])}
                      className="w-full p-3 text-left hover:bg-neutral-50 disabled:cursor-default"
                    >
                      <p className="font-semibold text-neutral-900 flex items-center gap-1.5">
                        <span className="inline-block h-2 w-4 rounded" style={{ background: ROUTE_COLORS[i % ROUTE_COLORS.length] }} />
                        {r.purok_name} · {r.time_slot}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        {r.collector_name} · <strong>{r.status}</strong> · {r.scans} scanned
                        {r.last_position ? ' · 📡 live' : r.status === 'In Progress' ? ' · no GPS yet' : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white border border-neutral-200 rounded-xl shadow-xs">
              <div className="p-3 border-b border-neutral-200 flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase text-neutral-800">Households</span>
                <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter households" className="rounded border border-neutral-200 px-1.5 py-1 text-[11px]">
                  <option value="all">All</option>
                  <option value="pending">Not yet collected</option>
                  <option value="unpaid">Unpaid this week</option>
                  <option value="nolocation">No location</option>
                </select>
              </div>
              <ul className="divide-y divide-neutral-100 text-xs max-h-72 overflow-y-auto">
                {listed.length === 0 && <li className="p-3 text-neutral-400">None.</li>}
                {listed.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2 p-2.5">
                    <button
                      type="button"
                      disabled={h.latitude == null}
                      onClick={() => setFlyTarget([h.latitude!, h.longitude!])}
                      className="text-left disabled:cursor-default"
                    >
                      <p className="font-mono font-semibold text-neutral-900">{h.household_number}</p>
                      <p className="text-[11px] text-neutral-500">{h.head_name}</p>
                    </button>
                    {canPin && (
                      <button
                        type="button"
                        onClick={() => setPinFor(h.id)}
                        className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-bold ${pinFor === h.id ? 'bg-amber-500 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                      >
                        <MapPin className="h-3 w-3" /> {h.latitude == null ? 'Pin' : 'Move'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
