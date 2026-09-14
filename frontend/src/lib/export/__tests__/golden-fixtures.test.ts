import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exportMoodleXml } from '../moodle/moodle-xml-exporter';
import type { ExportContext } from '../types';
import {
  mcqContext,
  tfContext,
  saContext,
  essayContext,
  multiContext,
  richContext,
} from './golden-inputs';

const fixtureDir = resolve(process.cwd(), 'src/lib/export/__tests__/fixtures') + '/';

function fixture(name: string): string {
  return readFileSync(`${fixtureDir}${name}`, 'utf8');
}

function cases(): Array<[string, ExportContext]> {
  return [
    ['expected_moodle_mcq.xml', mcqContext()],
    ['expected_moodle_true_false.xml', tfContext()],
    ['expected_moodle_short_answer.xml', saContext()],
    ['expected_moodle_essay.xml', essayContext()],
    ['expected_moodle_multi_question.xml', multiContext()],
    ['expected_moodle_image_equation_table.xml', richContext()],
  ];
}

describe('Moodle XML golden fixtures', () => {
  it('matches the hand-verified exported XML byte-for-byte', async () => {
    for (const [name, ctx] of cases()) {
      const result = await exportMoodleXml(ctx);
      expect(`${result.xml}\n`, name).toBe(fixture(name));
    }
  });

  it('every golden fixture parses as well-formed XML', () => {
    for (const [name] of cases()) {
      const doc = new DOMParser().parseFromString(fixture(name), 'text/xml');
      if (doc.querySelector('parsererror')) {
        throw new Error(`fixture ${name}: ${doc.querySelector('parsererror')?.textContent}`);
      }
    }
  });
});