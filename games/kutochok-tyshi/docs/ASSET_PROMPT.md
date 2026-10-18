# Visual asset generation prompts

Mode: built-in `imagegen`.

This file retains the original generation prompts and records the current
full-arena background, heroine battery poses, strong-crowd replacement, and
special Roach horse. The character and cat sheets are strict 2x2 atlases,
while the intermediate heroine poses, strong visitor, and Roach are standalone
sprites; runtime code extracts their subjects and creates lightweight
procedural projectiles and UI effects. Pseudo-isometry is limited to the
artwork. It does not change the orthogonal grid or simulation.

The generated atlas PNGs, standalone crowd, and Roach PNG are RGB images with a
baked near-white checkerboard instead of true alpha despite the transparency
constraint. `AtlasFrame.ts` therefore removes only edge-connected near-white
matte pixels while extracting each subject, preserving enclosed highlights on
characters and spell effects.

## Social character atlas

Final project asset: `public/assets/social-character-atlas-v1.png`.

The original bottom-right karaoke organizer is retained in this atlas and in
the prompt below for provenance, but it is now a legacy strong-visitor visual.
Runtime rendering uses the standalone crowd asset documented in the next
section for strong enemies.

```text
Use case: stylized-concept
Asset type: 2x2 transparent game character sprite atlas
Primary request: four isolated full-body character sprites for a whimsical 2D tower-defense game about an introvert protecting her quiet evening
Scene/backdrop: genuinely transparent background
Subject: exact 2x2 grid. Top-left: introverted anime-inspired young adult woman in an oversized lavender hoodie, cozy socks and headphones, holding an open book close to her chest, shy calm expression. Top-right: friendly casual visitor carrying a takeaway coffee and a small invitation card. Bottom-left: energetic invitation courier jogging with a phone and a bundle of colorful flyers. Bottom-right: exuberant karaoke organizer carrying a small megaphone and microphone.
Style/medium: polished cartoon-comic game sprites, thick dark-plum ink outlines, soft cel shading, warm pastel colors, playful expressive silhouettes, slightly isometric three-quarter top-down view, smooth illustration rather than pixel art
Composition/framing: exactly four equal square cells, one character centered per cell, consistent scale, all characters oriented toward the lower edge of the sheet, each fills about 72 percent of its cell, generous transparent separation, no overlap between cells
Constraints: transparent PNG; no grid lines; no borders; no text; no letters on props; no watermark; no logos; no extra characters; readable at small game-sprite size
```

## Heroine social-battery poses

Mode: built-in `imagegen`.

Final project assets:

- `public/assets/heroine/introvert-girl-state-75-v1.png`
- `public/assets/heroine/introvert-girl-state-50-v1.png`
- `public/assets/heroine/introvert-girl-state-25-v1.png`

Image 1 was `social-character-atlas-v1.png`, with only its upper-left heroine
used as the identity, outfit, proportions, and rendering-style reference.
Image 2 was `bonus-hide-under-blanket.png`, used as the emotional and blanket
end-state reference. The established atlas heroine remains the 100% pose, and
the exact blanket-card illustration remains the 0% pose, so only the 75%, 50%,
and 25% transitions needed new art. The generated PNGs retain the usual baked
near-white checker matte. Runtime code converts each standalone source, plus
the 0% blanket source, into a cleaned 96x96 Canvas texture through
`drawAtlasFrame`.

### 75% pose

```text
Use case: stylized-concept
Asset type: 2D game character sprite, social-battery 75% state
Input images: Image 1 is the identity, outfit, proportions, rendering-style, and three-quarter pseudo-isometric reference; use only the introvert girl in the upper-left quadrant. Image 2 is the emotional end-state reference.
Primary request: Create the same introvert girl at an early, subtle stage of social exhaustion, clearly between her calm 100% sprite and the blanket breakdown. She is still standing and holds the same dark-purple book closer to her chest; shoulders slightly raised, posture a little guarded, small uneasy expression, faint tiredness under the eyes.
Subject invariants: identical brunette hair bun and loose bangs, lavender over-ear headphones, heart hair clip, oversized lilac hoodie, pale patterned socks, purple slippers, same anime-cartoon face and body proportions.
Style/medium: polished cozy cartoon-comic 2D game sprite, slight pseudo-isometric three-quarter view, warm hand-painted shading, bold clean silhouette, visually consistent with both references.
Composition/framing: one centered full-body character only, generous transparent padding, compact silhouette readable at 70x70 pixels.
Constraints: genuinely transparent background; no checkerboard baked into the image; no text; no UI; no frame; no other people; no cats; no furniture; no watermark. Preserve the character identity and palette. Do not crop any part of the character.
```

