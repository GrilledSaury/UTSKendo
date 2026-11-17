// The session QR is self-contained: it carries the check-in window as well as the
// passcode, so a phone with no network can decide on the spot whether a scan is valid.
//
// It is encoded as a link to /scan so that it works both from the in-app scanner and
// from the phone's own camera app:
//   https://<host>/scan?s=<sessionId>&p=<passcode>&ws=<windowStart>&we=<windowEnd>
// (ws / we are Unix seconds). The equivalent JSON form is also accepted:
//   { "sessionId", "passcode", "windowStart": ISO string, "windowEnd": ISO string }

const SESSION_ID = /^[A-Za-z0-9_-]{1,64}$/

function toDate(v) {
  if (v == null || v === '') return null
  const d = /^\d+$/.test(String(v)) ? new Date(Number(v) * 1000) : new Date(v)
  return isNaN(d.getTime()) ? null : d
}

function normalise({ sessionId, passcode, windowStart, windowEnd }) {
  const ws = toDate(windowStart)
  const we = toDate(windowEnd)
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return null
  if (typeof passcode !== 'string' || !passcode || !ws || !we) return null
  return { sessionId, passcode, windowStart: ws, windowEnd: we }
}

export function buildScanUrl(origin, session) {
  const params = new URLSearchParams({
    s:  session.id,
    p:  session.passcode,
    ws: Math.floor(session.start.getTime() / 1000),
    we: Math.floor(session.end.getTime() / 1000),
  })
  return `${origin}/scan?${params}`
}

export function payloadFromParams(params) {
  return normalise({
    sessionId:   params.get('s'),
    passcode:    params.get('p'),
    windowStart: params.get('ws'),
    windowEnd:   params.get('we'),
  })
}

// Decoded QR text → payload, or null if it isn't one of our attendance codes
export function parseQrText(text) {
  const t = (text ?? '').trim()
  if (t.startsWith('{')) {
    try { return normalise(JSON.parse(t)) } catch { return null }
  }
  try { return payloadFromParams(new URL(t).searchParams) } catch { return null }
}

// The offline check. The passcode itself can only be verified by the server on submit.
export function checkWindow(payload, now = new Date()) {
  if (now < payload.windowStart) return { ok: false, reason: 'early' }
  if (now > payload.windowEnd)   return { ok: false, reason: 'late' }
  return { ok: true }
}
