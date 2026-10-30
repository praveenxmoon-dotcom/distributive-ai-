import { runComprehensiveTestSuite } from '../src/server/testRunner.ts';

console.log('===========================================================');
console.log('DisruptionIQ Verification & Compliance Test Suite Runner');
console.log('===========================================================');
console.log('Testing: Approval Enforcement, Stock Validation, Execution Safety, Audit Trail\n');

const suite = runComprehensiveTestSuite();

suite.results.forEach((test, index) => {
  const icon = test.passed ? '✓ PASS' : '✗ FAIL';
  console.log(`[${index + 1}/${suite.total}] ${icon}: ${test.name}`);
  console.log(`    Assertion: ${test.assertion}`);
  if (test.details) console.log(`    Details:   ${test.details}`);
  if (test.error) console.log(`    ERROR:     ${test.error}`);
  console.log(`    Duration:  ${test.durationMs}ms\n`);
});

console.log('-----------------------------------------------------------');
console.log(`Summary: ${suite.passed}/${suite.total} tests passed (${suite.durationMs}ms)`);
console.log('-----------------------------------------------------------');

if (suite.failed > 0) {
  console.error(`FAILED: ${suite.failed} tests failed.`);
  process.exit(1);
} else {
  console.log('ALL COMPLIANCE TESTS PASSED SUCCESSFULLY.');
  process.exit(0);
}
