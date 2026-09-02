/* ============================================================
   FPV Gaussian Splatting — measured data.
   Every figure on the page reads from here. Numbers come from the
   logs in the project repo (work/*.log, reports/) and from COLMAP's
   own model summary; nothing is retyped into the prose.
   ============================================================ */
window.SPLAT = (function () {

  /* ---------- capture and reconstruction ---------- */
  var capture = {
    drone: "DJI O4 Pro",
    source_w: 2688, source_h: 2016, fps: 50,
    frame_w: 1920, frame_h: 1440,
    sessions: 2, days_apart: 6, clips: 9,
    select: { thresh_deg: 8, kmin: 2, kmax: 15 }
  };

  var colmap = {
    images_in: 7471,
    registered: 7470,
    points3d: 3359339,
    track_len: 6.579991,
    reproj_px: 0.820932,
    wall_min: 1076,
    hilltop_frames: 3777,
    cemetery_frames: 3693,
    /* cross-session evidence gathered BEFORE committing the 18-hour run */
    cross: {
      verified_pairs: 279778,
      usable_links: 13482,
      inlier_median: 59, inlier_p90: 183, inlier_max: 3159,
      hilltop_frames_linked: 568,
      cemetery_frames_linked: 445,
      clip_pairs: [
        ["0055 · 0057", 2278], ["0052 · 0057", 2029], ["0050 · 0057", 1787],
        ["0052 · 0060", 1639], ["0055 · 0060", 1382], ["0050 · 0060", 1062],
        ["0055 · 0058", 795]
      ]
    }
  };

  /* ---------- the viewer near-plane defect ---------- */
  /* The viewer rejects a splat when pz < -margin*z, which reduces to a pure
     near-depth cut at  z < znear*k/(margin+k),  k = zfar/(zfar-znear). */
  var znear = {
    zfar: 200, margin: 1.2,
    cut: function (zn) { var k = this.zfar / (this.zfar - zn); return zn * k / (this.margin + k); },
    /* bottom third of frame; holes = pixels below 0.5 accumulated alpha */
    cohorts: [
      { scene: "cemetery 3M", cohort: "banded worst", n: 6, old: 74.3, fix: 0.2, worst_old: 90.7, worst_fix: 0.9 },
      { scene: "cemetery 3M", cohort: "banded control", n: 4, old: 19.6, fix: 1.3, worst_old: 42.8, worst_fix: 4.5 },
      { scene: "cemetery 1.5M", cohort: "lowest AGL", n: 8, old: 29.2, fix: 4.7, worst_old: 78.1, worst_fix: 26.0 },
      { scene: "cemetery 1.5M", cohort: "matched good", n: 5, old: 0.6, fix: 0.5, worst_old: 1.7, worst_fix: 1.7 },
      { scene: "merged 3M", cohort: "banded worst", n: 6, old: 20.1, fix: 0.4, worst_old: 68.8, worst_fix: 2.6 },
      { scene: "merged 3M", cohort: "banded control", n: 4, old: 15.6, fix: 0.1, worst_old: 39.0, worst_fix: 0.2 },
      { scene: "hilltop 3M", cohort: "banded worst", n: 6, old: 13.3, fix: 0.6, worst_old: 36.9, worst_fix: 3.5 },
      { scene: "hilltop 3M", cohort: "banded control", n: 4, old: 0.4, fix: 0.0, worst_old: 1.6, worst_fix: 0.2 },
      { scene: "hilltop 1.5M", cohort: "lowest AGL", n: 8, old: 4.9, fix: 1.1, worst_old: 19.2, worst_fix: 5.5 },
      { scene: "hilltop 1.5M", cohort: "matched good", n: 5, old: 4.4, fix: 0.4, worst_old: 15.6, worst_fix: 1.6 }
    ],
    poses_total: 56, poses_regressed: 0,
    /* the two clues that were misread */
    clues: [
      { k: "alpha vs splats per pixel", r: 0.94 },
      { k: "alpha vs splats within 0.3 of camera", r: -0.46 },
      { k: "alpha vs flight altitude", r: 0.35 }
    ],
    /* normalisation, not flying, set the severity */
    median_agl: { cemetery: 0.24, hilltop: 0.47 },
    target_radius: 3.0,
    /* the A/B pair rendered for the figure (camera 0053_001085, 800x600,
       CPU reference rasteriser, deployed 3M asset) */
    ab: { cam: "0053_001085", w: 800, h: 600,
          old: { opacity: 0.520, holes: 51.2 }, fix: { opacity: 0.897, holes: 4.4 } }
  };

  /* ---------- the ground slab: real, but not the cause ---------- */
  var slab = {
    mass_below_surface: [47, 49],          // %
    transition_pct_of_alt: [131, 156],     // % of median flight altitude
    ground_opacity_median: 0.26,
    ground_opacity_under_half: 83,         // %
    thin_axis_off_normal_deg: 47,
    splat_thickness_pct_alt: 1.0,
    slab_thickness_pct_alt: 125,
    ratio: 129,
    flatten_prior: { before: 33.5, after: 38.9 },
    flatten_posthoc: { before: 35.9, after: 61.3 }
  };

  /* ---------- depth-distortion loss (2DGS), implemented in Rust ---------- */
  var distortion = {
    files: ["bwd/kernels/rasterize_backwards.rs", "bwd/kernels/project_backwards.rs",
            "gaussian_splats.rs", "bwd/render_bwd.rs", "bwd/burn_glue.rs",
            "brush-train/src/config.rs", "brush-train/src/train.rs"],
    unnormalised: { weight: 0.05, radius_p99_before: 17.45, radius_p99_after: 7.78,
                    psnr_before: 22.14, psnr_after: 19.80 },
    normalised: { detail_before: 22.6, detail_after: 16.9 }
  };

  /* ---------- near-field blur: the controlled ablation ----------
     Five 20k-iteration runs on the cemetery scene, one shared LR schedule.
     `detail` is bottom-third high-frequency energy retained vs ground truth.
     `bands` are 8x8 blocks binned by LOCAL GT texture, near vs far. */
  var ablation = {
    gt_texture_ratio: 2.44,
    runs: [
      { id: "C0", label: "8M splats",                    detail: 18.2, splats: 8000000,  wall_min: 330, note: "control" },
      { id: "P1", label: "16M cap",                      detail: 18.6, splats: 14488502, wall_min: 212, note: "capacity does nothing" },
      { id: "P2", label: "16M + split-at-screen-size 0.03", detail: 20.3, splats: 16000000, wall_min: 333, note: "the lever", hi: true },
      { id: "P4", label: "native 2688 + split",          detail: 20.2, splats: 16000000, wall_min: 335, note: "tie on a common yardstick" },
      { id: "P5R", label: "22M + split",                 detail: 20.5, splats: 22000000, wall_min: 422, note: "+0.2, capacity exhausted" },
      { id: "P3", label: "+ LPIPS (256 px crop)",        detail: 14.7, splats: 16000000, wall_min: 557, note: "actively harmful", bad: true }
    ],
    /* [band_lo, band_hi, near %, far %] — the C0 control and the P2 winner */
    bands: {
      C0: [[0.0146, 0.0331, 20.8, 45.0], [0.0331, 0.0538, 18.5, 40.2],
           [0.0538, 0.0685, 17.5, 38.5], [0.0685, 0.0845, 15.9, 37.2],
           [0.0845, 0.2245, 14.7, 33.7]],
      P2: [[0.0146, 0.0331, 23.9, 46.8], [0.0331, 0.0538, 20.5, 41.1],
           [0.0538, 0.0685, 19.1, 39.2], [0.0685, 0.0845, 17.2, 38.0],
           [0.0845, 0.2245, 15.9, 34.7]],
      P3: [[0.0146, 0.0331, 17.9, 39.5], [0.0331, 0.0538, 14.6, 33.2],
           [0.0538, 0.0685, 13.3, 31.3], [0.0685, 0.0845, 11.8, 30.1],
           [0.0845, 0.2245, 10.7, 27.1]]
    },
    /* P4 scored three ways — the point of the resolution section */
    p4: { own_gt_2688: 16.1, downsampled_1920: 20.2, p2_native_1920: 20.3 },
    /* --split-at-screen-size never fired at its default */
    screen_size: { p99: 0.103, default_threshold: 0.5, above_default_pct: 0.01, chosen: 0.03 },
    saturation: { cap_8m_at_10k: 8000000, cap_16m_at_10k: 8670000 }
  };

  /* ---------- the final run, and the export cap that undid it ---------- */
  var final_run = {
    iters: 60000, wall_h: 28, splats: 16000000, cameras: 7470,
    detail: { old_bottom: 14.8, new_bottom: 16.6, old_top: 34.7, new_top: 35.6 },
    keep: { old: 37.5, new: 18.8 },
    assets: [
      { k: "8M / 30k → 3M", splats: 3000000, opacity: 0.976, holes: 0.1, worst: 0.4, shipped: true },
      { k: "60k / 16M → 3M", splats: 3000000, opacity: 0.878, holes: 5.6, worst: 18.1 },
      { k: "60k / 16M → 8M", splats: 8000000, opacity: 0.949, holes: 0.3, worst: 1.7 }
    ],
    /* per-pose, the eight lowest level-flight poses */
    poses: [
      { id: 392,  a: 0.0, b: 0.7,  c: 0.0 },
      { id: 1335, a: 0.0, b: 0.6,  c: 0.5 },
      { id: 2716, a: 0.4, b: 3.7,  c: 1.7 },
      { id: 3001, a: 0.0, b: 1.5,  c: 0.1 },
      { id: 5132, a: 0.0, b: 18.1, c: 0.2 },
      { id: 5884, a: 0.0, b: 11.1, c: 0.0 },
      { id: 6712, a: 0.0, b: 6.7,  c: 0.0 },
      { id: 7269, a: 0.0, b: 2.7,  c: 0.0 }
    ]
  };

  /* ---------- everything that did not work ---------- */
  var negatives = [
    { k: "Flatness prior at refine time", v: "holes 33.5% → 38.9%", worse: true },
    { k: "Flattening splats after export", v: "holes 35.9% → 61.3%", worse: true },
    { k: "Depth-distortion loss, w = 0.05", v: "radius p99 17.45 → 7.78; PSNR 22.14 → 19.80 dB", worse: true },
    { k: "Depth-distortion loss, per-ray normalised", v: "detail 22.6% → 16.9%", worse: true },
    { k: "cov_blur screen-space dilation", v: "holes 30.1 / 30.1 / 30.0% at dilate 0 / 0.3 / 1.0", worse: false },
    { k: "Viewer splat cap at fixed training", v: "detail flat at 1.5M / 3M / 6M", worse: false },
    { k: "Raising max_splats 8M → 16M", v: "+0.4 detail, near/far ratio unmoved", worse: false },
    { k: "Native 2688 training resolution", v: "dead tie with 1920 on a common yardstick", worse: false },
    { k: "LPIPS perceptual loss", v: "14.7% vs 18.2% control", worse: true },
    { k: "Post-hoc opacity boost", v: "worked, but was a workaround for the viewer bug", worse: false }
  ];

  /* ---------- ghost replay ---------- */
  var ghost = {
    residual_position: 3.03e-14,
    residual_rotation: 9.05e-15,
    cameras_used: 7470,
    resample_hz: 30,
    capture_fps: 50,
    tilt_deg: { min: 9.9, max: 28.7, typical: 17 },
    /* undistorting the picture-in-picture into the render's own pinhole camera */
    undistort_px: [
      { region: "whole frame", raw: 15.9, fixed: 0.29 },
      { region: "inner third", raw: 1.5, fixed: 0.23 },
      { region: "middle third", raw: 18.3, fixed: 0.25 },
      { region: "outer third", raw: 72.3, fixed: 0.89 }
    ],
    live_check: { median_px: 0.57, p90_px: 1.7, at: "960×720", probes: 40 }
  };

  /* ---------- constraints ---------- */
  var limits = {
    buffer_bytes: 4294967296,
    bytes_per_splat: 181,
    splat_ceiling: 23700000,
    system_ram_gb: 48,
    lpips_full_s_per_iter: 29,
    step_s_per_iter: 0.5,
    fps: 67
  };

  return { capture: capture, colmap: colmap, znear: znear, slab: slab,
           distortion: distortion, ablation: ablation, final_run: final_run,
           negatives: negatives, ghost: ghost, limits: limits };
})();
