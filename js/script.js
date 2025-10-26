// script.js — MOSFET Cross-Section Interactive Model (continuous channel-length control)

const svgObject    = document.getElementById("mosfetSVG");
const vgs_slider   = document.getElementById("vgsSlider");
const vds_slider   = document.getElementById("vdsSlider");
const vgs_value    = document.getElementById("vgsValue");
const vds_value    = document.getElementById("vdsValue");
const vth_value    = document.getElementById("vthValue");
const vov_value    = document.getElementById("vovValue");
const len_switch   = document.getElementById("lenSwitch");
const len_value    = document.getElementById("lenValue");
const width_switch = document.getElementById("widthSwitch");
const width_value  = document.getElementById("widthValue");
const woverlValue  = document.getElementById("woverlValue");
const mode_value = document.getElementById("modeValue");


let ch_path, dep_drain_path, dep_channel_path, drain_shape;
let oxide_shape, poly_shape;
let ch_box, dep_drain_box, dep_channel_box, drain_box, oxide_box, poly_box;

const VGS_MAX = 3.0, VDS_MAX = 3.0, VTH = 0.5;
const ch_max_height = 200;
const ch_pinchoff_shift_max = 0.5;

function getShape(svg, id) {
  const el = svg.getElementById(id);
  return el?.querySelector("path") || el;
}

// --- Ensure scatter points are always drawn on top of lines ---
const BringPointsToFront = {
  id: "bringPointsToFront",
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    chart.data.datasets.forEach((dataset, i) => {
      if (dataset.showLine === false) {
        const meta = chart.getDatasetMeta(i);
        meta.data.forEach(point => point.draw(ctx));
      }
    });
  }
};

svgObject.addEventListener("load", () => {
  const svg = svgObject.contentDocument;
  
  ch_path          = getShape(svg, "MOSFET_Channel");
  dep_drain_path   = getShape(svg, "MOSFET_Drain_Depletion_Region");
  dep_channel_path = getShape(svg, "MOSFET_Channel_Depletion_Region");
  drain_shape      = getShape(svg, "MOSFET_Drain");
  oxide_shape      = getShape(svg, "MOSFET_Channel_Oxide");
  poly_shape       = getShape(svg, "MOSFET_Channel_Poly");
  
  if (ch_path)          ch_box = ch_path.getBBox();
  if (dep_drain_path)   dep_drain_box = dep_drain_path.getBBox();
  if (dep_channel_path) dep_channel_box = dep_channel_path.getBBox();
  if (drain_shape)      drain_box = drain_shape.getBBox();
  if (oxide_shape)      oxide_box = oxide_shape.getBBox();
  if (poly_shape)       poly_box  = poly_shape.getBBox();
  
  // --- Bind slider events ---
  [vgs_slider, vds_slider].forEach(el =>
    el.addEventListener("input", e => {
      update_geometry();     // update MOSFET cross-section
      updateCharts(e);       // update plots
    })
  );
  
  len_switch.addEventListener("change", () => {
    update_geometry();
  
    // Checkbox ON = Short (Length = 0), OFF = Long (Length = 1)
    const Length = len_switch.checked ? 0 : 1;
    const Width  = width_switch.checked ? 1 : 0;
  
    updatePlotParameters(Length, Width);
    refreshAllPlots();
    updateCharts();
  });
  
  width_switch.addEventListener("change", () => {
    update_geometry();
  
    const Length = len_switch.checked ? 0 : 1;
    const Width  = width_switch.checked ? 1 : 0;
  
    updatePlotParameters(Length, Width);
    refreshAllPlots();
    updateCharts();
  
    width_value.innerHTML = Width ? "Wide (2×W<sub>min</sub>)" : "Narrow (W<sub>min</sub>)";
  });
  
  // --- Initialize plots ---
  Chart.register(BringPointsToFront);

  const Length = len_switch.checked ? 0 : 1;   // 0 = Short, 1 = Long
  const Width  = width_switch.checked ? 1 : 0; // 0 = 1×, 1 = 2×

  updatePlotParameters(Length, Width);   // <-- compute K, λ first
  initCharts();                          // <-- now safe to build charts
  refreshAllPlots();                     // fill curves
  update_geometry();                     // draw SVG
  updateCharts();                        // place markers
  
});

