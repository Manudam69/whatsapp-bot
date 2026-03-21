import { isValidDate, isValidTime } from '../validators'

describe('isValidDate', () => {
  describe('valid dates', () => {
    it.each([
      '15/03/2024',
      '01/01/2000',
      '31/12/1999',
      '28/02/2023', // non-leap year Feb 28
      '29/02/2024', // leap year Feb 29
      '1/1/2024',   // single-digit day/month
      '15-03-2024', // dash separator
      '15.03.2024', // dot separator
      '15/03/24',   // 2-digit year → 2024
    ])('accepts "%s"', (value) => {
      expect(isValidDate(value)).toBe(true)
    })
  })

  describe('invalid dates', () => {
    it.each([
      ['31/02/2024', 'Feb 31 does not exist'],
      ['29/02/2023', 'Feb 29 in non-leap year'],
      ['32/01/2024', 'day > 31'],
      ['00/01/2024', 'day 0'],
      ['15/13/2024', 'month 13'],
      ['15/00/2024', 'month 0'],
      ['99/99/9999', 'completely invalid'],
      ['2024/03/15', 'wrong order (YYYY/MM/DD)'],
      ['15-03',      'missing year'],
      ['abc',        'non-numeric'],
      ['',           'empty string'],
      ['15/3/24/1',  'too many parts'],
    ])('rejects "%s" (%s)', (value) => {
      expect(isValidDate(value)).toBe(false)
    })
  })

  describe('month boundary edge cases', () => {
    it('accepts last day of each 31-day month', () => {
      ;[1, 3, 5, 7, 8, 10, 12].forEach((month) => {
        expect(isValidDate(`31/${String(month).padStart(2, '0')}/2024`)).toBe(true)
      })
    })

    it('rejects day 31 in 30-day months', () => {
      ;[4, 6, 9, 11].forEach((month) => {
        expect(isValidDate(`31/${String(month).padStart(2, '0')}/2024`)).toBe(false)
      })
    })
  })
})

describe('isValidTime', () => {
  describe('valid times', () => {
    it.each([
      '00:00',
      '23:59',
      '14:30',
      '9:05',    // single-digit hour
      '14:30:00', // with seconds
      '23:59:59',
    ])('accepts "%s"', (value) => {
      expect(isValidTime(value)).toBe(true)
    })
  })

  describe('invalid times', () => {
    it.each([
      ['24:00', 'hour 24'],
      ['23:60', 'minute 60'],
      ['-1:00', 'negative hour'],
      ['14:3',  'single-digit minute'],
      ['abc',   'non-numeric'],
      ['',      'empty string'],
      ['14',    'missing minutes'],
    ])('rejects "%s" (%s)', (value) => {
      expect(isValidTime(value)).toBe(false)
    })
  })
})
