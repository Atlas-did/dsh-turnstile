// One machine-readable envelope for every checker.
// Shape: { checker, status: pass|fail, exit, findings: [{ severity, plugin, resource, message, evidence, fix }] }
// `--json` makes a checker print this instead of the human table; the exit code is unchanged.
export function emitJson(checker, findings, exitCode) {
  const failed = findings.some((f) => f.severity === 'error');
  process.stdout.write(JSON.stringify({
    checker,
    status: failed ? 'fail' : 'pass',
    exit: exitCode,
    findings,
  }, null, 2) + '\n');
}

export const wantsJson = () => process.argv.includes('--json');

// Call right after imports: with --json the human table must not pollute stdout.
export function silenceWhenJson() {
  if (wantsJson()) {
    console.log = () => {};
    console.info = () => {};
  }
}
