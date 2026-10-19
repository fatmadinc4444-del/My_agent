# 2D Dil Öğrenme Oyunu — Ana Plan (tartışma taslağı)

> Durum: **taslak, tartışmaya açık**. Kod yazılmadan önce §1'deki kararlar netleşmeli.
> Bu belge aynı zamanda geliştirici ajanların "anayasası" olacak: her ajan işe başlamadan
> önce bunu ve kendi modülünün `SKILL.md` dosyasını okur.

---

## 0. Kısa cevaplar

**Flutter mı, WebView mı?** → **Doğrudan Flutter (Flame motoru)**. Gerekçe §2.1'de.
Mevcut repodaki Three.js/WebView yolu 3D için doğruydu; 2D'de WebView'in getirdiği her
şey (ikinci dil, köprü, Android WebView farklılıkları, ses/dudak gecikmesi, bellek) maliyet,
kazandırdığı tek şey (tarayıcıda kolay ekran görüntüsü) Flutter'da da var: **aynı Dart kodu
Flutter Web olarak derlenip tarayıcıda açılıyor** — yönetici paneli (Atölye) ve ajanların
ekran görüntüsü testleri buradan yürür.

**İzometrik mi, yandan mı?** → Tarif ettiğin şey (önde kaldırım, ortada yol, karşıda evler,
sokak lambaları, ağaçlar) aslında **yandan görünüm + derinlik şeritleri (2.5D)**. Gerçek
izometrik (elmas ızgara, kuşbakışı 3/4) her karakter/araç/animasyon için 4–8 yön çizimi
ister; işi kabaca 4–8 kat büyütür ve direksiyon/tekerlek/ağız gibi detayları zorlaştırır.
Önerim: **yan görünüm, 3–5 derinlik şeridi, paralaks** (§4). Yine de karar senin.

**Mevcut repodan ne taşınır?** Türkçe grafem→vizem (`g2p.ts`), Cohen–Massaro koartikülasyon
(`lipsync.ts`), 11 kanallı ağız kontrol vektörü (`visemes.ts`), kritik sönümlü yaylar
(`spring.ts`), göz sakkad modeli, minimum-jerk uzanma, prosedürel adım planlama — hepsi saf
algoritma, Dart'a birebir taşınır. 2D ağız da aynı 11 kanaldan **prosedürel çizilir** (§5.3),
yani sprite değiştirmekten çok daha akıcı konuşma.

---

## 1. Önce senin karar vermen gerekenler

| # | Soru | Benim önerim |
|---|---|---|
| K1 | Hangi dil(ler) öğretilecek, öğrencinin ana dili ne? (Türkçe öğrenen yabancı mı, İngilizce öğrenen Türk mü, ikisi mi?) | İçerik dil-bağımsız tasarlanır; **ilk dil tek olsun** (ör. İngilizce öğrenen Türk), ikincisi sonra |
| K2 | "**Her düğüm için 5 nokta**" ne demek? (a) her düğümde 5 cevap seçeneği, (b) her düğümün 5 bölümü, (c) 5 puanlık değerlendirme | §8.2'de (b)'yi öneriyorum: her düğüm 5 sabit yuvadan oluşur; seçenek sayısı ayrıca 2–5 arası. Senin kastın farklıysa yapı kolayca değişir |
| K3 | Görünüm: yandan 2.5D mi, gerçek izometrik mi? | Yandan 2.5D |
| K4 | Çizim tarzı: düz vektör (flat, Toca Life / Kurzgesagt benzeri), el çizimi, piksel? | **Düz vektör** — kodla üretilebilen, ajanların gerçekten iyi yapabildiği tek tarz; sanatçı gelirse parçalar değişir, rig aynı kalır |
| K5 | Oyuncu cevabı nasıl verir: konuşarak mı, dokunarak mı, ikisi mi? | **İkisi**: konuşma birincil, her zaman dokunarak seçme yedeği var (asla kilitlenmez) |
| K6 | Hedef cihaz: düşük segment Android dahil mi? | Evet varsay; performans bütçesi buna göre (§11) |
| K7 | Hedef yaş? (çocuksa mikrofon verisi = KVKK/COPPA yükümlülüğü) | Belirt; çocuksa ses cihazda işlenir, sunucuya gitmez |
| K8 | Ajanlar nerede çalışacak: GitHub üzerinde (Issues + Actions + Claude Code) mı, kendi sunucunda (Ajan1453 benzeri orkestratör) mı? | **Başlangıçta GitHub-yerli** (§10.6, hazır bildirim, PR, CI); ölçek gerekince kendi orkestratörün |
| K9 | Ajan bütçesi: aynı anda kaç ajan, aylık tavan? | 3–5 eşzamanlı ile başla |

---

## 2. Teknoloji yığını

| Katman | Seçim | Neden / alternatif |
|---|---|---|
| Dil / çatı | **Flutter (Dart 3)** | Tek kod: Android, iOS, Web (Atölye), masaüstü |
| Oyun motoru | **Flame** (+ `flame_test`) | Flutter'ın resmî 2D motoru; bileşen ağacı, kamera, çarpışma, sprite batch, efekt sistemi |
| Fizik | **Forge2D** (`flame_forge2d`, Box2D portu) | Ragdoll düşme, kesilen ağaç devrilmesi, düşen meyve, kasa/kutu yığınları. Karakter yürüyüşü fizik değil, prosedürel |
| İskelet animasyonu | **Kendi veri-güdümlü 2D rig sistemimiz** (JSON) | Ajanların metinle yazıp test edebilmesi şart. Rive'ın `.riv` dosyası editörsüz düzenlenemez; Spine JSON yazılabilir ama çalışma zamanı lisans ister ve editör bağımlı. Kendi rig'imiz = tam özelleştirme + tam test edilebilirlik. Rive yalnızca UI süslerinde opsiyonel |
| Çizim | Parçalar **SVG / kendi vektör tanım JSON'u** → açılışta (veya derlemede) **doku atlasına pişirilir** | Vektör = sonsuz çözünürlük ve renk/kıyafet varyasyonu; atlas = düşük çizim çağrısı. Ağız, kaş, göz kapağı gibi deforme olanlar her karede prosedürel `Path` |
| Işık / gece-gündüz | Flutter **FragmentShader** (GLSL) — renk derecelendirme, 2D nokta ışıkları (sokak lambası halesi), far ışığı | Basit tutulur, düşük cihazda kapanır |
| Diyalog | **Jenny** (Flame ekibinin Yarn Spinner Dart uygulaması) + kendi komut/etkileşim kalıplarımız | Metin tabanlı (ajan yazabilir), değişken, koşul, seçenek, `<<komut>>` desteği. Yanına şema doğrulayıcı + otomatik yol gezen test botu |
| Ses çalma | `just_audio` (+ `audio_session`) | Ses konumunu dudak senkronunun saati olarak kullanabilmek için hassas konum akışı |
| Konuşma tanıma | Cihazda `speech_to_text`; isteğe bağlı bulut: **Whisper** veya **Azure Speech (telaffuz değerlendirmesi)** | Öğrenen aksanı için tolerant eşleme şart (§8.6) |
| Seslendirme (TTS) | **Önceden pişirilmiş**: Azure Neural TTS (vizem olayları verir) veya ElevenLabs (karakter zaman damgası verir) → bizim g2p ile vizem izine çevrilir | Senaryolu replikler derlemede seslendirilir; çalışma zamanında yalnızca dinamik parçalar (fiyat, sayı) birleştirilir (§8.7) |
| Niyet anlama | Kural tabanlı normalleştirici + bulanık eşleme; belirsizse **küçük LLM** (ör. Claude Haiku) yalnızca o düğümün niyet listesine sınırlı JSON çıktıyla | Çevrimdışı çalışır; LLM sadece yedek |
| Uygulama durumu | Riverpod | Oyun dışı ekranlar (menü, ilerleme, Atölye) |
| Yerel veri | Drift (SQLite) | İlerleme, kelime SRS, kayıtlar |
| Veri modelleri | `freezed` + `json_serializable` + JSON Schema | Ajanların ürettiği her JSON (rig, sahne, manifest) şemayla doğrulanır |
| Monorepo | **Dart pub workspaces** (+ isteğe bağlı `melos` betikleri) | Her modül ayrı paket = ajan sahipliği ve çakışmasızlık (§10.5) |
| Test | `flutter test`, **golden testler**, `integration_test`, Flutter Web + **Playwright** (Atölye uçtan uca, kare dizisi yakalama) | §10.7 |
| CI | GitHub Actions; sabit Linux Docker imajı (golden'lar deterministik olsun diye) | |
| Görev ağacı / bildirim | GitHub Issues (alt-issue = ağaç), etiketler, PR, Claude Code GitHub Action | K8'e bağlı |
| Atölye barındırma | GitHub Pages (her PR için önizleme derlemesi) | Yönetici telefondan bile açıp deneyebilir |

### 2.1 Flutter-doğrudan vs WebView karşılaştırması

| Kriter | Flutter + Flame | Flutter + WebView (PixiJS/Phaser) |
|---|---|---|
| Performans (düşük Android) | Impeller, doğrudan GPU; iyi | WebView sürümüne bağlı, değişken; bellek ikiye katlanır |
| Dudak–ses senkronu | Ses ve çizim aynı süreçte, tek saat | Köprü gecikmesi + WebView ses politikaları |
| Mikrofon / STT | Doğrudan eklenti | Flutter'da alınıp köprüyle taşınır |
| Geliştirme | Tek dil, tek hata ayıklayıcı | İki dil, iki derleme, köprü protokolü bakımı |
| Ajan testleri | `flutter test` golden (cihazsız) + Flutter Web + Playwright | Playwright çok rahat |
| Hazır 2D ekosistem | Flame orta büyüklükte | PixiJS/Phaser çok büyük |
| Mevcut kod | TS algoritmaları Dart'a taşınmalı (~1–2 hafta) | Doğrudan kullanılır |
| Uygulama mağazası / çevrimdışı | Doğal | Asset'ler paketlenmeli, olur |

Sonuç: 2D için WebView'in tek ciddi artısı ekosistem; bizim neredeyse her şeyi (rig, ağız,
araç, ağaç) zaten **özel** yazacağımız için bu artı eriyor. **Flutter + Flame.**

