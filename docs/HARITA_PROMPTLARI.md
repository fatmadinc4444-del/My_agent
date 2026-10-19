# Şehir haritası — görsel üretim promptları

Promptlar İngilizce, çünkü görsel modellerinin çoğu (Midjourney, DALL·E, Flux, Imagen,
Stable Diffusion) İngilizceyi daha iyi anlıyor. Açıklamalar Türkçe.

## 0. Önce bunları oku (tutarlılık kuralları)

1. **Her promptun sonuna aynı STİL BLOĞUNU ekle** (aşağıda). Bütün görseller aynı oyundan
   çıkmış gibi görünsün diye.
2. **İlk beğendiğin görseli "stil referansı" yap.** Midjourney'de `--sref <görsel linki>`,
   diğerlerinde "reference image / style reference" alanı. Sonraki tüm görsellere aynı
   referansı ver.
3. **Tabelalara yazı yazdırma.** Görsel modelleri harfleri bozar. Tabelalar, levhalar,
   vitrinler boş çizilsin; yazıyı oyunda biz ekleriz (dil öğrenme için zaten oyun içi yazı
   lazım, her dilde değişecek). Promptlarda bu yüzden `blank signs` var.
4. **İki tür görsel var:**
   - **Harita görünümü (izometrik, yukarıdan)**: şehrin genel haritası, ev satın alma,
     bölgeler arası gezinme.
   - **Sokak görünümü (yandan, 2.5D)**: karakterin yürüdüğü sahneler (plandaki görünüm).
   Önce haritayı üret, sokak sahnelerini haritadaki bölgelere göre üret.
5. **Şehir büyüyecek.** Bu yüzden harita parçalı düşünülür: her bölge ayrı görsel, kenarlarda
   boş arsa / inşaat alanı / sis bırakılır. Yeni bölge = komşu kenara yapışan yeni görsel.
6. Bu görseller **konsept çizimi**dir: oyunun neye benzeyeceğini belirler. Oyundaki gerçek
   parçalar (ev, ağaç, araç) sonra tek tek, düz arka planda ayrı üretilir (§5).

### STİL BLOĞU (her promptun sonuna kopyala)
```
cozy stylized 2D game art, clean flat vector shapes with soft cel shading, thin dark warm outlines, warm pastel color palette with saturated accents, gentle ambient occlusion, readable silhouettes, high detail but uncluttered, consistent lighting from top-left, no text, no letters, blank signs, no watermark, no logo
```

### NEGATİF PROMPT (destekleyen araçlarda)
```
text, letters, words, watermark, logo, photorealistic, 3d render, blurry, noisy, distorted perspective, fisheye, oversaturated, dark muddy colors, deformed people, extra limbs, cropped buildings
```

### Kamera ayarları
- Harita: `isometric 2:1 projection, 30 degree camera angle, orthographic, top-down three-quarter view`
- Sokak: `side view, orthographic, eye level, 2.5D layered street scene, parallax depth layers`
- Oran: harita `--ar 16:9` (ya da 3:2), sokak `--ar 21:9` (geniş panorama), parça `--ar 1:1`

---

## 1. Şehrin genel düzeni (tüm promptlar buna göre)

```
 KUZEY
 ┌──────────────────────────────────────────────────────────────┐
 │  ORMAN (tepeler, bisiklet yolları, kulübe, gölet, kamp)      │
 │      ╲ bisiklet yolu ╱                                        │
 ├───────────────┬──────────────────────────────┬───────────────┤
 │ MÜSTAKİL EVLER│  GÖKDELEN MERKEZİ             │ SANAYİ/LİMAN  │
 │ bahçeli, çit, │  cam kuleler, meydan, metro,  │ depolar,      │
 │ boş arsalar   │  banka, otel                  │ kamyonlar     │
 │ (SATILIK)     ├──────────────────────────────┤               │
 │               │  ÇARŞI CADDESİ               │               │
 │ okul, park    │  fırın, market, kafe masaları │               │
 │               │  doktor, eczane, polis, taksi │               │
 ├───────────────┴──────────────────────────────┴───────────────┤
 │  NEHİR KIYISI: rıhtım, iskele, balıkçılar, sahil yolu        │
 │  ════ köprü ════════ köprü ═══════ tren köprüsü ═════════    │
 │  NEHİR                                                        │
 │  karşı kıyı: SİSLİ, BOŞ — gelecekte açılacak bölge           │
 └──────────────────────────────────────────────────────────────┘
 GÜNEY
```

