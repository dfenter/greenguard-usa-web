#!/usr/bin/env node
/**
 * Full upsert from list(6).csv → HubSpot
 * - Creates contacts that don't exist yet
 * - Updates address on contacts that have none
 * - Adds special operational notes
 * Run: node _scripts/import-csv-notes.js
 */

// Load modules from app/node_modules
const appDir = require('path').join(__dirname, '../app')
require('module').Module._nodeModulePaths(appDir).forEach(p => {
  if (!require.resolve.paths('dotenv').includes(p)) require.resolve.paths('dotenv').push(p)
})
process.env.NODE_PATH = appDir + '/node_modules'
require('module').Module._initPaths()

require('dotenv').config({ path: require('path').join(appDir, '.env') })
const { Client } = require(require('path').join(appDir, 'node_modules/@hubspot/api-client'))

const client = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })

// ── Full contact list from CSV ─────────────────────────────────────────────────
const CONTACTS = [
  { first: 'Doyle',     last: 'Adams',        phone: '+17132034213',  email: 'doyle_adams@hotmail.com',          address: '' },
  { first: 'Edgar',     last: 'Aguillon',      phone: '',              email: 'pelaguillon@icloud.com',           address: '1508 Alguno Rd, Austin, TX 78757' },
  { first: 'David',     last: 'Allison',       phone: '+18066748798',  email: 'david@allison-firm.com',           address: '7604 Rustling Cv, Austin, TX 78731' },
  { first: 'Irene',     last: 'Almanza',       phone: '+15129023382',  email: '',                                  address: '3021 Great Valley Dr, Cedar Park, TX 78613' },
  { first: 'Roger',     last: 'Anderson',      phone: '(512) 820-1594',email: 'rogeranderson1945@yahoo.com',      address: '9029 Tanak Ln, Austin, TX 78749' },
  { first: 'Natalie',   last: 'Archambo',      phone: '+14804446547',  email: 'natalie.archambo@gmail.com',       address: '406 Inwood Rd, Austin, TX 78746' },
  { first: 'Betsy',     last: 'Ashcraft',      phone: '(512) 663-2712',email: 'betsyashcraft@gmail.com',          address: '2007 Leberman, Austin, TX 78703' },
  { first: 'Kyle',      last: 'Bailey',        phone: '',              email: 'Kyle.o.bailey@gmail.com',          address: '1303 Azie Morton Rd #4, Austin, TX 78704' },
  { first: 'Christopher',last: 'Ballard',      phone: '+14158440142',  email: 'CTBallard@gmail.com',              address: '2 Pleasant Cove, Austin, TX 78746' },
  { first: 'Jean',      last: 'Barton',        phone: '',              email: 'Chairstoryhair@gmail.com',         address: '1707 Astor Place, Austin, TX 78721' },
  { first: 'David',     last: 'Board',         phone: '(512) 517-6200',email: 'dboardmd@yahoo.com',               address: '3707 WeatherHill Cove, Austin, TX 78730' },
  { first: 'Philip',    last: 'Braithwaite',   phone: '',              email: 'philbraithwaite@outlook.com',      address: '10733 Maelin Drive, Austin, TX 78739' },
  { first: 'Brandon',   last: 'Broesche',      phone: '(512) 567-7100',email: 'drive512@yahoo.com',               address: 'Roundup Trail, Austin, TX 78745' },
  { first: 'Kristin',   last: 'Brookshire',    phone: '+15128103535',  email: 'kristinbrookshire@gmail.com',      address: '9009 Ruxton Cove, Austin, TX 78749' },
  { first: 'Matt',      last: 'Buckley',       phone: '(512) 293-4523',email: 'Cpk_dc@protonmail.com',            address: '9402 Towana Trail, Austin, TX 78736' },
  { first: 'Daniel',    last: 'Cadis',         phone: '+17135694893',  email: 'dpcadis@gmail.com',                address: '1005 Ruth Ave, Austin, TX 78757' },
  { first: 'Susan',     last: 'Calland',       phone: '',              email: 'slebbert@gmail.com',               address: '6300 Shoal Creek Dr W, Austin, TX 78757' },
  { first: 'Paige',     last: 'Carpenter',     phone: '+19167479564',  email: 'Paige@rossfamilyoffice.com',       address: '' },
  { first: 'Joaquin',   last: 'Casares',       phone: '',              email: 'Filename.exe@gmail.com',           address: '1728 Strobel Lane, Austin, TX 78748' },
  { first: 'Dan',       last: 'Case',          phone: '+17372307006',  email: 'dcase999@gmail.com',               address: '6106 Cary Dr, Austin, TX 78757' },
  { first: 'Carolyn',   last: 'Cavanagh',      phone: '(985) 276-2056',email: 'alaina@atxfs.com',                 address: '3 Pleasant Cove, Austin, TX 78746' },
  { first: 'Louis',     last: 'Coldwell',      phone: '+12812358278',  email: 'andiandlouis@gmail.com',           address: '505 W Esparada Dr, Georgetown, TX 78628' },
  { first: 'Simon',     last: 'Corsin',        phone: '+16467322088',  email: 'simon@corsin.me',                  address: '1704 Mistywood Drive, Austin, TX 78745' },
  { first: 'Kyle',      last: 'Counselman',    phone: '+18639442001',  email: 'kylecounselman@gmail.com',         address: '' },
  { first: 'Benjamin',  last: 'Crocker',       phone: '+18083926218',  email: 'bcrockerhi@gmail.com',             address: '' },
  { first: 'David',     last: 'Crumley',       phone: '+15129405783',  email: 'dgcrumley@gmail.com',              address: '3404 Socorro Circle, Austin, TX 78739' },
  { first: 'Jami',      last: 'DeLauri',       phone: '+16178946901',  email: 'delauri-jami@aramark.com',         address: '' },
  { first: 'Christina', last: 'DeShera',       phone: '+14087072250',  email: 'desheramoultrie@gmail.com',        address: '6701 Tanaqua Cove, Austin, TX 78739' },
  { first: 'Lindsey',   last: 'Detwiler',      phone: '(512) 743-7973',email: 'lhdetwiler@gmail.com',             address: '1914 Flint Rock Loop, Driftwood, TX 78619' },
  { first: 'Briana',    last: 'Dillard',       phone: '+15625449110',  email: 'bmweiland@gmail.com',              address: '809 Canyon Creek Dr, Austin, TX 78746' },
  { first: 'Sally',     last: 'Duncan',        phone: '(512) 791-2631',email: 'sallyirene@gmail.com',             address: '2503 Broken Oak, Austin, TX 78745' },
  { first: 'Felix',     last: 'Erbring',       phone: '(713) 304-2211',email: 'felix.erbring@gmail.com',          address: '1714 Channel Rd, Austin, TX 78746' },
  { first: 'Brendan',   last: 'Flood',         phone: '+18134822160',  email: 'bflood.edits@gmail.com',           address: '3204 E 14th 1/2 St, Austin, TX 78721' },
  { first: 'Gerald',    last: 'Flynn',         phone: '',              email: 'GeraldJohnflynn@gmail.com',        address: '3406 Cambridge Ct, Austin, TX 78723' },
  { first: 'Alex',      last: 'Fredell',       phone: '(860) 214-5050',email: 'Alex@fredell.com',                 address: '2102 E 21st St #2, Austin, TX 78722' },
  { first: 'Marisa',    last: 'Frezza',        phone: '+18583331867',  email: 'mfrezza3@gmail.com',               address: '' },
  { first: 'Christian', last: 'Gaytan',        phone: '',              email: 'christiang86@live.com',            address: '1615 Holly St Bldg 2, Austin, TX 78702' },
  { first: 'Luchie',    last: 'Glorioso',      phone: '',              email: 'luchieglorioso@gmail.com',         address: '7113 Auburn Blaze Lane, Austin, TX 78744' },
  { first: 'Michael',   last: 'Gorski',        phone: '+17144487510',  email: 'magorski57@gmail.com',             address: '840 Premier Park Loop, Dripping Springs, TX 78620' },
  { first: 'Katherine', last: 'Graham',        phone: '+15122770188',  email: 'katherinegrahamatx@gmail.com',     address: '9600 Newbury Drive, Austin, TX 78729' },
  { first: 'Michael',   last: 'Green',         phone: '+17138582123',  email: 'mgreen360@gmail.com',              address: '1503 Silverado Cir, Austin, TX 78746' },
  { first: 'Zach',      last: 'Greenberger',   phone: '+13107702364',  email: 'zach@axlotl.com',                  address: '' },
  { first: 'John',      last: 'Haner',         phone: '(512) 516-7774',email: 'Bluecrewpoolco@gmail.com',         address: '' },
  { first: 'Kevin',     last: 'Harrigan',      phone: '',              email: 'Klharrigan3@gmail.com',            address: '' },
  { first: 'Danielle',  last: 'Hasso',         phone: '(714) 271-6843',email: 'daniellehasso@gmail.com',          address: '2810 Pickwick Lane, Austin, TX 78746' },
  { first: 'Jeff',      last: 'Helfgott',      phone: '(254) 371-6977',email: 'jeff.helfgott@gmail.com',          address: '3200 West 35th Street, Austin, TX' },
  { first: 'Jamie',     last: 'Hollander',     phone: '+16506787845',  email: 'jameshollander@gmail.com',         address: '6600 Toolwrich Ln, Austin, TX 78739' },
  { first: 'Chris',     last: 'Howell',        phone: '(512) 804-5346',email: 'Ktcehowell@gmail.com',             address: '1619 South 2nd Street, Austin, TX 78704' },
  { first: 'Vera',      last: 'James',         phone: '+15127510097',  email: 'lizbjames8@gmail.com',             address: '6705 Tanaqua Cove, Austin, TX 78739' },
  { first: 'Annie',     last: 'Judice',        phone: '',              email: 'anniejudice@gmail.com',            address: '11711 Astoria Dr, Bee Cave, TX 78738' },
  { first: 'Paul',      last: 'Kalka',         phone: '(214) 995-4994',email: 'Prkalka@gmail.com',                address: '6429 Clay Allison Pass, Austin, TX 78749' },
  { first: 'Zachary',   last: 'Katancik',      phone: '+12815469267',  email: 'zkatancik@gmail.com',              address: '905 Ruth Ave, Austin, TX 78757' },
  { first: 'Stuart',    last: 'Keast',         phone: '+15129819012',  email: 'ben.keast324@gmail.com',           address: '613 Hammack Drive, Austin, TX 78752' },
  { first: 'Arianne',   last: 'Kennedy',       phone: '+12035210740',  email: 'arianne.smola@gmail.com',          address: '2106 Peach Tree Street, Austin, TX 78704' },
  { first: 'Robert',    last: 'Kennedy',       phone: '+15163849201',  email: 'deadish42@yahoo.com',              address: '9033 Tanak Lane, Austin, TX 78749' },
  { first: 'Nick',      last: 'Kitmitto',      phone: '(480) 238-4984',email: 'nick@kitmitto.com',                address: '' },
  { first: 'Harshad',   last: 'Kulkarni',      phone: '+17373362646',  email: 'harshad141@gmail.com',             address: '2401 Powderham Ln, Cedar Park, TX 78613' },
  { first: 'Ethan',     last: 'Lacey',         phone: '+15102008487',  email: 'ethan@ethanlacey.com',             address: '1404 Kinney Avenue, Austin, TX 78704' },
  { first: 'Chris',     last: 'Lariscy',       phone: '+16786870908',  email: 'chris@lariscy.org',                address: '' },
  { first: 'Andrew',    last: 'Latimer',       phone: '+15128509551',  email: 'andrew@ltmr.io',                   address: '2503 Twin Oaks Drive, Austin, TX 78757' },
  { first: 'Emi',       last: 'Lawson',        phone: '+12067887624',  email: 'Samepage.tx@outlook.com',          address: '5301 Summerset Trl, Austin, TX 78749' },
  { first: 'Scott',     last: 'Lawson',        phone: '(512) 363-2864',email: 'srl78704@gmail.com',               address: '4913 Norman Trail, Austin, TX 78749' },
  { first: 'Susan',     last: 'Lee',           phone: '(512) 900-0202',email: 'Sushijung@gmail.com',              address: '8109 Crabtree Cove, Austin, TX 78750' },
  { first: 'Stephen',   last: 'Lento',         phone: '+15136522451',  email: 'stephen.lento@gmail.com',          address: '4107 Paint Rock Dr, Austin, TX 78731' },
  { first: 'Fredrick',  last: 'Lewcock',       phone: '+15127754313',  email: 'fredlewcock@gmail.com',            address: '1915 Piedmont Ave, Austin, TX 78757' },
  { first: 'Jeff',      last: 'Lockett',       phone: '(512) 423-3915',email: 'lockett.jeff@yahoo.com',           address: '2342 Berwick Drive, Round Rock, TX 78681' },
  { first: 'Ana',       last: 'Lopez',         phone: '(512) 750-2134',email: 'anaserv_2002@yahoo.com',           address: '604 Bearsley, Austin, TX 78746' },
  { first: 'Molly',     last: 'Lord',          phone: '',              email: 'Meburt02@gmail.com',               address: '4124 Valley View Road, Austin, TX 78704' },
  { first: 'Melanie',   last: 'Lown',          phone: '(512) 663-7706',email: 'melanielown19@gmail.com',          address: '4516 Merle #2, Austin, TX 78745' },
  { first: 'Moneeza',   last: 'Maredia',       phone: '+18326618690',  email: 'moneezam@gmail.com',               address: '5009 Rollingwood Dr, West Lake Hills, TX 78746' },
  { first: 'Carolina',  last: 'Martinez',      phone: '+12674751103',  email: 'k.rito1009@gmail.com',             address: '13401 Moscow Trail, Austin, TX 78729' },
  { first: 'Christine', last: 'Mattingly',     phone: '+15635806953',  email: 'mattinglyeverafter@gmail.com',     address: '7004 Gentle Oak Dr, Austin, TX 78749' },
  { first: 'John',      last: 'Mattingly',     phone: '',              email: 'johnjmattingly@gmail.com',         address: '5405 Highland Crest, Austin, TX' },
  { first: 'Michael',   last: 'Mcmillin',      phone: '(956) 244-1134',email: 'Michael.mcmillin@gmail.com',       address: '2407 Little John Ln, Austin, TX 78704' },
  { first: 'Glenn',     last: 'Meier',         phone: '',              email: 'meter@glennmeter.net',             address: '7714 Shoal Creek Blvd, Austin, TX 78757' },
  { first: 'Carol',     last: 'Messer',        phone: '(713) 553-0683',email: 'Clmesser@me.com',                  address: '2301 East Side Dr, Austin, TX 78704' },
  { first: 'Rachel',    last: 'Mitrano',       phone: '+15856136252',  email: 'rachel.mitrano@gmail.com',         address: '' },
  { first: 'Alexandra', last: 'Moore',         phone: '+15124683111',  email: 'alexmoore2115@gmail.com',          address: '4704 Marblehead Dr, Austin, TX 78727' },
  { first: 'Drury',     last: 'Morris',        phone: '+12563669021',  email: 'Drurymorris@gmail.com',            address: '7701 Pleasant Meadow Circle, Austin, TX 78731' },
  { first: 'Patrick',   last: 'Mosher',        phone: '(512) 768-5515',email: 'Pmosher@grandliving.com',          address: '4401 Jessie Hts Dr, Austin, TX 78731' },
  { first: 'Brian',     last: 'Mueller',       phone: '+15129636192',  email: 'mueller.brian.a@gmail.com',        address: '10616 Floral Park Dr, Austin, TX 78759' },
  { first: 'Rajesh',    last: 'Nerlikar',      phone: '(512) 799-7771',email: 'rajesh.nerlikar@gmail.com',        address: '6203 Mesa Drive, Austin, TX 78731' },
  { first: 'Jesse',     last: 'Newland',       phone: '+14042161093',  email: 'jesse@jnewland.com',               address: '1907 E 22nd Street, Austin, TX 78722' },
  { first: 'Tim',       last: 'Nuttall',       phone: '(281) 753-7935',email: 'Timothy.e.nuttall@gmail.com',      address: '7709 Haggans Lane, Austin, TX 78739' },
  { first: 'David',     last: 'Orr',           phone: '',              email: 'david@meplanet.net',               address: '4509 Avenue F, Austin, TX 78757' },
  { first: 'Amanda',    last: 'Park',          phone: '+15125372627',  email: 'foods-debtors.9k@icloud.com',      address: '' },
  { first: 'Chase',     last: 'Parrish',       phone: '',              email: 'regpart22@gmail.com',              address: '' },
  { first: 'Amy',       last: 'Patton',        phone: '+14325533691',  email: 'amywpatton@gmail.com',             address: '2606 Rockingham Dr, Austin, TX 78704' },
  { first: 'Courtney',  last: 'Paul',          phone: '(817) 976-2269',email: 'courtney.e.paul@gmail.com',        address: '6502 Halsey Ct, Austin, TX 78739' },
  { first: 'Patrick',   last: 'Pearsall',      phone: '(512) 659-1348',email: 'pearsallpatrick1@gmail.com',       address: '2022 Rundell Place, Austin, TX 78704' },
  { first: 'Joshua',    last: 'Pena',          phone: '',              email: 'joshua.a.pena@gmail.com',          address: '4928 Calhoun Canyon Loop, Austin, TX 78735' },
  { first: 'David',     last: 'Pfaffenberger', phone: '+17132992596',  email: 'david.pfaffenberger@gmail.com',    address: '8509 Alverstone Way, Austin, TX 78759' },
  { first: 'Jd',        last: 'Plant',         phone: '',              email: 'jd.plant@gmail.com',               address: '1325 Anna Ct, Cedar Park, TX 78613' },
  { first: 'Marjo',     last: 'Poindexter',    phone: '+19724675575',  email: 'Mlcmp@protonmail.com',             address: '5708 Highland Hills Cir, Austin, TX 78731' },
  { first: 'Michael',   last: 'Preis',         phone: '+15127452312',  email: 'mkpreis7@gmail.com',               address: '7308 Brecourt Manor Way, Austin, TX 78739' },
  { first: 'Kelli',     last: 'Pyle',          phone: '+15125874215',  email: 'kellipyle@austin.rr.com',          address: '8904 Currywood Drive, Austin, TX 78759' },
  { first: 'Akshai',    last: 'Rao',           phone: '+19725142169',  email: 'rao.finances@gmail.com',           address: '4312 Small Dr, Austin, TX 78731' },
  { first: 'Daniel',    last: 'Raynaud',       phone: '(415) 449-1499',email: 'daniel@sharpninth.com',            address: '9011 San Diego Road, Austin, TX 78737' },
  { first: 'Christine', last: 'Robinson',      phone: '',              email: 'christinejrobinson@gmail.com',     address: '106 W Crestland Dr, Austin, TX 78752' },
  { first: 'Sarah',     last: 'Rogers',        phone: '+17372971564',  email: 'metalchickster@gmail.com',         address: '3300 Westhill Drive, Austin, TX 78704' },
  { first: 'Donald',    last: 'Schrader',      phone: '(213) 793-6132',email: 'Dschrader95@yahoo.com',            address: '201 North Canyonwood Drive, Dripping Springs, TX 78620' },
  { first: 'Brandon',   last: 'Schumaker',     phone: '+12485356000',  email: 'brandonschumaker@gmail.com',       address: '1404 Ruth Ave, Austin, TX 78757' },
  { first: 'Justin',    last: 'Scott',         phone: '+17026193258',  email: 'justin@gohomepoint.com',           address: '3505 Mount Barker Dr, Austin, TX 78731' },
  { first: 'Lisa',      last: 'Seale',         phone: '(512) 496-4809',email: 'lisaseale27@gmail.com',            address: '3505 Sacred Moon Cove, Austin, TX 78746' },
  { first: 'Carthy',    last: 'Shelton',       phone: '+15124151218',  email: 'carthy@duck.com',                  address: '5614 Abilene Trail, Austin, TX 78749' },
  { first: 'Kevin',     last: 'Smith',         phone: '+14042770892',  email: 'kevosmith@gmail.com',              address: '739 Cherico Street #1, Austin, TX 78702' },
  { first: 'Peggy',     last: 'Smith',         phone: '+19857892551',  email: 'ltsmith9@yahoo.com',               address: '230 Bolton Dr, Austin, TX 78737' },
  { first: 'Leah',      last: 'Spears',        phone: '+15127974250',  email: 'Leahdawnmontoya@gmail.com',        address: '' },
  { first: 'Jake',      last: 'Spencer',       phone: '',              email: 'Jakecspencer@gmail.com',           address: '422 Dasher Dr, Lakeway, TX 78734' },
  { first: 'Rajiv',     last: 'Srinivasa',     phone: '+15127314389',  email: 'rajiv.srinivasa@gmail.com',        address: '' },
  { first: 'Chelsea',   last: 'Stanciu',       phone: '+15127509458',  email: 'Chelstanciu@yahoo.com',            address: '4505 Crestway Dr, Austin, TX 78731' },
  { first: 'James',     last: 'Stiefelmaier',  phone: '+15129224872',  email: 'jim.stiefelmaier@gmail.com',       address: '2344 Berwick Drive, Round Rock, TX 78681' },
  { first: 'Drew',      last: 'Streich',       phone: '+17542136181',  email: 'andrew.streich@gmail.com',         address: '3108 Dancy Street, Austin, TX 78722' },
  { first: 'Brandon',   last: 'Sultemeier',    phone: '(512) 585-4955',email: 'Turket@gmail.com',                 address: '100 Brandon Way, Austin, TX 78733' },
  { first: 'Cara',      last: 'Taylor',        phone: '+14253512337',  email: 'caracollinstaylor@gmail.com',      address: '' },
  { first: 'Michael',   last: 'Thibodeau',     phone: '(512) 699-9887',email: 'Michael.thib@gmail.com',           address: '10005 Cerro Alto Cove, Austin, TX 78733' },
  { first: 'Lin',       last: 'Thomas',        phone: '(512) 366-2055',email: 'aylinthomas@gmail.com',            address: '911 Retama Street, Austin, TX 78704' },
  { first: 'Betny',     last: 'Townsend',      phone: '+19253819743',  email: 'betny.townsend@gmail.com',         address: '2612 Friar Tuck Lane, Austin, TX 78704' },
  { first: 'Emily',     last: 'Travis',        phone: '+12819894538',  email: 'eherren29@yahoo.com',              address: '4109 Hyridge Dr, Austin, TX 78759' },
  { first: 'Amanda',    last: 'Trevino',       phone: '+15126982822',  email: 'trevino.mandy@gmail.com',          address: '' },
  { first: 'Justin',    last: 'Valashinas',    phone: '(310) 227-3095',email: 'Justin.valashinas@gmail.com',      address: '3205 Pickwick Lane, Rollingwood, TX 78746' },
  { first: 'Justin',    last: 'Vasquez',       phone: '(512) 963-3707',email: 'justinvasquez@mac.com',            address: '8117 Long Canyon Drive, Austin, TX 78730' },
  { first: 'Philipp',   last: 'Vitti',         phone: '',              email: 'philipprv01@gmail.com',            address: '' },
  { first: 'Chad',      last: 'Wallis',        phone: '+14053131727',  email: 'chadwallis10@yahoo.com',           address: '3305 Westland Dr, Austin, TX 78704' },
  { first: 'Allie',     last: 'Werner Ash',    phone: '(512) 574-3274',email: 'Alliewernerash@gmail.com',         address: '11301 Poppy Wood Cove, Austin, TX 78748' },
  { first: 'Ron',       last: 'Weston',        phone: '+12108332494',  email: 'Ron.weston@gmail.com',             address: '' },
  { first: 'Drew',      last: 'Williamson',    phone: '+19708463226',  email: 'andrewjwilliamson@comcast.net',    address: '7510 Robert Kleburg Lane, Austin, TX 78749' },
  { first: 'Nick',      last: 'Woodbridge',    phone: '+12145330689',  email: 'nwoodbridge@gmail.com',            address: '1502 Choquette Drive, Austin, TX 78757' },
  { first: 'Ben',       last: 'Wu',            phone: '',              email: 'benkwu@hotmail.com',               address: '1202 Alguno Road, Austin, TX 78757' },
  { first: 'Keith',     last: 'Yeung',         phone: '(425) 770-7176',email: 'keithyeungk@gmail.com',           address: '10500 Avery Club Dr #6, Austin, TX 78717' },
  { first: 'Oleg',      last: 'Zholgo',        phone: '',              email: 'oleg.zhoglo@gmail.com',            address: '620 Goodnight Trail, Dripping Springs, TX 78620' },
  { first: 'Hao',       last: 'Zhu',           phone: '(512) 554-7996',email: 'ebony.zhu@gmail.com',             address: '2019 Vervain Ct, Austin, TX 78733' },
]

