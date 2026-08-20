// ============================================================================
// Burger Plus — Backend sunucusu (PostgreSQL)
// Express (HTTP API) + Socket.io (anlik guncelleme) + PostgreSQL (kalici veri).
//
// Cok-telefon senaryosu: ayni masaya baglanan herkes o masanin "odasina"
// katilir. Biri urun eklediginde o odadaki HERKESE aninda haber gider.
// ============================================================================

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pool, {
  tablolariHazirla,
  masaSiparisleriniGetir,
  kalemEkle,
  masaDurumGuncelle,
  tumAcikMasalar,
  masaKapat,
  kullaniciProfilGuncelle,
  kullaniciSiparisleriniGetir,
  davetOzetiniGetir,
  odemeTaslagiOlustur,
  odemeSimulasyonOnayla,
  odemeIyzicoOlarakOnayla,
  odemeCuzdanlaOnayla,
  odemeGetir,
  odemeSaglayiciTokenKaydet,
  odemeSaglayiciTokeniniGetir,
  iyzicoTokeniyleOdemeGetir,
  odemeMutfagaAktarildi,
  nakitMasaDurumunuGetir,
  nakitMasalariniGetir,
  nakitMasasiniAc,
  nakitSiparisOlustur,
  nakitSiparisiOnayla,
  nakitSiparisiReddet,
  nakitSiparisiTahsilEt,
  suresiDolanStokRezervasyonlariniBirak,
  siparisStogunuKesinlestir,
} from "./db.js";
import { iyzicoCheckoutBaslat, iyzicoSonucuGetir, iyzicoDonusAdresi } from "./iyzico.js";
import {
  adminTablolariHazirla,
  ilkYerelAdminOlustur,
  yerelAdminKurulumGerekli,
  urunleriGetir,
  onerileriGetir,
  urunKaydet,
  urunAktiflikDegistir,
  urunArsivle,
  kategorileriGetir,
  kategoriKaydet,
  personelleriGetir,
  personelKaydet,
  vardiyaDegistir,
  dashboardGetir,
  satisRaporuGetir,
  duyurulariGetir,
  duyuruKaydet,
  kampanyalariGetir,
  kampanyaKaydet,
  kategoriArsivle,
  personelArsivle,
  duyuruArsivle,
  kampanyaArsivle,
  yonetimVarliginiGetir,
  revizyonKaydet,
  revizyonKayitlariniGetir,
  canliSatislariGetir,
  gecmisSatislariGetir,
  mutfakKayitlariniGetir,
  musteriKayitlariniGetir,
  personelKayitlariniGetir,
  kurulumAyarlariGetir,
  eksikCevirileriTamamla,
} from "./adminDb.js";
import { ceviriYapilandirmasi } from "./ceviri.js";
import {
  gorselYukle, logoYukle, storageDosyasiniSil,
  sikayetGorseliYukle, sikayetGorseliKullaniciyaAitMi,
} from "./storage.js";
import { temaCoz } from "./konseptler.js";
import {
  kayitOl, girisYap, girisYapGenel, korumaliMiddleware, adminMiddleware, rolMiddleware,
  opsiyonelKullaniciMiddleware, tokenDogrula,
  sifirlamaTalepEt, sifirlamaTokenGecerliMi, sifreyiSifirla,
  ikiFaktorGirisiniTamamla, ikiFaktorKurulumBaslat, ilkGirisSifreBelirle,
  ikiFaktorKurulumOnayla, ikiFaktorDevreDisiBirak,
  superAdminGiris, superAdminIkiFaktorGirisiniTamamla, superAdminMiddleware,
  superAdminErisimTokeniUret, impersonationTokeniniDogrula,
  masaErisimTokeniUret, masaErisimTokeniniDogrula,
} from "./auth.js";
import {
  sadakatTablolariHazirla, sadakatOzetiniGetir, puanlaOdulSatinAl,
  kullaniciOdulunuSipariseDonustur, adminOdulleriGetir, adminOdulKaydet, adminOdulArsivle,
  sadakatAyariniGetir, adminSadakatAyariniGetir, adminSadakatAyariniKaydet,
  sadakatCevirisiniTamamla,
} from "./sadakatDb.js";
import {
  cuzdanTablolariHazirla, cuzdanAyariniGetir, adminCuzdanAyariniKaydet,
  cuzdanOzetiniGetir, kasaMusteriAra, kasaSonYuklemeleriGetir, kasadanCuzdanYukle, adminCuzdanRaporunuGetir,
} from "./cuzdanDb.js";
import {
  isletmeTablosunuHazirla, isletmeMigrationunuCalistir, isletmeSlugIleGetir, isletmeIdIleGetir,
  isletmeOlustur, isletmeTemasiniGuncelle, isletmeLogosunuGuncelle, isletmeTemaCevirisiniTamamla,
} from "./isletmeDb.js";
import {
  superAdminTablolariniHazirla, ilkSuperAdminiHazirla,
  superAdminKaydiEkle, superAdminKayitlariniGetir, superIsletmeleriGetir,
  superIsletmeDetayiGetir, superIsletmeBilgileriniGuncelle, superIsletmeDurumunuGuncelle,
  superIsletmeSilmeOzeti, superIsletmeyiYumusakSil, platformOzetiniGetir,
  ciroRaporunuGetir, buyumeRaporunuGetir, siparisRaporunuGetir, kullaniciRaporunuGetir,
  abonelikleriGetir, abonelikOlustur, abonelikGuncelle, gelirRaporunuGetir,
  isletmeAdminleriniGetir, isletmeAdminHesabiniAyarla, isletmeAdmininiGuncelle, isletmeAdmininiSil,
} from "./superAdminDb.js";
import { sablonuGetir, slugOlustur } from "./sablonlar.js";
import { isletmeKurulumunuYap, slugMusaitlikDurumu } from "./kurulumDb.js";
import {
  personelCagriTablolariHazirla, masaCagriOturumuBaslat, masaPersonelCagrisiniGetir,
  masaPersonelCagrisiOlustur, aktifPersonelCagrilariniGetir,
  personelCagrisiDurumGuncelle, masaCagriOturumlariniKapat,
} from "./personelCagriDb.js";
import {
  sikayetTablosunuHazirla, musteriSikayetleriniGetir, sikayetOlustur,
  adminSikayetleriniGetir, adminSikayetGuncelle,
} from "./sikayetDb.js";
import { rezervasyonTablosunuHazirla, rezervasyonlariGetir, rezervasyonOlustur, rezervasyonGuncelle, rezervasyonSil } from "./rezervasyonDb.js";
import { salonKrokisiniGetir, salonKrokisiniKaydet } from "./salonKrokiDb.js";
import { degerlendirmeTablolariniHazirla, siparisDegerlendirmesiOlustur, adminDegerlendirmeRaporunuGetir } from "./degerlendirmeDb.js";

const app = express();
app.disable("x-powered-by");
const URETIM = process.env.NODE_ENV === "production";
if (URETIM) app.set("trust proxy", 1);
function originiNormallestir(origin) {
  const ham = String(origin || "").trim();
  if (!ham) return "";
  const protokollu = /^https?:\/\//i.test(ham)
    ? ham
    : /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(ham) ? `http://${ham}` : `https://${ham}`;
  try {
    const url = new URL(protokollu);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : "";
  } catch {
    return "";
  }
}
const izinliOriginler = new Set(
  [process.env.FRONTEND_URL, "https://burgerplus.vercel.app", ...(process.env.CORS_ORIGINS || "").split(",")]
    .map(originiNormallestir)
    .filter(Boolean)
);
if (!URETIM) {
  ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:5175"]
    .forEach((origin) => izinliOriginler.add(origin));
}
function originIzinli(origin) {
  return !origin || izinliOriginler.has(originiNormallestir(origin));
}
const corsAyarlari = {
  origin(origin, callback) {
    if (originIzinli(origin)) return callback(null, true);
    const hata = new Error("Bu origin icin CORS izni yok.");
    hata.kod = "CORS_ENGELLENDI";
    callback(hata);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Isletme", "X-Masa-Token", "X-Masa-Oturum"],
};
// İyzico'nun ödeme sayfası callback'i tarayıcıdan otomatik form-post ile
// gönderir; bu istek kendi domainini Origin header'ında taşır ve frontend
// allowlist'inde olmadığı için engellenirdi. Bu rota bizim JS'imizden değil
// doğrudan İyzico'dan geldiği için origin allowlist'inin dışında tutulur.
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use((req, res, next) => {
  if (req.path === "/api/odeme/iyzico/callback") return next();
  cors(corsAyarlari)(req, res, next);
});
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
const genelApiLimiti = rateLimit({
  windowMs: 60_000,
  limit: URETIM ? 300 : 1200,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) => req.originalUrl.startsWith("/api/admin/"),
  message: { hata: "Çok fazla istek gönderildi. Lütfen kısa süre sonra tekrar deneyin." },
});
const yonetimApiLimiti = rateLimit({
  windowMs: 60_000,
  limit: URETIM ? 600 : 1800,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { hata: "Yönetim paneli istek sınırına ulaştı. Lütfen kısa süre sonra tekrar deneyin." },
});
app.use("/api/admin", yonetimApiLimiti);
app.use("/api", genelApiLimiti);
const kimlikLimiti = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
const sifreSifirlamaLimiti = rateLimit({
  windowMs: 15 * 60_000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false,
  message: { hata: "Çok fazla istek gönderildi. Lütfen kısa süre sonra tekrar deneyin." },
});
const ikiFaktorLimiti = rateLimit({
  windowMs: 10 * 60_000, limit: 15, standardHeaders: "draft-8", legacyHeaders: false,
  message: { hata: "Çok fazla iki adımlı doğrulama denemesi yapıldı. Lütfen daha sonra tekrar deneyin." },
});
const superAdminGirisLimiti = rateLimit({
  windowMs: 15 * 60_000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false,
  message: { hata: "Çok fazla super admin giriş denemesi yapıldı. 15 dakika sonra tekrar deneyin." },
});
const nakitSiparisLimiti = rateLimit({
  windowMs: 5 * 60_000, limit: URETIM ? 12 : 60, standardHeaders: "draft-8", legacyHeaders: false,
  message: { hata: "Çok fazla nakit sipariş isteği gönderildi. Lütfen personelden yardım isteyin." },
});
const personelCagriOturumLimiti = rateLimit({
  // Restoran Wi-Fi'sindeki tüm müşteriler aynı dış IP'yi paylaşabilir. Asıl
  // kötüye kullanım sınırı aşağıdaki masa/cihaz kurallarıdır; IP limiti kaba emniyet ağıdır.
  windowMs: 15 * 60_000, limit: URETIM ? 120 : 300, standardHeaders: "draft-8", legacyHeaders: false,
  message: { hata: "Çok fazla masa oturumu istendi. Lütfen personelden yardım isteyin." },
});
const personelCagriLimiti = rateLimit({
  windowMs: 10 * 60_000, limit: URETIM ? 120 : 300, standardHeaders: "draft-8", legacyHeaders: false,
  message: { hata: "Çok fazla personel çağrısı gönderildi. Lütfen bir süre bekleyin." },
});
const sikayetLimiti = rateLimit({
  windowMs: 15 * 60_000, limit: URETIM ? 60 : 180, standardHeaders: "draft-8", legacyHeaders: false,
  message: { hata: "Çok fazla geri bildirim isteği gönderildi. Lütfen kısa süre sonra tekrar deneyin." },
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsAyarlari,
});
const oda = (isletmeId, ad) => `i${isletmeId}:${ad}`;

// --- HTTP API ---