---

## 3. Mimari

### 3.1 Katmanlar
```
┌──────────────────────────────────────────────────────────────────────┐
│ app/            Menüler, ilerleme, ayarlar, mağaza kapıları           │
│ studio/         Atölye (yönetici paneli) — yalnız debug/web derlemede │
├──────────────────────────────────────────────────────────────────────┤
│ learning/       Kelime, SRS, puanlama, ipucu, çeviri baloncuğu        │
│ dialogue/       Jenny + düğüm şeması + etkileşim kalıpları + NLU      │
├──────────────────────────────────────────────────────────────────────┤
│ venues/         bakery · market · doctor · taxi (mekân + içerik)     │
│ world/          street, lanes, road, buildings, lamps, sky, weather   │
│ vehicles/       vehicle, car, truck, taxi, wheel, steering, cargo     │
│ traffic/        signals, crossings, rules, traffic AI                 │
│ flora/          tree species, growth, fruit, chopping, logs          │
│ props/          eşya kütüphanesi (ekmek, kasa, terazi, stetoskop…)    │
│ characters/     rig, parts, face, mouth, gestures, wardrobe, AI       │
├──────────────────────────────────────────────────────────────────────┤
│ engine_core/    zaman, ECS-benzeri bileşenler, olay veriyolu,         │
│                 yetenek (capability) manifesti, rastgelelik, kayıt   │
│ render_kit/     vektör parça → atlas, shader'lar, derinlik sıralama   │
│ anim_kit/       yaylar, IK, minimum-jerk, inertialization, eğriler    │
│ speech_kit/     g2p, vizem, koartikülasyon, ses saati, STT sarmalayıcı│
└──────────────────────────────────────────────────────────────────────┘
```
Bağımlılık yalnız aşağı doğru. `venues` → `characters/props/vehicles` kullanır, tersi asla.

### 3.2 Temel ilkeler (her ajan uyar)
1. **Her şey veri + davranış**: bir ekmek, bir trafik ışığı, bir taksi; JSON tanımı + Dart
   davranış sınıfı. Yeni ekmek türü = yeni JSON, kod değil.
2. **Her bileşen bir Yetenek Manifesti yayınlar** (§10.2): ne yapabildiğini (eylemler,
   durumlar, parametreler) makinenin okuyacağı biçimde söyler. Atölye düğmeleri, diyalog
   komutları ve testler bu manifestten **otomatik** üretilir.
3. **Deterministik simülasyon**: sabit adım (60 Hz mantık, çizim ara-değerli), tohumlu
   rastgelelik, "saat" enjekte edilebilir. Aynı tohum + aynı girdi = aynı kare → golden test.
4. **Kalıtım yerine bileşim**: "Kamyon, Araç'tan türer" isteği bileşimle karşılanır:
   `Vehicle = Chassis + Wheels[] + Suspension + Steering + Seats[] + CargoBay? + Lights + Doors`.
   Kamyon = bu parçaların bir ön ayarı (preset) + `CargoBay`. Böylece "ekmek kamyonu",
   "manav kamyonu", "çekici" hepsi veriyle çıkar. (Dart'ta yine `class Truck extends Vehicle`
   kolaylık sınıfı olur ama gerçek iş bileşenlerde.)
5. **Olay veriyolu**: `ItemPointed`, `ItemGiven`, `PriceShown`, `LightChanged`, `TreeFelled`…
   Diyalog, öğrenme katmanı ve testler olayları dinler; bileşenler birbirini doğrudan çağırmaz.

---

## 4. Görünüm, kamera ve dünya düzeni (yandan 2.5D)

```
 z (derinlik)          görünür katman
 ─────────────────────────────────────────────────────────────
 L0  gökyüzü            gradyan, güneş/ay, bulut (paralaks 0.05)
 L1  uzak şehir         silüet (0.2)
 L2  karşı evler        cepheler, pencerelerde ışık/perde/insan siluetleri (0.6)
 L3  karşı kaldırım     yayalar (ölçek 0.85), ağaçlar, lamba
 L4  yol – karşı şerit  araçlar sağdan sola
 L5  yol – yakın şerit  araçlar soldan sağa
 L6  yakın kaldırım     OYUNCU, dükkân kapıları, ağaçlar, lambalar, çöp kutusu, durak
 L7  ön plan            yarı saydam dallar, direk dipleri (0.0 → 1.15 paralaks)
```
- Her nesnenin `(x, lane, zOffset)` konumu var; çizim sırası `lane` + `y` ile.
  Şerit içi ufak derinlik (`zOffset`) çakışan yayaların sıralamasını çözer.
- Karşıya geçmek = yaya geçidinde `lane` L6 → L3 arası animasyonlu geçiş (ölçek ve y yumuşak
  değişir). Trafik ışığı bu geçişi yönetir.
- Kamera oyuncuyu yatayda yaylı takip eder; diyalogda karaktere yaklaşır (zoom 1.0 → 1.8),
  arka plan bulanıklaşır (ucuz: önceden küçültülmüş katman).
- **İç mekân**: kapıya girince sahne geçişi (kapı açılır, karartma) → iç mekân aynı şerit
  mantığıyla (ön tezgâh, tezgâh arkası, raflar, arka duvar).
- Dünya parçalara (chunk) bölünür: ekranda olmayan parça çizilmez; NPC'ler ekran dışında
  "soyut" simüle edilir (konum + durum, animasyon yok).

**Karakter bakış açısı**: Tüm karakterler **3/4 ön** çizilir (Toca Life tarzı), yürürken
yana döner (gövde dönüşü 3 kademe: ön, 3/4, profil), sola gitmek = ayna. Böylece ağız her
zaman görünür ve tek rig yeter.

