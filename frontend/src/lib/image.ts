/**
 * Thu nhỏ ảnh trước khi tải lên: ảnh chụp điện thoại thường 3–6 MB, 4000px — kệ hàng
 * chỉ cần ~1000px. Trả về JPEG nhẹ để tải nhanh cả khi dùng 4G.
 */
export async function shrinkImage(file: Blob, maxSide = 1000, quality = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Không đọc được ảnh này"));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    return blob || file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
