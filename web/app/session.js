/**
 * Záznam hand a statistiky session.
 *
 * Každá dohraná handa se uloží jako malý JSON: pozice, karty, board, výsledek
 * v žetonech a hlavně **rozhodnutí s verdikty** z review. Z toho se pak počítá
 * VPIP, PFR, agresivita (AF) a EV ztráta.
 *
 * Úložiště je localStorage — žádný server, data zůstávají v prohlížeči.
 * Drží se posledních MAX_HANDS hand, aby se to nerozrostlo.
 */

const STORAGE_KEY = "poker-trainer:hands";
const TOTALS_KEY = "poker-trainer:totals";
const CUMULATIVE_KEY = "poker-trainer:cumulative";

export const MAX_HANDS = 100;

const MISTAKE_LABELS = {
  "call-without-odds": "zbytečné dorovnání",
  "fold-with-equity": "zahození dobré handy",
  "raise-without-odds": "zbytečné zvýšení",
};

/**
 * Orientační rozsahy pro zdravý styl. Nejsou to GTO charty — jen pásma,
 * ve kterých se hráč na nízkých stakes obvykle neztrácí.
 */
const BENCHMARKS = {
  6: { vpip: [0.22, 0.3], pfr: [0.18, 0.26], af: [2, 4] },
  9: { vpip: [0.15, 0.22], pfr: [0.12, 0.18], af: [2, 4] },
};

