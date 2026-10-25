const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Execute the actual selection functions, with only the browser DOM substituted.
const source = fs.readFileSync(path.join(__dirname, '..', 'github-date-gradient.user.js'), 'utf8');
const selection = source.slice(source.indexOf('  function isRepositoryFileLink('), source.indexOf('  function refresh('));
function fixture(pathname, rows) {
  const dates = rows.map(({ href, datetime = '2026-10-01T00:00:00Z', visible = true, article = false }) => {
    const row = {
      closest: () => article ? {} : null,
      querySelectorAll: () => [{ getAttribute: () => href }],
    };
    return {
      closest: () => row,
      getClientRects: () => visible ? [{}] : [],
      getAttribute: () => datetime,
    };
  });
  const context = vm.createContext({
    URL,
    location: new URL(pathname, 'https://github.com'),
    document: { querySelectorAll: () => dates },
  });
  vm.runInContext(selection, context);
  return context;
}

test('mixed-case repository URL selects canonical lowercase file and directory links', () => {
  const context = fixture('/Kindness-Kismet/Stelliberty', [
    { href: '/Kindness-Kismet/stelliberty/blob/stable/README.md' },
    { href: '/kindness-kismet/stelliberty/tree/stable/src' },
  ]);
  assert.equal(context.collectDates().length, 2);
});

test('subdirectories accept absolute links and keep dates with different timestamps', () => {
  const context = fixture('/Kindness-Kismet/Stelliberty/tree/stable/src', [
    { href: 'https://github.com/Kindness-Kismet/stelliberty/blob/stable/src/A.rs', datetime: '2026-09-01T00:00:00Z' },
    { href: '/Kindness-Kismet/stelliberty/blob/stable/src/B.rs' },
  ]);
  const dates = context.collectDates();
  assert.equal(dates.length, 2);
  assert.ok(dates[0].timestamp < dates[1].timestamp);
});

test('excludes other repositories, external links, commits, hidden rows, README content and invalid dates', () => {
  const valid = '/Kindness-Kismet/stelliberty/blob/stable/README.md';
  const context = fixture('/Kindness-Kismet/Stelliberty', [
    { href: '/other/stelliberty/blob/main/file' },
    { href: '/Kindness-Kismet/other/blob/main/file' },
    { href: `https://example.com${valid}` },
    { href: '/Kindness-Kismet/stelliberty/commit/abc' },
    { href: valid, visible: false },
    { href: valid, article: true },
    { href: valid, datetime: 'invalid' },
    { href: 'http://[' },
  ]);
  assert.equal(context.collectDates().length, 0);
});

test('does not color issue, pull request or individual file pages', () => {
  for (const page of ['issues', 'pull/1', 'blob/stable/README.md']) {
    const context = fixture(`/Kindness-Kismet/Stelliberty/${page}`, [
      { href: '/Kindness-Kismet/stelliberty/blob/stable/README.md' },
    ]);
    assert.equal(context.collectDates().length, 0);
  }
});

test('oldest dates use the dark end, newest the light end, equal dates the midpoint', () => {
  const context = fixture('/owner/repo', []);
  assert.equal(context.ageAmount(10, 10, 30), 1);
  assert.equal(context.ageAmount(30, 10, 30), 0);
  assert.equal(context.ageAmount(20, 10, 30), 0.5);
  assert.equal(context.ageAmount(10, 10, 10), 0.5);
});

function rowGroup(names) {
  const parent = {
    children: [],
    moves: 0,
    insertBefore(row, reference) {
      this.children.splice(this.children.indexOf(row), 1);
      const index = reference === null ? this.children.length : this.children.indexOf(reference);
      this.children.splice(index, 0, row);
      this.moves++;
    },
  };
  const rows = names.map((name) => ({ name, parentElement: parent }));
  parent.children = [...rows];
  return { parent, rows };
}

test('sorts newest first, preserves special slots and ties, and makes no mutations on a second pass', () => {
  const context = fixture('/owner/repo', []);
  const { parent, rows } = rowGroup(['header', '..', 'old', 'undated', 'new', 'tie', 'middle']);
  const entries = [
    { row: rows[2], timestamp: 10 },
    { row: rows[4], timestamp: 30 },
    { row: rows[5], timestamp: 30 },
    { row: rows[6], timestamp: 20 },
    { row: rows[4], timestamp: 30 },
  ];
  context.sortRows(entries);
  assert.deepEqual(parent.children.map((r) => r.name), ['header', '..', 'new', 'undated', 'tie', 'middle', 'old']);
  const moves = parent.moves;
  context.sortRows(entries);
  assert.equal(parent.moves, moves, 'observer callbacks must settle without a mutation loop');
});

