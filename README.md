# Konuşma Arkadaşı — 3D karakterle konuşma pratiği

Duolingo benzeri bir konuşma uygulaması: kullanıcı, odasında masasında oturan
bir karakterle sesli konuşur. Karakter gerçek zamanlı dudak senkronuyla konuşur,
dinlerken başını sallar, düşünürken çenesine dokunur, pencereyi açar, kedisini
çağırır, telefonunu alır, gitar çalar, odada dolaşır.

```
flutter_app/   Flutter kabuğu (WebView + mikrofon/STT + TTS + sohbet akışı)
web/           Three.js çalışma zamanı (karakter, animasyon, yüz, fizik, oda)
docs/          Model teslim şartnamesi + oda taslağı (blockout) GLB
tool/          build_web.sh: web'i derleyip Flutter asset'lerine kopyalar
```

## Durum
- **Motor hazır ve test edildi**: IK, geçişler, dudak senkronu, yüz, fizik, aksiyonlar, köprü.
- **Sanat varlıkları dışarıdan gelecek**: koddaki prosedürel karakter/oda yalnızca
  *yer tutucudur*. Sanatçının yaptığı `character.glb` (ve isteğe bağlı `room.glb`)
  `web/public/assets/` altına konduğunda motor otomatik olarak onları kullanır.
  Kurallar: [`docs/MODEL_SPEC.md`](docs/MODEL_SPEC.md). Oda için ölçülü taslak:
  [`docs/blockout/room_blockout.glb`](docs/blockout/room_blockout.glb) (Blender'a
  aç, üstüne modelle; tüm etkileşim noktaları doğru adlı empty olarak içinde).
- Doğrulandı: Mixamo rig'li gerçek bir karakter (T-poz) oturma/yürüme/pencere/gitar/el
  sallama aksiyonlarında; ARKit-52 blendshape'li gerçek bir kafa (52/52 şekil) konuşma ve
  duygularda; oda taslağının GLB'den geri yüklenmesi.

## Çalıştırma
```bash
cd web && npm install
npm run dev            # http://localhost:5173/?hud=1
npm test               # birim testleri (vizem, koartikülasyon, kemik eşleme)
cd .. && tool/build_web.sh && cd flutter_app && flutter run
```
Geliştirici parametreleri: `?character=yol.glb`, `?room=yol.glb`,
`?do=openWindow,playGuitar`, `?say=Merhaba`, `?state=listening`, `?emotion=happy`,
`?quality=low|medium|high`, `?hud=1`, `?view=face&model=kafa.glb` (yüz test tezgâhı).

## Köprü protokolü (Flutter ⇄ WebView)
Flutter → JS: `window.avatar.cmd({...})`
| type | alanlar |
|---|---|
| `state` | `value`: idle · listening · thinking · speaking |
| `action` | `name`: openWindow · closeWindow · callCat · pickPhone · putPhone · playGuitar · stopGuitar · wave · stretch · walk |
| `speak` | `id, text, audio?` (base64/URL) `, visemes?` (Azure `{t, v}`) |
| `speechWord` / `speechEnd` | yerel TTS kelime sınırı / bitiş (senkron için) |
| `emotion` | `value`: neutral · happy · sad · surprised · thinking, `intensity` |
| `lookAt`, `micLevel`, `pause`, `resume`, `quality` | |

JS → Flutter (`callHandler('avatar', json)`): `ready`, `actionStart/End`,
`speechStart/End`, `tap {target}`, `perf`.

## Kullanılan algoritmalar
| İş | Yöntem |
|---|---|
| Animasyon geçişleri | **Inertialization** (Bollo 2016; Holden'ın kritik sönümlü yay formu) — tek davranış değerlendirilir, geçiş hissedilmez |
| Pürüzsüz takip | Kritik sönümlü yaylar (tam kapalı çözüm, kare hızından bağımsız) |
| Kollar/bacaklar | Analitik iki kemik IK + kutup vektörü, swing-twist ile önkol burulma dağıtımı |
| Uzanma hareketleri | Minimum-jerk profili (Flash & Hogan) |
| Yürüme | Prosedürel adım planlama: duruşta ayak dünyaya sabit (kayma yok), salınımda yay |
| Herhangi bir rig | Sanal iskelet → gerçek iskelete **delta-bind retarget** (T/A poz, her kemik ekseni) |
| Dudak senkronu | Türkçe grafem→vizem (sayılar Türkçe okunur) + **Cohen–Massaro baskınlık modeli** ile koartikülasyon; Azure vizem olayları; ses zarfı; yerel TTS kelime-sınırı senkronu |
| Göz | "Eyes Alive" sakkad modeli (log-normal aralık, ana dizi hızı), yüze üçgen tarama, bakışla tetiklenen göz kırpma |
| Saç | Dynamic Follow-The-Leader (Müller 2012) + şekil eşleme; sanatçı rig'inde VRM-tipi yay kemikleri |
| Perde | **XPBD** (Macklin 2016) "small steps" alt-adımlarıyla |
| Kedi | Durum makinesi + diyagonal tırıs yürüyüşü + bacak IK + balistik zıplama + yay zinciri kuyruk |
| Performans | Statik geometri malzemeye göre birleştirme, dinamik çözünürlük yöneticisi, tek gölgeli ışık, arka planda durma, meshopt + KTX2 desteği |