### 50% pose

```text
Use case: stylized-concept
Asset type: 2D game character sprite, social-battery 50% state
Input images: Image 1 is the identity, outfit, proportions, rendering-style, and three-quarter pseudo-isometric reference; use only the introvert girl in the upper-left quadrant. Image 2 is the emotional end-state reference.
Primary request: Create the same introvert girl at a clearly visible middle stage of social exhaustion, halfway between her calm standing 100% sprite and hiding under the blanket. She remains standing but is noticeably hunched and withdrawn, eyes tired and worried, holding the same closed dark-purple book against her torso like a shield with crossed arms; headphones still on.
Subject invariants: identical brunette hair bun and loose bangs, lavender over-ear headphones, heart hair clip, oversized lilac hoodie, pale patterned socks, purple slippers, same anime-cartoon face and body proportions.
Style/medium: polished cozy cartoon-comic 2D game sprite, slight pseudo-isometric three-quarter view, warm hand-painted shading, bold clean silhouette, visually consistent with both references.
Composition/framing: one centered full-body character only, generous transparent padding, compact silhouette readable at 70x70 pixels.
Constraints: genuinely transparent background; no checkerboard baked into the image; no text; no UI; no frame; no other people; no cats; no furniture; no blanket yet; no watermark. Preserve the character identity and palette. Do not crop any part of the character.
```

### 25% pose

```text
Use case: stylized-concept
Asset type: 2D game character sprite, social-battery 25% state
Input images: Image 1 is the identity, outfit, proportions, rendering-style, and three-quarter pseudo-isometric reference; use only the introvert girl in the upper-left quadrant. Image 2 is the emotional end-state reference and supplies the same dusty-lavender blanket design.
Primary request: Create the same introvert girl at the final transition stage before she fully hides under the blanket. She is crouched low in a compact curled posture, exhausted and teary-eyed, shoulders collapsed, the same dusty-lavender blanket wrapped around her shoulders and body but her face, headphones, hoodie, lower legs, and slippers remain clearly visible. She clutches the blanket closed; the book is no longer visible. The pose must read as 25% social battery, not complete defeat.
Subject invariants: identical brunette hair bun and loose bangs, lavender over-ear headphones, heart hair clip, oversized lilac hoodie visible under the blanket, pale patterned socks, purple slippers, same anime-cartoon face and proportions.
Style/medium: polished cozy cartoon-comic 2D game sprite, slight pseudo-isometric three-quarter view, warm hand-painted shading, bold clean silhouette, visually consistent with both references.
Composition/framing: one centered full-body character only, generous transparent padding, compact silhouette readable at 70x70 pixels.
Constraints: genuinely transparent background; no checkerboard baked into the image; no text; no UI; no frame; no other people; no cats; no furniture; no lamp; no tissue box; no watermark. Preserve the character identity and palette. Do not crop any part of the character.
```

The selected 25% source then received one constrained cleanup edit:

```text
Use case: precise-object-edit
Asset type: 2D game character sprite, social-battery 25% state
Input images: Image 1 is the edit target.
Primary request: Remove only the soft gray cast shadow and any floor haze beneath the character. Replace that area with genuine transparency.
Constraints: Preserve the character pixel-for-pixel as closely as possible: same identity, face, expression, pose, proportions, blanket, headphones, hoodie, socks, slippers, colors, outline, framing, and size. Do not redesign or redraw the subject. Genuinely transparent background; no checkerboard baked into the image; no text; no frame; no watermark.
```

## Twitter Fight bonus illustration

Mode: built-in `imagegen`.

Final project asset: `public/assets/bonuses/bonus-twitter-fight.png`.

The existing blanket bonus supplied the heroine identity, lavender outfit,
headphones, and cozy emotional tone. The Social Debt card supplied the current
bonus-card rendering style and composition density. The generated 1254x1254
RGB PNG intentionally matches the established baked near-white checker matte;
`BonusScene` displays it inside the same illustration bed as the other cards.

