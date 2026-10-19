## ADDED Requirements

### Requirement: Research topics

A project SHALL keep a list of research topics in its Yjs document, each with
a name and a state: to research or noted. The Research view of
[docs/mockups/connector.html](../../../docs/mockups/connector.html)
SHALL show the topics as chips with their state; clicking a chip SHALL switch
its state; each chip SHALL have a remove control that deletes the topic and
leaves its notes untouched; an Add field SHALL add a topic in the to research state, refusing
an empty name and a name equal to an existing topic, compared case and accent
insensitive. The view SHALL show the hint «Ask Claude: "research the open
topics of <project title>"». Saving a note whose topic equals a topic, compared
the same way, SHALL switch that topic to noted.

#### Scenario: Topic added and switched

- **WHEN** the user adds the topic «Il dialetto messinese» and clicks it
- **THEN** it shows first as to research, then as noted

#### Scenario: Note marks its topic

- **WHEN** Claude saves a note with the topic «colapesce» and the topic
  «Colapesce» is to research
- **THEN** the topic shows as noted

### Requirement: Research notes

A project SHALL keep research notes in its Yjs document. A note SHALL have a
topic, a summary, a list of facts for the table, a list of sources (title,
URL, accessed date), who wrote it (the user or Claude), its creation date and
its last edit date. The Research view SHALL list the notes, newest edit
first, with topic, date, who and the number of sources, and SHALL show the
selected note with Topic, Summary, Facts for the table and Sources, each
source's title, its URL's host as a link that opens in a new tab, and
«accessed <date>». For an adventure or a one-shot the note SHALL also show
«mentioned in» with the scenes its topic matches (as the inspector's
Research section matches them), or «no scene yet». New note SHALL create a
note by you and open it for editing; Edit SHALL make the topic, summary,
facts and sources editable, with Done to save; Delete SHALL remove the note
after a confirm that says the prep document is not touched. A source URL
that is not http or https SHALL be refused. Notes SHALL never go into the
table PDF or the `.cbpack`.

#### Scenario: Note created, edited and deleted

- **WHEN** the user creates a note, sets its topic to «Torre Faro», adds a
  fact and a source, presses Done, then deletes it
- **THEN** the note shows in the list with one source after Done, and is gone
  after the confirm

#### Scenario: Scenes mentioned

- **WHEN** the note «Il maremoto nel porto di Messina» is open and S1's text
  contains «porto»
- **THEN** the note shows «mentioned in S1»

### Requirement: Research in the inspector

For an adventure or a one-shot the inspector SHALL have a Research section
listing the notes whose topic shares a word with the text of the scene
holding the cursor: a word is a run of letters or digits of four characters
or more, compared case and accent insensitive. It SHALL list at most three
notes, the ones sharing the most words first, then newest edit first; each
SHALL show its topic, the words it matched, who wrote it and its date, and
Open, which opens the note in the Research view. The section SHALL show the
count of matches, the hint «Notes whose topic shares words with this scene.»
and a link to all the notes. With the cursor outside a scene, or no match,
it SHALL say so. The section SHALL open and close and be remembered like the
others.

#### Scenario: Notes for the scene

- **WHEN** the cursor is in S1, whose text holds «terremoto» and «porto», and
  the project has notes «Il terremoto del 1908: cronologia», «Il maremoto nel
  porto di Messina» and «Colapesce»
- **THEN** the Research section lists the first two, each with its matched
  word, and not «Colapesce»

#### Scenario: Short words ignored

- **WHEN** the only word a note's topic shares with the scene is «del»
- **THEN** the note is not listed
