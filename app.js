// Proof v1: Load CSV export -> compute "days late" -> show bottlenecks.
// No integrations, no auth, no backend. Just clarity.

const CSV_PATH = "data/shipments.csv";

// Utility: parse CSV (simple; assumes no embedded commas in fields)
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(",").map(c => c.trim());
    const row = {};
    headers.forEach((h, i) => row[h] = cols[i] ?? "");
    return row;
  });
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// Business rule for v1:
// - If actual_delivery exists: compare planned vs actual.
// - If not delivered yet: compare planned vs today.
// - Late if daysLate > 0.
function computeDaysLate(row, todayISO) {
  const planned = row.planned_delivery;
  if (!planned) return 0;

  const end = row.actual_delivery && row.actual_delivery.length ? row.actual_delivery : todayISO;
  const diff = daysBetween(planned, end);
  return diff > 0 ? diff : 0;
}

function groupCount(rows, key) {
  const map = new Map();
  for (const r of rows) {
    const k = (r[key] || "Unknown").trim() || "Unknown";
    map.set(k, (map.get(k) || 0) + 1);
  }
  // return sorted desc
  return [...map.entries()].sort((a,b) => b[1] - a[1]);
}

function fmtPct(n) {
  return `${Math.round(n)}%`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderList(id, entries) {
  const ul = document.getElementById(id);
  ul.innerHTML = "";
  for (const [k, v] of entries) {
    const li = document.createElement("li");
    li.textContent = `${k}: ${v}`;
    ul.appendChild(li);
  }
}

function renderTable(rows) {
  const tbody = document.querySelector("#lateTable tbody");
  tbody.innerHTML = "";

  for (const r of rows) {
    const tr = document.createElement("tr");
    const cells = [
      r.shipment_id, r.po, r.supplier, r.carrier, r.status,
      r.planned_delivery || "—",
      r.actual_delivery || "—",
      String(r.days_late),
      r.handoff_point || "—"
    ];
    for (const c of cells) {
      const td = document.createElement("td");
      td.textContent = c;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

async function main() {
  const res = await fetch(CSV_PATH, { cache: "no-store" });
  const text = await res.text();
  const rows = parseCSV(text);

  const today = new Date();
  const todayISO = today.toISOString().slice(0,10);

  // annotate
  for (const r of rows) {
    r.days_late = computeDaysLate(r, todayISO);
  }

  const late = rows.filter(r => r.days_late > 0);
  late.sort((a,b) => b.days_late - a.days_late);

  setText("asOf", `As of: ${todayISO}`);
  setText("totalCount", `Shipments: ${rows.length}`);
  setText("lateCount", `Late: ${late.length}`);

  // KPIs
  const onTime = rows.length ? ((rows.length - late.length) / rows.length) * 100 : 0;
  setText("onTimePct", fmtPct(onTime));

  const avgLate = late.length ? (late.reduce((s,r)=>s+r.days_late,0) / late.length) : 0;
  setText("avgLate", avgLate ? avgLate.toFixed(1) : "0.0");

  const lateBySupplier = groupCount(late, "supplier");
  const lateByHandoff = groupCount(late, "handoff_point");

  setText("worstSupplier", lateBySupplier[0] ? `${lateBySupplier[0][0]} (${lateBySupplier[0][1]})` : "—");
  setText("worstHandoff", lateByHandoff[0] ? `${lateByHandoff[0][0]} (${lateByHandoff[0][1]})` : "—");

  renderList("lateBySupplier", lateBySupplier);
  renderList("lateByHandoff", lateByHandoff);

  renderTable(late.slice(0, 25));
}

main().catch(err => {
  console.error(err);
  alert("Failed to load proof data. Check that data/shipments.csv exists and the site is served (not file://).");
});