```text
Use case: stylized-concept
Asset type: square bonus-card illustration for a cozy cartoon-comic 2D game
Input images: Image 1 is the heroine identity, lavender outfit, headphones, and emotional-style reference. Image 2 is the current polished bonus-card illustration and cozy rendering-style reference.
Primary request: Show the same introverted heroine in a lavender hoodie and headphones seated in a cozy corner, angrily arguing on her phone during an overwhelming social-media fight. Surround the phone with a dense storm of contrasting red and blue reply arrows, notification marks, angry reaction bubbles, scribbles, and comic impact symbols. A worried wizard cat tries to calm her beside a stack of books, tea, and a candle. The scene should immediately read as a noisy online argument and as a risky negative bonus while remaining part of the established cozy world.
Style/medium: polished anime-inspired cartoon-comic game illustration, thick dark-plum outlines, warm hand-painted shading, lavender/rose/navy palette, playful expressive shapes, slight pseudo-isometric perspective, readable at small card size.
Composition/framing: one centered compact vignette with the heroine and phone as the focus, strong circular silhouette, generous outer margin, no cropping.
Constraints: no readable text, no letters, no platform logo, no watermark, no photorealism, no extra people, preserve the heroine identity and established cat/book/cozy motifs.
```

## Strong social-crowd sprite

Mode: built-in `imagegen`.

Current project asset: `public/assets/social-crowd-strong-v2.png`.

This standalone sprite replaces only the strong visitor's presentation. The
complete crowd is rendered as one sprite for one domain enemy, so it must read
as a single compact unit rather than several separately spaced characters.

```text
Use case: stylized-concept
Asset type: standalone transparent game-character sprite
Primary request: one compact noisy crowd representing a strong social visitor in a whimsical 2D tower-defense game about an introvert protecting her quiet evening
Scene/backdrop: genuinely transparent background
Subject: exactly three entirely new social-event visitors tightly overlapping into one cohesive unit: one cheerful person with a small purple megaphone, one excited person with a handheld microphone, and one party host waving colorful invitation cards; lively open-mouth expressions and energetic social-event gestures; unmistakably a crowd rather than one person
Style/medium: polished cartoon-comic game sprite, thick crisp dark-plum ink outlines, soft cel shading, warm pastel colors, playful exaggerated expressions, slightly isometric three-quarter top-down view, smooth illustration rather than pixel art, matching social-character-atlas-v1.png
Composition/framing: one centered full-body crowd cluster with overlapping figures and one shared lower-right directional stance, no detached people, strong outer silhouette, fills about 84 percent of a square canvas, readable as a noisy crowd at 62 by 58 gameplay pixels, clean margin, no cropping
Constraints: transparent PNG if possible, otherwise a uniform near-white edge-removable matte; exactly one compact three-person crowd cluster; no separate sprite frames; no grid lines; no border; no floor or scenery; no text; no readable letters on props; no watermark; no logos; no cats; no weapons; no headphones, book, oversized lavender hoodie, or copied character from the source atlas; preserve a single-unit silhouette and clear left-right facing for runtime mirroring
```

## Special Roach horse sprite

Mode: built-in `imagegen` with the user-supplied horse image used only as a
pose/comedy reference.

Current project asset: `public/assets/social-roach-special-v1.png`.

The generated 1254x1254 PNG has the same baked near-white checker matte as the
other generated character sources. Runtime extracts it into a 192x192 Canvas
texture through `drawAtlasFrame`, then displays it at 56x68 pixels. It is an
original right-facing horse illustration; the reference's background, plaque,
text, and video UI are not reproduced.

```text
Use case: stylized-concept
Asset type: standalone enemy sprite for a cozy cartoon 2D tower-defense game
Primary request: Create an original humorous enemy sprite named “Плотка”: one brown horse performing an absurd handstand-like gallop on its two front legs, with both hind legs kicked high over its back. Use Image 1 only as pose/comedy reference, not as an edit or copy.
Input images: Image 1 is composition and pose reference only.
Subject: a single compact brown horse, native-facing right, head low at the lower-right, forelegs supporting the body, rump and hind legs raised high toward the upper-left, scruffy dark mane and tail, small cozy purple saddle blanket, tired deadpan eyes as if this is completely normal.
Style/medium: polished 2D cartoon-comic game illustration matching cozy anime-inspired character art; slight pseudo-isometric three-quarter top-down view; thick clean dark-brown outlines; soft cel shading; crisp macro details that remain recognizable at roughly 60 pixels tall.
Composition/framing: centered full-body silhouette in a square canvas, generous transparent padding, no cropping; strong readable inverted-horse silhouette.
Color palette: warm chestnut brown, dark chocolate outlines, muted lavender and cream accents.
Lighting/mood: soft warm cozy lighting, playful deadpan humor.
Constraints: genuinely transparent background; exactly one horse with anatomically coherent four legs despite the absurd pose; no cast shadow because the game adds its own; no text, label, platform, border, UI, logo, checkerboard, or watermark.
Avoid: photorealism, blur, painterly softness, extra limbs, detached limbs, humans, scenery, ground plane, black pedestal, letters.
```

