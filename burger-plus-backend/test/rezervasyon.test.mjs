import test from "node:test";
import assert from "node:assert/strict";
import { rezervasyonVerisiniDogrula } from "../rezervasyonDb.js";
test("rezervasyon verisini normalize eder",()=>{assert.deepEqual(rezervasyonVerisiniDogrula({musteriAdi:"  Ayşe Yılmaz ",telefon:"+90 555 111 22 33",tarih:"2026-08-20",saat:"19:30",masaNo:"12",kisiSayisi:4,sureDakika:90,not:" Pencere yanı "}),{musteriAdi:"Ayşe Yılmaz",telefon:"+90 555 111 22 33",tarih:"2026-08-20",saat:"19:30",masaNo:"12",kisiSayisi:4,sureDakika:90,not:"Pencere yanı",durum:"bekliyor"});});
test("geçersiz rezervasyonu reddeder",()=>{assert.throws(()=>rezervasyonVerisiniDogrula({musteriAdi:"A",tarih:"20.08.2026",saat:"25:00",masaNo:"1",kisiSayisi:0}),/Müşteri adı/);assert.throws(()=>rezervasyonVerisiniDogrula({musteriAdi:"Ali",tarih:"20.08.2026",saat:"19:00",masaNo:"1",kisiSayisi:2}),/tarihi/);});