// Tenant bilgisini öğrenmek için kullanılan bu uç, doğal olarak henüz
// X-Isletme başlığı gerektirmez. Diğer /api uçları aşağıdaki middleware'den geçer.
function temaliIsletmeYaniti(isletme) {
  return {
    isletme: {
      id: isletme.id,
      slug: isletme.slug,
      ad: isletme.ad,
      konsept: isletme.konsept,
      logoUrl: isletme.logoUrl,
      aktif: isletme.aktif,
    },
    tema: temaCoz(isletme),
  };
}

app.get("/api/isletme/:slug", async (req, res) => {
  const isletme = await isletmeSlugIleGetir(req.params.slug);
  if (!isletme) return res.status(404).json({ hata: "İşletme bulunamadı." });
  if (!isletme.aktif) {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const erisim = token ? await impersonationTokeniniDogrula(token, isletme.id) : null;
    if (!erisim) return res.status(404).json({ hata: "İşletme bulunamadı." });
  }
  res.json(temaliIsletmeYaniti(isletme));
});

// Tek panelden giris: hangi isletmeye ait oldugu X-Isletme header'i olmadan,
// yalnizca e-posta+sifreden bulunur (bkz. auth.js#girisYapGenel). Bu yuzden
// isletmeMiddleware'den ONCE tanimli olmali; aksi halde header zorunlu hale gelir.
app.post("/api/giris-genel", kimlikLimiti, async (req, res) => {
  const sonuc = await girisYapGenel(req.body);
  if (sonuc.hata) return res.status(401).json(sonuc);
  res.json(sonuc);
});

async function isletmeMiddleware(req, res, next) {
  try {
    if (req.path === "/super" || req.path.startsWith("/super/")) return next();
    const callbackMu = req.method === "POST" && req.path === "/odeme/iyzico/callback";
    const eskiDonusMu = req.method === "GET" && /^\/odeme\/iyzico\/[^/]+\/odeme-basarili$/.test(req.path);
    if (callbackMu || eskiDonusMu) return next();
    const slug = req.headers["x-isletme"] || req.query.isletme;
    if (!slug) return res.status(400).json({ hata: "İşletme belirtilmedi." });
    const isletme = await isletmeSlugIleGetir(slug);
    if (!isletme) return res.status(404).json({ hata: "İşletme bulunamadı." });
    if (!isletme.aktif) {
      const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      const erisim = token ? await impersonationTokeniniDogrula(token, isletme.id) : null;
      if (!erisim) return res.status(404).json({ hata: "İşletme bulunamadı." });
    }
    req.isletme = isletme;
    next();
  } catch (hata) {
    next(hata);
  }
}

app.use("/api", isletmeMiddleware);

// Kayit ol
app.post("/api/kayit", kimlikLimiti, async (req, res) => {
  const sonuc = await kayitOl(req.isletme.id, req.body);
  if (sonuc.hata) return res.status(400).json(sonuc);
  res.json(sonuc);
});

// Giris yap
app.post("/api/giris", kimlikLimiti, async (req, res) => {
  const sonuc = await girisYap(req.isletme.id, req.body);
  if (sonuc.hata) return res.status(401).json(sonuc);
  res.json(sonuc);
});

app.post("/api/giris/2fa", ikiFaktorLimiti, async (req, res) => {
  const sonuc = await ikiFaktorGirisiniTamamla(req.isletme.id, req.body?.ikiFaktorToken, req.body?.kod);
  if (sonuc.hata) return res.status(401).json(sonuc);
  res.json(sonuc);
});

// Geçici şifreyle girişten sonraki zorunlu adım: bkz. auth.js#girisYap
// (sifreDegisimGerekli) ve #ilkGirisSifreBelirle.
app.post("/api/giris/ilk-sifre", ikiFaktorLimiti, async (req, res) => {
  const sonuc = await ilkGirisSifreBelirle(req.isletme.id, req.body?.gecisToken, req.body?.yeniSifre);
  if (sonuc.hata) return res.status(400).json(sonuc);
  res.json(sonuc);
});

// Sifremi unuttum: talep her zaman ayni mesajla doner (kullanici sizdirmaz).
app.post("/api/sifre-sifirlama-talep", sifreSifirlamaLimiti, async (req, res) => {
  await sifirlamaTalepEt(req.isletme.id, req.isletme.slug, req.body?.email);
  res.json({ mesaj: "E-posta adresiniz kayıtlıysa sıfırlama bağlantısı gönderildi." });
});

app.get("/api/sifre-sifirla/dogrula", async (req, res) => {
  res.json({ gecerli: await sifirlamaTokenGecerliMi(req.isletme.id, req.query?.token) });
});

app.post("/api/sifre-sifirla", async (req, res) => {
  const sonuc = await sifreyiSifirla(req.isletme.id, req.body?.token, req.body?.yeniSifre);
  if (sonuc.hata) return res.status(400).json(sonuc);
  res.json(sonuc);
});

// Ben kimim (token ile guncel kullanici bilgisi — sayfa yenilenince oturum korunur)
app.get("/api/ben", korumaliMiddleware(), (req, res) => {
  res.json({ kullanici: req.kullanici });
});

app.post("/api/2fa/kurulum-baslat", ikiFaktorLimiti, korumaliMiddleware(), async (req, res) => {
  const sonuc = await ikiFaktorKurulumBaslat(req.isletme.id, req.kullanici.id, req.body?.sifre);
  if (sonuc.hata) return res.status(400).json(sonuc);
  res.json(sonuc);
});

app.post("/api/2fa/kurulum-onayla", ikiFaktorLimiti, korumaliMiddleware(), async (req, res) => {
  const sonuc = await ikiFaktorKurulumOnayla(req.isletme.id, req.kullanici.id, req.body?.kod);
  if (sonuc.hata) return res.status(400).json(sonuc);
  res.json(sonuc);
});

app.post("/api/2fa/kapat", ikiFaktorLimiti, korumaliMiddleware(), async (req, res) => {
  const sonuc = await ikiFaktorDevreDisiBirak(req.isletme.id, req.kullanici.id, req.body?.sifre, req.body?.kod);
  if (sonuc.hata) return res.status(400).json(sonuc);
  res.json(sonuc);
});

app.get("/api/davetim", korumaliMiddleware(), async (req, res) => {
  try {
    res.json({ davet: await davetOzetiniGetir(req.isletme.id, req.kullanici.id) });
  } catch (e) {
    res.status(400).json({ hata: e.message || "Davet bilgileri alınamadı." });
  }
});

// Profil guncelle (email + telefon; ad/soyad/cinsiyet degismez)
app.post("/api/profil", korumaliMiddleware(), async (req, res) => {
  const { email, telefon } = req.body || {};
  const sonuc = await kullaniciProfilGuncelle(req.isletme.id, req.kullanici.id, { email, telefon });
  if (sonuc.hata) return res.status(400).json(sonuc);
  res.json(sonuc);
});

app.get("/api/siparislerim", korumaliMiddleware(), async (req, res) => {
  res.json({ siparisler: await kullaniciSiparisleriniGetir(req.isletme.id, req.kullanici.id) });
});
app.post("/api/siparislerim/:id/degerlendirme", korumaliMiddleware(), async (req, res) => {
  try {
    const degerlendirme = await siparisDegerlendirmesiOlustur(req.isletme.id, req.kullanici.id, req.params.id, req.body || {}, pool);
    io.to(oda(req.isletme.id, "yonetim")).emit("degerlendirmeler-guncellendi", { id: degerlendirme.id });
    res.status(201).json({ degerlendirme });
  } catch (e) { res.status(e.status || 400).json({ hata: e.message || "Değerlendirme kaydedilemedi." }); }
});

app.get("/api/sadakat", korumaliMiddleware(), async (req, res) => {
  try {
    res.json({ sadakat: await sadakatOzetiniGetir(req.isletme.id, pool, req.kullanici.id) });
  } catch (e) {
    res.status(400).json({ hata: e.message || "Sadakat bilgileri alinamadi." });
  }
});

app.get("/api/cuzdan", korumaliMiddleware(), async (req, res) => {
  try {
    res.json({ cuzdan: await cuzdanOzetiniGetir(req.isletme.id, pool, req.kullanici.id) });
  } catch (e) {
    res.status(400).json({ hata: e.message || "Cüzdan bilgileri alınamadı." });
  }
});

app.post("/api/sadakat/oduller/:id/satin-al", korumaliMiddleware(), async (req, res) => {
  try {
    await puanlaOdulSatinAl(req.isletme.id, pool, req.kullanici.id, req.params.id, req.body?.istekAnahtari);
    res.json({ sadakat: await sadakatOzetiniGetir(req.isletme.id, pool, req.kullanici.id) });
  } catch (e) {
    res.status(400).json({ hata: e.message || "Odul alinamadi." });
  }
});

app.post("/api/sadakat/hediyeler/:id/kullan", korumaliMiddleware(), async (req, res) => {
  try {
    const kisiAdi = `${req.kullanici.ad} ${req.kullanici.soyad}`.trim();
    const odeme = await kullaniciOdulunuSipariseDonustur(
      req.isletme.id, pool, req.kullanici.id, req.params.id, req.body?.masaNo, kisiAdi
    );
    await onaylananOdemeyiMutfagaAktar(odeme);
    res.json({
      odeme: { ...odeme, mutfagaAktarildi: true },
      sadakat: await sadakatOzetiniGetir(req.isletme.id, pool, req.kullanici.id),
    });
  } catch (e) {
    res.status(400).json({ hata: e.message || "Hediye kullanilamadi." });
  }
});

app.get("/api/masa/:masaNo", async (req, res) => {
  const masaNo = guvenliMasaNo(req.params.masaNo);
  if (!masaNo) return res.status(400).json({ hata: "Masa numarasi gecersiz." });
  if (!masaErisimTokeniniDogrula(req.headers["x-masa-token"], req.isletme.id, masaNo)) {
    return res.status(403).json({ hata: "Masa QR erisimi gecersiz." });
  }
  res.json(await masaSiparisleriniGetir(req.isletme.id, masaNo));
});

async function personelCagrilariniYayinla(isletmeId) {
  const cagrilar = await aktifPersonelCagrilariniGetir(isletmeId, pool);
  io.to(oda(isletmeId, "salon")).emit("personel-cagrilari-guncellendi", cagrilar);
  return cagrilar;
}

app.post("/api/masa/:masaNo/cagri-oturumu", personelCagriOturumLimiti, async (req, res) => {
  try {
    const masaNo = guvenliMasaNo(req.params.masaNo);
    if (!masaNo) return res.status(400).json({ hata: "Masa numarası geçersiz." });
    if (!masaErisimTokeniniDogrula(req.headers["x-masa-token"], req.isletme.id, masaNo)) {
      return res.status(403).json({ hata: "Masa QR erişimi geçersiz." });
    }
    const oturum = await masaCagriOturumuBaslat(req.isletme.id, pool, masaNo, req.body?.cihazAnahtari);
    res.status(201).json({ oturum });
  } catch (e) { res.status(e.status || 400).json({ hata: e.message || "Masa oturumu açılamadı." }); }
});

app.get("/api/masa/:masaNo/personel-cagrisi", async (req, res) => {
  try {
    const masaNo = guvenliMasaNo(req.params.masaNo);
    if (!masaNo) return res.status(400).json({ hata: "Masa numarası geçersiz." });
    const cagri = await masaPersonelCagrisiniGetir(req.isletme.id, pool, masaNo, req.headers["x-masa-oturum"]);
    res.json({ cagri });
  } catch (e) { res.status(e.status || 400).json({ hata: e.message || "Personel çağrısı alınamadı." }); }
});

