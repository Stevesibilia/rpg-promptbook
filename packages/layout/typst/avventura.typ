// Template "Avventura", version 1: the PDF of an adventure or a one-shot for
// the table. A port of the impagina-avventura skill (impagina.py for the
// parts, stile.css for the look). It reads the JSON that toLayoutInput
// writes (src/input.ts) and prints nothing else.
//
// Every printed element calls `pos` first, so the engine knows the page and
// the height of each part, scene and block.

#import "/cmarker/lib.typ" as cmarker

// Colours and fonts, from stile.css.
#let ink = rgb("#1c1a17")
#let accent = rgb("#7b2d26")
#let paper-tint = rgb("#f1ede4")
#let grey = rgb("#4a463f")
#let rule = rgb("#8a857c")
#let tab-tint = rgb("#ebe6dc")
#let zebra-tint = rgb("#f7f4ee")
#let handout-tint = rgb("#fbfaf6")

#let serif = "Spectral"
#let fell = "IM FELL English"
// IBM Plex Sans Condensed: Typst files it under the family "IBM Plex Sans".
#let plex = "IBM Plex Sans"
#let plex-text = text.with(font: plex, stretch: 87.5%)

// Where the template tells the engine what it printed.
#let pos(kind, from, id: none, label: none) = {
  let value = (kind: kind, from: from)
  if id != none { value.insert("id", id) }
  if label != none { value.insert("label", label) }
  context [#metadata((..value, page: here().page(), y: here().position().y.pt()))<pb-pos>]
}

// The edge tab and the footer's section from here on.
#let part-mark(tab, section) = [#metadata((tab: tab, section: section))<pb-part>]

// The mark that applies to the current page: the first one on it, else the
// last one before it (CSS string-set and running elements, as WeasyPrint
// printed them).
#let page-mark() = {
  let page = here().page()
  let marks = query(<pb-part>)
  let on = marks.filter(m => m.location().page() == page)
  if on.len() > 0 { on.first().value } else {
    let before = marks.filter(m => m.location().page() < page)
    if before.len() > 0 { before.last().value } else { none }
  }
}

#let label-text(body) = plex-text(weight: 600, size: 8.5pt, tracking: 0.08em, fill: accent, upper(body))

// ---- Shared with campagna.typ -------------------------------------------
//
// Helpers that read the tints take `ink-saver` as a named argument; the
// `avventura` function binds it once (`md.with(ink-saver: …)`).

// The page of a sheet, for «Tenente Donato, p. 12».
#let page-of(target) = context {
  let found = query(target)
  if found.len() > 0 { str(found.first().location().page()) } else { "?" }
}

// A drawn checkbox, as stile.css's .box: task lists and threat boxes.
#let checkbox(checked: false) = box(
  width: 3mm,
  height: 3mm,
  stroke: 0.35mm + ink,
  baseline: 0.4mm,
  if checked {
    place(curve(
      stroke: 0.35mm + ink,
      curve.move((0.5mm, 1.5mm)),
      curve.line((1.3mm, 2.4mm)),
      curve.line((2.6mm, 0.5mm)),
    ))
  },
)

// A table as stile.css draws one: a dark header, rules under the rows,
// every other row tinted, the whole width. cmarker builds the table; this
// rule builds it again with the columns and the look (the label stops the
// rule from applying to its own table). With ink saver, tints become white.
#let layout-table(variant, it, ink-saver: false) = {
  if it.at("label", default: none) == <pb-table> { return it }
  let tint(colour) = if ink-saver { white } else { colour }
  let count = if type(it.columns) == int { it.columns } else { it.columns.len() }
  let draw(widths) = [#table(
    columns: widths,
    stroke: (x, y) => if y > 0 { (bottom: 0.25mm + rule) } else if ink-saver { (bottom: 0.4mm + ink) },
    fill: (x, y) => if y == 0 { if ink-saver { white } else { ink } } else if calc.even(y) { tint(zebra-tint) },
    inset: (x, y) => if y == 0 { (x: 2.5mm, y: 1.4mm) } else { (x: 2.2mm, y: 1.2mm) },
    align: left + top,
    ..it.children,
  )<pb-table>]
  set text(size: if variant == "small" { 8.6pt } else { 9pt })
  // line-height 1.32.
  set par(leading: 0.66em)
  show table.cell.where(y: 0): c => {
    set text(font: plex, stretch: 87.5%, weight: 600, size: 8.5pt, tracking: 0.05em, fill: if ink-saver { ink } else { white })
    upper(c)
  }
  show table.cell: c => if variant == "reactions" and c.x == 0 and c.y > 0 { strong(c) } else { c }
  block(above: 2mm, below: 3mm, if variant == "reactions" and count == 2 {
    draw((38%, 1fr))
  } else {
    layout(size => {
      let natural = measure(draw((auto,) * count), width: size.width).width
      if natural < size.width and count > 0 { draw((auto,) * (count - 1) + (1fr,)) } else { draw((auto,) * count) }
    })
  })
}

