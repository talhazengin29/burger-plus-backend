// ============================================================================
// Kimlik dogrulama (auth) katmani
// bcrypt ile sifre hash'leme, JWT ile oturum token'i.
// ============================================================================

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "crypto";
import {
  kullaniciOlustur,
  kullaniciBulEmail,
  kullaniciBulId,
  davetKoduylaKullaniciBul,
  sifreSifirlamaTalebiOlustur,
  sifreSifirlamaTokeniGecerliMi,
  sifreyiSifirla as sifreyiSifirlaDb,
  ikiFaktorKaydiniGetir,
  ikiFaktorBekleyeniKaydet,
  ikiFaktorEtkinlestir,
  ikiFaktorKapat,
  ikiFaktorKurtarmaKoduKullan,
} from "./db.js";
import { sifirlamaEpostasiGonder } from "./eposta.js";
import {
  ikiFaktorSirriUret, ikiFaktorUriUret, ikiFaktorKoduGecerliMi,
  ikiFaktorSirriSifrele, ikiFaktorSirriCoz,
  kurtarmaKodlariUret, kurtarmaKoduHashle, kurtarmaKoduBicimindeMi,
} from "./ikiFaktor.js";

// JWT gizli anahtari. Gercek uretimde .env'den gelmeli ve gizli olmali.
const URETIM = process.env.NODE_ENV === "production";
const YEREL_JWT_SECRET = "yalnizca-yerel-gelistirme-icin-burger-plus-secret";
const JWT_SECRET = String(process.env.JWT_SECRET || (URETIM ? "" : YEREL_JWT_SECRET));
if (JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET en az 32 karakter olmali ve production ortaminda zorunludur.");
}
if (!URETIM && !process.env.JWT_SECRET) {
  console.warn("UYARI: Yerel JWT_SECRET kullaniliyor; canli ortamda guclu bir JWT_SECRET tanimlayin.");
}
const TOKEN_SURESI = "7d"; // token 7 gun gecerli

function isletmeIdZorunlu(isletmeId) {
  const id = Number(isletmeId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("isletmeId zorunlu");
  return id;
}

// Basit e-posta bicim kontrolu
function emailGecerli(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// --- Kayit ---
export async function kayitOl(isletmeId, veri) {
  const tenantId = isletmeIdZorunlu(isletmeId);
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
  if (sifre.length < 8) {
    return { hata: "Şifre en az 8 karakter olmalıdır." };
  }
  if (sifre.length > 72) return { hata: "Şifre en fazla 72 karakter olabilir." };
  if (davetKodu && !/^[A-HJ-NP-Z2-9]{8}$/.test(davetKodu)) {
    return { hata: "Davet kodu 8 karakterli ve geçerli biçimde olmalıdır." };
  }

  // E-posta zaten kayitli mi?
  const mevcut = await kullaniciBulEmail(tenantId, email);
  if (mevcut) {
    return { hata: "Bu e-posta zaten kayıtlı." };
  }

  const davetEden = davetKodu ? await davetKoduylaKullaniciBul(tenantId, davetKodu) : null;
  if (davetKodu && !davetEden) return { hata: "Davet kodu bulunamadı." };

  // Sifreyi hash'le (10 tur salt — senior standart)
  const sifreHash = await bcrypt.hash(sifre, 10);

  let kullanici;
  try {
    kullanici = await kullaniciOlustur(tenantId, {
      ad, soyad, cinsiyet, email, telefon, sifreHash, davetEdenId: davetEden?.id || null,
    });
  } catch (e) {
    if (e.code === "23505") return { hata: "Bu e-posta zaten kayıtlı." };
    throw e;
  }

  const token = tokenUret(kullanici.id, tenantId);
  return { kullanici, token };
}

// --- Giris ---
export async function girisYap(isletmeId, { email, sifre } = {}) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  email = String(email || "").trim().toLowerCase().slice(0, 254);
  sifre = String(sifre || "");
  if (!email || !sifre) {
    return { hata: "E-posta ve şifre gerekli." };
  }

  const kullanici = await kullaniciBulEmail(tenantId, email);
  if (!kullanici) {
    return { hata: "E-posta veya şifre hatalı." };
  }

  const dogruMu = await bcrypt.compare(sifre, kullanici.sifre_hash);
  if (!dogruMu) {
    return { hata: "E-posta veya şifre hatalı." };
  }

  if (kullanici.iki_faktor_aktif) {
    const ikiFaktorToken = jwt.sign(
      { id: kullanici.id, isletmeId: tenantId, amac: "iki-faktor-giris" },
      JWT_SECRET,
      { expiresIn: "5m" }
    );
    return { ikiFaktorGerekli: true, ikiFaktorToken };
  }

  const guvenli = await kullaniciBulId(tenantId, kullanici.id);
  const token = tokenUret(kullanici.id, tenantId);
  return { kullanici: guvenli, token };
}

async function ikinciFaktoruDogrula(isletmeId, kullaniciId, kayit, kod) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  if (!kayit?.iki_faktor_aktif || !kayit.iki_faktor_sir) return false;
  if (kurtarmaKoduBicimindeMi(kod)) {
    return ikiFaktorKurtarmaKoduKullan(tenantId, kullaniciId, kurtarmaKoduHashle(kod));
  }
  return ikiFaktorKoduGecerliMi(ikiFaktorSirriCoz(kayit.iki_faktor_sir), kod);
}

