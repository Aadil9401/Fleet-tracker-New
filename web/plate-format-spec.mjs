/**
 * Reads plate-format-cases.csv — the shared specification for how a registration plate
 * is written out.
 *
 * The portal is tested against it by web/plate-format-test.mjs and the phone app by
 * PlateFormatTest.kt. Both read the same table, so a disagreement between them can only
 * be about the rule itself.
 */
import { readFileSync } from 'fs';

const COLUMNS = ['name', 'input', 'display'];

export function specCases(csvPath = 'plate-format-cases.csv') {
  const lines = readFileSync(csvPath, 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    // Only a leading # is a comment. A line is not trimmed before the split, because
    // the spacing inside a case is the entire point of this table.
    .filter(l => l.trim() !== '' && !l.trimStart().startsWith('#'));

  const header = lines.shift().split(',');
  if (header.join(',') !== COLUMNS.join(',')) {
    throw new Error(`unexpected columns in ${csvPath}:\n  got  ${header.join(',')}\n  want ${COLUMNS.join(',')}`);
  }

  return lines.map(line => {
    const [name, input, display] = line.split(',');
    return { name, input: input ?? '', display: display ?? '' };
  });
}