app.post("/api/masa/:masaNo/personel-cagrisi", personelCagriLimiti, async (req, res) => {
  try {
    const masaNo = guvenliMasaNo(req.params.masaNo);
    if (!masaNo) return res.status(400).json({ hata: "Masa numarası geçersiz." });
    const cagri = await masaPersonelCagrisiOlustur(
      req.isletme.id, pool, masaNo, req.headers["x-masa-oturum"], req.body?.neden, req.body?.istekAnahtari
    );
    io.to(oda(req.isletme.id, `masa-${masaNo}`)).emit("personel-cagrisi-guncellendi", cagri);
    await personelCagrilariniYayinla(req.isletme.id);
    res.status(201).json({ cagri });
  } catch (e) { res.status(e.status || 400).json({ hata: e.message || "Personel çağrılamadı." }); }
});

app.get("/api/personel/personel-cagrilari", rolMiddleware(["salon", "kasiyer"]), async (req, res) => {
  res.json({ cagrilar: await aktifPersonelCagrilariniGetir(req.isletme.id, pool) });
});

app.patch("/api/personel/personel-cagrilari/:id", rolMiddleware(["salon", "kasiyer"]), async (req, res) => {
  try {
    const cagri = await personelCagrisiDurumGuncelle(req.isletme.id, pool, req.params.id, req.body?.durum, req.kullanici?.id);
    io.to(oda(req.isletme.id, `masa-${cagri.masaNo}`)).emit("personel-cagrisi-guncellendi", cagri);
    await personelCagrilariniYayinla(req.isletme.id);
    res.json({ cagri });
  } catch (e) { res.status(400).json({ hata: e.message || "Çağrı güncellenemedi." }); }
});

const rezervasyonRolu = () => rolMiddleware(["salon", "kasiyer"]);
app.get("/api/personel/rezervasyonlar", rezervasyonRolu(), async (req, res) => res.json({ rezervasyonlar: await rezervasyonlariGetir(req.isletme.id, pool, req.query) }));
app.post("/api/personel/rezervasyonlar", rezervasyonRolu(), async (req, res) => { try { res.status(201).json({ rezervasyon: await rezervasyonOlustur(req.isletme.id,pool,req.body,req.kullanici?.id) }); } catch(e){ res.status(e.status||400).json({hata:e.message||"Rezervasyon oluşturulamadı."}); } });
app.patch("/api/personel/rezervasyonlar/:id", rezervasyonRolu(), async (req,res)=>{try{res.json({rezervasyon:await rezervasyonGuncelle(req.isletme.id,pool,req.params.id,req.body,req.kullanici?.id)});}catch(e){res.status(e.status||400).json({hata:e.message||"Rezervasyon güncellenemedi."});}});
app.delete("/api/personel/rezervasyonlar/:id", rezervasyonRolu(), async (req,res)=>{try{await rezervasyonSil(req.isletme.id,pool,req.params.id);res.status(204).end();}catch(e){res.status(e.status||400).json({hata:e.message||"Rezervasyon silinemedi."});}});
app.get("/api/personel/salon-krokisi", rezervasyonRolu(), async (req, res) => {
  res.json({ kroki: await salonKrokisiniGetir(req.isletme.id, pool) });
});

app.get("/api/mutfak", rolMiddleware(["mutfak", "salon", "kasiyer"]), async (req, res) => {
  res.json(await tumAcikMasalar(req.isletme.id));
});
// Aktif ürün kataloğu müşteri uygulamasına açıktır.
app.get("/api/urunler", async (req, res) => {
  await suresiDolanStokRezervasyonlariniBirak(req.isletme.id);
  res.json({ urunler: await urunleriGetir(req.isletme.id) });
});
app.get("/api/oneriler", async (req, res) => {
  const urunIdleri = String(req.query.urunler || "")
    .split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 30);
  res.json({ urunler: await onerileriGetir(req.isletme.id, urunIdleri) });
});
app.get("/api/kategoriler", async (req, res) => {
  res.json({ kategoriler: await kategorileriGetir(req.isletme.id) });
});
app.get("/api/duyurular", async (req, res) => {
  res.json({ duyurular: await duyurulariGetir(req.isletme.id) });
});
app.get("/api/kampanyalar", async (req, res) => { res.json({ kampanyalar: await kampanyalariGetir(req.isletme.id) }); });
app.get("/api/sadakat-ayari", async (req, res) => {
  res.json({ damgaKarti: await sadakatAyariniGetir(req.isletme.id, pool) });
});

// Ödeme sağlayıcısı bağlanmadan önce de sipariş ve tutar backend'de güvenli
// taslak olarak hazırlanır. İyzico entegrasyonunda yalnızca onay endpointi
// değişecek; taslak ve mutfağa aktarım akışı aynı kalacak.
app.post("/api/odeme/taslak", opsiyonelKullaniciMiddleware(), async (req, res) => {
  try {
    const kullanici = req.kullanici || null;
    const kisiAdi = kullanici ? `${kullanici.ad} ${kullanici.soyad}` : "Misafir";
    const odeme = await odemeTaslagiOlustur(req.isletme.id, {
      kullaniciId: kullanici?.id || null,
      masaNo: req.body?.masaNo || null,
      yontem: req.body?.yontem,
      urunler: req.body?.urunler,
      kisiAdi,
    });
    res.status(201).json({ odeme });
  } catch (e) {
    res.status(400).json({ hata: e.message || "Ödeme taslağı oluşturulamadı." });
  }
});

// Yalnızca geliştirmede gerçek ödeme sağlayıcısı yerine akışı test eder.
// Render/production ortamında kapalıdır; İyzico sonucu bu endpointin yerini alır.
app.post("/api/odeme/:id/simulasyon-onay", opsiyonelKullaniciMiddleware(), async (req, res) => {
  if (URETIM || process.env.ODEME_SIMULASYON_AKTIF !== "true") {
    return res.status(404).json({ hata: "Kaynak bulunamadi." });
  }
  try {
    const sonuc = await odemeSimulasyonOnayla(req.isletme.id, req.params.id, req.kullanici?.id || null);
    const odeme = sonuc.odeme;
    await onaylananOdemeyiMutfagaAktar(odeme);
    res.json({ odeme: { ...odeme, mutfagaAktarildi: true } });
  } catch (e) {
    res.status(400).json({ hata: e.message || "Test ödemesi onaylanamadı." });
  }
});

app.post("/api/odeme/:id/cuzdan-onay", korumaliMiddleware(), async (req, res) => {
  try {
    const ayar = await cuzdanAyariniGetir(req.isletme.id, pool);
    if (!ayar.aktif) return res.status(403).json({ hata: "Cüzdan ödemeleri şu anda kullanılamıyor." });
    const sonuc = await odemeCuzdanlaOnayla(req.isletme.id, req.params.id, req.kullanici.id);
    const odeme = sonuc.odeme;
    await onaylananOdemeyiMutfagaAktar(odeme);
    res.json({ odeme: { ...odeme, mutfagaAktarildi: true }, cuzdan: await cuzdanOzetiniGetir(req.isletme.id, pool, req.kullanici.id) });
  } catch (e) {
    res.status(400).json({ hata: e.message || "Cüzdan ödemesi tamamlanamadı." });
  }
});

app.post("/api/odeme/:id/iyzico-baslat", opsiyonelKullaniciMiddleware(), async (req, res) => {
  try {
    const odeme = await odemeGetir(req.isletme.id, req.params.id);
    if (!odeme) return res.status(404).json({ hata: "Ödeme taslağı bulunamadı." });
    if (odeme.kullaniciId && !req.kullanici) return res.status(401).json({ hata: "Bu ödeme için giriş gerekli." });
    if (req.kullanici && odeme.kullaniciId && Number(req.kullanici.id) !== Number(odeme.kullaniciId)) {
      return res.status(403).json({ hata: "Bu ödeme taslağı başka bir hesaba ait." });
    }
    if (odeme.durum !== "bekliyor") return res.status(400).json({ hata: "Bu ödeme taslağı yeniden başlatılamaz." });
    const form = await iyzicoCheckoutBaslat(odeme, req.body?.alici, req.ip);
    await odemeSaglayiciTokenKaydet(req.isletme.id, odeme.id, form.token);
    res.json({ paymentPageUrl: form.paymentPageUrl });
  } catch (e) {
    console.error("İyzico ödeme formu başlatılamadı:", {
      mesaj: e.message,
      kod: e.iyzicoKod || "yok",
      ortam: String(process.env.IYZICO_BASE_URL || "sandbox").trim(),
    });
    res.status(400).json({ hata: e.message || "İyzico ödeme formu başlatılamadı." });
  }
});

app.post("/api/odeme/iyzico/callback", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  let odeme = null;
  try {
    if (!token) throw new Error("İyzico ödeme tokenı bulunamadı.");
    odeme = await iyzicoTokeniyleOdemeGetir(token);
    if (!odeme) throw new Error("Ödeme oturumu bulunamadı.");
    const callbackIsletmesi = await isletmeIdIleGetir(odeme.isletmeId);
    if (!callbackIsletmesi?.aktif) throw new Error("Ödemeye ait işletme bulunamadı.");
    odeme.slug = callbackIsletmesi.slug;
    await iyzicoOdemesiniKesinlestir(odeme, token);
    res.redirect(303, iyzicoDonusAdresi(odeme.slug, odeme.id));
  } catch (e) {
    console.error("İyzico callback:", e.message);
    const donus = iyzicoDonusAdresi(odeme?.slug || "burger-plus", odeme?.id || "");
    const ayirac = donus.includes("?") ? "&" : "?";
    res.redirect(303, `${donus}${ayirac}odemeHatasi=${encodeURIComponent("Ödeme onaylanamadı.")}`);
  }
});

// Callback ağ/proxy/yönlendirme nedeniyle tamamlanamazsa sonuç sayfası aynı
// token'ı sunucu tarafında İyzico'dan sorgulayarak ödemeyi güvenle kesinleştirir.
app.post("/api/odeme/:id/iyzico-dogrula", opsiyonelKullaniciMiddleware(), async (req, res) => {
  try {
    const odeme = await odemeGetir(req.isletme.id, req.params.id);
    if (!odeme) return res.status(404).json({ hata: "Ödeme bulunamadı." });
    if (odeme.kullaniciId && !req.kullanici) return res.status(401).json({ hata: "Bu ödeme için giriş gerekli." });
    if (req.kullanici && odeme.kullaniciId && Number(req.kullanici.id) !== Number(odeme.kullaniciId)) {
      return res.status(403).json({ hata: "Bu ödeme başka bir hesaba ait." });
    }
    if (odeme.durum === "basarili") {
      await onaylananOdemeyiMutfagaAktarGuvenli(odeme);
      return res.json({ odeme });
    }
    const token = await odemeSaglayiciTokeniniGetir(req.isletme.id, odeme.id);
    if (!token) return res.status(409).json({ hata: "İyzico ödeme oturumu henüz hazır değil." });
    const kesinlesen = await iyzicoOdemesiniKesinlestir(odeme, token);
    res.json({ odeme: kesinlesen });
  } catch (e) {
    console.error("İyzico ödeme yeniden doğrulama:", { odemeId: req.params.id, mesaj: e.message });
    res.status(409).json({ hata: e.message || "Ödeme henüz doğrulanamadı." });
  }
});

// FRONTEND_URL geçmişte protokolsüz girildiyse Express mutlak Vercel adresini
// backend altında göreli bir yol sanıyordu. Eski dönüş linklerini güvenli,
// yapılandırılmış frontend adresine taşıyan uyumluluk rotası.
app.get("/api/odeme/iyzico/:yanlisHost/odeme-basarili", (req, res) => {
  const odemeId = String(req.query?.odeme || "").trim();
  const slug = String(req.query?.isletme || "burger-plus").trim();
  res.redirect(303, iyzicoDonusAdresi(slug, odemeId));
});