export async function ikiFaktorGirisiniTamamla(isletmeId, ikiFaktorToken, kod) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  let cozulmus;
  try {
    cozulmus = jwt.verify(String(ikiFaktorToken || ""), JWT_SECRET);
  } catch {
    return { hata: "İki adımlı doğrulama oturumunun süresi doldu. Yeniden giriş yapın." };
  }
  if (cozulmus.amac !== "iki-faktor-giris" || !cozulmus.id || Number(cozulmus.isletmeId) !== tenantId) {
    return { hata: "İki adımlı doğrulama oturumu geçersiz." };
  }
  const kayit = await ikiFaktorKaydiniGetir(tenantId, cozulmus.id);
  if (!await ikinciFaktoruDogrula(tenantId, cozulmus.id, kayit, kod)) {
    return { hata: "Doğrulama kodu veya kurtarma kodu geçersiz." };
  }
  const kullanici = await kullaniciBulId(tenantId, cozulmus.id);
  return { kullanici, token: tokenUret(cozulmus.id, tenantId) };
}

export async function ikiFaktorKurulumBaslat(isletmeId, kullaniciId, mevcutSifre) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const kayit = await ikiFaktorKaydiniGetir(tenantId, kullaniciId);
  if (!kayit || !await bcrypt.compare(String(mevcutSifre || ""), kayit.sifre_hash)) {
    return { hata: "Mevcut şifreniz hatalı." };
  }
  if (kayit.iki_faktor_aktif) return { hata: "İki adımlı doğrulama zaten aktif." };
  const secret = ikiFaktorSirriUret();
  await ikiFaktorBekleyeniKaydet(tenantId, kullaniciId, ikiFaktorSirriSifrele(secret));
  return { secret, otpauthUri: ikiFaktorUriUret(secret, kayit.email) };
}

export async function ikiFaktorKurulumOnayla(isletmeId, kullaniciId, kod) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const kayit = await ikiFaktorKaydiniGetir(tenantId, kullaniciId);
  if (!kayit?.iki_faktor_bekleyen_sir) return { hata: "Önce iki adımlı doğrulama kurulumunu başlatın." };
  const secret = ikiFaktorSirriCoz(kayit.iki_faktor_bekleyen_sir);
  if (!await ikiFaktorKoduGecerliMi(secret, kod)) return { hata: "Authenticator kodu geçersiz." };
  const kurtarmaKodlari = kurtarmaKodlariUret();
  const etkinlesti = await ikiFaktorEtkinlestir(tenantId, kullaniciId, kurtarmaKodlari.map(kurtarmaKoduHashle));
  if (!etkinlesti) return { hata: "İki adımlı doğrulama etkinleştirilemedi." };
  return { basarili: true, kurtarmaKodlari };
}

