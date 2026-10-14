# Model teslim şartnamesi (karakter + oda)

Bu belge sanatçıya (ya da modeli hazırlayan kişiye) verilecek. Animasyon motoru
hazır: iskeleti IK ile kendisi sürer, yüzü ARKit blendshape'leriyle konuşturur,
saçı yay kemikleriyle fiziğe sokar. **Sanatçıdan animasyon klibi istenmiyor**,
sadece aşağıdaki kurallara uyan *rig'li model* isteniyor.

## 1. Karakter — `character.glb`

| Konu | Kural |
|---|---|
| Dosya | glTF 2.0 binary (`.glb`), tek dosya |
| Birim / ölçek | metre; boy 1,55–1,75 m (motor kalça yüksekliğine göre normalize eder) |
| Yön | Yüz **+Z**'ye bakmalı, **+Y** yukarı (Blender'da karakter **−Y**'ye bakar, glTF dışa aktarıcı bunu +Z'ye çevirir) |
| Dinlenme pozu | T-poz veya A-poz; dışa aktarılan sahne bu pozda olmalı |
| Poligon | Karakter ≤ 40k üçgen (saç dâhil), göz/diş/dil ayrı mesh olabilir |
| Kemik | ≤ 80 kemik; parmaklar 3 eklemli |
| Malzeme | ≤ 4 malzeme, PBR (Principled BSDF), dokular ≤ 2048 px (tercihen 1024), WebP |
| Animasyon | Gerekmiyor (varsa yok sayılır) |

### 1.1 Kemik isimleri
Aşağıdaki adlandırmalardan **herhangi biri** otomatik tanınır:
- **Mixamo** (`mixamorig:Hips`, `LeftArm`, `LeftForeArm`, `LeftHandIndex1`…) — en kolay yol
- **Character Creator 3/4** (`CC_Base_Hip`, `CC_Base_L_Upperarm`…)
- **VRM / Unity Humanoid** (`Hips`, `LeftUpperArm`, `LeftLowerArm`, `LeftIndexProximal`…)
- Bizim adlar: `hips, spine, chest, neck, head, jaw, shoulder.L, upperArm.L, foreArm.L, hand.L, thumb1.L … pinky3.L, thigh.L, shin.L, foot.L, toes.L, eye.L` (+ `.R`)

Zorunlu: `hips, spine, neck, head, upperArm, foreArm, hand, thigh, shin, foot` (iki taraf).
İsteğe bağlı ama önerilen: `chest, shoulder, parmaklar, toes, eye.L/R (göz kemiği), jaw`.
Farklı bir adlandırma kullanılırsa modelin yanına `character.map.json` konur:
```json
{ "bones": { "hips": "pelvis_jnt", "upperArm.L": "arm_L_01" }, "yaw": 0 }
```

### 1.2 Yüz — ARKit 52 blendshape (shape key)
Konuşma (dudak senkronu), göz kırpma, bakış ve duygular bunlarla yapılır.
**Minimum set** (bunlar olmadan dudak senkronu çalışmaz):
```
jawOpen  mouthClose  mouthFunnel  mouthPucker
mouthSmile_L/R  mouthFrown_L/R  mouthStretch_L/R
mouthUpperUp_L/R  mouthLowerDown_L/R  mouthRollLower  mouthPress_L/R
eyeBlink_L/R  eyeSquint_L/R  eyeWide_L/R
browInnerUp  browDown_L/R  browOuterUp_L/R  cheekSquint_L/R  tongueOut
```
Bakış için ya `eye.L/eye.R` kemikleri **ya da** `eyeLookUp/Down/In/Out_L/R` shape'leri.
İsimlendirme esnek: `mouthSmile_L`, `mouthSmileLeft`, `MouthSmileL` hepsi tanınır.
**Önemli:** Dişler, dil ve kirpikler ayrı mesh ise aynı shape key'leri (en az
`jawOpen`, `tongueOut`, `eyeBlink_*`) onlarda da taşımalı **veya** `jaw` kemiğine bağlı olmalı.

