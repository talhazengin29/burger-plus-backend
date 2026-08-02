import Iyzipay from "iyzipay";

const para = (tutar) => Number(tutar).toFixed(2);

function ortamDegeri(ad) {
  const deger = String(process.env[ad] || "").trim();
  const tirnakli = (deger.startsWith('"') && deger.endsWith('"')) || (deger.startsWith("'") && deger.endsWith("'"));
  return tirnakli ? deger.slice(1, -1).trim() : deger;
}

function mutlakTemelUrl(deger, ad) {
  const ham = String(deger || "").trim();
  if (!ham) return "";
  const protokollu = /^https?:\/\//i.test(ham)
    ? ham
    : /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(ham) ? `http://${ham}` : `https://${ham}`;
  try {
    const url = new URL(protokollu);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.origin;
  } catch {
    throw new Error(`${ad} geçerli bir web adresi olmalı.`);
  }
}

function ayarlar() {
  const apiKey = ortamDegeri("IYZICO_API_KEY");
  const secretKey = ortamDegeri("IYZICO_SECRET_KEY");
  const uri = mutlakTemelUrl(ortamDegeri("IYZICO_BASE_URL") || "https://sandbox-api.iyzipay.com", "IYZICO_BASE_URL");
  const backendUrl = mutlakTemelUrl(ortamDegeri("PUBLIC_BACKEND_URL") || ortamDegeri("RENDER_EXTERNAL_URL"), "PUBLIC_BACKEND_URL");
  const frontendUrl = mutlakTemelUrl(ortamDegeri("FRONTEND_URL"), "FRONTEND_URL");
  const varsayilanKimlikNo = ortamDegeri("IYZICO_DEFAULT_IDENTITY_NUMBER") || "11111111111";
  const varsayilanAdres = ortamDegeri("IYZICO_DEFAULT_ADDRESS");
  const varsayilanIl = ortamDegeri("IYZICO_DEFAULT_CITY");
  const varsayilanPostaKodu = ortamDegeri("IYZICO_DEFAULT_ZIP_CODE") || "00000";
  if (!apiKey || !secretKey) throw new Error("İyzico API anahtarları backend ortam değişkenlerinde tanımlı değil.");
  if (!backendUrl || !frontendUrl) throw new Error("PUBLIC_BACKEND_URL ve FRONTEND_URL ödeme callback'i için tanımlı olmalı.");
  if (!/^\d{11}$/.test(varsayilanKimlikNo)) throw new Error("IYZICO_DEFAULT_IDENTITY_NUMBER 11 rakam olmalı.");
  if (!varsayilanAdres || !varsayilanIl) {
    throw new Error("Müşteriden adres istemeden ödeme almak için IYZICO_DEFAULT_ADDRESS ve IYZICO_DEFAULT_CITY tanımlanmalı.");
  }
  return {
    apiKey, secretKey, uri, backendUrl, frontendUrl,
    varsayilanKimlikNo, varsayilanAdres, varsayilanIl, varsayilanPostaKodu,
  };
}

function aliciDogrula(alici = {}, config) {
  const veri = {
    ad: String(alici.ad || "").trim().slice(0, 80),
    soyad: String(alici.soyad || "").trim().slice(0, 80),
    email: String(alici.email || "").trim().toLowerCase().slice(0, 160),
    telefon: String(alici.telefon || "").replace(/\s/g, "").slice(0, 20),
    kimlikNo: config.varsayilanKimlikNo,
    adres: config.varsayilanAdres.slice(0, 300),
    il: config.varsayilanIl.slice(0, 80),
    postaKodu: config.varsayilanPostaKodu.slice(0, 16),
  };
  if (!veri.ad || !veri.soyad || !/^\S+@\S+\.\S+$/.test(veri.email)) {
    throw new Error("Ödeme için ad, soyad ve e-posta bilgisi gerekli.");
  }
  if (!/^\+?90\d{10}$/.test(veri.telefon.replace(/^00/, "+"))) throw new Error("Telefon numarasını +905XXXXXXXXX biçiminde gir.");
  return veri;
}

function iyzicoCagir(kaynak, metod, istek) {
  return new Promise((resolve, reject) => {
    kaynak[metod](istek, (hata, sonuc) => {
      if (hata) {
        const hataNesnesi = new Error(hata.errorMessage || hata.message || "İyzico isteği tamamlanamadı.");
        hataNesnesi.iyzicoKod = hata.errorCode || hata.code;
        return reject(hataNesnesi);
      }
      if (!sonuc || sonuc.status !== "success") {
        const hataNesnesi = new Error(sonuc?.errorMessage || "İyzico ödeme formu başlatılamadı.");
        hataNesnesi.iyzicoKod = sonuc?.errorCode;
        return reject(hataNesnesi);
      }
      resolve(sonuc);
    });
  });
}

