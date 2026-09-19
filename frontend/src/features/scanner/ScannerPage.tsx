import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import ProductImage from "../../components/ui/ProductImage";
import BrandLogo from "../../components/ui/BrandLogo";
import { staffApi } from "../../api/client";
import { isLoopback, parsePairCode } from "../../lib/origin";

function cameraHttpsUrl() {
  const host = window.location.hostname;
  if (!host || isLoopback(host)) return "";
  const code = parsePairCode(new URLSearchParams(window.location.search).get("code") || "");
  const q = code.length === 6 ? `?code=${code}` : "";
  return `https://${host}:5174/scan${q}`;
}

function canLiveCamera() {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

function makeReader() {
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.QR_CODE,
  ]);
  return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80, delayBetweenScanSuccess: 400 });
}

async function nativeDetector() {
  const BD = (window as any).BarcodeDetector;
  if (!BD) return null;
  const wanted = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"];
  try {
    const supported: string[] = BD.getSupportedFormats ? await BD.getSupportedFormats() : wanted;
    const formats = wanted.filter((f) => supported.includes(f));
    return new BD({ formats: formats.length ? formats : supported });
  } catch {
    try {
      return new BD();
    } catch {
      return null;
    }
  }
}

async function openRearCamera() {
  const tries: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
    { audio: false, video: { facingMode: "environment" } },
    { audio: false, video: true },
  ];
  let last: unknown;
  for (const c of tries) {
    try {
      return await navigator.mediaDevices.getUserMedia(c);
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("Không mở được camera");
}

function decodeCanvas(reader: BrowserMultiFormatReader, canvas: HTMLCanvasElement) {
  try {
    return reader.decodeFromCanvas(canvas).getText();
  } catch {
    return null;
  }
}

function invertCanvas(ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
  ctx.putImageData(img, 0, 0);
}

/** Dải ngang giữa khung hình — giống tia laser 1D, không phụ thuộc overlay CSS. */
function paintBand(video: HTMLVideoElement, canvas: HTMLCanvasElement, mode: "band" | "full") {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || video.readyState < 2) return null;
  let sx = 0;
  let sy = 0;
  let sw = vw;
  let sh = vh;
  if (mode === "band") {
    sh = Math.max(64, Math.floor(vh * 0.32));
    sy = Math.floor((vh - sh) / 2);
  }
  const maxW = mode === "full" ? 720 : 960;
  const dw = Math.min(maxW, sw);
  const dh = Math.max(48, Math.round(sh * (dw / sw)));
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.filter = "grayscale(1) contrast(1.35) brightness(1.08)";
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
  ctx.filter = "none";
  return ctx;
}

