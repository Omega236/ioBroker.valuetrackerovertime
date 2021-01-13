"use strict";



class DateHelper {

    static monthnames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];


    static Padded(topad) {
        return String(topad).padStart(2, "0");
    }

    /**
     * Returns 'HH:mm'
     * @param {Date} date
     * @returns {string}
     */
    static GetTime(date) {
        return this.Padded(date.getHours()) + ":" + this.Padded(date.getMinutes());
    }

    /**
     * Returns 'DD'
     * @param {Date} date
     * @returns {string}
     */
    static GetDateNumber(date) {
        return this.Padded(date.getDate());
    }
    /**
     * Returns 'MM'
     * @param {Date} date
     * @returns {string}
     */
    static GetMonthNumber(date) {
        return this.Padded(date.getMonth() + 1);
    }
    /**
     * Returns 'MMMM' (January, February ...)
     * @param {Date} date
     * @returns {string}
     */
    static GetMonthName(date) {
        return monthnames[date.getMonth()];
    }
    /**
     * Returns 'MM'
     * @param {Number} monthnumber
     * @returns {string}
     */
    static GetMonthNamefromNumber(monthnumber) {
        return monthnames[monthnumber];
    }

    /**
     * Returns 'DD.MM.YYYY'
     * @param {Date} date
     * @returns {string}
     */
    static GetGermanDate(date) {
        return `${DateHelper.GetDateNumber(date)}.${DateHelper.GetMonthName(date)}.${date.getFullYear()}`;
    }
}
module.exports = DateHelper;