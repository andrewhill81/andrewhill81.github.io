import { chromium } from 'playwright';
const url = 'file://' + process.cwd() + '/index.html';
const fails = [];
const ok = (name, cond) => { if (cond) console.log('PASS', name); else { console.log('FAIL', name); fails.push(name); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGEERROR', e.message); fails.push('pageerror: ' + e.message); });

// Force "today = Tuesday" is real anyway (Aug 4 2026 is Tuesday). Load.
await page.goto(url);
await page.waitForTimeout(300);

// 1. Opens on today (Tue = Upper), guided mode, chest press first
ok('opens on today tab', await page.evaluate(() => { const names=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; return document.querySelector('.tab.sel').textContent === names[(new Date().getDay()+6)%7]; }));
await page.evaluate(() => document.querySelectorAll('.tab')[1].click()); await page.waitForTimeout(200); // switch to Tue (Upper) for the rest of the flow
ok('guided shows Chest Press first', await page.evaluate(() => document.querySelector('.card h3').textContent === 'CHEST PRESS' || document.querySelector('.card h3').textContent === 'Chest Press'));
ok('weight shows 40', await page.evaluate(() => document.querySelector('.wval').textContent.startsWith('40')));

// 2. Log 3 sets of 12 at 40 -> earned verdict, timer running
for (const r of [12, 12, 12]) {
  await page.evaluate((reps) => {
    const rows = document.querySelectorAll('.srow');
    for (const row of rows) {
      const chip = [...row.querySelectorAll('.chip')].find(c => +c.dataset.reps === reps && !c.classList.contains('on'));
      const setIdx = row.querySelector('.slab').textContent.trim();
      if (chip && !row.querySelector('.chip.on')) { chip.click(); return; }
    }
  }, r);
  await page.waitForTimeout(50);
}
ok('earned verdict', await page.evaluate(() => document.querySelector('.verdict').textContent.includes('Earned it')));
ok('card earned accent', await page.evaluate(() => !!document.querySelector('.card.earned')));
ok('timer running', await page.evaluate(() => document.getElementById('timer').classList.contains('run')));
ok('header shows done', await page.evaluate(() => document.querySelector('.ghead .r').textContent.includes('done')));

// 3. Reload — taps survive (persistence per tap)
await page.reload(); await page.waitForTimeout(300);
ok('taps survive reload', await page.evaluate(() => document.querySelectorAll('.chip.on').length === 3));

// 4. Mixed load: bump weight, change S3 to a different rep at new weight
await page.evaluate(() => {
  document.querySelector('[data-act="plus"]').click(); // 40 -> 45
});
await page.waitForTimeout(100);
await page.evaluate(() => {
  const rows = document.querySelectorAll('.srow');
  const row = rows[2];
  row.querySelector('.chip.on').click(); // unlog S3
});
await page.waitForTimeout(100);
await page.evaluate(() => {
  const rows = document.querySelectorAll('.srow');
  [...rows[2].querySelectorAll('.chip')].find(c => c.dataset.reps === '10').click(); // log at 45
});
await page.waitForTimeout(100);
ok('mixed-load verdict', await page.evaluate(() => document.querySelector('.verdict').textContent.includes('Loads varied (40, 45)')));
ok('per-set weight note', await page.evaluate(() => [...document.querySelectorAll('.slab .sw')].some(e => e.textContent === '40')));

// restore: set weight back to 40, re-log S3 at 12
await page.evaluate(() => document.querySelector('[data-act="minus"]').click());
await page.waitForTimeout(80);
await page.evaluate(() => {
  const row = document.querySelectorAll('.srow')[2];
  row.querySelector('.chip.on').click();
});
await page.waitForTimeout(80);
await page.evaluate(() => {
  const row = document.querySelectorAll('.srow')[2];
  [...row.querySelectorAll('.chip')].find(c => c.dataset.reps === '12').click();
});
await page.waitForTimeout(80);

// 5. Save session -> history recorded, weight bumped to 45, toast names 1 weight up
await page.evaluate(() => document.getElementById('save').click());
await page.waitForTimeout(200);
ok('save toast names bump', await page.evaluate(() => document.getElementById('toast').textContent.includes('1 weight up')));
ok('weight bumped to 45', await page.evaluate(() => document.querySelector('.wval').textContent.startsWith('45')));
ok('last-session line', await page.evaluate(() => {
  const l = document.querySelector('.last');
  return l && l.textContent.includes('40×12') && /[A-Z][a-z]{2} \d/.test(l.textContent);
}));
ok('history stored', await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('liftlog.v1'));
  const h = s.history.chest;
  return h && h.length === 1 && h[0].sets.length === 3 && s.weights.chest === 45;
}));
ok('taps cleared after save', await page.evaluate(() => document.querySelectorAll('.chip.on').length === 0));

