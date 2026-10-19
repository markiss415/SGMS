/**
 * While a collector has a collection In Progress, their phone shares its GPS position
 * every ~20 seconds so the Admin, Purok Leader and residents can follow the truck on the map.
 * Sharing stops automatically when no route is in progress.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Radio } from 'lucide-react';
import { api } from '../../services/api';
import { rememberFix } from '../../utils/geo';

const PING_EVERY_MS = 20_000;
const CHECK_ROUTES_MS = 60_000;

export const CollectorGpsTracker: React.FC = () => {
  const [activeRoute, setActiveRoute] = useState<{ id: string; purok: string } | null>(null);
  const [state, setState] = useState<'idle' | 'sharing' | 'denied' | 'unavailable'>('idle');
  const lastSent = useRef(0);

  // Find the in-progress route (re-checked every minute).
  useEffect(() => {
    let alive = true;
    const check = () =>
      api
        .getSchedules({ status: 'In Progress' })
        .then((list) => {
          if (!alive) return;
          const r = list[0];
          setActiveRoute(r ? { id: r.id, purok: r.purok_name } : null);
        })
        .catch(() => undefined);
    check();
    const t = setInterval(check, CHECK_ROUTES_MS);
    window.addEventListener('bb:routes-changed', check);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener('bb:routes-changed', check);
    };
  }, []);

  // Watch the position while a route is active.
  useEffect(() => {
    if (!activeRoute) {
      setState('idle');
      return;
    }
    if (!navigator.geolocation || !window.isSecureContext) {
      setState('unavailable');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        rememberFix(pos);
        setState('sharing');
        if (Date.now() - lastSent.current < PING_EVERY_MS) return;
        lastSent.current = Date.now();
        api
          .sendLocationPing({
            schedule_id: activeRoute.id,
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Math.round(pos.coords.accuracy)
          })
          .catch(() => undefined);
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [activeRoute?.id]);

  if (!activeRoute) return null;
  const tone =
    state === 'sharing' ? 'bg-emerald-700 text-white' : state === 'idle' ? 'bg-neutral-700 text-white' : 'bg-rose-600 text-white';
  const text =
    state === 'sharing'
      ? `Live GPS on · ${activeRoute.purok}`
      : state === 'denied'
        ? 'GPS blocked — allow location to share the truck position'
        : state === 'unavailable'
          ? 'GPS unavailable on this device/page'
          : 'Starting GPS…';
  return (
    <div role="status" className={`fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full px-3.5 py-2 text-[11px] font-semibold shadow-lg ${tone}`}>
      <Radio className={`h-3.5 w-3.5 ${state === 'sharing' ? 'animate-pulse' : ''}`} />
      {text}
    </div>
  );
};