export default function ScannerPage() {
  const [code, setCode] = useState(parsePairCode(new URLSearchParams(location.search).get("code") || ""));
  const [session, setSession] = useState<any>(null);
  const [last, setLast] = useState<any>(null);
  const [err, setErr] = useState("");
  const [running, setRunning] = useState(false);
  const [manual, setManual] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const lastScan = useRef({ code: "", t: 0 });
  const joining = useRef(false);
  const sessionRef = useRef<any>(null);
  const reader = useRef(makeReader());
  const detector = useRef<any>(null);
  const stopFlag = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const scanGen = useRef(0);
  const tick = useRef(0);
  const busy = useRef(false);

  sessionRef.current = session;

  const pushCode = async (text: string) => {
    const digits = text.replace(/\s/g, "");
    if (!digits) return;
    const now = Date.now();
    if (digits === lastScan.current.code && now - lastScan.current.t < 1500) return;
    lastScan.current = { code: digits, t: now };
    try {
      navigator.vibrate?.(60);
    } catch {}
    setLast({ barcode: digits, unknown: true });
    const sid = sessionRef.current?.id;
    if (!sid) return;
    try {
      const r = await staffApi.scannerScan(sid, digits);
      setLast({ ...r, barcode: digits });
      setErr(r.delivered === false ? "Máy quầy chưa nhận được mã — mở lại trang Quầy trên máy tính." : "");
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const join = async (raw = code) => {
    const pair = parsePairCode(raw);
    if (pair.length < 4 || joining.current) return;
    joining.current = true;
    setErr("");
    try {
      setSession(await staffApi.scannerJoin(pair));
    } catch (e: any) {
      setErr(e.message);
      joining.current = false;
    }
  };

  useEffect(() => {
    nativeDetector().then((d) => {
      detector.current = d;
    });
    const fromUrl = parsePairCode(new URLSearchParams(location.search).get("code") || "");
    if (fromUrl.length === 6) join(fromUrl);
    return () => {
      stopFlag.current = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readFrame = async () => {
    const v = video.current;
    const c = canvas.current;
    if (!v || !c || v.readyState < 2 || !v.videoWidth) return;

    tick.current += 1;
    const mode = tick.current % 5 === 0 ? "full" : "band";
    const ctx = paintBand(v, c, mode);
    if (!ctx) return;

    if (detector.current) {
      try {
        const found = await detector.current.detect(c);
        const raw = found?.[0]?.rawValue;
        if (raw) {
          await pushCode(raw);
          return;
        }
      } catch {
        try {
          const found = await detector.current.detect(v);
          const raw = found?.[0]?.rawValue;
          if (raw) {
            await pushCode(raw);
            return;
          }
        } catch {}
      }
    }

    let text = decodeCanvas(reader.current, c);
    if (!text) {
      invertCanvas(ctx);
      text = decodeCanvas(reader.current, c);
    }
    if (text) await pushCode(text);
  };

  const loop = (gen: number, videoEl: HTMLVideoElement) => {
    if (stopFlag.current || scanGen.current !== gen) return;
    const step = async () => {
      if (stopFlag.current || scanGen.current !== gen) return;
      if (!busy.current) {
        busy.current = true;
        try {
          await readFrame();
        } catch {
          /* khung hỏng thì bỏ, quét tiếp */
        } finally {
          busy.current = false;
        }
      }
      if (stopFlag.current || scanGen.current !== gen) return;
      const rvfc = (videoEl as any).requestVideoFrameCallback as undefined | ((cb: () => void) => number);
      if (rvfc) rvfc.call(videoEl, () => loop(gen, videoEl));
      else window.setTimeout(() => loop(gen, videoEl), 90);
    };
    void step();
  };

  const startScan = async () => {
    if (!canLiveCamera()) {
      setErr("iPhone chỉ quét live khi trang là HTTPS và đã tin chứng chỉ.");
      return;
    }
    setErr("");
    stopFlag.current = false;
    scanGen.current += 1;
    const gen = scanGen.current;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const stream = await openRearCamera();
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as any;
      setHasTorch(!!caps?.torch);
      try {
        const advanced: Record<string, unknown>[] = [];
        if (caps?.focusMode?.includes?.("continuous")) advanced.push({ focusMode: "continuous" });
        if (caps?.zoom?.max >= 1.6) advanced.push({ zoom: Math.min(caps.zoom.max, 1.8) });
        if (advanced.length) await track.applyConstraints({ advanced: advanced as any });
      } catch {}
      const v = video.current;
      if (!v) return;
      v.setAttribute("playsinline", "true");
      v.setAttribute("webkit-playsinline", "true");
      v.muted = true;
      v.srcObject = stream;
      await new Promise<void>((resolve) => {
        if (v.readyState >= 2 && v.videoWidth) resolve();
        else v.onloadedmetadata = () => resolve();
      });
      await v.play();
      setRunning(true);
      loop(gen, v);
    } catch (e: any) {
      const https = cameraHttpsUrl();
      const hint =
        window.location.protocol === "http:" && https
          ? " iPhone chặn camera trên HTTP — mở link HTTPS trên trang này."
          : "";
      setErr((e?.message || String(e)) + hint);
      setRunning(false);
    }
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] });
      setTorchOn((t) => !t);
    } catch {
      setErr("Đèn pin không bật được trên máy này.");
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-ink-900 text-white p-6 grid place-items-center">
        <div className="w-full max-w-sm">
          <div className="text-5xl mb-3">📷</div>
          <h1 className="font-display font-black text-3xl">Điện thoại = máy quét</h1>
          <p className="text-white/60 mt-2 text-sm">Nhập mã 6 số trên màn hình quầy.</p>
          <input
            className="input mt-6 text-ink-900 tracking-[0.3em] sm:tracking-[0.5em] text-center text-2xl"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(parsePairCode(e.target.value))}
            inputMode="numeric"
          />
          {err && <p className="text-coral-400 mt-2">{err}</p>}
          <button className="btn-lime w-full mt-4 text-ink-900" onClick={() => join()}>
            Ghép cặp
          </button>
        </div>
      </div>
    );
  }

  const liveOk = canLiveCamera();

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="relative flex-1 min-h-[50vh] bg-black">
        <video
          ref={video}
          className="scanner-cam absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          autoPlay
        />
        {/* Safari iOS: canvas không được display:none — drawImage(camera) sẽ ra khung đen */}
        <canvas
          ref={canvas}
          aria-hidden
          className="scanner-buf pointer-events-none fixed left-0 top-0 z-[-1]"
          style={{ width: 8, height: 8, maxWidth: "none", opacity: 0.01 }}
        />
        {running && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="w-[92%] h-36 rounded-2xl border-2 border-lime-400 shadow-[0_0_0_9999px_rgba(0,0,0,.45)] relative">
              <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-0.5 bg-coral-500/90" />
            </div>
          </div>
        )}
        {!running && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center bg-gradient-to-b from-forest-900 to-black">
            <div className="max-w-sm">
              <BrandLogo size={80} className="mx-auto mb-3 h-20 w-20" />
              <p className="font-display font-black text-2xl">Quét liên tục</p>
              {window.location.protocol === "http:" && cameraHttpsUrl() && (
                <a href={cameraHttpsUrl()} className="btn-lime mt-4 inline-flex w-full justify-center py-3 text-ink-900">
                  Mở HTTPS để bật camera
                </a>
              )}
              {!liveOk && (
                <details className="text-left text-sm text-white/80 mt-4">
                  <summary className="cursor-pointer text-lime-400 font-bold">Camera bị chặn?</summary>
                  <ol className="list-decimal pl-5 space-y-1 text-white/70 mt-2">
                    <li>
                      Tải{" "}
                      <a className="text-lime-400 underline" href="/taphoa-ca.crt">
                        chứng chỉ
                      </a>
                    </li>
                    <li>Cài đặt → Cài profile</li>
                    <li>Cài đặt chung → Giới thiệu → Tin cậy chứng chỉ → bật mkcert</li>
                    <li>Tải lại trang</li>
                  </ol>
                </details>
              )}
              {err && <p className="text-coral-400 text-sm mt-3">{err}</p>}
              <button type="button" className="btn-lime w-full mt-6 py-3 text-ink-900" onClick={startScan}>
                Bắt đầu quét
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="p-4 bg-ink-900 safe-bottom space-y-3">
        {err && running && <div className="text-coral-400 text-sm">{err}</div>}
        {last?.product ? (
          <div>
            <div className="text-lg font-bold flex items-center gap-2">
              <ProductImage src={last.product.image_url} emoji={last.product.emoji} alt={last.product.name} className="h-8 w-8" />
              {last.product.name}
            </div>
            <div className="font-mono text-xs text-white/50 mt-1">{last.barcode}</div>
          </div>
        ) : last?.barcode ? (
          <div>
            <div className="text-lime-300 font-mono text-lg tracking-wide">{last.barcode}</div>
            <div className="text-coral-400 text-sm mt-1">Chưa có trên kệ — nhập tên, giá ở máy quầy</div>
          </div>
        ) : (
          <div className="text-ink-400">{running ? "Đang tìm vạch mã…" : "Ghép xong — sẵn sàng quét."}</div>
        )}
        {running && (
          <div className="flex gap-2">
            {hasTorch && (
              <button type="button" className="btn-ghost px-3" onClick={toggleTorch}>
                {torchOn ? "Tắt đèn" : "Đèn pin"}
              </button>
            )}
            <input
              className="input flex-1 text-ink-900 font-mono"
              inputMode="numeric"
              placeholder="Gõ tay nếu lóa quá"
              value={manual}
              onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))}
            />
            <button
              type="button"
              className="btn-lime text-ink-900 px-4"
              disabled={manual.length < 8}
              onClick={() => {
                void pushCode(manual);
                setManual("");
              }}
            >
              Gửi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