function benchmarkFor(seats) {
  return BENCHMARKS[seats] ?? BENCHMARKS[9];
}

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadHands() {
  const store = storage();
  if (!store) return [];

  try {
    const raw = store.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHands(hands) {
  const store = storage();
  if (!store) return;

  try {
    store.setItem(STORAGE_KEY, JSON.stringify(hands));
  } catch {
    // Plné úložiště nebo soukromý režim — session prostě nepřežije reload.
  }
}

export function appendHand(hands, record) {
  const next = [...hands, record];
  return next.length > MAX_HANDS ? next.slice(next.length - MAX_HANDS) : next;
}

/**
 * Celkový počet odehraných hand — drží se zvlášť, protože historie se
 * do detailu ukládá jen pro posledních MAX_HANDS hand.
 */
export function loadTotals() {
  const store = storage();
  if (!store) return {};

  try {
    const raw = store.getItem(TOTALS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveTotals(totals) {
  const store = storage();
  if (!store) return;

  try {
    store.setItem(TOTALS_KEY, JSON.stringify(totals));
  } catch {
    // ignore
  }
}

export function bumpTotal(seats) {
  const totals = loadTotals();
  const key = String(seats);
  totals[key] = (totals[key] ?? 0) + 1;
  saveTotals(totals);
  return totals;
}

export function totalFor(totals, seats) {
  return totals?.[String(seats)] ?? 0;
}

/* ── kumulativní statistiky ──────────────────────────────────────────── */

function emptyBucket() {
  return {
    hands: 0,
    net: 0,
    evLoss: 0,
    mistakes: 0,
    vpip: 0,
    pfr: 0,
    bets: 0,
    raises: 0,
    calls: 0,
    showdowns: 0,
    showdownWins: 0,
    wins: 0,
    riskSum: 0,
    riskCount: 0,
    bigRisks: 0,
    bigRiskGood: 0,
    mistakeTypes: {},
  };
}

export function loadCumulative() {
  const store = storage();
  if (!store) return {};

  try {
    const raw = store.getItem(CUMULATIVE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCumulative(cumulative) {
  const store = storage();
  if (!store) return;

  try {
    store.setItem(CUMULATIVE_KEY, JSON.stringify(cumulative));
  } catch {
    // ignore
  }
}

function accumulate(bucket, record) {
  bucket.hands += 1;
  bucket.net += record.net ?? 0;
  bucket.evLoss += record.evLoss ?? 0;
  bucket.mistakes += record.mistakes ?? 0;

  if (record.showdown) {
    bucket.showdowns += 1;
    if ((record.net ?? 0) > 0) bucket.showdownWins += 1;
  }
  if ((record.net ?? 0) > 0) bucket.wins += 1;

  const actions = record.actions ?? [];
  const preflop = actions.filter((action) => action.street === "preflop");
  const voluntary = preflop.some(
    (action) =>
      action.action === "call" ||
      action.action === "raise" ||
      action.action === "bet",
  );
  const raised = preflop.some(
    (action) => action.action === "raise" || action.action === "bet",
  );

  if (voluntary) bucket.vpip += 1;
  if (raised) bucket.pfr += 1;

  for (const action of actions) {
    if (action.action === "bet") bucket.bets += 1;
    else if (action.action === "raise") bucket.raises += 1;
    else if (action.action === "call") bucket.calls += 1;
  }

  for (const item of record.review ?? []) {
    if (item.risk && item.risk.chips > 0) {
      bucket.riskSum += item.risk.share;
      bucket.riskCount += 1;

      if (item.risk.share >= 0.25 && item.risk.verdict !== "small" && item.risk.verdict !== "bet") {
        bucket.bigRisks += 1;
        if (item.risk.verdict === "ok") bucket.bigRiskGood += 1;
      }
    }

    if (!item.code) continue;
    bucket.mistakeTypes[item.code] = (bucket.mistakeTypes[item.code] ?? 0) + 1;
  }
}

export function bumpCumulative(record) {
  const cumulative = loadCumulative();
  const key = String(record.seats ?? 9);
  if (!cumulative[key]) cumulative[key] = emptyBucket();

  accumulate(cumulative[key], record);
  saveCumulative(cumulative);
  return cumulative;
}

/** Jednorázové naplnění z historie, když se kumulativní součty ještě nevedly. */
export function seedCumulative(hands) {
  const cumulative = {};

  for (const record of hands) {
    const key = String(record.seats ?? 9);
    if (!cumulative[key]) cumulative[key] = emptyBucket();
    accumulate(cumulative[key], record);
  }

  saveCumulative(cumulative);
  return cumulative;
}

export function cumulativeStats(cumulative, seats, bigBlind = 2) {
  const bucket = cumulative?.[String(seats)];

  if (!bucket || bucket.hands === 0) {
    const empty = computeStats([]);
    empty.seats = seats;
    empty.benchmark = benchmarkFor(seats);
    empty.notes = buildNotes(empty);
    return empty;
  }

  const aggressive = bucket.bets + bucket.raises;
  const af = bucket.calls > 0 ? aggressive / bucket.calls : null;

  const stats = {
    hands: bucket.hands,
    bigBlind,
    seats,
    benchmark: benchmarkFor(seats),
    net: bucket.net,
    netBb: bucket.net / bigBlind,
    bbPer100: bucket.hands > 0 ? (bucket.net / bigBlind / bucket.hands) * 100 : 0,
    vpip: bucket.hands > 0 ? bucket.vpip / bucket.hands : 0,
    pfr: bucket.hands > 0 ? bucket.pfr / bucket.hands : 0,
    af,
    afLabel: afLabel(af),
    showdowns: bucket.showdowns,
    showdownWinRate:
      bucket.showdowns > 0 ? bucket.showdownWins / bucket.showdowns : 0,
    wins: bucket.wins,
    evLoss: bucket.evLoss,
    evLossBb: bucket.evLoss / bigBlind,
    evLossPerHandBb:
      bucket.hands > 0 ? bucket.evLoss / bigBlind / bucket.hands : 0,
    mistakes: bucket.mistakes,
    mistakeTypes: bucket.mistakeTypes ?? {},
    riskAvgShare: bucket.riskCount > 0 ? bucket.riskSum / bucket.riskCount : 0,
    riskCount: bucket.riskCount,
    bigRisks: bucket.bigRisks,
    bigRiskGood: bucket.bigRiskGood,
  };

  stats.notes = buildNotes(stats);
  return stats;
}

export function resetHands() {
  const store = storage();
  if (store) {
    try {
      store.removeItem(STORAGE_KEY);
      store.removeItem(TOTALS_KEY);
      store.removeItem(CUMULATIVE_KEY);
    } catch {
      // ignore
    }
  }
  return [];
}

/** Připraví záznam z dohrané handy a jejího review. */
export function buildRecord(game, review) {
  const hand = game.hand;
  const seat = game.humanSeat;
  const me = hand.seats[seat];
  const net = me.stack - hand.initialStacks[seat];

  return {
    at: Date.now(),
    handNo: game.table.handCount,
    preset: game.presetId,
    seats: game.table.config.numSeats,
    position: game.positionOf(seat),
    hole: [...me.hole],
    board: [...hand.board],
    bb: game.table.config.bigBlind,
    net,
    folded: me.folded,
    showdown: Boolean(hand.result && hand.result.showdown),
    actions: game.decisions.map((decision) => ({
      street: decision.street,
      action: decision.action.type,
      amount: decision.action.amount ?? null,
      toCall: decision.toCall,
    })),
    review: review.items.map((item) => ({
      street: item.street,
      action: item.action,
      equity: item.equity,
      required: item.required,
      verdict: item.verdict,
      code: item.code ?? null,
      note: item.note,
      strategicNotes: item.strategicNotes ?? [],
      exploit: item.exploit ?? null,
      risk: item.risk ?? null,
      evLoss: item.evLoss,
    })),
    evLoss: review.totalLoss,
    mistakes: review.mistakes,
  };
}

function afLabel(af) {
  if (af === null) return "—";
  if (af < 1) return "pasivní";
  if (af < 2) return "spíš pasivní";
  if (af <= 4) return "vyvážená";
  return "agresivní";
}

function buildNotes(stats) {
  if (stats.hands === 0) return ["Zatím žádné handy."];

  const notes = [];

  if (stats.hands < 20) {
    notes.push("Vzorek je malý — čísla ber s rezervou, smysl začnou dávat po stovkách hand.");
  }

  if (stats.vpip - stats.pfr > 0.2) {
    notes.push(
      "Velký rozdíl mezi VPIP a PFR: hodně dorovnáváš a málo zvyšuješ. Zvaž, které handy by měly být zvýšení.",
    );
  }

  if (stats.af !== null) {
    if (stats.af < 1) {
      notes.push("Agresivita pod 1: víc dorovnáváš než sázíš. Hledej místa na sázku na hodnotu.");
    } else if (stats.af > 4) {
      notes.push("Agresivita nad 4: hodně sázíš. Hlídej velikost potů s marginálními handami.");
    }
  }

  // Srovnání s pásmem pro danou velikost stolu.
  if (stats.hands >= 20) {
    const vpip = Math.round(stats.vpip * 100);
    const [vpipLow, vpipHigh] = stats.benchmark.vpip.map((value) => Math.round(value * 100));
    if (stats.vpip < stats.benchmark.vpip[0]) {
      notes.push(
        `VPIP ${vpip} % je pod obvyklým pásmem pro ${stats.seats}-max (${vpipLow}–${vpipHigh} %). Hraješ těsně.`,
      );
    } else if (stats.vpip > stats.benchmark.vpip[1]) {
      notes.push(
        `VPIP ${vpip} % je nad obvyklým pásmem pro ${stats.seats}-max (${vpipLow}–${vpipHigh} %). Hraješ hodně hand.`,
      );
    }

    const pfr = Math.round(stats.pfr * 100);
    const [pfrLow, pfrHigh] = stats.benchmark.pfr.map((value) => Math.round(value * 100));
    if (stats.pfr < stats.benchmark.pfr[0]) {
      notes.push(
        `PFR ${pfr} % je pod pásmem pro ${stats.seats}-max (${pfrLow}–${pfrHigh} %). Zvyšuj víc.`,
      );
    } else if (stats.pfr > stats.benchmark.pfr[1]) {
      notes.push(
        `PFR ${pfr} % je nad pásmem pro ${stats.seats}-max (${pfrLow}–${pfrHigh} %). Zvyšuješ hodně.`,
      );
    }
  }

  const top = Object.entries(stats.mistakeTypes).sort((a, b) => b[1] - a[1])[0];
  if (top) {
    notes.push(
      `Nejčastější chyba: ${MISTAKE_LABELS[top[0]] ?? top[0]} (${top[1]}×).`,
    );
  } else if (stats.hands >= 10) {
    notes.push("Zatím bez matematických chyb — dobrý.");
  }

  return notes;
}

/**
 * Souhrn session.
 *
 * VPIP = podíl hand, do kterých jsi dobrovolně vložil žetony preflop.
 * PFR = podíl hand, které jsi preflop raisnul.
 * AF (agresivita) = (bety + raisy) / cally; null, když nejsou žádné cally.
 */
export function computeStats(hands) {
  const total = hands.length;
  const bigBlind = hands.length > 0 && hands[0].bb ? hands[0].bb : 2;

  let net = 0;
  let evLoss = 0;
  let mistakes = 0;
  let vpipCount = 0;
  let pfrCount = 0;
  let bets = 0;
  let raises = 0;
  let calls = 0;
  let showdowns = 0;
  let showdownWins = 0;
  let wins = 0;
  let riskSum = 0;
  let riskCount = 0;
  let bigRisks = 0;
  let bigRiskGood = 0;
  const mistakeTypes = {};

  for (const hand of hands) {
    net += hand.net ?? 0;
    evLoss += hand.evLoss ?? 0;
    mistakes += hand.mistakes ?? 0;

    if (hand.showdown) {
      showdowns++;
      if ((hand.net ?? 0) > 0) showdownWins++;
    }
    if ((hand.net ?? 0) > 0) wins++;

    const actions = hand.actions ?? [];
    const preflop = actions.filter((action) => action.street === "preflop");
    const voluntary = preflop.some(
      (action) =>
        action.action === "call" ||
        action.action === "raise" ||
        action.action === "bet",
    );
    const raised = preflop.some(
      (action) => action.action === "raise" || action.action === "bet",
    );

    if (voluntary) vpipCount++;
    if (raised) pfrCount++;

    for (const action of actions) {
      if (action.action === "bet") bets++;
      else if (action.action === "raise") raises++;
      else if (action.action === "call") calls++;
    }

    for (const item of hand.review ?? []) {
      if (item.risk && item.risk.chips > 0) {
        riskSum += item.risk.share;
        riskCount += 1;

        if (item.risk.share >= 0.25 && item.risk.verdict !== "small" && item.risk.verdict !== "bet") {
          bigRisks += 1;
          if (item.risk.verdict === "ok") bigRiskGood += 1;
        }
      }

      if (!item.code) continue;
      mistakeTypes[item.code] = (mistakeTypes[item.code] ?? 0) + 1;
    }
  }

  const aggressive = bets + raises;
  const af = calls > 0 ? aggressive / calls : null;

  const seats = hands.find((hand) => hand.seats)?.seats ?? 9;

  const stats = {
    hands: total,
    bigBlind,
    seats,
    benchmark: benchmarkFor(seats),
    net,
    netBb: net / bigBlind,
    bbPer100: total > 0 ? (net / bigBlind / total) * 100 : 0,
    vpip: total > 0 ? vpipCount / total : 0,
    pfr: total > 0 ? pfrCount / total : 0,
    af,
    afLabel: afLabel(af),
    showdowns,
    showdownWinRate: showdowns > 0 ? showdownWins / showdowns : 0,
    wins,
    evLoss,
    evLossBb: evLoss / bigBlind,
    evLossPerHandBb: total > 0 ? evLoss / bigBlind / total : 0,
    mistakes,
    mistakeTypes,
    riskAvgShare: riskCount > 0 ? riskSum / riskCount : 0,
    riskCount,
    bigRisks,
    bigRiskGood,
  };

  stats.notes = buildNotes(stats);
  return stats;
}
