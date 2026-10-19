/**
 * Verified IPL 2026 franchise mapping for players in the auction catalogue.
 * Keys are catalogue player IDs; values use franchise IDs from src/data/teams.js.
 * Only players matched to the IPL 2026 squad lists are included. Missing IDs are
 * intentionally ineligible for retention until their franchise is verified.
 *
 * Source: official IPL 2026 Playing Squad list and updated 2026 squad lists.
 */
export const PLAYER_ORIGINAL_FRANCHISES = {
  // Mumbai Indians
  p_621: "MI", p_622: "MI", p_104: "MI", p_129: "MI", p_138: "MI",
  p_140: "MI", p_166: "MI", p_240: "MI", p_172: "MI", p_186: "MI",
  p_217: "MI", p_250: "MI", p_300: "MI", p_334: "MI", p_338: "MI",
  p_398: "MI", p_407: "MI",

  // Chennai Super Kings
  p_120: "CSK", p_130: "CSK", p_132: "CSK", p_134: "CSK", p_172: "CSK",
  p_193: "CSK", p_219: "CSK", p_275: "CSK", p_276: "CSK", p_291: "CSK",
  p_296: "CSK", p_297: "CSK", p_301: "CSK", p_308: "CSK", p_315: "CSK",
  p_321: "CSK", p_322: "CSK", p_327: "CSK", p_332: "CSK", p_333: "CSK",
  p_336: "CSK", p_349: "CSK", p_351: "CSK", p_354: "CSK", p_357: "CSK",
  p_369: "CSK", p_370: "CSK", p_382: "CSK", p_387: "CSK", p_390: "CSK",
  p_410: "CSK",

  // Royal Challengers Bengaluru
  p_103: "RCB", p_109: "RCB", p_119: "RCB", p_142: "RCB", p_158: "RCB",
  p_190: "RCB", p_203: "RCB", p_209: "RCB", p_250: "RCB", p_259: "RCB",
  p_260: "RCB", p_281: "RCB", p_285: "RCB", p_295: "RCB", p_308: "RCB",
  p_334: "RCB", p_343: "RCB", p_368: "RCB", p_373: "RCB", p_403: "RCB",

  // Kolkata Knight Riders
  p_127: "KKR", p_137: "KKR", p_141: "KKR", p_174: "KKR", p_183: "KKR",
  p_188: "KKR", p_193: "KKR", p_209: "KKR", p_250: "KKR", p_281: "KKR",
  p_285: "KKR", p_297: "KKR", p_309: "KKR", p_324: "KKR", p_364: "KKR",
  p_365: "KKR", p_908: "KKR", p_909: "KKR", p_910: "KKR",

  // Delhi Capitals
  p_102: "DC", p_111: "DC", p_112: "DC", p_117: "DC", p_128: "DC",
  p_135: "DC", p_147: "DC", p_153: "DC", p_165: "DC", p_180: "DC",
  p_183: "DC", p_194: "DC", p_206: "DC", p_216: "DC", p_220: "DC",
  p_228: "DC", p_229: "DC", p_241: "DC", p_253: "DC", p_265: "DC",
  p_284: "DC", p_292: "DC", p_299: "DC", p_310: "DC", p_311: "DC",
  p_327: "DC", p_343: "DC", p_368: "DC",

  // Punjab Kings
  p_101: "PBKS", p_110: "PBKS", p_114: "PBKS", p_115: "PBKS", p_131: "PBKS",
  p_135: "PBKS", p_143: "PBKS", p_145: "PBKS", p_146: "PBKS", p_148: "PBKS",
  p_159: "PBKS", p_216: "PBKS", p_226: "PBKS", p_241: "PBKS", p_243: "PBKS",
  p_245: "PBKS", p_254: "PBKS", p_258: "PBKS", p_263: "PBKS", p_279: "PBKS",
  p_282: "PBKS", p_314: "PBKS", p_317: "PBKS", p_318: "PBKS", p_320: "PBKS",
  p_343: "PBKS", p_349: "PBKS", p_357: "PBKS", p_364: "PBKS", p_413: "PBKS",

  // Rajasthan Royals
  p_107: "RR", p_132: "RR", p_133: "RR", p_144: "RR", p_150: "RR",
  p_157: "RR", p_159: "RR", p_181: "RR", p_198: "RR", p_201: "RR",
  p_264: "RR", p_269: "RR", p_286: "RR", p_318: "RR", p_334: "RR",
  p_340: "RR", p_352: "RR", p_366: "RR", p_368: "RR", p_390: "RR",
  p_400: "RR",

  // Sunrisers Hyderabad
  p_105: "SRH", p_106: "SRH", p_123: "SRH", p_139: "SRH", p_146: "SRH",
  p_168: "SRH", p_170: "SRH", p_196: "SRH", p_202: "SRH", p_210: "SRH",
  p_223: "SRH", p_227: "SRH", p_235: "SRH", p_270: "SRH", p_303: "SRH",
  p_329: "SRH", p_344: "SRH", p_353: "SRH", p_359: "SRH", p_370: "SRH",
  p_402: "SRH",

  // Gujarat Titans
  p_100: "GT", p_108: "GT", p_110: "GT", p_122: "GT", p_136: "GT",
  p_148: "GT", p_151: "GT", p_162: "GT", p_168: "GT", p_185: "GT",
  p_192: "GT", p_197: "GT", p_200: "GT", p_202: "GT", p_237: "GT",
  p_247: "GT", p_271: "GT", p_292: "GT", p_294: "GT", p_298: "GT",
  p_329: "GT", p_335: "GT", p_368: "GT", p_373: "GT", p_406: "GT",

  // Lucknow Super Giants
  p_113: "LSG", p_116: "LSG", p_121: "LSG", p_125: "LSG", p_126: "LSG",
  p_143: "LSG", p_147: "LSG", p_152: "LSG", p_154: "LSG", p_155: "LSG",
  p_160: "LSG", p_161: "LSG", p_164: "LSG", p_168: "LSG", p_173: "LSG",
  p_175: "LSG", p_178: "LSG", p_182: "LSG", p_204: "LSG", p_218: "LSG",
  p_232: "LSG", p_237: "LSG", p_244: "LSG", p_246: "LSG", p_268: "LSG",
  p_271: "LSG", p_296: "LSG", p_304: "LSG", p_329: "LSG"
};

export function getPlayerOriginalFranchise(playerId) {
  return PLAYER_ORIGINAL_FRANCHISES[playerId] ?? null;
}