// ── Special operational notes ─────────────────────────────────────────────────
const SPECIAL_NOTES = {
  'alaina@atxfs.com':               '[CSV-IMPORT] Contest winner — free trap and 3 months service',
  'Chairstoryhair@gmail.com':        '[CSV-IMPORT] Friends & family pricing',
  'anniejudice@gmail.com':           '[CSV-IMPORT] Gate code: 3330 — enter off Tennison Hill',
  'zkatancik@gmail.com':             '[CSV-IMPORT] Gate code: c157z — permanently log. Give bid for timer. Explain tank: last three weeks, not a month without timer.',
  'srl78704@gmail.com':              '[CSV-IMPORT] Friends & family pricing',
  'Samepage.tx@outlook.com':         '[CSV-IMPORT] Joe is the husband / primary account contact',
  'mattinglyeverafter@gmail.com':    '[CSV-IMPORT] DIY Customer',
  'Clmesser@me.com':                 '[CSV-IMPORT] Two traps at this location',
  'mkpreis7@gmail.com':              '[CSV-IMPORT] Gate code: 4977#',
  'Dschrader95@yahoo.com':           '[CSV-IMPORT] 2 Mosqitter Grand units',
  'Chelstanciu@yahoo.com':           '[CSV-IMPORT] 3 rental traps',
  'Turket@gmail.com':                '[CSV-IMPORT] Has one owned system and rents another. Bring two tanks, two baits.',
  'Ron.weston@gmail.com':            '[CSV-IMPORT] Status: Consultation only — not yet a service customer',
  'andrewjwilliamson@comcast.net':   '[CSV-IMPORT] Combo lock, gate to the right of the house. Code: 10 2822',
  'keithyeungk@gmail.com':           '[CSV-IMPORT] Tank rental starting 4/20',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanPhone(p) {
  if (!p) return ''
  return p.replace(/^'+/, '+').trim()
}

async function upsertContact({ first, last, phone, email, address }) {
  if (!email) return null
  const props = {
    firstname: first,
    lastname: last,
    email: email.toLowerCase(),
  }
  if (phone) props.phone = cleanPhone(phone)
  if (address) props.address = address

  // Search for existing
  const res = await client.crm.contacts.searchApi.doSearch({
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email.toLowerCase() }] }],
    properties: ['email', 'address'],
    limit: 1,
  })

  const existing = res.results?.[0]

  if (existing) {
    // Only update address if they don't have one
    const updateProps = { firstname: first, lastname: last }
    if (phone) updateProps.phone = cleanPhone(phone)
    if (address && !existing.properties?.address?.trim()) updateProps.address = address
    await client.crm.contacts.basicApi.update(existing.id, { properties: updateProps })
    return { id: existing.id, created: false }
  } else {
    const created = await client.crm.contacts.basicApi.create({ properties: props })
    return { id: created.id, created: true }
  }
}