## Wizard-cat atlas

Final project asset: `public/assets/wizard-cat-atlas-v1.png`.

```text
Use case: stylized-concept
Asset type: 2x2 transparent wizard-cat sprite and spell atlas
Primary request: three distinct wizard cats and one magic projectile for a whimsical 2D tower-defense game
Scene/backdrop: genuinely transparent background
Subject: exact 2x2 grid. Top-left: small blue-gray tuxedo cat wizard wearing a teal pointed hat and holding a star-tipped wand, calm precise caster. Top-right: quick orange tabby wizard cat with a short mustard cape, lightning sparks around both front paws, lively rapid caster. Bottom-left: large fluffy plum-colored Maine Coon wizard with a moon hat and an open spellbook, powerful heavy caster. Bottom-right: a single right-facing magical comet projectile made of glowing pages, stars and a tiny crescent, no cat.
Style/medium: polished cartoon-comic game sprites, thick dark-plum ink outlines, soft cel shading, cozy pastel palette, playful expressions, slightly isometric three-quarter top-down view, smooth illustration rather than pixel art
Composition/framing: exactly four equal square cells, one subject centered in each, cats face toward the top edge, consistent scale and strong silhouettes, each fills about 75 percent of its cell, projectile points horizontally right, generous transparent separation
Constraints: transparent PNG; no grid lines; no borders; no text; no watermark; no logos; no extra animals or objects; readable at 30 to 40 pixels
```

## Cozy floor

Final project asset: `public/assets/cozy-floor-v1.png`.

This original seamless-tile prompt is retained for provenance. The current
gameplay background is the full-arena v2 asset documented in the next section.

```text
Use case: stylized-concept
Asset type: seamless tileable game ground texture
Primary request: a cozy light floor texture for a whimsical cartoon game set in an introvert's reading room
Scene/backdrop: pale cream and blush wooden parquet with a very subtle woven-rug motif, tiny occasional star and leaf doodle shapes embedded in the pattern
Style/medium: smooth 2D cartoon-comic environment texture, thick-but-subtle hand-inked accents, soft cel shading, slightly isometric top-down lighting, warm pastel palette
Composition/framing: square texture with evenly distributed low-contrast detail and no central focal object
Lighting/mood: bright cozy afternoon, calm and inviting
Constraints: must tile seamlessly on all four edges; no objects sitting on the floor; no books; no people; no cats; no text; no watermark; no border; low contrast enough for units to remain readable
```

## Full-arena cozy floor

Mode: built-in `imagegen`.

Current project asset: `public/assets/cozy-arena-floor-v2.png`.

The image is drawn once and scaled to the complete 1080x1080 arena. It is not
repeated per logical grid cell.

```text
Use case: stylized-concept
Asset type: single full-arena game floor background for a 1080x1080 2D tower-defense battlefield
Primary request: one cohesive cozy reading-room floor illustration spanning the entire square arena, designed as a continuous background rather than a repeating tile
Scene/backdrop: pale cream and blush parquet flooring with broad softly defined rug-like woven zones, gentle geometric floorboard groupings, and sparse tiny star and leaf doodles integrated into the surface
Style/medium: polished 2D cartoon-comic game environment, soft cel shading, subtle dark-plum hand-inked accents, warm pastel palette, shallow pseudo-isometric three-quarter top-down lighting, matching whimsical wizard cats and book-stack barriers
Composition/framing: square edge-to-edge arena background; calm low-detail center for the protected character; medium-scale floor patterns distributed across the arena; floorboard and woven motifs should span roughly 4 to 8 logical 30-pixel cells so details remain readable when scaled to 1080x1080; corners and outer zones may have slightly richer pattern variation; no single focal object
Lighting/mood: bright cozy afternoon, peaceful, inviting, low contrast beneath gameplay units
Constraints: one continuous non-tileable image; no visible construction grid; no characters; no cats; no books; no furniture; no loose objects; no text; no watermark; no logo; no outer frame or border; avoid tiny repetitive micro-patterns; avoid one giant oversized motif; preserve clear unit readability
```

## Book-stack texture

Mode: built-in `imagegen`.

Current project asset: `public/assets/book-stack-texture-v2.png`.

The source uses four or five full-width macro book layers rather than a dense
microtexture. Runtime code draws each 30x30 logical autotile mask into a
120x120 Canvas texture, so the same art remains sharp in the 58px HUD preview
and at the camera's 2.5x maximum zoom.