---

## 5. Karakter sistemi (`characters/`)

### 5.1 İskelet (rig)
- Kemikler: `root, hips, spine, chest, neck, head, jaw` + `shoulder/upperArm/foreArm/hand.L/R`
  + `thigh/shin/foot/toe.L/R` + el için `palm, thumb(2), fingers(grup halinde 2 eklem)`.
- Her kemik: uzunluk, dinlenme açısı, açı sınırları (dirsek geriye bükülmez), z-sırası
  kuralları (sol kol gövdenin arkasında / önünde — dönüş açısına göre değişir).
- Görünüm kademeleri: ön / 3/4 / profil; her kademede parçaların z-sırası ve bazı parçaların
  görünürlüğü (uzak göz profilde gizli) tablo ile.
- Gövde oranları parametrik: boy, kilo, yaş (çocuk–yaşlı), omuz/kalça genişliği, baş oranı.
  Parçalar bu parametrelerle ölçeklenir → bir rig'den sonsuz karakter.

### 5.2 Animasyon çekirdeği (`anim_kit/`)
| Özellik | Yöntem |
|---|---|
| Kollar/bacaklar | Analitik 2 kemik IK (2D'de basit ve kesin) |
| Uzanma/işaret etme/verme | Minimum-jerk yörünge + hedefe göre IK |
| Yürüme/koşma | Prosedürel adım döngüsü; basan ayak zemine kilitli (kayma yok), kalça zıplaması, kol salınımı faz kilitli |
| Geçişler | Inertialization (mevcut koddan) — bir hareketten diğerine sıçrama yok |
| İkincil hareket | Yay zincirleri: saç, atkı, önlük, kulak küpesi, göbek/yanak hafif |
| Nefes, göz kırpma, sakkad | Mevcut algoritmalar |
| Düşme / itilme | Forge2D ragdoll'a geçiş (kemik → gövde eşlemesi), sonra "kalkma" ile animasyona dönüş |
| Elle taşıma | Taşınan eşyanın tutma noktaları (`grip`) — iki elle kasa, tek elle poşet |

### 5.3 Yüz ve ağız
- **Ağız prosedürel**: 11 kanallı kontrol vektörü (`jaw, stretch, smile, funnel, pucker,
  upperUp, lowerDown, rollLower, press, tongueUp, tongueOut`) → üst dudak, alt dudak, diş
  sırası, dil, ağız içi için Bezier yolları. Her karakter ağız stilini (dudak kalınlığı,
  renk, diş var/yok, bıyık) parametreyle seçer.
- Mevcut koartikülasyon modeli birebir: senaryo repliği → vizem izi → her karede vektör.
- Yedek: hazır sprite ağız seti (Preston Blair 9'lu) — sanatçı tarzı istenirse.
- Kaşlar (iç/dış yukarı-aşağı), göz kapakları (kırpma, kısma, şaşkınlık), göz bebeği
  (bakış hedefi), yanak kızarması, ter damlası, gözyaşı (doktor sahnesi!) — duygu ön
  ayarları: `neutral, happy, sad, surprised, thinking, confused, apologetic, angry, sick, tired`.
- Konuşma jestleri: konuşurken baş eğme, vurgu kelimesinde kaş kalkması (vurgu metinde
  işaretlenir), dinlerken baş sallama, anlamayınca baş yana yatırma.

### 5.4 Jest/eylem kütüphanesi (her biri parametreli, manifestte listelenir)
```
Temel:      idle, walk(speed), run, stop, turn(dir), sit(seat), stand, lean(on)
El/kol:     wave, point_at(target), point_self(bodyPart), beckon, shrug, count_fingers(n),
            thumbs_up, hand_on_chin, scratch_head, cross_arms, hands_on_hips
Eşya:       pick(item), place(item, slot), give(item, to), take(item, from), hold(item),
            carry(item, grip), put_in_bag(item, bag), open(container), close(container)
Para:       take_out_wallet, count_money(amount), pay(amount, to), receive_change,
            hand_card, tap_card, sign
Baş/yüz:    nod, shake_head, look_at(target), tilt_head, smile, frown, laugh, sneeze, cough
Mekâna özel: knead_dough, slide_tray_into_oven, slice_bread, weigh(item, scale),
            scan_barcode(item), type_register, listen_stethoscope(to), check_temperature,
            write_prescription, press_belly, drive, steer(angle), shift_gear, honk,
            open_car_door, get_in(vehicle, seat), get_out, fasten_seatbelt
Çevre:      push_button(crosswalk), wait, cross_street, chop(tree), pick_fruit(tree),
            shake_tree, throw(item), catch(item)
```
Her eylem: başlangıç koşulu (ör. `give` için elde eşya olmalı), süre, olaylar
(`actionStart/End`, `contact` anı — eşyanın el değiştirdiği kare), kesilebilir mi.

### 5.5 Giydirme (`wardrobe/`)
- Yuvalar: `hair_back, hair_front, hat, glasses, earrings, top, outer, apron/coat,
  bottom, socks, shoes, gloves, bag, badge`.
- Her giysi her kemiğe bağlı parçalardan oluşur, kemikle döner; profil/ön kademeleri var.
- Renk: palet + desen (çizgili, kareli, puantiyeli) shader ile; tek çizimden yüzlerce renk.
- Meslek ön ayarları: fırıncı (kep, önlük, un lekesi), kasiyer (yelek, yaka kartı),
  doktor (önlük, stetoskop, kimlik), taksici (gömlek, güneş gözlüğü opsiyonel), kurye.
- Kural motoru: uzun ceket + önlük çakışması gibi uyumsuzlukları z-sıra/gizleme kuralıyla çözer.
- Karakter üretici: tohumdan rastgele ama uyumlu karakter (ten, saç, kıyafet paleti uyumu).

### 5.6 Karakter yapay zekâsı (NPC)
- Hiyerarşik durum makinesi + basit zamanlama: "fırıncı: hamur yoğur → fırına sür → raf
  doldur → müşteri gelince tezgâha dön".
- Yayalar: hedefe yürü, vitrine bak, telefona bak, selamlaş, ışıkta bekle, yağmurda şemsiye aç.
- Çarpışma kaçınma şerit içinde basit (yavaşla, kenara kay, beklet).

### 5.7 Karakter testleri (otomatik)
- Kemik açı sınırı ihlali yok, NaN yok, ayak kayması < eşik (px/kare), el–eşya teması
  `contact` karesinde mesafe < eşik, z-sıra titremesi yok (aynı açıda iki kare arasında
  sıra değişmez), dönüş kademeleri arasında parça "zıplaması" yok.
- Her eylem için kare dizisi (ör. 24 kare) → temas sayfası (contact sheet) PNG → golden.
- Konuşma: bilinen cümle → ağız vektörü eğrisi golden; "b/p/m"de dudak kapanması garanti.

---

## 6. Dünya: sokak (`world/`, `traffic/`, `vehicles/`, `flora/`)

### 6.1 Sokak ve binalar
- Yol: asfalt dokusu, şerit çizgileri, rögar kapağı, yaya geçidi, bordür, rampalı kaldırım.
- Kaldırım: karo deseni, çöp kutusu, bank, otobüs durağı, posta kutusu, yangın musluğu,
  bisiklet park yeri, saksı.
- Binalar **modüler cephe**: zemin kat (dükkân vitrini / kapı / tente / tabela) + N normal
  kat (pencere tipleri, balkon, klima, çamaşır ipi) + çatı (kiremit, baca, anten).
  Tabelalar dile göre değişir (öğrenme fırsatı: "BAKERY / FIRIN").
- Pencereler: gece ışık yanar/söner, perde, saksı, bazen silüet karakter (ucuz animasyon).
- Kapılar: açılır (menteşe dönüşü), zil (fırın kapısında çan sesi!), otomatik kapı (market).

### 6.2 Sokak aydınlatması, gün ve hava
- Gün saati döngüsü (hızlandırılmış veya gerçek): gökyüzü gradyanı, güneş/ay, renk derecelendirme.
- Sokak lambası: akşam kademeli yanar (bazısı titreyerek), ışık halesi + zeminde ışık havuzu
  (shader), lamba etrafında güve (ufak parçacık). Arıza durumu (yanıp sönme) Atölye'den test.
- Hava: güneş, bulutlu, yağmur (parçacık + ıslak zemin yansıması), kar, rüzgâr (ağaçları,
  saçları, tenteleri sallar — tek global rüzgâr alanı).

### 6.3 Trafik ışıkları (`traffic/signal`)
- Tipler: araç ışığı (kırmızı, sarı, yeşil, kırmızı+sarı Avrupa geçişi, yanıp sönen sarı
  gece modu), yaya ışığı (kırmızı/yeşil adam, yeşilde geri sayım, yanıp sönme), buton
  (bas → "bekleyin" ışığı, sesli uyarı tıklaması).
- Bağlı kavşak denetleyicisi: faz planı (süreler veriyle), araç ve yaya fazları çakışmaz
  (test: asla ikisi aynı anda yeşil değil).
- Araçlar durma çizgisine göre fren (sarıda karar: durabilir mi?), yayalar bekleme alanında.
- Manifest eylemleri: `set_phase, force_red, night_mode, fault_blink, press_button,
  set_timing(...)`; durumlar: mevcut faz, kalan süre.

### 6.4 Araçlar (`vehicles/`)
| Parça | Davranış |
|---|---|
| Şasi/gövde | Gövde çizimi + renk/kaplama, kirlenme, logo (taksi işareti) |
| Tekerlek | Dönüş açısı = kat edilen yol / yarıçap (kayma yok); jant çizgileri dönmeyi gösterir; fren kilidi |
| Süspansiyon | Her aks bir yay: hızlanınca arka çöker, frende ön dalar, tümsek/rögar üzerinden geçince sekme |
| Direksiyon | Sürücü elleri IK ile direksiyon üzerinde; şerit değişiminde/dönüşte direksiyon döner, eller takip eder |
| Kapılar | Açılır (2D'de kapı paneli ölçek-x ile "dışa açılma" + gölge); binme/inme animasyonu kapıyla senkron |
| Koltuklar | Sürücü + yolcu yuvaları; karakter oturma pozu, kemer takma |
| Işıklar | Far (gece hale), stop lambası (frende parlar), sinyal (yanıp söner), taksi tepe lambası (boş/dolu) |
| Ses | Motor (hıza göre perde), korna, kapı, fren, sinyal tık |
| Fiziksel his | Hız → tekerlek, süspansiyon, egzoz dumanı parçacığı, hafif gövde titreşimi |
| Sürüş yapay zekâsı | Hedef hız, öndeki araca mesafe, ışığa uyma, park etme, yolcu alma (taksi) |

**Kamyon** = `Vehicle` ön ayarı + `CargoBay`:
- Kasa tipleri: açık kasa, tenteli, kapalı kasa (kapakları açılır), frigorifik.
- Yük: yuvalara dizilen **kasalar** (`Crate` → içinde `ItemStack`): domates, elma, portakal,
  muz, karpuz, ekmek, simit… Kasa içeriği veriyle; her meyve kendi çizimiyle istiflenir.
- Davranış: dükkân önüne park → arka kapı açılır → kurye kasaları tek tek taşır (karakter
  `carry`) → market rafı/deposu dolar (dünya durumu güncellenir: "bugün taze domates var").
- Fren ve tümsekte kasalar hafif sarsılır; çok sert frende üstteki meyve yuvarlanabilir
  (Forge2D, opsiyonel "eğlenceli" olay).
- Ön ayarlar: ekmek kamyoneti, manav kamyonu, süt kamyonu, çöp kamyonu, inşaat, kurye
  motoru (iki teker — aynı sistem).

### 6.5 Ağaçlar (`flora/`)
- **Prosedürel ağaç** (L-sistemi / uzay kolonizasyonu, 2D): tür parametreleri (gövde
  kalınlığı, dallanma açısı, yaprak şekli/renk, taç biçimi) → tohumla benzersiz ağaç.
- Türler: elma, armut, portakal, limon, kiraz, erik, incir, ceviz, çınar, ıhlamur, çam,
  palmiye (sahil şehri istersek).
- **Büyüme**: fidan → genç → olgun; her dal kendi büyüme eğrisiyle uzar (zaman parametresi
  ile sürekli — kademe atlama yok). Mevsim: tomurcuk → çiçek → ham meyve → olgun meyve →
  yaprak dökümü → çıplak dal.
- Meyveler: dal uçlarına bağlı, olgunlaşınca renk değişir, rüzgârda sallanır, zamanı gelince
  düşer (Forge2D, zıplar, yuvarlanır), toplanabilir (`pick_fruit`), ağaç sallanınca düşer.
- Rüzgâr: dallar hiyerarşik yay; gövde az, uç çok salınır.
- **Kesme**: balta darbeleri (karakter `chop`, her darbede talaş parçacığı + gövdede çentik
  derinleşir) → çatırdama → ağaç devrilme yönü hesaplanır (Forge2D katı gövde, yere çarpma
  sekmesi, yaprak patlaması) → kütük kalır → gövde parçalara bölünür (testere/balta) →
  kütükler kamyona yüklenip götürülür → kütükten zamanla yeni filiz (opsiyonel).
- Test: büyüme eğrisi monoton, dallar gövdeden kopuk değil, devrilen ağaç binaya/yola
  geçmez (devrilme yönü engelleri kontrol eder), kesim sırası kesilemez durumdan bozulmaz.

### 6.6 Ortam yaşamı
- Kuşlar (tele konar, yaklaşınca uçar), kedi/köpek, güvercinler (ekmek kırıntısına gelir!),
  kurye bisikleti, otobüs (durakta durur), çöpçü.
- Bunlar oyunun "canlı" hissi; ama hepsi bütçeli: ekranda en fazla N ambient varlık.

---

## 7. Mekânlar (her biri: düzen, işlevli parçalar, NPC'ler, öğrenme hedefi, dallar)

Ortak iç mekân çatısı: giriş kapısı (zil/otomatik), ön alan (oyuncu), tezgâh, tezgâh arkası
(NPC çalışma alanı), raf/duvar, arka kapı (depo). Her işlevli parça bir **Prop** + manifest.

### 7.1 Fırın
**Düzen**: kapı (çan), vitrin camı (içinde ürün tepsileri — her yuvada ürün, adet, etiket),
tezgâh, kasa, terazi (gramla satış için), ekmek dilimleme makinesi, poşet/kese kâğıdı rafı,
arka planda taş fırın (kapağı açılır, içi kor ışığı, kürek), hamur masası (un tozu), soğutma
rafı, duvarda fiyat tahtası (tebeşir yazı, dile göre).

**Ürünler (veri)**: somun, tam buğday, çavdar, baget, simit, poğaça, açma, kruvasan, pide
(Ramazan), kek dilimi, kurabiye (gram), pasta (sipariş). Her ürünün öznitelikleri:
`tür, boyut (küçük/büyük), renk (açık/koyu), şekil (yuvarlak/uzun), sıcak mı, adet, fiyat,
birim (adet/kg/dilim), konum (sol/sağ/üst/alt raf, ön/arka)`.
Bu öznitelikler **dil öğretiminin malzemesi**: "the big one", "the dark one on the left",
"şu uzun olan", "iki tane".

**Fırıncının işleri**: hamur yoğurma, fırına sürme/çıkarma (kürek), rafı doldurma, tartma,
dilimleme, poşetleme, kasa, para üstü verme, sipariş defterine yazma.

**Ana akış ve dallar** (özet; tam ağaç içerik dosyasında):
```
Giriş → selamlama (sabah/akşam selamı saate göre!) 
  → "Ne istersiniz?"
     ├─ ürün adı söyler ───────────────► SEÇİM DÖNGÜSÜ (§8.4)
     ├─ "Bu ne?" diye sorar ───────────► fırıncı işaret ettiğin ürünü adlandırır, tanıtır
     ├─ "Taze mi?" ────────────────────► "Az önce çıktı" + fırını gösterir (sıcak buhar)
     ├─ fiyat sorar ───────────────────► fiyat tahtasını gösterir / söyler
     ├─ olmayan ürün ister ────────────► "Kalmadı / bitti", alternatif önerir, "yarın gelin"
     ├─ anlamsız / sessiz ─────────────► kademeli yardım (§8.5)
     └─ vedalaşır ─────────────────────► çıkış
  SEÇİM DÖNGÜSÜ → adet ("kaç tane?") → dilimlensin mi? → poşet ister misiniz?
  → "Başka bir şey?" (döngü) → KASA KALIBI (§8.4) → vedalaşma
Yan dallar: sıcak ekmek bitti → 10 dk sonra çıkacak (bekle / başka al);
           sipariş pastası (gün, isim yazımı — harf kodlama alıştırması);
           yanlış para üstü (oyuncu fark edip "eksik verdiniz" diyebilir mi? ileri seviye);
           kuyruk: önde başka müşteri var, sırayı bekle / "sıra kimde?"
```

### 7.2 Market
**Düzen**: otomatik kapı, sepet/araba alanı, meyve-sebze reyonu (tezgâhlar, terazi + etiket
yazıcı), şarküteri (peynir/zeytin — gramla, görevli ile), raflar (koridorlar: süt ürünleri,
içecek, temizlik, konserve), dondurucu (kapağı açılır, buğu), kasa bandı (ürünler ilerler),
barkod okuyucu (bip), kasa ekranı (ürün satırları + toplam canlı artar), POS cihazı,
poşet askısı, fiş yazıcı (fiş çıkar), indirim etiketleri, "1 alana 1 bedava".

**Etkileşimler**: rafa uzanıp ürün alma, sepete koyma/çıkarma, görevliye "X nerede?" sorma
(görevli yönü gösterir — **yön/konum dili**: "3. koridorda, sağda, üst rafta"), tartı
(meyveyi tart, etiket yapıştır — unutursan kasada "tartmamışsınız" dalı), şarküteride
"200 gram beyaz peynir, ince dilim", son kullanma tarihine bakma, kasada: bant, bip, ekran,
toplam, "poşet ister misiniz?" (ücretli poşet), "kart mı nakit mi?", taksit/temassız,
fiş, para üstü.

**Dallar**: ürün yok / stokta yok (kamyon şu an boşaltıyor! — sokakla bağ), fiyat etiketi
ile kasa fiyatı farklı (itiraz etme dili), kart reddedildi (başka yöntem), sadakat kartı
var mı, kasada sıra, kampanya açıklaması (sayılar, yüzdeler).

### 7.3 Doktor (aile hekimi / klinik)
**Düzen**: bekleme salonu (sandalyeler, sıra numaratörü ekranı — "B-024 numara, 3 nolu oda":
sayı dinleme!), sekreter/kayıt masası (kimlik ister, form doldurtur), muayene odası (masa,
bilgisayar, muayene sedyesi, boy-kilo ölçer, tansiyon aleti, ateş ölçer, stetoskop, göz
tablosu, vücut şeması posteri), reçete yazıcı, eczane (bitişik ya da sokakta ayrı mekân).

**Etkileşimler**: kayıt (ad, doğum tarihi — harf/tarih söyleme), bekleme ve isminin
çağrılması, doktor "Şikâyetiniz nedir?", **vücut bölümü gösterme** (oyuncu karakteri kendi
`point_self(bodyPart)` yapar; doktor da posterde/kendinde gösterir: "Burası mı?"),
belirti dili (ağrı türü: zonklayan, batan; süre: "üç gündür"; şiddet 1–10), muayene
animasyonları (stetoskop — "derin nefes alın" → karakter nefes alır; ağzı açma "aaa";
ateş ölçme; karına bastırma — "burası acıyor mu?"), teşhis, reçete (doz: "günde iki kez,
yemekten sonra" — sayı/zaman), eczanede ilacı alma.

**Dallar**: alerji soruldu (var/yok → farklı ilaç), acil durum yönlendirmesi, rapor isteme,
kontrole çağrılma (randevu günü/saat), anlamadım → doktor jestle/gösterimle tekrar eder.

### 7.4 Taksi
**Sahne**: sokakta el kaldırma (`hail`) → taksi yanaşır (sinyal, fren, tepe lambası "dolu"ya
döner) → kapı açma, binme, kemer → **araç içi görünüm** (yan kesit: şoför direksiyonda,
taksimetre, ayna, kokulu çam ağacı sallanıyor, radyo, camdan geçen sokak paralaksı) →
yol tarifi → yolculuk → varış → ödeme → iniş.

**Etkileşimler**: adres verme (sokak, numara, semt; "X'in yanı / karşısı"), şoförün
anlamadığı ve tekrar sorduğu dal, **yön tarifi** ("ikinci soldan dönün, düz gidin, ışıklardan
sağa" — şoför direksiyonu buna göre çevirir; harita mini ekranında rota çizilir), trafik/ışıkta
bekleme (sokak simülasyonuyla aynı ışıklar), sohbet (hava, nerelisiniz — serbest küçük
konuşma), taksimetre (canlı artan ücret: sayı okuma), "şurada durabilir misiniz?",
ödeme, bahşiş, fiş isteme, bagaj (valizi şoför bagaja koyar — kapak açılır).

**Dallar**: yanlış yere gitti (düzeltme dili: "hayır, orası değil"), kestirme yol tartışması,
sigara/klima/radyo kısma ricaları, kart geçmiyor → ATM'de dur, şoför bozuk para yok der.

### 7.5 Sonradan eklenebilecek mekânlar (aynı çatıyla)
Kafe, eczane (ayrı), postane, banka/ATM, otobüs, otel resepsiyonu, kıyafet mağazası
(giydirme sistemiyle doğal uyum: deneme kabini!), restoran, kuaför, istasyon.

---

## 8. Diyalog motoru (`dialogue/`)

### 8.1 Katmanlar
1. **Hikâye dosyaları** (Yarn/Jenny): düğümler, değişkenler, koşullar, seçenekler, komutlar.
2. **Etkileşim kalıpları** (Dart): tekrar eden karmaşık mini-akışlar — seçim döngüsü, kasa,
   yön tarifi, belirti anlatma, adres verme, sayı/adet pazarlığı. Hikâye bunları `<<komut>>`
   ile çağırır; böylece "her olasılık" her düğüme elle yazılmaz.
3. **Dünya durumu**: sahnedeki eşyalar ve öznitelikleri, stok, saat, hava, oyuncunun cüzdanı,
   envanteri, önceki ziyaretler (fırıncı seni tanır: "Yine simit mi?").
4. **NLU**: oyuncu cümlesi → niyet + yuvalar (ürün, adet, öznitelik, yön, sayı).

### 8.2 Düğümün 5 yuvası (K2 için önerim)
Her düğüm şu 5 noktayı **zorunlu** taşır; şema doğrulayıcı eksik olanı reddeder:

| # | Yuva | İçerik |
|---|---|---|
| 1 | **Söz** (say) | NPC repliği: çok dilli metin, ses dosyası, vizem izi, duygu, vurgu kelimeleri |
| 2 | **Eylem** (do) | Replik öncesi/sırası/sonrası tetiklenecek animasyon ve olaylar: `point_at`, `give`, `show_price`… zamanlaması kelimeye bağlanabilir ("**bu** mu?" derken işaret) |
| 3 | **Beklenti** (expect) | Kabul edilen niyetler ve örnek cümleler (öğrenilecek kalıp), dokunma seçenekleri (2–5 adet), zaman aşımı |
| 4 | **Yardım** (help) | Kademeli ipucu: 1) tekrar söyle (yavaş), 2) jestle göster, 3) ilk kelimeyi ver, 4) seçenekleri göster, 5) çeviri/örnek; ayrıca "anlamadım" niyetine cevap |
| 5 | **Sonuç** (then) | Niyet → sonraki düğüm, durum değişkeni güncelleme, puan/kelime kaydı, tetiklenen dünya olayı |