Hızlı üretim yolları:
- **Blender + FaceIt eklentisi**: herhangi bir kafa için 52 ARKit shape'ini yarı otomatik üretir.
- **Character Creator 4** (+ ARKit/ExPlus profili) doğrudan uyumlu dışa aktarır.
- **Polywink** (hizmet): modeli gönderirsin, 52 shape'i hazırlayıp geri yollar.

### 1.3 Saç ve aksesuar fiziği (isteğe bağlı)
Adında `hair`, `bang`, `lock`, `strand`, `pony`, `spring` geçen kemik zincirleri
motor tarafından otomatik olarak yay kemiği fiziğine sokulur (rüzgârda dalgalanır,
kafa hareketinde salınır). Her tutam için kafaya bağlı 2–4 kemiklik zincir yeterli.

### 1.4 Görünüm hedefi
Referans: stilize, "feature animation" görünümü (büyük ifadeli gözler, yumuşak
yüz hatları, kalın dalgalı kahverengi saç, lacivert ekose pijama, terlik).
Gözlerde parlak kornea + iris dokusu; ciltte hafif yanak kızarıklığı.

## 2. Oda — `room.glb` (isteğe bağlı)
Verilmezse prosedürel oda kullanılır. Verilirse statik oda tek dosya olur ve
etkileşimli noktalar **boş nesne (Empty)** olarak, şu adlarla işaretlenir:

| Empty adı | Anlamı |
|---|---|
| `chair` | Sandalye kökü (karakter buraya oturur; sandalye mesh'i bu empty'nin çocuğu olmalı, kalkarken geri itilir) |
| `desk_top` | Masa yüzeyinin merkezi (y = masa üstü yüksekliği) |
| `phone_rest`, `mug`, `laptop`, `notebook` | Masadaki eşyaların yerleri |
| `lamp_bulb` | Lamba ampulü (dinamik ışık buradan yanar) |
| `guitar_stand` | Gitarın durduğu yer |
| `window_sash` | Açılan pencere kanadı; **pivotu menteşede** olmalı, kanat mesh'i bunun çocuğu |
| `window_handle` | Kanattaki kol (window_sash'ın çocuğu) |
| `window_stand` | Karakterin pencereyi açarken durduğu nokta (zemin) |
| `curtain_L`, `curtain_R` | Perde rayındaki üst-sol köşe; ölçek X = perde genişliği, Y = boyu |
| `cat_bed`, `cat_desk` | Kedinin uyuduğu yer ve masada oturduğu yer |
| `camera`, `camera_target` | Varsayılan kamera konumu ve baktığı nokta |

Işık: statik ışığı Blender'da **Cycles ile base color'a pişirin** (bake), oda
malzemelerini "unlit"e yakın tutun; dinamik olarak yalnızca masa lambası ve
pencere ışığı motor tarafından eklenir. Bütçe: oda ≤ 60k üçgen, ≤ 8 malzeme
(atlas önerilir), dokular ≤ 2048 px.

## 3. Dışa aktarma ve optimizasyon
1. Blender → *File › Export › glTF 2.0*: Format **glb**, *Apply Modifiers*,
   *Shape Keys* ✔, *Skinning* ✔, *Animation* ✘, *+Y Up* ✔.
2. Sıkıştırma (gltf-transform):
   ```bash
   npx @gltf-transform/cli optimize character.glb character.glb --compress meshopt --texture-compress webp --texture-size 1024
   ```
3. Dosyayı `web/public/assets/character.glb` (ve varsa `room.glb`) olarak koy,
   `tool/build_web.sh` ile Flutter'a kopyala.
4. Kontrol: tarayıcıda `npm run dev` → `http://localhost:5173/?hud=1` ; konsolda
   `[avatar] loaded …` ve `ARKit shapes: N/52` satırları görünür. Eksik zorunlu kemik
   varsa hangileri olduğu yazılır ve prosedürel karaktere düşülür.

Test etmek için hazır örnek: Mixamo'dan indirilen herhangi bir karakter
(glb'ye çevrilmiş) gövde için doğrudan çalışır; yüz için ARKit shape'leri gerekir.