test('sorts independent tables separately and reorders when a timestamp updates', () => {
  const context = fixture('/owner/repo', []);
  const first = rowGroup(['a', 'b']);
  const second = rowGroup(['c', 'd']);
  const entries = [
    { row: first.rows[0], timestamp: 10 }, { row: first.rows[1], timestamp: 20 },
    { row: second.rows[0], timestamp: 40 }, { row: second.rows[1], timestamp: 30 },
  ];
  context.sortRows(entries);
  assert.deepEqual(first.parent.children.map((r) => r.name), ['b', 'a']);
  assert.deepEqual(second.parent.children.map((r) => r.name), ['c', 'd']);
  entries[0].timestamp = 50;
  context.sortRows(entries);
  assert.deepEqual(first.parent.children.map((r) => r.name), ['a', 'b']);
});

test('switches ascending, descending and original without losing original order', () => {
  const context = fixture('/owner/repo', []);
  const { parent, rows } = rowGroup(['..', 'middle', 'old', 'unknown', 'new']);
  const entries = [
    { row: rows[1], timestamp: 20 }, { row: rows[2], timestamp: 10 },
    { row: rows[4], timestamp: 30 },
  ];
  context.sortRows(entries, 'asc');
  assert.deepEqual(parent.children.map((r) => r.name), ['..', 'old', 'middle', 'unknown', 'new']);
  context.sortRows(entries, 'desc');
  assert.deepEqual(parent.children.map((r) => r.name), ['..', 'new', 'middle', 'unknown', 'old']);
  context.sortRows(entries, 'original');
  assert.deepEqual(parent.children.map((r) => r.name), ['..', 'middle', 'old', 'unknown', 'new']);
  const moves = parent.moves;
  context.sortRows(entries, 'original');
  assert.equal(parent.moves, moves);
});

test('restores original order even when a previously undated row receives its date later', () => {
  const context = fixture('/owner/repo', []);
  const { parent, rows } = rowGroup(['a', 'b', 'c']);
  const entries = [{ row: rows[0], timestamp: 10 }, { row: rows[2], timestamp: 30 }];
  context.sortRows(entries, 'desc');
  entries.push({ row: rows[1], timestamp: 40 });
  context.sortRows(entries, 'desc');
  assert.deepEqual(parent.children.map((r) => r.name), ['b', 'c', 'a']);
  context.sortRows(entries, 'original');
  assert.deepEqual(parent.children.map((r) => r.name), ['a', 'b', 'c']);
});

function starFixture(buttons) {
  const context = vm.createContext({
    URL, location: new URL('https://github.com/Owner/Repo'),
    host: { contains: (button) => button.own === true },
    document: { querySelectorAll: () => buttons },
  });
  vm.runInContext(selection, context);
  return context;
}
function starButton({ text = '', label = '', icon = false, hidden = false, action = null, excluded = false, own = false } = {}) {
  return {
    own, textContent: text,
    getAttribute: () => label,
    getClientRects: () => hidden ? [] : [{}],
    querySelector: () => icon ? {} : null,
    closest: (selector) => selector === 'form[action]' ?
      (action ? { getAttribute: () => action } : null) : (excluded ? {} : null),
  };
}
test('finds React Star buttons by visible text without legacy header IDs or aria-label', () => {
  const unrelated = starButton({ text: 'Fork 12' });
  const star = starButton({ text: 'Star 123', icon: true });
  assert.equal(starFixture([unrelated, star]).findStarButton(), star);
});
test('finds Starred buttons and legacy star forms; excludes hidden and content buttons', () => {
  const star = starButton({ text: 'Starred 123', icon: true });
  const ignored = [starButton({ text: 'Star', hidden: true }),
    starButton({ text: 'Star', excluded: true }), starButton({ text: 'Star', own: true })];
  assert.equal(starFixture([...ignored, star]).findStarButton(), star);
  const legacy = starButton({ action: '/owner/repo/star' });
  assert.equal(starFixture([legacy]).findStarButton(), legacy);
});