app.get("/api/odeme/:id/sonuc", opsiyonelKullaniciMiddleware(), async (req, res) => {
  let odeme = await odemeGetir(req.isletme.id, req.params.id);
  if (!odeme) return res.status(404).json({ hata: "Ödeme bulunamadı." });
  if (odeme.kullaniciId && !req.kullanici) return res.status(401).json({ hata: "Bu ödeme için giriş gerekli." });
  if (req.kullanici && odeme.kullaniciId && Number(req.kullanici.id) !== Number(odeme.kullaniciId)) {
    return res.status(403).json({ hata: "Bu ödeme başka bir hesaba ait." });
  }
  // Sağlayıcı ödemeyi onayladıktan sonra mutfak aktarımı geçici bir DB/socket
  // hatasıyla yarıda kalmış olabilir. Kalem ekleme işlemi ödeme kimliğiyle
  // idempotent olduğundan sonuç sorgusu güvenle yeniden deneyebilir.
  if (odeme.durum === "basarili" && !odeme.mutfagaAktarildi) {
    await onaylananOdemeyiMutfagaAktarGuvenli(odeme);
    odeme = await odemeGetir(req.isletme.id, req.params.id) || odeme;
  }
  res.json({ odeme });
});

app.post("/api/yerel-admin-kurulum", yerelAdminKurulum);
app.get("/api/yerel-admin-durum", async (req, res) => {
  const ip = req.socket.remoteAddress || "";
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) return res.json({ kurulumGerekli: false });
  res.json({ kurulumGerekli: await yerelAdminKurulumGerekli(req.isletme.id) });
});

async function yerelAdminKurulum(req, res) {
  try {
    const ip = req.socket.remoteAddress || "";
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) {
      return res.status(403).json({ hata: "İlk admin kurulumu yalnızca bu bilgisayardan yapılabilir." });
    }
    await ilkYerelAdminOlustur(req.isletme.id, req.body || {});
    res.json({ basarili: true });
  } catch (e) {
    res.status(400).json({ hata: e.message });
  }
}

const admin = adminMiddleware();
const guvenli = (islem) => async (req, res) => {
  try {
    const veri = await islem(req, res);
    if (!res.headersSent) res.json(veri ?? { basarili: true });
  } catch (e) {
    console.error("Admin API:", e.message);
    if (!res.headersSent) res.status(400).json({ hata: e.message || "İşlem tamamlanamadı." });
  }
};

const salonRolu = () => rolMiddleware(["salon", "kasiyer"]);
const nakitDegisikliginiYayinla = (tenantId, masaNo, siparis = null) => {
  io.to(oda(tenantId, "salon")).emit("nakit-guncellendi", { masaNo });
  if (masaNo) {
    io.to(oda(tenantId, `masa-${masaNo}`)).emit("nakit-masa-guncellendi", {
      masaNo,
      ...(siparis ? { siparis } : {}),
    });
  }
};

app.get("/api/sikayetlerim", korumaliMiddleware(), async (req, res) => {
  try {
    res.json({ sikayetler: await musteriSikayetleriniGetir(req.isletme.id, pool, req.kullanici.id) });
  } catch (e) { res.status(400).json({ hata: e.message || "Şikayetler alınamadı." }); }
});

app.post(
  "/api/sikayet-gorseli",
  sikayetLimiti,
  korumaliMiddleware(),
  express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "5mb" }),
  async (req, res) => {
    try {
      const gorselUrl = await sikayetGorseliYukle(req.body, req.isletme.id, req.kullanici.id, req.headers["content-type"]);
      res.status(201).json({ gorselUrl });
    } catch (e) { res.status(400).json({ hata: e.message || "Görsel yüklenemedi." }); }
  }
);

app.post("/api/sikayetler", sikayetLimiti, korumaliMiddleware(), async (req, res) => {
  try {
    if (!sikayetGorseliKullaniciyaAitMi(req.body?.gorselUrl, req.isletme.id, req.kullanici.id)) {
      return res.status(400).json({ hata: "Şikayet görseli bu kullanıcıya ait değil." });
    }
    const sikayet = await sikayetOlustur(req.isletme.id, pool, req.kullanici.id, req.body || {});
    io.to(oda(req.isletme.id, "yonetim")).emit("sikayetler-guncellendi", { id: sikayet.id, durum: sikayet.durum });
    res.status(201).json({ sikayet });
  } catch (e) { res.status(e.status || 400).json({ hata: e.message || "Şikayet gönderilemedi." }); }
});

app.get("/api/nakit/masa/:masaNo/durum", guvenli(async (req, res) => {
  const masaNo = guvenliMasaNo(req.params.masaNo);
  if (!masaNo) return res.status(400).json({ hata: "Masa numarasi gecersiz." });
  if (!masaErisimTokeniniDogrula(req.headers["x-masa-token"], req.isletme.id, masaNo)) {
    return res.status(403).json({ hata: "Masa QR erisimi gecersiz." });
  }
  return nakitMasaDurumunuGetir(req.isletme.id, masaNo);
}));

app.post("/api/nakit/siparis", nakitSiparisLimiti, opsiyonelKullaniciMiddleware(), guvenli(async (req, res) => {
  const kullanici = req.kullanici || null;
  const siparis = await nakitSiparisOlustur(req.isletme.id, {
    kullaniciId: kullanici?.id || null,
    masaNo: req.body?.masaNo,
    urunler: req.body?.urunler,
    kisiAdi: kullanici ? `${kullanici.ad} ${kullanici.soyad}`.trim() : "Misafir",
  });
  nakitDegisikliginiYayinla(req.isletme.id, siparis.masaNo, siparis);
  res.status(201);
  return { siparis };
}));

app.get("/api/nakit/masalar", salonRolu(), guvenli(async (req) => ({
  masalar: await nakitMasalariniGetir(req.isletme.id),
})));

app.post("/api/nakit/masalar/:masaNo/ac", salonRolu(), guvenli(async (req) => {
  const masa = await nakitMasasiniAc(req.isletme.id, req.params.masaNo, req.kullanici.id);
  nakitDegisikliginiYayinla(req.isletme.id, masa.masaNo);
  return { masa };
}));

app.post("/api/nakit/siparis/:id/onayla", salonRolu(), guvenli(async (req) => {
  const siparis = await nakitSiparisiOnayla(req.isletme.id, req.params.id);
  await onaylananOdemeyiMutfagaAktar(siparis);
  nakitDegisikliginiYayinla(req.isletme.id, siparis.masaNo, { ...siparis, durum: "nakit_bekliyor" });
  return { siparis: { ...siparis, durum: "nakit_bekliyor", mutfagaAktarildi: true } };
}));

app.post("/api/nakit/siparis/:id/reddet", salonRolu(), guvenli(async (req) => {
  const siparis = await nakitSiparisiReddet(req.isletme.id, req.params.id);
  nakitDegisikliginiYayinla(req.isletme.id, siparis.masaNo, siparis);
  return { siparis };
}));

app.post("/api/nakit/siparis/:id/tahsil", salonRolu(), guvenli(async (req) => {
  const sonuc = await nakitSiparisiTahsilEt(req.isletme.id, req.params.id);
  const siparis = sonuc.odeme;
  nakitDegisikliginiYayinla(req.isletme.id, siparis.masaNo, siparis);
  return { siparis };
}));

app.get("/api/kasa/cuzdan/musteriler", salonRolu(), guvenli(async (req) => ({
  musteriler: await kasaMusteriAra(req.isletme.id, pool, req.query.q),
})));

app.get("/api/kasa/cuzdan/son-yuklemeler", salonRolu(), guvenli(async (req) => ({
  yuklemeler: await kasaSonYuklemeleriGetir(req.isletme.id, pool),
  ayar: await cuzdanAyariniGetir(req.isletme.id, pool),
})));

app.post("/api/kasa/cuzdan/yukle", salonRolu(), guvenli(async (req) => {
  const t = req.isletme.id;
  const yukleme = await kasadanCuzdanYukle(t, pool, req.kullanici.id, req.body || {});
  io.to(oda(t, "genel")).emit("cuzdan-guncellendi", { kullaniciId: Number(req.body?.kullaniciId), bakiye: yukleme.bakiye });
  io.to(oda(t, "salon")).emit("cuzdan-kasa-guncellendi", { kullaniciId: Number(req.body?.kullaniciId) });
  return { yukleme };
}));

const superAdmin = superAdminMiddleware();
const MUTASYON_METOTLARI = new Set(["POST", "PUT", "PATCH", "DELETE"]);
function denetimIcinTemizle(deger, derinlik = 0) {
  if (derinlik > 4 || deger == null) return deger;
  if (Array.isArray(deger)) return deger.slice(0, 30).map((oge) => denetimIcinTemizle(oge, derinlik + 1));
  if (typeof deger !== "object") return typeof deger === "string" ? deger.slice(0, 500) : deger;
  return Object.fromEntries(Object.entries(deger).slice(0, 50).map(([anahtar, icerik]) => [
    anahtar,
    /(sifre|token|secret|sirri|kod)/i.test(anahtar) ? "[GİZLİ]" : denetimIcinTemizle(icerik, derinlik + 1),
  ]));
}

function superAdminDenetimMiddleware(req, res, next) {
  if (!MUTASYON_METOTLARI.has(req.method)) return next();
  res.on("finish", () => {
    if (!req.superAdmin?.id || res.locals.denetimAtla) return;
    superAdminKaydiEkle(req.superAdmin.id, {
      islem: res.locals.denetimIslemi || `${req.method} ${req.originalUrl.split("?")[0]}`,
      hedefIsletmeId: res.locals.hedefIsletmeId || null,
      detay: { durum: res.statusCode, girdi: denetimIcinTemizle(req.body || {}), ...(res.locals.denetimDetay || {}) },
      ip: req.ip || req.socket.remoteAddress || "",
    }).catch((hata) => console.error("Super admin denetim kaydı yazılamadı:", hata.message));
  });
  next();
}

// Super admin uçları tenant bağlamından bağımsızdır. Kimlik uçları hariç tümü
// yalnızca tip='super-admin' olan kısa ömürlü token ile açılır.
app.use("/api/super", superAdminDenetimMiddleware);

app.post("/api/super/giris", superAdminGirisLimiti, guvenli(async (req, res) => {
  const sonuc = await superAdminGiris(req.body?.email, req.body?.sifre);
  if (sonuc.hata) return res.status(401).json(sonuc);
  return sonuc;
}));

app.post("/api/super/giris/iki-faktor", superAdminGirisLimiti, guvenli(async (req, res) => {
  const sonuc = await superAdminIkiFaktorGirisiniTamamla(req.body?.ikiFaktorToken, req.body?.kod);
  if (sonuc.hata) return res.status(401).json(sonuc);
  req.superAdmin = sonuc.superAdmin;
  res.locals.denetimIslemi = "super-admin-giris";
  return sonuc;
}));

app.get("/api/super/ben", superAdmin, (req, res) => res.json({ superAdmin: req.superAdmin }));
app.post("/api/super/cikis", superAdmin, (req, res) => {
  res.locals.denetimIslemi = "super-admin-cikis";
  res.json({ basarili: true });
});

