# GM prep tools: comparison for Promptbook

Researched 2026-10-18 as input to the "Analysis of writing apps and GM tools"
item in `docs/design.md`. This file covers the GM tools; writing apps are a
separate analysis.

## Method and limits

- Feature and price claims come from the tool's own site or docs where they
  could be reached, otherwise from the third-party pages listed under Sources.
  Each claim is marked when it could not be verified.
- Reddit blocks the research tool, so r/rpg, r/DMAcademy and r/gamemasters
  threads could not be read directly. Community opinion comes from Lemmy and
  Tildes threads, a Reddit summary inside a vendor page, and Sly Flourish's
  notes guide. Treat the "what GMs say" section as a sample, not a survey.
- Official pricing pages for World Anvil and Roll20 returned 403. Their prices
  below come from third-party pages and are not verified.

## What GMs say

- Obsidian is the most recommended prep tool in the threads found: "everything's
  a text file on your computer", good TTRPG plugins. One user found it
  intimidating next to Notion; another found Sync too expensive for several
  devices; another had trouble with a vault on a NAS and wanted something
  self-hosted.
- Sly Flourish moved from Notion to Obsidian in 2025 because he prefers raw
  Markdown files, and still uses paper at the table. His structure is small: a
  folder per campaign, one characters page, one NPC list, maps, one page per
  session named by date, and a catch-all folder. Each session follows the eight
  Lazy DM steps (characters, strong start, scenes, secrets and clues, locations,
  NPCs, monsters, treasure). His rule: record only what you can't remember.
- World Anvil is called the most complete campaign wiki, and also "too much".
  One user lost nested articles after a year of use and was told by support not
  to use nested articles.
- Others in use: OneNote, Google Docs, Trilium, Logseq, The Goblin's Notebook,
  Foundry VTT journals, paper notebooks, and ChatGPT for names and descriptions
  ("a bit repetitive").
- Some TTRPG communities ban AI-generated content, and a plugin author warned
  that building with Claude Code might put people off. AI features are
  divisive among GMs.

## The tools

Twelve tools, grouped as campaign wikis (World Anvil, LegendKeeper, Kanka),
general notes (Notion, Obsidian), VTTs with prep (Foundry, Roll20, Alchemy,
Quest Portal), AI assistants (Archivist) and audio (Syrinscape, Tabletop
Audio).

### World Anvil

- **Prep:** Worldbuilding wiki plus campaign tools: NPCs, PC sheets, statblocks,
  journals, session notes, map markers, a community statblock library. Session
  logs are journals of numbered entries.
- **Secrets:** The strongest model found. A secret can sit inside a public
  article, timeline or map, and is shown only to a subscriber group, so each
  player can see different, even conflicting, information. Guild only (paid).
- **Offline and sync:** None found. Web only.
- **Data:** Guild members export a whole world as a zip with JSON and basic
  HTML; free users export one article at a time. Export runs on the server and
  is delivered later; a request for direct download was declined as "a massive
  dev undertaking". There were export failures from April to May 2026 and a
  report that notebook contents were missing from exports. No official
  re-import found. A community tool converts the export to Markdown for
  Obsidian.
- **AI:** No official built-in AI found. In 2024 the team declined an AI
  feature request as out of scope. One third-party blog mentions an AI "Sage";
  Sage is also a membership tier name. Not verified. Community MCP servers use
  the Boromir API, which needs the Grandmaster tier.
- **To the table:** Player-facing wiki; no PDF or audio found.
- **Price:** Free tier plus guild tiers. Third-party figures conflict (about
  $4.50–7 per month for the lower tiers, $105 per year for Grandmaster). Not
  verified.
- **Borrow:** Secrets inline in otherwise visible content. **Avoid:** export
  that is a server-side job, not re-importable, and occasionally broken.

### LegendKeeper

- **Prep:** Wiki with auto-linked terms and tags, reusable templates, nested
  maps with pins, infinite whiteboards for plots and quest flows, timelines and
  calendars.
