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
import { kayitOl, girisYap, korumaliMiddleware } from "./auth.js";

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

app.get("/", (req, res) => res.send("Burger Plus backend calisiyor (PostgreSQL)"));

// Saglik kontrolu — Render/izleme araclari icin
app.get("/saglik", (req, res) => res.json({ durum: "calisiyor", zaman: new Date().toISOString() }));

// --- Socket.io ---
io.on("connection", (socket) => {
  console.log("Baglandi:", socket.id);

  socket.on("masaya-katil", async (masaNo) => {
    socket.join(`masa-${masaNo}`);
    socket.emit("masa-guncellendi", await masaSiparisleriniGetir(masaNo));
    console.log(`${socket.id} -> masa-${masaNo}`);
  });

  socket.on("urun-ekle", async ({ masaNo, urun, kisiAdi }) => {
    const guncel = await kalemEkle(masaNo, urun, kisiAdi);
    io.to(`masa-${masaNo}`).emit("masa-guncellendi", guncel);
    io.to("mutfak").emit("mutfak-guncellendi", await tumAcikMasalar());
    io.to("salon").emit("salon-guncellendi", await tumAcikMasalar());
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

  socket.on("masa-durum-degistir", async ({ masaNo, durum }) => {
    const guncel = await masaDurumGuncelle(masaNo, durum);
    if (guncel) {
      io.to(`masa-${masaNo}`).emit("masa-guncellendi", guncel);
      io.to("mutfak").emit("mutfak-guncellendi", await tumAcikMasalar());
      io.to("salon").emit("salon-guncellendi", await tumAcikMasalar());
    }
  });

  // Salon: masayi kapat (musteriler kalkinca). Oturum kapanir, yeni gelen temiz baslar.
  socket.on("masa-kapat", async (masaNo) => {
    const bos = await masaKapat(masaNo);
    // Masadaki musterilere bos masa bildir (ekranlari temizlensin)
    io.to(`masa-${masaNo}`).emit("masa-guncellendi", bos);
    io.to(`masa-${masaNo}`).emit("masa-kapandi", { masaNo });
    // Mutfak ve salon listelerini guncelle (masa listeden dussun)
    io.to("mutfak").emit("mutfak-guncellendi", await tumAcikMasalar());
    io.to("salon").emit("salon-guncellendi", await tumAcikMasalar());
    console.log(`Masa ${masaNo} kapatildi`);
  });

  socket.on("disconnect", () => console.log("Ayrildi:", socket.id));
});

const PORT = process.env.PORT || 4000;

// Once tablolari hazirla, sonra sunucuyu baslat.
// 0.0.0.0: bulut ortamlarinda (Render vb.) disaridan erisim icin gerekli.
tablolariHazirla()
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
