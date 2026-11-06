# How tabletop RPGs write a threat sheet

Source note: every system section (1 to 7) is **from memory**; I did not
run WebSearch or WebFetch, so nothing there is confirmed against an SRD. The
Kulthos section (8) is **confirmed** from the repo files named in it.
Where I am unsure of an exact number it is marked "(unsure)".

Type vocabulary: text (free text), num (number), die (single die, e.g. d6),
pool (dice pool, e.g. 4 dice), pct (percentage skill), list (list of
items), track(N) (row of N boxes), clock(N) (circle of N segments),
tags (list of short phrases such as aspects).

---

## 1. D&D 5e (2014 SRD 5.1; 2024 changes)

### Stat block, in order (2014)

1. Name (text)
2. Size, type, tags, alignment (text; line "Medium humanoid (goblinoid), neutral evil")
3. Armor Class (num + text note: "15 (leather armor, shield)")
4. Hit Points (num + dice expression + text: "7 (2d6)")
5. Speed (list of movement mode + distance: walk, fly, swim, climb, burrow)
6. Six ability scores STR DEX CON INT WIS CHA (num each, with modifier in brackets, derived: floor((score-10)/2))
7. Saving Throws (list of ability + bonus; optional)
8. Skills (list of skill + bonus; optional)
9. Damage Vulnerabilities / Resistances / Immunities (lists of damage types)
10. Condition Immunities (list)
11. Senses (list: darkvision 60 ft., passive Perception 9)
12. Languages (list)
13. Challenge (num/fraction + XP: "1/4 (50 XP)")
14. Traits (list of named rules text entries; some with uses "3/Day")
15. Actions (list of named entries; attacks use the template "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6+2) slashing damage.")
16. Bonus Actions, Reactions (lists)
17. Legendary Actions (preface text + list with costs), Lair Actions (list); only for bosses
18. Description / notes (text, outside the block)

### 2024 changes (memory)

- Header line reordered: size/type/alignment on one line, then AC, Initiative, HP, Speed.
- **Initiative** is a new field: modifier and passive score ("Initiative +2 (12)").
- **Ability table** is now a 3-column layout, each ability with score, modifier and **save bonus** side by side; the separate "Saving Throws" line goes away.
- Skills, Resistances, Vulnerabilities, Immunities, Senses, Languages stay as lines; Immunities merge damage and condition immunities into one line.
- "Challenge" becomes **CR** with XP and **PB** (proficiency bonus) shown: "CR 1/4 (XP 50; PB +2)".
- Sections renamed: Traits, Actions, Bonus Actions, Reactions, Legendary Actions; Multiattack stays the first Action; attack text is shortened ("Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6+2) Slashing damage.") with saves written "Dexterity Saving Throw: DC 13".
- Legendary creatures show a lair CR and XP variant ("CR 10 (XP 5,900, or 7,200 in lair)").
- Spellcasting traits list spells by frequency ("At Will", "1/Day Each") using a standard layout.

### Example

```
Cellar Ghoul        Medium undead, chaotic evil
AC 12   HP 22 (4d8+4)   Speed 30 ft.
STR 13 (+1)  DEX 15 (+2)  CON 10 (+0)  INT 7 (-2)  WIS 10 (+0)  CHA 6 (-2)
Skills Stealth +4
Damage Immunities poison; Condition Immunities charmed, exhaustion, poisoned
Senses darkvision 60 ft., passive Perception 10   Languages Common
Challenge 1 (200 XP)   Proficiency Bonus +2
Claws. Melee Weapon Attack: +4 to hit, reach 5 ft. Hit: 7 (2d4+2) slashing damage;
target makes a DC 10 CON save or is paralysed 1 minute.
```

### What the GM tracks in play

Current HP (a number, or HP boxes/ticks when homebrew; a printed line "HP ___ / 22"); conditions; initiative order; uses per day of traits ("3/Day" as tickable boxes); legendary action pool (3 boxes per round); recharge (5-6) as a die note; concentration. Printed sheets: an HP line, 1 to 3 use boxes, an initiative slot.