// A heading inside a block's Markdown (#### in a sheet) prints like h3.
#let h3(body) = block(
  above: 4mm,
  below: 2mm,
  sticky: true,
  stroke: (bottom: 0.25mm + rule),
  inset: (bottom: 0.6mm),
  width: 100%,
  text(font: fell, size: 13pt, fill: accent, body),
)

// stile.css: a paragraph whose only element is a bold run prints that run
// as a label («IL PASSATO.», «AMBIENTAZIONE:»). Lists and tables are not
// paragraphs, as in HTML.
#let marked = (strong, emph, link, raw, highlight, box, image, sub, super, strike, underline)
#let label-pars(body) = {
  let children = if body.func() == [].func() { body.children } else { (body,) }
  let segments = ((),)
  for child in children {
    if child.func() == parbreak { segments.push(()) } else { segments.last().push(child) }
  }
  segments
    .map(segment => {
      let elements = segment.filter(c => c.func() in marked)
      if elements.len() == 1 and elements.first().func() == strong {
        show strong: s => label-text(s.body)
        segment.join()
      } else { segment.join() }
    })
    .join(parbreak())
}

// Markdown to Typst. Raw Typst in the text is never run.
#let md(markdown, table: "normal", ink-saver: false) = {
  show std.table: layout-table.with(table, ink-saver: ink-saver)
  label-pars(cmarker.render(
  markdown,
  smart-punctuation: false,
  raw-typst: false,
  set-document-title: false,
  task-list-marker: checked => checkbox(checked: checked),
  scope: (
    heading: (level: 1, body) => h3(body),
    link: (dest, body) => if type(dest) == label {
      [#link(dest, body), p. #page-of(dest)]
    } else { link(dest, body) },
    image: (..args) => none,
  ),
))
}

// A section's heading: IM Fell 18 pt in the accent colour, a rule under it.
#let section-heading(title, from: none, breaking: false) = {
  if breaking { pagebreak(weak: true) }
  block(
    above: 5mm,
    below: 2.5mm,
    sticky: true,
    width: 100%,
    stroke: (bottom: 0.3mm + rule),
    inset: (bottom: 0.9mm),
    {
      if from != none { pos("block", from) }
      text(font: fell, size: 18pt, fill: accent, title)
    },
  )
}