---

## 2. Ana harita promptu (ilk üreteceğin görsel)

```
Isometric city map of a cozy mid-sized fictional city for a life-simulation and story game, seen from a 2:1 isometric camera. North: a dense green forest on rolling hills with winding bicycle paths, a small wooden cabin, a pond and a campsite. Center: a downtown of glass and steel skyscrapers around a plaza with a fountain, a metro entrance, a bank and a hotel. Below downtown: a lively shopping street with a bakery, a small supermarket, cafes with outdoor tables and umbrellas on the sidewalks, a doctor's clinic with a pharmacy, a police station with parked police cars, and a taxi stand with yellow taxis. West: a suburb of detached family houses with gardens, fences, driveways, trees, a school and a playground, plus several empty fenced plots with blank for-sale signs. East: a small industrial area with warehouses and delivery trucks. South: a wide river along the whole map with a stone riverside promenade, a wooden fishing pier with fishermen, small boats, two road bridges and one railway bridge. The far riverbank is covered in soft fog and empty land, ready for future expansion. Streets have crosswalks, traffic lights, street lamps, bus stops, trees along sidewalks, tiny people and cars. Daytime, clear sky.
[STİL BLOĞU] --ar 16:9
```

---

## 3. Bölge promptları (harita görünümü, her biri ayrı görsel)

Her biri ana haritadaki bölgenin yakın planı. Hepsinin sonuna STİL BLOĞU + `isometric 2:1 projection` ekle.

### 3.1 Gökdelen merkezi
```
Isometric close-up of a downtown district: tall glass and steel skyscrapers of different heights and shapes, rooftop gardens, helipad on one tower, reflective blue windows, a central paved plaza with a round fountain, benches, pigeons and pedestrians, a metro station entrance with stairs, a bank with columns, a modern hotel with a revolving door and a taxi waiting, wide avenues with bus lanes, traffic lights at every intersection, crosswalks, street lamps, small trees in round planters, office workers walking, food truck at the plaza corner, construction crane on one unfinished tower.
```

### 3.2 Çarşı caddesi (dükkânlar, kafeler)
```
Isometric close-up of a charming shopping street: a row of 3-4 storey buildings with shops on the ground floor and apartments above with balconies, flower boxes and laundry lines. Shops: a bakery with a striped awning and bread in the window, a small supermarket with fruit and vegetable crates outside, two cafes with outdoor tables, chairs and parasols on a wide sidewalk where people sit drinking tea and coffee, a flower shop, a newsstand, a pharmacy with a green cross shape, a doctor's clinic entrance. Blank shop signs hanging and mounted above doors, blank sandwich-board signs on the sidewalk. A delivery truck unloading bread crates in front of the bakery, a fruit truck at the market, bicycles parked, street lamps, trees with round canopies, a bus stop with a bench, a crosswalk with traffic lights and pedestrians waiting.
```

### 3.3 Polis merkezi ve hizmet binaları
```
Isometric view of a city services block: a police station building with blue and white details, a flag pole, parked police cars and a police motorcycle, officers chatting at the entrance; next to it a small fire station with a red fire truck and open garage doors; a clinic and pharmacy across the street; a taxi stand with three yellow taxis and drivers leaning on their cars; a post office with a mailbox; sidewalks with lamps, trees and benches.
```

### 3.4 Müstakil evler (satın alınabilir evler)
```
Isometric view of a peaceful suburb of detached family houses, each one different: small cottage, two-storey house with a garage, bungalow with a porch, modern flat-roof house, old house with a chimney. Each house has its own garden with lawn, flower beds, fruit trees, a fence or hedge, a mailbox, a driveway with a car or bicycle. Some gardens have a swing, a vegetable patch, a doghouse, a trampoline. Several empty grass plots with wooden fences and blank for-sale signs, one plot with a house under construction with scaffolding. Quiet curved residential streets with street lamps and sidewalks, a school building with a schoolyard, a playground with slides and swings, a small neighbourhood corner shop.
```

### 3.5 Orman ve bisiklet yolları
```
Isometric view of a large forest on gentle hills at the edge of a city: mixed trees (oaks, pines, birches, fruit trees at the edge), winding dirt and paved bicycle paths with cyclists, wooden direction posts with blank signs, a wooden footbridge over a stream, a small pond with ducks, a log cabin with smoke from the chimney, a campsite with tents and a campfire ring, picnic tables, a lookout tower, a park ranger's jeep, stacks of cut logs and tree stumps where some trees were cut down, a lumber truck on a forest road, deer near the trees, mushrooms and bushes.
```

