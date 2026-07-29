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
import {
  tablolariHazirla,
  masaSiparisleriniGetir,
  kalemEkle,
  masaDurumGuncelle,
  tumAcikMasalar,
  masaKapat,
  kullaniciPuanGuncelle,
  kullaniciProfilGuncelle,
  kullaniciSiparisKaydet,
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
  urunKaydet,
  urunAktiflikDegistir,
  personelleriGetir,
  personelKaydet,
  vardiyaDegistir,
  dashboardGetir,
  satisRaporuGetir,
  duyurulariGetir,
  duyuruKaydet,
} from "./adminDb.js";
import { kayitOl, girisYap, korumaliMiddleware, adminMiddleware, opsiyonelKullaniciMiddleware } from "./auth.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

// --- HTTP API ---

// Kayit ol
app.post("/api/kayit", async (req, res) => {
  const sonuc = await kayitOl(req.body);
  if (sonuc.hata) return res.status(400).json(sonuc);
  res.json(sonuc);
});

// Giris yap
app.post("/api/giris", async (req, res) => {
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

// Puan guncelle (odeme sonrasi; sadece giris yapmis kullanici)
app.post("/api/puan", korumaliMiddleware(), async (req, res) => {
  const { puan } = req.body;
  await kullaniciPuanGuncelle(req.kullanici.id, puan);
  res.json({ puan });
});

// Profil guncelle (email + telefon; ad/soyad/cinsiyet degismez)
app.post("/api/profil", korumaliMiddleware(), async (req, res) => {
  const { email, telefon } = req.body;
  const sonuc = await kullaniciProfilGuncelle(req.kullanici.id, { email, telefon });
  if (sonuc.hata) return res.status(400).json(sonuc);
  res.json(sonuc);
});

app.get("/api/siparislerim", korumaliMiddleware(), async (req, res) => {
  res.json({ siparisler: await kullaniciSiparisleriniGetir(req.kullanici.id) });
});

app.post("/api/siparislerim", korumaliMiddleware(), async (req, res) => {
  try {
    const siparis = await kullaniciSiparisKaydet(req.kullanici.id, req.body || {});
    res.json({ siparis });
  } catch (e) {
    res.status(400).json({ hata: e.message || "Sipariş kaydedilemedi." });
  }
});

app.get("/api/masa/:masaNo", async (req, res) => {
  res.json(await masaSiparisleriniGetir(req.params.masaNo));
});

app.get("/api/mutfak", async (req, res) => {
  res.json(await tumAcikMasalar());
});
// Aktif ürün kataloğu müşteri uygulamasına açıktır.
app.get("/api/urunler", async (_req, res) => {
  res.json({ urunler: await urunleriGetir() });
});
app.get("/api/duyurular", async (_req, res) => {
  res.json({ duyurular: await duyurulariGetir() });
});

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
  if (process.env.NODE_ENV === "production" || process.env.ODEME_SIMULASYONU === "kapali") {
    return res.status(403).json({ hata: "Test ödeme onayı canlı ortamda kapalıdır." });
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

app.get("/api/odeme/:id/sonuc", opsiyonelKullaniciMiddleware(), async (req, res) => {
  const odeme = await odemeGetir(req.params.id);
  if (!odeme) return res.status(404).json({ hata: "Ödeme bulunamadı." });
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
  const urun = await urunKaydet(req.body);
  io.emit("urunler-guncellendi", await urunleriGetir());
  return { urun };
}));
app.patch("/api/admin/urunler/:id/aktif", admin, guvenli(async (req) => {
  await urunAktiflikDegistir(req.params.id, req.body.aktif);
  io.emit("urunler-guncellendi", await urunleriGetir());
}));
app.get("/api/admin/personeller", admin, guvenli(async () => ({ personeller: await personelleriGetir() })));
app.post("/api/admin/personeller", admin, guvenli(async (req) => ({ personel: await personelKaydet(req.body) })));
app.post("/api/admin/personeller/:id/vardiya", admin, guvenli((req) => vardiyaDegistir(req.params.id, req.body.islem)));
app.get("/api/admin/raporlar/satis", admin, guvenli((req) => satisRaporuGetir(req.query.gun)));
app.get("/api/admin/duyurular", admin, guvenli(async () => ({ duyurular: await duyurulariGetir({ tumu: true }) })));
app.post("/api/admin/duyurular", admin, guvenli(async (req) => {
  const duyuru = await duyuruKaydet(req.body);
  io.emit("duyurular-guncellendi", await duyurulariGetir());
  return { duyuru };
}));

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
    if (odeme.kullaniciId) {
      await kullaniciSiparisKaydet(odeme.kullaniciId, {
        id: odeme.siparisNo,
        siparisNo: odeme.siparisNo,
        masaNo: odeme.masaNo,
        tip: odeme.tip,
        urunler: odeme.urunler,
        tutar: odeme.tutar,
        kazanilanPuan: odeme.kazanilanPuan,
      });
    }
    await odemeMutfagaAktarildi(odeme.id);
    const tumMasalar = await tumAcikMasalar();
    io.to(`masa-${masaNo}`).emit("masa-guncellendi", await masaSiparisleriniGetir(masaNo));
    io.to("mutfak").emit("mutfak-guncellendi", tumMasalar);
    io.to("salon").emit("salon-guncellendi", tumMasalar);
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

io.on("connection", (socket) => {
  console.log("Baglandi:", socket.id);

  socket.on("masaya-katil", async (masaNo) => {
    socket.join(`masa-${masaNo}`);
    socket.emit("masa-guncellendi", await masaSiparisleriniGetir(masaNo));
    console.log(`${socket.id} -> masa-${masaNo}`);
  });

  socket.on("urun-ekle", ({ masaNo, urun, kisiAdi, secimler, haricMalzemeler, siparisNo }, tamamlandi) => {
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
    socket.join("mutfak");
    socket.emit("mutfak-guncellendi", await tumAcikMasalar());
    console.log(`${socket.id} -> mutfak`);
  });

  // Salon personeli odasi (garson/kasiyer). Tum acik masalari gorur.
  socket.on("salona-katil", async () => {
    socket.join("salon");
    socket.emit("salon-guncellendi", await tumAcikMasalar());
    console.log(`${socket.id} -> salon`);
  });

  socket.on("masa-durum-degistir", ({ masaNo, durum }, tamamlandi) => {
    masaSirayaAl(masaNo, async () => {
      const guncel = await masaDurumGuncelle(masaNo, durum);
      if (guncel) {
        io.to(`masa-${masaNo}`).emit("masa-guncellendi", guncel);
        const tumMasalar = await tumAcikMasalar();
        io.to("mutfak").emit("mutfak-guncellendi", tumMasalar);
        io.to("salon").emit("salon-guncellendi", tumMasalar);
      }
      if (typeof tamamlandi === "function") tamamlandi({ basarili: true });
    }).catch((e) => {
      console.error("Durum değiştirme hatası:", e.message);
      if (typeof tamamlandi === "function") tamamlandi({ basarili: false, hata: e.message });
    });
  });

  // Salon: masayi kapat (musteriler kalkinca). Oturum kapanir, yeni gelen temiz baslar.
  socket.on("masa-kapat", (masaNo, tamamlandi) => {
    masaSirayaAl(masaNo, async () => {
      const bos = await masaKapat(masaNo);
      io.to(`masa-${masaNo}`).emit("masa-guncellendi", bos);
      io.to(`masa-${masaNo}`).emit("masa-kapandi", { masaNo });
      const tumMasalar = await tumAcikMasalar();
      io.to("mutfak").emit("mutfak-guncellendi", tumMasalar);
      io.to("salon").emit("salon-guncellendi", tumMasalar);
      if (typeof tamamlandi === "function") tamamlandi({ basarili: true });
      console.log(`Masa ${masaNo} kapatildi`);
    }).catch((e) => {
      console.error("Masa kapatma hatası:", e.message);
      if (typeof tamamlandi === "function") tamamlandi({ basarili: false, hata: e.message });
    });
  });

  socket.on("disconnect", () => console.log("Ayrildi:", socket.id));
});

const PORT = process.env.PORT || 4000;

// Once tablolari hazirla, sonra sunucuyu baslat.
// 0.0.0.0: bulut ortamlarinda (Render vb.) disaridan erisim icin gerekli.
tablolariHazirla()
  .then(() => adminTablolariHazirla())
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
