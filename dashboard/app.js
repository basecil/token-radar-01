// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, filters, a per-protocol detail view with the model's own inputs and
// the protocol's farm plan, a live-token view of the comparables, and a model sandbox that re-ranks
// the board under the reader's own weights. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', wl: false, conf: 0, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var sandbox = { growth: DATA.model.growth_weight, maturity: DATA.model.maturity_range };
  var sandboxOn = false;

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // The sandbox overrides the growth weight and the maturity range only; the category multiple,
  // the TVL and the reach stay the board's own.
  function impliedOf(row, model, sb) {
    var gw = sb ? sb.growth : model.growth_weight;
    var mr = sb ? sb.maturity : model.maturity_range;
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * gw;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * mr;
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * maturity * row.reach_multiplier));
  }
  function shownImplied(row) { return sandboxOn ? impliedOf(row, DATA.model, sandbox) : row.implied_value_usd; }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasTier(chain) {
    var c = chain.toLowerCase();
    if (c === 'ethereum') return 'high';
    if (c === 'solana' || c === 'sui' || c === 'aptos' || c === 'near' || c === 'ton') return 'tiny';
    return 'low';
  }
  function setupGas(chain) {
    var t = gasTier(chain);
    if (t === 'high') return 'about $8 to $15 of gas';
    if (t === 'tiny') return 'under $0.10 of gas';
    return 'under $1 of gas';
  }
  function weeklyGas(chain) {
    var t = gasTier(chain);
    if (t === 'high') return 'about $5 of gas a week';
    if (t === 'tiny') return 'a few cents of gas a week';
    return 'under $1 of gas a week';
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and borrow a small amount against it; keep the health factor above 2 so a dip cannot liquidate you.';
    if (c.indexOf('dex') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' in the pair it rewards most; expect impermanent loss if the price moves far.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-TVL vault on " + chain + ' and keep the shares; check the vault\'s strategy before you deposit.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app, so the activity is more than one transfer.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking pool') >= 0 || c.indexOf('staking') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token; note the unbonding wait before you stake.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trading') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position; keep leverage at 2x or less so a wick cannot wipe it.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one small position on a ' + name + ' market you have read; size it so losing it costs little.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares; read what the curator allocates to before you deposit.';
    if (c.indexOf('stable') >= 0 || c.indexOf('dual-token') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it; check what backs the peg first.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield asset on " + chain + ' and hold it; check the issuer and the redemption terms first.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy until it expires.';
    if (c === 'chain') return 'Bridge $' + capital + ' of USDC to ' + name + ' and use two of its own apps, such as its DEX and a lending market, so the activity is real usage.';
    if (c.indexOf('indexes') >= 0) return 'Buy $' + capital + ' of the ' + name + ' index token on ' + chain + ' and hold it; check what the index holds first.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Fund $' + capital + ' through ' + name + ' on ' + chain + ' and make one real payment with it each week.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + " and keep the position open; read the protocol's own docs before you deposit.";
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + setupGas(chain), time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, so the wallet stays active.', cost: weeklyGas(chain), time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('wl') === '1') state.wl = true;
    if (params.get('conf')) state.conf = parseInt(params.get('conf'), 10) || 0;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.wl) params.set('wl', '1');
    if (state.conf) params.set('conf', String(state.conf));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.wl && !r.on_watchlist) return false;
      if (r.confidence < state.conf) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'confidence') { av = a.confidence; bv = b.confidence; }
      else { av = shownImplied(a); bv = shownImplied(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { html: 'The watchlist is the floor: every protocol with at least <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL</b> and no token on record. The early radar adds <b>' + DATA.early_size + ' pre-token protocols</b> below that floor. Implied value is a model calibrated on live-token comparables, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { html: DATA.watchlist_size + ' / ' + DATA.watchlist_size + ' <em>all</em>' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Global mcap / TVL median' }), el('b', { text: String(DATA.global_median) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var confSel = el('select', { id: 'conf', 'aria-label': 'Filter by confidence' },
      el('option', { value: '0', text: 'Any confidence', selected: state.conf === 0 ? 'selected' : null }),
      el('option', { value: '70', text: 'Confidence 70+', selected: state.conf === 70 ? 'selected' : null }),
      el('option', { value: '85', text: 'Confidence 85+', selected: state.conf === 85 ? 'selected' : null })
    );
    confSel.addEventListener('change', function () { state.conf = parseInt(confSel.value, 10) || 0; writeHash(); render(); });
    var wlBox = el('input', { type: 'checkbox', id: 'wl', checked: state.wl ? 'checked' : null });
    wlBox.addEventListener('change', function () { state.wl = wlBox.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field grow' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { for: 'conf', text: 'Confidence' }), confSel),
      el('label', { class: 'field check', for: 'wl' }, wlBox, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' + (sandboxOn ? ' (sandbox ranking)' : '') : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label, cls) {
    return el('th', { scope: 'col', class: cls || null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; state.conf = 0; writeHash(); render(); } })
      ));
    }
    var max = 0;
    list.forEach(function (r) { max = Math.max(max, shownImplied(r)); });
    if (!max) max = 1;
    var tbody = el('tbody');
    list.forEach(function (r, i) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var badge = r.on_watchlist
        ? el('span', { class: 'status watch', text: 'watchlist' })
        : (r.flags && r.flags.length ? el('span', { class: 'status warn', text: 'caution' }) : el('span', { class: 'status', text: 'early' }));
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(sandboxOn ? i + 1 : r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((shownImplied(r) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(shownImplied(r)) })
        )),
        el('td', { class: 'num range', text: fmtUsd(r.implied_low_usd) + ' - ' + fmtUsd(r.implied_high_usd) }),
        el('td', null, el('div', { class: 'conf' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { class: r.confidence < 70 ? 'low' : null, style: 'width:' + r.confidence + '%' })),
          el('span', { class: 'num', text: String(r.confidence) })
        )),
        el('td', null, badge)
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: sandboxOn ? 'Sandbox ranking: the board re-scored under your weights. Select a row for its model and farm plan.' : 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank', 'num'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL', 'num'),
            sortHeader('growth', '7d', 'num'),
            sortHeader('age', 'Age', 'num'),
            sortHeader('implied', 'Implied value', 'num'),
            el('th', { scope: 'col', class: 'num', text: 'Range' }),
            sortHeader('confidence', 'Conf.', 'num'),
            el('th', { scope: 'col', text: 'Tag' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'status live', text: 'already trades' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_tvl_ratio === null ? 'n/a' : String(r.mcap_tvl_ratio) })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their mcap/TVL ratios calibrate the pre-token multiples: each category is priced off its own live comparables.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: '7d' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' }), el('th', { scope: 'col', class: 'num', text: 'Mcap / TVL' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { html: 'Every row is scored by one function of the snapshot figures. <b>No protocol name is special-cased, and no row is hand-picked.</b> The market sets the price of TVL: each category is priced off its own live-token comparables, shrunk toward the global median so a thin category cannot swing the multiple.' }),
      el('div', { class: 'formula' },
        'multiple = (n x median(category mcap/TVL) + ' + m.shrink_k + ' x ' + DATA.global_median + ') / (n + ' + m.shrink_k + '), clamped [' + m.multiple_floor + ', ' + m.multiple_cap + ']'
      ),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x reach )'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Reach adds ' + m.reach_step + ' per extra chain, at most +' + m.reach_max_extra + '. The range re-runs the formula with the 25th and 75th percentile multiples, so a wide range says the comparables disagree. Confidence scores the evidence behind the row and never enters the value: a shaky row is flagged, not silently discounted.' })
    );
  }

  function sandboxPanel() {
    var m = DATA.model;
    var gOut = el('output', { text: sandbox.growth.toFixed(2) });
    var gIn = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(sandbox.growth), 'aria-label': 'Growth weight' });
    gIn.addEventListener('input', function () { sandbox.growth = parseFloat(gIn.value); gOut.textContent = sandbox.growth.toFixed(2); applySandbox(); });
    var mOut = el('output', { text: sandbox.maturity.toFixed(2) });
    var mIn = el('input', { type: 'range', min: '0', max: '0.8', step: '0.05', value: String(sandbox.maturity), 'aria-label': 'Maturity range' });
    mIn.addEventListener('input', function () { sandbox.maturity = parseFloat(mIn.value); mOut.textContent = sandbox.maturity.toFixed(2); applySandbox(); });
    var reset = el('button', { class: 'button ghost', type: 'button', text: 'Reset to the board model', onclick: function () { sandbox.growth = m.growth_weight; sandbox.maturity = m.maturity_range; sandboxOn = false; render(); } });
    return el('section', { class: 'panel sandbox' },
      el('h2', { text: 'Model sandbox' }),
      el('p', { class: 'sub', text: 'Change the weights and the board re-ranks at once, under your model. The board file keeps the base model; the sandbox only re-scores what you see.' }),
      el('div', { class: 'sliders' },
        el('div', { class: 'slider' }, el('label', null, el('span', { text: 'Growth weight (base ' + m.growth_weight + ')' }), gOut), gIn),
        el('div', { class: 'slider' }, el('label', null, el('span', { text: 'Maturity range (base ' + m.maturity_range + ')' }), mOut), mIn)
      ),
      reset,
      el('p', { class: 'note', text: sandboxOn ? 'Sandbox ranking is live: ranks and implied values below follow your weights.' : 'Move a slider to re-rank the board under your own weights.' })
    );
  }
  function applySandbox() {
    sandboxOn = sandbox.growth !== DATA.model.growth_weight || sandbox.maturity !== DATA.model.maturity_range;
    render();
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model, null);
    var drift = Math.abs(recomputed - row.implied_value_usd) / Math.max(1, row.implied_value_usd);
    var verify = drift < 0.001
      ? 'The page recomputes this row as ' + fmtUsd(recomputed) + ', the same number board.json carries within rounding.'
      : 'The page recomputes this row as ' + fmtUsd(recomputed) + ', which differs from the board: the data would be stale.';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? ' - watchlist' : ' - early find') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: String(row.multiple) + ' (' + row.comparables + (row.comparables === 1 ? ' comp)' : ' comps)') })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth x maturity x reach' }), el('b', { class: 'num', text: String(row.growth_multiplier) + ' x ' + String(row.maturity_multiplier) + ' x ' + String(row.reach_multiplier) })),
        el('div', null, el('span', { text: 'Confidence' }), el('b', { class: 'num', text: String(row.confidence) + ' / 100' })),
        el('div', { class: 'wide' }, el('span', { text: 'Implied value (range from the comparables)' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) + '  -  ' + fmtUsd(row.implied_low_usd) + ' to ' + fmtUsd(row.implied_high_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. ' + verify + ' This is an estimate, not a price. It says what a token would be worth if the record stayed as it is; it does not say a token is coming.' })
    ));
    var flagList = (row.flags && row.flags.length)
      ? el('ul', { class: 'flags' }, row.flags.map(function (f) { return el('li', { text: f }); }))
      : el('ul', { class: 'flags' }, el('li', { class: 'ok', text: 'No flags: growth, age and comparables are all on record for this row.' }));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Evidence and cautions' }),
      flagList
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('p', { class: 'foot', html: '<b>What this radar does not know.</b> The snapshot is frozen at ' + DATA.as_of + ' and says a protocol <b>records no token</b>, never that it has none: a protocol on the board may still hold a token its DefiLlama record does not carry. Below the floor the radar applies the watchlist exclusion rule from the visible fields; it cannot see parentProtocol, so a wrapped product may still slip in below the floor. Implied values are this entry\u2019s own claim, calibrated on live-token comparables, and no token is promised. Data: DefiLlama protocol index, fetched once for this snapshot.' });
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(modelPanel());
      shell.appendChild(sandboxPanel());
    }
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
