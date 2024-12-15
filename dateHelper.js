'use strict';

const monthnames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

class DateHelper {
    static Padded(topad) {
        return String(topad).padStart(2, '0');
    }

    /**
     * Returns 'HH:mm'
     *
     * @param date
     * @returns
     */
    static GetTime(date) {
        return `${this.Padded(date.getHours())}:${this.Padded(date.getMinutes())}`;
    }

    /**
     * Returns 'DD'
     *
     * @param date
     * @returns
     */
    static GetDateNumber(date) {
        return this.Padded(date.getDate());
    }
    /**
     * Returns 'MM'
     *
     * @param date
     * @returns
     */
    static GetMonthNumber(date) {
        return this.Padded(date.getMonth() + 1);
    }
    /**
     * Returns 'MMMM' (January, February ...)
     *
     * @param date
     * @returns
     */
    static GetMonthName(date) {
        return monthnames[date.getMonth()];
    }
    /**
     * Returns 'MM'
     *
     * @param monthnumber
     * @returns
     */
    static GetMonthNamefromNumber(monthnumber) {
        return monthnames[monthnumber];
    }

    /**
     * Returns 'DD.MM.YYYY'
     *
     * @param date
     * @returns
     */
    static GetGermanDate(date) {
        return `${DateHelper.GetDateNumber(date)}.${DateHelper.GetMonthName(date)}.${date.getFullYear()}`;
    }
}
module.exports = DateHelper;