function getVgs () {
	let vgs = parseFloat(vgs_slider.value);
	return vgs;
}

function getVds () {
	let vds = parseFloat(vds_slider.value);
	return vds;
}

function getChannelLength() {
  // Returns 0.9 for Long, 0.2 for Short
  let len = len_switch.checked ? 0.2 : 0.9;
  return len;
}

function update_geometry() {
  // Get model parameters
  const Vgs = getVgs();
  const Vds = getVds();
  const len = getChannelLength();
  
  const shorten = (1 - len) * 0.6;
  const Vov = Math.max(0, Vgs - VTH);

  // Readouts
  vgs_value.textContent = `${Vgs.toFixed(1)} V`;
  vds_value.textContent = `${Vds.toFixed(1)} V`;
  vth_value.textContent = `${VTH.toFixed(1)} V`;
  vov_value.textContent = `${Vov.toFixed(1)} V`;
  len_value.innerHTML = len > 0.6 ? "Long (2×L<sub>min</sub>)" : "Short (L<sub>min</sub>)";
  
  let modeText = "";
  if (Vgs <= VTH) {
    modeText = "Cutoff";
  } else if (Vds < (Vgs - VTH)) {
    modeText = "Linear";
  } else {
    modeText = "Saturation";
  }
  mode_value.textContent = modeText;
  
  const vds_frac = clamp01(Vds / VDS_MAX);
  const vds_sqrt = Math.sqrt(vds_frac);
  
  const vgs_frac = clamp01(Vgs / VGS_MAX);
  const vgs_sqrt = Math.sqrt(vgs_frac);
  
  const delta_x  = ch_box ? ch_box.width * shorten : 0;

  // Drain & its depletion move left
  if (drain_shape) drain_shape.setAttribute("transform", `translate(${-delta_x},0)`);

  // Channel depletion
  if (dep_channel_path && dep_channel_box) {
    const growDown = 150 * (2.2 * vgs_sqrt);
    const shorten_dx = dep_channel_box.width * shorten;
    const x = dep_channel_box.x;
    const y = dep_channel_box.y + growDown;
    const w = dep_channel_box.width - shorten_dx;
    const h = growDown;
    dep_channel_path.setAttribute("d", `M ${x},${y} h ${w} v -${h} h -${w} v ${h} Z`);
  }
  
  // Drain depletion
  if (dep_drain_path && dep_drain_box) {
    const growDown = 300 * vds_sqrt;
    const growSide = 300 * vds_sqrt;
    const x = dep_drain_box.x - growSide - delta_x;
    const y = dep_drain_box.y + dep_drain_box.height + growDown;
    const w = dep_drain_box.width + 2 * growSide;
    const h = dep_drain_box.height + growDown;
    dep_drain_path.setAttribute("d", `M ${x},${y} h ${w} v -${h} h -${w} v ${h} Z`);
  }

  // Oxide & poly
  apply_width_scale_keep_left(oxide_shape, oxide_box, shorten);
  apply_width_scale_keep_left(poly_shape,  poly_box,  shorten);

  // Channel body
  if (!(ch_path && ch_box)) return;
  const base_h = ch_max_height * clamp01((Vgs - VTH) / (VGS_MAX - VTH));
  if (base_h <= 0.1) { ch_path.setAttribute("d",""); return; }

  const left   = ch_box.x, top = ch_box.y;
  const width_long = ch_box.width, width_eff = width_long * (1 - shorten);
  const src_left_x = left, src_top_y = top, src_bot_y = top + base_h;
  const Vds_sat = Vov;
  let rise = 0, shift = 0;

  // Channel-length modulation factor (shorter → stronger)
  const clm_boost = 1 + (1 - len) * 1.8; // 1 → long, ~1.8 → short

  if (Vds <= Vds_sat) {
	// Ohmic region
    const frac = Vds_sat > 0 ? clamp01(Vds / Vds_sat) : 0;
    rise = base_h * frac;
  } else {
	// Saturation region
    rise = base_h;
    const overshoot = (Vds - Vds_sat) / Math.max(1e-6, (VDS_MAX - Vds_sat));
    shift = clamp01(overshoot * clm_boost) * ch_pinchoff_shift_max * width_long;
    const pullback = clamp01((Vgs - VTH) / (VGS_MAX - VTH));
    shift *= (1 - pullback);
  }
  
  let extra_px = 0;
  if (Vds <= Vds_sat) extra_px = 5;
  
  const drain_right_x = left + width_eff - shift + extra_px;
  const drain_bot_y   = src_top_y + base_h - rise;

  const d = `
    M ${src_left_x},${src_top_y}
    L ${left + width_eff + extra_px},${src_top_y}
    L ${drain_right_x},${drain_bot_y}
    L ${src_left_x},${src_bot_y}
    Z
  `;
  ch_path.setAttribute("d", d);
  
}

