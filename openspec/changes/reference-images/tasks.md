# Tasks: reference-images

## 1. Model (brief A, first commit, pushed alone)

- [x] 1.1 `promptbook-project`: `MAX_REFERENCES`, prompt part `refs`,
      `ImagePromptEntry.references` and `missingReferences`,
      `setPromptReferences` (D1, D2); tests for validation, order,
      duplicates, the cap, cleaning on write, a deleted file.
- [x] 1.2 `FileEntry.references` and `GenerationJob.references` (D3, D4),
      with tests for older data without them.

## 2. Server (brief A)

- [ ] 2.1 Generate body and `startImageGeneration`: resolve, refuse, write
      to the prompt (D5, D6); tests for each refusal and for `null` against
      a list.
- [ ] 2.2 OpenRouter client and job (D7), fake (D21), tests.
- [ ] 2.3 Atelier client `uploadImage`, job, retry (D8), both fakes (D22),
      tests.
- [ ] 2.4 `land()` and the job record the references (D9); migration 010
      (D10).
- [ ] 2.5 Connector: `get_board` and `generate_image` (D19, D20), tests.

## 3. Web (brief B)

- [x] 3.1 References block and picker in `GeneratePanel` (D12 to D15, D18),
      with unit tests for the pure parts (ordering, labels, disabled rules).
- [x] 3.2 Prompt card line (D16) and viewer row (D17).
- [x] 3.3 `api.ts`: `GenerateBody.references`; `useGeneration` passes it.

## 4. e2e and docs (brief B)

- [ ] 4.1 e2e specs (D23).
- [x] 4.2 `docs/design.md`: references in the board section.

## 5. Proof (each brief for its part)

- [ ] 5.1 Typecheck, package tests (server with `TEST_DATABASE_URL`), e2e,
      in containers. Sabaoth's four PDF hashes stay as they are.