app.get("/api/super/sablonlar/:konsept", superAdmin, guvenli(async (req) => {
  const konsept = String(req.params.konsept || "").trim().toLowerCase();
  const sablon = sablonuGetir(konsept);
  if (!sablon) throw new Error("Konsept yalnızca burger, cafe veya pizza olabilir.");
  return { konsept, sablon };
}));
app.get("/api/super/slug-kontrol", superAdmin, guvenli(async (req) => {
  const sonuc = await slugMusaitlikDurumu(req.query.slug);
  return { ...sonuc, uretilenSlug: slugOlustur(req.query.slug) };
}));
app.post("/api/super/isletmeler/kurulum", superAdmin, guvenli(async (req, res) => {
  const sonuc = await isletmeKurulumunuYap(
    req.superAdmin.id,
    req.body || {},
    req.ip || req.socket.remoteAddress || ""
  );
  (async () => {
    await eksikCevirileriTamamla(sonuc.isletme.id);
    await sadakatCevirisiniTamamla(sonuc.isletme.id, pool);
    await isletmeTemaCevirisiniTamamla(sonuc.isletme.id);
  })().catch((hata) => console.error(`Yeni işletme çevirileri tamamlanamadı -> ${sonuc.isletme.id}:`, hata.message));
  // Bu işlem günlüğü kurulum transaction'ı içinde yazıldı; ikinci bir kayıt oluşturma.
  res.locals.denetimAtla = true;
  return sonuc;
}));

app.get("/api/super/isletmeler", superAdmin, guvenli(async () => ({ isletmeler: await superIsletmeleriGetir() })));
app.get("/api/super/isletmeler/:id", superAdmin, guvenli(async (req) => {
  const isletme = await superIsletmeDetayiGetir(req.params.id);
  if (!isletme) throw new Error("İşletme bulunamadı.");
  return { isletme, tema: temaCoz(isletme) };
}));
app.post("/api/super/isletmeler", superAdmin, guvenli(async (req, res) => {
  let isletme;
  const olusan = await isletmeOlustur({
    slug: req.body?.slug, ad: req.body?.ad, konsept: req.body?.konsept,
    aktif: req.body?.aktif !== false, tema: {},
  }, async (baglanti, temelIsletme) => {
    isletme = await superIsletmeBilgileriniGuncelle(temelIsletme.id, req.body || {}, baglanti);
    await abonelikOlustur({
      isletmeId: temelIsletme.id, plan: req.body?.plan || "baslangic", aylikUcret: req.body?.aylikUcret || 0,
      durum: req.body?.abonelikDurumu || "deneme", baslangicTarihi: new Date().toISOString().slice(0, 10),
      bitisTarihi: req.body?.bitisTarihi || null, notlar: req.body?.abonelikNotlari || "",
    }, baglanti);
  });
  res.locals.hedefIsletmeId = olusan.id;
  res.locals.denetimIslemi = "isletme-olusturma";
  res.locals.denetimDetay = { slug: olusan.slug };
  return { isletme: await superIsletmeDetayiGetir(olusan.id), tema: temaCoz(isletme) };
}));
app.put("/api/super/isletmeler/:id", superAdmin, guvenli(async (req, res) => {
  const isletme = await superIsletmeBilgileriniGuncelle(req.params.id, req.body || {});
  res.locals.hedefIsletmeId = isletme.id;
  res.locals.denetimIslemi = "isletme-guncelleme";
  return { isletme, tema: temaCoz(isletme) };
}));
app.patch("/api/super/isletmeler/:id/durum", superAdmin, guvenli(async (req, res) => {
  if (typeof req.body?.aktif !== "boolean") throw new Error("aktif alanı boolean olmalıdır.");
  const isletme = await superIsletmeDurumunuGuncelle(req.params.id, req.body.aktif);
  res.locals.hedefIsletmeId = isletme.id;
  res.locals.denetimIslemi = req.body.aktif ? "isletme-aktiflestirme" : "isletme-askiya-alma";
  return { isletme };
}));
app.delete("/api/super/isletmeler/:id", superAdmin, async (req, res) => {
  try {
    const ozet = await superIsletmeSilmeOzeti(req.params.id);
    res.locals.hedefIsletmeId = ozet.id;
    res.locals.denetimIslemi = "isletme-silme-denemesi";
    if (!req.body?.onaySlug || req.body.onaySlug !== ozet.slug) {
      return res.status(400).json({ hata: "Silme onayı için işletme slug'ını birebir yazın.", onayGerekli: true, silmeOzeti: ozet });
    }
    const silme = await superIsletmeyiYumusakSil(req.params.id);
    res.locals.denetimIslemi = "isletme-yumusak-silme";
    res.locals.denetimDetay = { slug: ozet.slug, silmeOzeti: ozet, kaliciSilinmeTarihi: silme.kaliciSilinmeTarihi };
    res.json({ basarili: true, silmeOzeti: ozet, ...silme });
  } catch (hata) {
    res.status(400).json({ hata: hata.message });
  }
});

// İşletmenin yönetici hesabı: super admin e-posta ve şifreyi belirler,
// işletme sahibi bu bilgilerle kendi paneline girer.
app.get("/api/super/isletmeler/:id/admin", superAdmin, guvenli(async (req) => ({
  adminler: await isletmeAdminleriniGetir(req.params.id),
})));
app.post("/api/super/isletmeler/:id/admin", superAdmin, guvenli(async (req, res) => {
  const sonuc = await isletmeAdminHesabiniAyarla(req.params.id, req.body || {});
  res.locals.hedefIsletmeId = Number(req.params.id);
  res.locals.denetimIslemi = sonuc.olusturuldu ? "isletme-admin-olusturma" : "isletme-admin-sifre-yenileme";
  // Şifre denetim günlüğüne yazılmaz; denetimIcinTemizle zaten maskeliyor.
  res.locals.denetimDetay = { adminEmail: sonuc.admin.email };
  return sonuc;
}));
app.put("/api/super/isletmeler/:id/admin/:adminId", superAdmin, guvenli(async (req, res) => {
  const sonuc = await isletmeAdmininiGuncelle(req.params.id, req.params.adminId, req.body || {});
  res.locals.hedefIsletmeId = Number(req.params.id);
  res.locals.denetimIslemi = "isletme-admin-guncelleme";
  res.locals.denetimDetay = { adminId: Number(req.params.adminId), adminEmail: sonuc.admin.email, sifreYenilendi: sonuc.sifreYenilendi };
  return sonuc;
}));
app.delete("/api/super/isletmeler/:id/admin/:adminId", superAdmin, guvenli(async (req, res) => {
  const sonuc = await isletmeAdmininiSil(req.params.id, req.params.adminId);
  res.locals.hedefIsletmeId = Number(req.params.id);
  res.locals.denetimIslemi = "isletme-admin-silme";
  res.locals.denetimDetay = { adminId: sonuc.adminId, adminEmail: sonuc.email };
  return sonuc;
}));

app.get("/api/super/ozet", superAdmin, guvenli(() => platformOzetiniGetir()));
app.get("/api/super/rapor/ciro", superAdmin, guvenli((req) => ciroRaporunuGetir(req.query.gun, req.query.baslangic, req.query.bitis)));
app.get("/api/super/rapor/buyume", superAdmin, guvenli((req) => buyumeRaporunuGetir(req.query.ay)));
app.get("/api/super/rapor/siparis", superAdmin, guvenli((req) => siparisRaporunuGetir(req.query.gun, req.query.baslangic, req.query.bitis)));
app.get("/api/super/rapor/kullanici", superAdmin, guvenli((req) => kullaniciRaporunuGetir(req.query.baslangic, req.query.bitis)));

app.get("/api/super/abonelikler", superAdmin, guvenli(async () => ({ abonelikler: await abonelikleriGetir() })));
app.post("/api/super/abonelikler", superAdmin, guvenli(async (req, res) => {
  const abonelik = await abonelikOlustur(req.body || {});
  res.locals.hedefIsletmeId = abonelik.isletmeId;
  res.locals.denetimIslemi = "abonelik-olusturma";
  return { abonelik };
}));
app.put("/api/super/abonelikler/:id", superAdmin, guvenli(async (req, res) => {
  const abonelik = await abonelikGuncelle(req.params.id, req.body || {});
  res.locals.hedefIsletmeId = abonelik.isletmeId;
  res.locals.denetimIslemi = "abonelik-guncelleme";
  return { abonelik };
}));
app.get("/api/super/gelir", superAdmin, guvenli((req) => gelirRaporunuGetir(req.query.ay)));

app.post("/api/super/isletmeler/:id/erisim-tokeni", superAdmin, guvenli(async (req, res) => {
  const isletme = await superIsletmeDetayiGetir(req.params.id);
  if (!isletme || isletme.silinmeTarihi) throw new Error("İşletme bulunamadı veya silinmek üzere işaretli.");
  const token = superAdminErisimTokeniUret(req.superAdmin.id, isletme);
  res.locals.hedefIsletmeId = isletme.id;
  res.locals.denetimIslemi = "isletme-adina-erisim";
  res.locals.denetimDetay = { slug: isletme.slug, sureDakika: 30 };
  return { token, sonGecerlilikDakika: 30, isletme: { id: isletme.id, slug: isletme.slug, ad: isletme.ad } };
}));
app.post("/api/super/isletmeler/:id/masa-erisim-tokenlari", superAdmin, guvenli(async (req, res) => {
  const isletme = await superIsletmeDetayiGetir(req.params.id);
  if (!isletme || isletme.silinmeTarihi) throw new Error("Isletme bulunamadi veya silinmek uzere isaretli.");
  const adet = Math.min(500, Math.max(1, Number(req.body?.masaSayisi) || Number(isletme.masaSayisi) || 10));
  res.locals.hedefIsletmeId = isletme.id;
  res.locals.denetimIslemi = "masa-qr-tokenlari-uretme";
  return {
    tokenlar: Array.from({ length: adet }, (_, indeks) => {
      const masaNo = String(indeks + 1);
      return { masaNo, token: masaErisimTokeniUret(isletme.id, masaNo) };
    }),
  };
}));
app.get("/api/super/kayitlar", superAdmin, guvenli(async (req) => ({
  kayitlar: await superAdminKayitlariniGetir({
    limit: req.query.limit, islem: req.query.islem, isletmeId: req.query.isletmeId,
    baslangic: req.query.baslangic, bitis: req.query.bitis,
  }),
})));

// Impersonation ile yapılan işletme admini mutasyonları da platform denetim
// günlüğüne yazılır. Middleware yanıt sonunda adminMiddleware'in eklediği kimliği okur.
app.use("/api/admin", (req, res, next) => {
  if (!MUTASYON_METOTLARI.has(req.method)) return next();
  res.on("finish", () => {
    if (!req.impersonatedBy) return;
    superAdminKaydiEkle(req.impersonatedBy, {
      islem: `impersonation ${req.method} ${req.originalUrl.split("?")[0]}`,
      hedefIsletmeId: req.isletme?.id,
      detay: { durum: res.statusCode, girdi: denetimIcinTemizle(req.body || {}) },
      ip: req.ip || req.socket.remoteAddress || "",
    }).catch((hata) => console.error("Impersonation denetim kaydı yazılamadı:", hata.message));
  });
  next();
});