- **Secrets:** GM-only notes embedded in wiki pages, plus permissions.
- **Offline and sync:** Works offline and syncs later. Built on Yjs since 2021
  (about 2.5 million Yjs documents in production then). The client is
  "sovereign": it decides the next state and the server mainly validates and
  relays. Map processing needs the cloud; processed tiles are cached. A
  "downloading project" dialog covers first sync on a new browser, and a local
  article history keeps the latest 64 snapshots.
- **Data:** Imports HTML, text, Markdown, JSON, Obsidian vaults, World Anvil
  zips and Campfire HTML (help page dated January 2026). Exports whole wiki to
  HTML (a static site with links kept) and JSON. Owners keep view and export
  after a subscription lapses.
- **AI:** None. The FAQ says it has no generative AI features.
- **To the table:** Shared to players, who need no account; sits next to a VTT.
  No PDF or audio found.
- **Platforms and price:** Web, no native mobile app. Free viewer; Pro $9 per
  month or $90 per year. Players free.
- **Borrow:** almost all of its sync design, the import breadth, and the "you
  can always leave" export promise. **Avoid:** offline features that stop at
  cloud-only steps (maps).

### Kanka

- **Prep:** About 20 entity types (characters, locations, quests, journals,
  calendars, events, timelines…). Quests track rewards, participants and
  secretly involved organisations and can be marked complete. Journals hold
  session plans and recaps tied to calendar dates. @-mentions link entries.
  "Property kits" act as templates.
- **Secrets:** Private relations, private map pins, private sections via an
  extra article on an entry, roles per member, and a "view as member" preview.
- **Offline and sync:** No mobile app, no offline mention found.
- **Data:** Zip export with JSON or Markdown files, once a day. API at up to 90
  requests per minute. No official MCP found.
- **AI:** None found.
- **Price:** Core free with unlimited entries and campaigns. Premium per
  campaign: $4.99, $9.99 or $24.99 per month (less yearly).
- **Borrow:** "view as" preview; quests with status. **Avoid:** twenty entity
  types to choose from before writing a word.

### Notion (with GM templates)

- **Prep:** General pages and databases. GM templates are third-party, for
  example a pay-what-you-want campaign notebook with session pages, or a $10
  "campaign codex" with a session-zero planner.
- **Offline and sync:** Desktop and mobile apps only, not the browser. Pages
  must be downloaded one by one; subpages are not included; only the first 50
  rows of a database's first view are kept. Paid plans also keep recent and
  favourite pages. Offline edits sync on reconnect.
- **Data:** Pages export to Markdown, databases to CSV with Markdown subpages,
  callouts as HTML. Whole-workspace export by email link, can take up to 30
  hours.
- **AI:** Notion Agent on Business and Enterprise; Free and Plus get a trial.
  Custom agents use credits ($10 per 1,000). Official hosted MCP server that
  reads, creates and updates pages and databases.
- **Price:** Free; Plus €9.50; Business €19.50 per member per month.
- **Borrow:** an official MCP that can write. **Avoid:** offline as an opt-in
  per page, with silent limits.

### Obsidian, with GM plugins and vaults

- **Prep:** Local Markdown vault with links and plugins. GM plugins:
  Fantasy Statblocks (bestiary and statblocks, 5e, PF2e, 13th Age, Daggerheart
  attributions), Initiative Tracker (`encounter` code blocks in notes, reads
  Fantasy Statblocks), Dice Roller (inline dice and rolls on tables, lines or
  tagged notes), GM Map (second-screen player view with fog of war and DM-only
  markers). Strong Start (2026) adds the eight-step Lazy DM prep board, a run
  mode with a timer and scene list, masked secrets that carry forward until
  revealed, all stored as Markdown front matter with no network calls.
  Community vault kits (for example The Gamemaster's Vault) give folders and
  templates for sessions, characters, factions and locations.
- **Offline and sync:** Fully offline; files on the device. Sync is end-to-end
  encrypted with a year of history, $4–5 per month.
- **Data:** Plain Markdown files; no lock-in.
- **AI:** None built in. Community MCP servers reach the vault through the
  Local REST API plugin while the desktop app runs.
- **To the table:** Whatever the GM opens; GM Map for a player screen.
- **Price:** App free; Sync $4/$5, Publish $8/$10 per month.
- **Borrow:** Markdown as the stored form, strong-start structure, secrets
  that carry forward. **Avoid:** a stack of independent plugins; the javalent
  READMEs warn that "bugs may delete data".

### Foundry VTT journals

- **Prep:** Journal entries made of pages: text, image, video, PDF. Text pages
  use ProseMirror by default, with a Markdown sheet option. Links by drag and
  drop or `@UUID[…]`, including links to a page header.
- **Secrets:** Secret blocks visible only to GM and owner, with a reveal button.
  Ownership levels per entry (none, limited, observer, owner).
- **Offline and sync:** Self-hosted server; runs without internet on the GM's
  machine (not checked against docs).
- **Data:** Stored in Foundry's world; Markdown export through modules (Export
  Markdown, Export Journals, GG Sheet Export, which drops secret blocks by
  default).
