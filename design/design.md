# Pixory Visual Design Tokens

> Source: extracted from the latest Pixory mobile UI visual board.  
> Style direction: warm cream, muted gold, soft sky-blue imagery, editorial serif typography, delicate cards, calm local-first asset management product.

---

## 1. Design Personality

Pixory should feel like a **warm, refined, image-first IP asset archive**.

Keywords:

- warm cream
- soft gold
- calm blue
- editorial typography
- light luxury
- gentle shadows
- rounded cards
- image-led layout
- quiet but designed
- refined, not flashy
- artistic but still usable

Avoid:

- default system UI feeling
- heavy blue SaaS style
- cyber / neon / dark tech style
- excessive glassmorphism
- random gradients
- overly plain typography
- crowded card stacks
- thick shadows
- cold gray enterprise dashboard feeling

---

## 2. Color Tokens

### 2.1 Core Palette

| Token | Hex | Usage |
|---|---:|---|
| `color.background.app` | `#F8F1E7` | App global warm background |
| `color.background.soft` | `#FBF6EE` | Large page background / board background |
| `color.surface.primary` | `#FFFCF7` | Main cards, panels, screen surface |
| `color.surface.secondary` | `#F6EFE4` | Subtle grouped sections |
| `color.surface.elevated` | `#FFF9F0` | Floating cards, modal panels |
| `color.surface.sunken` | `#F1E7D8` | Inactive segmented controls, subtle input fill |
| `color.primary` | `#B99055` | Primary gold / active state |
| `color.primary.light` | `#D8BE8B` | Active tab highlight, soft badges |
| `color.primary.dark` | `#7C5A2E` | Pressed gold, strong accent text |
| `color.primary.weak` | `#EFE2CB` | Gold chip background |
| `color.text.primary` | `#26313B` | Main text |
| `color.text.heading` | `#17212B` | Display titles, page titles |
| `color.text.secondary` | `#67717A` | Body secondary text |
| `color.text.tertiary` | `#9BA2A8` | Captions, disabled hints |
| `color.text.inverse` | `#FFFFFF` | Text on gold / image overlay |
| `color.border.default` | `#E8DECF` | Card and input border |
| `color.border.soft` | `#F0E8DD` | Very light dividers |
| `color.divider` | `#EDE3D5` | Row separator |

### 2.2 Supporting Colors

| Token | Hex | Usage |
|---|---:|---|
| `color.sky.50` | `#EEF8FB` | Pale blue backgrounds |
| `color.sky.100` | `#DDEFF6` | Sky chip / image accent |
| `color.sky.300` | `#9EC7DA` | Calm blue accent |
| `color.mint.100` | `#E7F1DD` | Soft nature chip |
| `color.mint.300` | `#9EB580` | Success / nature accent |
| `color.coral.100` | `#F8E4DC` | Warm warning chip |
| `color.coral.400` | `#D97764` | Destructive secondary accent |
| `color.lilac.100` | `#EDE8F6` | Gentle tag chip |
| `color.lilac.300` | `#B6A5D8` | Decorative accent |
| `color.warning` | `#D6A64F` | Warning / restore action |
| `color.danger` | `#D65A50` | Delete / clear trash |
| `color.success` | `#7F9D69` | Restore / successful state |

### 2.3 Semantic Tokens

| Token | Hex | Usage |
|---|---:|---|
| `semantic.action.primary.bg` | `#B99055` | Primary buttons |
| `semantic.action.primary.text` | `#FFFFFF` | Primary button text |
| `semantic.action.secondary.bg` | `#F6EFE4` | Secondary buttons |
| `semantic.action.secondary.text` | `#6D5432` | Secondary button text |
| `semantic.action.destructive.bg` | `#FFF6F3` | Delete button background |
| `semantic.action.destructive.text` | `#D65A50` | Delete text/icon |
| `semantic.state.active.bg` | `#B99055` | Active segmented / tab |
| `semantic.state.active.text` | `#FFFFFF` | Active segmented text |
| `semantic.state.inactive.bg` | `#FFFDF8` | Inactive pill |
| `semantic.state.inactive.text` | `#4C5560` | Inactive text |
| `semantic.overlay.image` | `rgba(38,49,59,0.18)` | Text over images |
| `semantic.overlay.soft` | `rgba(255,252,247,0.72)` | Soft image fade overlay |

