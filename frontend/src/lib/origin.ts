function isLoopback(host: string) {
  const h = host.trim().toLowerCase().replace(/^https?:\/\//, "").split(":")[0];
  return !h || h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "::1";
}

function isDockerNet(ip: string) {
  return /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
}

function cleanHost(raw: string) {
  return raw.trim().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
}

/** IP Wi‑Fi thật — bỏ localhost, Docker, APIPA. */
export function isUsableLan(ip: string) {
  const h = cleanHost(ip);
  if (!h || isLoopback(h) || isDockerNet(h)) return false;
  if (h.endsWith(".255") || h.startsWith("169.254.")) return false;
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(h) || h.includes(".");
}

/** Đang chạy trên domain HTTPS thật (vd. Vercel) → trả origin đó; chạy LAN/localhost thì "". */
export function publicOrigin(): string {
  const { protocol, hostname, port } = window.location;
  if (protocol !== "https:" || port) return "";
  if (isLoopback(hostname) || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return "";
  return window.location.origin;
}

/** Host Wi‑Fi để điện thoại mở được — không bao giờ trả localhost. */
export async function phoneHost(): Promise<string | null> {
  const loc = window.location.hostname;
  if (loc && isUsableLan(loc)) return loc;

  /* Máy tính mở 127.0.0.1: PUBLIC_HOST trong Docker hay cũ → WebRTC lấy IP Wi‑Fi đang dùng. */
  const rtc = await lanIpv4();
  if (rtc && isUsableLan(rtc)) return rtc;

  for (const url of ["/__lan", "/lan.json"]) {
    try {
      const r = await fetch(url, { cache: "no-store" }).then((x) => x.json());
      const hosts: string[] = r.hosts || (r.host ? [r.host] : []);
      const hit = hosts.map(cleanHost).find((h) => isUsableLan(h));
      if (hit) return hit;
    } catch {}
  }
  return null;
}

/** Camera iPhone cần HTTPS; máy tính mở HTTP :5173 nên không lấy port của cửa sổ hiện tại. */
export const PHONE_HTTPS_PORT = "5174";
export const PHONE_HTTP_PORT = "5173";

export async function phoneHttpsPort(): Promise<string> {
  try {
    const r = await fetch("/__lan", { cache: "no-store" }).then((x) => x.json());
    if (r.httpsPort) return String(r.httpsPort);
  } catch {}
  return PHONE_HTTPS_PORT;
}

export async function phoneHttpPort(): Promise<string> {
  try {
    const r = await fetch("/__lan", { cache: "no-store" }).then((x) => x.json());
    if (r.httpPort) return String(r.httpPort);
  } catch {}
  return PHONE_HTTP_PORT;
}

export async function phoneOrigin(): Promise<string> {
  const host = await phoneHost();
  const port = await phoneHttpsPort();
  return host ? `https://${host}:${port}` : "";
}

/** Link ghép máy — HTTP để Safari/iPhone mở được khi chứng chỉ HTTPS lệch IP. */
export async function phoneJoinOrigin(): Promise<string> {
  const pub = publicOrigin();
  if (pub) return pub;
  const host = await phoneHost();
  const port = await phoneHttpPort();
  return host ? `http://${host}:${port}` : "";
}

function lanIpv4(): Promise<string | null> {
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({ iceServers: [] });
    const done = (v: string | null) => {
      try {
        pc.close();
      } catch {}
      resolve(v);
    };
    const timer = window.setTimeout(() => done(null), 1600);
    pc.createDataChannel("taphoa");
    pc.onicecandidate = (ev) => {
      const c = ev.candidate?.candidate || "";
      const m = c.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
      if (!m) return;
      const ip = m[1];
      if (!isUsableLan(ip)) return;
      window.clearTimeout(timer);
      done(ip);
    };
    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .catch(() => {
        window.clearTimeout(timer);
        done(null);
      });
  });
}

export function parsePairCode(raw: string) {
  const t = raw.trim();
  const fromQuery = t.match(/[?&]code=(\d{4,8})/i);
  if (fromQuery) return fromQuery[1];
  const tagged = t.match(/TAPHOA:(\d{4,8})/i);
  if (tagged) return tagged[1];
  return t.replace(/\D/g, "").slice(0, 6);
}

export { isLoopback };