- **AI:** Community MCP bridges for Claude Desktop (Foundry v13–v14); one
  creates actors, NPCs and quest journals.
- **To the table:** "Show players" for a whole entry or a single page; images
  and videos as handouts; full VTT.
- **Price:** $50 one-time licence with all future updates.
- **Borrow:** per-page "show to players" and secret blocks with reveal.
  **Avoid:** HTML as the stored form.

### Roll20

- **Prep:** Journal with handouts and characters. Handouts have a GM Notes
  field shown only to GMs; map pins show a handout's GM notes only to the GM.
- **Audio:** Jukebox with playlists; uploads of MP3, OGG and FLAC up to 20 MB,
  counted against storage.
- **Offline and sync:** Browser VTT; no offline found.
- **AI and data:** Not researched in depth.
- **Price:** Free; Plus $5.99 and Pro $10.99 per month (2021 prices from
  Roll20's help centre; current prices not verified).
- **Borrow:** a GM-only note on every handout. **Avoid:** nothing specific.

### Alchemy RPG

- **Prep:** Scene-first VTT for theatre of the mind. A scene bundles animated
  background art, overlays, ambience and music, toggled per scene. Handouts and
  lore can be shown to players. Homebrew system builder.
- **Offline and sync:** Not mentioned.
- **AI:** The FAQ has a question on generative AI, but the answer was not
  readable. Not verified.
- **To the table:** Online play, streamer mode, spectators.
- **Platforms and price:** Web, Windows, Mac, Linux. Unlimited access is free;
  an "Alchemist" supporter tier exists (price not shown). In 2023 the paid tier
  was $8 per month.
- **Borrow:** the scene as the unit that binds image and music, which
  Promptbook's asset board already assumes.

### Quest Portal

- **Prep:** VTT with campaigns, scenes, maps, collaborative notes. Every scene
  comes with ambient music; GMs pair their own visuals with the music library.
- **AI:** Paid Game Master Assistant: scenes, NPCs, locations, notes, whole
  one-shots, scene and handout art with Google's Nano Banana, NPC portraits,
  battlemaps, PDF import as a searchable library. Credit-metered. No AI music.
- **To the table:** Online VTT.
- **Price:** Free tier; Pro with credits, price not shown (it was $8 per month in
  2023).
- **Note:** The closest thing found to Promptbook's pipeline. See below.

### Archivist

- **What it is:** AI campaign memory, after the session. Records via a Discord
  bot or uploaded audio, writes recaps, timelines, a compendium of characters,
  places and factions, a quest log, two-page PDF session handouts.
- **AI and MCP:** Official Campaign MCP for Claude and others; Nexus installs it
  into Claude Desktop and can connect Foundry, Notion and Obsidian. Sources
  conflict on whether the MCP can write.
- **Price:** $10 to $60 per month by number of campaigns and sessions.
- **Relevance:** The post-session side overlaps gdrarchive, not Promptbook. Its
  MCP shows the pattern Promptbook wants: Claude reads a campaign brief, works,
  writes back.

### Syrinscape

- **Audio:** 1,800 SoundSets including adventure-specific sets for D&D,
  Pathfinder, Call of Cthulhu and others. Players join remote play with no
  account. SuperSyrin adds the full library, remote play and creation tools,
  including uploads of your own tracks.
- **Price:** SuperSyrin $12.99 per month; 18 SoundSets free.
- **Borrow:** a cue per scene shipped with the adventure. **Avoid:** it is a
  library, not a place for the GM's own Suno tracks.

### Tabletop Audio

- **Audio:** Free, ad-free library of about ten-minute ambience and music
  tracks, filtered by setting and mood, with downloads, playlists and SoundPad.
  Supported by Patreon. Licence terms not found.
- **Relevance:** A fallback when a scene has no Suno track; no prep features.

### Others seen

- **The Goblin's Notebook:** prep tool with custom relationships between
  entities, about $3 per month on Patreon. Not checked.
- **LoreKeeper:** AI worldbuilding from uploaded lore; portraits, maps and
  "cinematic storyboards", video scenes in beta. Only third-party sources.
- **Grimoire (ttrpg.bot):** MCP with 41 tools for NPCs, locations, factions,
  quests and recaps.
- **Sessionbound:** GM toolkit in development on itch.io with AI recaps.

## Does anything already do Promptbook's pipeline?

No. Nothing found takes adventure text, writes image and music prompts per
scene, takes the downloaded files back and matches them to scenes, and then
produces both a table PDF and a cue-player package.

The closest pieces:

- **Quest Portal** binds scene art and music, and its AI makes scene art
  (Nano Banana) from campaign notes. But it lives inside its own online VTT,
  has no AI music, uses its own image model rather than the GM's Midjourney
  account, has no PDF, and does not export to anything like CueBard.
- **Alchemy** binds art and music per scene, by hand, inside its VTT.
- **LoreKeeper** makes visuals from lore, without music. Beta, unverified.
- **Strong Start** gives a structured Markdown prep format with secrets and a
  run mode, but no assets.
- No tool matches Midjourney or Suno downloads to scenes by filename.

This does not change the decision to build. The pieces that exist are tied to
an online VTT, and Promptbook's targets (Midjourney, Suno, CueBard, in-person
table, offline iPad) are outside all of them.