---

## 3. Typography Tokens

The visual direction uses a **contrast between editorial serif display fonts and clean UI sans fonts**.

### 3.1 Recommended Font Stack

```css
--font-brand-en: "Cormorant Garamond", "Playfair Display", "Bodoni 72", Georgia, serif;
--font-display-zh: "Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", serif;
--font-ui: "Inter", "PingFang SC", "MiSans", "Noto Sans SC", system-ui, sans-serif;
--font-number: "DIN Alternate", "Inter", system-ui, sans-serif;
```

### 3.2 Text Styles

| Token | Font | Size | Weight | Line Height | Letter Spacing | Usage |
|---|---|---:|---:|---:|---:|---|
| `type.brand.logo` | Brand EN serif | `42` | `500` | `46` | `-0.8` | Pixory wordmark |
| `type.brand.subtitle` | UI sans | `10` | `500` | `14` | `1.8` | `IP IMAGE ASSET MANAGEMENT` |
| `type.page.title` | Display ZH serif | `26` | `500` | `34` | `0.2` | Page title: 我的 / 标签 / 回收站 |
| `type.hero.title` | Display ZH serif | `28` | `500` | `38` | `1.2` | Hero headline: 灵感有序 美好长存 |
| `type.hero.caption` | UI sans | `12` | `400` | `18` | `0.2` | Hero subtitle |
| `type.section.title` | Display ZH serif | `18` | `500` | `26` | `0.2` | Section header |
| `type.card.title` | Display ZH serif | `18` | `500` | `24` | `0.2` | IP card title |
| `type.body` | UI sans | `14` | `400` | `22` | `0` | Body text |
| `type.body.strong` | UI sans | `14` | `600` | `22` | `0` | Important body |
| `type.meta` | UI sans | `12` | `400` | `18` | `0` | Counts and metadata |
| `type.caption` | UI sans | `11` | `400` | `16` | `0` | Small labels |
| `type.tab` | UI sans | `11` | `500` | `14` | `0` | Bottom tab labels |
| `type.number.stat` | Number | `20` | `600` | `26` | `0` | Stats number |
| `type.number.meta` | Number | `12` | `500` | `16` | `0` | Image counts, GB |

### 3.3 Typography Rules

- Use serif fonts only for **brand, page titles, hero titles, and IP card titles**.
- Use sans fonts for long text, form fields, metadata, buttons, and navigation.
- Chinese display text should feel like refined Songti / editorial serif, not default Android sans.
- Avoid too much calligraphy. The style should be **editorial**, not handwritten.
- English subtitle should use wide letter spacing to create premium feel.

---

## 4. Spacing Tokens

| Token | Value | Usage |
|---|---:|---|
| `space.0` | `0` | Reset |
| `space.1` | `4` | Tiny gaps |
| `space.2` | `8` | Icon/text gap |
| `space.3` | `12` | Compact content gap |
| `space.4` | `16` | Default component gap |
| `space.5` | `20` | Card inner padding |
| `space.6` | `24` | Section spacing |
| `space.7` | `28` | Large vertical rhythm |
| `space.8` | `32` | Page block spacing |
| `space.10` | `40` | Big hero offset |

### Layout Spacing

| Token | Value | Usage |
|---|---:|---|
| `layout.screen.paddingX` | `16` | Screen horizontal padding |
| `layout.screen.paddingTop` | `18` | Top area after status bar |
| `layout.screen.paddingBottom` | `96` | Content bottom before tab bar |
| `layout.card.gap` | `12` | Grid card gap |
| `layout.section.gap` | `20` | Gap between sections |
| `layout.form.gap` | `14` | Gap between form fields |
| `layout.list.rowGap` | `10` | Vertical list row gap |

---

## 5. Radius Tokens

| Token | Value | Usage |
|---|---:|---|
| `radius.xs` | `6` | Tiny badges |
| `radius.sm` | `10` | Small chips |
| `radius.md` | `14` | Inputs, small cards |
| `radius.lg` | `18` | Main cards |
| `radius.xl` | `22` | Hero cards / panels |
| `radius.2xl` | `28` | Bottom sheet / large surface |
| `radius.pill` | `999` | Pills, tabs, buttons |

---

