/**
 * Currencies with European Central Bank reference rates plus the euro, with ISO 4217 minor units.
 * The `currencies` table is seeded with exactly this list (checked by a database test).
 */
export const CURRENCIES = [
  { code: 'EUR', minorUnit: 2, nameIt: 'Euro', nameEn: 'Euro' },
  { code: 'USD', minorUnit: 2, nameIt: 'Dollaro statunitense', nameEn: 'US dollar' },
  { code: 'JPY', minorUnit: 0, nameIt: 'Yen giapponese', nameEn: 'Japanese yen' },
  { code: 'CZK', minorUnit: 2, nameIt: 'Corona ceca', nameEn: 'Czech koruna' },
  { code: 'DKK', minorUnit: 2, nameIt: 'Corona danese', nameEn: 'Danish krone' },
  { code: 'GBP', minorUnit: 2, nameIt: 'Sterlina britannica', nameEn: 'Pound sterling' },
  { code: 'HUF', minorUnit: 2, nameIt: 'Fiorino ungherese', nameEn: 'Hungarian forint' },
  { code: 'PLN', minorUnit: 2, nameIt: 'Zloty polacco', nameEn: 'Polish zloty' },
  { code: 'RON', minorUnit: 2, nameIt: 'Leu rumeno', nameEn: 'Romanian leu' },
  { code: 'SEK', minorUnit: 2, nameIt: 'Corona svedese', nameEn: 'Swedish krona' },
  { code: 'CHF', minorUnit: 2, nameIt: 'Franco svizzero', nameEn: 'Swiss franc' },
  { code: 'ISK', minorUnit: 0, nameIt: 'Corona islandese', nameEn: 'Icelandic krona' },
  { code: 'NOK', minorUnit: 2, nameIt: 'Corona norvegese', nameEn: 'Norwegian krone' },
  { code: 'TRY', minorUnit: 2, nameIt: 'Lira turca', nameEn: 'Turkish lira' },
  { code: 'AUD', minorUnit: 2, nameIt: 'Dollaro australiano', nameEn: 'Australian dollar' },
  { code: 'BRL', minorUnit: 2, nameIt: 'Real brasiliano', nameEn: 'Brazilian real' },
  { code: 'CAD', minorUnit: 2, nameIt: 'Dollaro canadese', nameEn: 'Canadian dollar' },
  { code: 'CNY', minorUnit: 2, nameIt: 'Renminbi cinese', nameEn: 'Chinese yuan renminbi' },
  { code: 'HKD', minorUnit: 2, nameIt: 'Dollaro di Hong Kong', nameEn: 'Hong Kong dollar' },
  { code: 'IDR', minorUnit: 2, nameIt: 'Rupia indonesiana', nameEn: 'Indonesian rupiah' },
  { code: 'ILS', minorUnit: 2, nameIt: 'Nuovo siclo israeliano', nameEn: 'Israeli shekel' },
  { code: 'INR', minorUnit: 2, nameIt: 'Rupia indiana', nameEn: 'Indian rupee' },
  { code: 'KRW', minorUnit: 0, nameIt: 'Won sudcoreano', nameEn: 'South Korean won' },
  { code: 'MXN', minorUnit: 2, nameIt: 'Peso messicano', nameEn: 'Mexican peso' },
  { code: 'MYR', minorUnit: 2, nameIt: 'Ringgit malese', nameEn: 'Malaysian ringgit' },
  { code: 'NZD', minorUnit: 2, nameIt: 'Dollaro neozelandese', nameEn: 'New Zealand dollar' },
  { code: 'PHP', minorUnit: 2, nameIt: 'Peso filippino', nameEn: 'Philippine peso' },
  { code: 'SGD', minorUnit: 2, nameIt: 'Dollaro di Singapore', nameEn: 'Singapore dollar' },
  { code: 'THB', minorUnit: 2, nameIt: 'Baht thailandese', nameEn: 'Thai baht' },
  { code: 'ZAR', minorUnit: 2, nameIt: 'Rand sudafricano', nameEn: 'South African rand' },
] as const;

/** ISO 4217 codes of `CURRENCIES`. */
export const CURRENCY_CODES = CURRENCIES.map((currency) => currency.code) as unknown as readonly [
  (typeof CURRENCIES)[number]['code'],
  ...(typeof CURRENCIES)[number]['code'][],
];
/** Supported currency code. */
export type CurrencyCode = (typeof CURRENCIES)[number]['code'];
