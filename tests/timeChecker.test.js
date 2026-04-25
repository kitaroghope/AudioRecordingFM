/**
 * Unit tests for timeChecker.js
 */

const isTimeCollision = require('../timeChecker');

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

// Test cases
console.log('\n=== timeChecker tests ===\n');

// Test 1: No collision - different days
runTest('No collision - different days', () => {
  const result = isTimeCollision(
    [['Monday'], [9, 0], [10, 0], 'Program A'],
    [['Tuesday'], [9, 0], [10, 0], 'Program B']
  );
  assertEqual(result.collision, false);
});

// Test 2: No collision - same day, non-overlapping times
runTest('No collision - same day, non-overlapping times', () => {
  const result = isTimeCollision(
    [['Monday'], [9, 0], [10, 0], 'Program A'],
    [['Monday'], [10, 0], [11, 0], 'Program B']
  );
  assertEqual(result.collision, false);
});

// Test 3: Collision - same day, overlapping times (partial)
runTest('Collision - same day, overlapping times', () => {
  const result = isTimeCollision(
    [['Monday'], [9, 30], [10, 30], 'Program A'],
    [['Monday'], [9, 0], [10, 0], 'Program B']
  );
  assertEqual(result.collision, true);
  assertEqual(result.conflictingProgram, 'Program B');
});

// Test 4: Collision - new program starts during existing program
runTest('Collision - new program starts during existing', () => {
  const result = isTimeCollision(
    [['Monday'], [9, 15], [9, 45], 'Program A'],
    [['Monday'], [9, 0], [10, 0], 'Program B']
  );
  assertEqual(result.collision, true);
});

// Test 5: Collision - new program fully contains existing
runTest('Collision - new program contains existing', () => {
  const result = isTimeCollision(
    [['Monday'], [8, 0], [11, 0], 'Program A'],
    [['Monday'], [9, 0], [10, 0], 'Program B']
  );
  assertEqual(result.collision, true);
});

// Test 6: Collision - same program name (same day)
runTest('Collision - same program name (same day)', () => {
  const result = isTimeCollision(
    [['Monday'], [14, 0], [15, 0], 'Same Program'],
    [['Monday'], [9, 0], [10, 0], 'Same Program']
  );
  assertEqual(result.collision, true);
  assertEqual(result.scenario, 'Program name is already taken');
});

// Test 7: No collision - different days overlap in array
runTest('No collision - different days with overlapping day names', () => {
  const result = isTimeCollision(
    [['Monday', 'Wednesday'], [9, 0], [10, 0], 'Program A'],
    [['Tuesday', 'Thursday'], [9, 0], [10, 0], 'Program B']
  );
  assertEqual(result.collision, false);
});

// Test 8: Collision - shared day with different times
runTest('Collision - shared day with non-overlapping times', () => {
  const result = isTimeCollision(
    [['Monday'], [14, 0], [15, 0], 'Program A'],
    [['Monday'], [9, 0], [10, 0], 'Program B']
  );
  assertEqual(result.collision, false);
});

console.log('\n=== Tests complete ===\n');