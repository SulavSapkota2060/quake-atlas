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

const LOG_TICKS = [1, 10, 100, 1000];   // the only gridlines/labels on the log axis

// Vertical line between the last "below cutoff" bar and the first "used" bar.
function cutoffLine(d, t) {
  const first = d.histogram.findIndex((r) => r.mag >= d.mc - 1e-9);
  return {
    id: "cutoffLine",
    afterDatasetsDraw(chart) {
      if (first < 1) return;
      const meta = chart.getDatasetMeta(0);
      const x = (meta.data[first - 1].x + meta.data[first].x) / 2;
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = t.text2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.fillStyle = t.text2;
      ctx.font = "12px system-ui, sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText(`cutoff M${d.mc.toFixed(1)}`, x + 6, top + 4);
      ctx.restore();
    },
  };
}

function histogramChart(d, t) {
  const mags = d.histogram.map((r) => r.mag);
  const counts = d.histogram.map((r) => r.n);
  const used = (m) => m >= d.mc - 1e-9;
  const top = Math.ceil((Math.max(...counts) * 1.3) / 500) * 500;   // headroom above the tallest bar

  return new Chart($("chart-hist"), {
    type: "bar",
    data: {
      labels: mags.map((m) => m.toFixed(1)),
      datasets: [{
        data: counts,
        backgroundColor: mags.map((m) => (used(m) ? t.series : t.below)),
        hoverBackgroundColor: mags.map((m) => (used(m) ? t.seriesHover : t.axis)),
        borderRadius: 4,
        borderSkipped: "bottom",
        maxBarThickness: 24,
        categoryPercentage: 0.9,
        barPercentage: 0.85,
      }],
    },
    options: merge(baseOptions(t), {
      scales: {
        x: {
          title: { display: true, text: "Magnitude", color: t.text2 },
          ticks: { autoSkip: true, maxTicksLimit: 12 },
        },
        y: {
          type: "logarithmic",
          min: 0.5,
          max: top,
          title: { display: true, text: "Events (log scale)", color: t.text2 },
          grid: { color: (c) => (LOG_TICKS.includes(c.tick.value) ? t.grid : "transparent") },
          ticks: { callback: (v) => (LOG_TICKS.includes(v) ? compact(v) : "") },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: (items) => `M${items[0].label}`,
            label: (item) => `${fmt.format(item.parsed.y)} events`,
            afterLabel: (item) => (used(mags[item.dataIndex]) ? [] : "Below cutoff: undercounted"),
          },
        },
      },
    }),
    plugins: [cutoffLine(d, t)],
  });
}

// Vertical hairline that follows the hovered point, so readers aim at an x, not a 2px line.
function crosshair(t) {
  return {
    id: "crosshair",
    beforeDatasetsDraw(chart) {
      const active = chart.tooltip ? chart.tooltip.getActiveElements() : [];
      if (!active.length) return;
      const x = active[0].element.x;
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = t.axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.restore();
    },
  };
}

// Text above one chosen point of the first dataset.
function pointLabel(index, text, t) {
  return {
    id: "pointLabel",
    afterDatasetsDraw(chart) {
      const point = chart.getDatasetMeta(0).data[index];
      if (!point) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.fillStyle = t.text;
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(text, point.x, point.y - 12);
      ctx.restore();
    },
  };
}

function bCurveChart(d, t) {
  const c = d.b_vs_mc;
  const chosen = c.findIndex((r) => Math.abs(r.mc - d.mc) < 1e-9);
  const lo = Math.floor((Math.min(...c.map((r) => r.b - r.se)) - 0.05) * 10) / 10;
  const hi = Math.ceil((Math.max(...c.map((r) => r.b + r.se)) + 0.05) * 10) / 10;
  const band = { borderWidth: 0, pointRadius: 0, pointHitRadius: 0 };

  return new Chart($("chart-bcurve"), {
    type: "line",
    data: {
      labels: c.map((r) => r.mc.toFixed(1)),
      datasets: [
        {   // 0: the estimate
          data: c.map((r) => r.b),
          borderColor: t.series,
          backgroundColor: t.series,
          borderWidth: 2,
          tension: 0,
          pointRadius: c.map((_, i) => (i === chosen ? 6 : 4)),
          pointHoverRadius: 7,
          pointHitRadius: 24,
          pointBackgroundColor: t.series,
          pointBorderColor: t.surface,
          pointBorderWidth: 2,
          order: 0,
        },
        { ...band, data: c.map((r) => r.b + r.se), fill: "+1", backgroundColor: t.seriesWash, order: 1 },   // 1: upper edge
        { ...band, data: c.map((r) => r.b - r.se), fill: false, order: 2 },                                  // 2: lower edge
      ],
    },
    options: merge(baseOptions(t), {
      scales: {
        x: { title: { display: true, text: "Cutoff magnitude", color: t.text2 } },
        y: { min: lo, max: hi, title: { display: true, text: "b-value", color: t.text2 } },
      },
      plugins: {
        tooltip: {
          filter: (item) => item.datasetIndex === 0,
          callbacks: {
            title: (items) => `Cutoff M${items[0].label}`,
            label: (item) => `b = ${c[item.dataIndex].b.toFixed(3)} ± ${c[item.dataIndex].se.toFixed(3)}`,
            afterLabel: (item) => `${fmt.format(c[item.dataIndex].n)} events used`,
          },
        },
      },
    }),
    plugins: [crosshair(t), pointLabel(chosen, `Used: M${d.mc.toFixed(1)}`, t)],
  });
}

