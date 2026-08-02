import { io } from "socket.io-client";

const port = Number(process.env.PORT || 4000);
const baseUrl = String(process.env.SMOKE_BASE_URL || `http://localhost:${port}`).replace(/\/$/, "");
const isletmeSlug = String(process.env.SMOKE_ISLETME || "burger-plus").trim().toLowerCase();

async function jsonGetir(yol, tenantGerekli = false) {
  const headers = tenantGerekli ? { "X-Isletme": isletmeSlug } : {};
  const yanit = await fetch(`${baseUrl}${yol}`, { headers });
  const tip = yanit.headers.get("content-type") || "";
  const veri = tip.includes("application/json") ? await yanit.json() : await yanit.text();
  if (!yanit.ok) {
    const mesaj = typeof veri === "object" ? veri?.hata : veri;
    throw new Error(`${yol} başarısız (HTTP ${yanit.status}): ${mesaj || "Bilinmeyen hata"}`);
  }
  return veri;
}

async function socketiDogrula() {
  const socket = io(baseUrl, {
    auth: { isletme: isletmeSlug },
    reconnection: false,
    timeout: 5000,
  });

  try {
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
  } finally {
    socket.close();
  }
}

try {
  const saglik = await jsonGetir("/saglik");
  const { isletme } = await jsonGetir(`/api/isletme/${encodeURIComponent(isletmeSlug)}`);
  const { urunler = [] } = await jsonGetir("/api/urunler", true);
  await socketiDogrula();
  console.log(`Smoke test başarılı: ${saglik.durum || "ok"}, ${isletme.ad}, ${urunler.length} ürün, socket bağlı.`);
} catch (hata) {
  console.error("Smoke test başarısız:", hata?.message || hata);
  process.exitCode = 1;
}