### 8.3 Örnek (Jenny/Yarn sözdizimi + bizim komutlar)
```yarn
title: Firin_NeIstersiniz
---
<<face baker happy>>
Fırıncı: Günaydın! Ne istersiniz? #line:bk_001 #emph:istersiniz
-> {intent:order item=$item}           // beklenti: "bir somun", "simit lütfen"
    <<select_item baker $item>>         // SEÇİM DÖNGÜSÜ kalıbı (işaret et → onay → düzelt)
    <<jump Firin_Adet>>
-> {intent:ask_what target=$t}          // "bu ne?" + oyuncunun dokunduğu/işaret ettiği
    <<point_at baker $t>>
    Fırıncı: Bu {$t.name}. Çok taze! #line:bk_002
    <<jump Firin_NeIstersiniz>>
-> {intent:ask_price item=$item}
    <<show_price_board baker $item>>
    <<jump Firin_NeIstersiniz>>
-> {intent:not_understood}
    <<help_step>>                        // yardım merdiveni bir basamak ilerler
===
```
(`{intent:...}` satırları bizim Jenny uzantımız; dokunma seçenekleri de buradan üretilir.)

### 8.4 Etkileşim kalıpları (ayrıntılı)

**A) SEÇİM DÖNGÜSÜ** — "hangisi?" (senin örneğin):
```
girdi: istenen tür (+ varsa öznitelikler: boyut, renk, konum, sayı)
1. Aday kümesi = sahnedeki o türden eşyalar ∩ özniteliklere uyanlar
2. |aday| == 0  → "O kalmadı" / "Öyle bir şey yok" → alternatif öner (en yakın tür)
   |aday| == 1  → NPC işaret eder + "Bu mu?" (ya da doğrudan alır)
   |aday| >  1  → NPC en olası adayı işaret eder (popülerlik/öndeki) + "Bunu mu, şunu mu?"
3. Oyuncu cevabı:
   evet/"bu"            → NPC eşyayı alır (`pick`) → poşetler → `give` → oyuncu `take`
   hayır, "diğeri"      → sıradaki adayı işaret eder (döngü)
   hayır + öznitelik    → "büyük olanı / soldakini / koyu olanı" → küme daraltılır → 2'ye
   oyuncu kendisi dokunur/işaret eder → NPC o eşyayı işaret ederek teyit eder
   "ikisi de" / sayı    → çoklu seçim
4. Her işaret ediş: NPC kolu IK ile eşyaya, bakış eşyaya, eşya hafif parlar,
   NPC "bu / şu / o" zamirini mesafeye göre seçer (dil öğretimi: işaret sıfatları)
5. Sınır: 3 yanlış turdan sonra yardım merdiveni (eşyalar numaralanır, dokunmaya izin)
```
**B) KASA / ÖDEME**: ürünler kasaya → her ürün satırı ekrana yazılır (fiyat, adet) →
toplam animasyonla belirir + NPC söyler ("Toplam 37 lira 50 kuruş") → "Kart mı nakit mi?"
→ nakit: oyuncu cüzdan arayüzünde banknot/bozuk para seçer (sayı alıştırması), fazla
verirse para üstü hesaplanır ve NPC sayarak verir; eksikse "50 kuruş eksik" dalı; kart:
POS'a dokun, bip, (nadiren) "onaylanmadı" dalı → fiş ister misiniz → vedalaşma.
**C) YÖN TARİFİ**: hem verme (taksi) hem alma (market görevlisi); sol/sağ/düz/karşı/yanında
/arkasında; dünya haritası bu ilişkileri gerçekten hesaplar → cevap doğru mu kontrol edilir.
**D) BELİRTİ ANLATMA**: vücut bölgesi + ağrı türü + süre + şiddet yuvaları; eksik yuvayı
doktor sorar (yuva doldurma diyaloğu).
**E) ADET/MİKTAR**: tane/kilo/gram/dilim/paket; "yarım kilo", "200 gram", "bir düzine".
**F) KÜÇÜK SOHBET**: hava (gerçek oyun havası!), memleket, iş — LLM'li serbest mod opsiyonel,
ama çevrimdışı için kısa kalıp seti.