// Draws the error lines (and the shaded band for "All") under the dots.
function whiskers(rows, t) {
  return {
    id: "whiskers",
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea: { top, bottom }, scales: { x, y } } = chart;
      ctx.save();
      const all = rows.find((r) => r.region === "All");
      if (all) {
        const left = x.getPixelForValue(all.b - all.se);
        const right = x.getPixelForValue(all.b + all.se);
        ctx.fillStyle = t.seriesWash;
        ctx.fillRect(left, top, right - left, bottom - top);
      }
      ctx.strokeStyle = t.text2;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      rows.forEach((r, i) => {
        const py = y.getPixelForValue(i);
        ctx.beginPath();
        ctx.moveTo(x.getPixelForValue(r.b - r.se), py);
        ctx.lineTo(x.getPixelForValue(r.b + r.se), py);
        ctx.stroke();
      });
      ctx.restore();
    },
  };
}

// Dot plot: one row per region (y = row number, labelled with the region name), x = b.
function regionChart(d, t) {
  const rows = d.b_values.filter((r) => r.b !== null);
  const labels = rows.map((r) => `${r.region} (n=${fmt.format(r.n)})`);
  const lo = Math.floor((Math.min(...rows.map((r) => r.b - r.se)) - 0.05) * 10) / 10;
  const hi = Math.ceil((Math.max(...rows.map((r) => r.b + r.se)) + 0.05) * 10) / 10;

  return new Chart($("chart-regions"), {
    type: "scatter",
    data: {
      datasets: [{
        data: rows.map((r, i) => ({ x: r.b, y: i })),
        pointRadius: 6,
        pointHoverRadius: 8,
        pointHitRadius: 24,
        pointBackgroundColor: rows.map((r) => (r.region === "All" ? t.text2 : t.series)),
        pointBorderColor: t.surface,
        pointBorderWidth: 2,
      }],
    },
    options: merge(baseOptions(t), {
      interaction: { mode: "nearest", intersect: true },
      scales: {
        x: {
          type: "linear",
          min: lo,
          max: hi,
          grid: { display: true, color: t.grid },
          title: { display: true, text: "b-value", color: t.text2 },
          ticks: { stepSize: 0.1, callback: (v) => v.toFixed(1) },
        },
        y: {
          type: "linear",
          reverse: true,                                   // first row ("All") at the top
          min: -0.5,
          max: rows.length - 0.5,
          grid: { display: false },
          afterBuildTicks: (axis) => { axis.ticks = rows.map((_, i) => ({ value: i })); },
          ticks: { callback: (v) => labels[v] },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: (items) => rows[items[0].dataIndex].region,
            label: (item) => `b = ${rows[item.dataIndex].b.toFixed(3)} ± ${rows[item.dataIndex].se.toFixed(3)}`,
            afterLabel: (item) =>
              `${fmt.format(rows[item.dataIndex].n)} events (M ≥ ${d.mc.toFixed(1)}, depth ≤ ${d.max_depth_km} km)`,
          },
        },
      },
    }),
    plugins: [whiskers(rows, t)],
  });
}

// The pair of regions whose b-values differ most, in units of their combined standard error.
function biggestGap(d) {
  const rows = d.b_values.filter((r) => r.region !== "All" && r.b !== null);
  let best = null;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const z = Math.abs(rows[i].b - rows[j].b) / Math.hypot(rows[i].se, rows[j].se);
      if (!best || z > best.z) best = { a: rows[i].region, b: rows[j].region, z };
    }
  }
  return best;
}

let showAllAfter = false;