### Derived values

- Ability modifier = floor((score-10)/2).
- Proficiency bonus from CR (CR 0-4: +2, 5-8: +3, 9-12: +4, 13-16: +5, 17-20: +6, 21-24: +7, 25-28: +8, 29-30: +9).
- XP from CR (lookup table: 1/4 gives 50, 1 gives 200, 5 gives 1,800).
- Attack bonus = ability mod + PB; save DC = 8 + ability mod + PB.
- Passive Perception = 10 + Wis mod (+ PB if proficient).
- HP expression = dice count x die average + CON mod x count; the average is derived from the hit dice and size (die by size: Tiny d4, Small d6, Medium d8, Large d10, Huge d12, Gargantuan d20).

### Variants

Swarm (one creature with swarm type, resistances to many damage types, no extra mechanics); minions (2024 has none, 4e did); legendary creatures with lair actions; "NPC" blocks (same shape, role names); variant spellcaster blocks (spell list as a trait).

### Other sheet kinds

PC sheet (abilities, HP, spell slots as boxes, class resources); vehicle/ship stat blocks (AC, HP, weapon stations); hazards/traps (DC, damage lines); lairs (map + lair actions).

---

## 2. Blades in the Dark

### Structures (memory)

Blades has no single "stat block"; threats are loose and GM-facing:

**NPC (one line in the GM section):** Name, role/tags (text), sometimes a quality note. Quality is given through the scale: a "Tier" of the faction or an implied level.

**Faction entry (Crew/gang):**

1. Name (text)
2. Tier (num, 0 to V, usually written as Roman numeral)
3. Type (text; e.g. Criminal, Fringe, Institution)
4. Hold (enum: Weak / Strong)
5. Turf (list of districts/places, text)
6. Assets (list of text)
7. Notable NPCs (list of text)
8. Allies / Enemies (list of faction refs, with status number -3 to +3)
9. Situation (text)
10. Goal(s) (list of text; each often a clock)

**Clock** is the main tracked object: segments 4, 6, 8 or 12; named ("Bluecoats close in on the crew"); used for threats, projects, countdowns, and faction goals.

**Score threats:** a danger given as a set of tags: "Armed guard, quality 2", "Elite Bluecoat, Tier II".

### Example

```
The Lampblacks   Tier II   Hold: Strong   Type: Criminal (smugglers)
Turf: three docks
Assets: ghost lights, rope crews
Goal: take the Dockers' warehouse  [clock 6]
Allies: Cabbies (+1)   Enemies: Dockers (-2)
```

### What the GM tracks

Clocks (segments filled), hold changes, faction status with the crew (-3 to +3), Heat/Wanted (clock-like), position/effect of rolls (not stored on the threat). Printed sheet: clock circle(s) near each faction goal, Tier numeral, Hold toggle (two boxes).

### Derived values

Tier gives the **quality** of the faction's assets and the dice used for faction actions (Tier + conflict modifiers: in downtime a faction rolls dice equal to its Tier, with Hold modifying the stakes). Tier gives the number of "NPC capabilities" in the usual reading; Hold gives rules for how hard they are to push out. Rep/Turf of the crew grows tier. (Details memory, unsure.)

### Variants

Mook-like threats: a gang is one threat at its Tier with a quality; named NPCs: a name plus a one-line description; "Ghost" or "Spirit" threats: a Tier and a clock; supernatural entities (Demons) with their own tags.

### Other sheets

Crew sheet (Tier, Hold, Rep boxes, Heat, Wanted level, upgrades as checkboxes); Playbook sheets for PCs (action dots as small tracks, stress/trauma boxes, harm lines); Claims map (hex-like turf grid with ticks); Score/Job sheet (target, engagement roll, clocks).

---

## 3. Powered by the Apocalypse

### 3a. Apocalypse World 2e threats (memory)

Order of a threat entry:

1. Name (text)
2. Kind (enum, one of: Warlord, Grotesque, Brute, Landlord, Cannibal, Wolf, Pack, ... within a **threat type**: Affliction, Brute, Grotesque, Landscape, Warlord, Wolf, etc.). Each kind is a short list within the type.
3. Impulse (text: "to seize and control")
4. Moves/what they do (list of short text; the GM selects **custom moves** from the type's own list)
5. Harm (num: how many harm the threat deals, as in "2-harm hand", "3-harm ap")
6. Armor (num: "2-armor")
7. Wounds/harm capacity: written as a harm countdown (clock of 6 or 12 segments: 6 for most threats), or a "kill or hurt" count
8. Description / Tags (text)
9. Stakes or Countdown (a clock "about midnight", "midnight" for the bigger problems)

**Threat map:** each front has a list of threats; each threat has a Cast description (text) and a List of "Dark futures" (list of short text) and **"Stakes"** (questions).

### Example

```
Dremmer (Warlord)   Impulse: to own the water
Moves: sends crews to take stills; offers false peace; breaks a promise
Harm: 2-harm (gang) 3-harm (his gun)   Armor: 1-armor (gang)
Countdown: [ ][ ][ ][ ][ ][ ]  (midnight)
```

### 3b. Monster of the Week monsters

1. Name (text)
2. Type / Role (enum: Beast, Fiend, Hunter, ... "Monster type")
3. Description (text)
4. Powers (list of text)
5. Attacks (list of text with harm e.g. "Claws (3-harm, intimate)")
6. Harm capacity (num: usually 5 to 15)
7. Armor (num)
8. Weakness (list of text, one key weakness the hunters find)
9. Moves (list of text; a few GM-move lines to use)
10. Motivation (text)
11. Custom moves (list; sometimes with dice)

### Example

```
Marsh Wraith   Type: Spook
Motivation: to drag the living under
Attacks: grasping hands (2-harm, intimate, ignore-armor)
Harm capacity: 7   Armor: 0 (while wet)
Weakness: salt water; its bones in the sinkhole
Moves: pull someone underwater; take a name; vanish into fog
```

### 3c. Dungeon World monsters

1. Name (text)
2. Tags (tags: Solitary / Group / Horde, Intelligent, Magical, Organized, Planar, Stealthy, Terrifying, Hoarder, Cautious, Construct, Devious, Amorphous)
3. Attack (list of text + damage dice: "Claws (d8+1 damage)")
4. Damage dice (die, the monster's base damage die)
5. HP (num)
6. Armor (num)
7. Tags on the attack (tags: close, reach, near, far, messy, forceful, piercing, hand)
8. Special qualities (list of text: "Always hungry", "Hates the light")
9. Instinct (text: "to feed")
10. Moves (list of text, GM moves)

### Example

```
Cave Troll   Group, Large, Intelligent
Hits (d10+1 damage) close, forceful   HP 16   Armor 1
Special: regenerates unless burned
Instinct: to eat
Moves: pick up an enemy; call the pack; throw boulder
```

### What the GM tracks

Harm taken (a track; one box per HP in Dungeon World; Apocalypse World usually uses a clock of 6 for harm); countdown clocks (6 segments with fixed labels, "Stakes"); fronts (cards listing dark futures, each with a clock or "Doom" step line). Printed sheet: harm boxes (HP), armor number, countdown clocks, Instinct line.

### Derived values

In PbtA: harm minus armor = harm taken (applied at the roll); "ap" and "ignore-armor" tags change that. Dungeon World: damage die + modifiers by tag; a monster's HP/armor/damage are the three stats. Almost no stored derived values; derived values are rules done at the table (harm - armor).

### Variants

Dungeon World: Solitary / Group / Horde sets the stat scale (a Horde is a swarm, a Solitary is a boss). Apocalypse World: threat types (Brute, Warlord...) give the kind + impulse templates. MotW: Minions and bosses (the Big Bad uses the same format but with a larger harm capacity, more moves, and a "countdown" tied to the mystery).

### Other sheets

PC playbook (stats, harm boxes, luck/experience boxes, moves as checkboxes); Front (threat list, dark futures); Mystery sheet (clues and countdown); Steading (Dungeon World).

---

## 4. Fate Core / Fate Accelerated

### Stat block (memory)

1. Name (text)
2. Aspects (tags: High Concept, Trouble, plus 0 to 3 more; text each)
3. Skills (list of skill + rating; ladder numbers e.g. Fight +3; FAE uses 6 **approaches** with +0 to +3: Careful, Clever, Flashy, Forceful, Quick, Sneaky)
4. Stunts (list of text rules)
5. Stress (tracks: Physical and Mental; box counts: 2 base, up to 4 with Physique/Will; each box has a value 1,2,3,4)
6. Consequences (slots: Mild -2, Moderate -4, Severe -6; each a text line; extra slots from Physique/Will skills)
7. Refresh (num, PCs only)
8. Extras (list)

### Example (named NPC)

```
Captain Ines Valdor
High Concept: Disgraced Navy Officer Turned Smuggler
Trouble: The Admiralty Wants Me Back
Aspects: Never Leaves a Crew Behind
Skills: Great (+4) Fight; Good (+3) Pilot, Will; Fair (+2) Rapport, Notice, Physique
Stunts: Gun Hand (+2 to Shoot when drawing first)
Stress: Physical [1][2][3]   Mental [1][2]
Consequences: Mild [____]  Moderate [____]  Severe [____]
```

### What the GM tracks

Stress boxes (tick, they clear at end of scene), consequence slots (written text, heal slowly), fate points (a pool, num), situation aspects and boosts (tags, shared). Printed sheet: stress rows, 3 consequence lines with penalty values, a fate-point pool.

### Derived values

Stress box count from skill: Physique/Will +1 or +2 gives a third/fourth box; +5 gives an extra mild slot. Refresh minus stunts beyond 3. Total skills by pyramid. Difficulty = ladder. Mostly lookups on skill rating.

### Variants

**Mook** (nameless NPC): one or two aspects, skills by group, **no stress track, no consequences**; they are taken out by one hit; **mobs** group mooks as one scaling (shifts by group size, 'Fate Core: "Mob rules"'; Mooks have 0 stress boxes to 1-2). **Nameless NPCs** come in three grades: Average (+1), Fair (+2), Good (+3). **Supporting NPCs**: a few aspects, a few skills, 1 consequence, stress 1 to 2. **Main NPCs**: full PC-like sheet. FAE NPCs use approaches and no skills; a Nemesis has a stress track and consequences.

### Other sheets

PC sheet (aspects, skills pyramid, stunts, stress, consequences, refresh); Scene/situation aspects list; Faction (Fate Core "organization" with aspects and skills as scale); Spaceships/Extras (aspects, stress, "weapons" and "armor" ratings in Fate Core extras).

---

## 5. Call of Cthulhu 7th edition

### Stat block (memory)

1. Name (text)
2. Characteristics: STR, CON, SIZ, DEX, APP, INT, POW, EDU (num, each also shown with half and one-fifth values: 60 / 30 / 12)
3. Hit Points (num)
4. Magic Points (num)
5. Sanity Points (num; for investigators, sometimes for NPCs)
6. Luck (num; PCs)
7. Move (num)
8. Build (num, -2 to 4 or more)
9. Damage Bonus (dice expression: -2, -1, 0, +1d4, +1d6, +2d6...)
10. Dodge (pct with half/fifth)
11. Attacks per round (num)
12. Attacks (list of: name, skill pct (full/half/fifth), damage dice, range)
13. Fighting skills (list of pct)
14. Skills (list of name + pct; with half/fifth shown)
15. Armour (num + text)
16. Spells (list)
17. Sanity Loss (text: "1/1d8" = lost if succeed / lost if fail)
18. Special powers (list)

### Example

```
Deep One Servant
STR 80  CON 70  SIZ 70  DEX 55  INT 60  POW 55   Move 8 (swim 10)
HP 14   MP 11   Build 1   Damage Bonus +1d4
Attacks 2: Claw 45% (22/9), damage 1d6+DB; Bite 30% (15/6), damage 1d4+DB
Dodge 30% (15/6)   Armour: 1 point of scales
Spells: none   Sanity loss: 0/1d6
```

### What the GM tracks

HP (a track of N boxes or a number), MP (a number, spent on spells), Sanity (num, with an "indefinite insanity" threshold line), Luck, major wound flag, rounds of unconsciousness. Printed sheet: HP boxes (or a line), MP line, Sanity line, a tick for major wound, success level on rolls (regular/hard/extreme).

### Derived values (important)

- Half and fifth values of every characteristic and skill (value/2, value/5; "hard" and "extreme" difficulty).
- HP = (CON + SIZ) / 10 (rounded down).
- MP = POW / 5.
- Sanity start = POW.
- Damage bonus and build from STR + SIZ (lookup: 2-64 gives -2/-2; 65-84 gives -1/-1; 85-124 gives 0/0; 125-164 gives +1d4/+1; 165-204 gives +1d6/+2; then +1d6 each 80 added) (numbers from memory; unsure of exact lower thresholds).
- Move from STR, DEX and SIZ comparison (8 base, 7 or 9 modifiers) with age penalty.
- Major wound = damage >= half max HP.
- Dodge = DEX / 2, Language Own = EDU.
- Sanity loss expression "x/y": x on success, y on fail.

### Variants

Monsters share the layout with fewer fields (no skills, only attacks and special powers). Mythos entities add "Sanity loss" and "Spells". Cultists and mooks: a short block with HP, one attack and key skills. **Gods and Great Old Ones**: Special powers and fixed damage. Several creatures have **fixed HP** instead of computed, and may omit characteristics.

### Other sheets

Investigator sheet (characteristics with half/fifth, HP, MP, Sanity, Luck, skills with checkboxes for improvement tick, backstory); Handouts; Tome entries (sanity loss, Mythos gain, spells); Locations (maps); Vehicles (HP, speed).

---

## 6. Mörk Borg

### Stat block (memory)

One-line or short entries:

1. Name (text)
2. HP (num)
3. Morale (num, 1 to 12 as a die target; roll 2d6 vs Morale)
4. Armor (text: "Armor tier 1 (d2)": armor 0 to 3 reduces damage by a die: tier 1 = d2, tier 2 = d4, tier 3 = d6)
5. Attack (text: weapon + damage die: "Bite d6")
6. Special (text: one or two traits, often a mini rule)
7. Sometimes: "Speed" (text), "Level/Type" (text)

### Example

```
Plague Hound   HP 9   Morale 8   Armor: d2
Bite d6. Special: bite causes the Infected condition on a DR 12 Toughness test.
```

### What the GM tracks

HP (number, tracked down), Morale check on first death and half HP, armor damage (armor degrades on a high roll). Printed sheet: HP line, a Morale number, an armor die.

### Derived values

Armor tier gives a damage reduction die; Morale checks are 2d6 against the number; difficulty rating (DR) 12 as default. Almost nothing is computed, by design.

### Variants

Mobs: "a gang counts as one with extra HP"; bosses: more HP and lines of Special; **NPC** (one-line) from random tables (names, traits, HP). Classes with HP + abilities; vehicles: HP, armor, speed.

### Other sheets

Character sheet (abilities with modifiers, HP, Omens, Powers per day, silver, Broken state); Table-driven NPC generator (rolled traits); Dungeons (rooms numbered with tables).

---

## 7. Coriolis (Year Zero Engine)

### Coriolis: The Third Horizon NPC stat block (memory)

1. Name (text)
2. Archetype/Role (text)
3. Attributes: Strength, Agility, Wits, Empathy (num 2 to 5; dice pool base)
4. Skills (list of skill + level, 0 to 5; pool = attribute + skill)
5. Hit Points (num; = Strength + Agility, for NPCs, written directly)
6. Mind Points (num; = Wits + Empathy, written directly)
7. Reputation (num; for important NPCs)
8. Armor (num: armor rating, dice rolled to reduce damage)
9. Weapons (list of: name, damage (num), crit (num), range, bonus (num), notes)
10. Talents (list of text)
11. Gear (list)
12. Description / Motivation / Tags (text)

### Example

```
Station Enforcer
STR 4  AGI 3  WITS 2  EMP 2   HP 7   MP 4   Reputation 5
Skills: Melee Combat 3, Ranged Combat 3, Observation 2
Armor 2 (reinforced vest)
Weapon: Stun baton, damage 1, crit 2, short range
Talents: Fast Reaction
```

### What the GM tracks

HP and MP (tracks: one box per point, or a number), broken status (zero HP: Broken, a critical injury roll), armor use, Reputation for social action, Radiation or Darkness points (Great Dark). Printed sheet: HP boxes, MP boxes, a pool-size line per weapon (attribute + skill + weapon bonus).

### Derived values

HP = STR + AGI; MP = WITS + EMP; Dice pool = attribute + skill (+ gear bonus); armor reduces damage by rolling the dice; Reputation sets social access. Dice pool is a derived value from two fields.

### Variants

Third Horizon: **NPC** short entries (attributes, key skills, HP/MP) and **Threats** (animals, creatures; no MP; attacks as bites/claws); Gang/Squad: treat as one NPC with higher values; ship stat blocks (below).

### Coriolis: The Great Dark (memory; unsure of details)

Uses the Year Zero Engine with a few changes: the **Darkness** mechanics (Darkness Points as a campaign resource), **Dark Matter** and ship-based play with a **cubic cargo and Hull**, new creature types (**Threats** with "Darkness" abilities), and NPCs written with the same attribute/skill/HP/MP pattern, but monsters add special attacks and **Hazards**. Armor remains a rating; HP = STR + AGI for humanoids; monsters may state HP directly.

### Other sheets

PC sheet (attributes, skills, HP/MP, Reputation, Radiation, talents, gear); Ship sheet (Hull, Armor, Engine, Crew, Systems, modules, damage track); Station and location sheets; Faction-style "Patron/Icons".

---

## 8. Kulthos (the user's own system; confirmed from the repo)

Files read: `/Users/steve/Homelab/rpg-promptbook/packages/format/src/systems.ts`, `.../template/avventura.ts` (sheets part, lines 113 to 125), `/Users/steve/Homelab/rpg-promptbook/packages/layout/typst/avventura.typ` (`threat-box`, around line 425), `/Users/steve/Homelab/rpg-promptbook/docs/design.md` (sheet example at line 143), `.../docs/research/source-format.md` (lines 40 to 60, 85 to 90, 590 to 620). I did not read the test fixtures (`packages/format/test/helpers.ts` and others) in full.

### The grade table (systems.ts)

A "system" has a `name`, a `woundsPerCounter`, and a list of `grades`. Each grade has `name`, `wounds` (positive int) and `afflictions` (int >= 0). Only one built-in:

| Grade         | Wounds | Afflictions |
| ------------- | ------ | ----------- |
| Ordinaria     | 3      | 1           |
| Straordinaria | 6      | 2           |
| Leggendaria   | 9      | 3           |

`woundsPerCounter` is 3. So Ordinaria has 1 counter, Straordinaria 2, Leggendaria 3. Grade names and system names must be unique.

### The Markdown today (template `avventura.ts` and docs)

A sheet is `### Name` under `## Schede`, followed by a bullet list with bold keys. The template declares these keys, each with a role:

| Key        | Role        | Meaning                                                                                                  |
| ---------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| Tipo       | type        | `Minaccia` marks a threat sheet                                                                          |
| Grado      | grade       | picks the box counts from the system's table                                                             |
| Natura     | nature      | text such as "non risvegliata" / "risvegliata"                                                           |
| Ferite     | wounds      | optional text; "2 contatori da 3"; must agree with the grade, else a lint warning (`sheet.grade.counts`) |
| Afflizioni | afflictions | optional number; same agreement check                                                                    |
| Branco     | pack        | flag, `sì`; adds " · branco" to the header                                                               |
| Talenti    | talents     | list separated by `·`; each item "Name (rule text)"                                                      |

Other free keys appear in the examples (Volontà, Condotta) and print as ordinary text. The listSeparator is `·`. Example (from the docs):

```markdown
### Tenente Donato, il Primo dei Quieti

- **Tipo:** Minaccia
- **Grado:** Straordinaria
- **Natura:** non risvegliata
- **Ferite:** 2 contatori da 3
- **Afflizioni:** 2
- **Volontà:** che tutto sia fermo; chi si muove senza permesso è uno sciacallo.
- **Condotta:** 1. Fermezza · 2. Impeto · 3. Prudenza · 4. Acume
- **Talenti:** La Presenza (evoca una Pattuglia di Quieti) · Il Nulla (separa i Dormienti)
```

Rules worth knowing:

- Box counts come from the grade table, never from the text; "Ferite" and "Afflizioni" are optional and only cross-checked.
- A graded sheet cited by `→ Schede:` but not in the scene's cast gets a warning and no threat box.
- The system is found by the front matter naming it; the parser looks the grade up case-insensitively.
- The model (`model.ts`) holds `grade`, `nature`, `pack`, and `counts: { wounds, afflictions, woundsPerCounter } | null`.
- Legacy notes are converted (`convert/index.ts`) from "Minaccia <grade>, <nature>, branco".
- Only one fixed field set exists; keys, roles and the table live in two places (template sheet keys, system grades).

### What the PDF draws (`threat-box` in avventura.typ)

A bordered box (0.45 mm ink stroke, unbreakable across pages) with:

1. Name in the display font, 14 pt.
2. Grey subtitle line: `Minaccia <Grado>` plus ` · branco` when pack.
3. Row "Ferite": `counters` groups of `woundsPerCounter` checkboxes, where counters = wounds div woundsPerCounter (Straordinaria: two groups of three boxes).
4. Row "Afflizioni": one group of `afflictions` checkboxes.
5. Talents: either a pre-rendered `talentNames` line "Talenti: ..." or one paragraph per talent, "Name: text".
6. A link "scheda completa, p. N" to the full sheet when one exists.

Natura and the free keys (Volontà, Condotta) are not drawn in the box; they live in the full sheet. The box appears in a scene where the sheet is in the cast.

### Summary of the Kulthos model as a "threat sheet"

Fixed fields: name, grade (enum with a lookup that sets two box tracks), nature (text, not drawn), pack flag, talents list, two box tracks (wounds grouped in counters; afflictions). Derived values: wounds, counters, afflictions from the grade table. Variants: three grades; pack flag.

---

## Building blocks

The smallest set of block types that covers all eight systems:

| Block                | Description                                                                                                                                                                                           | Systems that need it                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **value**            | one labelled field: text, number, die, percentage or enum ("AC 15", "Instinct: to feed", "Tier II")                                                                                                   | all 8                                                                                                                                        |
| **stat row**         | a short row of labelled numbers, each possibly with a computed bracket value ("STR 13 (+1)", "STR 80 / 40 / 16", Fate skills, Coriolis attributes)                                                    | 5e, CoC, Coriolis, Fate (skills/approaches), Dungeon World (HP/Armor/damage), Mörk Borg (HP/Morale/Armor)                                    |
| **track**            | N boxes to tick, optionally in groups or with per-box values (stress 1,2,3; HP boxes; wounds counters of 3; afflictions)                                                                              | Kulthos, Fate (stress, consequences), Dungeon World (HP), Coriolis (HP, MP), CoC (HP/MP), AW (harm), Mörk Borg (HP as boxes), 5e (use boxes) |
| **clock**            | circle of 4, 6, 8, 12 segments, with a name                                                                                                                                                           | Blades (all), Apocalypse World (countdown, harm), MotW (countdown), and optionally Kulthos for threats                                       |
| **list**             | an ordered or unordered list of named items with optional rule text ("Name (text)")                                                                                                                   | all 8 (talents, moves, traits, stunts, powers, attacks, aspects)                                                                             |
| **tags**             | a list of short phrases or enum members (aspects, DW tags, 5e damage types, Blades assets)                                                                                                            | Fate, DW, 5e, Blades, Kulthos (nature)                                                                                                       |
| **lookup table**     | a table keyed by a value that gives derived fields (CR gives PB and XP; Kulthos grade gives wounds and afflictions; STR+SIZ gives DB and build; Tier gives quality; Fate Physique gives stress boxes) | 5e, CoC, Kulthos, Blades, Fate                                                                                                               |
| **derived formula**  | an arithmetic rule over other fields (ability mod = floor((score-10)/2); HP = CON+SIZ over 10; MP = POW/5; half/fifth; pool = attribute+skill; HP = STR+AGI; attack bonus = mod+PB; harm minus armor) | 5e, CoC, Coriolis, Fate (partial), Dungeon World/AW (minor)                                                                                  |
| **attack line**      | a composed row: name, bonus or percentage, damage (die + bonus), range/tags                                                                                                                           | 5e, CoC, Coriolis, DW, Mörk Borg, MotW                                                                                                       |
| **expression**       | a dice expression value "2d6+2" or damage bonus "+1d4" that can be shown and averaged                                                                                                                 | 5e, CoC, DW, Mörk Borg, Coriolis (damage as num)                                                                                             |
| **link / reference** | a ref to a faction, another sheet, or an ally/enemy with status                                                                                                                                       | Blades (allies/enemies), Kulthos (scheda completa), Fate (organizations)                                                                     |

Notes on the fit:

- **stat row with variants:** CoC needs three numbers per cell (full/half/fifth, all derived); 5e 2024 puts score, mod and save in one cell. A "stat row" has to allow multi-part cells computed by formula.
- **track with values:** Fate stress boxes carry values (1, 2, 3, 4) and consequences are a track of _named slots with a penalty_ (mild -2, moderate -4, severe -6) where each slot has a free-text line. That is a track of text slots, not plain boxes.
- **grouped track:** Kulthos wounds are `counters x woundsPerCounter`, a track of groups. AW harm also groups (6 segments in a clock).
- **harm-as-clock vs harm-as-boxes:** Apocalypse World draws threat harm as a countdown clock; Dungeon World as HP boxes. A clock and a track look similar but a clock fills in a fixed order and has a label; keep them separate or make a "track with shape" setting.
- **Cases that do not fit cleanly:**
  - **Faction-level state** (Blades Tier/Hold/Turf/status -3 to +3 with other factions): a graph of relations between sheets, not a single sheet's fields.
  - **Rules text in prose** (5e traits and legendary actions, DW moves): free text with embedded structure (uses per day, recharge, save DC) that a list block holds only as text unless a "uses" marker is added to the list item.
  - **Spellcasting** (5e): a list grouped by frequency or by level, with nested lists.
  - **Quality implied by a stat** (Blades tier gives quality, Fate "average/fair/good" nameless NPC): a lookup whose output is a rating used outside the sheet.
  - **Variable-scale entities** (5e swarm, DW Horde, Fate mob): the same block with a different size of a track or a group multiplier; fits only if a track's size can come from a lookup or a formula on another field.
  - **Random-table NPCs** (Mörk Borg): values come from rolled tables, not a fixed sheet; a lookup block is not enough, a "roll table" source would be needed.
  - **Ship and vehicle sheets** (Coriolis, 5e): modules, damage tracks per system; need repeating groups of tracks (a "list of tracks").
