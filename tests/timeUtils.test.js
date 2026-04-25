/**
 * Unit tests for modules/timeUtils.js
 */

const { gT, gM, numC, getDayName } = require('../modules/timeUtils');

// Test helper
function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${err.message}`);
    process.exitCode = 1;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} Expected ${expected}, got ${actual}`);
  }
}

console.log('\n=== timeUtils tests ===\n');

// gT() tests - converts 24h to 12h with AM/PM
runTest('gT: midnight (0) -> 12 midnight', () => {
  const result = gT(0);
  assertEqual(result.h, 12);
  assertEqual(result.am, 'midnight');
});

runTest('gT: noon (12) -> 12 noon', () => {
  const result = gT(12);
  assertEqual(result.h, 12);
  assertEqual(result.am, 'noon');
});

runTest('gT: 6am -> 6 am', () => {
  const result = gT(6);
  assertEqual(result.h, 6);
  assertEqual(result.am, 'am');
});

runTest('gT: 14 (2pm) -> 2 pm', () => {
  const result = gT(14);
  assertEqual(result.h, 2);
  assertEqual(result.am, 'pm');
});

runTest('gT: 23 (11pm) -> 11 pm', () => {
  const result = gT(23);
  assertEqual(result.h, 11);
  assertEqual(result.am, 'pm');
});

// gM() tests - pads minutes with leading zero
runTest('gM: 0 -> "00"', () => {
  const result = gM(0);
  assertEqual(result, '00');
});

runTest('gM: 5 -> "05"', () => {
  const result = gM(5);
  assertEqual(result, '05');
});

runTest('gM: 30 -> 30 (number)', () => {
  const result = gM(30);
  assertEqual(result, 30);
});

runTest('gM: 59 -> 59 (number)', () => {
  const result = gM(59);
  assertEqual(result, 59);
});

// numC() tests - pads numbers with leading zero
runTest('numC: 0 -> "00"', () => {
  const result = numC(0);
  assertEqual(result, '00');
});

runTest('numC: 5 -> "05"', () => {
  const result = numC(5);
  assertEqual(result, '05');
});

runTest('numC: 12 -> 12 (number)', () => {
  const result = numC(12);
  assertEqual(result, 12);
});

runTest('numC: 31 -> 31 (number)', () => {
  const result = numC(31);
  assertEqual(result, 31);
});

// getDayName() tests
runTest('getDayName: 0 -> "Sunday"', () => {
  const result = getDayName(0);
  assertEqual(result, 'Sunday');
});

runTest('getDayName: 1 -> "Monday"', () => {
  const result = getDayName(1);
  assertEqual(result, 'Monday');
});

runTest('getDayName: 6 -> "Saturday"', () => {
  const result = getDayName(6);
  assertEqual(result, 'Saturday');
});

runTest('getDayName: invalid -> ""', () => {
  const result = getDayName(7);
  assertEqual(result, '');
});

console.log('\n=== Tests complete ===\n');