### 3.6 Nehir kıyısı, köprüler, balıkçılar
```
Isometric view of a city riverside: a wide calm river with gentle ripples, a stone promenade with railings, benches and lamps along the bank, joggers and cyclists on a riverside bike lane, a long wooden fishing pier where several old men fish with long rods, buckets and folding stools, one man holding up a fish, seagulls flying above; small rowing boats and a fishing boat tied to the dock, a tiny bait and tea kiosk; two road bridges, one old stone arch bridge and one modern cable bridge with cars and buses, plus a red steel railway bridge with a train crossing. The opposite riverbank is empty grassland fading into soft fog.
```

### 3.7 Sanayi ve depo bölgesi
```
Isometric view of a small industrial area: brick and metal warehouses with roll-up doors, loading docks with trucks being loaded with crates of fruit, vegetables and bread, forklifts, stacks of wooden pallets, a bakery factory with a chimney, a fuel station, a car repair garage with a car on a lift, a parking lot full of delivery trucks, chain-link fences, a railway siding with freight wagons.
```

### 3.8 Genişleme bölgesi (gelecek için)
```
Isometric view of the empty land across the river reserved for future city growth: flat grassland with dirt roads, survey stakes, a few construction site fences, a lone crane, piles of building materials, a site office container, and soft fog hiding the far edge of the map. Leave large empty areas for future buildings.
```

---

## 4. Sokak görünümü promptları (yandan, karakterin yürüdüğü sahneler)

Hepsinin sonuna STİL BLOĞU + `side view, orthographic, eye level, 2.5D layered street scene` + `--ar 21:9`.
Katman düzeni plandakiyle aynı: önde kaldırım, ortada yol, arkada karşı kaldırım ve binalar.

### 4.1 Çarşı caddesi — yandan
```
Wide side-view panorama of a shopping street for a 2D side-scrolling game. Foreground: a wide sidewalk with cafe tables, chairs and parasols, people drinking tea, a bakery front with an open door and bread in the window, a supermarket entrance with fruit crates, a blank sandwich-board sign, a street lamp, a trash bin, a tree in a round grate. Middle: a two-lane road with a yellow taxi, a small bread delivery truck and a bicycle, a crosswalk with a traffic light. Background: the opposite sidewalk with pedestrians, and a row of colorful 3-4 storey buildings with balconies, awnings and blank signs. Far background: soft silhouettes of skyscrapers. Daytime.
```

### 4.2 Müstakil ev sokağı — yandan
```
Wide side-view panorama of a quiet suburban street for a 2D side-scrolling game. Foreground: sidewalk with grass strip, mailboxes, a fire hydrant, a street lamp, a fruit tree with apples. Middle: a narrow residential road with a parked car. Background: a row of detached houses with front gardens, fences, hedges, a dog in a yard, one empty plot with a blank for-sale sign. Far background: green hills and the edge of a forest.
```

### 4.3 Gökdelen caddesi — yandan
```
Wide side-view panorama of a downtown avenue for a 2D side-scrolling game. Foreground: wide modern sidewalk with benches, a metro entrance with stairs going down, a bus stop shelter, office workers walking, a food cart. Middle: a four-lane avenue with a bus, taxis and a police car, traffic lights and a crosswalk. Background: the bases of glass skyscrapers with lobbies, revolving doors and a hotel entrance with a doorman; tall towers rising out of frame.
```

### 4.4 Nehir kıyısı ve balıkçılar — yandan
```
Wide side-view panorama of a riverside promenade for a 2D side-scrolling game. Foreground: stone promenade with railings, benches, a street lamp, an old fisherman on a folding stool with a long rod, a bucket and a thermos of tea, another man casting a line, a cat waiting for fish, seagulls on the railing. Middle: the calm river with a small rowing boat and a ferry. Background: a stone arch bridge with cars crossing, and the foggy far bank.
```

### 4.5 Orman bisiklet yolu — yandan
```
Wide side-view panorama of a forest bicycle path for a 2D side-scrolling game. Foreground: tall tree trunks, ferns, mushrooms, a wooden bench and a direction post with blank signs. Middle: a winding bike path with a cyclist and a jogger, a small wooden bridge over a stream. Background: layered forest depth with lighter trees in the distance, sun rays through the leaves, a deer.
```

