import { createHmac, timingSafeEqual } from "node:crypto";

const MASA_TOKEN_SURUMU = "v1";

export function masaTokeniUret(secret, isletmeId, masaNo) {
  return createHmac("sha256", String(secret))
    .update(`burger-plus:${MASA_TOKEN_SURUMU}:masa:${isletmeId}:${masaNo}`)
    .digest("base64url");
}

export function masaTokeniniDogrula(secret, token, isletmeId, masaNo) {
  const gelen = Buffer.from(String(token || ""), "utf8");
  const beklenen = Buffer.from(masaTokeniUret(secret, isletmeId, masaNo), "utf8");
  return gelen.length === beklenen.length && timingSafeEqual(gelen, beklenen);
}
