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
  const { ad, soyad, cinsiyet, email, telefon, sifre } = veri;

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

  // E-posta zaten kayitli mi?
  const mevcut = await kullaniciBulEmail(email);
  if (mevcut) {
    return { hata: "Bu e-posta zaten kayıtlı." };
  }

  // Sifreyi hash'le (10 tur salt — senior standart)
  const sifreHash = await bcrypt.hash(sifre, 10);

  const kullanici = await kullaniciOlustur({
    ad, soyad, cinsiyet, email, telefon, sifreHash,
  });

  const token = tokenUret(kullanici.id);
  return { kullanici, token };
}

// --- Giris ---
export async function girisYap({ email, sifre }) {
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

  // sifre_hash'i disari sizdirma
  const { sifre_hash, ...guvenli } = kullanici;
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
