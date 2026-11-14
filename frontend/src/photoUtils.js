// Utilities for handling Student Photo attributes (browse, drag-drop, clipboard paste, and sample avatar).

export const PHOTO_KEY = "Student Photo";

export function isImageDataUrl(val) {
  return typeof val === "string" && val.startsWith("data:image/");
}

/**
 * Resizes and compresses an image Blob/File or data URL into a compact passport-sized JPEG data URL
 * so it can be salted and hashed into the credential Merkle tree.
 */
export function compressImageToDataUrl(source, maxSize = 160, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext("2d");

        // Fill white background for transparent PNGs
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, maxSize, maxSize);

        // Center-crop square (passport photo aspect ratio)
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, maxSize, maxSize);

        const out = canvas.toDataURL("image/jpeg", quality);
        resolve(out);
      } catch (err) {
        reject(new Error("Could not process image."));
      }
    };
    img.onerror = () => reject(new Error("Could not load image from the provided file or clipboard."));

    if (typeof source === "string") {
      img.src = source;
    } else if (source instanceof Blob) {
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target.result; };
      reader.onerror = () => reject(new Error("Could not read image file."));
      reader.readAsDataURL(source);
    } else {
      reject(new Error("Unsupported image source."));
    }
  });
}

/**
 * Generates a clean passport-style sample student portrait as a JPEG data URL
 * for instant 1-click demos when no local photo file is handy.
 */
export function createSampleStudentPhoto(name = "Asha Rao") {
  const size = 160;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Soft studio backdrop gradient
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#ede7ff");
  grad.addColorStop(1, "#d8e7ff");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle ID card corner frame marks
  ctx.strokeStyle = "#6d3df2";
  ctx.lineWidth = 2;
  const m = 10, l = 14;
  ctx.beginPath();
  ctx.moveTo(m, m + l); ctx.lineTo(m, m); ctx.lineTo(m + l, m);
  ctx.moveTo(size - m - l, m); ctx.lineTo(size - m, m); ctx.lineTo(size - m, m + l);
  ctx.stroke();

  // Shoulders / blazer silhouette
  ctx.fillStyle = "#2b235a";
  ctx.beginPath();
  ctx.ellipse(size / 2, size + 10, 58, 48, 0, Math.PI, 0, false);
  ctx.fill();

  // Collar / shirt
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(size / 2 - 16, size - 36);
  ctx.lineTo(size / 2, size - 12);
  ctx.lineTo(size / 2 + 16, size - 36);
  ctx.closePath();
  ctx.fill();

  // Neck
  ctx.fillStyle = "#e0a882";
  ctx.fillRect(size / 2 - 11, 86, 22, 22);

  // Hair (back)
  ctx.fillStyle = "#1f1833";
  ctx.beginPath();
  ctx.arc(size / 2, 64, 34, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = "#eab691";
  ctx.beginPath();
  ctx.ellipse(size / 2, 66, 26, 31, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair (front parted)
  ctx.fillStyle = "#1f1833";
  ctx.beginPath();
  ctx.arc(size / 2, 54, 27, Math.PI, 0, false);
  ctx.quadraticCurveTo(size / 2 - 8, 46, size / 2 - 27, 62);
  ctx.closePath();
  ctx.fill();

  // Eyes
  ctx.fillStyle = "#1b1740";
  ctx.beginPath();
  ctx.arc(size / 2 - 9, 64, 2.5, 0, Math.PI * 2);
  ctx.arc(size / 2 + 9, 64, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = "#9e5842";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(size / 2, 73, 7, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  // Initials badge in bottom right
  const initials = (name || "Student")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  ctx.fillStyle = "#6d3df2";
  ctx.beginPath();
  ctx.arc(size - 24, size - 24, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials || "ST", size - 24, size - 23);

  return canvas.toDataURL("image/jpeg", 0.88);
}

