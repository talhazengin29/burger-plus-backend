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
  odemeGetir,
  odemeSaglayiciTokenKaydet,
  iyzicoTokeniyleOdemeGetir,
  odemeMutfagaAktarildi,
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
} from "./adminDb.js";
import { gorselYukle } from "./storage.js";
import {
  kayitOl, girisYap, korumaliMiddleware, adminMiddleware, rolMiddleware,
  opsiyonelKullaniciMiddleware, tokenDogrula,
} from "./auth.js";
import {
  sadakatTablolariHazirla, sadakatOzetiniGetir, puanlaOdulSatinAl,
  kullaniciOdulunuSipariseDonustur, adminOdulleriGetir, adminOdulKaydet, adminOdulArsivle,
} from "./sadakatDb.js";

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
  ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"]
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
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors(corsAyarlari));
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

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsAyarlari,
});

// --- HTTP API ---

// Kayit ol
app.post("/api/kayit", kimlikLimiti, async (req, res) => {
  const sonuc = await kayitOl(req.body);
  if (sonuc.hata) return res.status(400).json(sonuc);
  res.json(sonuc);
});

// Giris yap
app.post("/api/giris", kimlikLimiti, async (req, res) => {
  const sonuc = await girisYap(req.body);
  if (sonuc.hata) return res.status(401).json(sonuc);
  res.json(sonuc);
});

// Ben kimim (token ile guncel kullanici bilgisi — sayfa yenilenince oturum korunur)
app.get("/api/ben", korumaliMiddleware(), (req, res) => {
  res.json({ kullanici: req.kullanici });
});

app.get("/api/davetim", korumaliMiddleware(), async (req, res) => {
  try {
    res.json({ davet: await davetOzetiniGetir(req.kullanici.id) });
  } catch (e) {
    res.status(400).json({ hata: e.message || "Davet bilgileri alınamadı." });
  }
});

// Profil guncelle (email + telefon; ad/soyad/cinsiyet degismez)
app.post("/api/profil", korumaliMiddleware(), async (req, res) => {
  const { email, telefon } = req.body || {};
  const sonuc = await kullaniciProfilGuncelle(req.kullanici.id, { email, telefon });
  if (sonuc.hata) return res.status(400).json(sonuc);
  res.json(sonuc);
});

app.get("/api/siparislerim", korumaliMiddleware(), async (req, res) => {
  res.json({ siparisler: await kullaniciSiparisleriniGetir(req.kullanici.id) });
});

app.get("/api/sadakat", korumaliMiddleware(), async (req, res) => {
  try {
    res.json({ sadakat: await sadakatOzetiniGetir(pool, req.kullanici.id) });
  } catch (e) {
    res.status(400).json({ hata: e.message || "Sadakat bilgileri alinamadi." });
  }
});

app.post("/api/sadakat/oduller/:id/satin-al", korumaliMiddleware(), async (req, res) => {
  try {
    await puanlaOdulSatinAl(pool, req.kullanici.id, req.params.id, req.body?.istekAnahtari);
    res.json({ sadakat: await sadakatOzetiniGetir(pool, req.kullanici.id) });
  } catch (e) {
    res.status(400).json({ hata: e.message || "Odul alinamadi." });
  }
});

app.post("/api/sadakat/hediyeler/:id/kullan", korumaliMiddleware(), async (req, res) => {
  try {
    const kisiAdi = `${req.kullanici.ad} ${req.kullanici.soyad}`.trim();
    const odeme = await kullaniciOdulunuSipariseDonustur(
      pool, req.kullanici.id, req.params.id, req.body?.masaNo, kisiAdi
    );
    await onaylananOdemeyiMutfagaAktar(odeme);
    res.json({
      odeme: { ...odeme, mutfagaAktarildi: true },
      sadakat: await sadakatOzetiniGetir(pool, req.kullanici.id),
    });
  } catch (e) {
    res.status(400).json({ hata: e.message || "Hediye kullanilamadi." });
  }
});