function apply_width_scale_keep_left(shape, box, shorten) {
  if (!(shape && box)) return;
  const scaleX = 1 - shorten, leftX = box.x;
  shape.setAttribute("transform",
    `translate(${leftX},0) scale(${scaleX},1) translate(${-leftX},0)`
  );
}

function clamp01(v){ return Math.max(0, Math.min(1, v)); }

///////////////////////////
const Plot_mu_n   = 50e-4;    // m²/Vs
const Plot_Cox    = 8e-3;     // F/m²
let Plot_Vth      = VTH;      // Threshold voltage

let chart_IdVgs, chart_IdVds;

let Plot_Idmax  = 0.6;      // [mA] max Y-axis for both plots
let W_L         = 10;       // Width/Length
let lambda      = 0.11;     // Channel-length modulation coefficient [1/V], ~0.01 for Long, ~0.1 for Short devices
let K           = 0.5 * Plot_mu_n * Plot_Cox * W_L;

function updatePlotParameters(Length, Width) {
  // Length: 0- Short (x1), 1- Long (x2)
  // Width:  0- x1, 1- x2
  
  let L = Length === 1 ? 2 : 1;
  let W = Width  === 1 ? 2 : 1;
  W_L    = 10*(W/L);      // Width/Length
  
  // Compute W/L ratio and show as fraction instead of decimal
  const ratio = W / L;
  let ratioText;
  
  if (ratio === 1) {
    ratioText = "1";
  } else if (ratio === 0.5) {
    ratioText = "½";
  } else if (ratio === 0.25) {
    ratioText = "¼";
  } else if (ratio < 1) {
    ratioText = `1/${(L / W).toFixed(0)}`;
  } else {
    ratioText = `${ratio.toFixed(0)}`;
  }
  
  woverlValue.textContent = ratioText;
  
  
  // Channel-length modulation coefficient, 
  // ~0.01 for Long, ~0.1 for Short devices
  lambda = Length === 1 ? 0.01 : 0.1;
  
  
  // Recalculate K
  K = 0.5 * Plot_mu_n * Plot_Cox * W_L;
   
  // === Update Y-axis limits on both plots ===
  Plot_Idmax = 0.6;
  /*
  Plot_Idmax = Plot_Idmax / (Length === 1 ? 2 : 1);
  if (chart_IdVgs && chart_IdVgs.options?.scales?.y) {
    chart_IdVgs.options.scales.y.max = Plot_Idmax;
    chart_IdVgs.update("none");
  }
  if (chart_IdVds && chart_IdVds.options?.scales?.y) {
    chart_IdVds.options.scales.y.max = Plot_Idmax;
    chart_IdVds.update("none");
  }
  */
}

