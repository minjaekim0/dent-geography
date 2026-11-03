export function visibleClinics(locations, bounds, source = 'all') {
  return locations.filter(p => (source === 'all' || p.source === source) &&
    Number.isFinite(p.lng) && Number.isFinite(p.lat) &&
    p.lng >= bounds[0] && p.lng <= bounds[2] && p.lat >= bounds[1] && p.lat <= bounds[3]);
}
export function placeLink(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname === 'place.map.kakao.com' && /^\/\d+$/.test(url.pathname)
      ? 'https://place.map.kakao.com' + url.pathname : null;
  } catch { return null; }
}
