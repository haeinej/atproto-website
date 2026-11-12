// The landing page's one script, loaded with defer.
//
// 1. The wave: the whole opening section is a slow, flowing field of the Fatale greens (ink, forest,
//    moss, sage light, a little ebony), drawn with WebGL in .shade-stage. It is mostly paper: the
//    colour shows faintly where the field gathers, least behind the text, and fades out by the bottom
//    of the section. Near the pointer it bends and gathers, easing in and out so it stays soft. It only
//    animates while it is on screen. With reduced motion it draws one still frame; without WebGL the
//    stage falls back to a still CSS field (.is-still).
(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stage = document.querySelector(".shade-stage");
  const canvas = stage?.querySelector("canvas");

  // The pointer, in the stage's own 0–1 coordinates (y up), and how near it is (0–1). Both ease.
  const pointer = { x: 0.5, y: 0.5, near: 0, tx: 0.5, ty: 0.5, tnear: 0 };

  addEventListener("pointermove", event => {
    if (stage) {
      const box = stage.getBoundingClientRect();
      pointer.tx = (event.clientX - box.left) / box.width;
      pointer.ty = 1 - (event.clientY - box.top) / box.height;
      const dx = pointer.tx - 0.5, dy = pointer.ty - 0.5;
      pointer.tnear = event.clientY < box.bottom ? 1 : 0;
    }
  }, { passive: true });

  if (!canvas) return;
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) { stage.classList.add("is-still"); return; }

  const vertex = `
    attribute vec2 a_position;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;

  // Domain-warped noise, mapped through the Fatale palette and faded at the edges.
  const fragment = `
    precision mediump float;
    uniform vec2 u_size;
    uniform float u_time;
    uniform vec2 u_pointer;
    uniform float u_near;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
      return v;
    }

    // ink #082c23, forest #163e2c, moss #3e6249, sage #71856a, sage light #a1a382, pale #c9c6a6
    vec3 palette(float t) {
      vec3 ink = vec3(0.031, 0.173, 0.137);
      vec3 forest = vec3(0.086, 0.243, 0.173);
      vec3 moss = vec3(0.243, 0.384, 0.286);
      vec3 sage = vec3(0.443, 0.522, 0.416);
      vec3 light = vec3(0.631, 0.639, 0.510);
      vec3 pale = vec3(0.788, 0.776, 0.651);
      vec3 c = mix(ink, forest, smoothstep(0.10, 0.32, t));
      c = mix(c, moss, smoothstep(0.32, 0.50, t));
      c = mix(c, sage, smoothstep(0.50, 0.66, t));
      c = mix(c, light, smoothstep(0.66, 0.80, t));
      return mix(c, pale, smoothstep(0.80, 0.95, t));
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_size;
      float aspect = u_size.x / u_size.y;
      vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 0.55;
      float t = u_time * 0.045;

      // the pointer pulls the field toward it, softly
      vec2 toPointer = (u_pointer - 0.5) * vec2(aspect, 1.0) * 0.55 - p;
      float pull = exp(-dot(toPointer, toPointer) * 14.0) * u_near;

      vec2 q = vec2(fbm(p * 2.2 + vec2(t, -t * 0.6)), fbm(p * 2.2 + vec2(5.2, 1.3) - t * 0.8));
      vec2 r = vec2(fbm(p * 1.8 + 1.9 * q + vec2(1.7, 9.2) + t * 1.2),
                    fbm(p * 1.8 + 1.9 * q + vec2(8.3, 2.8) - t));
      r += toPointer * pull * 1.4;
      float f = fbm(p * 1.6 + 2.0 * r);

      // a slow wave running through it
      float wave = 0.12 * sin(p.x * 5.0 - p.y * 3.0 + t * 9.0 + f * 5.0);
      float tone = clamp(f * 1.25 - 0.08 + wave + pull * 0.35, 0.0, 1.0);
      vec3 color = palette(tone);

      // a little ebony (#2a1416) in the deepest folds, as on the first Fatale hero
      color = mix(color, vec3(0.165, 0.078, 0.086), smoothstep(0.62, 0.86, q.x) * (1.0 - tone) * 0.55);

      // Mostly paper: the colour shows only where the field gathers, faintest behind the text (left)
      // and gone by the bottom of the section, so it blends into the page with no edge.
      float gather = smoothstep(0.30, 0.85, f + wave * 0.5);
      float side = mix(0.25, 1.0, smoothstep(0.15, 0.85, uv.x));
      float fade = smoothstep(0.0, 0.45, uv.y);
      float alpha = gather * side * fade * 0.55 + pull * 0.18 * fade;
      alpha = clamp(alpha, 0.0, 0.62);
      alpha *= 0.85 + 0.15 * hash(gl_FragCoord.xy + floor(u_time * 24.0));  // grain
      gl_FragColor = vec4(color * alpha, alpha);
    }`;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };
  const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram();
  if (vs && fs) { gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program); }
  if (!vs || !fs || !gl.getProgramParameter(program, gl.LINK_STATUS)) { stage.classList.add("is-still"); return; }
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const u = name => gl.getUniformLocation(program, name);
  const uSize = u("u_size"), uTime = u("u_time"), uPointer = u("u_pointer"), uNear = u("u_near");

  const resize = () => {
    // the field is soft, so it is drawn below screen resolution and scaled up
    const scale = 0.6;
    const w = Math.round(canvas.clientWidth * scale), h = Math.round(canvas.clientHeight * scale);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uSize, w, h);
  };

  const toCanvas = v => v;  // the canvas fills the stage
  const start = performance.now() - 40000;  // begin mid-flow, not from a blank field
  const draw = now => {
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    pointer.near += (pointer.tnear - pointer.near) * 0.04;
    gl.uniform1f(uTime, (now - start) / 1000);
    gl.uniform2f(uPointer, toCanvas(pointer.x), toCanvas(pointer.y));
    gl.uniform1f(uNear, pointer.near);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  resize();
  addEventListener("resize", () => { resize(); if (still) draw(start + 40000); });
  if (still) { draw(start + 40000); return; }

  let frame = 0;
  const loop = now => { draw(now); frame = requestAnimationFrame(loop); };
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !frame) frame = requestAnimationFrame(loop);
    if (!entry.isIntersecting && frame) { cancelAnimationFrame(frame); frame = 0; }
  }).observe(stage);
})();