function refreshAllPlots() {
  // --- Id–Vgs envelope (left) ---
  const new_IdsatArr = VGS.map(v => 0.5 * K * Math.max(v - Plot_Vth, 0) ** 2 * 1e3);
  chart_IdVgs.data.datasets[0].data.forEach((pt, i) => (pt.y = new_IdsatArr[i]));

  // --- Saturation boundary (right): Id_sat with Vds = Vgs - Vth => Id = 0.5*K*Vds^2 ---
  const new_SatBoundary = VDS.map(v => 0.5 * K * v * v * 1e3);
  chart_IdVds.data.datasets[0].data.forEach((pt, i) => (pt.y = new_SatBoundary[i]));

  // --- Id–Vds curve (right) for current Vgs ---
  const Vgs = getVgs();
  const VdsArr = chart_IdVds.data.datasets[0].data.map(p => p.x);
  const Ids_new = VdsArr.map(v => Id(Vgs, v) * 1e3);
  chart_IdVds.data.datasets[1].data.forEach((pt, i) => (pt.y = Ids_new[i]));

  // --- Keep markers glued to new curves ---
  const Vds = getVds();
  chart_IdVgs.data.datasets[1].data[0].y = 0.5 * K * Math.max(Vgs - Plot_Vth, 0) ** 2 * 1e3;
  chart_IdVds.data.datasets[2].data[0].y = Id(Vgs, Vds) * 1e3;

  chart_IdVgs.update("none");
  chart_IdVds.update("none");
}



// === MOSFET drain current equation ===
function Id(Vgs, Vds) {
  if (Vgs <= Plot_Vth) return 0; // Cutoff
  const Vdsat = Vgs - Plot_Vth;
  if (Vds <= Vdsat) {
    return K * ((Vgs - Plot_Vth) * Vds - 0.5 * Vds * Vds);
  } else {
    return 0.5 * K * (Vgs - Plot_Vth) ** 2 * (1 + lambda * (Vds - Vdsat));
  }
}


// === Precompute fixed sweep axes ===
const VGS = Array.from({ length: 301 }, (_, i) => i * 0.01 * 3);
const VDS = Array.from({ length: 301 }, (_, i) => i * 0.01 * 3);

// === Common chart style ===
const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 250, easing: "easeOutQuad" },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(50,50,50,0.8)",
      titleFont: { size: 13 },
      bodyFont: { size: 12 }
    }
  },
  elements: { line: { tension: 0.2 }, point: { radius: 0 } },
  scales: {
    x: {
      type: "linear",
      grid: { color: "rgba(0,0,0,0.08)" },
      ticks: {
        color: "#444", font: { size: 12 }, callback: v => v.toFixed(1),
        autoSkip: true, maxRotation: 0, minRotation: 0
      },
      min: 0, max: 3
    },
    y: {
      grid: { color: "rgba(0,0,0,0.08)" },
      ticks: { color: "#444", font: { size: 12 }, callback: v => v.toFixed(1) },
      beginAtZero: true,
      min: 0,
      max: Plot_Idmax
    }
  }
};

