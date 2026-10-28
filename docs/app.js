"use strict";

const fmt = new Intl.NumberFormat("en-US");
const compact = (v) => (v >= 1000 ? `${v / 1000}K` : String(v));
const $ = (id) => document.getElementById(id);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Merge two option objects, with b winning (Chart.js options are nested).
function merge(a, b) {
  const out = { ...a };
  for (const key of Object.keys(b)) {
    const bothObjects = b[key] && typeof b[key] === "object" && !Array.isArray(b[key])
      && a[key] && typeof a[key] === "object";
    out[key] = bothObjects ? merge(a[key], b[key]) : b[key];
  }
  return out;
}

// Read the colors from style.css so charts follow light/dark mode.
function theme() {
  return {
    surface: cssVar("--surface"),
    text: cssVar("--text-primary"),
    text2: cssVar("--text-secondary"),
    muted: cssVar("--text-muted"),
    grid: cssVar("--grid"),
    axis: cssVar("--axis"),
    series: cssVar("--series-1"),
    seriesHover: cssVar("--series-1-hover"),
    seriesWash: cssVar("--series-1-wash"),
    below: cssVar("--mark-muted"),
  };
}

function tooltipStyle(t) {
  return {
    backgroundColor: t.surface, titleColor: t.text2, bodyColor: t.text,
    borderColor: t.axis, borderWidth: 1, padding: 10, cornerRadius: 6,
    displayColors: false,
    titleFont: { weight: "normal", size: 12 }, bodyFont: { weight: "600", size: 13 },
  };
}

// Options shared by every chart: no legend, hairline grid, quiet axes.
function baseOptions(t) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false }, tooltip: tooltipStyle(t) },
    scales: {
      x: { grid: { display: false }, border: { color: t.axis }, ticks: { color: t.text2, maxRotation: 0 } },
      y: { grid: { color: t.grid }, border: { display: false }, ticks: { color: t.text2 } },
    },
  };
}

// Fill a <table> from headers and rows. textContent keeps data from being read as HTML.
function fillTable(id, headers, rows, align) {
  const table = $(id);
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  headers.forEach((h, i) => {
    const th = document.createElement("th");
    th.textContent = h;
    th.className = align[i];
    head.appendChild(th);
  });
  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    row.forEach((cell, i) => {
      const td = tr.insertCell();
      td.textContent = cell;
      td.className = align[i];
    });
  }
}

// Writes "2015: 626" above the chosen bars. Skipped when bars are too narrow.
function valueLabels(indices, labelFor, t) {
  return {
    id: "valueLabels",
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      if (meta.data.length < 2 || meta.data[1].x - meta.data[0].x < 16) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.fillStyle = t.text2;
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      for (const i of indices) {
        ctx.fillText(labelFor(i), meta.data[i].x, meta.data[i].y - 4);
      }
      ctx.restore();
    },
  };
}

function yearlyChart(d, t) {
  const last = d.yearly.length - 1;                       // the partial current year
  const colors = d.yearly.map((_, i) => (i === last ? t.series + "66" : t.series));
  const hovers = d.yearly.map((_, i) => (i === last ? t.seriesHover + "99" : t.seriesHover));
  const busiest = d.yearly.map((r, i) => [r.n, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map((p) => p[1]);

  return new Chart($("chart-yearly"), {
    type: "bar",
    data: {
      labels: d.yearly.map((r) => r.year),
      datasets: [{
        data: d.yearly.map((r) => r.n),
        backgroundColor: colors,
        hoverBackgroundColor: hovers,
        borderRadius: 4,
        borderSkipped: "bottom",
        maxBarThickness: 24,
        categoryPercentage: 0.85,
        barPercentage: 0.8,
      }],
    },
    options: merge(baseOptions(t), {
      scales: {
        x: { ticks: { autoSkip: true, maxTicksLimit: 10 } },
        y: { beginAtZero: true, grace: "8%", ticks: { callback: compact } },
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: (items) => items[0].dataIndex === last
              ? `${items[0].label} (partial, to ${d.catalog.end.slice(0, 10)})`
              : items[0].label,
            label: (item) => `${fmt.format(item.parsed.y)} events`,
            afterLabel: (item) => `Largest: M${d.yearly[item.dataIndex].max_mag.toFixed(1)}`,
          },
        },
      },
    }),
    plugins: [valueLabels(busiest, (i) => `${d.yearly[i].year}: ${d.yearly[i].n}`, t)],
  });
}

function fillStats(d) {
  const start = d.catalog.start.slice(0, 10);
  const end = d.catalog.end.slice(0, 10);
  $("lede").textContent =
    `${fmt.format(d.catalog.n)} earthquakes of magnitude 4 and above between ${start} and ${end}, ` +
    "from the USGS catalog, stored in SQLite and analysed in Python.";

  $("tile-n").textContent = fmt.format(d.catalog.n);
  $("tile-n-note").textContent = `${start} to ${end}`;

  const maxMag = Math.max(...d.yearly.map((r) => r.max_mag));
  const years = d.yearly.filter((r) => r.max_mag === maxMag).map((r) => r.year);
  $("tile-max").textContent = `M${maxMag.toFixed(1)}`;
  $("tile-max-note").textContent = `In ${years.join(" and ")}`;

  const all = d.b_values.find((r) => r.region === "All");
  $("tile-b").textContent = `${all.b.toFixed(2)} ± ${all.se.toFixed(2)}`;
  $("tile-b-note").textContent =
    `Shallow events (≤ ${d.max_depth_km} km), M ≥ ${d.mc.toFixed(1)}, n = ${fmt.format(all.n)}`;

  $("generated").textContent = d.generated;
}

let charts = [];

function renderCharts(d) {
  charts.forEach((c) => c.destroy());
  const t = theme();
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = t.text2;
  charts = [yearlyChart(d, t)];
}

function fillTables(d) {
  fillTable("table-yearly", ["Year", "Events", "Largest M"],
    d.yearly.map((r) => [r.year, fmt.format(r.n), r.max_mag.toFixed(1)]), ["l", "r", "r"]);
  $("yearly-note").textContent =
    `${d.yearly[d.yearly.length - 1].year} is a partial year. Labels mark the three busiest years.`;
}

fetch("data/summary.json")
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((d) => {
    fillStats(d);
    fillTables(d);
    renderCharts(d);
    // redraw when the viewer switches between light and dark mode
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => renderCharts(d));
  })
  .catch((err) => {
    $("load-error").hidden = false;
    $("load-error").textContent =
      `Could not load data/summary.json (${err.message}). If you opened the file directly, run a local server instead.`;
  });