```text
Use case: stylized-concept
Asset type: square seamless source texture for high-resolution connected book-wall autotiles in a 2D tower-defense game; it will be rendered at 120 px internally and displayed at 30–75 px
Primary request: an instantly recognizable, simple wall made from stacks of books, readable both at normal arena view and close camera zoom
Scene/backdrop: books only, edge-to-edge; no floor, shelf, table, scenery, or empty dark background
Subject: three to four oversized horizontal books stacked in clear layers, each book a large simple slab with a colored cover, a thick cream page block, visible spine, one occasional bookmark, and slightly offset ends; each book should occupy roughly 20–30 percent of the tile height; broad cover/page bands extend cleanly toward tile edges so connected tiles can visually continue
Style/medium: polished cozy cartoon-comic 2D game texture, thick crisp dark-plum outlines, smooth cel shading, shallow top-down three-quarter pseudo-isometric view, strong silhouette, warm pastel colors
Composition/framing: square full-bleed tile; sparse large shapes; unmistakable book stack at thumbnail size; balanced muted coral, teal, mustard, lavender, and cream; no single tiny focal detail
Lighting/mood: bright cozy afternoon, high local readability, restrained highlights
Constraints: seamless on all four edges; crisp high-resolution edges; no text or readable titles; no letters; no people; no cats; no shelves; no decorative micro-book mosaic; no tiny repetitive details; no blur; no photographic realism; no watermark; no logo; no outer frame. Prioritize recognizability at 30 pixels over texture complexity.
```

## Kitten support tower

Mode: built-in `imagegen`.

Current project asset: `public/assets/kitten-defense-v1.png`.

The source has a near-white generated matte. Runtime extraction uses the same
edge-connected matte cleanup as the wizard-cat atlas before creating the 96px
transparent gameplay texture.

```text
Use case: stylized-concept
Asset type: transparent 2D game tower sprite for a cozy tower-defense game
Primary request: Create one original defense character named “Кошенятко”: an impossibly cute tiny cream-and-peach kitten sitting upright with its front paws close together, huge glossy amber eyes, a small pink heart collar, round cheeks, soft fluffy ears, and a curled tail. It does not carry a weapon and must look harmless and lovable.
Input images: the existing wizard-cat atlas is a style and rendering reference; match its polished cartoon-comic finish, bold dark plum outlines, warm soft shading, and shallow pseudo-isometric three-quarter view without copying a specific cat.
Composition/framing: one isolated full-body kitten centered in a square canvas, slight top-down three-quarter view, compact silhouette, generous transparent margin, designed to remain recognizable at 30x30 gameplay size and 58x58 HUD size.
Color palette: cream, peach, blush pink, warm amber, subtle lavender accents.
Constraints: genuinely transparent background; one kitten only; no scenery; no weapons; no spell projectile; no text; no logo; no watermark; no frame; crisp readable silhouette and oversized facial features.
```

## Sheer Heart Attack mine

Mode: built-in `imagegen`.

Current project asset: `public/assets/sheer-heart-attack-mine-v1.png`.

The user-supplied round tracked character was used only as a broad silhouette
reference. The project asset is an original teal, heart-powered, cat-themed
mechanical mine and is matte-cleaned into a 96px runtime texture.

```text
Use case: stylized-concept
Asset type: transparent 2D game mine sprite for a cozy cartoon tower-defense game
Primary request: Create one original autonomous mine named “Sheer Heart Attack”: a compact round armored clockwork bomb-creature on two tiny tank treads, with layered teal-blue metal plates, a prominent glossy rose-pink heart-shaped dome on top, a small cream cat-skull emblem on the front, and one blinking heart-shaped warning light. It should feel comically overpowered but still fit a cozy magical reading-room game.
Input images: the attached mechanical character is only a broad silhouette reference (round armored body, treads, top dome); do not copy its exact armor layout, skull design, colors, or markings. The wizard-cat atlas is the project style reference for bold plum outlines, polished cartoon-comic shading, warm accents, and shallow pseudo-isometric rendering.
Composition/framing: one isolated mine centered in a square canvas, top-down three-quarter view so the top dome and both treads read clearly, compact bold silhouette, generous transparent margin, recognizable at 30x30 gameplay size and 58x58 HUD size.
Color palette: teal-blue and soft navy armor, rose-pink heart core and warning light, cream cat-skull emblem, warm brass rivets, dark plum outlines.
Constraints: genuinely transparent background; one mine only; original design; no human skull; no letters; no text; no logo; no watermark; no frame; no explosion in the sprite; crisp large shapes, avoid tiny mechanical clutter.
```