## 6. Shadow Tokens

Shadows should be soft, warm, and subtle. Avoid black heavy shadows.

| Token | CSS | Usage |
|---|---|---|
| `shadow.none` | `none` | Flat items |
| `shadow.hairline` | `0 1px 0 rgba(124,90,46,0.06)` | Dividers / subtle borders |
| `shadow.card` | `0 8px 24px rgba(92,69,39,0.08)` | IP cards |
| `shadow.hero` | `0 14px 36px rgba(92,69,39,0.12)` | Hero banner |
| `shadow.floating` | `0 18px 48px rgba(92,69,39,0.16)` | Floating nav / modal |
| `shadow.innerSoft` | `inset 0 1px 0 rgba(255,255,255,0.68)` | Soft pill highlight |

React Native shadow approximation:

```ts
card: {
  shadowColor: '#5C4527',
  shadowOpacity: 0.08,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
}
```

---

## 7. Opacity Tokens

| Token | Value | Usage |
|---|---:|---|
| `opacity.disabled` | `0.42` | Disabled controls |
| `opacity.muted` | `0.62` | Muted text/icons |
| `opacity.overlay.imageText` | `0.72` | Text overlay fade |
| `opacity.pressed` | `0.84` | Pressed state |
| `opacity.divider` | `0.48` | Hairline separators |

---

## 8. Component Tokens

### 8.1 App Screen

| Token | Value |
|---|---:|
| `screen.background` | `#F8F1E7` |
| `screen.paddingX` | `16` |
| `screen.maxContentWidth` | `430` |
| `screen.bottomInset` | `96` |

### 8.2 Header / Brand Area

| Token | Value |
|---|---:|
| `header.height.home` | `76` |
| `header.title.font` | `type.brand.logo` |
| `header.subtitle.font` | `type.brand.subtitle` |
| `header.action.size` | `40` |
| `header.action.radius` | `14` |
| `header.action.bg` | `#F6EFE4` |
| `header.action.icon` | `#26313B` |

### 8.3 Search Bar

| Token | Value |
|---|---:|
| `search.height` | `46` |
| `search.radius` | `999` |
| `search.bg` | `#FFFCF7` |
| `search.border` | `#E8DECF` |
| `search.icon` | `#67717A` |
| `search.placeholder` | `#9BA2A8` |
| `search.paddingX` | `16` |

### 8.4 Segmented Control

| Token | Value |
|---|---:|
| `segment.height` | `42` |
| `segment.radius` | `999` |
| `segment.gap` | `12` |
| `segment.item.paddingX` | `24` |
| `segment.active.bg` | `#B99055` |
| `segment.active.text` | `#FFFFFF` |
| `segment.inactive.bg` | `#FFFCF7` |
| `segment.inactive.text` | `#4C5560` |
| `segment.border` | `#E8DECF` |

### 8.5 Hero Banner

| Token | Value |
|---|---:|
| `hero.height.home` | `170` |
| `hero.radius` | `22` |
| `hero.padding` | `24` |
| `hero.shadow` | `shadow.hero` |
| `hero.title.font` | `type.hero.title` |
| `hero.title.color` | `#26313B` |
| `hero.caption.color` | `#67717A` |
| `hero.pagination.active` | `#B99055` |
| `hero.pagination.inactive` | `rgba(255,255,255,0.72)` |

### 8.6 IP Card

| Token | Value |
|---|---:|
| `ipCard.radius` | `18` |
| `ipCard.bg` | `#FFFCF7` |
| `ipCard.border` | `#F0E8DD` |
| `ipCard.shadow` | `shadow.card` |
| `ipCard.image.height` | `118` |
| `ipCard.content.padding` | `14` |
| `ipCard.title.font` | `type.card.title` |
| `ipCard.meta.font` | `type.meta` |
| `ipCard.favorite.size` | `28` |
| `ipCard.favorite.color` | `#B99055` |

### 8.7 Thumbnail Tile

| Token | Value |
|---|---:|
| `thumb.radius` | `14` |
| `thumb.aspectRatio.gallery` | `0.76` |
| `thumb.aspectRatio.square` | `1` |
| `thumb.selected.border` | `#B99055` |
| `thumb.selected.overlay` | `rgba(185,144,85,0.20)` |
| `thumb.badge.bg` | `rgba(255,252,247,0.86)` |

