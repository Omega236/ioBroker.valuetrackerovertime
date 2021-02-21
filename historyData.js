"use strict";

class historyData {

    /**
     * Generate new historyData
     * @param {Date} ts
     * @param {number} val
     */
    constructor(ts, val) {
        if (typeof ts === "number") {
            if (Number(ts) > 10000) {
                ts = new Date(ts);
            }
        }
        this.val = val;
        this.date = ts;
    }

}
module.exports = historyData;