app.get("/api/admin/dashboard", admin, guvenli((req) => dashboardGetir(req.isletme.id)));
app.get("/api/admin/degerlendirmeler", admin, guvenli(async (req) => ({
  rapor: await adminDegerlendirmeRaporunuGetir(req.isletme.id, pool, req.query?.gun),
})));
app.get("/api/admin/salon-krokisi", admin, guvenli(async (req) => ({ kroki: await salonKrokisiniGetir(req.isletme.id, pool) })));
app.put("/api/admin/salon-krokisi", admin, guvenli(async (req) => {
  const kroki = await salonKrokisiniKaydet(req.isletme.id, pool, req.body?.kroki || req.body);
  io.to(oda(req.isletme.id, "salon")).emit("salon-krokisi-guncellendi", kroki);
  return { kroki };
}));
app.get("/api/admin/sikayetler", admin, guvenli(async (req) => ({
  sikayetler: await adminSikayetleriniGetir(req.isletme.id, pool, req.query?.durum),
})));
app.patch("/api/admin/sikayetler/:id", admin, guvenli(async (req) => {
  const sikayet = await adminSikayetGuncelle(req.isletme.id, pool, req.params.id, req.body || {}, req.kullanici?.id);
  io.to(oda(req.isletme.id, "yonetim")).emit("sikayetler-guncellendi", { id: sikayet.id, durum: sikayet.durum });
  return { sikayet };
}));
app.get("/api/admin/ben", admin, (req, res) => res.json({ kullanici: req.kullanici, impersonation: req.impersonation || null }));
app.get("/api/admin/kurulum-ayarlari", admin, guvenli((req) => kurulumAyarlariGetir(req.isletme.id)));
app.post("/api/admin/masa-erisim-tokenlari", admin, guvenli(async (req) => {
  const adet = Math.min(500, Math.max(1, Number(req.body?.masaSayisi) || 10));
  return {
    tokenlar: Array.from({ length: adet }, (_, indeks) => {
      const masaNo = String(indeks + 1);
      return { masaNo, token: masaErisimTokeniUret(req.isletme.id, masaNo) };
    }),
  };
}));
app.put("/api/admin/tema", admin, guvenli(async (req) => {
  const isletme = await isletmeTemasiniGuncelle(req.isletme.id, req.body || {});
  const yanit = temaliIsletmeYaniti(isletme);
  io.to(oda(req.isletme.id, "genel")).emit("tema-guncellendi", yanit);
  return yanit;
}));
app.post(
  "/api/admin/logo",
  admin,
  express.raw({ type: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"], limit: "2mb" }),
  guvenli(async (req) => {
    const eskiLogo = req.isletme.logoUrl;
    const yeniLogo = await logoYukle(req.body, req.isletme.id, req.headers["content-type"]);
    let isletme;
    try {
      isletme = await isletmeLogosunuGuncelle(req.isletme.id, yeniLogo);
    } catch (hata) {
      await storageDosyasiniSil(yeniLogo).catch(() => {});
      throw hata;
    }
    if (eskiLogo && eskiLogo !== yeniLogo) {
      await storageDosyasiniSil(eskiLogo).catch((hata) => console.error("Eski logo silinemedi:", hata.message));
    }
    const yanit = temaliIsletmeYaniti(isletme);
    io.to(oda(req.isletme.id, "genel")).emit("tema-guncellendi", yanit);
    return yanit;
  })
);
app.get("/api/admin/urunler", admin, guvenli(async (req) => ({ urunler: await urunleriGetir(req.isletme.id, { tumu: true, stokDetayi: true }) })));
app.post("/api/admin/urunler", admin, guvenli(async (req) => {
  const t = req.isletme.id;
  const eski = req.body.id ? await yonetimVarliginiGetir(t, "urun", req.body.id) : null;
  const urun = await urunKaydet(t, req.body);
  await revizyonKaydet(t, { yapan: req.kullanici, varlikTuru: "urun", varlikId: urun.id, islem: eski ? "guncelleme" : "ekleme", aciklama: eski ? `${urun.ad} ürünü güncellendi.` : `${urun.ad} ürünü eklendi.`, eskiDeger: eski, yeniDeger: urun });
  io.to(oda(t, "genel")).emit("urunler-guncellendi", await urunleriGetir(t));
  return { urun };
}));
app.patch("/api/admin/urunler/:id/aktif", admin, guvenli(async (req) => {
  const t = req.isletme.id;
  const eski = await yonetimVarliginiGetir(t, "urun", req.params.id);
  await urunAktiflikDegistir(t, req.params.id, req.body.aktif);
  const yeni = await yonetimVarliginiGetir(t, "urun", req.params.id);
  await revizyonKaydet(t, { yapan: req.kullanici, varlikTuru: "urun", varlikId: req.params.id, islem: "durum", aciklama: `${eski?.ad || "Ürün"} ${req.body.aktif ? "yayına alındı" : "pasife alındı"}.`, eskiDeger: eski, yeniDeger: yeni });
  io.to(oda(t, "genel")).emit("urunler-guncellendi", await urunleriGetir(t));
}));
app.delete("/api/admin/urunler/:id", admin, guvenli(async (req) => {
  const t = req.isletme.id;
  const eski = await yonetimVarliginiGetir(t, "urun", req.params.id);
  await urunArsivle(t, req.params.id);
  await revizyonKaydet(t, { yapan: req.kullanici, varlikTuru: "urun", varlikId: req.params.id, islem: "arsivleme", aciklama: `${eski?.ad || "Ürün"} katalogdan arşivlendi.`, eskiDeger: eski });
  io.to(oda(t, "genel")).emit("urunler-guncellendi", await urunleriGetir(t));
}));
app.post("/api/admin/gorseller", admin, express.raw({ type: "image/*", limit: "5mb" }), guvenli(async (req) => {
  const gorsel = await gorselYukle(req.body);
  return { gorsel };
}));
app.get("/api/admin/kategoriler", admin, guvenli(async (req) => ({ kategoriler: await kategorileriGetir(req.isletme.id, { tumu: true }) })));
app.post("/api/admin/kategoriler", admin, guvenli(async (req) => {
  const t = req.isletme.id;
  const eski = req.body.id ? await yonetimVarliginiGetir(t, "kategori", req.body.id) : null;
  const kategori = await kategoriKaydet(t, req.body);
  await revizyonKaydet(t, { yapan: req.kullanici, varlikTuru: "kategori", varlikId: kategori.id, islem: eski ? "guncelleme" : "ekleme", aciklama: `${kategori.ad} kategorisi ${eski ? "güncellendi" : "eklendi"}.`, eskiDeger: eski, yeniDeger: kategori });
  io.to(oda(t, "genel")).emit("kategoriler-guncellendi", await kategorileriGetir(t));
  io.to(oda(t, "genel")).emit("urunler-guncellendi", await urunleriGetir(t));
  return { kategori };
}));
app.delete("/api/admin/kategoriler/:id", admin, guvenli(async (req) => {
  const t = req.isletme.id;
  const eski = await yonetimVarliginiGetir(t, "kategori", req.params.id);
  await kategoriArsivle(t, req.params.id);
  await revizyonKaydet(t, { yapan: req.kullanici, varlikTuru: "kategori", varlikId: req.params.id, islem: "arsivleme", aciklama: `${eski?.ad || "Kategori"} arşivlendi.`, eskiDeger: eski });
  io.to(oda(t, "genel")).emit("kategoriler-guncellendi", await kategorileriGetir(t));
}));
app.get("/api/admin/personeller", admin, guvenli(async (req) => ({ personeller: await personelleriGetir(req.isletme.id) })));
app.post("/api/admin/personeller", admin, guvenli(async (req) => {
  const t = req.isletme.id;
  const eski = req.body.id ? await yonetimVarliginiGetir(t, "personel", req.body.id) : null;
  const personel = await personelKaydet(t, req.body);
  await revizyonKaydet(t, { yapan: req.kullanici, varlikTuru: "personel", varlikId: personel.id, islem: eski ? "guncelleme" : "ekleme", aciklama: `${personel.ad} ${personel.soyad} personel kaydı ${eski ? "güncellendi" : "eklendi"}.`, eskiDeger: eski, yeniDeger: personel });
  return { personel };
}));
app.delete("/api/admin/personeller/:id", admin, guvenli(async (req) => {
  const t = req.isletme.id;
  const eski = await yonetimVarliginiGetir(t, "personel", req.params.id);
  await personelArsivle(t, req.params.id);
  await revizyonKaydet(t, { yapan: req.kullanici, varlikTuru: "personel", varlikId: req.params.id, islem: "arsivleme", aciklama: `${eski?.ad || "Personel"} ${eski?.soyad || ""} ekipten arşivlendi.`, eskiDeger: eski });
}));
app.post("/api/admin/personeller/:id/vardiya", admin, guvenli(async (req) => {
  const t = req.isletme.id;
  await vardiyaDegistir(t, req.params.id, req.body.islem);
  const personel = await yonetimVarliginiGetir(t, "personel", req.params.id);
  await revizyonKaydet(t, { yapan: req.kullanici, varlikTuru: "vardiya", varlikId: req.params.id, islem: req.body.islem, aciklama: `${personel?.ad || "Personel"} için vardiya ${req.body.islem === "giris" ? "başlatıldı" : "kapatıldı"}.` });
}));
app.get("/api/admin/raporlar/satis", admin, guvenli((req) => satisRaporuGetir(req.isletme.id, req.query.gun)));
app.get("/api/admin/satislar/canli", admin, guvenli(async (req) => ({ satislar: await canliSatislariGetir(req.isletme.id, req.query) })));
app.get("/api/admin/satislar/gecmis", admin, guvenli(async (req) => ({ satislar: await gecmisSatislariGetir(req.isletme.id, req.query) })));
app.get("/api/admin/kayitlar/mutfak", admin, guvenli(async (req) => ({ kayitlar: await mutfakKayitlariniGetir(req.isletme.id, req.query) })));
app.get("/api/admin/kayitlar/musteriler", admin, guvenli(async (req) => ({ musteriler: await musteriKayitlariniGetir(req.isletme.id, req.query) })));
app.get("/api/admin/kayitlar/personel", admin, guvenli(async (req) => personelKayitlariniGetir(req.isletme.id, req.query)));
app.get("/api/admin/revizyonlar", admin, guvenli(async (req) => ({ revizyonlar: await revizyonKayitlariniGetir(req.isletme.id, req.query) })));
app.get("/api/admin/duyurular", admin, guvenli(async (req) => ({ duyurular: await duyurulariGetir(req.isletme.id, { tumu: true }) })));
app.post("/api/admin/duyurular", admin, guvenli(async (req) => {
  const t = req.isletme.id;
  const duyuru = await duyuruKaydet(t, req.body);
  await revizyonKaydet(t, { yapan: req.kullanici, varlikTuru: "duyuru", varlikId: duyuru.id, islem: "ekleme", aciklama: `${duyuru.baslik} duyurusu yayınlandı.`, yeniDeger: duyuru });
  io.to(oda(t, "genel")).emit("duyurular-guncellendi", await duyurulariGetir(t));
  return { duyuru };
}));
app.delete("/api/admin/duyurular/:id", admin, guvenli(async (req) => {
  const t = req.isletme.id;
  const eski = await yonetimVarliginiGetir(t, "duyuru", req.params.id);
  await duyuruArsivle(t, req.params.id);
  await revizyonKaydet(t, { yapan: req.kullanici, varlikTuru: "duyuru", varlikId: req.params.id, islem: "arsivleme", aciklama: `${eski?.baslik || "Duyuru"} yayından kaldırıldı.`, eskiDeger: eski });
  io.to(oda(t, "genel")).emit("duyurular-guncellendi", await duyurulariGetir(t));
}));
app.get("/api/admin/kampanyalar", admin, guvenli(async (req) => ({ kampanyalar: await kampanyalariGetir(req.isletme.id, { tumu: true }) })));
app.get("/api/admin/ceviri-durumu", admin, guvenli(async () => ceviriYapilandirmasi()));
app.post("/api/admin/ceviriler/tamamla", admin, guvenli(async (req) => {
  const yapilandirma = ceviriYapilandirmasi();
  if (!yapilandirma.aktif) {
    const hata = new Error("AI çevirisi için GEMINI_API_KEY tanımlanmalıdır.");
    hata.status = 503;
    throw hata;
  }
  const ozet = await eksikCevirileriTamamla(req.isletme.id);
  const sadakatCevirisi = await sadakatCevirisiniTamamla(req.isletme.id, pool);
  const temaliIsletme = await isletmeTemaCevirisiniTamamla(req.isletme.id);
  io.to(oda(req.isletme.id, "genel")).emit("urunler-guncellendi", await urunleriGetir(req.isletme.id));
  io.to(oda(req.isletme.id, "genel")).emit("kategoriler-guncellendi", await kategorileriGetir(req.isletme.id));
  io.to(oda(req.isletme.id, "genel")).emit("kampanyalar-guncellendi", await kampanyalariGetir(req.isletme.id));
  io.to(oda(req.isletme.id, "genel")).emit("duyurular-guncellendi", await duyurulariGetir(req.isletme.id));
  io.to(oda(req.isletme.id, "genel")).emit("sadakat-ayari-guncellendi", await sadakatAyariniGetir(req.isletme.id, pool));
  io.to(oda(req.isletme.id, "genel")).emit("tema-guncellendi", temaliIsletmeYaniti(temaliIsletme));
  return { ozet: { ...ozet, sadakat: sadakatCevirisi.durum, tema: temaliIsletme.tema?.ceviriler?.durum || "bekliyor" } };
}));
app.post("/api/admin/kampanyalar", admin, guvenli(async (req) => {
  const t = req.isletme.id;
  const eski = req.body.id ? await yonetimVarliginiGetir(t, "kampanya", req.body.id) : null;
  const kampanya = await kampanyaKaydet(t, req.body);
  await revizyonKaydet(t, { yapan: req.kullanici, varlikTuru: "kampanya", varlikId: kampanya.id, islem: eski ? "guncelleme" : "ekleme", aciklama: `${kampanya.baslik} kampanyası ${eski ? "güncellendi" : "oluşturuldu"}.`, eskiDeger: eski, yeniDeger: kampanya });
  io.to(oda(t, "genel")).emit("kampanyalar-guncellendi", await kampanyalariGetir(t));
  return { kampanya };
}));
app.delete("/api/admin/kampanyalar/:id", admin, guvenli(async (req) => {
  const t = req.isletme.id;
  const eski = await yonetimVarliginiGetir(t, "kampanya", req.params.id);
  await kampanyaArsivle(t, req.params.id);
  await revizyonKaydet(t, { yapan: req.kullanici, varlikTuru: "kampanya", varlikId: req.params.id, islem: "arsivleme", aciklama: `${eski?.baslik || "Kampanya"} arşivlendi.`, eskiDeger: eski });
  io.to(oda(t, "genel")).emit("kampanyalar-guncellendi", await kampanyalariGetir(t));
}));
app.get("/api/admin/oduller", admin, guvenli(async (req) => ({ oduller: await adminOdulleriGetir(req.isletme.id, pool) })));
app.get("/api/admin/sadakat-ayari", admin, guvenli(async (req) => ({ damgaKarti: await adminSadakatAyariniGetir(req.isletme.id, pool) })));
app.put("/api/admin/sadakat-ayari", admin, guvenli(async (req) => {
  const t = req.isletme.id;
  const eski = await adminSadakatAyariniGetir(t, pool);
  const damgaKarti = await adminSadakatAyariniKaydet(t, pool, req.body || {});
  await revizyonKaydet(t, {
    yapan: req.kullanici, varlikTuru: "sadakat", varlikId: null, islem: "guncelleme",
    aciklama: `Damga kartı ${damgaKarti.aktif ? "güncellendi" : "duraklatıldı"}.`, eskiDeger: eski, yeniDeger: damgaKarti,
  });
  io.to(oda(t, "genel")).emit("sadakat-ayari-guncellendi", damgaKarti);
  return { damgaKarti };
}));
app.get("/api/admin/cuzdan-ayari", admin, guvenli(async (req) => ({ cuzdanAyari: await cuzdanAyariniGetir(req.isletme.id, pool) })));
app.get("/api/admin/cuzdan-raporu", admin, guvenli(async (req) => ({ cuzdanRaporu: await adminCuzdanRaporunuGetir(req.isletme.id, pool) })));
app.put("/api/admin/cuzdan-ayari", admin, guvenli(async (req) => {
  const t = req.isletme.id;
  const eski = await cuzdanAyariniGetir(t, pool);
  const cuzdanAyari = await adminCuzdanAyariniKaydet(t, pool, req.body || {});
  await revizyonKaydet(t, {
    yapan: req.kullanici, varlikTuru: "cuzdan", varlikId: null, islem: "guncelleme",
    aciklama: `Cüzdan programı ${cuzdanAyari.aktif ? "güncellendi" : "duraklatıldı"}.`, eskiDeger: eski, yeniDeger: cuzdanAyari,
  });
  io.to(oda(t, "genel")).emit("cuzdan-ayari-guncellendi", cuzdanAyari);
  return { cuzdanAyari };
}));
app.post("/api/admin/oduller", admin, guvenli(async (req) => {
  const t = req.isletme.id;
  const eski = req.body.id ? await yonetimVarliginiGetir(t, "odul", req.body.id) : null;
  const oduller = await adminOdulKaydet(t, pool, req.body);
  const yeni = req.body.id ? await yonetimVarliginiGetir(t, "odul", req.body.id) : [...oduller].filter((odul) => odul.ad === String(req.body.ad || "").trim() && Number(odul.urunId) === Number(req.body.urunId)).sort((a, b) => Number(b.id) - Number(a.id))[0];
  await revizyonKaydet(t, { yapan: req.kullanici, varlikTuru: "odul", varlikId: yeni?.id, islem: eski ? "guncelleme" : "ekleme", aciklama: `${req.body.ad || "Ödül"} puan marketinde ${eski ? "güncellendi" : "oluşturuldu"}.`, eskiDeger: eski, yeniDeger: yeni });
  io.to(oda(t, "genel")).emit("oduller-guncellendi");
  return { oduller };
}));
app.delete("/api/admin/oduller/:id", admin, guvenli(async (req) => {
  const t = req.isletme.id;
  const eski = await yonetimVarliginiGetir(t, "odul", req.params.id);
  await adminOdulArsivle(t, pool, req.params.id);
  await revizyonKaydet(t, { yapan: req.kullanici, varlikTuru: "odul", varlikId: req.params.id, islem: "arsivleme", aciklama: `${eski?.ad || "Ödül"} puan marketinden arşivlendi.`, eskiDeger: eski });
  io.to(oda(t, "genel")).emit("oduller-guncellendi");
}));

app.get("/", (req, res) => res.send("Burger Plus backend calisiyor (PostgreSQL)"));

// Saglik kontrolu — Render/izleme araclari icin
app.get("/saglik", (req, res) => res.json({ durum: "calisiyor", zaman: new Date().toISOString() }));

async function onaylananOdemeyiMutfagaAktarGuvenli(odeme) {
  try {
    await onaylananOdemeyiMutfagaAktar(odeme);
  } catch (aktarimHatasi) {
    console.error("Ödeme başarılı, mutfak aktarımı tamamlanamadı:", {
      odemeId: odeme.id,
      isletmeId: odeme.isletmeId,
      mesaj: aktarimHatasi.message,
    });
  }
}

async function iyzicoOdemesiniKesinlestir(odeme, token) {
  await iyzicoSonucuGetir(odeme, token);
  const sonuc = await odemeIyzicoOlarakOnayla(odeme.isletmeId, odeme.id, token);
  await onaylananOdemeyiMutfagaAktarGuvenli(sonuc.odeme);
  return sonuc.odeme;
}

async function onaylananOdemeyiMutfagaAktar(odeme) {
  if (odeme.mutfagaAktarildi) return;
  const tenantId = Number(odeme.isletmeId);
  if (!Number.isSafeInteger(tenantId) || tenantId < 1) throw new Error("Ödemeye ait işletme bilgisi geçersiz.");
  const masaNo = odeme.masaNo || "algotur";
  await masaSirayaAl(tenantId, masaNo, async () => {
    await siparisStogunuKesinlestir(tenantId, odeme.id, odeme.urunler);
    io.to(oda(tenantId, "genel")).emit("urunler-guncellendi", await urunleriGetir(tenantId));
    for (const [kalemNo, urun] of odeme.urunler.entries()) {
      await kalemEkle(
        tenantId, masaNo, urun, odeme.kisiAdi, urun.secimler, urun.haricMalzemeler,
        odeme.siparisNo, odeme.id, kalemNo
      );
    }
    await odemeMutfagaAktarildi(tenantId, odeme.id);
    const tumMasalar = await tumAcikMasalar(tenantId);
    io.to(oda(tenantId, `masa-${masaNo}`)).emit("masa-guncellendi", await masaSiparisleriniGetir(tenantId, masaNo));
    io.to(oda(tenantId, "mutfak")).emit("mutfak-guncellendi", tumMasalar);
    io.to(oda(tenantId, "salon")).emit("salon-guncellendi", tumMasalar);
    io.to(oda(tenantId, "yonetim")).emit("yonetim-satis-guncellendi", {
      siparisNo: odeme.siparisNo,
      masaNo: odeme.masaNo || "algotur",
      kisiAdi: odeme.kisiAdi,
      tutar: odeme.tutar,
      urunAdedi: odeme.urunler.reduce((toplam, urun) => toplam + Math.max(1, Number(urun.adet || 1)), 0),
      urunler: odeme.urunler.map((urun) => ({ ad: urun.ad, adet: Math.max(1, Number(urun.adet || 1)), fiyat: urun.fiyat })),
      durum: "yeni",
      olusturma: new Date().toISOString(),
    });
  });
}

// --- Socket.io ---
// Aynı masaya ait olayları sıraya al. Böylece çok ürünlü sipariş, durum
// değiştirme ve masa kapatma olayları birbirini geçip eski ekran verisini
// yeniden yayınlayamaz.
const masaKuyruklari = new Map();
function masaSirayaAl(isletmeId, masaNo, islem) {
  const anahtar = `${isletmeId}:${masaNo}`;
  const onceki = masaKuyruklari.get(anahtar) || Promise.resolve();
  const sonraki = onceki.catch(() => {}).then(islem);
  masaKuyruklari.set(anahtar, sonraki);
  const temizle = () => {
    if (masaKuyruklari.get(anahtar) === sonraki) masaKuyruklari.delete(anahtar);
  };
  sonraki.then(temizle, temizle);
  return sonraki;
}

function guvenliMasaNo(masaNo) {
  const deger = String(masaNo || "").trim();
  return /^[A-Za-z0-9_-]{1,30}$/.test(deger) ? deger : null;
}

function socketRoluVar(socket, roller) {
  return socket.kullanici?.rol === "admin" || roller.includes(socket.kullanici?.rol);
}

io.use(async (socket, sonraki) => {
  try {
    const slug = socket.handshake.auth?.isletme || socket.handshake.query?.isletme;
    const isletme = await isletmeSlugIleGetir(slug);
    if (!isletme) return sonraki(new Error("İşletme bulunamadı"));
    const token = String(socket.handshake.auth?.token || "").trim();
    const impersonation = token ? await impersonationTokeniniDogrula(token, isletme.id) : null;
    if (!isletme.aktif && !impersonation) return sonraki(new Error("İşletme bulunamadı"));
    socket.data.isletmeId = isletme.id;
    socket.data.isletmeSlug = isletme.slug;
    socket.kullanici = impersonation
      ? { id: null, ad: impersonation.superAdmin.ad, email: impersonation.superAdmin.email, rol: "admin" }
      : token ? await tokenDogrula(token, isletme.id) : null;
    if (impersonation) socket.data.impersonatedBy = impersonation.superAdmin.id;
    if (token && !socket.kullanici) return sonraki(new Error("Oturum gecersiz."));
    sonraki();
  } catch {
    sonraki(new Error("Oturum dogrulanamadi."));
  }
});

io.on("connection", (socket) => {
  console.log("Baglandi:", socket.id);
  socket.join(oda(socket.data.isletmeId, "genel"));

  socket.on("masaya-katil", async (gelen, tamamlandi) => {
    const tenantId = socket.data.isletmeId;
    const masaNo = guvenliMasaNo(typeof gelen === "object" ? gelen?.masaNo : gelen);
    const masaToken = typeof gelen === "object" ? gelen?.masaToken : "";
    const personelErisimi = socketRoluVar(socket, ["mutfak", "salon", "kasiyer"]);
    if (!masaNo || (!personelErisimi && !masaErisimTokeniniDogrula(masaToken, tenantId, masaNo))) {
      if (typeof tamamlandi === "function") tamamlandi({ basarili: false, hata: "Masa QR erisimi gecersiz." });
      return;
    }
    socket.join(oda(tenantId, `masa-${masaNo}`));
    socket.emit("masa-guncellendi", await masaSiparisleriniGetir(tenantId, masaNo));
    socket.emit("nakit-masa-guncellendi", await nakitMasaDurumunuGetir(tenantId, masaNo));
    if (typeof tamamlandi === "function") tamamlandi({ basarili: true });
    console.log(`${socket.id} -> ${oda(tenantId, `masa-${masaNo}`)}`);
  });

  socket.on("urun-ekle", ({ masaNo, urun, kisiAdi, secimler, haricMalzemeler, siparisNo }, tamamlandi) => {
    const tenantId = socket.data.isletmeId;
    masaNo = guvenliMasaNo(masaNo);
    if (!masaNo || process.env.LEGACY_SOCKET_SIPARIS_AKTIF !== "true" || !socketRoluVar(socket, ["mutfak", "salon", "kasiyer"])) {
      if (typeof tamamlandi === "function") tamamlandi({ basarili: false, hata: "Bu siparis yolu kullanima kapali." });
      return;
    }
    masaSirayaAl(tenantId, masaNo, async () => {
      const guncel = await kalemEkle(
        tenantId, masaNo, urun, kisiAdi, secimler || urun?.secimler || {},
        haricMalzemeler || urun?.haricMalzemeler || [], siparisNo
      );
      io.to(oda(tenantId, `masa-${masaNo}`)).emit("masa-guncellendi", guncel);
      const tumMasalar = await tumAcikMasalar(tenantId);
      io.to(oda(tenantId, "mutfak")).emit("mutfak-guncellendi", tumMasalar);
      io.to(oda(tenantId, "salon")).emit("salon-guncellendi", tumMasalar);
      if (typeof tamamlandi === "function") tamamlandi({ basarili: true });
    }).catch((e) => {
      console.error("Ürün ekleme hatası:", e.message);
      if (typeof tamamlandi === "function") tamamlandi({ basarili: false, hata: e.message });
    });
  });

  socket.on("mutfaga-katil", async () => {
    if (!socketRoluVar(socket, ["mutfak"])) return;
    const tenantId = socket.data.isletmeId;
    socket.join(oda(tenantId, "mutfak"));
    socket.emit("mutfak-guncellendi", await tumAcikMasalar(tenantId));
    console.log(`${socket.id} -> ${oda(tenantId, "mutfak")}`);
  });

  // Salon personeli odasi (garson/kasiyer). Tum acik masalari gorur.
  socket.on("salona-katil", async () => {
    if (!socketRoluVar(socket, ["salon", "kasiyer"])) return;
    const tenantId = socket.data.isletmeId;
    socket.join(oda(tenantId, "salon"));
    socket.emit("salon-guncellendi", await tumAcikMasalar(tenantId));
    socket.emit("personel-cagrilari-guncellendi", await aktifPersonelCagrilariniGetir(tenantId, pool));
    console.log(`${socket.id} -> ${oda(tenantId, "salon")}`);
  });

  socket.on("yonetime-katil", async () => {
    if (!socketRoluVar(socket, [])) return;
    const tenantId = socket.data.isletmeId;
    socket.join(oda(tenantId, "yonetim"));
    socket.emit("yonetim-satislar", await canliSatislariGetir(tenantId, { limit: 50 }));
  });

  socket.on("masa-durum-degistir", ({ masaNo, siparisNo, durum }, tamamlandi) => {
    const tenantId = socket.data.isletmeId;
    masaNo = guvenliMasaNo(masaNo);
    if (!masaNo || !socketRoluVar(socket, ["mutfak"])) {
      if (typeof tamamlandi === "function") tamamlandi({ basarili: false, hata: "Yetkisiz islem." });
      return;
    }
    masaSirayaAl(tenantId, masaNo, async () => {
      const guncel = await masaDurumGuncelle(tenantId, masaNo, durum, socket.kullanici?.id, siparisNo);
      if (guncel) {
        io.to(oda(tenantId, `masa-${masaNo}`)).emit("masa-guncellendi", guncel);
        const tumMasalar = await tumAcikMasalar(tenantId);
        io.to(oda(tenantId, "mutfak")).emit("mutfak-guncellendi", tumMasalar);
        io.to(oda(tenantId, "salon")).emit("salon-guncellendi", tumMasalar);
        io.to(oda(tenantId, "yonetim")).emit("yonetim-operasyon-guncellendi", { masaNo, siparisNo, durum, zaman: new Date().toISOString() });
      }
      if (typeof tamamlandi === "function") tamamlandi({ basarili: true });
    }).catch((e) => {
      console.error("Durum değiştirme hatası:", e.message);
      if (typeof tamamlandi === "function") tamamlandi({ basarili: false, hata: e.message });
    });
  });

  // Salon: masayi kapat (musteriler kalkinca). Oturum kapanir, yeni gelen temiz baslar.
  socket.on("masa-kapat", (gelenMasaNo, tamamlandi) => {
    const tenantId = socket.data.isletmeId;
    const masaNo = guvenliMasaNo(gelenMasaNo);
    if (!masaNo || !socketRoluVar(socket, ["salon", "kasiyer"])) {
      if (typeof tamamlandi === "function") tamamlandi({ basarili: false, hata: "Yetkisiz islem." });
      return;
    }
    masaSirayaAl(tenantId, masaNo, async () => {
      const bos = await masaKapat(tenantId, masaNo, socket.kullanici?.id);
      await masaCagriOturumlariniKapat(tenantId, pool, masaNo);
      io.to(oda(tenantId, `masa-${masaNo}`)).emit("masa-guncellendi", bos);
      io.to(oda(tenantId, `masa-${masaNo}`)).emit("masa-kapandi", { masaNo });
      const tumMasalar = await tumAcikMasalar(tenantId);
      io.to(oda(tenantId, "mutfak")).emit("mutfak-guncellendi", tumMasalar);
      io.to(oda(tenantId, "salon")).emit("salon-guncellendi", tumMasalar);
      await personelCagrilariniYayinla(tenantId);
      nakitDegisikliginiYayinla(tenantId, masaNo);
      io.to(oda(tenantId, "yonetim")).emit("yonetim-operasyon-guncellendi", { masaNo, durum: "kapali", zaman: new Date().toISOString() });
      if (typeof tamamlandi === "function") tamamlandi({ basarili: true });
      console.log(`Masa ${masaNo} kapatildi`);
    }).catch((e) => {
      console.error("Masa kapatma hatası:", e.message);
      if (typeof tamamlandi === "function") tamamlandi({ basarili: false, hata: e.message });
    });
  });

  socket.on("disconnect", () => console.log("Ayrildi:", socket.id));
});

// API istemcileri her durumda JSON bekler. Bilinmeyen bir API rotasinda
// Express'in varsayilan HTML 404 sayfasini dondurmek JSON ayrıştırma hatasina
// yol acar ve asil problemi gizler.
app.use("/api", (_req, res) => {
  res.status(404).json({ hata: "İstenen API servisi bulunamadı." });
});

app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({ hata: "Yüklenen dosya izin verilen boyutu aşıyor." });
  }
  if (err?.kod === "CORS_ENGELLENDI") {
    return res.status(403).json({ hata: "Bu adresin backend erişimine izin verilmiyor." });
  }
  console.error("Beklenmeyen HTTP hatası:", err?.message || err);
  res.status(500).json({ hata: "Sunucu isteği tamamlayamadı." });
});

