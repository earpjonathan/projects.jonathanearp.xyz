/* ============================================================
   Desmos Guy — measured data, inlined.
   Generated from portfolio/*.json in the pipeline repo:
     summary.json · findings.json · render_performance.json ·
     instagram_posts.json
   Window: 2026-08-17 to 2026-08-23. Every number on the page comes from here.
   Instagram rows are reduced to {episode, watch_hours, plays} —
   no media IDs, no handles, no personal data.
   ============================================================ */
window.DG = {
  summary: {
    "generated": "2026-08-23",
    "window": {
      "first": "2026-08-17",
      "last": "2026-08-23"
    },
    "posts": 81,
    "total_watch_hours": 12597,
    "total_watch_days": 524.9,
    "total_plays": 2395195,
    "total_reach": 2438643,
    "total_likes": 279919,
    "total_shares": 95729,
    "total_saves": 18103,
    "mean_watch_per_play_s": 18.9,
    "median_plays": 2413,
    "mean_plays": 29570,
    "median_watch_hours": 6.82,
    "top1_share_pct": 40.2,
    "top3_share_pct": 81.6,
    "top10_share_pct": 95.7,
    "hit_rate_pct": 4.9,
    "youtube_uploads": 140
  },
  findings: {
    "render_profile": {
      "trace_s": 6.9,
      "capture_s": 160.8,
      "encode_s": 3.9,
      "capture_share_pct": 94,
      "note": "13.8s clip, 331 frames. Parallelising the tracer optimises 4% of the work."
    },
    "capture_correctness": {
      "converged_at": "stable>=4",
      "old_default": "stable=2",
      "frames_wrong_at_old_default": "39 of 40",
      "serial_idle_determinism": "0 of 40 differ",
      "serial_under_load": "4 of 40 differ",
      "four_parallel_browsers_old_settle": "22 of 40 differ"
    },
    "speedup": {
      "before_s": 171.6,
      "after_s": 110.4,
      "factor": 1.55,
      "per_frame_before_ms": 486,
      "per_frame_after_ms": 318
    },
    "harvest": {
      "pool_before": 81,
      "pool_after": 120,
      "increase_pct": 48,
      "shorts_recovered": 46,
      "best_channel_in_band": "16 of 40"
    },
    "predictability": {
      "predicted_retention_vs_plays_r": 0.02,
      "actual_retention_vs_plays_r": 0.4,
      "duration_vs_plays_r": -0.15,
      "duration_vs_retention_r": -0.74,
      "plays_cv_r2": -0.89,
      "retention_cv_r2": 0.49
    },
    "settling": {
      "under_24h_median_growth_pct": 35.3,
      "h24_48_pct": 12.7,
      "h48_72_pct": 0.9,
      "h72_96_pct": 0.6,
      "over_96h_pct": 0.5,
      "note": "Validates the 48h maturity cutoff used in analyze.py."
    },
    "linking": {
      "dialogue_matched": "56 of 68",
      "median_overlap": 0.95,
      "median_margin": 0.94,
      "duration_best_case": "26 of 68"
    },
    "copyright": {
      "blocked": 2,
      "of": 140,
      "both_over_s": 89,
      "nothing_under_s": 80,
      "cap_set_at_s": 45
    }
  },
  render: [{"clip":"auto_s17e02","clip_s":16.6,"render_s":193,"ratio":11.6,"run":1},{"clip":"auto_s04e04","clip_s":9.3,"render_s":94,"ratio":10.1,"run":1},{"clip":"auto_s23e07","clip_s":30.1,"render_s":360,"ratio":11.9,"run":1},{"clip":"auto_s03e13","clip_s":39.1,"render_s":483,"ratio":12.4,"run":1},{"clip":"auto_s10e07","clip_s":44.7,"render_s":597,"ratio":13.4,"run":1},{"clip":"auto_s19e10","clip_s":40.5,"render_s":566,"ratio":14.0,"run":1},{"clip":"auto_s07e05","clip_s":36.6,"render_s":267,"ratio":7.3,"run":1},{"clip":"auto_s15e20","clip_s":32.0,"render_s":381,"ratio":11.9,"run":1},{"clip":"auto_s04e05","clip_s":27.2,"render_s":422,"ratio":15.5,"run":1},{"clip":"auto_s04e25","clip_s":13.8,"render_s":163,"ratio":11.8,"run":1},{"clip":"auto_s04e15","clip_s":42.4,"render_s":387,"ratio":9.1,"run":2},{"clip":"auto_s11e11","clip_s":25.5,"render_s":242,"ratio":9.5,"run":2},{"clip":"auto_s09e12","clip_s":37.8,"render_s":325,"ratio":8.6,"run":2},{"clip":"auto_s11e10","clip_s":30.3,"render_s":269,"ratio":8.9,"run":2},{"clip":"auto_s21e15","clip_s":42.0,"render_s":496,"ratio":11.8,"run":2},{"clip":"auto_s07e04","clip_s":28.5,"render_s":399,"ratio":14.0,"run":2},{"clip":"auto_s07e05_2","clip_s":31.3,"render_s":344,"ratio":11.0,"run":2},{"clip":"auto_s05e02","clip_s":23.1,"render_s":305,"ratio":13.2,"run":2},{"clip":"auto_s20e13","clip_s":43.3,"render_s":483,"ratio":11.2,"run":2},{"clip":"auto_s10e20","clip_s":27.4,"render_s":355,"ratio":12.9,"run":2}],
  posts: [
    {"episode":"S11E22","watch_hours":5068.81,"plays":931291},
    {"episode":"S19E16","watch_hours":3346.06,"plays":555619},
    {"episode":"S05E10","watch_hours":1861.47,"plays":299486},
    {"episode":"S03E01","watch_hours":1100.31,"plays":218665},
    {"episode":"S15E05","watch_hours":490.9,"plays":166628},
    {"episode":"S22E12","watch_hours":49.77,"plays":15234},
    {"episode":"S05E15","watch_hours":22.36,"plays":8860},
    {"episode":"S10E01","watch_hours":37.55,"plays":8637},
    {"episode":"S11E17","watch_hours":29.25,"plays":8119},
    {"episode":"S16E02","watch_hours":22.89,"plays":8115},
    {"episode":"S04E21","watch_hours":39.74,"plays":8049},
    {"episode":"S14E06","watch_hours":26.71,"plays":7948},
    {"episode":"S05E11","watch_hours":31.68,"plays":6563},
    {"episode":"S15E06","watch_hours":15.95,"plays":6298},
    {"episode":"S17E12","watch_hours":16.87,"plays":5882},
    {"episode":"S15E10","watch_hours":22.1,"plays":5771},
    {"episode":"S20E04","watch_hours":14.95,"plays":4676},
    {"episode":"S12E05","watch_hours":21.41,"plays":4417},
    {"episode":"S08E16","watch_hours":14.74,"plays":4147},
    {"episode":"S17E11","watch_hours":19.16,"plays":3921},
    {"episode":"S08E17","watch_hours":8.4,"plays":3837},
    {"episode":"S10E07","watch_hours":10.63,"plays":3687},
    {"episode":null,"watch_hours":8.07,"plays":3419},
    {"episode":"S12E16","watch_hours":10.04,"plays":3316},
    {"episode":"S11E04","watch_hours":9.51,"plays":3310},
    {"episode":"S11E12","watch_hours":8.02,"plays":3247},
    {"episode":"S09E11","watch_hours":13.22,"plays":3183},
    {"episode":"S05E09","watch_hours":9.25,"plays":3127},
    {"episode":"S19E15","watch_hours":14.94,"plays":3114},
    {"episode":"S11E14","watch_hours":7.0,"plays":2948},
    {"episode":"S11E05","watch_hours":9.56,"plays":2937},
    {"episode":"S14E09","watch_hours":6.76,"plays":2910},
    {"episode":"S11E10","watch_hours":7.77,"plays":2860},
    {"episode":"S03E03","watch_hours":8.35,"plays":2736},
    {"episode":"S11E18","watch_hours":6.82,"plays":2664},
    {"episode":"S11E20","watch_hours":5.86,"plays":2653},
    {"episode":"S11E21","watch_hours":6.37,"plays":2623},
    {"episode":"S11E10","watch_hours":12.27,"plays":2562},
    {"episode":"S11E06","watch_hours":7.44,"plays":2518},
    {"episode":"S11E10","watch_hours":5.16,"plays":2425},
    {"episode":"S10E07","watch_hours":5.55,"plays":2413},
    {"episode":"S16E07","watch_hours":8.77,"plays":2393},
    {"episode":"S10E04","watch_hours":4.17,"plays":2388},
    {"episode":"S10E22","watch_hours":4.79,"plays":2320},
    {"episode":"S11E10","watch_hours":7.09,"plays":2319},
    {"episode":"S11E01","watch_hours":7.8,"plays":2258},
    {"episode":"S19E16","watch_hours":6.82,"plays":2250},
    {"episode":"S15E04","watch_hours":6.81,"plays":2126},
    {"episode":"S05E05","watch_hours":8.43,"plays":2123},
    {"episode":"S18E02","watch_hours":6.62,"plays":2036},
    {"episode":"S12E11","watch_hours":5.5,"plays":1968},
    {"episode":null,"watch_hours":4.29,"plays":1924},
    {"episode":"S11E10","watch_hours":4.91,"plays":1891},
    {"episode":"S05E03","watch_hours":6.7,"plays":1868},
    {"episode":"S16E03","watch_hours":5.38,"plays":1795},
    {"episode":"S10E18","watch_hours":4.67,"plays":1767},
    {"episode":"S06E12","watch_hours":4.34,"plays":1676},
    {"episode":"S08E01","watch_hours":3.63,"plays":1635},
    {"episode":"S09E07","watch_hours":4.33,"plays":1624},
    {"episode":"S05E03","watch_hours":2.36,"plays":1534},
    {"episode":"S18E24","watch_hours":4.46,"plays":1528},
    {"episode":"S12E03","watch_hours":3.13,"plays":1508},
    {"episode":"S04E25","watch_hours":4.83,"plays":1415},
    {"episode":"S07E02","watch_hours":4.56,"plays":1296},
    {"episode":"S02E07","watch_hours":3.59,"plays":1073},
    {"episode":"S04E14","watch_hours":2.83,"plays":1003},
    {"episode":"S07E15","watch_hours":3.03,"plays":917},
    {"episode":"S05E12","watch_hours":5.9,"plays":863},
    {"episode":"S09E07","watch_hours":4.47,"plays":843},
    {"episode":"S17E10","watch_hours":2.3,"plays":811},
    {"episode":"S11E10","watch_hours":1.78,"plays":627},
    {"episode":"S17E02","watch_hours":2.19,"plays":625},
    {"episode":"S06E12","watch_hours":3.07,"plays":597},
    {"episode":"S03E13","watch_hours":2.79,"plays":588},
    {"episode":"S05E10","watch_hours":2.05,"plays":542},
    {"episode":"S10E14","watch_hours":1.61,"plays":535},
    {"episode":"S02E13","watch_hours":0.89,"plays":520},
    {"episode":"S13E07","watch_hours":0.96,"plays":479},
    {"episode":"S11E01","watch_hours":0.7,"plays":372},
    {"episode":"S08E04","watch_hours":0.61,"plays":222},
    {"episode":"S17E02","watch_hours":0.19,"plays":121},
  ]
};