async function addNote(contactId, noteBody) {
  return client.crm.objects.notes.basicApi.create({
    properties: {
      hs_note_body: noteBody,
      hs_timestamp: new Date().toISOString(),
    },
    associations: [{
      to: { id: String(contactId) },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
    }],
  })
}

async function run() {
  let created = 0, updated = 0, skipped = 0, failed = 0
  let notesAdded = 0, notesFailed = 0

  console.log(`\nProcessing ${CONTACTS.length} contacts...\n`)

  for (const contact of CONTACTS) {
    if (!contact.email) {
      console.log(`  SKIP (no email): ${contact.first} ${contact.last}`)
      skipped++
      continue
    }

    try {
      const result = await upsertContact(contact)
      if (!result) { skipped++; continue }

      if (result.created) {
        console.log(`  + CREATED: ${contact.first} ${contact.last} <${contact.email}>`)
        created++
      } else {
        console.log(`  ~ updated: ${contact.first} ${contact.last} <${contact.email}>`)
        updated++
      }

      // Add special note if this contact has one
      const noteKey = Object.keys(SPECIAL_NOTES).find(k => k.toLowerCase() === contact.email.toLowerCase())
      if (noteKey) {
        try {
          await addNote(result.id, SPECIAL_NOTES[noteKey])
          console.log(`    → note: ${SPECIAL_NOTES[noteKey].slice(0, 60)}`)
          notesAdded++
        } catch (e) {
          console.log(`    ✗ note failed: ${e.message}`)
          notesFailed++
        }
      }
    } catch (e) {
      console.log(`  ✗ FAILED: ${contact.first} ${contact.last} <${contact.email}>: ${e.message}`)
      failed++
    }

    await new Promise(r => setTimeout(r, 150)) // stay under rate limit
  }

  console.log('\n─────────────────────────────────────')
  console.log(`Contacts: ${created} created, ${updated} updated, ${skipped} skipped, ${failed} failed`)
  console.log(`Notes:    ${notesAdded} added, ${notesFailed} failed`)
  console.log('Done.')
}

run().catch(console.error)
