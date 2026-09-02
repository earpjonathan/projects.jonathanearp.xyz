/* ============================================================
   A working 3D Gaussian Splatting renderer, embedded.

   This is the same rendering path the project's own viewer uses,
   cut down to what fits on a page: the antimatter15 .splat format
   (32 bytes per splat), a 16-bit counting sort by depth in a
   worker, and one instanced quad per splat blended front-to-back
   with ONE_MINUS_DST_ALPHA / ONE — "under" compositing, no depth
   buffer, which is exactly why the near plane could throw the
   ground away without anything else noticing.

   The scene is a 208,000-splat crop of the deployed three-million
   splat reconstruction, taken around one low-altitude capture pose
   so the file is small enough to send. Poses, intrinsics and the
   flight segment are the real ones, straight out of COLMAP.
   ============================================================ */
(function (global) {
  "use strict";

  /* ---------------------------------------------------------- shaders */
  var VERT = `#version 300 es
precision highp float;
precision highp int;

uniform highp usampler2D u_texture;
uniform mat4 projection, view;
uniform vec2 focal;
uniform vec2 viewport;

in vec2 position;
in int index;

out vec4 vColor;
out vec2 vPosition;

void main () {
    uvec4 cen = texelFetch(u_texture, ivec2((uint(index) & 0x3ffu) << 1, uint(index) >> 10), 0);
    vec4 cam = view * vec4(uintBitsToFloat(cen.xyz), 1);
    vec4 pos2d = projection * cam;

    float clip = 1.2 * pos2d.w;
    if (pos2d.z < -clip || pos2d.x < -clip || pos2d.x > clip || pos2d.y < -clip || pos2d.y > clip) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }

    uvec4 cov = texelFetch(u_texture, ivec2(((uint(index) & 0x3ffu) << 1) | 1u, uint(index) >> 10), 0);
    vec2 u1 = unpackHalf2x16(cov.x), u2 = unpackHalf2x16(cov.y), u3 = unpackHalf2x16(cov.z);
    mat3 Vrk = mat3(u1.x, u1.y, u2.x, u1.y, u2.y, u3.x, u2.x, u3.x, u3.y);

    mat3 J = mat3(
        focal.x / cam.z, 0., -(focal.x * cam.x) / (cam.z * cam.z),
        0., -focal.y / cam.z, (focal.y * cam.y) / (cam.z * cam.z),
        0., 0., 0.
    );

    mat3 T = transpose(mat3(view)) * J;
    mat3 cov2d = transpose(T) * Vrk * T;

    float mid = (cov2d[0][0] + cov2d[1][1]) / 2.0;
    float radius = length(vec2((cov2d[0][0] - cov2d[1][1]) / 2.0, cov2d[0][1]));
    float lambda1 = mid + radius, lambda2 = mid - radius;

    if (lambda2 < 0.0) return;
    vec2 diagonalVector = normalize(vec2(cov2d[0][1], lambda1 - cov2d[0][0]));
    vec2 majorAxis = min(sqrt(2.0 * lambda1), 1024.0) * diagonalVector;
    vec2 minorAxis = min(sqrt(2.0 * lambda2), 1024.0) * vec2(diagonalVector.y, -diagonalVector.x);

    vColor = clamp(pos2d.z / pos2d.w + 1.0, 0.0, 1.0) *
             vec4((cov.w) & 0xffu, (cov.w >> 8) & 0xffu, (cov.w >> 16) & 0xffu, (cov.w >> 24) & 0xffu) / 255.0;
    vPosition = position;

    vec2 vCenter = vec2(pos2d) / pos2d.w;
    gl_Position = vec4(
        vCenter + position.x * majorAxis / viewport + position.y * minorAxis / viewport,
        0.0, 1.0);
}`;

  var FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
in vec2 vPosition;
out vec4 fragColor;
void main () {
    float A = -dot(vPosition, vPosition);
    if (A < -4.0) discard;
    float B = exp(A) * vColor.a;
    fragColor = vec4(B * vColor.rgb, B);
}`;

  /* Streamed so the progress bar means something: a 6.6 MB asset on a slow
     connection is a long silence otherwise. */
  function fetchSplat(url, onProgress) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url.split("/").pop() + " " + r.status);
      var total = +r.headers.get("content-length") || 0;
      if (!r.body || !total) return r.arrayBuffer();
      var reader = r.body.getReader(), chunks = [], got = 0;
      return (function pump() {
        return reader.read().then(function (res) {
          if (res.done) {
            var out = new Uint8Array(got), off = 0;
            chunks.forEach(function (c) { out.set(c, off); off += c.length; });
            return out.buffer;
          }
          chunks.push(res.value); got += res.value.length;
          if (onProgress) onProgress(got / total);
          return pump();
        });
      })();
    });
  }

  /* ---------------------------------------------------- the sort worker */
  function workerBody(self) {
    var buffer = null, vertexCount = 0, lastProj = null, sent = false;

    var _f = new Float32Array(1), _i = new Int32Array(_f.buffer);
    function halfOf(v) {
      _f[0] = v;
      var f = _i[0], sign = (f >> 31) & 1, exp = (f >> 23) & 0xff, frac = f & 0x7fffff, ne;
      if (exp === 0) ne = 0;
      else if (exp < 113) {
        ne = 0; frac |= 0x800000; frac = frac >> (113 - exp);
        if (frac & 0x1000000) { ne = 1; frac = 0; }
      } else if (exp < 142) ne = exp - 112;
      else { ne = 31; frac = 0; }
      return (sign << 15) | (ne << 10) | (frac >> 13);
    }
    function pack2(x, y) { return (halfOf(x) | (halfOf(y) << 16)) >>> 0; }

    /* Pack positions, 4*sigma as half floats and the colour into an
       RGBA32UI texture — two texels per splat, exactly as the reference
       viewer does. */
    function buildTexture() {
      var fb = new Float32Array(buffer), ub = new Uint8Array(buffer);
      var tw = 2048, th = Math.ceil((2 * vertexCount) / tw);
      var td = new Uint32Array(tw * th * 4);
      var tc = new Uint8Array(td.buffer), tf = new Float32Array(td.buffer);
      for (var i = 0; i < vertexCount; i++) {
        tf[8 * i] = fb[8 * i]; tf[8 * i + 1] = fb[8 * i + 1]; tf[8 * i + 2] = fb[8 * i + 2];
        tc[4 * (8 * i + 7)] = ub[32 * i + 24];
        tc[4 * (8 * i + 7) + 1] = ub[32 * i + 25];
        tc[4 * (8 * i + 7) + 2] = ub[32 * i + 26];
        tc[4 * (8 * i + 7) + 3] = ub[32 * i + 27];
        var s0 = fb[8 * i + 3], s1 = fb[8 * i + 4], s2 = fb[8 * i + 5];
        var r0 = (ub[32 * i + 28] - 128) / 128, r1 = (ub[32 * i + 29] - 128) / 128,
            r2 = (ub[32 * i + 30] - 128) / 128, r3 = (ub[32 * i + 31] - 128) / 128;
        var M = [
          1 - 2 * (r2 * r2 + r3 * r3), 2 * (r1 * r2 + r0 * r3), 2 * (r1 * r3 - r0 * r2),
          2 * (r1 * r2 - r0 * r3), 1 - 2 * (r1 * r1 + r3 * r3), 2 * (r2 * r3 + r0 * r1),
          2 * (r1 * r3 + r0 * r2), 2 * (r2 * r3 - r0 * r1), 1 - 2 * (r1 * r1 + r2 * r2)
        ];
        M[0] *= s0; M[1] *= s0; M[2] *= s0;
        M[3] *= s1; M[4] *= s1; M[5] *= s1;
        M[6] *= s2; M[7] *= s2; M[8] *= s2;
        var g0 = M[0] * M[0] + M[3] * M[3] + M[6] * M[6];
        var g1 = M[0] * M[1] + M[3] * M[4] + M[6] * M[7];
        var g2 = M[0] * M[2] + M[3] * M[5] + M[6] * M[8];
        var g3 = M[1] * M[1] + M[4] * M[4] + M[7] * M[7];
        var g4 = M[1] * M[2] + M[4] * M[5] + M[7] * M[8];
        var g5 = M[2] * M[2] + M[5] * M[5] + M[8] * M[8];
        td[8 * i + 4] = pack2(4 * g0, 4 * g1);
        td[8 * i + 5] = pack2(4 * g2, 4 * g3);
        td[8 * i + 6] = pack2(4 * g4, 4 * g5);
      }
      self.postMessage({ texdata: td, texwidth: tw, texheight: th }, [td.buffer]);
    }

    function sort(viewProj) {
      if (!buffer) return;
      if (!sent) { buildTexture(); sent = true; }
      if (lastProj) {
        var dot = lastProj[2] * viewProj[2] + lastProj[6] * viewProj[6] + lastProj[10] * viewProj[10];
        if (Math.abs(dot - 1) < 0.01) return;
      }
      var fb = new Float32Array(buffer);
      var sizes = new Int32Array(vertexCount);
      var maxD = -Infinity, minD = Infinity;
      for (var i = 0; i < vertexCount; i++) {
        var d = ((viewProj[2] * fb[8 * i] + viewProj[6] * fb[8 * i + 1] +
                  viewProj[10] * fb[8 * i + 2]) * 4096) | 0;
        sizes[i] = d;
        if (d > maxD) maxD = d;
        if (d < minD) minD = d;
      }
      var inv = (65535) / Math.max(maxD - minD, 1);
      var counts = new Uint32Array(65536);
      for (i = 0; i < vertexCount; i++) { sizes[i] = ((sizes[i] - minD) * inv) | 0; counts[sizes[i]]++; }
      var starts = new Uint32Array(65536);
      for (i = 1; i < 65536; i++) starts[i] = starts[i - 1] + counts[i - 1];
      var order = new Uint32Array(vertexCount);
      for (i = 0; i < vertexCount; i++) order[starts[sizes[i]]++] = i;
      lastProj = viewProj;
      self.postMessage({ depthIndex: order, vertexCount: vertexCount }, [order.buffer]);
    }

    var running = false, pending = null;
    self.onmessage = function (e) {
      if (e.data.buffer) {
        buffer = e.data.buffer;
        vertexCount = Math.floor(buffer.byteLength / 32);
        sent = false;
        lastProj = null;              // force a re-sort against the new set
        self.postMessage({ ready: vertexCount });
      } else if (e.data.view) {
        pending = e.data.view;
        if (running) return;
        running = true;
        setTimeout(function () {
          var v = pending; pending = null; running = false;
          sort(v);
        }, 0);
      }
    };
  }

  /* -------------------------------------------------------------- maths */
  function mul4(a, b) {
    var o = new Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
                     a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  function viewFromRC(R, C) {
    /* R is camera-to-world, row-major 3x3 (as COLMAP/cameras.json give it) */
    return [
      R[0][0], R[0][1], R[0][2], 0,
      R[1][0], R[1][1], R[1][2], 0,
      R[2][0], R[2][1], R[2][2], 0,
      -(R[0][0] * C[0] + R[1][0] * C[1] + R[2][0] * C[2]),
      -(R[0][1] * C[0] + R[1][1] * C[1] + R[2][1] * C[2]),
      -(R[0][2] * C[0] + R[1][2] * C[1] + R[2][2] * C[2]),
      1
    ];
  }
  function quatToR(q) {
    var x = q[0], y = q[1], z = q[2], w = q[3];
    return [
      [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]
    ];
  }
  function slerp(a, b, t) {
    var d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], bb = b;
    if (d < 0) { bb = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
    var o;
    if (d > 0.9995) {
      o = [a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t,
           a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t];
    } else {
      var th0 = Math.acos(d), th = th0 * t, s0 = Math.sin(th0);
      var s1 = Math.sin(th0 - th) / s0, s2 = Math.sin(th) / s0;
      o = [a[0] * s1 + bb[0] * s2, a[1] * s1 + bb[1] * s2,
           a[2] * s1 + bb[2] * s2, a[3] * s1 + bb[3] * s2];
    }
    var l = Math.hypot(o[0], o[1], o[2], o[3]) || 1;
    return [o[0] / l, o[1] / l, o[2] / l, o[3] / l];
  }
  function projection(fx, fy, w, h, znear) {
    var zfar = 200;
    return [
      (2 * fx) / w, 0, 0, 0,
      0, -(2 * fy) / h, 0, 0,
      0, 0, zfar / (zfar - znear), 1,
      0, 0, -(zfar * znear) / (zfar - znear), 0
    ];
  }

  /* ------------------------------------------------------------- runtime */
  function create(canvas, base, hooks) {
    var gl = canvas.getContext("webgl2", { antialias: false, alpha: true,
                                           premultipliedAlpha: true });
    if (!gl) throw new Error("WebGL 2 is not available in this browser");

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE_MINUS_DST_ALPHA, gl.ONE, gl.ONE_MINUS_DST_ALPHA, gl.ONE);
    gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);

    var u_projection = gl.getUniformLocation(prog, "projection");
    var u_viewport = gl.getUniformLocation(prog, "viewport");
    var u_focal = gl.getUniformLocation(prog, "focal");
    var u_view = gl.getUniformLocation(prog, "view");
    gl.uniform1i(gl.getUniformLocation(prog, "u_texture"), 0);

    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-2, -2, 2, -2, 2, 2, -2, 2]), gl.STATIC_DRAW);
    var a_pos = gl.getAttribLocation(prog, "position");
    gl.enableVertexAttribArray(a_pos);
    gl.vertexAttribPointer(a_pos, 2, gl.FLOAT, false, 0, 0);

    var tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);

    var idxBuf = gl.createBuffer();
    var a_index = gl.getAttribLocation(prog, "index");
    gl.enableVertexAttribArray(a_index);
    gl.bindBuffer(gl.ARRAY_BUFFER, idxBuf);
    gl.vertexAttribIPointer(a_index, 1, gl.INT, false, 0, 0);
    gl.vertexAttribDivisor(a_index, 1);

    var worker = new Worker(URL.createObjectURL(new Blob(
      ["(", workerBody.toString(), ")(self)"], { type: "application/javascript" })));

    var state = {
      count: 0, drawn: 0, meta: null,
      znear: 0.01, fps: 0,
      view: null, proj: null,
      orbit: { yaw: 0, pitch: 0, dist: 0 },
      viewIndex: 0, flying: false, flyT: 0, ready: false
    };

    worker.onmessage = function (e) {
      if (e.data.ready) { state.count = e.data.ready; if (hooks.onReady) hooks.onReady(state.count); }
      else if (e.data.texdata) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, e.data.texwidth, e.data.texheight,
                      0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, e.data.texdata);
      } else if (e.data.depthIndex) {
        gl.bindBuffer(gl.ARRAY_BUFFER, idxBuf);
        gl.bufferData(gl.ARRAY_BUFFER, e.data.depthIndex, gl.DYNAMIC_DRAW);
        state.drawn = e.data.vertexCount;
        state.ready = true;
      }
    };

    /* ---- camera: start on a real capture pose, then orbit from it ---- */
    var anchor = null;                        // {C:[3], R:[3][3]}
    function setAnchor(v) {
      anchor = { C: v.position.slice(), R: v.rotation.map(function (r) { return r.slice(); }) };
      state.orbit.yaw = 0; state.orbit.pitch = 0; state.orbit.dist = 0;
    }

    function currentView() {
      if (state.flying && state.meta && state.meta.flight) {
        var f = state.meta.flight, n = f.n;
        var u = state.flyT * (n - 1);
        var i0 = Math.max(0, Math.min(n - 2, Math.floor(u))), t = u - i0;
        var p = [
          f.pos[i0 * 3] * (1 - t) + f.pos[(i0 + 1) * 3] * t,
          f.pos[i0 * 3 + 1] * (1 - t) + f.pos[(i0 + 1) * 3 + 1] * t,
          f.pos[i0 * 3 + 2] * (1 - t) + f.pos[(i0 + 1) * 3 + 2] * t
        ];
        var q = slerp(f.quat.slice(i0 * 4, i0 * 4 + 4), f.quat.slice((i0 + 1) * 4, (i0 + 1) * 4 + 4), t);
        return viewFromRC(quatToR(q), p);
      }
      if (!anchor) return null;
      /* orbit: rotate the capture pose about its own centre, then dolly
         along the resulting optical axis. Small moves around a real pose
         rather than a free camera, so the view never leaves the crop. */
      var cy = Math.cos(state.orbit.yaw), sy = Math.sin(state.orbit.yaw);
      var cp = Math.cos(state.orbit.pitch), sp = Math.sin(state.orbit.pitch);
      var Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
      var Rp = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]];
      var R = anchor.R;
      /* world-frame yaw about up, then pitch in the camera's own frame */
      var A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], i, j, k;
      for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) {
        var s = 0; for (k = 0; k < 3; k++) s += Ry[i][k] * R[k][j];
        A[i][j] = s;
      }
      var B = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) {
        var s2 = 0; for (k = 0; k < 3; k++) s2 += A[i][k] * Rp[k][j];
        B[i][j] = s2;
      }
      var fwd = [B[0][2], B[1][2], B[2][2]];
      var C = [
        anchor.C[0] + fwd[0] * state.orbit.dist,
        anchor.C[1] + fwd[1] * state.orbit.dist,
        anchor.C[2] + fwd[2] * state.orbit.dist
      ];
      return viewFromRC(B, C);
    }

    /* ---- sizing ---- */
    var vw = 1, vh = 1, fx = 1, fy = 1;
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      vw = canvas.clientWidth || 640; vh = canvas.clientHeight || 400;
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      var m = state.meta;
      var s = m && m.height ? vh / m.height : 1;
      fx = (m ? m.fx : 700) * s;
      fy = (m ? m.fy : 700) * s;
      gl.useProgram(prog);
      gl.uniform2fv(u_focal, new Float32Array([fx, fy]));
      gl.uniform2fv(u_viewport, new Float32Array([vw, vh]));
    }

    /* ---- input ---- */
    var down = false, lx = 0, ly = 0;
    canvas.addEventListener("pointerdown", function (e) {
      down = true; lx = e.clientX; ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointerup", function (e) {
      down = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (x) {}
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!down) return;
      state.flying = false;
      state.orbit.yaw -= (e.clientX - lx) * 0.0035;
      state.orbit.pitch += (e.clientY - ly) * 0.0030;
      state.orbit.pitch = Math.max(-0.75, Math.min(0.75, state.orbit.pitch));
      lx = e.clientX; ly = e.clientY;
    });
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      state.flying = false;
      state.orbit.dist = Math.max(-0.55, Math.min(0.55,
        state.orbit.dist + (e.deltaY > 0 ? -0.02 : 0.02)));
    }, { passive: false });

    /* ---- frame loop ---- */
    var last = performance.now(), frames = 0, acc = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      var dt = (now - last) / 1000; last = now;
      acc += dt; frames++;
      if (acc > 0.5) { state.fps = frames / acc; acc = 0; frames = 0; if (hooks.onStats) hooks.onStats(state); }

      if (state.flying && state.meta && state.meta.flight) {
        var dur = state.meta.flight.n * state.meta.flight.dt;
        state.flyT += dt / dur;
        if (state.flyT >= 1) state.flyT = 0;
      }
      var view = currentView();
      if (!view || !state.count) return;
      var proj = projection(fx, fy, vw, vh, state.znear);
      var vp = mul4(proj, view);
      worker.postMessage({ view: vp });

      gl.useProgram(prog);
      gl.uniformMatrix4fv(u_projection, false, proj);
      gl.uniformMatrix4fv(u_view, false, view);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (state.drawn) gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, state.drawn);
    }

    /* ---- load ---- */
    var api = {
      state: state,
      resize: resize,
      setZnear: function (v) { state.znear = v; },
      setView: function (i) {
        if (!state.meta) return;
        state.viewIndex = i; state.flying = false;
        setAnchor(state.meta.views[i]);
      },
      fly: function (on) { state.flying = on; if (on) state.flyT = 0; },
      isFlying: function () { return state.flying; },
      /* Swap in a different splat file. Nothing else changes — same worker,
         same texture path, same shaders — so the two assets are directly
         comparable rather than two different renderers. */
      load: function (name, onProgress) {
        state.ready = false;
        state.drawn = 0;              // never draw a stale index against a new set
        return fetchSplat(base + name, onProgress).then(function (buf) {
          worker.postMessage({ buffer: buf }, [buf]);
          return state;
        });
      },
      setPose: function (v) { state.flying = false; setAnchor(v); }
    };

    return Promise.all([
      fetch(base + "scene.json").then(function (r) { return r.json(); }),
      fetchSplat(base + "scene.splat", hooks.onProgress)
    ]).then(function (res) {
      state.meta = res[0];
      resize();
      setAnchor(state.meta.views[0]);
      worker.postMessage({ buffer: res[1] }, [res[1]]);
      window.addEventListener("resize", resize);
      requestAnimationFrame(frame);
      return api;
    });
  }

  global.SplatView = { create: create };
})(window);