// 6. Stale-day auto-finalize: plant pending from yesterday, reload
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('liftlog.v1'));
  s.pending = { date: '2026-08-03', taps: { legpress: { 0: { w: 65, reps: 12 }, 1: { w: 65, reps: 12 }, 2: { w: 65, reps: 12 } } } };
  localStorage.setItem('liftlog.v1', JSON.stringify(s));
});
await page.reload(); await page.waitForTimeout(300);
ok('stale session finalized under its own date + bump', await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('liftlog.v1'));
  const h = s.history.legpress;
  return h && h.length === 1 && h[0].date === '2026-08-03' && s.weights.legpress === 70 && Object.keys(s.pending.taps).length === 0;
}));
ok('auto-save toast', await page.evaluate(() => document.getElementById('toast').textContent.includes('saved automatically')));

// 7. Weights follow exercise across days: Mon tab leg press shows 70
await page.evaluate(() => document.querySelectorAll('.tab')[0].click());
await page.waitForTimeout(150);
ok('Mon leg press at 70 with last line', await page.evaluate(() => {
  return document.querySelector('.wval').textContent.startsWith('70') &&
    document.querySelector('.last').textContent.includes('65×12') &&
    document.querySelector('.last').textContent.includes('Aug 3');
}));
ok('no-photo placeholder', await page.evaluate(() => document.querySelector('.photo .noph') !== null));

// 8. Rest day card (Wed)
await page.evaluate(() => document.querySelectorAll('.tab')[2].click());
await page.waitForTimeout(150);
ok('rest day card', await page.evaluate(() => document.querySelector('.restcard p').textContent.includes('Thursday and Friday')));
ok('no mode toggle on rest day', await page.evaluate(() => document.getElementById('modes').style.display === 'none'));

// 9. Full day mode on Tue: sections + numbered cards; torso twist labels on Mon
await page.evaluate(() => document.querySelectorAll('.tab')[3].click()); // Thu (lower)
await page.waitForTimeout(150);
await page.evaluate(() => document.querySelector('[data-m="full"]').click());
await page.waitForTimeout(150);
ok('full day: 7 cards, sections', await page.evaluate(() =>
  document.querySelectorAll('.card').length === 7 &&
  [...document.querySelectorAll('.sechead')].map(e => e.textContent).join(',') === 'Legs,Core'));
ok('torso twist L1/L2/R1/R2', await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')];
  const tw = cards.find(c => c.querySelector('h3').textContent.toUpperCase().includes('TORSO'));
  return [...tw.querySelectorAll('.slab')].map(e => e.textContent.trim()).join(',') === 'L1,L2,R1,R2';
}));
ok('core chips <15 then 15-23', await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')];
  const ab = cards.find(c => c.querySelector('h3').textContent.toUpperCase().includes('ABDOMINAL'));
  const chips = [...ab.querySelectorAll('.srow')[0].querySelectorAll('.chip')].map(c => c.textContent);
  return chips[0] === '<15' && chips[1] === '15' && chips[chips.length - 1] === '23';
}));
const findLP = () => [...document.querySelectorAll('.card')].find(c => c.querySelector('h3').textContent.toUpperCase().includes('LEG PRESS'));
for (let i = 0; i < 3; i++) {
  await page.evaluate((i) => {
    const lp = [...document.querySelectorAll('.card')].find(c => c.querySelector('h3').textContent.toUpperCase().includes('LEG PRESS'));
    lp.querySelectorAll('.srow')[i].querySelector('.chip.fail').click();
  }, i);
  await page.waitForTimeout(60);
}
ok('failure chips trigger too-heavy verdict', await page.evaluate(() => {
  const lp = [...document.querySelectorAll('.card')].find(c => c.querySelector('h3').textContent.toUpperCase().includes('LEG PRESS'));
  return lp.querySelector('.verdict').textContent.includes('Too heavy. Drop 5 lb and rebuild.');
}));
for (let i = 0; i < 3; i++) {
  await page.evaluate((i) => {
    const lp = [...document.querySelectorAll('.card')].find(c => c.querySelector('h3').textContent.toUpperCase().includes('LEG PRESS'));
    const on = lp.querySelectorAll('.srow')[i].querySelector('.chip.on');
    if (on) on.click();
  }, i);
  await page.waitForTimeout(60);
}
ok('unset weight shows "set"', await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')];
  const lc = cards.find(c => c.querySelector('h3').textContent.toUpperCase().includes('LEG CURL'));
  return lc.querySelector('.wval').classList.contains('unset');
}));