### 8.5 "Her olasılığı düşün" — kapsam kuralları (otomatik denetlenir)
Her beklenti düğümünde şunlar **mutlaka** karşılanır (karşılanmazsa CI kırmızı):
`anlamadım/tekrar`, `sessizlik (zaman aşımı)`, `alakasız cevap`, `ana dilde cevap`
(anlayışlı NPC: "Ah, ekmek mi? Yes, bread!" — sonra hedef dilde tekrar ettirir), `vazgeçme/çıkış`,
`kaba/argo` (kibar geçiştirme), `yardım istemek`. Ayrıca:
- **Diyalog gezgini botu**: tüm yolları (dokunma seçenekleri + örnek cümleler) otomatik
  oynar → ölü uç yok, her düğüme ulaşılıyor, sonsuz döngü yok (yardım merdiveni kırar),
  her yol çıkışa varıyor, her referans verilen eşya sahnede var, her ses/vizem dosyası var.
- Kapsam raporu Atölye'de: hangi düğümde hangi niyet eksik.

### 8.6 Konuşma tanıma ve niyet eşleme
- STT çıktısı → normalleştirme (küçük harf, noktalama, sayı yazıya/yazı sayıya, Türkçe
  ek/ünlü uyumu toleransı) → düğümün beklenti kalıplarıyla bulanık eşleme (kelime
  benzerliği + fonetik benzerlik — öğrenci "bred" dese de "bread").
