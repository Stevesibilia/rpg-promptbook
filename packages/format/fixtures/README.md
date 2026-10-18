# Fixtures

Whole adventures the tests read. Keep them exactly as they were copied or
written: do not format them.

- `esempio.md`: the template's own example, copied unchanged from the public
  repository [Stevesibilia/stevesibilia-plugins](https://github.com/Stevesibilia/stevesibilia-plugins),
  file `plugins/rpg-prep/skills/enhanced-avventure-rpg/references/esempio.md`,
  commit `691eeb6df8163242d42845a9588549a4bb95f023`.
- `l-ancora-di-sabaoth.md`: L'Ancora di Sabaoth, the owner's adventure in
  today's conventions, copied as it is (the owner agreed to publish it,
  2026-10-18).
- `l-ancora-di-sabaoth.converted.md`: the output of `convertNote` on
  `l-ancora-di-sabaoth.md`. A test checks that the converter still produces
  it; when a change to the converter is meant to change it, write it again
  from the converter's output.
