/**
 * Extract a markdown failure summary from Playwright JUnit XML results.
 * Outputs `test_summary` to GITHUB_OUTPUT.
 *
 * Required env: TEST_ENGINE
 */

import { existsSync, readFileSync, appendFileSync } from 'node:fs';

const decode = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, ' ')
    .replace(/&#13;/g, '');

const attr = (el: string, name: string): string => {
  const m = el.match(new RegExp(name + '="([^"]*)"'));
  return m ? decode(m[1]) : '';
};

const RESULTS_FILE = 'playwright/test-results/results.xml';
const MAX_FAILURES = 25;
const MAX_LENGTH = 60_000;

const main = (): void => {
  const testEngine = process.env.TEST_ENGINE ?? '';

  if (testEngine !== 'playwright' || !existsSync(RESULTS_FILE)) {
    appendFileSync(process.env.GITHUB_OUTPUT!, 'test_summary=\n');
    return;
  }

  const xml = readFileSync(RESULTS_FILE, 'utf8');

  const root = xml.match(/<testsuites[^>]*>/);
  const total = root ? attr(root[0], 'tests') : '?';
  const failed = root ? attr(root[0], 'failures') : '?';
  const skipped = root ? attr(root[0], 'skipped') : '0';
  const passed =
    total !== '?' && failed !== '?'
      ? String(Number(total) - Number(failed) - Number(skipped))
      : '?';

  if (failed === '0') {
    appendFileSync(process.env.GITHUB_OUTPUT!, 'test_summary=\n');
    return;
  }

  type Failure = { name: string; msg: string };
  const failures: Failure[] = [];
  const re = /<testcase\s+([\s\S]*?)>([\s\S]*?)<\/testcase>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    if (!m[2].includes('<failure')) continue;
    const failTag = m[2].match(/<failure\s+([\s\S]*?)(?:\/>|>[\s\S]*?<\/failure>)/);
    failures.push({
      name: attr(m[1], 'name'),
      msg: failTag ? attr(failTag[1], 'message') : '',
    });
  }

  if (failures.length === 0) {
    appendFileSync(process.env.GITHUB_OUTPUT!, 'test_summary=\n');
    return;
  }

  let out = `**${failed}** of **${total}** tests failed, **${passed}** passed`;
  if (skipped !== '0') out += `, ${skipped} skipped`;
  out += '\n\n| Test | Error |\n| --- | --- |\n';
  for (const f of failures.slice(0, MAX_FAILURES)) {
    const name = f.name.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const msg = f.msg.replace(/\|/g, '\\|').replace(/\n/g, ' ').substring(0, 200);
    out += `| ${name} | ${msg} |\n`;
  }
  if (failures.length > MAX_FAILURES) {
    out += `\n_...and ${failures.length - MAX_FAILURES} more failures (see workflow artifacts for full report)_\n`;
  }
  if (out.length > MAX_LENGTH) {
    out = out.substring(0, MAX_LENGTH) + '\n\n_...truncated_\n';
  }

  const output = process.env.GITHUB_OUTPUT!;
  appendFileSync(output, `test_summary<<SUMMARY_DELIM\n${out}\nSUMMARY_DELIM\n`);
};

main();