### 4.6 Polis merkezi önü — yandan
```
Wide side-view panorama of a street with a police station for a 2D side-scrolling game. Foreground: sidewalk with a police officer talking to a citizen, a bicycle rack, a street lamp. Middle: road with a parked police car with lights off, a passing taxi. Background: the police station facade with stairs, a flag, blue details and a blank sign, next to a small fire station with an open garage and a red fire truck.
```

---

## 5. Oyunda kullanılacak tek tek parçalar (asset)

Bunlar konsept değil, oyuna doğrudan konabilecek parçalar. Her birini **tek nesne, düz
beyaz ya da düz renkli arka plan** ile üret (sonra arka planı silmek kolay olsun).
Sonuna STİL BLOĞU + `single isolated object, centered, plain white background, full object visible` + `--ar 1:1`.

| Grup | Prompt başlangıcı (sonuna nesneyi yaz) |
|---|---|
| Evler | `side view game asset of a detached family house, front facade,` + ev tipi (cottage / two-storey with garage / modern flat roof / old house with chimney) |
| Dükkânlar | `side view game asset of a shop ground floor facade with awning and blank sign,` + dükkân (bakery / supermarket / cafe / pharmacy / flower shop) |
| Gökdelen | `side view game asset of a glass skyscraper base and lower floors,` + renk |
| Sokak eşyası | `game asset sheet of street furniture: street lamp, bench, trash bin, fire hydrant, mailbox, bus stop, bicycle rack, blank sandwich board, cafe table with two chairs and parasol` |
| Trafik | `game asset sheet of traffic lights from the side: car traffic light, pedestrian light, crosswalk button pole, each shown red, yellow and green` |
| Ağaçlar | `game asset sheet of stylized trees in growth stages from sapling to mature:` + tür (apple / orange / cherry / pine / oak) |
| Araçlar | `side view game asset of a` + araç (yellow taxi / police car / small bread delivery truck with crates / fruit truck with crates of tomatoes and oranges / city bus / bicycle) + `, wheels as separate clean circles` |
| Köprü | `side view game asset of a stone arch bridge section, tileable horizontally` |
| İskele | `side view game asset of a wooden fishing pier section, tileable horizontally` |

Not: Karakterler (fırıncı, polis, balıkçı…) ayrı konu. Plandaki gibi parçalı iskeletle
hareket edecekleri için baş, gövde, kol ve bacak ayrı çizilmeli. Onun promptlarını
karakter aşamasında ayrıca hazırlarız.

---

## 6. Hikâye modları: aynı şehir, farklı atmosfer

Ana harita ya da sokak promptunu aynen kullan, **sonuna aşağıdakilerden birini ekle**.
Böylece bina ve yollar aynı kalır, sadece hava, ışık ve detaylar değişir.

| Mod | Eklenecek metin |
|---|---|
| Gece (normal) | `at night, warm street lamps glowing, lit windows, car headlights, starry sky, calm mood` |
| Mafya | `at night in the rain, wet reflective streets, neon glow from cafes, long black sedans parked in a dark alley, men in suits and hats standing under a streetlamp, tense noir mood, mostly dark with warm and red accents` |
| Kurtadam | `at night under a huge full moon, thick fog rolling out of the forest, empty streets, a few lit windows, howling silhouette on a hill, claw marks on a fence, mysterious bluish moonlight` |
| Zombi | `abandoned city at dusk, overturned cars, boarded up windows, scattered papers, broken street lamps flickering, dark green fog, slow shambling silhouettes in the distance, eerie but still cartoonish and not gory` |
| Sabah | `early morning, soft golden sunrise light, long shadows, bakery lights on, delivery trucks arriving, few people` |
| Kış | `winter, snow on roofs and trees, snowy sidewalks, people in coats and scarves, warm light from windows` |

İpucu: kurtadam ve zombi modlarında `cartoonish, not gory` kalsın; dil öğrenme oyunu
olduğu için kan ve vahşet göstermemek her yaş grubunu korur.

---

## 7. Sıra önerisi

1. Ana harita (§2) — 4–8 varyasyon üret, en beğendiğini **stil referansı** yap.
2. Bölgeler (§3) — stil referansıyla, birer birer.
3. Sokak görünümleri (§4) — önce çarşı caddesi (fırın, market ilk mekânlar).
4. Hikâye modları (§6) — çarşı caddesi üzerinde dene.
5. Parçalar (§5) — oyuna girecek olanlar.

Beğendiğin görselleri `docs/konsept/` altına koyarsan (ör. `harita_v1.png`), sonraki
promptları ve oyunun gerçek düzenini onlara göre birlikte netleştiririz.