export async function ikiFaktorDevreDisiBirak(isletmeId, kullaniciId, mevcutSifre, kod) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const kayit = await ikiFaktorKaydiniGetir(tenantId, kullaniciId);
  if (!kayit?.iki_faktor_aktif) return { hata: "İki adımlı doğrulama zaten kapalı." };
  if (!await bcrypt.compare(String(mevcutSifre || ""), kayit.sifre_hash)) {
    return { hata: "Mevcut şifreniz hatalı." };
  }
  if (!await ikinciFaktoruDogrula(tenantId, kullaniciId, kayit, kod)) {
    return { hata: "Doğrulama kodu veya kurtarma kodu geçersiz." };
  }
  await ikiFaktorKapat(tenantId, kullaniciId);
  return { basarili: true };
}

// --- Token uret / dogrula ---
function tokenUret(kullaniciId, isletmeId) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  return jwt.sign({ id: kullaniciId, isletmeId: tenantId }, JWT_SECRET, { expiresIn: TOKEN_SURESI });
}

// Token'i dogrular, gecerliyse guncel kullanici bilgisini dondurur.
export async function tokenDogrula(token, beklenenIsletmeId = null) {
  try {
    const cozulmus = jwt.verify(token, JWT_SECRET);
    const tenantId = isletmeIdZorunlu(cozulmus.isletmeId);
    if (beklenenIsletmeId != null && tenantId !== isletmeIdZorunlu(beklenenIsletmeId)) return null;
    const kullanici = await kullaniciBulId(tenantId, cozulmus.id);
    if (!kullanici) return null; // silinmis kullanici
    // Sifre degistirildiyse, degisiklikten once uretilmis token'lar artik gecersizdir.
    if (kullanici.sifreDegisimTarihi && cozulmus.iat * 1000 < new Date(kullanici.sifreDegisimTarihi).getTime()) {
      return null;
    }
    return kullanici;
  } catch {
    return null; // gecersiz/suresi dolmus token
  }
}

