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
} from "./db.js";
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
} from "./adminDb.js";
import { kayitOl, girisYap, korumaliMiddleware, adminMiddleware } from "./auth.js";

const app = express();
app.use(cors());
app.use(express.json());

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

app.get("/", (req, res) => res.send("Burger Plus backend calisiyor (PostgreSQL)"));

// Saglik kontrolu — Render/izleme araclari icin
app.get("/saglik", (req, res) => res.json({ durum: "calisiyor", zaman: new Date().toISOString() }));

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
