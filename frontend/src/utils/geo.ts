/** Small geolocation helpers (all optional: the app works without location). */

let lastFix: { latitude: number; longitude: number; accuracy: number; at: number } | null = null;

export function rememberFix(pos: GeolocationPosition) {
  lastFix = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, at: Date.now() };
}

/** Returns a recent fix (≤ 60 s old) or asks the device, giving up after `timeoutMs`. Never throws. */
export function currentPosition(timeoutMs = 6000): Promise<{ latitude: number; longitude: number } | null> {
  if (lastFix && Date.now() - lastFix.at < 60_000) return Promise.resolve({ latitude: lastFix.latitude, longitude: lastFix.longitude });
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(done);
        rememberFix(pos);
        resolve({ latitude: Number(pos.coords.latitude.toFixed(6)), longitude: Number(pos.coords.longitude.toFixed(6)) });
      },
      () => {
        clearTimeout(done);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 }
    );
  });
}
