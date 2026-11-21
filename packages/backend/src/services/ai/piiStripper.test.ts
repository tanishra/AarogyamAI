import { describe, expect, it } from 'vitest';

import { stripPII } from './piiStripper';

/**
 * PII stripper corpus — every case asserts the sensitive substring is gone
 * and (where given) the right category was detected. A leak here means raw
 * PII reaches an LLM provider: these tests must never be weakened.
 */
const PII_CASES: Array<{ input: string; leaked: string; category: string }> = [
  // phone
  { input: 'Call me on 9876543210 anytime', leaked: '9876543210', category: 'phone' },
  { input: 'Reach me at +91 9876543210', leaked: '9876543210', category: 'phone' },
  { input: 'Contact 8123456789 or 9988776655', leaked: '8123456789', category: 'phone' },
  { input: 'Phone +91-7012345678 for reports', leaked: '7012345678', category: 'phone' },
  { input: 'My wife called from 6543210987', leaked: '6543210987', category: 'phone' },

  // email
  { input: 'My email is patient@example.com please', leaked: 'patient@example.com', category: 'email' },
  { input: 'Write to ram.kumar+clinic@hospital.in', leaked: 'ram.kumar+clinic@hospital.in', category: 'email' },
  { input: 'Email REPORTS@LAB.CO.IN for results', leaked: 'REPORTS@LAB.CO.IN', category: 'email' },

  // identifiers
  { input: 'Aadhaar: 1234 5678 9012', leaked: '1234 5678 9012', category: 'aadhaar' },
  { input: 'Aadhaar number 123456789012', leaked: '123456789012', category: 'aadhaar' },
  { input: 'PAN is ABCDE1234F thanks', leaked: 'ABCDE1234F', category: 'pan' },
  { input: 'PAN number ZXCVB5678Q here', leaked: 'ZXCVB5678Q', category: 'pan' },
  { input: 'MRN: HOSP-2024-0892 admitted', leaked: 'HOSP-2024-0892', category: 'mrn' },
  { input: 'UHID 4567XY for billing', leaked: '4567XY', category: 'mrn' },
  { input: 'Patient id: PT-99120 please pull up', leaked: 'PT-99120', category: 'mrn' },
  { input: 'Registration no. ABC123456 done', leaked: 'ABC123456', category: 'mrn' },

  // dates of birth — numeric + spelled months
  { input: 'Born on 15/08/1990', leaked: '15/08/1990', category: 'dob' },
  { input: 'DOB 2-1-85 per records', leaked: '2-1-85', category: 'dob' },
  { input: 'Born 15 March 1982 in a village', leaked: '15 March 1982', category: 'dob_words' },
  { input: 'Date of birth: 2nd Jan 1975', leaked: '2nd Jan 1975', category: 'dob_words' },
  { input: 'Birthday March 15, 1982 noted', leaked: 'March 15, 1982', category: 'dob_words' },
  { input: 'DOB listed as September 3rd, 1968', leaked: 'September 3rd, 1968', category: 'dob_words' },

  // honorific names
  { input: 'I am Dr Sharma and patient is Mrs Gupta', leaked: 'Dr Sharma', category: 'name_prefix' },
  { input: 'Referred by Prof. Ramesh Chandra Verma', leaked: 'Ramesh Chandra Verma', category: 'name_prefix' },
  { input: 'Attended by Kum. Anita Desai today', leaked: 'Anita Desai', category: 'name_prefix' },
  { input: 'Smt. Kamla Devi presented with fever', leaked: 'Kamla Devi', category: 'name_prefix' },

  // contextual names — capitalized
  { input: 'Patient Ramesh Kumar came in', leaked: 'Ramesh Kumar', category: 'name_context' },
  { input: 'My name is Suresh Prasad Yadav', leaked: 'Suresh Prasad Yadav', category: 'name_context' },
  { input: 'I am Anil Kapoor and I have fever', leaked: 'Anil Kapoor', category: 'name_context' },
  { input: 'S/o Mohan Lal, admitted yesterday', leaked: 'Mohan Lal', category: 'name_context' },
  { input: 'W/o Pradeep Singh reports nausea', leaked: 'Pradeep Singh', category: 'name_context' },
  { input: "I'm Kavita Sharma, 34 years old", leaked: 'Kavita Sharma', category: 'name_context' },

  // contextual names — lowercase
  { input: 'my name is ramesh kumar from the village', leaked: 'ramesh kumar', category: 'name_context_lowercase' },
  { input: 'i am suresh and i have chest pain', leaked: 'suresh', category: 'name_context_lowercase' },
  { input: 'called raju for follow-up yesterday', leaked: 'raju', category: 'name_context_lowercase' },
  { input: 'myself anita, reporting headaches', leaked: 'anita', category: 'name_context_lowercase' },
  { input: 'known as chotu in the neighborhood', leaked: 'chotu', category: 'name_context_lowercase' },

  // nicknames
  { input: 'Everyone called Munna knows me', leaked: 'Munna', category: 'nickname' },
  { input: 'He goes by Chotu at home', leaked: 'Chotu', category: 'nickname' },
  { input: 'Nickname Pappu since childhood', leaked: 'Pappu', category: 'nickname' },

  // relatives
  { input: 'My son Rahul has been coughing', leaked: 'Rahul', category: 'relative_name' },
  { input: 'His wife Sita called the clinic', leaked: 'Sita', category: 'relative_name' },
  { input: 'Her daughter Priya is also sick', leaked: 'Priya', category: 'relative_name' },
  { input: 'Brother Vikram drives him here', leaked: 'Vikram', category: 'relative_name' },
  { input: 'Uncle Ramesh paid the bill', leaked: 'Ramesh', category: 'relative_name' },

  // addresses / localities
  { input: 'I live at flat 203 sunrise tower', leaked: '203', category: 'address' },
  { input: 'Address: House No. 45-B near temple', leaked: '45-B', category: 'address' },
  { input: 'Home is 12 Gandhi Nagar extension', leaked: 'Gandhi Nagar', category: 'street_address' },
  { input: 'Lives on 7 MG Road near the market', leaked: 'MG Road', category: 'street_address' },
  { input: 'Flat in Sector 21 colony block', leaked: 'Sector 21', category: 'sector' },
  { input: 'PIN code 110001 for delivery', leaked: '110001', category: 'pincode' },
  { input: 'Postal 462001 Bhopal region', leaked: '462001', category: 'pincode' },
  { input: 'From Rampur village near the river', leaked: 'Rampur', category: 'locality' },
  { input: 'Gaon Sitapur, tehsil Rajpur', leaked: 'Sitapur', category: 'locality' },
  { input: 'Resident of Nashik town since 2010', leaked: 'Nashik', category: 'locality' },
  { input: 'Dist Pune, post office Hadapsar', leaked: 'Pune', category: 'locality' },
  { input: 'She is in Shivpuri district now', leaked: 'Shivpuri', category: 'locality' },

  // facilities
  { input: 'Admitted at Apollo Hospital last week', leaked: 'Apollo Hospital', category: 'facility' },
  { input: 'Transferred to Civil Hospital Rajgarh', leaked: 'Civil Hospital', category: 'facility' },
  { input: 'Referred from Sunrise Nursing Home', leaked: 'Sunrise Nursing Home', category: 'facility' },
  { input: 'Works at Sharma Clinic downtown', leaked: 'Sharma Clinic', category: 'facility' },
  { input: 'Previously evaluated at AIIMS', leaked: 'AIIMS', category: 'facility' },
  { input: 'Scan done at Medanta yesterday', leaked: 'Medanta', category: 'facility' },
  { input: 'Records from Gandhi Medical College', leaked: 'Gandhi Medical College', category: 'facility' },

  // age phrasing
  { input: 'Aged 45 and diabetic', leaked: '45', category: 'age' },
  { input: 'I am a 60-year-old farmer', leaked: '60-year-old', category: 'age' },
  { input: 'She is 8 years old now', leaked: '8 years old', category: 'age' },
  { input: 'Age 72 reported at intake', leaked: '72', category: 'age' },
];