// === Initialize both charts once ===
function initCharts() {
  // ==============================
  // --- I_D vs V_GS (left plot) ---
  // ==============================
  const opts_IdVgs = JSON.parse(JSON.stringify(baseOptions));
  opts_IdVgs.scales.x.title = { display: true, text: "V_GS [V]", color: "#444" };
  opts_IdVgs.scales.y.title = { display: true, text: "I_D,SAT [mA]", color: "#444" };
  
  const Vgs0 = getVgs();
  const Vds0 = getVds();
  
  const IdsatArr = VGS.map(v => 0.5 * K * Math.max(v - Plot_Vth, 0) ** 2 * 1e3);
  const data_IdVgs = {
    datasets: [
      {
        label: "I_D,SAT vs V_GS",
        data: VGS.map((v, i) => ({ x: v, y: IdsatArr[i] })),
        borderColor: "#2c6db4",
        backgroundColor: "rgba(44,109,180,0.1)",
        borderWidth: 2,
        pointRadius: 0
      },
      {
        label: "Selected V_GS",
        data: [{x: Vgs0, y: 0.5 * K * Math.max(Vgs0 - Plot_Vth, 0) ** 2 * 1e3}],
        borderColor: "#0044f0",
        backgroundColor: "#0044ff",
        type: "line",
        showLine: false,
        pointRadius: 7,
        pointStyle: "circle",
        borderWidth: 2,
        borderColor: "#fff",
		order: 9999
      }
    ]
  };
  
  chart_IdVgs = new Chart(document.getElementById("chartVgs"), {
    type: "line",
    data: data_IdVgs,
    options: opts_IdVgs
  });

  // ==============================
  // --- I_D vs V_DS (right plot) ---
  // ==============================
  const opts_IdVds = JSON.parse(JSON.stringify(baseOptions));
  opts_IdVds.scales.x.title = { display: true, text: "V_DS [V]", color: "#444" };
  opts_IdVds.scales.y.title = { display: true, text: "I_D [mA]", color: "#444" };

  const Ids_sat_boundary = VDS.map(v => 0.5 * K * v * v * 1e3);
  const Ids_initial = VDS.map(v => Id(Vgs0, v) * 1e3);

  const data_IdVds = {
    datasets: [
      {
        label: "Saturation Boundary (V_DS = V_GS − V_TH)",
        data: VDS.map((v, i) => ({ x: v, y: Ids_sat_boundary[i] })),
        borderColor: "rgba(150,150,150,0.75)",
        borderDash: [6, 4],
        borderWidth: 1.5,
        pointRadius: 0
      },
      {
        label: "I_D vs V_DS",
        data: VDS.map((v, i) => ({ x: v, y: Ids_initial[i] })),
        borderColor: "#2c6db4",
        backgroundColor: "rgba(0,123,131,0.1)",
        borderWidth: 2,
        pointRadius: 0
      },
      {
        label: "Selected V_DS",
        data: [{ x: Vds0, y: Id(Vgs0, Vds0) * 1e3 }],
        borderColor: "#0044f0",
        backgroundColor: "#0044ff",
        type: "line",
        showLine: false,
        pointRadius: 7,
        pointStyle: "circle",
        borderWidth: 2,
        borderColor: "#fff",
        order: 9999
      }
    ]
  };

  chart_IdVds = new Chart(document.getElementById("chartVds"), {
    type: "line",
    data: data_IdVds,
    options: opts_IdVds
  });
}

// === Smooth update when slider moves ===
function updateCharts(evt) {
  const Vgs = getVgs();
  const Vds = getVds();

  // --- Update left plot (I_D vs V_GS) ---
  const step = 3 / 300; // same as curve resolution
  const Vgs_rounded = Math.round(Vgs / step) * step;
  const Id_value = 0.5 * K * Math.max(Vgs_rounded - Plot_Vth, 0) ** 2 * 1e3;

  chart_IdVgs.data.datasets[1].data[0].x = Vgs_rounded;
  chart_IdVgs.data.datasets[1].data[0].y = Id_value;
  chart_IdVgs.update("none");

  // --- If only Vds changed: move marker only ---
  if (evt?.target?.id === "vdsSlider") {
    const Id_marker = Id(Vgs, Vds) * 1e3;
    chart_IdVds.data.datasets[2].data[0].x = Vds;
    chart_IdVds.data.datasets[2].data[0].y = Id_marker;
    chart_IdVds.update("none");
    return;
  }

  // --- If Vgs changed: redraw full Id–Vds curve and marker ---
  const VdsArr = chart_IdVds.data.datasets[0].data.map(p => p.x);
  const Ids_new = VdsArr.map(v => Id(Vgs, v) * 1e3);
  chart_IdVds.data.datasets[1].data.forEach((pt, i) => (pt.y = Ids_new[i]));
  const Id_marker = Id(Vgs, Vds) * 1e3;
  chart_IdVds.data.datasets[2].data[0].x = Vds;
  chart_IdVds.data.datasets[2].data[0].y = Id_marker;
  chart_IdVds.update("none");
}