### 8.8 Tag Chip

| Token | Value |
|---|---:|
| `chip.height` | `34` |
| `chip.radius` | `12` |
| `chip.paddingX` | `14` |
| `chip.gap` | `8` |
| `chip.bg.default` | `#FFFCF7` |
| `chip.bg.active` | `#EFE2CB` |
| `chip.text` | `#4C5560` |
| `chip.text.active` | `#7C5A2E` |
| `chip.border` | `#E8DECF` |

### 8.9 Form Field Card

| Token | Value |
|---|---:|
| `field.height` | `48` |
| `field.multiline.minHeight` | `92` |
| `field.radius` | `14` |
| `field.bg` | `#FFFCF7` |
| `field.border` | `#E8DECF` |
| `field.label.color` | `#26313B` |
| `field.placeholder.color` | `#9BA2A8` |
| `field.error.color` | `#D65A50` |

### 8.10 Bottom Navigation

| Token | Value |
|---|---:|
| `tabBar.height` | `74` |
| `tabBar.radiusTop` | `24` |
| `tabBar.bg` | `rgba(255,252,247,0.92)` |
| `tabBar.border` | `#E8DECF` |
| `tabBar.active.color` | `#B99055` |
| `tabBar.inactive.color` | `#67717A` |
| `tabBar.icon.size` | `24` |
| `tabBar.label.font` | `type.tab` |

### 8.11 Stats Card

| Token | Value |
|---|---:|
| `stats.height` | `66` |
| `stats.radius` | `16` |
| `stats.bg` | `#FFFCF7` |
| `stats.number.font` | `type.number.stat` |
| `stats.label.font` | `type.caption` |
| `stats.divider` | `#EDE3D5` |

### 8.12 Trash / Danger Actions

| Token | Value |
|---|---:|
| `danger.button.bg` | `#FFF6F3` |
| `danger.button.border` | `#E6A5A0` |
| `danger.button.text` | `#D65A50` |
| `restore.button.bg` | `#B99055` |
| `restore.button.text` | `#FFFFFF` |

---

## 9. Layout Patterns

### 9.1 Home Layout

```txt
Screen padding: 16
Header brand block
Search bar
Segmented filter
Hero banner
2-column IP grid
Bottom tab bar
```

Home vertical rhythm:

| Area | Gap |
|---|---:|
| Header → Search | `18` |
| Search → Segment | `16` |
| Segment → Hero | `18` |
| Hero → Card grid | `16` |
| Card row gap | `14` |

### 9.2 Card Grid

| Token | Value |
|---|---:|
| `grid.columns` | `2` |
| `grid.gap` | `12` |
| `grid.cardMinHeight` | `198` |
| `grid.imageHeight` | `118` |

### 9.3 Gallery Grid

| Token | Value |
|---|---:|
| `gallery.columns` | `3` |
| `gallery.gap` | `8` |
| `gallery.tileRadius` | `12` |
| `gallery.tileAspectRatio` | `0.74` |

### 9.4 Profile / Me Layout

```txt
Top sky image card
Avatar + name + badge
Stats strip
Action list cards
Storage card
Bottom tab bar
```

---

## 10. Motion Tokens

Keep motion delicate and quick.

| Token | Value | Usage |
|---|---:|---|
| `motion.fast` | `120ms` | Press feedback |
| `motion.normal` | `180ms` | Tab / chip switch |
| `motion.slow` | `260ms` | Bottom sheet |
| `motion.easing.standard` | `cubic-bezier(0.2, 0.0, 0.2, 1)` | Default |
| `motion.easing.soft` | `cubic-bezier(0.16, 1, 0.3, 1)` | Soft entrance |

---

## 11. Icon Tokens

| Token | Value |
|---|---:|
| `icon.size.xs` | `14` |
| `icon.size.sm` | `18` |
| `icon.size.md` | `22` |
| `icon.size.lg` | `26` |
| `icon.stroke` | `1.8` |
| `icon.color.default` | `#4C5560` |
| `icon.color.muted` | `#9BA2A8` |
| `icon.color.active` | `#B99055` |
| `icon.color.danger` | `#D65A50` |

Icon style:

- rounded stroke
- light line icons
- no heavy filled icons except active tab
- active tab can use filled warm gold icon

