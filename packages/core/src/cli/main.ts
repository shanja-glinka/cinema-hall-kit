#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import process from 'node:process';
import {
  buildHallLayout,
  buildSeatManifest,
  ConstraintsSchema,
  formatIssue,
  hallConfigJsonSchema,
  hasErrors,
  parseHallConfig,
  pathToString,
  validateHall,
  type Issue,
  type ParseResult,
} from '../index.js';

const USAGE = `Usage:
  cinema-hall validate <file> [--json] [--enforce <constraints.json>]
  cinema-hall manifest <file>
  cinema-hall layout <file>
  cinema-hall schema
  cinema-hall --help

Exit codes: 0 ok, 1 validation errors, 2 usage or I/O error.
`;

class UsageError extends Error {}

const out = (text: string): void => {
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
};
const err = (text: string): void => {
  process.stderr.write(text.endsWith('\n') ? text : `${text}\n`);
};

function readText(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    throw new UsageError(`cannot read ${file}`);
  }
}

function parseFile(file: string): ParseResult {
  return parseHallConfig(readText(file), { format: 'auto' });
}

function printIssues(issues: Issue[], file: string, write: (text: string) => void): void {
  for (const issue of issues) {
    const where = issue.position
      ? `${file}:${issue.position.line}:${issue.position.col}`
      : `${file}: ${pathToString(issue.path) || '<root>'}`;
    write(`${issue.severity} ${issue.code} ${where}: ${formatIssue(issue)}`);
  }
}

function runValidate(args: string[]): number {
  let file: string | undefined;
  let json = false;
  let constraintsFile: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--json') json = true;
    else if (arg === '--enforce') {
      constraintsFile = args[++i];
      if (constraintsFile === undefined) throw new UsageError('--enforce needs a file');
    } else if (arg.startsWith('--')) throw new UsageError(`unknown option ${arg}`);
    else if (file === undefined) file = arg;
    else throw new UsageError('validate takes one file');
  }
  if (file === undefined) throw new UsageError('validate needs a file');

  const parsed = parseFile(file);
  let issues: Issue[] = parsed.issues;
  if (parsed.ok && constraintsFile !== undefined) {
    let raw: unknown;
    try {
      raw = JSON.parse(readText(constraintsFile)) as unknown;
    } catch {
      throw new UsageError(`${constraintsFile} is not valid JSON`);
    }
    const constraints = ConstraintsSchema.safeParse(raw);
    if (!constraints.success) throw new UsageError(`invalid constraints in ${constraintsFile}`);
    issues = validateHall(parsed.config, { enforce: true, constraints: constraints.data });
  }

  if (json) {
    out(JSON.stringify({ ok: !hasErrors(issues), issues }, null, 2));
  } else {
    printIssues(issues, file, out);
    const errors = issues.filter((issue) => issue.severity === 'error').length;
    out(`${errors} error(s), ${issues.length - errors} warning(s)`);
  }
  return hasErrors(issues) ? 1 : 0;
}

function runConfigCommand(command: 'manifest' | 'layout', args: string[]): number {
  const file = args[0];
  if (args.length !== 1 || file === undefined) throw new UsageError(`${command} takes one file`);
  const parsed = parseFile(file);
  if (!parsed.ok) {
    printIssues(parsed.issues, file, err);
    return 1;
  }
  const body =
    command === 'manifest' ? buildSeatManifest(parsed.config) : buildHallLayout(parsed.config);
  out(JSON.stringify(body, null, 2));
  return 0;
}

function run(argv: string[]): number {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case undefined:
        err(USAGE);
        return 2;
      case '--help':
      case '-h':
      case 'help':
        out(USAGE);
        return 0;
      case 'validate':
        return runValidate(rest);
      case 'manifest':
      case 'layout':
        return runConfigCommand(command, rest);
      case 'schema':
        out(JSON.stringify(hallConfigJsonSchema, null, 2));
        return 0;
      default:
        throw new UsageError(`unknown command ${command}`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      err(`cinema-hall: ${error.message}`);
      err(USAGE);
      return 2;
    }
    throw error;
  }
}

process.exitCode = run(process.argv.slice(2));