export async function iyzicoCheckoutBaslat(odeme, alici, istemciIp) {
  const config = ayarlar();
  const kisi = aliciDogrula(alici, config);
  const iyzipay = new Iyzipay({ apiKey: config.apiKey, secretKey: config.secretKey, uri: config.uri });
  const istek = {
    locale: Iyzipay.LOCALE.TR,
    conversationId: odeme.siparisNo,
    price: para(odeme.tutar),
    paidPrice: para(odeme.tutar),
    currency: Iyzipay.CURRENCY.TRY,
    basketId: odeme.siparisNo,
    paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
    paymentChannel: Iyzipay.PAYMENT_CHANNEL.WEB,
    callbackUrl: `${config.backendUrl}/api/odeme/iyzico/callback`,
    buyer: {
      id: String(odeme.kullaniciId || odeme.id),
      name: kisi.ad,
      surname: kisi.soyad,
      gsmNumber: kisi.telefon.startsWith("+") ? kisi.telefon : `+${kisi.telefon}`,
      email: kisi.email,
      identityNumber: kisi.kimlikNo,
      registrationAddress: kisi.adres,
      ip: String(istemciIp || "127.0.0.1").replace("::ffff:", ""),
      city: kisi.il,
      country: "Turkey",
      zipCode: kisi.postaKodu || "00000",
    },
    shippingAddress: { contactName: `${kisi.ad} ${kisi.soyad}`, city: kisi.il, country: "Turkey", address: kisi.adres, zipCode: kisi.postaKodu || "00000" },
    billingAddress: { contactName: `${kisi.ad} ${kisi.soyad}`, city: kisi.il, country: "Turkey", address: kisi.adres, zipCode: kisi.postaKodu || "00000" },
    basketItems: odeme.urunler.map((urun, index) => ({
      id: `${odeme.id}-${index}`,
      name: urun.adet > 1 ? `${urun.ad} x${urun.adet}` : urun.ad,
      category1: urun.kategori || "Yiyecek",
      itemType: Iyzipay.BASKET_ITEM_TYPE.PHYSICAL,
      price: para(urun.fiyat * urun.adet),
    })),
  };
  const sonuc = await iyzicoCagir(iyzipay.checkoutFormInitialize, "create", istek);
  return { token: sonuc.token, paymentPageUrl: sonuc.paymentPageUrl };
}

export async function iyzicoSonucuGetir(odeme, token) {
  const config = ayarlar();
  const iyzipay = new Iyzipay({ apiKey: config.apiKey, secretKey: config.secretKey, uri: config.uri });
  const sonuc = await iyzicoCagir(iyzipay.checkoutForm, "retrieve", {
    locale: Iyzipay.LOCALE.TR,
    conversationId: odeme.siparisNo,
    token,
  });
  const siparisTutari = Number(odeme.tutar);
  const sepetTutari = Number(sonuc.price);
  const tahsilEdilenTutar = Number(sonuc.paidPrice);
  const ayniPara = (sol, sag) => Number.isFinite(sol) && Number.isFinite(sag) && Math.abs(sol - sag) < 0.01;

  if (sonuc.paymentStatus !== "SUCCESS") {
    throw new Error(`İyzico ödeme sonucu başarısız: ${sonuc.paymentStatus || "BİLİNMİYOR"}.`);
  }
  // paidPrice taksit/komisyon maliyetini içerebilir. Sipariş tutarını İyzico'nun
  // price alanıyla doğrularız; karttan çekilen tutar sipariş tutarından az olamaz.
  if (!ayniPara(sepetTutari, siparisTutari) || !Number.isFinite(tahsilEdilenTutar) || tahsilEdilenTutar + 0.01 < siparisTutari) {
    throw new Error("İyzico ödeme tutarı siparişle eşleşmiyor.");
  }
  if (sonuc.conversationId && sonuc.conversationId !== odeme.siparisNo) {
    throw new Error("İyzico ödeme eşleştirme bilgisi geçersiz.");
  }
  if (sonuc.currency && sonuc.currency !== "TRY") {
    throw new Error("İyzico ödeme para birimi geçersiz.");
  }
  if (sonuc.fraudStatus != null && Number(sonuc.fraudStatus) !== 1) {
    throw new Error("İyzico ödeme güvenlik incelemesinde onaylanmadı.");
  }
  return sonuc;
}

export function iyzicoDonusAdresi(isletmeSlug, odemeId) {
  const frontendUrl = mutlakTemelUrl(ortamDegeri("FRONTEND_URL"), "FRONTEND_URL");
  if (!frontendUrl) return "/";
  const slug = encodeURIComponent(String(isletmeSlug || "").trim().toLowerCase());
  return `${frontendUrl}/${slug}/odeme-sonuc?odeme=${encodeURIComponent(odemeId)}`;
}