- Güven düşükse: NPC tahminini doğal biçimde teyit eder ("Simit mi dediniz?") — bu da bir
  öğrenme anı. LLM yedeği yalnızca bu düğümün niyet listesinden JSON seçer.
- Telaffuz puanı (opsiyonel, bulut): kelime bazında renkli geri bildirim.

### 8.7 Seslendirme ve dudak senkronu boru hattı
```
yarn dosyası ──► replik çıkarıcı ──► (dil başına, karakter sesi başına)
   TTS servisi (SSML: hız, vurgu, duygu) ──► ses (opus/m4a) + zaman damgaları
   ──► bizim g2p + koartikülasyon ──► vizem izi JSON ──► asset paketi
dinamik içerik (fiyat "37,50"): önceden seslendirilmiş sayı parçaları birleştirilir
   (sayı sentezleyici: "otuz yedi" + "lira" + "elli" + "kuruş") — vizem izi de birleştirilir
yedek: cihaz TTS + kelime sınırı olayları + g2p tahmini (mevcut kodda zaten var)
```
Dudak saati daima **sesin çalma konumu** — çizim kare hızı düşse de senkron kaymaz.

---

## 9. Dil öğrenme katmanı (`learning/`)
- Her replik ve beklenti kalıbı **öğrenme öğelerine** etiketli: kelime (ekmek, büyük),
  kalıp ("…, lütfen"), dilbilgisi (işaret sıfatları, çoğul, sayılar, emir kipi).
- Aralıklı tekrar (SRS): bir sonraki ziyarette fırıncı zayıf olduğun kelimeyi kullanır.
- Zorluk seviyeleri: A1'de NPC yavaş, kısa, jestli konuşur ve dokunma seçenekleri görünür;
  B1'de hızlı, deyimli, seçenek yok.
