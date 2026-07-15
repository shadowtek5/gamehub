// Video-filter (shader) choices offered per game. Values MUST be exact keys
// from EmulatorJS's own shader set (config.shaders / the Shader setting) — an
// unknown value makes EmulatorJS silently disable the filter. "disabled" means
// no shader (sharp pixels). Names that map to a CRT/upscaler are shown as-is;
// the two generic entries are localized via `key`.
//
// Valid EmulatorJS shader keys (stable data build): 2xScaleHQ.glslp,
// 4xScaleHQ.glslp, crt-aperture.glslp, crt-beam, crt-caligari, crt-easymode.glslp,
// crt-geom.glslp, crt-lottes, crt-mattias.glslp, crt-yeetron, crt-zfast, sabr,
// bicubic, mix-frames.
export const SHADERS: { value: string; key?: string; label?: string }[] = [
  { value: "disabled", key: "filterOff" },
  { value: "bicubic", key: "filterSmooth" },
  { value: "2xScaleHQ.glslp", label: "ScaleHQ 2×" },
  { value: "crt-easymode.glslp", label: "CRT — Easymode" },
  { value: "crt-aperture.glslp", label: "CRT — Aperture" },
  { value: "crt-geom.glslp", label: "CRT — Geom" },
  { value: "crt-mattias.glslp", label: "CRT — Mattias" },
  { value: "crt-lottes", label: "CRT — Lottes" },
  { value: "sabr", label: "SABR" },
];
