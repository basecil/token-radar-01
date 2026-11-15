// The token radar's model (radar-2): one sealed snapshot in, one ranked board out.
//
// The board ranks protocols that record no token yet, by the value a token would
// carry if the protocol's record stayed as it is. It never predicts whether or
// when a token is issued: the implied value is this entry's own claim.
//
// Board selection. The snapshot's watchlist (40 protocols at or above the floor
// that record no token and are not a wrapped, staked or bridged product of one
// that trades) is the floor, never the ceiling: every watchlist slug is ranked.
// Below the floor the radar adds every pre-token protocol that passes the same
// exclusion rule from the fields the snapshot carries (category, name). Above
// the floor only watchlist slugs are ranked: the house's list used
// parentProtocol, a field the snapshot does not carry, so above the floor the
// house list is authoritative and the radar does not second-guess it.
//
// Implied value follows only from the snapshot's own figures. The market, not
// a fixed constant, sets the price of TVL: for each category the model takes
// the live-token protocols of that category and reads their market-cap-to-TVL
// ratios, then shrinks the category median toward the global median so a thin
// category cannot swing the multiple:
//
//   multiple   = (n * medianCat + 8 * medianGlobal) / (n + 8), clamped [0.02, 1.5]
//   base       = tvl_usd * multiple
// Each live ratio is winsorized to [0.005, 2.0] before it enters any median, so
// one protocol with a market cap far above its TVL cannot set its category's price.
//   growth     = clamp(change_7d, -60, 120) per cent; growthMult = 1 + growth/100 * 0.5
//   maturity   = 0.6 + min(age_days, 1095) / 1095 * 0.4   (age unknown: 365 days)
//   reach      = 1 + 0.02 * min(chains - 1, 5), at most 1.10
//   implied    = max(1, round(base * growthMult * maturityMult * reach))
//
// Uncertainty is shown, never hidden. The implied range re-runs the same
// formula with the category's 25th and 75th percentile multiples (shrunk the
// same way), so a wide range says the comparables disagree. It is a
// comparable-based scenario, never a confidence interval: no probability is
// claimed. Confidence (0-100) scores the evidence behind the row: missing
// growth or age, thin comparables, a spike or crash week, and a short track
// record each cost points, and each deduction is named as a flag. Confidence
// never enters the implied value: a shaky row is flagged, not silently
// discounted, and a popular row never cancels its own hazards.
//
// Two more values travel with every row so the reader can see what the
// adjustments do: the base implied value (the growth multiplier removed) and
// the plain implied value (growth and reach both removed). The board ranks
// by the adjusted value; the detail view shows all three, and the sandbox
// can rank by the plain one.
//
// TVL is a weak proxy for some rows. Curators, allocators, risk managers and
// index providers mostly hold or advise on client capital: a future token
// would capture a share of fees, not the TVL itself. Those rows are flagged
// (weak_proxy) and their implied value is an upper bound, stated as one.
// The flag is a warning, not a discount: the snapshot carries no fee data,
// so no evidence-based discount exists, and the model does not invent one.
// Splitting the calibration by group was considered and rejected: the live
// comparables for the service group are 1-3 protocols, so a separate
// multiple would rest the top of the board on one or two ratios.
//
// No protocol name is ever special-cased: the same functions score every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  shrink_k: number;
  multiple_floor: number;
  multiple_cap: number;
  range_floor: number;
  range_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  reach_step: number;
  reach_max_extra: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 8,
  multiple_floor: 0.02,
  multiple_cap: 1.5,
  range_floor: 0.01,
  range_cap: 2.0,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  reach_step: 0.02,
  reach_max_extra: 0.1,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  weak_proxy: boolean;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  implied_base_usd: number;
  implied_plain_usd: number;
  confidence: number;
  flags: string[];
  model: {
    multiple: number;
    category_median: number | null;
    comparables: number;
    global_median: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    reach_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  weak_proxy: boolean;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  implied_base_usd: number;
  implied_plain_usd: number;
  confidence: number;
  flags: string[];
  multiple: number;
  category_median: number | null;
  comparables: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  reach_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl_ratio: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_median: number;
  global_low: number;
  global_high: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a sorted array, or null when it is empty. */
function medianOf(sorted: number[]): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The p-th percentile of a sorted array by linear interpolation, or null when empty. */
function percentileOf(sorted: number[], p: number): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  if (n === 1) return sorted[0]!;
  const at = p * (n - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

/** The live-token comparables: market-cap-to-TVL ratios by category, plus the global set. */
export interface Comparables {
  byCategory: Map<string, number[]>;
  global: number[];
  globalMedian: number;
  globalLow: number;
  globalHigh: number;
}

/** Collect the live-token protocols' mcap/TVL ratios from the snapshot. */
export function collectComparables(snapshot: Snapshot): Comparables {
  const byCategory = new Map<string, number[]>();
  const global: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    if (p.category === null || p.category === 'CEX') continue;
    // Winsorize: one protocol with a market cap far above its TVL must not
    // set its whole category's price, so each ratio is capped before it
    // enters any median.
    const ratio = Math.min(2.0, Math.max(0.005, p.mcap_usd / p.tvl_usd));
    if (!Number.isFinite(ratio)) continue;
    global.push(ratio);
    const list = byCategory.get(p.category) ?? [];
    list.push(ratio);
    byCategory.set(p.category, list);
  }
  global.sort((a, b) => a - b);
  for (const list of byCategory.values()) list.sort((a, b) => a - b);
  return {
    byCategory,
    global,
    globalMedian: medianOf(global) ?? 0.25,
    globalLow: percentileOf(global, 0.25) ?? 0.1,
    globalHigh: percentileOf(global, 0.75) ?? 0.5,
  };
}

/** Shrink a category statistic toward its global value: thin samples stay near the global. */
function shrunk(cat: number | null, glob: number, n: number, k: number): number {
  if (cat === null) return glob;
  return (n * cat + k * glob) / (n + k);
}

/** The category multiple and its uncertainty band for one protocol. */
export function categoryMultiple(
  category: string | null,
  comps: Comparables,
  model: ModelConstants,
): { multiple: number; low: number; high: number; median: number | null; n: number; spread: number | null } {
  const list = category === null ? undefined : comps.byCategory.get(category);
  const n = list === undefined ? 0 : list.length;
  const median = list === undefined ? null : medianOf(list);
  const p25 = list === undefined ? null : percentileOf(list, 0.25);
  const p75 = list === undefined ? null : percentileOf(list, 0.75);
  // How far the category's own comparables disagree (n>=3 only): a wide
  // spread says the peer set is mixed, whatever the shrunk range says.
  const spread = list !== undefined && n >= 3 && p25 !== null && p75 !== null && p25 > 0 ? p75 / p25 : null;
  const multiple = Math.min(
    model.multiple_cap,
    Math.max(model.multiple_floor, shrunk(median, comps.globalMedian, n, model.shrink_k)),
  );
  const low = Math.min(
    model.range_cap,
    Math.max(model.range_floor, shrunk(p25, comps.globalLow, n, model.shrink_k)),
  );
  const high = Math.min(
    model.range_cap,
    Math.max(model.range_floor, shrunk(p75, comps.globalHigh, n, model.shrink_k)),
  );
  return { multiple, low, high, median, n, spread };
}

/** Whether the protocol's TVL is mostly client capital under management or advice. */
export function isWeakProxy(p: SnapshotProtocol): boolean {
  const c = (p.category ?? '').toLowerCase();
  return c.includes('curator') || c.includes('allocator') || c.includes('risk') || c.includes('indexes');
}

/** The full scoring of one protocol: implied value, range, confidence and flags. */
export function scoreProtocol(
  protocol: SnapshotProtocol,
  asOf: string,
  comps: Comparables,
  model: ModelConstants,
): {
  implied: number;
  low: number;
  high: number;
  base: number;
  plain: number;
  confidence: number;
  flags: string[];
  multiple: number;
  median: number | null;
  n: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  reachMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, low: lowMult, high: highMult, median, n, spread } = categoryMultiple(protocol.category, comps, model);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), Math.round(model.reach_max_extra / model.reach_step));
  const reachMult = 1 + extraChains * model.reach_step;
  const base = protocol.tvl_usd;
  const implied = Math.max(1, Math.round(base * multiple * growthMult * maturityMult * reachMult));
  const low = Math.max(1, Math.round(base * lowMult * growthMult * maturityMult * reachMult));
  const high = Math.max(implied, Math.round(base * highMult * growthMult * maturityMult * reachMult));
  // The same value with the short-term adjustments removed, so the reader can
  // see what they do: base drops growth, plain drops growth and reach.
  const baseImplied = Math.max(1, Math.round(base * multiple * maturityMult * reachMult));
  const plainImplied = Math.max(1, Math.round(base * multiple * maturityMult));

  // Confidence scores the evidence, never the value: each gap is named, not hidden.
  let confidence = 100;
  const flags: string[] = [];
  if (protocol.change_7d === null) {
    confidence -= 15;
    flags.push('No 7-day change reported: growth assumed flat.');
  } else if (protocol.change_7d > 100 || protocol.change_7d < -50) {
    confidence -= 10;
    flags.push(
      protocol.change_7d > 100
        ? '7-day growth above +100%: a spike week may not persist.'
        : '7-day change below -50%: TVL fell sharply this week.',
    );
  }
  if (protocol.listed_at === null) {
    confidence -= 15;
    flags.push('Listing date unknown: age assumed one year.');
  } else if (age !== null && age < 90) {
    confidence -= 5;
    flags.push('Listed under 90 days ago: a short track record.');
  }
  if (n < 3) {
    confidence -= 12;
    flags.push(`Thin comparables: only ${n} live-token protocol${n === 1 ? '' : 's'} in this category.`);
  } else if (spread !== null && spread > 5) {
    flags.push('Mixed comparables: this category\'s live mcap/TVL ratios span more than 5x, so the scenarios are wide.');
  }
  // A weak TVL proxy is a warning, not a confidence deduction: the data is
  // complete, but the model's premise (TVL as value a token could capture)
  // is weaker for this row. The implied value is an upper bound.
  if (isWeakProxy(protocol)) {
    flags.push('TVL is mostly client capital under management or advice here: a future token would capture fee share, not the TVL itself. Treat the implied value as an upper bound.');
  }
  return { implied, low, high, base: baseImplied, plain: plainImplied, confidence, flags, multiple, median, n, growthPct, growthMult, maturityMult, reachMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist rule treats as a wrapped, staked or bridged product. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a wrapped or staked product's name begins with. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A whole word wrapped, staked or staking anywhere in the name, in any case. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether the watchlist's exclusion rule, from the fields the snapshot carries,
 * treats this protocol as a wrapped, staked or bridged product of one that trades.
 * The rule's parentProtocol leg cannot be checked here: the snapshot does not
 * carry it, which is why above the floor the radar defers to the house list.
 */
export function isExcludedProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (VERSIONED.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  return EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x));
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = collectComparables(snapshot);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is ranked.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the floor that pass the
  // watchlist's exclusion rule from the visible fields, by TVL. Above the
  // floor the house list stands, because it used parentProtocol.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isPreToken(p) && !isExcludedProduct(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const watchlist = new Set(snapshot.watchlist);
  const scored = [...chosen.values()].map((p) => {
    const s = scoreProtocol(p, snapshot.as_of, comps, model);
    return { p, s };
  });
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((item, i) => ({
    rank: i + 1,
    slug: item.p.slug,
    name: item.p.name,
    category: item.p.category,
    chains: item.p.chains,
    tvl_usd: item.p.tvl_usd,
    change_7d: item.p.change_7d,
    mcap_usd: item.p.mcap_usd,
    listed_at: item.p.listed_at,
    gecko_id: item.p.gecko_id,
    symbol: item.p.symbol,
    token_status: 'pre-token',
    on_watchlist: watchlist.has(item.p.slug),
    weak_proxy: isWeakProxy(item.p),
    age_days: item.s.age,
    implied_value_usd: item.s.implied,
    implied_low_usd: item.s.low,
    implied_high_usd: item.s.high,
    implied_base_usd: item.s.base,
    implied_plain_usd: item.s.plain,
    confidence: item.s.confidence,
    flags: item.s.flags,
    model: {
      multiple: round4(item.s.multiple),
      category_median: item.s.median === null ? null : round4(item.s.median),
      comparables: item.s.n,
      global_median: round4(comps.globalMedian),
      growth_pct: item.s.growthPct,
      growth_multiplier: round4(item.s.growthMult),
      maturity_multiplier: round4(item.s.maturityMult),
      reach_multiplier: round4(item.s.reachMult),
      age_days: item.s.age,
    },
    farm_steps: farmSteps(item.p, item.s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The gas tier of a chain family: Ethereum mainnet is dear, fast chains are near-free. */
function gasTier(chain: string): 'high' | 'low' | 'tiny' {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 'high';
  if (c === 'solana' || c === 'sui' || c === 'aptos' || c === 'near' || c === 'ton') return 'tiny';
  return 'low';
}

/** The setup gas for one deposit on this protocol's first chain. */
function setupGas(chain: string): string {
  const tier = gasTier(chain);
  if (tier === 'high') return 'about $8 to $15 of gas';
  if (tier === 'tiny') return 'under $0.10 of gas';
  return 'under $1 of gas';
}

/** The weekly gas for one qualifying action on this protocol's first chain. */
function weeklyGas(chain: string): string {
  const tier = gasTier(chain);
  if (tier === 'high') return 'about $5 of gas a week';
  if (tier === 'tiny') return 'a few cents of gas a week';
  return 'under $1 of gas a week';
}

/** The category's one action, in the words a farmer can follow, with its own risk named. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} and borrow a small amount against it; keep the health factor above 2 so a dip cannot liquidate you.`;
  }
  if (c.includes('dex') || c.includes('liquidity manager')) {
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} in the pair it rewards most; expect impermanent loss if the price moves far.`;
  }
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('leveraged farm') || c.includes('farm')) {
    return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and keep the shares; check the vault's strategy before you deposit.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app, so the activity is more than one transfer.`;
  }
  if (c.includes('restak') || c.includes('staking pool') || c.includes('staking')) {
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token; note the unbonding wait before you stake.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading')) {
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position; keep leverage at 2x or less so a wick cannot wipe it.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} and place one small position on a ${name} market you have read; size it so losing it costs little.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares; read what the curator allocates to before you deposit.`;
  }
  if (c.includes('stable') || c.includes('dual-token')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it; check what backs the peg first.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it; check the issuer and the redemption terms first.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy until it expires.`;
  }
  if (c === 'chain') {
    return `Bridge $${capital} of USDC to ${name} and use two of its own apps, such as its DEX and a lending market, so the activity is real usage.`;
  }
  if (c.includes('indexes')) {
    return `Buy $${capital} of the ${name} index token on ${chain} and hold it; check what the index holds first.`;
  }
  if (c.includes('payment') || c.includes('card')) {
    return `Fund $${capital} through ${name} on ${chain} and make one real payment with it each week.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open; read the protocol's own docs before you deposit.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${setupGas(chain)}`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, so the wallet stays active.`,
      cost: weeklyGas(chain),
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl_ratio:
        p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    on_watchlist: row.on_watchlist,
    weak_proxy: row.weak_proxy,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    implied_base_usd: row.implied_base_usd,
    implied_plain_usd: row.implied_plain_usd,
    confidence: row.confidence,
    flags: row.flags,
    multiple: row.model.multiple,
    category_median: row.model.category_median,
    comparables: row.model.comparables,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    reach_multiplier: row.model.reach_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = collectComparables(snapshot);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.on_watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_median: round4(comps.globalMedian),
    global_low: round4(comps.globalLow),
    global_high: round4(comps.globalHigh),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, under the 100-row floor`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