- Herhangi bir kelimeye dokununca çeviri baloncuğu + sesli okunuş; eşyaya dokununca adı.
- Görevler: "Fırından 2 simit ve 1 somun al, 50 liradan fazla harcama" → bütçe, sayı.
- İlerleme: mekân başına yıldız, kelime defteri, telaffuz geçmişi.

---

## 10. Ajan üretim hattı ve Atölye (yönetici paneli)

### 10.1 Genel akış
```
             ┌──────────────── GÖREV AĞACI (tek doğruluk kaynağı) ────────────────┐
             │ Oyun ▸ Karakterler ▸ İnsan ▸ Rig ▸ El …                             │
             │       ▸ Araçlar ▸ Kamyon ▸ Kasa yükü …   ▸ Trafik ▸ Işık …          │
             │ her düğüm: durum · sahip modül · bağımlılık · notlar · ekler        │
             └───────▲──────────────────────────┬─────────────────────────────────┘
       yönetici notu │                          │ dağıtıcı: hazır + bağımlılığı tamam
       ajan keşfi    │                          ▼ + modül kilidi boş → boştaki ajana
             ┌───────┴──────┐           ┌───────────────┐
             │   ATÖLYE     │◄──────────│  AJAN (işçi)   │ dal aç → kod → test →
             │ (Flutter Web)│  önizleme │  + modül SKILL │ görüntü/GIF → öz-inceleme → PR
             └──────▲───────┘           └───────┬───────┘
                    │ bildirim:                 ▼
                    │ "incelemen bekleniyor"  CI: analiz, birim, golden, kare dizisi,
                    └──────────────────────── glitch dedektörleri, performans, görsel eleştirmen
```

### 10.2 Yetenek manifesti (her bileşen)
```json
{
  "id": "traffic.signal.vehicle",
  "module": "traffic",
  "title": "Araç trafik ışığı",
  "params":  { "timing.green": {"type":"seconds","min":3,"max":60,"default":20},
               "style": {"type":"enum","values":["eu","us"]} },
  "states":  ["red","red_amber","green","amber","off","night_blink","fault"],
  "actions": [ {"name":"set_phase","args":{"phase":"state"}},
               {"name":"night_mode"}, {"name":"fault_blink"},
               {"name":"press_ped_button"} ],
  "events":  ["phase_changed"],
  "scenes":  ["studio/traffic/intersection_basic", "studio/traffic/night"],
  "checks":  ["no_conflicting_greens", "amber_duration>=3s"],
  "acceptance": ["Gece modunda sarı 1 Hz yanıp söner", "Yayaya yeşil yanarken araç kırmızıdır"]
}
```
Atölye bu dosyadan **otomatik** üretir: parametre için kaydırıcı/açılır liste, her eylem
için düğme, durum göstergesi, olay günlüğü, kabul kriteri onay kutuları.

### 10.3 Atölye ekranları
1. **Ağaç** (sol): görev/bileşen ağacı, durum renkleri (yapılacak, yapılıyor, ajan inceliyor,
   **senin incelemen bekleniyor**, düzeltiliyor, onaylandı), ilerleme yüzdesi, filtre.
2. **Sahne tezgâhı** (orta): bileşen yalıtılmış test sahnesinde canlı; zaman kontrolü
   (oynat/durdur/kare kare/yavaşlat ×0.1/tohum değiştir), kamera yakınlaştırma, iskelet ve
   çarpışma kutusu katmanı, gece/gündüz/hava değiştirici.
3. **Kontroller** (sağ): manifestten üretilmiş düğmeler/kaydırıcılar; "tüm eylemleri sırayla
   oynat" (duman testi); hazır senaryolar.