const PORT = process.env.PORT || 4000;

async function mevcutCevirileriArkaPlandaTamamla() {
  const yapilandirma = ceviriYapilandirmasi();
  if (!yapilandirma.aktif || !yapilandirma.baslangictaTamamla) return;
  const sonuc = await pool.query("SELECT id FROM isletmeler WHERE aktif=true ORDER BY id");
  for (const satir of sonuc.rows) {
    try {
      const ozet = await eksikCevirileriTamamla(satir.id);
      const sadakat = await sadakatCevirisiniTamamla(satir.id, pool);
      const temaliIsletme = await isletmeTemaCevirisiniTamamla(satir.id);
      io.to(oda(satir.id, "genel")).emit("urunler-guncellendi", await urunleriGetir(satir.id));
      io.to(oda(satir.id, "genel")).emit("kategoriler-guncellendi", await kategorileriGetir(satir.id));
      io.to(oda(satir.id, "genel")).emit("kampanyalar-guncellendi", await kampanyalariGetir(satir.id));
      io.to(oda(satir.id, "genel")).emit("duyurular-guncellendi", await duyurulariGetir(satir.id));
      io.to(oda(satir.id, "genel")).emit("sadakat-ayari-guncellendi", await sadakatAyariniGetir(satir.id, pool));
      io.to(oda(satir.id, "genel")).emit("tema-guncellendi", temaliIsletmeYaniti(temaliIsletme));
      console.log(`AI ceviri taramasi bitti -> isletme ${satir.id}`, {
        ...ozet,
        sadakat: sadakat.durum,
        sadakatHatasi: sadakat.hata || undefined,
      });
    } catch (hata) {
      console.error(`AI ceviri tamamlanamadi -> isletme ${satir.id}:`, hata.message);
    }
  }
}

