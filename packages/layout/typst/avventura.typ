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

#let avventura(input) = {
  let options = input.options
  let ink-saver = options.inkSaver
  // Ink saver: tints become white; text, rules and borders stay.
  let tint(colour) = if ink-saver { white } else { colour }
  // With the tint gone, a tinted box keeps a thin border instead.
  let tint-border = if ink-saver { 0.3mm + rule } else { none }

  // The page of a sheet, for «Tenente Donato, p. 12».
  let page-of(target) = context {
    let found = query(target)
    if found.len() > 0 { str(found.first().location().page()) } else { "?" }
  }

  // A drawn checkbox, as stile.css's .box: task lists and threat boxes.
  let checkbox(checked: false) = box(
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
  // rule from applying to its own table).
  let layout-table(variant, it) = {
    if it.at("label", default: none) == <pb-table> { return it }
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
  let h3(body) = block(
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
  let marked = (strong, emph, link, raw, highlight, box, image, sub, super, strike, underline)
  let label-pars(body) = {
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
  let md(markdown, table: "normal") = {
    show std.table: layout-table.with(table)
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

  // A block of the input: its position, then its Markdown.
  let blk(b, table: "normal") = {
    pos("block", b.from)
    md(b.markdown, table: table)
    // Each block is its own paragraph, as in HTML.
    parbreak()
  }
  let blocks(list, table: "normal") = for b in list { blk(b, table: table) }

  let section-heading(title, from: none, breaking: false) = {
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
  }

  // ---- La notte: «A colpo d'occhio», reminders, clock, truths ------------

  let night = input.night
  let follows = cover.synopsis == none and cover.backstory == none
  if not follows { pagebreak(weak: true) }
  pos("part", night.from, id: "night", label: "Notte")
  section-heading(night.overviewTitle, from: if night.overview != none { night.overview.from })
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

  // ---- Regole della notte, with its side boxes in the side column --------

  if input.rules != none {
    pagebreak(weak: true)
    pos("part", input.rules.from, id: "rules", label: "Regole")
    section-heading(input.rules.title, from: input.rules.from)
    if input.rules.sideBoxes.len() == 0 {
      any-blocks(input.rules.blocks)
    } else {
      columns-part(any-blocks(input.rules.blocks), { for b in input.rules.sideBoxes { callout(b) } })
    }
  }

  // ---- One part per scene ------------------------------------------------

  let field-blocks(f) = any-blocks(f.blocks)
  let inline-field(f) = {
    pos("block", f.from)
    for b in f.blocks { md(b.markdown) }
  }

  let threat-box(t) = block(width: 100%, stroke: 0.45mm + ink, inset: 3mm, below: 3.5mm, breakable: false, {
    set text(size: 8.8pt)
    set par(spacing: 1.2mm)
    block(below: 1mm, text(font: fell, size: 14pt, bottom-edge: "descender", t.name))
    block(below: 1.5mm, plex-text(size: 8.5pt, fill: grey, "Minaccia " + t.grade + if t.pack { " · branco" }))
    let row(name, boxes) = block(below: 1mm, grid(
      columns: (13mm, auto),
      align: horizon,
      plex-text(size: 8.5pt, name),
      boxes,
    ))
    let group(n) = box(stack(dir: ltr, spacing: 0.6mm, ..range(n).map(_ => checkbox())))
    let counters = calc.div-euclid(t.wounds, t.woundsPerCounter)
    row("Ferite", stack(dir: ltr, spacing: 1.4mm + 0.6mm, ..range(counters).map(_ => group(t.woundsPerCounter))))
    row("Afflizioni", group(t.afflictions))
    if t.talentNames != none {
      par[#label-text("Talenti:") #md(t.talentNames)]
    } else {
      for talent in t.talents {
        par[#label-text(talent.name)#if talent.text != "" [: #md(talent.text)]]
      }
    }
    block(above: 1.5mm, plex-text(size: 8.5pt, fill: grey, [#link(label(t.sheet))[scheda completa], p. #page-of(label(t.sheet))]))
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

  // ---- Riferimenti: clues, NPCs, sheets, pregenerated, preparation -------

  let refs = input.references
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
        block(below: 2mm, text(font: fell, size: 15pt, fill: accent, bottom-edge: "descender", sheet.title))
        any-blocks(sheet.blocks)
      })#label(sheet.label)]
    }
  }
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