4. **Not bırakma**: sahnenin herhangi bir noktasına **iğne + zaman damgası** ("bu karede
   dirsek geriye büküldü"), ekran görüntüsü/kısa kayıt otomatik eklenir, önem derecesi,
   "bunu da istiyorum" (yeni özellik) / "hata" ayrımı → görev ağacına alt görev olarak düşer.
5. **Karşılaştır**: önceki onaylı sürüm ↔ yeni sürüm yan yana / kaydırmalı / fark görüntüsü.
6. **Onay**: kabul kriterlerini işaretle → "Onayla" ya da "Geri gönder (notlarla)".
7. **Bildirimler**: incelemeye hazır, CI kırıldı, ajan soru sordu, keşif önerisi geldi.
8. **Ajanlar**: hangi ajan neyi yapıyor, kuyruk, harcanan bütçe, duraklat/öncelik değiştir,
   **yeni direktif yaz** (ağaçtaki bir düğüme genel talimat — o modülün SKILL dosyasına
   eklenir, sonraki tüm görevlerde geçerli).
9. **Diyalog görünümü**: hikâye dalları grafik olarak, kapsam raporu, bir düğümden canlı oynat.

### 10.4 Görev yaşam döngüsü
```
öneri ──(yönetici veya mimar ajan triyaj)──► hazır ──► atandı ──► yapılıyor
   ──► ajan öz-incelemesi (kendi ekran görüntülerine bakar, kabul kriterleriyle kıyaslar)
   ──► CI ──► görsel eleştirmen ajan ──► YÖNETİCİ İNCELEMESİ ──► onaylandı ──► birleştirildi
                                             └─► geri gönderildi (notlar) ──► hazır (öncelikli)
```
- **"Bir şey yaparken yeni detay çıkar"**: ajan işini genişletmez; keşfettiği her şeyi
  `öneri` olarak ağaca yazar (gerekçe + tahmini boyut). Böylece kapsam patlaması
  denetim altında, ama hiçbir fikir kaybolmaz.
- "Bitti tanımı" (her görev): kod + manifest güncel + birim test + golden/kare dizisi +
  Atölye sahnesi + kısa doküman + PR'da önce/sonra görüntüleri.
- Ajan "boşta" = kuyruktan en yüksek öncelikli, bağımlılığı tamamlanmış, modül kilidi boş
  görevi alır. Ajanlar sabit kişi değil: **genel işçi + göreve göre yüklenen modül becerisi**
  (`.claude/skills/<modül>/SKILL.md`). Bu sayede "insan bölümü ajanı" bitince aynı işçi
  araç görevine geçebilir.

### 10.5 Çakışmasızlık (en büyük teknik risklerden biri)
- Her modül ayrı Dart paketi; görev yalnız kendi paketine yazabilir (CI'da yol denetimi).
- Paketler arası sözleşmeler (`engine_core` arayüzleri, olay tipleri, manifest şeması)
  **önce** mimar tarafından yazılır ve kilitlenir; değişiklik ayrı "sözleşme görevi" ister.
- Küçük PR'lar, birleştirme kuyruğu (merge queue), her PR ana dala göre yeniden test.
- Aynı modülde aynı anda en fazla 1 ajan (modül kilidi); ince taneli modüller = paralellik.

### 10.6 Ajanların altyapısı (K8)
**Seçenek A — GitHub-yerli (önerilen başlangıç)**
- Görev ağacı = GitHub Issues (alt-issue'lar ağaç), etiketler durum/modül/öncelik.
- Ajan = Claude Code GitHub Action (issue'da tetiklenir, dal açar, PR açar).
- Dağıtıcı = zamanlanmış küçük bir Actions iş akışı: hazır + bağımlılığı tamam + kilit boş
  issue'ları N eşzamanlı sınırla ajana verir.
- Atölye = Flutter Web, GitHub API'si ile issue okur/yazar; her PR için Pages önizlemesi.
- Bildirim = GitHub mobil uygulaması + e-posta (bedava, hazır).
**Seçenek B — Kendi orkestratörün** (Ajan1453 repondaki orkestratör/işçi/hafıza ağacı
yapısı bunun iskeleti olabilir): Claude Agent SDK işçileri, git worktree'leri, kendi
veritabanı, kendi push bildirimi (FCM). Daha esnek, daha çok iş. A ile başlayıp ihtiyaç
olursa B'ye geçmek kolay (görev ağacı modeli aynı).

### 10.7 Test ve görsel inceleme
| Seviye | Ne | Nerede |
|---|---|---|
| Birim | g2p, vizem, IK, yaylar, faz planı, fiyat hesabı, SRS | `flutter test` |
| Değişmez denetimleri | açı sınırı, ayak kayması, z-titreme, NaN, ışık çakışması, devrilme yönü | `flutter test` (simülasyon başsız koşar) |
| Golden | her bileşenin anahtar pozları, mekân görünümleri, gece/gündüz | `flutter test` + sabit Docker imajı |
| Kare dizisi | her eylemin N karesi → temas sayfası + GIF (PR'a eklenir) | CI |
| Diyalog | gezgin bot, kapsam, asset varlığı | CI |
| Uçtan uca | Atölye'de manifest düğmelerine sırayla bas, hata/istisna yok | Flutter Web + Playwright |
| Cihaz | Android emülatörde `integration_test` + FPS ölçümü | haftalık/gece CI |
| Görsel eleştirmen | görüntü + stil rehberi + kabul kriterleri → çok kipli model puanı ve somut not | CI sonrası ajan |
| İnsan | Atölye'de yönetici | son karar |

Golden'lar ancak **deterministik** olursa işe yarar: sabit zaman adımı, tohumlu rastgelelik,
paketlenmiş fontlar, tek render yolu, küçük piksel toleransı. Görsel eleştirmen "güzel mi?"
sorusunda yardımcı olur ama **nihai karar sende**; onun işi bariz bozuklukları sana
gelmeden yakalamak.

---

## 11. Öngörülen zorluklar ve önceden çözümleri

| # | Zorluk | Önlem |
|---|---|---|
| 1 | **Sanat kalitesi**: kodla çizilen karakter "programcı çizimi" görünebilir | Düz vektör stil rehberi (palet, çizgi kalınlığı, oranlar, gölge kuralı), referans panosu, ilk 2 haftada stil onayı; parçalar değiştirilebilir → sanatçı/AI görsel sonradan girebilir |
| 2 | İzometrik isteği işi katlar | Yan görünüm 2.5D (K3) |
| 3 | "Her olasılık" = kombinatorik patlama | Etkileşim kalıpları + öznitelikli dünya + zorunlu kapsam kuralları + gezgin bot (§8.5) |
| 4 | Ajanların birbirini ezmesi | Paket sahipliği, sözleşme önce, modül kilidi, merge queue (§10.5) |
| 5 | Kapsam patlaması / bitmeyen proje | **Dikey dilim önce**: Fırın uçtan uca bitmeden diğer mekânlara geçilmez |
| 6 | Ajan maliyeti | Eşzamanlılık sınırı, görev başı bütçe, küçük görevler, ucuz modelle triyaj |
| 7 | Golden testlerin rastgele kırılması | Determinizm kuralları; font/renderer sabit; toleranslı karşılaştırma |
| 8 | Shader'ların başsız testte çalışmaması | Spike'ta doğrula; çalışmazsa testte shader kapalı golden + cihazda ayrı kontrol |
| 9 | Düşük Android'de performans | Atlas pişirme, sprite batch, ekran dışı ayıklama, NPC LOD, parçacık bütçesi, kalite kademeleri (mevcut repodaki gibi otomatik) |
| 10 | Öğrenen aksanında STT başarısızlığı | Tolerant eşleme, teyit sorusu, her zaman dokunma yedeği, asla kilitlenme |
| 11 | Ses–dudak kayması | Saat = ses konumu; senaryolu replikler önceden pişirilir |
| 12 | Çok dilli metnin taşması (Almanca uzun!) | Baloncuk otomatik boyut, golden'larda en uzun dil |
| 13 | Dinamik sayı/fiyat seslendirmesi | Sayı sentezleyici (parça birleştirme), dil başına sayı kuralları |
| 14 | Web (Atölye) ile mobil arasında görüntü farkı | Golden'lar tek yolda; mobil cihaz kontrolü ayrı ve periyodik |
| 15 | Fizik + prosedürel animasyon çakışması (ragdoll'a giriş/çıkış) | Açık devir teslim durumu; fizik yalnız belirli olaylarda, inertialization ile geri dönüş |
| 16 | Kalıtım hiyerarşisinin kilitlenmesi (araç → kamyon → …) | Bileşim + ön ayar (§3.2-4) |
| 17 | Çocuk kullanıcı verisi | Cihazda STT, ses kaydı saklanmaz, ebeveyn izni |
| 18 | Yönetici darboğazı (her şey senin onayını bekler) | Görsel eleştirmen + otomatik testler ilk süzgeç; sana yalnız "anlamlı" incelemeler gelir; toplu onay ekranı |

---

## 12. Yol haritası

> Süreler eşzamanlı 3–5 ajan ve senin düzenli incelemen varsayımıyla kaba tahmindir.

**Faz 0 — Kararlar ve spike (1–2 hafta)**
K1–K9 kararları · Flame + Forge2D + Jenny sürüm sabitleme · başsız golden + shader testi ·
Flutter Web'de Atölye iskeleti · TS → Dart taşıma (g2p, lipsync, spring) · tek karakterin
prosedürel ağızla konuştuğu ilk demo · ajan hattı tek ajanla uçtan uca (issue → PR → CI →
Atölye önizleme → onay) · **stil onayı**.

**Faz 1 — Çekirdek (2–3 hafta)**
`engine_core` (zaman, olaylar, manifest şeması, kayıt), `render_kit` (atlas, derinlik,
paralaks), `anim_kit` (IK, yay, min-jerk, inertialization), `speech_kit`, Atölye'nin
manifestten otomatik kontrol üretmesi.

**Faz 2 — Karakterler (3–4 hafta, paralel alt modüller)**
rig + görünüm kademeleri · yüz/ağız/duygular · jest kütüphanesi · giydirme · karakter üretici
· NPC davranışları · ragdoll · tüm testler.

**Faz 3 — Dikey dilim: Fırın + kısa sokak (3–4 hafta)**
sokak parçası (kaldırım, yol, karşı evler, 2 lamba, 1 ağaç, 1 trafik ışığı, 1 araba) ·
fırın mekânı tam · diyalog motoru + seçim döngüsü + kasa kalıbı · seslendirme hattı · öğrenme
katmanının çekirdeği. **Burada durup birlikte değerlendiririz.**

**Faz 4 — Dünya genişletme (paralel)**
araçlar tam (kamyon/kargo, taksi), trafik sistemi, ağaçlar tam (büyüme, meyve, kesim,
taşıma), gece-gündüz, hava, ortam yaşamı.

**Faz 5 — Diğer mekânlar**
Market → Doktor (+ eczane) → Taksi (araç içi sahne).

**Faz 6 — Öğrenme derinliği, cila, performans, yayın**
SRS, seviyeler, görevler, telaffuz, erişilebilirlik, mağaza hazırlığı.

---

## 13. Depo düzeni (öneri)
```
packages/
  engine_core/  render_kit/  anim_kit/  speech_kit/
  characters/   props/       vehicles/  traffic/   flora/   world/
  venues/bakery/  venues/market/  venues/doctor/  venues/taxi/
  dialogue/     learning/    studio/
apps/
  game/         (mobil oyun)
  studio_web/   (Atölye — Flutter Web)
content/
  dialogue/<venue>/*.yarn     items/*.json     characters/*.json
  locales/<lang>/             audio/<lang>/<voice>/    (CI üretir)
tools/
  voice_bake/   (TTS + vizem izi)   dialog_walker/   contact_sheet/   schema/
.claude/skills/<modül>/SKILL.md      (her modülün ajan talimatı + yönetici direktifleri)
docs/
  OYUN_PLANI_2D.md  STIL_REHBERI.md  MANIFEST_SEMASI.md
```
Mevcut 3D çalışma (`web/`, `flutter_app/`) ayrı kalır; algoritmalar `speech_kit` ve
`anim_kit`'e Dart olarak taşınır.
