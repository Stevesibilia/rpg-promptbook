-- A project's link to its gdrarchive campaign (openspec change
-- gdrarchive-link, design decisions 5 and 11): the project's own link, as its
-- document's summary carries it, so the list shows an adventure its
-- campaign's without opening the campaign's document. Both columns are set
-- or neither, as the document sets the link whole; the label is '' when the
-- link has none. Existing rows read as no link.

alter table projects
  add column gdrarchive_url text,
  add column gdrarchive_label text,
  add constraint projects_gdrarchive_whole check ((gdrarchive_url is null) = (gdrarchive_label is null));