/** Advisory/clinical text that must survive UNMODIFIED. */
const SAFE_CASES: string[] = [
  'Chest pain for two days, worse with exertion',
  'Patient reports taking metformin for a year',
  'Fever 101.4 F since yesterday evening',
  'i am feeling sick and very tired',           // lowercase ctx must not eat verbs
  'called for help when pain worsened',          // "called" + verb, not a name
  'my son is sick',                              // relative without a name
  'came from the hospital yesterday',            // generic facility word
  'he is 5 feet 9 inches tall',                  // height, not an address
  'vomited 4 times since morning',
  'the tablet dissolves under the tongue',
];

describe('stripPII corpus — every sensitive substring must be redacted', () => {
  it.each(PII_CASES.map((c, i) => [i, c] as const))(
    'case %#: %o',
    (_i, { input, leaked, category }) => {
      const result = stripPII(input);
      expect(result.strippedText, `leaked "${leaked}" in: ${result.strippedText}`).not.toContain(leaked);
      expect(result.categoriesFound, `${input} → expected ${category}`).toContain(category);
    },
  );
});

describe('stripPII safe corpus — clinical text must pass through', () => {
  it.each(SAFE_CASES)('%s', (text) => {
    const result = stripPII(text);
    expect(result.strippedText, `over-redacted: ${result.strippedText}`).toBe(text);
    expect(result.categoriesFound).toHaveLength(0);
    expect(result.wasModified).toBe(false);
  });
});

describe('stripPII invariants', () => {
  it('produces a stable sha256 input hash', () => {
    const a = stripPII('some text');
    const b = stripPII('some text');
    expect(a.inputHash).toBe(b.inputHash);
    expect(a.inputHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('finds multiple PII categories in one text', () => {
    const result = stripPII('I am Mr Patel, email patel@test.in, phone 9876543210');
    expect(result.categoriesFound).toContain('phone');
    expect(result.categoriesFound).toContain('email');
    expect(result.categoriesFound).toContain('name_prefix');
  });

  it('throws on empty input', () => {
    expect(() => stripPII('')).toThrow();
  });
});