app.get("/api/masa/:masaNo", async (req, res) => {
  const masaNo = guvenliMasaNo(req.params.masaNo);
  if (!masaNo) return res.status(400).json({ hata: "Masa numarasi gecersiz." });
  res.json(await masaSiparisleriniGetir(masaNo));
});

app.get("/api/mutfak", rolMiddleware(["mutfak", "salon", "kasiyer"]), async (req, res) => {
  res.json(await tumAcikMasalar());
});
// Aktif ürün kataloğu müşteri uygulamasına açıktır.
app.get("/api/urunler", async (_req, res) => {
  res.json({ urunler: await urunleriGetir() });
});
app.get("/api/oneriler", async (req, res) => {
  const urunIdleri = String(req.query.urunler || "")
    .split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 30);
  res.json({ urunler: await onerileriGetir(urunIdleri) });
});
app.get("/api/kategoriler", async (_req, res) => {
  res.json({ kategoriler: await kategorileriGetir() });
});
app.get("/api/duyurular", async (_req, res) => {
  res.json({ duyurular: await duyurulariGetir() });
});
app.get("/api/kampanyalar", async (_req, res) => { res.json({ kampanyalar: await kampanyalariGetir() }); });

// Ödeme sağlayıcısı bağlanmadan önce de sipariş ve tutar backend'de güvenli
// taslak olarak hazırlanır. İyzico entegrasyonunda yalnızca onay endpointi
// değişecek; taslak ve mutfağa aktarım akışı aynı kalacak.
app.post("/api/odeme/taslak", opsiyonelKullaniciMiddleware(), async (req, res) => {
  try {
    const kullanici = req.kullanici || null;
    const kisiAdi = kullanici ? `${kullanici.ad} ${kullanici.soyad}` : "Misafir";
    const odeme = await odemeTaslagiOlustur({
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
    const sonuc = await odemeSimulasyonOnayla(req.params.id, req.kullanici?.id || null);
    const odeme = sonuc.odeme;
    await onaylananOdemeyiMutfagaAktar(odeme);
    res.json({ odeme: { ...odeme, mutfagaAktarildi: true } });
  } catch (e) {
    res.status(400).json({ hata: e.message || "Test ödemesi onaylanamadı." });
  }
});

app.post("/api/odeme/:id/iyzico-baslat", opsiyonelKullaniciMiddleware(), async (req, res) => {
  try {
    const odeme = await odemeGetir(req.params.id);
    if (!odeme) return res.status(404).json({ hata: "Ödeme taslağı bulunamadı." });
    if (odeme.kullaniciId && !req.kullanici) return res.status(401).json({ hata: "Bu ödeme için giriş gerekli." });
    if (req.kullanici && odeme.kullaniciId && Number(req.kullanici.id) !== Number(odeme.kullaniciId)) {
      return res.status(403).json({ hata: "Bu ödeme taslağı başka bir hesaba ait." });
    }
    if (odeme.durum !== "bekliyor") return res.status(400).json({ hata: "Bu ödeme taslağı yeniden başlatılamaz." });
    const form = await iyzicoCheckoutBaslat(odeme, req.body?.alici, req.ip);
    await odemeSaglayiciTokenKaydet(odeme.id, form.token);
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
    await iyzicoSonucuGetir(odeme, token);
    const sonuc = await odemeIyzicoOlarakOnayla(odeme.id, token);
    await onaylananOdemeyiMutfagaAktar(sonuc.odeme);
    res.redirect(303, iyzicoDonusAdresi(odeme.id));
  } catch (e) {
    console.error("İyzico callback:", e.message);
    const donus = iyzicoDonusAdresi(odeme?.id || "");
    const ayirac = donus.includes("?") ? "&" : "?";
    res.redirect(303, `${donus}${ayirac}odemeHatasi=${encodeURIComponent("Ödeme onaylanamadı.")}`);
  }
});

// FRONTEND_URL geçmişte protokolsüz girildiyse Express mutlak Vercel adresini
// backend altında göreli bir yol sanıyordu. Eski dönüş linklerini güvenli,
// yapılandırılmış frontend adresine taşıyan uyumluluk rotası.
app.get("/api/odeme/iyzico/:yanlisHost/odeme-basarili", (req, res) => {
  const odemeId = String(req.query?.odeme || "").trim();
  res.redirect(303, iyzicoDonusAdresi(odemeId));
});

app.get("/api/odeme/:id/sonuc", opsiyonelKullaniciMiddleware(), async (req, res) => {
  const odeme = await odemeGetir(req.params.id);
  if (!odeme) return res.status(404).json({ hata: "Ödeme bulunamadı." });
  if (odeme.kullaniciId && !req.kullanici) return res.status(401).json({ hata: "Bu ödeme için giriş gerekli." });
  if (req.kullanici && odeme.kullaniciId && Number(req.kullanici.id) !== Number(odeme.kullaniciId)) {
    return res.status(403).json({ hata: "Bu ödeme başka bir hesaba ait." });
  }
  res.json({ odeme });
});

app.post("/api/yerel-admin-kurulum", yerelAdminKurulum);
app.get("/api/yerel-admin-durum", async (req, res) => {
  const ip = req.socket.remoteAddress || "";
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) return res.json({ kurulumGerekli: false });
  res.json({ kurulumGerekli: await yerelAdminKurulumGerekli() });
});

async function yerelAdminKurulum(req, res) {
  try {
    const ip = req.socket.remoteAddress || "";
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) {
      return res.status(403).json({ hata: "İlk admin kurulumu yalnızca bu bilgisayardan yapılabilir." });
    }
    await ilkYerelAdminOlustur(req.body || {});
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

app.get("/api/admin/dashboard", admin, guvenli(() => dashboardGetir()));
app.get("/api/admin/urunler", admin, guvenli(async () => ({ urunler: await urunleriGetir({ tumu: true }) })));
app.post("/api/admin/urunler", admin, guvenli(async (req) => {
  const eski = req.body.id ? await yonetimVarliginiGetir("urun", req.body.id) : null;
  const urun = await urunKaydet(req.body);
  await revizyonKaydet({ yapan: req.kullanici, varlikTuru: "urun", varlikId: urun.id, islem: eski ? "guncelleme" : "ekleme", aciklama: eski ? `${urun.ad} ürünü güncellendi.` : `${urun.ad} ürünü eklendi.`, eskiDeger: eski, yeniDeger: urun });
  io.emit("urunler-guncellendi", await urunleriGetir());
  return { urun };
}));
app.patch("/api/admin/urunler/:id/aktif", admin, guvenli(async (req) => {
  const eski = await yonetimVarliginiGetir("urun", req.params.id);
  await urunAktiflikDegistir(req.params.id, req.body.aktif);
  const yeni = await yonetimVarliginiGetir("urun", req.params.id);
  await revizyonKaydet({ yapan: req.kullanici, varlikTuru: "urun", varlikId: req.params.id, islem: "durum", aciklama: `${eski?.ad || "Ürün"} ${req.body.aktif ? "yayına alındı" : "pasife alındı"}.`, eskiDeger: eski, yeniDeger: yeni });
  io.emit("urunler-guncellendi", await urunleriGetir());
}));
app.delete("/api/admin/urunler/:id", admin, guvenli(async (req) => {
  const eski = await yonetimVarliginiGetir("urun", req.params.id);
  await urunArsivle(req.params.id);
  await revizyonKaydet({ yapan: req.kullanici, varlikTuru: "urun", varlikId: req.params.id, islem: "arsivleme", aciklama: `${eski?.ad || "Ürün"} katalogdan arşivlendi.`, eskiDeger: eski });
  io.emit("urunler-guncellendi", await urunleriGetir());
}));
app.post("/api/admin/gorseller", admin, express.raw({ type: "image/*", limit: "5mb" }), guvenli(async (req) => {
  const gorsel = await gorselYukle(req.body);
  return { gorsel };
}));
app.get("/api/admin/kategoriler", admin, guvenli(async () => ({ kategoriler: await kategorileriGetir({ tumu: true }) })));
app.post("/api/admin/kategoriler", admin, guvenli(async (req) => {
  const eski = req.body.id ? await yonetimVarliginiGetir("kategori", req.body.id) : null;
  const kategori = await kategoriKaydet(req.body);
  await revizyonKaydet({ yapan: req.kullanici, varlikTuru: "kategori", varlikId: kategori.id, islem: eski ? "guncelleme" : "ekleme", aciklama: `${kategori.ad} kategorisi ${eski ? "güncellendi" : "eklendi"}.`, eskiDeger: eski, yeniDeger: kategori });
  io.emit("kategoriler-guncellendi", await kategorileriGetir());
  io.emit("urunler-guncellendi", await urunleriGetir());
  return { kategori };
}));
app.delete("/api/admin/kategoriler/:id", admin, guvenli(async (req) => {
  const eski = await yonetimVarliginiGetir("kategori", req.params.id);
  await kategoriArsivle(req.params.id);
  await revizyonKaydet({ yapan: req.kullanici, varlikTuru: "kategori", varlikId: req.params.id, islem: "arsivleme", aciklama: `${eski?.ad || "Kategori"} arşivlendi.`, eskiDeger: eski });
  io.emit("kategoriler-guncellendi", await kategorileriGetir());
}));
app.get("/api/admin/personeller", admin, guvenli(async () => ({ personeller: await personelleriGetir() })));
app.post("/api/admin/personeller", admin, guvenli(async (req) => {
  const eski = req.body.id ? await yonetimVarliginiGetir("personel", req.body.id) : null;
  const personel = await personelKaydet(req.body);
  await revizyonKaydet({ yapan: req.kullanici, varlikTuru: "personel", varlikId: personel.id, islem: eski ? "guncelleme" : "ekleme", aciklama: `${personel.ad} ${personel.soyad} personel kaydı ${eski ? "güncellendi" : "eklendi"}.`, eskiDeger: eski, yeniDeger: personel });
  return { personel };
}));
app.delete("/api/admin/personeller/:id", admin, guvenli(async (req) => {
  const eski = await yonetimVarliginiGetir("personel", req.params.id);
  await personelArsivle(req.params.id);
  await revizyonKaydet({ yapan: req.kullanici, varlikTuru: "personel", varlikId: req.params.id, islem: "arsivleme", aciklama: `${eski?.ad || "Personel"} ${eski?.soyad || ""} ekipten arşivlendi.`, eskiDeger: eski });
}));
app.post("/api/admin/personeller/:id/vardiya", admin, guvenli(async (req) => {
  await vardiyaDegistir(req.params.id, req.body.islem);
  const personel = await yonetimVarliginiGetir("personel", req.params.id);
  await revizyonKaydet({ yapan: req.kullanici, varlikTuru: "vardiya", varlikId: req.params.id, islem: req.body.islem, aciklama: `${personel?.ad || "Personel"} için vardiya ${req.body.islem === "giris" ? "başlatıldı" : "kapatıldı"}.` });
}));
app.get("/api/admin/raporlar/satis", admin, guvenli((req) => satisRaporuGetir(req.query.gun)));
app.get("/api/admin/satislar/canli", admin, guvenli(async (req) => ({ satislar: await canliSatislariGetir(req.query) })));
app.get("/api/admin/satislar/gecmis", admin, guvenli(async (req) => ({ satislar: await gecmisSatislariGetir(req.query) })));
app.get("/api/admin/kayitlar/mutfak", admin, guvenli(async (req) => ({ kayitlar: await mutfakKayitlariniGetir(req.query) })));
app.get("/api/admin/kayitlar/musteriler", admin, guvenli(async (req) => ({ musteriler: await musteriKayitlariniGetir(req.query) })));
app.get("/api/admin/kayitlar/personel", admin, guvenli(async (req) => personelKayitlariniGetir(req.query)));
app.get("/api/admin/revizyonlar", admin, guvenli(async (req) => ({ revizyonlar: await revizyonKayitlariniGetir(req.query) })));
app.get("/api/admin/duyurular", admin, guvenli(async () => ({ duyurular: await duyurulariGetir({ tumu: true }) })));
app.post("/api/admin/duyurular", admin, guvenli(async (req) => {
  const duyuru = await duyuruKaydet(req.body);
  await revizyonKaydet({ yapan: req.kullanici, varlikTuru: "duyuru", varlikId: duyuru.id, islem: "ekleme", aciklama: `${duyuru.baslik} duyurusu yayınlandı.`, yeniDeger: duyuru });
  io.emit("duyurular-guncellendi", await duyurulariGetir());
  return { duyuru };
}));
app.delete("/api/admin/duyurular/:id", admin, guvenli(async (req) => {
  const eski = await yonetimVarliginiGetir("duyuru", req.params.id);
  await duyuruArsivle(req.params.id);
  await revizyonKaydet({ yapan: req.kullanici, varlikTuru: "duyuru", varlikId: req.params.id, islem: "arsivleme", aciklama: `${eski?.baslik || "Duyuru"} yayından kaldırıldı.`, eskiDeger: eski });
  io.emit("duyurular-guncellendi", await duyurulariGetir());
}));
app.get("/api/admin/kampanyalar", admin, guvenli(async () => ({ kampanyalar: await kampanyalariGetir({ tumu: true }) })));
app.post("/api/admin/kampanyalar", admin, guvenli(async (req) => { const eski = req.body.id ? await yonetimVarliginiGetir("kampanya", req.body.id) : null; const kampanya = await kampanyaKaydet(req.body); await revizyonKaydet({ yapan: req.kullanici, varlikTuru: "kampanya", varlikId: kampanya.id, islem: eski ? "guncelleme" : "ekleme", aciklama: `${kampanya.baslik} kampanyası ${eski ? "güncellendi" : "oluşturuldu"}.`, eskiDeger: eski, yeniDeger: kampanya }); io.emit("kampanyalar-guncellendi", await kampanyalariGetir()); return { kampanya }; }));
app.delete("/api/admin/kampanyalar/:id", admin, guvenli(async (req) => { const eski = await yonetimVarliginiGetir("kampanya", req.params.id); await kampanyaArsivle(req.params.id); await revizyonKaydet({ yapan: req.kullanici, varlikTuru: "kampanya", varlikId: req.params.id, islem: "arsivleme", aciklama: `${eski?.baslik || "Kampanya"} arşivlendi.`, eskiDeger: eski }); io.emit("kampanyalar-guncellendi", await kampanyalariGetir()); }));
app.get("/api/admin/oduller", admin, guvenli(async () => ({ oduller: await adminOdulleriGetir(pool) })));
app.post("/api/admin/oduller", admin, guvenli(async (req) => { const eski = req.body.id ? await yonetimVarliginiGetir("odul", req.body.id) : null; const oduller = await adminOdulKaydet(pool, req.body); const yeni = req.body.id ? await yonetimVarliginiGetir("odul", req.body.id) : [...oduller].filter((odul) => odul.ad === String(req.body.ad || "").trim() && Number(odul.urunId) === Number(req.body.urunId)).sort((a, b) => Number(b.id) - Number(a.id))[0]; await revizyonKaydet({ yapan: req.kullanici, varlikTuru: "odul", varlikId: yeni?.id, islem: eski ? "guncelleme" : "ekleme", aciklama: `${req.body.ad || "Ödül"} puan marketinde ${eski ? "güncellendi" : "oluşturuldu"}.`, eskiDeger: eski, yeniDeger: yeni }); io.emit("oduller-guncellendi"); return { oduller }; }));
app.delete("/api/admin/oduller/:id", admin, guvenli(async (req) => { const eski = await yonetimVarliginiGetir("odul", req.params.id); await adminOdulArsivle(pool, req.params.id); await revizyonKaydet({ yapan: req.kullanici, varlikTuru: "odul", varlikId: req.params.id, islem: "arsivleme", aciklama: `${eski?.ad || "Ödül"} puan marketinden arşivlendi.`, eskiDeger: eski }); io.emit("oduller-guncellendi"); }));

app.get("/", (req, res) => res.send("Burger Plus backend calisiyor (PostgreSQL)"));

// Saglik kontrolu — Render/izleme araclari icin
app.get("/saglik", (req, res) => res.json({ durum: "calisiyor", zaman: new Date().toISOString() }));

async function onaylananOdemeyiMutfagaAktar(odeme) {
  if (odeme.mutfagaAktarildi) return;
  const masaNo = odeme.masaNo || "algotur";
  await masaSirayaAl(masaNo, async () => {
    for (const [kalemNo, urun] of odeme.urunler.entries()) {
      await kalemEkle(
        masaNo, urun, odeme.kisiAdi, urun.secimler, urun.haricMalzemeler,
        odeme.siparisNo, odeme.id, kalemNo
      );
    }
    await odemeMutfagaAktarildi(odeme.id);
    const tumMasalar = await tumAcikMasalar();
    io.to(`masa-${masaNo}`).emit("masa-guncellendi", await masaSiparisleriniGetir(masaNo));
    io.to("mutfak").emit("mutfak-guncellendi", tumMasalar);
    io.to("salon").emit("salon-guncellendi", tumMasalar);
    io.to("yonetim").emit("yonetim-satis-guncellendi", {
      siparisNo: odeme.siparisNo,
      masaNo: odeme.masaNo || "Al Götür",
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
function masaSirayaAl(masaNo, islem) {
  const anahtar = String(masaNo);
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
    const token = String(socket.handshake.auth?.token || "").trim();
    socket.kullanici = token ? await tokenDogrula(token) : null;
    if (token && !socket.kullanici) return sonraki(new Error("Oturum gecersiz."));
    sonraki();
  } catch {
    sonraki(new Error("Oturum dogrulanamadi."));
  }
});

io.on("connection", (socket) => {
  console.log("Baglandi:", socket.id);

  socket.on("masaya-katil", async (gelenMasaNo) => {
    const masaNo = guvenliMasaNo(gelenMasaNo);
    if (!masaNo) return;
    socket.join(`masa-${masaNo}`);
    socket.emit("masa-guncellendi", await masaSiparisleriniGetir(masaNo));
    console.log(`${socket.id} -> masa-${masaNo}`);
  });

  socket.on("urun-ekle", ({ masaNo, urun, kisiAdi, secimler, haricMalzemeler, siparisNo }, tamamlandi) => {
    masaNo = guvenliMasaNo(masaNo);
    if (!masaNo || process.env.LEGACY_SOCKET_SIPARIS_AKTIF !== "true" || !socketRoluVar(socket, ["mutfak", "salon", "kasiyer"])) {
      if (typeof tamamlandi === "function") tamamlandi({ basarili: false, hata: "Bu siparis yolu kullanima kapali." });
      return;
    }
    masaSirayaAl(masaNo, async () => {
      const guncel = await kalemEkle(
        masaNo, urun, kisiAdi, secimler || urun?.secimler || {},
        haricMalzemeler || urun?.haricMalzemeler || [], siparisNo
      );
      io.to(`masa-${masaNo}`).emit("masa-guncellendi", guncel);
      const tumMasalar = await tumAcikMasalar();
      io.to("mutfak").emit("mutfak-guncellendi", tumMasalar);
      io.to("salon").emit("salon-guncellendi", tumMasalar);
      if (typeof tamamlandi === "function") tamamlandi({ basarili: true });
    }).catch((e) => {
      console.error("Ürün ekleme hatası:", e.message);
      if (typeof tamamlandi === "function") tamamlandi({ basarili: false, hata: e.message });
    });
  });

  socket.on("mutfaga-katil", async () => {
    if (!socketRoluVar(socket, ["mutfak"])) return;
    socket.join("mutfak");
    socket.emit("mutfak-guncellendi", await tumAcikMasalar());
    console.log(`${socket.id} -> mutfak`);
  });

  // Salon personeli odasi (garson/kasiyer). Tum acik masalari gorur.
  socket.on("salona-katil", async () => {
    if (!socketRoluVar(socket, ["salon", "kasiyer"])) return;
    socket.join("salon");
    socket.emit("salon-guncellendi", await tumAcikMasalar());
    console.log(`${socket.id} -> salon`);
  });

  socket.on("yonetime-katil", async () => {
    if (!socketRoluVar(socket, [])) return;
    socket.join("yonetim");
    socket.emit("yonetim-satislar", await canliSatislariGetir({ limit: 50 }));
  });

  socket.on("masa-durum-degistir", ({ masaNo, siparisNo, durum }, tamamlandi) => {
    masaNo = guvenliMasaNo(masaNo);
    if (!masaNo || !socketRoluVar(socket, ["mutfak"])) {
      if (typeof tamamlandi === "function") tamamlandi({ basarili: false, hata: "Yetkisiz islem." });
      return;
    }
    masaSirayaAl(masaNo, async () => {
      const guncel = await masaDurumGuncelle(masaNo, durum, socket.kullanici?.id, siparisNo);
      if (guncel) {
        io.to(`masa-${masaNo}`).emit("masa-guncellendi", guncel);
        const tumMasalar = await tumAcikMasalar();
        io.to("mutfak").emit("mutfak-guncellendi", tumMasalar);
        io.to("salon").emit("salon-guncellendi", tumMasalar);
        io.to("yonetim").emit("yonetim-operasyon-guncellendi", { masaNo, siparisNo, durum, zaman: new Date().toISOString() });
      }
      if (typeof tamamlandi === "function") tamamlandi({ basarili: true });
    }).catch((e) => {
      console.error("Durum değiştirme hatası:", e.message);
      if (typeof tamamlandi === "function") tamamlandi({ basarili: false, hata: e.message });
    });
  });

  // Salon: masayi kapat (musteriler kalkinca). Oturum kapanir, yeni gelen temiz baslar.
  socket.on("masa-kapat", (gelenMasaNo, tamamlandi) => {
    const masaNo = guvenliMasaNo(gelenMasaNo);
    if (!masaNo || !socketRoluVar(socket, ["salon", "kasiyer"])) {
      if (typeof tamamlandi === "function") tamamlandi({ basarili: false, hata: "Yetkisiz islem." });
      return;
    }
    masaSirayaAl(masaNo, async () => {
      const bos = await masaKapat(masaNo, socket.kullanici?.id);
      io.to(`masa-${masaNo}`).emit("masa-guncellendi", bos);
      io.to(`masa-${masaNo}`).emit("masa-kapandi", { masaNo });
      const tumMasalar = await tumAcikMasalar();
      io.to("mutfak").emit("mutfak-guncellendi", tumMasalar);
      io.to("salon").emit("salon-guncellendi", tumMasalar);
      io.to("yonetim").emit("yonetim-operasyon-guncellendi", { masaNo, durum: "kapali", zaman: new Date().toISOString() });
      if (typeof tamamlandi === "function") tamamlandi({ basarili: true });
      console.log(`Masa ${masaNo} kapatildi`);
    }).catch((e) => {
      console.error("Masa kapatma hatası:", e.message);
      if (typeof tamamlandi === "function") tamamlandi({ basarili: false, hata: e.message });
    });
  });

  socket.on("disconnect", () => console.log("Ayrildi:", socket.id));
});

app.use((err, _req, res, _next) => {
  if (err?.kod === "CORS_ENGELLENDI") {
    return res.status(403).json({ hata: "Bu adresin backend erişimine izin verilmiyor." });
  }
  console.error("Beklenmeyen HTTP hatası:", err?.message || err);
  res.status(500).json({ hata: "Sunucu isteği tamamlayamadı." });
});

const PORT = process.env.PORT || 4000;

// Once tablolari hazirla, sonra sunucuyu baslat.
// 0.0.0.0: bulut ortamlarinda (Render vb.) disaridan erisim icin gerekli.
tablolariHazirla()
  .then(() => adminTablolariHazirla())
  .then(() => sadakatTablolariHazirla(pool))
  .then(() => {
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`Burger Plus backend calisiyor -> port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Veritabanina baglanilamadi:", err.message);
    console.error("(DATABASE_URL veya .env ayarlari dogru mu?)");
    process.exit(1);
  });
