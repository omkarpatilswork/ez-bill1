# Measuring bill reading

Every change to how bills are read is measured against the same set of real
bills, so "better" is a number and not an impression.

Nothing in `eval/bills/` is ever committed: the bills are real and the repo is
public. The folder is git-ignored, and so are the answer sheet and the results
inside it.

## The pieces

| File | What it does |
|---|---|
| `eval/bills/` | The bills: photos (JPG, PNG, WebP), PDFs, and email text (`.txt`, `.eml`, `.html`) |
| `eval/bills/answers.csv` | The right answer for each bill, one row per file |
| `run.mjs` | Sends each bill to the reader the way the app does and saves the reply. Reads only |
| `score.mjs` | Compares a run with the answer sheet |
| `lib.mjs` | The comparison rules, with tests in `lib.test.ts` |

## Steps

1. Put the bills in `eval/bills/`.
2. Create the answer sheet, one row per bill:

   ```bash
   node scripts/eval/score.mjs --init
   ```

3. Fill in `answers.csv`. Leave a cell empty when the bill does not show that
   value, and put `?` where the right answer is a matter of opinion (that
   field is then not scored for that bill). Items go in one cell as `2 x Cappuccino = 320; 1 x Almond Croissant = 92`.
   If a bill is a second copy of another one, put the other file's name in
   `duplicate_of`.
4. Read every bill with the current system and score it:

   ```bash
   EVAL_EMAIL=... EVAL_PASSWORD=... node scripts/eval/run.mjs baseline
   ```

   ```bash
   node scripts/eval/score.mjs baseline
   ```

5. After a change, run again under a new name (`run.mjs strict-schema`) and
   compare the two `score.md` files.

## How a field is scored

| Outcome | Meaning |
|---|---|
| right | the bill shows a value and the reader got it |
| wrong | the bill shows a value and the reader gave a different one |
| missed | the bill shows a value and the reader left it empty |
| made up | the bill shows no such value and the reader gave one anyway |

"Made up" is counted on its own because the product rule is accuracy over
completeness: an empty field is better than a wrong one.

Amounts must match to the paisa. Dates match by day. Invoice numbers ignore
case and punctuation. A merchant matches when the names are the same after
dropping legal suffixes ("Pvt Ltd"), or when the shorter name is whole inside
the longer one. A line item counts as found when its total matches and at
least half the words in its name do.

The headline number is the share of bills where merchant, date and total are
all right, since those three decide whether a bill lands in the right place.
