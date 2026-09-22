# CSS / PWA system theme — primary-source notes

Facts only. No product recommendation.

Hiato context (unchanged in this document): Vite + React + Tailwind CSS v4 (`@import "tailwindcss"` and `@theme { --color-cream, --color-ink, … }` in `src/index.css`); shadcn `components.json` has `"cssVariables": false`; light-only cream/ink; PWA `theme_color` / `background_color` `#f7f6f3`; `index.html` has `<meta name="theme-color" content="#f7f6f3">` and `apple-mobile-web-app-status-bar-style` `default`; share PNG from canvas with hardcoded cream/ink hex; installed standalone PWA, no user theme preference.

---

## 1. CSS `prefers-color-scheme` and `color-scheme`

### Findings

**Values.** Media Queries Level 5 defines `prefers-color-scheme` as a discrete feature whose values are `light` and `dark` only.

- `light`: the user prefers a light theme (dark text on a light background), **or has not expressed an active preference** (and should therefore receive the “web default” of a light theme).
- `dark`: the user prefers a dark theme (light text on a dark background).

The feature previously had `no-preference`. MQ5 records that user agents converged on expressing the default as `light` and never matching `no-preference`. `no-preference` was removed.

MQ5 notes values might expand later (e.g. an *active* light preference, or “sepia”). The future-friendly pattern given in the spec is `(prefers-color-scheme: dark)` vs `(not (prefers-color-scheme: dark))`.

The preference may come from the OS or from the UA. It may also vary by medium (e.g. dark on a glowing screen, light when printing).

**Live change.** MQ5 requires UAs to re-evaluate media queries when the user environment they know about changes, and to update dependent constructs. CSSOM View defines `Window.matchMedia()` → `MediaQueryList`. When that list’s matches-state changes, the UA fires a `change` event (`MediaQueryListEvent`) at the `MediaQueryList`. Listeners: `addEventListener("change", …)` or the `onchange` handler. Legacy `addListener()` / `removeListener()` are specified as aliases of `addEventListener` / `removeEventListener` for the `change` type.

**`color-scheme` on `:root` / `html`.** CSS Color Adjustment Level 1 defines `color-scheme` (`normal | [ light | dark | <custom-ident> ]+ && only?`, inherited, initial `normal`). It is *not* a substitute for author colors. It tells the UA which schemes the element is designed for; those values are negotiated with `prefers-color-scheme` into a **used color scheme**.

Used color scheme **must** affect, for all elements:

- default colors of scrollbars and other interaction UI
- default colors of form controls and other “specially-rendered” elements
- default colors of other browser-provided UI (e.g. spellcheck underlines)

**On the root element**, used color scheme **additionally must** affect:

- the **surface color of the canvas** (CSS “canvas”: the document background surface, not the HTML `<canvas>` element)
- the viewport’s scrollbars

`color-scheme: light dark` on `:root` is the spec’s example for a page that already restyles via `prefers-color-scheme` and wants UA chrome to match.

HTML also defines `<meta name="color-scheme">` (one per document). Its `content` must match the CSS `color-scheme` value syntax. HTML states this exists **to aid UAs in rendering the page background with the desired color scheme immediately**, rather than waiting for all CSS to load. That meta sets the page’s supported color schemes used when `color-scheme` is `normal`.

`light` / `dark` here are **not** a palette. Spec: a stark black-on-white scheme and a sepia dark-on-tan scheme are both “light”. Pairing system colors with author colors does **not** guarantee contrast; both foreground and background must be specified for a particular look.

### Sources