## Comparison

| Tool           | Prep structure                     | Secrets                      | Offline / sync                 | Format / export                   | AI                           | To the table         | Price                       |
| -------------- | ---------------------------------- | ---------------------------- | ------------------------------ | --------------------------------- | ---------------------------- | -------------------- | --------------------------- |
| World Anvil    | Wiki, journals, statblocks         | Inline, per subscriber group | None                           | JSON+HTML zip, paid; no re-import | None official; community MCP | Player wiki          | Free + guild (unverified)   |
| LegendKeeper   | Wiki, maps, boards, timelines      | Inline GM notes              | Yes, Yjs, client-sovereign     | HTML, JSON; imports MD, Obsidian  | None by policy               | Player share         | $9/mo, $90/yr               |
| Kanka          | ~20 entity types, quests, journals | Private parts, "view as"     | No                             | JSON or MD zip, daily; API        | None found                   | Player wiki          | Free; $4.99–24.99/mo        |
| Notion         | Pages, databases, 3rd-party kits   | Page permissions             | Per page, 50 db rows, apps     | MD + CSV                          | Agent on Business; MCP       | Share pages          | Free; €9.50–19.50/mo        |
| Obsidian       | Markdown vault + plugins           | Plugin-level (Strong Start)  | Full, local files              | Plain Markdown                    | Community MCP                | GM Map second screen | Free; Sync $4–5/mo          |
| Foundry VTT    | Journals of pages                  | Secret blocks, reveal        | Self-hosted                    | World DB; MD via modules          | Community MCP                | Show players, VTT    | $50 once                    |
| Roll20         | Handouts, characters               | GM Notes field               | No                             | Not checked                       | Not checked                  | VTT, jukebox         | Free; $5.99–10.99 (2021)    |
| Alchemy RPG    | Scenes with art + music            | Not found                    | Not found                      | Not found                         | Unclear                      | Online scene VTT     | Free; supporter tier        |
| Quest Portal   | Scenes with music, notes           | Not found                    | Not found                      | Not found                         | Built in, credits, scene art | Online VTT           | Free; Pro (price not shown) |
| Archivist      | Post-session memory                | n/a                          | No                             | PDF handouts; API                 | Core product; official MCP   | Recaps, PDFs         | $10–60/mo                   |
| Syrinscape     | Sound sets per adventure           | n/a                          | Download player                | Proprietary                       | No                           | Remote play, VTT     | $12.99/mo                   |
| Tabletop Audio | Ambience library                   | n/a                          | Downloads                      | Audio files                       | No                           | Playback             | Free, Patreon               |
| Promptbook     | Strict scene template, to-do       | GM-only by design            | Yjs, PWA, full offline editing | Markdown; .cbpack; PDF            | MCP, BYO generators          | PDF, CueBard         | Self-hosted                 |

