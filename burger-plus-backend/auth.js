// ============================================================================
// Kimlik dogrulama (auth) katmani
// bcrypt ile sifre hash'leme, JWT ile oturum token'i.
// ============================================================================

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  kullaniciOlustur,
  kullaniciBulEmail,
  kullaniciBulId,
  davetKoduylaKullaniciBul,
} from "./db.js";

// JWT gizli anahtari. Gercek uretimde .env'den gelmeli ve gizli olmali.
const JWT_SECRET = process.env.JWT_SECRET || "burger-plus-gizli-anahtar-degistir";
const TOKEN_SURESI = "7d"; // token 7 gun gecerli

// Basit e-posta bicim kontrolu
function emailGecerli(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// --- Kayit ---
export async function kayitOl(veri) {
  const ad = String(veri?.ad || "").trim().slice(0, 60);
  const soyad = String(veri?.soyad || "").trim().slice(0, 60);
  const cinsiyet = String(veri?.cinsiyet || "").trim().slice(0, 20);
  const email = String(veri?.email || "").trim().toLowerCase().slice(0, 254);
  const telefon = String(veri?.telefon || "").trim().slice(0, 20);
  const sifre = String(veri?.sifre || "");
  const davetKodu = String(veri?.davetKodu || "").trim().toUpperCase();

  // Dogrulama
  if (!ad || !soyad || !email || !sifre) {
    return { hata: "Ad, soyad, e-posta ve şifre zorunludur." };
  }
  if (!emailGecerli(email)) {
    return { hata: "Geçerli bir e-posta adresi girin." };
  }
  if (sifre.length < 6) {
    return { hata: "Şifre en az 6 karakter olmalıdır." };
  }
  if (sifre.length > 72) return { hata: "Şifre en fazla 72 karakter olabilir." };
  if (davetKodu && !/^[A-HJ-NP-Z2-9]{8}$/.test(davetKodu)) {
    return { hata: "Davet kodu 8 karakterli ve geçerli biçimde olmalıdır." };
  }

  // E-posta zaten kayitli mi?
  const mevcut = await kullaniciBulEmail(email);
  if (mevcut) {
    return { hata: "Bu e-posta zaten kayıtlı." };
  }

  const davetEden = davetKodu ? await davetKoduylaKullaniciBul(davetKodu) : null;
  if (davetKodu && !davetEden) return { hata: "Davet kodu bulunamadı." };

  // Sifreyi hash'le (10 tur salt — senior standart)
  const sifreHash = await bcrypt.hash(sifre, 10);

  let kullanici;
  try {
    kullanici = await kullaniciOlustur({
      ad, soyad, cinsiyet, email, telefon, sifreHash, davetEdenId: davetEden?.id || null,
    });
  } catch (e) {
    if (e.code === "23505") return { hata: "Bu e-posta zaten kayıtlı." };
    throw e;
  }

  const token = tokenUret(kullanici.id);
  return { kullanici, token };
}

// --- Giris ---
export async function girisYap({ email, sifre }) {
  email = String(email || "").trim().toLowerCase().slice(0, 254);
  sifre = String(sifre || "");
  if (!email || !sifre) {
    return { hata: "E-posta ve şifre gerekli." };
  }

  const kullanici = await kullaniciBulEmail(email);
  if (!kullanici) {
    return { hata: "E-posta veya şifre hatalı." };
  }

  const dogruMu = await bcrypt.compare(sifre, kullanici.sifre_hash);
  if (!dogruMu) {
    return { hata: "E-posta veya şifre hatalı." };
  }

  const guvenli = await kullaniciBulId(kullanici.id);
  const token = tokenUret(kullanici.id);
  return { kullanici: guvenli, token };
}

// --- Token uret / dogrula ---
function tokenUret(kullaniciId) {
  return jwt.sign({ id: kullaniciId }, JWT_SECRET, { expiresIn: TOKEN_SURESI });
}

// Token'i dogrular, gecerliyse guncel kullanici bilgisini dondurur.
export async function tokenDogrula(token) {
  try {
    const cozulmus = jwt.verify(token, JWT_SECRET);
    const kullanici = await kullaniciBulId(cozulmus.id);
    return kullanici; // null olabilir (silinmis kullanici)
  } catch {
    return null; // gecersiz/suresi dolmus token
  }
}

// Express middleware: gecerli token olmadan gecmeyi engeller.
export function korumaliMiddleware() {
  return async (req, res, next) => {
    const baslik = req.headers.authorization || "";
    const token = baslik.startsWith("Bearer ") ? baslik.slice(7) : null;
    if (!token) return res.status(401).json({ hata: "Giriş gerekli." });

    const kullanici = await tokenDogrula(token);
    if (!kullanici) return res.status(401).json({ hata: "Oturum geçersiz." });

    req.kullanici = kullanici;
    next();
  };
}

// Misafir ödeme akışını destekler; token varsa kullanıcıyı ekler, yoksa isteği
// engellemez. Ödeme tutarı ve sipariş içeriği yine backend tarafından doğrulanır.
export function opsiyonelKullaniciMiddleware() {
  return async (req, _res, next) => {
    const baslik = req.headers.authorization || "";
    const token = baslik.startsWith("Bearer ") ? baslik.slice(7) : null;
    if (token) req.kullanici = await tokenDogrula(token);
    next();
  };
}

// Yönetim uçları yalnızca rolü admin olan gerçek kullanıcı hesabına açıktır.
export function adminMiddleware() {
  return async (req, res, next) => {
    const baslik = req.headers.authorization || "";
    const token = baslik.startsWith("Bearer ") ? baslik.slice(7) : null;
    if (!token) return res.status(401).json({ hata: "Yönetici girişi gerekli." });

    const kullanici = await tokenDogrula(token);
    if (!kullanici || kullanici.rol !== "admin") {
      return res.status(403).json({ hata: "Bu işlem için yönetici yetkisi gerekli." });
    }
    req.kullanici = kullanici;
    next();
  };
}