- [Media Queries Level 5, §12.5 `prefers-color-scheme`](https://www.w3.org/TR/mediaqueries-5/#prefers-color-scheme)
- [Media Queries Level 5, §2 — re-evaluate media queries on environment change](https://www.w3.org/TR/mediaqueries-5/#media)
- [MDN: `prefers-color-scheme`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-color-scheme)
- [CSS Color Adjustment Module Level 1, §2.1 `color-scheme`](https://www.w3.org/TR/css-color-adjust-1/#color-scheme-prop)
- [CSS Color Adjustment Module Level 1, §2.2 Effects of the used color scheme](https://www.w3.org/TR/css-color-adjust-1/#color-scheme-effect)
- [MDN: `color-scheme`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme)
- [CSSOM View: `MediaQueryList` / `change`](https://drafts.csswg.org/cssom-view/#dom-mediaquerylist-onchange)
- [MDN: `MediaQueryList` `change` event](https://developer.mozilla.org/en-US/docs/Web/API/MediaQueryList/change_event)
- [HTML: `<meta name="color-scheme">`](https://html.spec.whatwg.org/multipage/semantics.html#meta-color-scheme)

---

## 2. Tailwind CSS v4 dark mode and `@theme`

### Findings

**Default `dark:` variant.** Official v4 docs: `dark:` uses the CSS media feature `prefers-color-scheme` by default. Compiled form of `@variant dark { … }` in custom CSS is `@media (prefers-color-scheme: dark) { … }`.

**`@custom-variant dark` (class / selector strategy).** To drive dark mode from a selector instead of the media query, override the variant:

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));
```

After that override, `dark:*` applies when `.dark` is an ancestor (docs show `<html class="dark">`), **not** when the OS prefers dark. A data-attribute form is documented the same way (`[data-theme=dark]`).

`@custom-variant` is the v4 mechanism for defining or replacing variants (including replacing `dark`). Shorthand: `@custom-variant name (selector)`. Block form with `@slot` is used when nesting `@media` or multiple conditions.

**Documented tradeoff (prefers-color-scheme vs class).**

- Default: OS-driven, no JS, `dark:` tracks `prefers-color-scheme`.
- Class/data override: **replaces** the media query. The class is not automatically synced to the OS.
- Three-way light / dark / system: docs require JS + `window.matchMedia("(prefers-color-scheme: dark)")`, typically with `localStorage`, and say to put the toggle **inline in `head` to avoid FOUC**. Tailwind maintainer (Adam Wathan): supporting system preference **plus** a manual override needs JS and `matchMedia()`.

**`@theme` tokens cannot be reassigned inside a nested `@theme` under a media query or `.dark`.** Official theme docs: theme variables **must be defined top-level and not nested under other selectors or media queries**. `@theme` does more than emit CSS variables: it registers utility classes. Nested `@theme` is not the supported way to theme-switch tokens.

What *is* supported:

1. **Keep light and dark as separate utilities** (`bg-cream dark:bg-ink`) using the `dark` variant (media or class).
2. **Override the generated CSS custom properties** with ordinary CSS. `@theme { --color-cream: #f7f6f3; }` compiles to a `:root { --color-cream: … }` variable (plus utilities such as `bg-cream`). Those variables can be reassigned later:

   ```css
   @media (prefers-color-scheme: dark) {
     :root {
       --color-cream: /* dark surface */;
       --color-ink: /* light text */;
     }
   }
   ```

   or, with the class strategy, `.dark { --color-cream: …; }` (not a nested `@theme`).

3. **`@layer` / `@variant` in author CSS.** Tailwind’s generated theme lives in `@layer theme`. Author CSS can use `@variant dark { … }` inside a rule; that expands to the current `dark` variant (media or selector). Reassigning `--color-*` that way is ordinary cascade, not a second `@theme` block.

Plain CSS custom properties (`:root { --foo: … }` **without** `@theme`) do **not** create utilities. Docs: use `@theme` when the token should map to a utility; use `:root` for variables that should not.

v4 also ships `scheme-*` utilities (`scheme-light`, `scheme-dark`, `scheme-light-dark`, …) that set the CSS `color-scheme` property (form controls / UA chrome), distinct from `dark:` utilities.

### Sources

- [Tailwind CSS v4: Dark mode](https://tailwindcss.com/docs/dark-mode)
- [Tailwind CSS v4: Theme variables (`@theme` top-level constraint)](https://tailwindcss.com/docs/theme)
- [Tailwind CSS v4: Adding custom variants (`@custom-variant`)](https://tailwindcss.com/docs/adding-custom-styles#adding-custom-variants)
- [Tailwind CSS v4: `@variant` compiles `dark` to `prefers-color-scheme`](https://tailwindcss.com/docs/adding-custom-styles#using-variants)
- [Tailwind CSS v4: `color-scheme` utilities](https://tailwindcss.com/docs/color-scheme)
- [Tailwind discussion #16342 (Adam Wathan on system + override)](https://github.com/tailwindlabs/tailwindcss/discussions/16342)

---

## 3. HTML `<meta name="theme-color" media="…">`

### Findings

**Multiple metas with `media` are specified.** HTML:

- `name=theme-color` `content` must be a CSS `<color>`.
- The `media` attribute is a valid media query list. **Unless `name` is `theme-color`, `media` has no processing-model effect and authors must not use it.**
- For `theme-color`, **`media` values must be unique** among all `theme-color` metas in the document.
- Spec example uses `media="(prefers-color-scheme: dark)"`.

**Obtain a page’s theme color** (tree order):

1. Collect in-tree `meta` elements with `name=theme-color` and a `content` attribute.
2. Skip any whose `media` does not match the environment (absent `media` matches).
3. Parse `content` as a CSS color; return the first successful parse.
4. Else the page has no theme color.

If metas are inserted/removed, or `name` / `content` / `media` change, **or the environment changes so a `media` query may start or stop matching**, the UA **must re-run** the algorithm and apply the result to affected UI. UAs **may** adjust the color for contrast in their chrome.

Manifest `theme_color` is the **default** theme color for an installed app context; HTML `theme-color` **may** override it for in-scope documents (see §4).

**Browser caveats (not in the HTML processing algorithm; from engine/compat notes):**

- HTML spec’s own MDN box on the definition: Firefox **No**; Safari **15+**; Chrome **73+** (with gaps); Chrome Android **80+**; WebView Android **No**; Samsung Internet **6.2+**; Opera **No**. Feature is **not Baseline**.
- `media` on `theme-color`: documented on MDN with a dual light/dark example. Historical engine notes (widely repeated; treat as implementation, not spec): Safari 15+ honors `media`; Chromium ~93+ honors it at least for **installed PWAs**. Chrome on Android in a normal tab has been reported not to apply `prefers-color-scheme` `theme-color` pairs in some versions.
- Safari 15+ on iOS/macOS tinted browser chrome from `theme-color`. Later Safari 26-era reports (community / WebKit discussion, not an HTML spec change) describe Safari **sampling page background / edge-touching fixed elements** instead of (or in addition to) the meta. That is UA behavior, not a spec repeal of the meta.
- UAs may ignore alpha; opaque colors are the interoperable choice.

### Sources

- [HTML Standard: `meta` `media` attribute](https://html.spec.whatwg.org/multipage/semantics.html#attr-meta-media)
- [HTML Standard: `theme-color`](https://html.spec.whatwg.org/multipage/semantics.html#meta-theme-color)
- [MDN: `<meta name="theme-color">`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/theme-color)

---

## 4. Web App Manifest `theme_color` / `background_color`

### Findings

**Root members are single colors, not media-conditioned.** In the Web Application Manifest WD, `theme_color` and `background_color` are each one color string processed by “process a color member”. There is **no** `theme_colors` array in the current spec.

**`theme_color`.** Default theme color for an application context (theme color as defined by HTML). If honored, it applies to all top-level traversables the manifest is applied to. The UA **MAY** override that default if an **in-scope** document has `<meta name="theme-color">`. The UA **SHOULD NOT** let out-of-scope documents override it. Alpha **MAY** be ignored. Implementors **MAY** override the member to support `prefers-color-scheme` (permission, not a second declared value).

**`background_color`.** Expected background of the web application. It repeats stylesheet information so the UA can paint **before files are available** (network or disk). It **MUST NOT** be used as the background once the application’s stylesheet is available. Implementors **MAY** likewise override it for `prefers-color-scheme`.

Splash / status bar implications from the spec text:

- `background_color` is the loading/placeholder color (Android splash generation commonly combines icon + `background_color` + `theme_color`; that composition is platform behavior, not fully specified here).
- `theme_color` is chrome (toolbar, title bar, task switcher, status bar) while the app is applied.
- A single manifest color cannot express light and dark by itself; HTML `theme-color` + `media` can override **after** the document is in-scope. Splash that is drawn **only** from the manifest still has one `background_color` unless the UA uses the override permission or `color_scheme_dark`.

**`color_scheme_dark` (current WD, not a `theme_colors` array).** Added in the WD: an ordered map whose keys are **themeable members** (`theme_color`, `background_color`) and whose values override those members **when the OS uses a dark color theme**. UA **SHOULD** use the override unless user/accessibility preferences take precedence. Example:

```json
{
  "background_color": "#fff",
  "theme_color": "red",
  "color_scheme_dark": {
    "background_color": "#000",
    "theme_color": "hotpink"
  }
}
```

This is a Working Draft member. Shipping UA support is not established by the spec. There is still no media-query syntax on the root `theme_color` / `background_color` strings.

Safari iOS: MDN compat on the WD page lists Safari iOS support for `theme_color` around 15+, and **No** for `background_color` on Safari iOS (limited). web.dev notes Safari on iOS/iPadOS and most desktop browsers currently ignore `background_color`.

### Sources

- [Web Application Manifest WD, §1.12 `theme_color`](https://www.w3.org/TR/appmanifest/#theme_color-member)
- [Web Application Manifest WD, §1.13 `background_color`](https://www.w3.org/TR/appmanifest/#background_color-member)
- [Web Application Manifest WD, §1.16 `color_scheme_dark`](https://www.w3.org/TR/appmanifest/#color_scheme_dark-member)
- [MDN: `theme_color`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/theme_color)
- [MDN: Customize app theme and background colors](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Customize_your_app_colors)
- [web.dev: Web app manifest (`theme_color` / splash)](https://web.dev/learn/pwa/web-app-manifest)

---

## 5. Apple `apple-mobile-web-app-status-bar-style`

### Findings

Apple’s documented values (Safari HTML Reference, Apple extension):

| `content` | Documented effect |
| --- | --- |
| `default` (the default if omitted) | Status bar appears **normal**. Web content is displayed **below** the status bar. |
| `black` | Status bar has a **black** background. Web content **below** the status bar. |
| `black-translucent` | Status bar is **black and translucent**. Web content is displayed on the **entire screen**, partially obscured by the status bar. |

The meta **has no effect** unless full-screen / standalone is enabled first via `apple-mobile-web-app-capable` `yes` (same Apple document). Availability: iOS.

The Apple document does **not** define a light/dark pair, `prefers-color-scheme` interaction, or a `white` value. `default` is “normal” system status bar, not a named CSS color.

WebKit (Home Screen web apps): an Apple engineer comment on Bugzilla (2026) states that **`black-translucent` has been deprecated for multiple releases** because it “semantically can’t work with dark mode and across different webpage styles,” and that removing the key should make the status bar appear in the same color as the webpage. That is WebKit implementation commentary, not a replacement of the three-value Apple HTML reference.

Standalone PWAs on iOS historically use this meta for chrome over the web content; `theme-color` is the HTML/standard mechanism for browser chrome tint (and is what Safari used in the tab UI from Safari 15). The two are not specified as aliases.

### Sources

- [Apple Safari HTML Reference: Supported Meta Tags (`apple-mobile-web-app-status-bar-style`)](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html)
- [WebKit Bug 317153, comment 2 (Luming Yin, Apple) — `black-translucent` deprecation / dark mode](https://bugs.webkit.org/show_bug.cgi?id=317153)

---

## 6. First paint / FOUC

### Findings

**CSS-only `@media (prefers-color-scheme: dark)` (no JS class on `html`).** The media query is part of CSS matching. MQ5 requires the UA to evaluate media queries against the environment (not the page’s own styles). Once a render-blocking stylesheet that contains the query is applied, the matching branch is in the cascade for the first paint that uses that stylesheet. There is **no** extra “wait for JS to add `.dark`” step, so there is no class-strategy FOUC from that mechanism.

Flash can still happen for other specified reasons:

- **Canvas / color scheme before CSS.** HTML’s `color-scheme` meta exists specifically so the UA can paint the **page background** with the desired scheme **immediately**, “rather than waiting for all CSS in the page to load.” If the page does not opt into `dark` via `color-scheme` (property or meta), Color Adjustment says UAs **cannot** auto-adapt author-uncontrolled chrome, because of contrast risk on old pages. Default canvas may therefore stay light until CSS arrives, even if the OS is dark.
- **Stylesheet not yet applied.** Until CSS is available, author `prefers-color-scheme` rules do not run. Manifest `background_color` is the specified placeholder for installed apps in that window.
- **Late or non-blocking CSS.** If the theme rules are not in the first applied stylesheet, the first paint can use UA/default colors.

**When an inline blocking script is still needed.**

- **Class / data-theme strategy.** Tailwind: “best to add inline in `head` to avoid FOUC.” Without it, `html` is painted without `.dark`, then JS adds the class after first paint.
- **Stored user override** (`localStorage` / cookie / server flag) that **disagrees** with `prefers-color-scheme`. CSS media queries cannot read `localStorage`. The override must be present on the root **before** first paint (inline script in `head`, or class rendered on the HTML from the server). Tailwind’s three-way example is this case.
- **System + manual override together**, after replacing `dark` with a class variant: same as above; `matchMedia` + class must run before paint if the class is the only switch.

A CSS-only OS-follow theme does not need that script for correctness of first themed paint, provided theme CSS is render-blocking and `color-scheme` (meta or CSS) opts the canvas into `light` and `dark` if UA chrome/canvas should match before author colors load.

### Sources

- [Media Queries Level 5, §2 (evaluate MQ independent of document styling; re-evaluate on change)](https://www.w3.org/TR/mediaqueries-5/#media)
- [HTML: `<meta name="color-scheme">` — immediate background](https://html.spec.whatwg.org/multipage/semantics.html#meta-color-scheme)
- [CSS Color Adjustment: cannot auto-adapt old pages](https://www.w3.org/TR/css-color-adjust-1/#color-scheme-prop)
- [Tailwind: inline `head` script to avoid FOUC (class + system)](https://tailwindcss.com/docs/dark-mode#with-system-theme-support)
- [Web Application Manifest: `background_color` before stylesheet](https://www.w3.org/TR/appmanifest/#background_color-member)

---

## 7. WCAG 2.2 contrast and `forced-colors`

### Findings

WCAG 2.2 (REC) Level AA:

- **1.4.3 Contrast (Minimum):** text and images of text **≥ 4.5:1**, except large-scale text **≥ 3:1**; incidental/disabled/pure decoration/significant other visual content: no requirement; logotypes: no requirement.
- **1.4.11 Non-text Contrast:** UI components (visual information required to identify the component and states) and graphical objects required to understand content: **≥ 3:1** against adjacent colors. Exception: inactive components, or appearance determined by the UA and not modified by the author.

A dark palette is not exempt. Color Adjustment explicitly cites WCAG 2.2: pairing default/`<system-color>` with author colors cannot guarantee contrast.

**`forced-colors` / Windows High Contrast.** MQ5 `forced-colors`: `none` | `active`. When `active`, Color Adjustment **forced colors mode** overrides author `<color>` on a listed set of properties to **system colors**, may draw a text backplate, forces `color-scheme` to `light dark`, and maps `Canvas` lightness to `prefers-color-scheme` when L is clearly dark (&lt; 33%) or light (&gt; 67%). Authors detect the mode with `@media (forced-colors: active)` and are expected to use CSS system colors (`Canvas`, `CanvasText`, `ButtonFace`, `Field`, …). `forced-color-adjust: none` opts an element out (spec: only when the author is themselves adjusting for the user’s contrast needs).

This is the CSS model for Windows High Contrast / forced palettes. It is independent of an author dark theme; both can apply.

### Sources

- [WCAG 2.2, SC 1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum)
- [WCAG 2.2, SC 1.4.11 Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast)
- [CSS Color Adjustment, §3 Forced Color Palettes](https://www.w3.org/TR/css-color-adjust-1/#forced)
- [Media Queries Level 5, §12.4 `forced-colors`](https://www.w3.org/TR/mediaqueries-5/#forced-colors)
- [CSS Color Module Level 4, system colors](https://www.w3.org/TR/css-color-4/#css-system-colors)

---

## 8. Canvas 2D vs CSS canvas / share PNGs

### Findings

Two different “canvas”s:

1. **CSS canvas** (document surface). Color Adjustment: used `color-scheme` on the **root** must affect this surface color. Initial `color` is `CanvasText`; the `Canvas` system color tracks the used scheme. This is **not** the HTML `<canvas>` element.
2. **HTML `<canvas>` 2D context.** HTML Canvas 2D Context: `fillStyle` and `strokeStyle` **initially** `#000000` / `"black"`. MDN: default fill style is `black`. Neither Color Adjustment nor the Canvas 2D spec states that `color-scheme` changes `CanvasRenderingContext2D.fillStyle` / `strokeStyle` defaults. `currentColor` in canvas APIs uses the element’s CSS `color` at specification time; if that is undefined, fully opaque black.

Drawing APIs paint into a bitmap. `toDataURL` / `toBlob` encode those pixels. The PNG does not retain CSS media queries. Nothing in HTML, Color Adjustment, or the Manifest spec requires an exported share image to follow `prefers-color-scheme`. Once the file leaves the document, it is a fixed raster. (Whether an app *chooses* to paint different pixels when the OS is dark is outside these specs.)

Hiato’s `src/lib/share-render.ts` hardcoding cream/ink hex is consistent with a bitmap that does not track live CSS.

### Sources

- [CSS Color Adjustment, §2.2 — root used scheme affects canvas surface](https://www.w3.org/TR/css-color-adjust-1/#color-scheme-effect)
- [CSS 2: canvas (document surface)](https://www.w3.org/TR/CSS2/intro.html#canvas)
- [HTML Canvas 2D Context: `fillStyle` / `strokeStyle` default `black` / `#000000`](https://www.w3.org/TR/2021/SPSD-2dcontext-20210128/)
- [MDN: `CanvasRenderingContext2D.fillStyle` default `black`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fillStyle)
- [HTML: `HTMLCanvasElement.toDataURL`](https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-todataurl)

---

## 9. Unsupported `prefers-color-scheme` → `light` default

### Findings

MQ5: `light` **includes** “has not expressed an active preference.” UAs that implement the feature but have no user setting match `light`.

If the **feature is unknown** to the UA (old browsers): MQ5 error handling — an unknown `<mf-name>` makes the media feature’s value **unknown**, and a `<media-query>` whose value is unknown **must be replaced with `not all`**. In `@media`, unknown is converted to **false**. Therefore `@media (prefers-color-scheme: dark) { … }` **does not apply**. Author styles outside that query (the usual light defaults) apply.

Boolean `(prefers-color-scheme)` without a value is not useful in the same way as `(color)`: the feature is discrete `light | dark`, and `light` is the specified no-preference mapping, not a zero/none.

MDN documents the same `light` = preferred light **or** no active preference.

There is no third matching value in current MQ5.

### Sources

- [Media Queries Level 5, §12.5 — `light` includes no active preference](https://www.w3.org/TR/mediaqueries-5/#prefers-color-scheme)
- [Media Queries Level 5, §3.2 Error Handling — unknown feature → `not all`](https://www.w3.org/TR/mediaqueries-5/#error-handling)
- [MDN: `prefers-color-scheme` syntax (`light` / `dark`)](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-color-scheme)

---

## Spec silences (called out)

- Manifest: no `theme_colors` array; dark override is `color_scheme_dark` (WD). Root `theme_color` / `background_color` remain single values.
- Apple status-bar meta: no specified mapping of `default` | `black` | `black-translucent` onto `prefers-color-scheme`.
- Canvas 2D: silent on `color-scheme` changing default `fillStyle`.
- HTML `theme-color` + `media`: specified; actual chrome (Safari 26 sampling, Chrome Android tab vs installed PWA) is UA-specific.
- Tailwind: `@theme` must be top-level; dark token changes are ordinary CSS variable overrides or `dark:` utilities, not nested `@theme`.
