// User-confirmed natural IPL batting positions for the 273 SS AUCTION players.
// OP3 players are marked separately as openers who can also bat at No. 3.
const PLAYER_POSITION_GROUPS = {
  MID_EXTRA: `Marcus Stoinis
Shimron Hetmyer
Rahul Tripathi
Daryl Mitchell
Matt Short`,
  FIN_EXTRA: `Wanindu Hasaranga`,
  BOWL_EXTRA: `Vaibhav Sooryavanshi
Sandeep Sharma
Yash Dayal
Mohsin Khan
Brydon Carse
Abhinandan Singh
Akash Singh
Himmat Singh
Kwena Maphaka
Raj Bawa
Shreyas Gopal
Atharva Taide
Yash Dhull
Auqib Nabi
Zak Foulkes`,
  OP_EXTRA: `Anmolpreet Singh`,

  "OP": "Ishan Kishan\nJos Buttler\nKL Rahul\nMitch Marsh\nPhil Salt\nRohit Sharma\nRuturaj Gaikwad\nSanju Samson\nShubman Gill\nTravis Head\nVirat Kohli\nYashasvi Jaiswal\nAiden Markram\nCameron Green\nQuinton De Kock\nAbhishek Sharma\nSai Sudharsan\nVenkatesh Iyer\nFinn Allen\nPrithvi Shaw\nRachin Ravindra\nPrabhsimran Singh\nNitish Rana\nPriyansh Arya\nAjinkya Rahane\nDevdutt Padikkal\nAyush Mhatre\nAbishek Porel\nUrvil Patel\nArshin Kulkarni\nHarnoor Singh\nLhuan-dré Pretorius\nBen Duckett\nPathum Nissanka\nRyan Rickelton\nTejasvi Singh\nJosh Inglis\nTim Seifert\nDanish Malewar\nSahil Parakh\nLuvnith Sisodia\nYashvardhan Dalal",
  "MID": "Suryakumar Yadav\nHeinrich Klaasen\nNicholas Pooran\nRishabh Pant\nShivam Dube\nShreyas Iyer\nDavid Miller\nLiam Livingstone\nDhruv Jurel\nRajat Patidar\nRiyan Parag\nTilak Varma\nTristan Stubbs\nDewald Brevis\nJitesh Sharma\nRovman Powell\nSherfane Rutherford\nJacob Bethell\nNehal Wadhera\nAngkrish Raghuvanshi\nSarfaraz Khan\nAyush Badoni\nManish Pandey\nKamindu Mendis\nMatthew Breetzke\nMitch Owen\nKarun Nair\nKumar Kushagra\nMusheer Khan\nNishant Sindhu\nPyla Avinash\nShubham Dubey\nRavichandran Smaran\nSuryansh Shedge\nMahipal Lomror\nKartik Sharma\nDonovan Ferreira\nJordan Cox\nTom Banton\nKunal Rathore\nSalil Arora\nSaurav Chuahan\nDian Forrester\nCooper Connolly\nVihaan Malhotra",
  "FIN": "Mahendra Singh Dhoni\nRashid Khan\nRinku Singh\nSunil Narine\nTim David\nAshutosh Sharma\nShashank Singh\nNitish Kumar Reddy\nNaman Dhir\nDeepak Chahar\nMitch Santner\nRomario Shepherd\nAkeal Hosein\nRahul Tewatia\nHarshit Rana\nShahbaz Ahmed\nSameer Rizvi\nShardul Thakur\nSai Kishore\nShahrukh Khan\nHarpreet Brar\nRamandeep Singh\nCorbin Bosch\nJamie Overton\nXavier Bartlett\nAbdul Samad\nAjay Mandal\nAniket Verma\nAnshul Kamboj\nPrashant Veer\nSanvir Singh\nShivang Kumar\nMukul Choudhary\nHarsh Dubey\nManimaran Siddharth\nMadhav Tiwari\nRobin Minz\nVipraj Nigam\nVishnu Vinod\nUmesh Yadav\nAman Khan\nMayank Rawat\nRavi Singh\nOnkar Tarmale\nRehan Ahmed\nGeorge Linde\nKeshav Maharaj\nPraveen Dubey\nKanishk Chouhan\nJack Edwards",
  "AR": "Axar Patel\nHardik Pandya\nMarco Jansen\nPat Cummins\nRavindra Jadeja\nSam Curran\nWill Jacks\nAzmatullah Omarzai\nGlenn Phillips\nKrunal Pandya\nWashington Sundar\nAnuj Rawat\nAnukul Roy\nArjun Tendulkar\nVijay Shankar\nDasun Shanaka\nJason Holder",
  "BOWL": "Jasprit Bumrah\nArshdeep Singh\nBhuvneshwar Kumar\nJofra Archer\nJosh Hazlewood\nKagiso Rabada\nKuldeep Yadav\nMitchell Starc\nMohammed Shami\nMohammed Siraj\nNoor Ahmad\nTrent Boult\nVarun Chakaravarthy\nYuzvendra Chahal\nLockie Ferguson\nMatheesha Pathirana\nRavi Bishnoi\nAvesh Khan\nHarshal Patel\nKhaleel Ahmed\nMayank Yadav\nPrasidh Krishna\nThangarasu Natarajan\nAnrich Nortje\nMaheesh Theekshana\nRahul Chahar\nMukesh Kumar\nDigvesh Singh Rathi\nTushar Deshpande\nUmran Malik\nYash Thakur\nJacob Duffy\nMayank Markande\nSuyash Sharma\nSwapnil Singh\nMatt Henry\nAM Ghazanfar\nDushmantha Chameera\nJaydev Unadkat\nNathan Ellis\nNuwan Thushara\nIshant Sharma\nJayant Yadav\nAkash Deep\nNandre Burger\nAshwani Kumar\nEshan Malinga\nGurjapneet Singh\nGurnoor Brar\nManav Suthar\nArshad Khan\nMukesh Choudhary\nPrince Yadav\nRaghu Sharma\nRamakrishna Ghosh\nRasikh Dar\nTripurana Vijay\nVaibhav Arora\nVijaykumar Vyshak\nYudhvir Singh Charak\nZeeshan Ansari\nGerald Coetzee\nShivam Mavi\nSpencer Johnson\nAkash Madhwal\nAshok Sharma\nKartik Tyagi\nNaman Tiwari\nSimarjeet Singh\nSushant Mishra\nKarn Sharma\nKumar Kartikeya Singh\nPrashant Solanki\nVignesh Puthur\nYash Punja\nBen Dwarshuis\nAdam Milne\nKuldeep Sen\nKyle Jamieson\nLungi Ngidi\nMustafizur Rahman\nMangesh Yadav\nSatvik Deswal\nVicky Ostwal\nMohammed Izhar\nYarra Prithviraj\nSakib Hussain\nVijay Kumar\nKuldip Yadav\nKulwant Khejroliya\nSaurabh Dubey\nBlessing Muzarabani\nNavdeep Saini\nBrijesh Sharma\nRichard Gleeson\nPraful Hinge\nDavid Payne"
};

export const PLAYER_BATTING_POSITIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(PLAYER_POSITION_GROUPS).flatMap(([position, names]) =>
      names.split('\\n').filter(Boolean).map((name) => [name, {
        battingPosition: position,
        canBatAtThree: ['Abishek Porel', 'Urvil Patel', 'Anmolpreet Singh', 'Josh Inglis'].includes(name)
      }])
    )
  )
);
