// Modified from the upstream project by saiprasad00700.
/**
 * IPL 2026 franchise ownership for catalogue player IDs.
 * Based on the IPL 2026 squad list and confirmed 2026 franchise assignments.
 * Only verified player-to-franchise assignments are included; an absent ID
 * intentionally returns null and is not eligible for retention.
 * Franchise IDs match src/data/teams.js.
 */
export const PLAYER_ORIGINAL_FRANCHISES = {
  // CSK
  p_327: "CSK", // Akash Madhwal
  p_300: "CSK", // Akeal Hosein
  p_387: "CSK", // Aman Khan
  p_211: "CSK", // Anshul Kamboj
  p_219: "CSK", // Ayush Mhatre
  p_172: "CSK", // Dewald Brevis
  p_902: "CSK", // Dian Forrester
  p_223: "CSK", // Gurjapneet Singh
  p_175: "CSK", // Jamie Overton
  p_321: "CSK", // Kartik Sharma
  p_153: "CSK", // Khaleel Ahmed
  p_901: "CSK", // Kuldip Yadav
  p_120: "CSK", // Mahendra Singh Dhoni
  p_297: "CSK", // Matt Henry
  p_354: "CSK", // Matt Short
  p_238: "CSK", // Mukesh Choudhary
  p_122: "CSK", // Noor Ahmad
  p_315: "CSK", // Prashant Veer
  p_303: "CSK", // Rahul Chahar
  p_249: "CSK", // Ramakrishna Ghosh
  p_130: "CSK", // Ruturaj Gaikwad
  p_132: "CSK", // Sanju Samson
  p_276: "CSK", // Sarfaraz Khan
  p_134: "CSK", // Shivam Dube
  p_255: "CSK", // Shreyas Gopal
  p_299: "CSK", // Spencer Johnson
  p_262: "CSK", // Urvil Patel
  p_357: "CSK", // Zak Foulkes,

  // DC
  p_206: "DC", // Abishek Porel
  p_207: "DC", // Ajay Mandal
  p_216: "DC", // Ashutosh Sharma
  p_311: "DC", // Auqib Nabi
  p_102: "DC", // Axar Patel
  p_284: "DC", // Ben Duckett
  p_272: "DC", // David Miller
  p_173: "DC", // Dushmantha Chameera
  p_194: "DC", // Karun Nair
  p_111: "DC", // KL Rahul
  p_112: "DC", // Kuldeep Yadav
  p_369: "DC", // Kyle Jamieson
  p_370: "DC", // Lungi Ngidi
  p_233: "DC", // Madhav Tiwari
  p_117: "DC", // Mitchell Starc
  p_180: "DC", // Mukesh Kumar
  p_183: "DC", // Nitish Rana
  p_343: "DC", // Pathum Nissanka
  p_275: "DC", // Prithvi Shaw
  p_903: "DC", // Rehan Ahmed
  p_904: "DC", // Sahil Parakh
  p_253: "DC", // Sameer Rizvi
  p_165: "DC", // Thangarasu Natarajan
  p_261: "DC", // Tripurana Vijay
  p_167: "DC", // Tristan Stubbs
  p_265: "DC", // Vipraj Nigam,

  // GT
  p_212: "GT", // Anuj Rawat
  p_236: "GT", // Arshad Khan
  p_328: "GT", // Ashok Sharma
  p_151: "GT", // Glenn Phillips
  p_224: "GT", // Gurnoor Brar
  p_191: "GT", // Ishant Sharma
  p_353: "GT", // Jason Holder
  p_192: "GT", // Jayant Yadav
  p_108: "GT", // Jos Buttler
  p_110: "GT", // Kagiso Rabada
  p_906: "GT", // Kulwant Khejroliya
  p_229: "GT", // Kumar Kushagra
  p_234: "GT", // Manav Suthar
  p_119: "GT", // Mohammed Siraj
  p_242: "GT", // Nishant Sindhu
  p_157: "GT", // Prasidh Krishna
  p_185: "GT", // Rahul Tewatia
  p_125: "GT", // Rashid Khan
  p_197: "GT", // Sai Kishore
  p_162: "GT", // Sai Sudharsan
  p_200: "GT", // Shahrukh Khan
  p_136: "GT", // Shubman Gill
  p_365: "GT", // Tom Banton
  p_168: "GT", // Washington Sundar,

  // KKR
  p_188: "KKR", // Ajinkya Rahane
  p_209: "KKR", // Angkrish Raghuvanshi
  p_213: "KKR", // Anukul Roy
  p_908: "KKR", // Blessing Muzarabani
  p_271: "KKR", // Cameron Green
  p_285: "KKR", // Finn Allen
  p_190: "KKR", // Harshit Rana
  p_329: "KKR", // Kartik Tyagi
  p_910: "KKR", // Luvnith Sisodia
  p_195: "KKR", // Manish Pandey
  p_296: "KKR", // Matheesha Pathirana
  p_909: "KKR", // Navdeep Saini
  p_336: "KKR", // Prashant Solanki
  p_280: "KKR", // Rachin Ravindra
  p_344: "KKR", // Rahul Tripathi
  p_250: "KKR", // Ramandeep Singh
  p_127: "KKR", // Rinku Singh
  p_161: "KKR", // Rovman Powell
  p_907: "KKR", // Saurabh Dubey
  p_137: "KKR", // Sunil Narine
  p_364: "KKR", // Tim Seifert
  p_202: "KKR", // Umran Malik
  p_263: "KKR", // Vaibhav Arora
  p_141: "KKR", // Varun Chakaravarthy,

  // LSG
  p_204: "LSG", // Abdul Samad
  p_100: "LSG", // Aiden Markram
  p_208: "LSG", // Akash Singh
  p_292: "LSG", // Anrich Nortje
  p_214: "LSG", // Arjun Tendulkar
  p_215: "LSG", // Arshin Kulkarni
  p_147: "LSG", // Avesh Khan
  p_218: "LSG", // Ayush Badoni
  p_220: "LSG", // Digvesh Singh Rathi
  p_911: "LSG", // George Linde
  p_228: "LSG", // Himmat Singh
  p_360: "LSG", // Josh Inglis
  p_232: "LSG", // Manimaran Siddharth
  p_178: "LSG", // Matthew Breetzke
  p_155: "LSG", // Mayank Yadav
  p_116: "LSG", // Mitch Marsh
  p_118: "LSG", // Mohammed Shami
  p_237: "LSG", // Mohsin Khan
  p_322: "LSG", // Mukul Choudhary
  p_330: "LSG", // Naman Tiwari
  p_121: "LSG", // Nicholas Pooran
  p_244: "LSG", // Prince Yadav
  p_128: "LSG", // Rishabh Pant
  p_199: "LSG", // Shahbaz Ahmed
  p_282: "LSG", // Wanindu Hasaranga,

  // MI
  p_169: "MI", // AM Ghazanfar
  p_217: "MI", // Ashwani Kumar
  p_171: "MI", // Corbin Bosch
  p_382: "MI", // Danish Malewar
  p_149: "MI", // Deepak Chahar
  p_104: "MI", // Hardik Pandya
  p_621: "MI", // Jasprit Bumrah
  p_912: "MI", // Keshav Maharaj
  p_314: "MI", // Mahipal Lomror
  p_156: "MI", // Mitchell Santner
  p_235: "MI", // Mayank Markande
  p_391: "MI", // Mayank Rawat
  p_406: "MI", // Mohammed Izhar
  p_240: "MI", // Naman Dhir
  p_289: "MI", // Quinton De Kock
  p_247: "MI", // Raghu Sharma
  p_248: "MI", // Raj Bawa
  p_252: "MI", // Robin Minz
  p_129: "MI", // Rohit Sharma
  p_186: "MI", // Ryan Rickelton
  p_163: "MI", // Shardul Thakur
  p_164: "MI", // Sherfane Rutherford
  p_622: "MI", // Suryakumar Yadav
  p_166: "MI", // Tilak Varma
  p_140: "MI", // Trent Boult
  p_143: "MI", // Will Jacks,

  // PBKS
  p_101: "PBKS", // Arshdeep Singh
  p_148: "PBKS", // Azmatullah Omarzai
  p_349: "PBKS", // Ben Dwarshuis
  p_913: "PBKS", // Cooper Connolly
  p_226: "PBKS", // Harpreet Brar
  p_113: "PBKS", // Lockie Ferguson
  p_114: "PBKS", // Marco Jansen
  p_115: "PBKS", // Marcus Stoinis
  p_179: "PBKS", // Mitch Owen
  p_239: "PBKS", // Musheer Khan
  p_241: "PBKS", // Nehal Wadhera
  p_243: "PBKS", // Prabhsimran Singh
  p_914: "PBKS", // Praveen Dubey
  p_245: "PBKS", // Priyansh Arya
  p_246: "PBKS", // Pyla Avinash
  p_254: "PBKS", // Shashank Singh
  p_135: "PBKS", // Shreyas Iyer
  p_258: "PBKS", // Suryansh Shedge
  p_267: "PBKS", // Vijaykumar Vyshak
  p_266: "PBKS", // Vishnu Vinod
  p_187: "PBKS", // Xavier Bartlett
  p_268: "PBKS", // Yash Thakur
  p_145: "PBKS", // Yuzvendra Chahal,

  // RR
  p_366: "RR", // Adam Milne
  p_915: "RR", // Brijesh Sharma
  p_352: "RR", // Dasun Shanaka
  p_150: "RR", // Dhruv Jurel
  p_221: "RR", // Donovan Ferreira
  p_107: "RR", // Jofra Archer
  p_368: "RR", // Kuldeep Sen
  p_230: "RR", // Kwena Maphaka
  p_231: "RR", // Lhuan-dré Pretorius
  p_181: "RR", // Nandre Burger
  p_304: "RR", // Ravi Bishnoi
  p_400: "RR", // Ravi Singh
  p_126: "RR", // Ravindra Jadeja
  p_159: "RR", // Riyan Parag
  p_131: "RR", // Sam Curran
  p_198: "RR", // Sandeep Sharma
  p_133: "RR", // Shimron Hetmyer
  p_256: "RR", // Shubham Dubey
  p_333: "RR", // Sushant Mishra
  p_201: "RR", // Tushar Deshpande
  p_264: "RR", // Vaibhav Sooryavanshi
  p_338: "RR", // Vignesh Puthur
  p_340: "RR", // Yash Punja
  p_144: "RR", // Yashasvi Jaiswal
  p_269: "RR", // Yudhvir Singh Charak,

  // RCB
  p_205: "RCB", // Abhinandan Singh
  p_103: "RCB", // Bhuvneshwar Kumar
  p_189: "RCB", // Devdutt Padikkal
  p_174: "RCB", // Jacob Bethell
  p_295: "RCB", // Jacob Duffy
  p_193: "RCB", // Jitesh Sharma
  p_359: "RCB", // Jordan Cox
  p_109: "RCB", // Josh Hazlewood
  p_917: "RCB", // Kanishk Chouhan
  p_154: "RCB", // Krunal Pandya
  p_390: "RCB", // Mangesh Yadav
  p_184: "RCB", // Nuwan Thushara
  p_124: "RCB", // Phil Salt
  p_158: "RCB", // Rajat Patidar
  p_251: "RCB", // Rasikh Dar
  p_918: "RCB", // Richard Gleeson
  p_160: "RCB", // Romario Shepherd
  p_393: "RCB", // Satvik Deswal
  p_259: "RCB", // Suyash Sharma
  p_260: "RCB", // Swapnil Singh
  p_138: "RCB", // Tim David
  p_281: "RCB", // Venkatesh Iyer
  p_395: "RCB", // Vicky Ostwal
  p_916: "RCB", // Vihaan Malhotra
  p_142: "RCB", // Virat Kohli
  p_203: "RCB", // Yash Dayal,

  // SRH
  p_146: "SRH", // Abhishek Sharma
  p_210: "SRH", // Aniket Verma
  p_170: "SRH", // Brydon Carse
  p_920: "SRH", // David Payne
  p_222: "SRH", // Eshan Malinga
  p_294: "SRH", // Gerald Coetzee
  p_227: "SRH", // Harsh Dubey
  p_152: "SRH", // Harshal Patel
  p_105: "SRH", // Heinrich Klaasen
  p_106: "SRH", // Ishan Kishan
  p_176: "SRH", // Jaydev Unadkat
  p_177: "SRH", // Kamindu Mendis
  p_279: "SRH", // Liam Livingstone
  p_196: "SRH", // Nitish Kumar Reddy
  p_407: "SRH", // Onkar Tarmale
  p_123: "SRH", // Pat Cummins
  p_919: "SRH", // Praful Hinge
  p_257: "SRH", // Ravichandran Smaran
  p_410: "SRH", // Sakib Hussain
  p_402: "SRH", // Salil Arora
  p_298: "SRH", // Shivam Mavi
  p_318: "SRH", // Shivang Kumar
  p_139: "SRH", // Travis Head
  p_270: "SRH", // Zeeshan Ansari
};

export function getPlayerOriginalFranchise(playerId) {
  return PLAYER_ORIGINAL_FRANCHISES[playerId] ?? null;
}
