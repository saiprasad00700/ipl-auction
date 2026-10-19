/**
 * IPL 2026 franchise ownership for catalogue player IDs.
 * Only entries verified against IPL 2026 squad lists are included.
 * An absent ID intentionally returns null and is not eligible for retention.
 * Franchise IDs match src/data/teams.js.
 */
export const PLAYER_ORIGINAL_FRANCHISES = {
  // Mumbai Indians
  p_621: "MI", // Jasprit Bumrah
  p_622: "MI", // Suryakumar Yadav
  p_104: "MI", // Hardik Pandya
  p_129: "MI", // Rohit Sharma
  p_166: "MI", // Tilak Varma
  p_138: "MI", // Tim David
  p_140: "MI", // Trent Boult
  p_240: "MI", // Naman Dhir
  p_186: "MI", // Ryan Rickelton
  p_217: "MI", // Ashwani Kumar

  // Chennai Super Kings
  p_120: "CSK", // Mahendra Singh Dhoni
  p_130: "CSK", // Ruturaj Gaikwad
  p_132: "CSK", // Sanju Samson
  p_134: "CSK", // Shivam Dube
  p_219: "CSK", // Ayush Mhatre
  p_296: "CSK", // Matheesha Pathirana
  p_301: "CSK", // Maheesh Theekshana
  p_315: "CSK", // Prashant Veer
  p_321: "CSK", // Kartik Sharma
  p_322: "CSK", // Mukul Choudhary
  p_349: "CSK", // Ben Dwarshuis
  p_351: "CSK", // Daryl Mitchell
  p_354: "CSK", // Matt Short
  p_357: "CSK", // Zak Foulkes
  p_369: "CSK", // Kyle Jamieson
  p_410: "CSK", // Sakib Hussain

  // Royal Challengers Bengaluru
  p_103: "RCB", // Bhuvneshwar Kumar
  p_109: "RCB", // Josh Hazlewood
  p_119: "RCB", // Mohammed Siraj
  p_142: "RCB", // Virat Kohli
  p_158: "RCB", // Rajat Patidar
  p_190: "RCB", // Harshit Rana
  p_203: "RCB", // Yash Dayal
  p_285: "RCB", // Finn Allen
  p_295: "RCB", // Jacob Duffy
  p_334: "RCB", // Karn Sharma

  // Kolkata Knight Riders
  p_127: "KKR", // Rinku Singh
  p_137: "KKR", // Sunil Narine
  p_141: "KKR", // Varun Chakaravarthy
  p_174: "KKR", // Jacob Bethell
  p_188: "KKR", // Ajinkya Rahane
  p_209: "KKR", // Angkrish Raghuvanshi
  p_281: "KKR", // Venkatesh Iyer
  p_364: "KKR", // Tim Seifert
  p_365: "KKR", // Tom Banton

  // Delhi Capitals
  p_102: "DC", // Axar Patel
  p_111: "DC", // KL Rahul
  p_112: "DC", // Kuldeep Yadav
  p_117: "DC", // Mitchell Starc
  p_153: "DC", // Khaleel Ahmed
  p_165: "DC", // Thangarasu Natarajan
  p_180: "DC", // Mukesh Kumar
  p_194: "DC", // Karun Nair
  p_206: "DC", // Abishek Porel
  p_220: "DC", // Digvesh Singh Rathi
  p_253: "DC", // Sameer Rizvi
  p_284: "DC", // Ben Duckett
  p_299: "DC", // Spencer Johnson
  p_310: "DC", // Yash Dhull
  p_311: "DC", // Auqib Nabi

  // Punjab Kings
  p_101: "PBKS", // Arshdeep Singh
  p_114: "PBKS", // Marco Jansen
  p_115: "PBKS", // Marcus Stoinis
  p_131: "PBKS", // Sam Curran
  p_145: "PBKS", // Yuzvendra Chahal
  p_216: "PBKS", // Ashutosh Sharma
  p_243: "PBKS", // Prabhsimran Singh
  p_245: "PBKS", // Priyansh Arya
  p_254: "PBKS", // Shashank Singh
  p_258: "PBKS", // Suryansh Shedge
  p_279: "PBKS", // Liam Livingstone
  p_314: "PBKS", // Mahipal Lomror
  p_317: "PBKS", // Sanvir Singh
  p_318: "PBKS", // Shivang Kumar
  p_320: "PBKS", // Vijay Shankar
  p_343: "PBKS", // Pathum Nissanka

  // Rajasthan Royals
  p_107: "RR", // Jofra Archer
  p_144: "RR", // Yashasvi Jaiswal
  p_150: "RR", // Dhruv Jurel
  p_159: "RR", // Riyan Parag
  p_181: "RR", // Nandre Burger
  p_198: "RR", // Sandeep Sharma
  p_264: "RR", // Vaibhav Sooryavanshi
  p_269: "RR", // Yudhvir Singh Charak
  p_352: "RR", // Dasun Shanaka
  p_366: "RR", // Adam Milne
  p_390: "RR", // Mangesh Yadav
  p_400: "RR", // Ravi Singh

  // Sunrisers Hyderabad
  p_105: "SRH", // Heinrich Klaasen
  p_106: "SRH", // Ishan Kishan
  p_123: "SRH", // Pat Cummins
  p_139: "SRH", // Travis Head
  p_146: "SRH", // Abhishek Sharma
  p_196: "SRH", // Nitish Kumar Reddy
  p_202: "SRH", // Umran Malik
  p_223: "SRH", // Gurjapneet Singh
  p_227: "SRH", // Harsh Dubey
  p_270: "SRH", // Zeeshan Ansari
  p_353: "SRH", // Jason Holder
  p_402: "SRH", // Salil Arora

  // Gujarat Titans
  p_100: "GT", // Aiden Markram
  p_108: "GT", // Jos Buttler
  p_110: "GT", // Kagiso Rabada
  p_122: "GT", // Noor Ahmad
  p_136: "GT", // Shubman Gill
  p_151: "GT", // Glenn Phillips
  p_162: "GT", // Sai Sudharsan
  p_185: "GT", // Rahul Tewatia
  p_192: "GT", // Jayant Yadav
  p_197: "GT", // Sai Kishore
  p_200: "GT", // Shahrukh Khan
  p_237: "GT", // Mohsin Khan
  p_247: "GT", // Raghu Sharma
  p_294: "GT", // Gerald Coetzee
  p_298: "GT", // Shivam Mavi
  p_335: "GT", // Kumar Kartikeya Singh
  p_406: "GT", // Mohammed Izhar

  // Lucknow Super Giants
  p_113: "LSG", // Lockie Ferguson
  p_116: "LSG", // Mitch Marsh
  p_121: "LSG", // Nicholas Pooran
  p_125: "LSG", // Rashid Khan
  p_126: "LSG", // Ravindra Jadeja
  p_147: "LSG", // Avesh Khan
  p_152: "LSG", // Harshal Patel
  p_154: "LSG", // Krunal Pandya
  p_155: "LSG", // Mayank Yadav
  p_160: "LSG", // Romario Shepherd
  p_161: "LSG", // Rovman Powell
  p_218: "LSG", // Ayush Badoni
  p_232: "LSG", // Manimaran Siddharth
  p_244: "LSG", // Prince Yadav
  p_268: "LSG", // Yash Thakur
  p_304: "LSG" // Ravi Bishnoi
};

export function getPlayerOriginalFranchise(playerId) {
  return PLAYER_ORIGINAL_FRANCHISES[playerId] ?? null;
}