#let avventura(input) = {
  let options = input.options
  let ink-saver = options.inkSaver
  // Ink saver: tints become white; text, rules and borders stay.
  let tint(colour) = if ink-saver { white } else { colour }
  // With the tint gone, a tinted box keeps a thin border instead.
  let tint-border = if ink-saver { 0.3mm + rule } else { none }

  // The shared helpers above, with this PDF's ink saver.
  let md = md.with(ink-saver: ink-saver)

  // A block of the input: its position, then its Markdown.
  let blk(b, table: "normal") = {
    pos("block", b.from)
    md(b.markdown, table: table)
    // Each block is its own paragraph, as in HTML.
    parbreak()
  }
  let blocks(list, table: "normal") = for b in list { blk(b, table: table) }

  let side-box(title, body) = block(
    width: 100%,
    fill: tint(paper-tint),
    stroke: tint-border,
    inset: 3.5mm,
    below: 3.5mm,
    breakable: false,
    {
      set text(size: 9pt)
      // line-height 1.38.
      set par(leading: 0.72em)
      set list(indent: 0mm)
      if title != none { block(below: 2mm, label-text(title)) }
      body
    },
  )

  // A callout or a quote, by its role.
  let callout(b) = {
    let role = b.box.role
    if role == "readAloud" or role == "quote" {
      block(width: 100%, fill: tint(paper-tint), stroke: tint-border, inset: (x: 4.5mm, top: 3.5mm, bottom: 2.5mm), below: 3.5mm, breakable: false, {
        pos("block", b.from)
        if b.box.label != none { block(below: 1.5mm, label-text(b.box.label)) }
        set text(style: "italic", size: 10.3pt)
        // line-height 1.42.
        set par(leading: 0.76em)
        md(b.markdown)
      })
    } else if role == "handout" {
      block(width: 100%, fill: tint(handout-tint), stroke: (paint: rule, thickness: 0.3mm, dash: "dashed"), inset: (x: 4mm, top: 3mm, bottom: 1mm), above: 2mm, below: 3.5mm, {
        pos("block", b.from)
        set text(size: 9.3pt)
        block(below: 1.5mm, label-text(b.box.label))
        if b.box.title != none { block(below: 1.5mm, text(font: fell, size: 12pt, b.box.title)) }
        md(b.markdown)
      })
    } else {
      side-box(b.box.title, { pos("block", b.from); md(b.markdown) })
    }
  }
  let any-block(b, table: "normal") = if b.box != none { callout(b) } else { blk(b, table: table) }
  let any-blocks(list, table: "normal") = for b in list { any-block(b, table: table) }

  // A two-column part: the main column, and the side column 58 mm wide.
  let columns-part(main, side) = grid(columns: (1fr, 58mm), column-gutter: 6mm, main, side)

  // A part's blocks with its side boxes in the side column; without any, the
  // blocks print full width.
  let with-side(part) = if part.sideBoxes.len() == 0 {
    any-blocks(part.blocks)
  } else {
    columns-part(any-blocks(part.blocks), { for b in part.sideBoxes { callout(b) } })
  }

  // The sections without a role that print after a part, in document order.
  // One on a new page names its page in the review.
  let own-sections(list) = for s in list {
    if s.newPage {
      pagebreak(weak: true)
      pos("part", s.from, id: "own-" + str(s.from), label: s.title)
    }
    section-heading(s.title, from: s.from)
    with-side(s)
  }

  // ---- Page --------------------------------------------------------------

  set document(title: input.title, author: if input.author != none { input.author } else { () }, date: none)
  set text(font: serif, size: 9.5pt, fill: ink, lang: "it", hyphenate: false)
  // stile.css's line-height 1.36: Typst's leading runs from the baseline to
  // the next line's cap height (0.66 em in Spectral). CSS margins add to the
  // line gap; Typst's spacing replaces it.
  set par(leading: 0.7em, spacing: 0.7em + 2.2mm)
  set list(indent: 0mm, body-indent: 2.5mm, spacing: 0.7em + 0.9mm)
  set enum(indent: 0mm, body-indent: 2.5mm, spacing: 0.7em + 0.9mm)
  set strong(delta: 200)

  let footer-tail = (input.author, input.copyright, if input.licence != none { input.licence.short }).filter(v => v != none)

  set page(
    paper: if options.paper == "us-letter" { "us-letter" } else { "a4" },
    margin: (top: 12mm, right: 15mm, bottom: 14mm, left: 14mm),
    footer-descent: 3mm,
    footer: context {
      let mark = page-mark()
      set text(fill: grey)
      grid(
        columns: (1fr, auto, auto),
        column-gutter: 4mm,
        align: (left + top, right + top, right + top),
        plex-text(size: 8.5pt, input.title + if mark != none { " · " + mark.section }),
        plex-text(size: 8.5pt, footer-tail.join(" · ")),
        plex-text(size: 9pt, weight: 600, str(here().page())),
      )
    },
    // The edge tabs on the right edge, the current one filled, and the
    // page's size for the engine.
    foreground: context {
      [#metadata((page: here().page(), width: page.width.pt(), height: page.height.pt()))<pb-page>]
      let mark = page-mark()
      let current = if mark != none { mark.tab } else { none }
      place(top + right, dy: 12mm + 8mm, stack(
        spacing: 1mm,
        ..input.tabs.map(t => {
          let on = t == current
          box(
            width: 10mm,
            height: if t.len() > 3 { 18mm } else { 10mm },
            fill: if on { if ink-saver { white } else { accent } } else { tint(tab-tint) },
            stroke: if ink-saver { if on { 0.6pt + accent } else { 0.3pt + rule } } else { none },
            align(center + horizon, plex-text(
              weight: 600,
              size: 8.5pt,
              fill: if on and not ink-saver { white } else if on { accent } else { grey },
              t,
            )),
          )
        }),
      ))
    },
  )

  // ---- Apertura: the cover, «La vicenda in breve», «Antefatto» ----------

  let cover = input.cover
  pos("part", cover.from, id: "cover", label: "Cover")
  part-mark("Notte", "La notte")
  block(width: 100%, stroke: (bottom: 0.6mm + ink), inset: (bottom: 3mm), below: 3mm, {
    if cover.over.len() > 0 {
      pos("block", cover.over.first().from)
      show strong: set text(weight: "regular")
      let line = cover.over.map(b => cmarker.render(b.markdown, smart-punctuation: false, raw-typst: false)).join(" · ")
      block(below: 2mm, plex-text(size: 8.5pt, tracking: 0.08em, fill: grey, line))
    }
    block(above: 1mm, below: 0mm, text(font: fell, size: 34pt, top-edge: "ascender", input.title))
    if input.subtitle != none {
      block(above: 1.5mm, text(font: fell, style: "italic", size: 15pt, fill: accent, input.subtitle))
    }
  })
  {
    set text(size: 9pt, fill: grey)
    blocks(cover.meta)
    // The author, the copyright and the licence, on one line; an SPDX
    // licence in its short form, linked to its page.
    let credit(label, value) = [#label-text(label + ":") #value]
    let credits = ()
    if input.author != none { credits.push(credit("Autore", input.author)) }
    if input.copyright != none { credits.push(credit("Copyright", input.copyright)) }
    if input.licence != none {
      let l = input.licence
      credits.push(credit("Licenza", if l.url != none { link(l.url, l.short) } else { l.full }))
    }
    if credits.len() > 0 { par(credits.join(" · ")) }
  }
  {
    set par(justify: true)
    if cover.synopsis != none {
      section-heading(cover.synopsis.title, from: cover.synopsis.from)
      any-blocks(cover.synopsis.blocks)
    }
    if cover.backstory != none {
      section-heading(cover.backstory.title, from: cover.backstory.from)
      any-blocks(cover.backstory.blocks)
    }
    own-sections(input.own.cover)
  }

  // ---- La notte: «A colpo d'occhio», reminders, clock, truths ------------

  let night = input.night
  let follows = cover.synopsis == none and cover.backstory == none and input.own.cover.len() == 0
  if not follows { pagebreak(weak: true) }
  pos("part", night.from, id: "night", label: "Notte")
  if night.overviewTitle != none {
    section-heading(night.overviewTitle, from: if night.overview != none { night.overview.from })
  }
  if night.overview != none { any-blocks(night.overview.blocks) }
  columns-part(
    {
      if night.clock != none {
        section-heading(night.clock.title, from: night.clock.from)
        show list.item: set block(below: 2mm)
        any-blocks(night.clock.blocks)
      }
      if night.truths != none {
        section-heading(night.truths.title, from: night.truths.from)
        any-blocks(night.truths.blocks)
      }
    },
    {
      v(5mm)
      if night.reminders != none {
        side-box(night.reminders.title, { pos("block", night.reminders.from); any-blocks(night.reminders.blocks) })
      }
      if night.revelations != none {
        side-box(night.revelations.title, any-blocks(night.revelations.blocks))
      }
      for b in night.sideBoxes { callout(b) }
    },
  )
  own-sections(input.own.night)

  // ---- Inizio: «Inizio forte», «Mappa delle scene» -----------------------

  let start = input.start
  if start.strongStart != none or start.sceneMap != none {
    pagebreak(weak: true)
    pos("part", start.from, id: "start", label: "Inizio")
    if start.strongStart != none {
      section-heading(start.strongStart.title, from: start.strongStart.from)
      any-blocks(start.strongStart.blocks)
    }
    if start.sceneMap != none {
      section-heading(start.sceneMap.title, from: start.sceneMap.from)
      any-blocks(start.sceneMap.blocks)
    }
  }
  own-sections(input.own.start)

  // ---- Regole della notte, with its side boxes in the side column --------

  if input.rules != none {
    pagebreak(weak: true)
    pos("part", input.rules.from, id: "rules", label: "Regole")
    section-heading(input.rules.title, from: input.rules.from)
    with-side(input.rules)
  }
  own-sections(input.own.rules)

  // ---- One part per scene ------------------------------------------------

  let field-blocks(f) = any-blocks(f.blocks)
  let inline-field(f) = {
    pos("block", f.from)
    for b in f.blocks { md(b.markdown) }
  }

  // The rows of a threat box, each drawn by its block (design D6). Keys sit
  // in a label column at least 13 mm wide, as wide as the widest key up to
  // 26 mm; a longer key wraps at its spaces, never inside a word.
  //
  // Kulthos's boxes beside a one-line key are drawn as before this column
  // grew. Its talents print with the tight leading of the other blocks since
  // the owner re-baselined Sabaoth's PDF (2026-11-06).
  let threat-rows(rows) = context {
    // Inside a value, lines sit closer than two rows do.
    let tight = 0.4em
    let gap = 1.6mm
    let key-text(k) = plex-text(size: 8.5pt, k)
    let keyed = ("text", "number", "boxes")
    let keys = rows.filter(r => r.block in keyed or (r.block == "clocks" and r.fixed)).map(r => r.key)
    let width-of(k) = measure(key-text(k)).width + 2mm
    let longest-word(k) = calc.max(..k.split(" ").map(word => width-of(word)))
    // A single word wider than 30 mm prints smaller instead of breaking.
    let w = calc.min(30mm, calc.max(13mm, ..keys.map(k => calc.max(calc.min(width-of(k), 26mm), longest-word(k)))))
    let fits(k) = width-of(k) <= w
    let key(name) = if fits(name) { key-text(name) } else {
      let word = longest-word(name)
      let size = if word > w { 8.5pt * ((w - 2mm) / (word - 2mm)) } else { 8.5pt }
      box(width: w - 2mm, plex-text(size: size, name))
    }
    // Kulthos's counters: the boxes beside the key, centred on it.
    let row(name, body) = block(below: 1mm, grid(
      columns: (w, auto),
      align: if fits(name) { horizon } else { top },
      key(name),
      body,
    ))
    // A text value beside its key on the same baseline; its wrapped lines
    // under the value, not under the key. A key on several lines sits beside
    // the value, both from the top.
    let text-row(name, body) = block(below: gap, if fits(name) {
      par(leading: tight, hanging-indent: w, [#box(width: w, key(name))#body])
    } else {
      grid(columns: (w, 1fr), align: top, key(name), par(leading: tight, body))
    })
    let mark-fill = rule.lighten(55%)
    let numbered(n, marked) = box(
      width: 3.4mm,
      height: 3.4mm,
      stroke: 0.35mm + ink,
      baseline: 0.6mm,
      fill: if marked { mark-fill },
      align(center + horizon, plex-text(size: 6pt, weight: 600, str(n))),
    )
    let one(i, r) = {
      let marked = (i + 1) in r.marked
      if r.values { numbered(i + 1, marked) } else if marked {
        box(width: 3mm, height: 3mm, stroke: 0.35mm + ink, baseline: 0.4mm, fill: mark-fill)
      } else { checkbox() }
    }
    let group(r, from, n) = box(stack(dir: ltr, spacing: 0.6mm, ..range(from, from + n).map(i => one(i, r))))
    // On one line, as Kulthos's counters: groups 2 mm apart. When they do not
    // fit beside the key they wrap between groups, or between boxes when the
    // kind sets no group, from the key's first line.
    let boxes-row(r) = {
      if r.count == 0 { return row(r.key, text(fill: grey, "0")) }
      let starts = range(0, r.count, step: r.group)
      let groups = starts.map(s => group(r, s, calc.min(r.group, r.count - s)))
      let natural = r.count * 3mm + (r.count - groups.len()) * 0.6mm + (groups.len() - 1) * 2mm
      block(below: 1mm, layout(size => if natural <= size.width - w {
        grid(columns: (w, auto), align: if fits(r.key) { horizon } else { top }, key(r.key), if groups.len() == 1 { groups.first() } else { stack(dir: ltr, spacing: 1.4mm + 0.6mm, ..groups) })
      } else {
        let pieces = if groups.len() == 1 { range(r.count).map(i => one(i, r)).join([#h(0.6mm)#sym.zws]) } else {
          groups.join([#h(2mm)#sym.zws])
        }
        grid(columns: (w, 1fr), align: top, key(r.key), par(leading: 1mm, pieces))
      }))
    }
    let clock(n) = {
      let r = 3mm
      box(width: 2 * r, height: 2 * r, baseline: 30%, {
        place(circle(radius: r, stroke: 0.35mm + ink, fill: white))
        for i in range(n) {
          let a = i / n * 360deg - 90deg
          place(line(start: (r, r), end: (r + r * calc.cos(a), r + r * calc.sin(a)), stroke: 0.25mm + ink))
        }
      })
    }
    // Tokens: the number a table gives a word, as small filled dots.
    let tokens(n) = if n != none and n > 0 {
      h(1mm)
      box(stack(dir: ltr, spacing: 0.5mm, ..range(n).map(_ => circle(radius: 0.75mm, fill: ink))))
    }
    let write-in(width) = box(width: width, height: 1.8mm, stroke: (bottom: 0.25mm + ink))
    for r in rows {
      if r.block == "text" {
        text-row(r.key, md(r.text))
      } else if r.block == "number" {
        text-row(r.key, if r.line { [#write-in(12mm) / #md(r.text)] } else { md(r.text) })
      } else if r.block == "boxes" {
        boxes-row(r)
      } else if r.block == "clocks" {
        if r.fixed {
          row(r.key, clock(r.clocks.first().size))
        } else {
          for c in r.clocks {
            block(below: 1mm, grid(columns: (auto, 1fr), column-gutter: 2mm, align: horizon, clock(c.size), { set par(leading: tight); md(c.label) }))
          }
        }
      } else if r.block == "stats" {
        // As many cells a line as the longest label allows, the lines even:
        // six short labels on one line, six long ones three by three. Every
        // value on one line, all at the size the widest one fits at.
        let label(s) = plex-text(size: 6pt, weight: 600, tracking: 0.04em, fill: grey, upper(s.label))
        let value(s, size) = text(weight: "semibold", size: size, if s.value != none { md(s.value) } else { "–" })
        let n = calc.max(r.stats.len(), 1)
        block(above: 1.5mm, below: 1.5mm, layout(size => {
          let widest = calc.max(0pt, ..r.stats.map(s => measure(label(s)).width))
          let fit = calc.max(1, calc.min(n, calc.floor(size.width / (widest + 1.6mm))))
          let lines = calc.ceil(n / fit)
          let per = calc.ceil(n / lines)
          let room = size.width / per - 1.2mm
          let longest = calc.max(0pt, ..r.stats.map(s => measure(value(s, 8.5pt)).width))
          let value-size = if longest <= room { 8.5pt } else { calc.max(6pt, 8.5pt * (room / longest)) }
          table(
            columns: (1fr,) * per,
            stroke: 0.25mm + ink,
            inset: (x: 0.6mm, y: 0.9mm),
            align: center,
            ..r.stats.map(s => [
              #label(s)\
              #box(value(s, value-size))
            ]),
          )
        }))
      } else if r.block == "list" and r.style == "paras" {
        if r.names != none {
          par(leading: tight)[#label-text(r.key + ":") #md(r.names)]
        } else {
          for talent in r.items {
            par(leading: tight)[#label-text(talent.name)#if talent.text != "" [: #md(talent.text)]]
          }
        }
      } else if r.block == "list" and r.style == "check" {
        block(below: gap, {
          label-text(r.key)
          for item in r.items {
            block(above: 1mm, below: 0mm, grid(
              columns: (3.6mm, 1fr),
              align: top,
              move(dy: 0.15mm, circle(radius: 1.05mm, stroke: 0.3mm + ink)),
              { set par(leading: tight); md(item) },
            ))
          }
        })
      } else if r.block == "list" {
        block(below: gap, par(leading: tight)[#label-text(r.key + ":") #md(r.items.join(" · "))])
      } else if r.block == "rows" {
        // Columns as a browser sizes them: each at least its longest word, the
        // room left shared by how much more each needs to print on one line;
        // with room to spare the first takes it. Words never break, and a
        // word keeps its tokens on its line. When the narrowest columns are
        // still too wide the cells print smaller, and only then may tokens go
        // under their word.
        let head(c) = plex-text(size: 6.5pt, weight: 600, tracking: 0.04em, fill: grey, upper(c))
        let cell(c, together) = [#md(c.text)#if together { sym.wj }#tokens(c.tokens)]
        let n = r.columns.len()
        let least-of(i, size, together) = calc.max(
          measure(head(r.columns.at(i))).width,
          ..r.rows.map(row => {
            let c = row.at(i)
            let words = c.text.split(" ")
            let last = text(size: size, cell((text: words.last(), tokens: c.tokens), together))
            calc.max(
              measure(text(size: size, tokens(c.tokens))).width,
              ..words.map(x => measure(text(size: size, x)).width),
              if together { measure(last).width } else { 0pt },
            )
          }),
        )
        let full-of(i, size) = calc.max(measure(head(r.columns.at(i))).width, ..r.rows.map(row => measure(text(size: size, cell(row.at(i), true))).width))
        block(below: gap, {
          label-text(r.key)
          block(above: 1mm, layout(size => {
            let gutter = 1.5mm
            let room = size.width - (n - 1) * gutter
            let tries = ((8.3pt, true), (7.6pt, true), (8.3pt, false), (7.6pt, false), (6.8pt, false))
            let fitting = tries.filter(t => range(n).map(i => least-of(i, ..t)).sum() <= room)
            let (cell-size, together) = if fitting.len() > 0 { fitting.first() } else { tries.last() }
            let least = range(n).map(i => least-of(i, cell-size, together))
            let full = range(n).map(i => full-of(i, cell-size))
            let spare = room - least.sum()
            let wanted = range(n).map(i => full.at(i) - least.at(i)).sum()
            let widths = if full.sum() <= room {
              (1fr, ..full.slice(1))
            } else if spare <= 0pt or wanted <= 0pt {
              least
            } else {
              range(n).map(i => least.at(i) + spare * ((full.at(i) - least.at(i)) / wanted))
            }
            set text(size: cell-size)
            set par(leading: tight)
            table(
              columns: widths,
              column-gutter: gutter,
              stroke: (x, y) => (bottom: if y == 0 { 0.3mm + ink } else { 0.2mm + rule.lighten(40%) }),
              inset: (x: 0mm, y: 0.9mm),
              align: left + top,
              ..r.columns.map(head),
              ..r.rows.flatten().map(c => cell(c, together)),
            )
          }))
        })
      } else if r.block == "lines" {
        block(below: gap, {
          label-text(r.key)
          for l in r.labels {
            block(above: 1.2mm, below: 0mm, [#md(l)#h(1.5mm)#box(width: 1fr, height: 2.6mm, stroke: (bottom: 0.25mm + ink))])
          }
        })
      }
    }
  }

  let threat-box(t) = block(width: 100%, stroke: 0.45mm + ink, inset: 3mm, below: 3.5mm, breakable: false, {
    set text(size: 8.8pt)
    set par(spacing: 1.2mm)
    // A name on two lines keeps them close; on one line it prints as before.
    block(below: 1mm, { set par(leading: 0.3em); text(font: fell, size: 14pt, bottom-edge: "descender", t.name) })
    block(below: 1.5mm, plex-text(size: 8.5pt, fill: grey, t.subtitle))
    for q in t.quotes { block(below: 1.5mm, emph(md(q))) }
    threat-rows(t.rows)
    if t.sheet != none {
      block(above: 1.5mm, plex-text(size: 8.5pt, fill: grey, [#link(label(t.sheet))[scheda completa], p. #page-of(label(t.sheet))]))
    }
  })

  for scene in input.scenes {
    pagebreak(weak: true)
    let heading-text = if scene.id != "" { scene.id + ". " + scene.title } else { scene.title }
    // The scene header: the id, the title, «Luogo e momento».
    block(width: 100%, stroke: (bottom: 0.6mm + ink), inset: (bottom: 2.5mm), below: 3mm, {
      pos("scene", scene.from, id: scene.id, label: if scene.id != "" { scene.id } else { scene.title })
      part-mark(scene.id, heading-text)
      grid(
        columns: (auto, 1fr),
        column-gutter: 4mm,
        align: bottom,
        if scene.id != "" { text(font: fell, size: 36pt, fill: accent, top-edge: "cap-height", bottom-edge: "baseline", scene.id) },
        {
          text(font: fell, size: 22pt, bottom-edge: "descender", scene.title)
          if scene.place != none {
            block(above: 1mm, {
              set text(size: 9pt, fill: grey)
              inline-field(scene.place)
            })
          }
        },
      )
    })
    if scene.inPlay != none {
      block(below: 3.5mm, {
        set text(size: 10pt)
        pos("block", scene.inPlay.from)
        label-text("In gioco")
        [ ]
        for b in scene.inPlay.blocks { md(b.markdown) }
      })
    }

    columns-part(
      {
        for b in scene.readAlouds { callout(b) }
        if scene.happens != none {
          h3(scene.happens.label)
          field-blocks(scene.happens)
        }
        if scene.clues != none {
          h3(scene.clues.label)
          field-blocks(scene.clues)
        }
        for b in scene.handouts { callout(b) }
        for b in scene.boxes { callout(b) }
        if scene.tests != none {
          block(width: 100%, stroke: 0.3mm + rule, inset: (x: 3mm, y: 2.5mm), above: 3mm, below: 3mm, breakable: false, {
            pos("block", scene.tests.from)
            [*#scene.tests.label.* ]
            for b in scene.tests.blocks { md(b.markdown) }
          })
        }
        if scene.reactions != none { blk(scene.reactions, table: "reactions") }
        blocks(scene.tables)
        if scene.derail != none {
          block(above: 2.5mm, {
            pos("block", scene.derail.from)
            text(fill: accent, weight: "semibold", scene.derail.label + ".")
            [ ]
            for b in scene.derail.blocks { md(b.markdown) }
          })
        }
      },
      {
        if scene.mustHave != none {
          side-box(scene.mustHave.label, { pos("block", scene.mustHave.from); field-blocks(scene.mustHave) })
        }
        if scene.cast != none {
          block(below: 3mm, {
            set text(size: 9pt)
            pos("block", scene.cast.from)
            block(below: 2mm, label-text(scene.cast.label))
            field-blocks(scene.cast)
          })
        }
        for t in scene.threats { threat-box(t) }
        for b in scene.sideBoxes { callout(b) }
      },
    )

    // Under both columns, in the order the text has them. A bold label the
    // template does not know prints as written, «Se il tempo stringe:»
    // included.
    let below = (scene.situation, scene.decides, ..scene.others).filter(f => f != none).sorted(key: f => f.from)
    for f in below {
      if f in scene.others and f.blocks.len() == 1 and f.blocks.first().kind == "paragraph" {
        pos("block", f.from)
        md("**" + f.label + ":** " + f.blocks.first().markdown)
        parbreak()
      } else {
        h3(f.label)
        field-blocks(f)
      }
    }
    pos("scene-end", scene.to, id: scene.id)
  }
  own-sections(input.own.scenes)

  // ---- Riferimenti: clues, NPCs, sheets, pregenerated, preparation -------

  let refs = input.references
  if refs.print {
    pagebreak(weak: true)
    pos("part", refs.from, id: "references", label: "Schede")
    part-mark("Schede", "Schede e riferimenti")
    if refs.clues != none {
      section-heading(refs.clues.title, from: refs.clues.from)
      any-blocks(refs.clues.blocks, table: "small")
    }
    if refs.npcs != none {
      section-heading(refs.npcs.title, from: refs.npcs.from)
      any-blocks(refs.npcs.blocks, table: "small")
    }
    if refs.sheets.len() > 0 {
      section-heading(refs.sheetsTitle)
      for sheet in refs.sheets {
        [#block(width: 100%, stroke: 0.3mm + rule, inset: (x: 4mm, top: 3mm, bottom: 1mm), below: 4mm, breakable: false, {
          pos("block", sheet.from)
          set text(size: 9.3pt)
          // Sub-bullets of a field: Spectral has no ‣, Typst's second marker.
          set list(marker: ([•], [–]))
          block(below: 2mm, text(font: fell, size: 15pt, fill: accent, bottom-edge: "descender", sheet.title))
          any-blocks(sheet.blocks)
          if sheet.trackers.len() > 0 {
            block(above: 1mm, below: 2mm, { set text(size: 8.8pt); set par(spacing: 1.2mm); threat-rows(sheet.trackers) })
          }
        })#label(sheet.label)]
      }
    }
    own-sections(input.own.references)
    if refs.pregenerated != none {
      let pregenerated = refs.pregenerated
      pagebreak(weak: true)
      pos("part", pregenerated.from, id: "pregenerated", label: "Pregenerati")
      section-heading(pregenerated.title, from: pregenerated.from)
      any-blocks(pregenerated.blocks)
      for character in pregenerated.characters {
        block(width: 100%, stroke: 0.45mm + ink, inset: (x: 4mm, top: 3mm, bottom: 1mm), below: 4mm, breakable: false, {
          pos("block", character.from)
          set text(size: 9.3pt)
          block(below: 2mm, text(font: fell, size: 15pt, fill: accent, bottom-edge: "descender", character.name))
          any-blocks(character.blocks)
        })
      }
    }
    if refs.before != none {
      pagebreak(weak: true)
      pos("part", refs.before.from, id: "before", label: "Prima della sessione")
      section-heading(refs.before.title, from: refs.before.from)
      any-blocks(refs.before.blocks)
    }
  }
  own-sections(input.own.before)
  own-sections(input.own.end)
}
