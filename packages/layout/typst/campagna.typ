// Template "Campagna": the PDF of a campaign document (campaign-pdf design
// decisions 7 to 9). It reads the JSON that toCampaignLayoutInput writes
// (src/campaign.ts) and prints nothing else. The look, the Markdown and the
// tables are the adventure's: colours, fonts and helpers come from
// avventura.typ.
//
// Every printed element calls `pos` first, so the engine knows the page of
// each section and block.

#import "/cmarker/lib.typ" as cmarker
#import "/avventura.typ": (
  ink, accent, paper-tint, grey, rule, tab-tint, serif, fell, plex, plex-text,
  pos, part-mark, label-text, page-of, h3, md, section-heading,
)

// The mark that applies to the current page: a section whose heading is at
// the top of the page, else the section continuing from the page before;
// page 1 names its first section.
#let campaign-mark() = {
  let page = here().page()
  let marks = query(<pb-part>)
  let on = marks.filter(m => m.location().page() == page)
  // A heading at the top: within a line of the top margin.
  let top = on.filter(m => m.location().position().y < 12mm + 6mm)
  let before = marks.filter(m => m.location().page() < page)
  if top.len() > 0 { top.first().value } else if before.len() > 0 { before.last().value } else if on.len() > 0 {
    on.first().value
  } else { none }
}

// The Typst label of a printed section's heading, for its page number in the
// contents box.
#let section-label(index) = label("pb-section-" + str(index))

// The table variant of a block's Markdown: the small one from six columns up.
#let table-variant(markdown) = {
  let head = markdown.split("\n").first().trim()
  if head.starts-with("|") { head = head.slice(1) }
  if head.ends-with("|") { head = head.slice(0, -1) }
  if head.split("|").len() >= 6 { "small" } else { "normal" }
}

#let campagna(input) = {
  let options = input.options
  let ink-saver = options.inkSaver
  // Ink saver: tints become white; text, rules and borders stay.
  let tint(colour) = if ink-saver { white } else { colour }
  // With the tint gone, a tinted box keeps a thin border instead.
  let tint-border = if ink-saver { 0.3mm + rule } else { none }
  let md = md.with(ink-saver: ink-saver)

  // A quote or a callout: the adventure's read-aloud box without a label.
  let quote-box(b) = block(
    width: 100%,
    fill: tint(paper-tint),
    stroke: tint-border,
    inset: (x: 4.5mm, top: 3.5mm, bottom: 2.5mm),
    below: 3.5mm,
    breakable: false,
    {
      pos("block", b.from)
      set text(style: "italic", size: 10.3pt)
      // line-height 1.42.
      set par(leading: 0.76em)
      md(b.markdown)
    },
  )

  // `### F1. La Compagnia`: the scene header's sizes, flowing, kept with the
  // block after it.
  let id-heading(b, first) = block(
    width: 100%,
    stroke: (bottom: 0.6mm + ink),
    inset: (bottom: 2.5mm),
    above: if first { 1mm } else { 6mm },
    below: 3mm,
    sticky: true,
    {
      pos("block", b.from)
      grid(
        columns: (auto, 1fr),
        column-gutter: 4mm,
        align: bottom,
        text(font: fell, size: 36pt, fill: accent, top-edge: "cap-height", bottom-edge: "baseline", b.id),
        text(font: fell, size: 22pt, bottom-edge: "descender", b.name),
      )
    },
  )

  // A block of the input; `first` when it follows its section's heading.
  let any-block(b, first) = if b.kind == "subheading" {
    if b.id != none { id-heading(b, first) } else { h3({ pos("block", b.from); b.name }) }
  } else if b.box != none {
    quote-box(b)
  } else {
    pos("block", b.from)
    md(b.markdown, table: if b.kind == "table" { table-variant(b.markdown) } else { "normal" })
    // Each block is its own paragraph, as in HTML.
    parbreak()
  }

  // ---- Page --------------------------------------------------------------

  set document(title: input.title, author: if input.author != none { input.author } else { () }, date: none)
  set text(font: serif, size: 9.5pt, fill: ink, lang: "it", hyphenate: false)
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
      let mark = campaign-mark()
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
      let mark = campaign-mark()
      let current = if mark != none { mark.tab } else { none }
      place(top + right, dy: 12mm + 8mm, stack(
        spacing: 1mm,
        ..input.tabs.enumerate().map(((i, t)) => {
          let on = i == current
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

  // ---- Head: the line above the title, the title, the credits ------------

  block(width: 100%, stroke: (bottom: 0.6mm + ink), inset: (bottom: 3mm), below: 3mm, {
    pos("block", input.head.from)
    if input.head.over.len() > 0 {
      show strong: set text(weight: "regular")
      let line = input.head.over.map(b => cmarker.render(b.markdown, smart-punctuation: false, raw-typst: false)).join(" · ")
      block(below: 2mm, plex-text(size: 8.5pt, tracking: 0.08em, fill: grey, line))
    }
    block(above: 1mm, below: 0mm, text(font: fell, size: 34pt, top-edge: "ascender", input.title))
  })
  {
    set text(size: 9pt, fill: grey)
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

  // ---- «In questa campagna»: the printed sections and their pages ---------

  let listed = input.sections.enumerate()
  let count = listed.len()
  if count > 0 {
    let entry(pair) = {
      let (i, s) = pair
      block(width: 100%, above: 0mm, below: 0mm, par(leading: 0.55em, {
        if s.newPage { text(fill: accent, "▸ ") }
        s.title
        box(width: 1fr, repeat(gap: 0.25em)[.])
        plex-text(weight: 600, fill: accent, page-of(section-label(i)))
      }))
    }
    let per = calc.ceil(count / 3)
    block(width: 100%, fill: tint(paper-tint), stroke: tint-border, inset: (x: 4mm, top: 3mm, bottom: 3.5mm), above: 4mm, below: 5mm, breakable: false, {
      block(below: 2.5mm, label-text("In questa campagna"))
      set text(size: 9pt)
      grid(
        columns: (1fr, 1fr, 1fr),
        column-gutter: 6mm,
        ..range(3).map(c => stack(spacing: 1.6mm, ..listed.slice(calc.min(c * per, count), calc.min((c + 1) * per, count)).map(entry))),
      )
    })
  }

  // ---- The text before the first section ---------------------------------

  for b in input.lead { any-block(b, false) }

  // ---- The sections, in document order ------------------------------------

  for (i, s) in listed {
    if s.newPage { pagebreak(weak: true) }
    section-heading(
      {
        // The first section and each one that starts a page name their page
        // in the review.
        if i == 0 or s.newPage { pos("part", s.from, id: "section-" + str(i), label: s.title) }
        part-mark(s.mark, s.title)
        [#metadata(i)#section-label(i)]
        s.title
      },
      from: s.from,
    )
    for (j, b) in s.blocks.enumerate() { any-block(b, j == 0) }
  }
}