// Once tablolari hazirla, sonra sunucuyu baslat.
// 0.0.0.0: bulut ortamlarinda (Render vb.) disaridan erisim icin gerekli.
let varsayilanIsletmeId;
isletmeTablosunuHazirla()
  .then((isletme) => {
    varsayilanIsletmeId = isletme.id;
    return tablolariHazirla(varsayilanIsletmeId);
  })
  .then(() => adminTablolariHazirla(varsayilanIsletmeId))
  .then(() => sadakatTablolariHazirla(varsayilanIsletmeId, pool))
  .then(() => cuzdanTablolariHazirla(pool))
  .then(() => personelCagriTablolariHazirla(pool))
  .then(() => sikayetTablosunuHazirla(pool))
  .then(() => rezervasyonTablosunuHazirla(pool))
  .then(() => degerlendirmeTablolariniHazirla(pool))
  .then(() => isletmeMigrationunuCalistir())
  .then(() => superAdminTablolariniHazirla())
  .then(() => ilkSuperAdminiHazirla())
  .then(() => {
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`Burger Plus backend calisiyor -> port ${PORT}`);
      mevcutCevirileriArkaPlandaTamamla().catch((hata) => console.error("AI ceviri taramasi baslatilamadi:", hata.message));
    });
  })
  .catch((err) => {
    console.error("Veritabanina baglanilamadi:", err.message);
    console.error("(DATABASE_URL veya .env ayarlari dogru mu?)");
    process.exit(1);
  });