function renderAftershocks(d) {
  const rows = showAllAfter ? d.aftershocks : d.aftershocks.slice(0, 12);
  fillTable("table-after", ["Date", "M", "Place", "Aftershocks in 30 days"],
    rows.map((r) => [r.time.slice(0, 10), r.mag.toFixed(1), r.place, fmt.format(r.aftershocks_30d)]),
    ["l", "r", "l", "r"]);
  $("after-toggle").textContent = showAllAfter
    ? "Show only the biggest 12"
    : `Show all ${d.aftershocks.length} quakes of M6 and above`;
}

function fillStats(d) {
  const start = d.catalog.start.slice(0, 10);
  const end = d.catalog.end.slice(0, 10);
  $("lede").textContent =
    `Every magnitude 4+ earthquake in the Himalayan region from ${start} to ${end}: ${fmt.format(d.catalog.n)} of them, ` +
    "pulled from the USGS catalog. I cleaned the data in Python, stored it in SQLite and drew everything on this page.";

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
  charts = [yearlyChart(d, t), histogramChart(d, t), bCurveChart(d, t), regionChart(d, t)];
}

function fillTables(d) {
  fillTable("table-yearly", ["Year", "Events", "Largest M"],
    d.yearly.map((r) => [r.year, fmt.format(r.n), r.max_mag.toFixed(1)]), ["l", "r", "r"]);
  $("yearly-note").textContent =
    `${d.yearly[d.yearly.length - 1].year} isn't over yet, so its bar is short and faded. The labels mark the three busiest years.`;

  const usedForB = (m) => m >= d.mc - 1e-9;
  fillTable("table-hist", ["Magnitude", "Events", "Used for b"],
    d.histogram.map((r) => [r.mag.toFixed(1), fmt.format(r.n), usedForB(r.mag) ? "yes" : "no"]), ["l", "r", "r"]);

  const all = d.b_values.find((r) => r.region === "All");
  $("hist-note").textContent =
    `Small quakes are far more common than big ones. With b = ${all.b.toFixed(2)}, every one-point drop in magnitude means roughly ${Math.round(10 ** all.b)} times as many quakes. ` +
    "The gray bars sit below the cutoff, where the catalog misses small quakes, so they're too short and I leave them out of the b-value.";

  fillTable("table-bcurve", ["Cutoff M", "b", "± SE", "Events used"],
    d.b_vs_mc.map((r) => [r.mc.toFixed(1), r.b.toFixed(3), r.se.toFixed(3), fmt.format(r.n)]), ["l", "r", "r", "r"]);

  const first = d.b_vs_mc[0];
  const chosen = d.b_vs_mc.find((r) => Math.abs(r.mc - d.mc) < 1e-9);
  $("bcurve-note").textContent =
    `Set the cutoff too low and b comes out too small (${first.b.toFixed(2)} at M${first.mc.toFixed(1)}), because the catalog is missing small quakes down there. ` +
    `It flattens out for a few steps above M${d.mc.toFixed(1)}, so that's where I put it: b = ${chosen.b.toFixed(2)}. ` +
    "Higher up there aren't enough quakes left, and the estimate gets jumpy.";

  fillTable("table-regions", ["Region", "Events used", "b", "± SE"],
    d.b_values.map((r) => [r.region, fmt.format(r.n),
      r.b === null ? "n/a" : r.b.toFixed(3), r.se === null ? "n/a" : r.se.toFixed(3)]),
    ["l", "r", "r", "r"]);
  const gap = biggestGap(d);
  $("regions-note").textContent =
    `The biggest difference is ${gap.a} vs ${gap.b}, at ${gap.z.toFixed(1)} standard errors. ` +
    (gap.z < 2 ? "That's within the noise, so I can't say the regions really differ. " : "That's big enough to be worth a closer look. ") +
    "Even that is optimistic, because the margins of error treat every quake as independent and aftershocks aren't.";

  $("after-sub").textContent =
    `The ${d.aftershocks.length} biggest quakes (M6 and up), with how many M4.5+ aftershocks followed within 30 days and about 110 km. ` +
    "Quakes from the last 30 days are left out because their window isn't finished.";
  renderAftershocks(d);
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
    $("after-toggle").addEventListener("click", () => {
      showAllAfter = !showAllAfter;
      renderAftershocks(d);
    });
    // redraw when the viewer switches between light and dark mode
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => renderCharts(d));
  })
  .catch((err) => {
    $("load-error").hidden = false;
    $("load-error").textContent =
      `Couldn't load data/summary.json (${err.message}). If you opened the file straight from your folder, start a local server instead: python3 -m http.server --directory docs`;
  });