## Gaps Promptbook fills

- The asset pipeline: per-scene image and music prompts, intake by filename,
  status per asset. Nothing found does this.
- Output for an in-person table: a typeset PDF and a CueBard cue package from
  the same text.
- An MCP that writes into a prep document and keeps a brainstorm log. Archivist
  and Notion have MCPs, but neither is built around prep from a Claude
  brainstorm.
- Prep status and a to-do list per project with templates per category. No
  tool found has a prep checklist; Strong Start's eight steps are the nearest.
- Full offline editing with Markdown as the stored form. Obsidian has this but
  no structure; LegendKeeper has sync but stores rich text.

## Gaps Promptbook does not fill (by choice)

- Player-facing wiki, per-player secrets, player accounts.
- Maps and atlases, timelines, calendars, relationship boards.
- VTT features: tokens, fog of war, initiative, statblocks, dice.
- Session recording and recaps (gdrarchive's job, Archivist's market).
- A sound library; it holds only the GM's own tracks.

## Ideas to borrow, ranked

1. Client-sovereign Yjs sync, a first-sync "downloading project" screen and
   local snapshots — LegendKeeper — same stack, proven at scale, answers the
   offline requirement — phase 1.
2. Lazy DM eight steps as an optional to-do and section template — Strong
   Start, Sly Flourish — widely used prep method that fits per-category
   templates — phase 1.
3. Secrets that carry forward until marked revealed — Strong Start — a
   campaign's open threads become visible across sessions — phase 1 (as to-do
   or tagged lines), richer later.
4. Import from an Obsidian vault, a Notion Markdown export and a World Anvil
   zip — LegendKeeper — the Markdown folder import already covers two of three
   — phase 1 (Markdown), phase 5 (World Anvil JSON).
5. Whole-project export as a Markdown folder plus assets, always available —
   LegendKeeper — no lock-in, and a backup that is not the server — phase 1.
6. A per-image "show to players" flag, separate from GM reference images —
   Foundry, Roll20 — only player-safe images go into CueBard's visual folders
   (to check: whether CueBard visuals are shown to players) — phase 2–3.
7. A GM note on each asset row — Roll20 GM Notes — keeps "use this when they
   open the door" next to the image — phase 2.
8. "Preview as the table sees it" for the PDF and the `.cbpack` — Kanka's
   view-as-member — catches a leaked note before the session — phase 3–4.
9. Auto-linking of NPC and place names — LegendKeeper, Kanka @-mentions —
   cheap in Markdown with a name index — after phase 1.
10. A small, focused MCP surface: read brief and log, append log, edit
    document, update to-do — Archivist MCP versus Grimoire's 41 tools — fewer
    tools are easier for Claude to use well — phase 1.

## Avoid