---

## 12. Image Treatment Tokens

| Token | Value | Usage |
|---|---|---|
| `image.radius.card` | `18` | IP card image |
| `image.radius.hero` | `22` | Hero banner |
| `image.overlay.hero` | `linear-gradient(90deg, rgba(255,252,247,0.72), rgba(255,252,247,0.08))` | Hero text readability |
| `image.overlay.cardBottom` | `linear-gradient(180deg, transparent, rgba(38,49,59,0.18))` | Optional card overlay |
| `image.placeholder.bg` | `#F1E7D8` | Empty image placeholder |

Image style direction:

- warm daylight
- sea / sky / curtain / plant motifs
- soft illustrative thumbnails
- avoid overly saturated neon imagery
- keep image palette aligned with cream, sky blue, gold

---

## 13. Empty State Tokens

| Token | Value |
|---|---:|
| `empty.icon.size` | `64` |
| `empty.card.radius` | `20` |
| `empty.card.bg` | `#FFFCF7` |
| `empty.title.font` | `type.section.title` |
| `empty.title.color` | `#26313B` |
| `empty.description.font` | `type.body` |
| `empty.description.color` | `#67717A` |
| `empty.action.height` | `44` |

---

## 14. Screen-Specific Tokens

### 14.1 Home

```ts
home = {
  heroHeight: 170,
  ipGridColumns: 2,
  ipCardImageHeight: 118,
  showBrandSubtitle: true,
  activeSegmentColor: '#B99055',
}
```

### 14.2 Tags

```ts
tags = {
  chipGridColumns: 3,
  chipHeight: 54,
  chipRadius: 12,
  resultThumbHeight: 86,
  highlightColor: '#EFE2CB',
}
```

### 14.3 Groups

```ts
groups = {
  groupCardHeight: 96,
  groupCardRadius: 18,
  groupThumbnailWidth: 124,
  groupTypeBadgeBg: '#EFE2CB',
}
```

### 14.4 Image Detail

```ts
imageDetail = {
  previewHeight: 360,
  infoCardRadius: 20,
  actionBarHeight: 72,
  tagGap: 8,
}
```

### 14.5 Trash

```ts
trash = {
  noticeBg: '#F6E8D2',
  noticeText: '#7C5A2E',
  clearButtonBorder: '#D65A50',
  restoreButtonBg: '#B99055',
}
```

---

## 15. React Native Token Example

```ts
export const colors = {
  background: {
    app: '#F8F1E7',
    soft: '#FBF6EE',
  },
  surface: {
    primary: '#FFFCF7',
    secondary: '#F6EFE4',
    elevated: '#FFF9F0',
    sunken: '#F1E7D8',
  },
  primary: {
    DEFAULT: '#B99055',
    light: '#D8BE8B',
    dark: '#7C5A2E',
    weak: '#EFE2CB',
  },
  text: {
    primary: '#26313B',
    heading: '#17212B',
    secondary: '#67717A',
    tertiary: '#9BA2A8',
    inverse: '#FFFFFF',
  },
  border: {
    default: '#E8DECF',
    soft: '#F0E8DD',
  },
  danger: '#D65A50',
  success: '#7F9D69',
};

export const typography = {
  brandLogo: {
    fontFamily: 'Cormorant Garamond',
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '500',
    letterSpacing: -0.8,
  },
  heroTitle: {
    fontFamily: 'Noto Serif SC',
    fontSize: 28,
    lineHeight: 38,
    fontWeight: '500',
    letterSpacing: 1.2,
  },
  cardTitle: {
    fontFamily: 'Noto Serif SC',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '500',
  },
};
```

---

## 16. Implementation Notes for Codex

When applying this design to Pixory:

1. Replace the current plain blue-heavy visual system with the warm cream / muted gold system.
2. Use serif display typography for Pixory logo, page titles, hero text, and card titles.
3. Keep body text and metadata in clean sans fonts.
4. Keep all cards softly elevated with warm shadows.
5. Make the home page more image-led and less utility-dashboard-like.
6. Preserve existing app functions and routes.
7. Do not change local-first architecture.
8. Do not add cloud, account, AI, or backend features.
9. Do not use exact generated artwork as app assets unless separately supplied; this spec defines visual direction and layout only.