function istekTokeniniCoz(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function tokenIsletmesiUyusuyorMu(cozulmus, req) {
  return Number(cozulmus?.isletmeId) === Number(req.isletme?.id);
}

// Express middleware: gecerli token olmadan gecmeyi engeller.
export function korumaliMiddleware() {
  return async (req, res, next) => {
    const baslik = req.headers.authorization || "";
    const token = baslik.startsWith("Bearer ") ? baslik.slice(7) : null;
    if (!token) return res.status(401).json({ hata: "Giriş gerekli." });

    const cozulmus = istekTokeniniCoz(token);
    if (cozulmus && !tokenIsletmesiUyusuyorMu(cozulmus, req)) {
      return res.status(403).json({ hata: "Bu oturum başka bir işletmeye ait." });
    }
    const kullanici = await tokenDogrula(token, req.isletme?.id);
    if (!kullanici) return res.status(401).json({ hata: "Oturum geçersiz." });

    req.kullanici = kullanici;
    next();
  };
}

// Misafir ödeme akışını destekler; token varsa kullanıcıyı ekler, yoksa isteği
// engellemez. Ödeme tutarı ve sipariş içeriği yine backend tarafından doğrulanır.
export function opsiyonelKullaniciMiddleware() {
  return async (req, res, next) => {
    const baslik = req.headers.authorization || "";
    const token = baslik.startsWith("Bearer ") ? baslik.slice(7) : null;
    if (token) {
      const cozulmus = istekTokeniniCoz(token);
      if (cozulmus && !tokenIsletmesiUyusuyorMu(cozulmus, req)) {
        return res.status(403).json({ hata: "Bu oturum başka bir işletmeye ait." });
      }
      req.kullanici = await tokenDogrula(token, req.isletme?.id);
    }
    next();
  };
}

// Yönetim uçları yalnızca rolü admin olan gerçek kullanıcı hesabına açıktır.
export function adminMiddleware() {
  return async (req, res, next) => {
    const baslik = req.headers.authorization || "";
    const token = baslik.startsWith("Bearer ") ? baslik.slice(7) : null;
    if (!token) return res.status(401).json({ hata: "Yönetici girişi gerekli." });

    const cozulmus = istekTokeniniCoz(token);
    if (cozulmus && !tokenIsletmesiUyusuyorMu(cozulmus, req)) {
      return res.status(403).json({ hata: "Bu oturum başka bir işletmeye ait." });
    }
    const kullanici = await tokenDogrula(token, req.isletme?.id);
    if (!kullanici || kullanici.rol !== "admin") {
      return res.status(403).json({ hata: "Bu işlem için yönetici yetkisi gerekli." });
    }
    req.kullanici = kullanici;
    next();
  };
}

// Rol tabanli koruma. Kimlik dogrulama ile yetki kontrolunu tek noktada tutar.
export function rolMiddleware(izinliRoller = []) {
  const roller = new Set(izinliRoller);
  return async (req, res, next) => {
    const baslik = req.headers.authorization || "";
    const token = baslik.startsWith("Bearer ") ? baslik.slice(7) : null;
    if (!token) return res.status(401).json({ hata: "Giris gerekli." });
    const cozulmus = istekTokeniniCoz(token);
    if (cozulmus && !tokenIsletmesiUyusuyorMu(cozulmus, req)) {
      return res.status(403).json({ hata: "Bu oturum başka bir işletmeye ait." });
    }
    const kullanici = await tokenDogrula(token, req.isletme?.id);
    if (!kullanici) return res.status(401).json({ hata: "Oturum gecersiz." });
    if (!roller.has(kullanici.rol) && kullanici.rol !== "admin") {
      return res.status(403).json({ hata: "Bu islem icin yetkiniz yok." });
    }
    req.kullanici = kullanici;
    next();
  };
}

// --- Sifremi unuttum ---
const SIFIRLAMA_SURESI_DK = 30;

function tokenHashla(token) {
  return createHash("sha256").update(token).digest("hex");
}

// Kullanici var/yok bilgisi disari sizdirilmaz: bu fonksiyon her zaman
// sessizce doner, cagiran route her durumda ayni mesaji yanitlar.
export async function sifirlamaTalepEt(isletmeId, isletmeSlug, email) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const temizEmail = String(email || "").trim().toLowerCase().slice(0, 254);
  if (!emailGecerli(temizEmail)) return;
  const kullanici = await kullaniciBulEmail(tenantId, temizEmail);
  if (!kullanici) return;

  try {
    const duzToken = randomBytes(32).toString("hex");
    await sifreSifirlamaTalebiOlustur(tenantId, kullanici.id, tokenHashla(duzToken), SIFIRLAMA_SURESI_DK);
    const frontendUrl = String(process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
    const slug = encodeURIComponent(String(isletmeSlug || "").trim().toLowerCase());
    const link = `${frontendUrl}/${slug}/sifre-sifirla?token=${duzToken}`;
    await sifirlamaEpostasiGonder(kullanici.email, kullanici.ad, link);
  } catch (e) {
    // Saglayici/e-posta hatasi disariya sizdirilmaz, yalnizca sunucu loguna yazilir.
    console.error("Şifre sıfırlama e-postası gönderilemedi:", e.message);
  }
}

export async function sifirlamaTokenGecerliMi(isletmeId, token) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const temiz = String(token || "").trim();
  if (!temiz) return false;
  return sifreSifirlamaTokeniGecerliMi(tenantId, tokenHashla(temiz));
}

export async function sifreyiSifirla(isletmeId, token, yeniSifre) {
  const tenantId = isletmeIdZorunlu(isletmeId);
  const temizToken = String(token || "").trim();
  const sifre = String(yeniSifre || "");
  if (!temizToken) return { hata: "Bağlantı geçersiz veya süresi dolmuş." };
  if (sifre.length < 6) return { hata: "Şifre en az 6 karakter olmalıdır." };
  if (sifre.length > 72) return { hata: "Şifre en fazla 72 karakter olabilir." };

  const sifreHash = await bcrypt.hash(sifre, 10);
  const sonuc = await sifreyiSifirlaDb(tenantId, tokenHashla(temizToken), sifreHash);
  if (sonuc.gecersiz) return { hata: "Bağlantı geçersiz veya süresi dolmuş." };
  return { basarili: true };
}