- Offline as opt-in per page, with silent limits (Notion), or features that
  quietly need the cloud (LegendKeeper's map processing). In Promptbook the
  whole project is offline or the gap is shown.
- Export as a delayed server job with no re-import (World Anvil, Notion's
  workspace export, Kanka's once a day).
- Deep nesting that the tool itself cannot keep safe (the World Anvil report).
- Entity-type sprawl before writing starts (Kanka's 20 types, World Anvil's
  learning curve). Keep the document first.
- Built-in AI paid in credits (Quest Portal, Notion). Keep AI in Claude through
  MCP and generators as a per-row choice.
- HTML or rich text as the stored form (Foundry ProseMirror, Notion callouts
  exported as HTML).
- A stack of independently maintained plugins for core features (Obsidian GM
  setups).

## Sources

- [World Anvil Codex: subscribers](https://www.worldanvil.com/w/WorldAnvilCodex/a/subscribers)
- [World Anvil: get started with secrets](https://www.worldanvil.com/learn/beginner-tutorials/get-started-secrets)
- [World Anvil FAQ](https://www.worldanvil.com/faq)
- [World Anvil: how to export your world](https://www.worldanvil.com/learn/world/export)
- [World Anvil bug: world export not working](https://www.worldanvil.com/udan-tracker/c7769331-e50b-48fe-be60-a423bc0ea4e1/view)
- [World Anvil bug: notebook contents missing from export](https://www.worldanvil.com/udan-tracker/1e96308d-a7bd-4a5c-add4-4bad7349c633/view)
- [World Anvil suggestion: direct export download](https://www.worldanvil.com/community/voting/suggestion/05f7639b-3686-474b-ab1e-ac5e86cebbd8/view)
- [World Anvil suggestion: AI novel writer (declined)](https://www.worldanvil.com/community/voting/suggestion/182ee13a-ceb8-4bb8-b53d-904bfb2a326e/view)
- [WorldAnvil-to-MD converter](https://github.com/Nynir/WorldAnvil-to-MD)
- [World Anvil MCP (datagen24)](https://glama.ai/mcp/servers/@datagen24/World-Anvil-MCP)
- [Kindlepreneur: World Anvil review](https://kindlepreneur.com/world-anvil/)
- [Self Publishing School: World Anvil review](https://self-publishingschool.com/world-anvil-review/)
- [DM Tools AI: best AI tools for DMs 2026](https://dmtoolsai.com/best-ai-tools-for-dungeon-masters-in-2026/)
- [Sudowrite: best AI for worldbuilding](https://sudowrite.com/blog/what-is-the-best-ai-for-worldbuilding-we-tested-the-top-tools/)
- [LegendKeeper home](https://www.legendkeeper.com/)
- [LegendKeeper pricing](https://www.legendkeeper.com/pricing)
- [LegendKeeper: import your world](https://www.legendkeeper.com/import-world-legendkeeper/)
- [LegendKeeper 0.7.4: full wiki export](https://www.legendkeeper.com/changelog/legendkeeper-0-7-4-full-wiki-export/)
- [LegendKeeper 0.7.9: article history](https://prod.legendkeeper.com/changelog/legendkeeper-0-7-9/)
- [LegendKeeper 0.8.0.2: sync model](https://www.legendkeeper.com/changelog/legendkeeper-0-8-0-2-small-fix-and-some-thoughts/)
- [LegendKeeper 0.9.0.7: downloading project dialog](https://www.legendkeeper.com/changelog/legendkeeper-0-9-0-7/)
- [Yjs forum: LegendKeeper on Yjs](https://discuss.yjs.dev/t/legendkeeper-world-building-for-stories-and-rpgs/708)
- [LegendKeeper commitments (export)](https://www.legendkeeper.com/lk-weekly-short-term-priorities-mind-melding-and-our-commitments-to-you/)
- [Kanka features](https://kanka.io/features)
- [Kanka pricing](https://kanka.io/pricing)
- [Kanka knowledge base](https://kanka.io/kb)
- [Notion pricing](https://www.notion.com/pricing)
- [Notion: use pages offline](https://www.notion.com/en-gb/help/use-pages-offline)
- [Notion: export your content](https://www.notion.com/help/export-your-content)
- [Notion MCP](https://developers.notion.com/docs/mcp)
- [Digital Campaign Notebook (Notion template)](https://danielhkwan.itch.io/campaign-notebook)
- [DnD Campaign Codex (Notion template)](https://wassername.gumroad.com/l/dnd-campaign-codex)
- [Obsidian home](https://obsidian.md/)
- [Obsidian pricing](https://obsidian.md/pricing)
- [Fantasy Statblocks](https://github.com/javalent/fantasy-statblocks)
- [Initiative Tracker](https://github.com/javalent/initiative-tracker)
- [Dice Roller](https://github.com/javalent/dice-roller)
- [GM Map plugin](https://community.obsidian.md/plugins/gm-map)
- [Strong Start plugin](https://community.obsidian.md/plugins/strong-start)
- [The Gamemaster's Vault](https://mattslaton.itch.io/the-gamemasters-vault)
- [Obsidian MCP REST server](https://glama.ai/mcp/servers/@PublikPrinciple/obsidian-mcp-rest)
- [Foundry VTT: journal entries](https://foundryvtt.com/article/journal/)
- [Foundry VTT: purchase](https://foundryvtt.com/purchase/)
- [Foundry module: Export Markdown](https://foundryvtt.com/packages/export-markdown)
- [Foundry module: Export Journals](https://foundryvtt.com/packages/exportjournals)
- [Foundry module: GG Sheet Export](https://www.foundryvtt-hub.com/package/gg-sheet-export/)
- [Foundry VTT MCP (Gnuminator)](https://glama.ai/mcp/servers/Gnuminator/Foundry-VTT-MCP)
- [Roll20 wiki: Handout](https://wiki.roll20.net:443/Handout)
- [Roll20 help: Jukebox](https://help.roll20.net/hc/en-us/articles/360039178714-Jukebox)
- [Roll20 help: subscriptions](https://help.roll20.net/hc/articles/360037774633)
- [Roll20 price increase announcement](https://bloghub.roll20.net/posts/roll20-pricing-increase-announcement)
- [Alchemy RPG home](https://alchemyrpg.com/)
- [StartPlaying: Alchemy VTT how-to (2023)](https://startplaying.games/blog/posts/alchemy-vtt-what-how-to)
- [Quest Portal pricing](https://www.questportal.com/pricing)
- [Quest Portal Pro](https://www.questportal.com/pro)
- [Quest Portal: scenes and music](https://www.questportal.com/sprouting)
- [Quest Portal: Game Master Assistant (2025)](https://www.questportal.com/blog/prep-less-play-more-the-game-master-assistant-has-your-back)
- [StartPlaying: beginner's guide to Quest Portal (2023)](https://startplaying.games/blog/posts/beginners-guide-quest-portal)
- [Archivist home](https://www.myarchivist.ai/)
- [Archivist pricing](https://www.myarchivist.ai/pricing)
- [Archivist MCP interview](https://www.myarchivist.ai/blog/archivist-mcp-interview)
- [Archivist Nexus](https://www.myarchivist.ai/nexus)
- [Archivist MCP listing](https://claudemarketplaces.com/mcp/io.github.astrotomic/archivist-ai)
- [Grimoire MCP listing](https://claudemarketplaces.com/mcp/bot.ttrpg/grimoire)
- [Syrinscape home](https://syrinscape.com/)
- [Syrinscape: get started (price)](https://syrinscape.com/get-started/)
- [Tabletop Audio](https://tabletopaudio.com/)
- [LoreKeeper on G2](https://ai.g2.com/marketplace/tools/lorekeeper)
- [LoreKeeper on Toolmage](https://www.toolmage.com/en/tool/lorekeeper/)
- [Sessionbound](https://netox.itch.io/sessionbound)
- [Sly Flourish: organizing notes (2025)](https://slyflourish.com/organizing_notes.html)
- [ttrpg.network thread: tools you use for prep](https://www.rblind.com/post/14544434)
- [lemmy.world thread: world building tools](https://www.rblind.com/post/25987606/11525854)
- [r/DMToolkit thread: session prep note-taking app (2024, mirror; seen only as a search summary)](https://redlib.hbubli.cc/r/DMToolkit/comments/1aqbofd/session_prep_note_taking_app)
- [r/rpg thread: campaign management site (2021, mirror; seen only as a search summary)](https://redlib.ssps.io/r/rpg/comments/pni8vv/campaign_management_site)
- [Tildes thread: world building tools (2023)](https://tildes.net/~games.tabletop/16zm/dms_and_gms_what_tool_or_tools_do_you_use_for_world_building)
- [LegendKeeper: World Anvil alternatives (vendor page)](https://www.legendkeeper.com/best-world-anvil-alternatives/)