// 10. Chip on unset weight -> toast, no log
await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')];
  const lc = cards.find(c => c.querySelector('h3').textContent.toUpperCase().includes('LEG CURL'));
  lc.querySelector('.chip').click();
});
await page.waitForTimeout(120);
ok('unset weight blocks logging', await page.evaluate(() =>
  document.getElementById('toast').textContent.includes('Set a weight first') &&
  document.querySelectorAll('.chip.on').length === 0));

// 11. Save with nothing logged
await page.evaluate(() => document.getElementById('save').click());
await page.waitForTimeout(120);
ok('nothing logged toast', await page.evaluate(() => document.getElementById('toast').textContent.includes('Nothing logged yet')));

// 12. Storage failure honesty: log a set, block setItem, save -> honest error, sets stay
await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')];
  const lp = cards.find(c => c.querySelector('h3').textContent.toUpperCase().includes('LEG PRESS'));
  [...lp.querySelectorAll('.srow')[0].querySelectorAll('.chip')].find(c => c.dataset.reps === '10').click();
});
await page.waitForTimeout(80);
await page.evaluate(() => {
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function () { throw new Error('quota'); };
  window.__restore = () => { Storage.prototype.setItem = orig; };
  document.getElementById('save').click();
});
await page.waitForTimeout(150);
ok('honest NOT SAVED message', await page.evaluate(() => document.getElementById('toast').textContent.includes('NOT SAVED')));
ok('sets still on screen after failed save', await page.evaluate(() => document.querySelectorAll('.chip.on').length === 1));
ok('storage warn indicator shown', await page.evaluate(() => document.getElementById('swarn').classList.contains('show')));
await page.evaluate(() => { window.__restore(); document.getElementById('save').click(); });
await page.waitForTimeout(150);
ok('retry save succeeds', await page.evaluate(() => document.getElementById('toast').textContent.includes('Session saved')));
ok('warn cleared after success', await page.evaluate(() => !document.getElementById('swarn').classList.contains('show')));

// 13. Corrupt data protection: garbage in storage -> app runs, never overwrites
await page.evaluate(() => localStorage.setItem('liftlog.v1', '{{{corrupt'));
await page.reload(); await page.waitForTimeout(300);
ok('corrupt load: honest toast, in-memory', await page.evaluate(() => document.getElementById('toast').textContent.includes('unreadable')));
ok('corrupt data NOT overwritten', await page.evaluate(() => localStorage.getItem('liftlog.v1') === '{{{corrupt'));
ok('app still renders after corrupt load', await page.evaluate(() => document.querySelectorAll('.card, .restcard').length > 0));

// 14. Re-save same day replaces, not duplicates
await page.evaluate(() => localStorage.removeItem('liftlog.v1'));
await page.reload(); await page.waitForTimeout(300);
for (let round = 0; round < 2; round++) {
  await page.evaluate((round) => {
    const rows = document.querySelectorAll('.srow');
    for (const row of rows) {
      [...row.querySelectorAll('.chip')].find(c => c.dataset.reps === (round ? '11' : '10')).click();
    }
    document.getElementById('save').click();
  }, round);
  await page.waitForTimeout(150);
}
ok('re-save replaces same-day entry', await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('liftlog.v1'));
  const h = s.history.chest;
  return h.length === 1 && h[0].sets[0].reps === 11;
}));

await browser.close();
console.log(fails.length ? '\n' + fails.length + ' FAILURES' : '\nALL PASS');
process.exit(fails.length ? 1 : 0);

