"use strict";
const DateHelper = require("./dateHelper.js");
class KWInfo {

  /**
   * Generate new KWInfo
   * @param {Date} date
   */
  constructor(date) {
    // Get Date Objekt from 2021.12.24
    this.date = date;

    // In JavaScript the Sunday has value 0 as return value of getDay() function.
    // So we have to order them first ascending from Monday to Sunday
    // Monday: ((1+6) % 7) = 0
    // Tuesday ((2+6) % 7) = 1
    // Wednesday: ((3+6) % 7) = 2
    // Thursday: ((4+6) % 7) = 3
    // Friday: ((5+6) % 7) = 4
    // Saturday: ((6+6) % 7) = 5
    // Sunday: ((0+6) % 7) = 6
    // (3 - result) is necessary to get the Thursday of the current week.
    // If we want to have Tuesday it would be (1-result)
    const currentThursday = new Date(date.getTime() + (3 - ((date.getDay() + 6) % 7)) * 86400000);
    this.weekstart = new Date(currentThursday);
    this.weekstart.setDate(currentThursday.getDate() - 3);

    this.weekends = new Date(currentThursday);
    this.weekends.setDate(currentThursday.getDate() + 3);

    // At the beginnig or end of a year the thursday could be in another year.
    this.yearOfThursday = currentThursday.getFullYear();

    // Get first Thursday of the year
    const firstThursday = new Date(new Date(this.yearOfThursday, 0, 4).getTime() + (3 - ((new Date(this.yearOfThursday, 0, 4).getDay() + 6) % 7)) * 86400000);

    // +1 we start with week number 1
    // +0.5 an easy and dirty way to round result (in combinationen with Math.floor)
    this.weekNumber = Math.floor(1 + 0.5 + (currentThursday.getTime() - firstThursday.getTime()) / 86400000 / 7);
    this.InfoString = `KW_${this.weekNumber} (${DateHelper.GetGermanDate(this.weekstart)} - ${DateHelper.GetGermanDate(this.weekends)})`;
    this.weekNumberString = this.weekNumber.toString().padStart(2, "0");

  }

}
module.exports = KWInfo;