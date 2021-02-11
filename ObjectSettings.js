"use strict";


class ObjectSettings {



    /**
  * Generate new ObjectSettingsClass
  * @param {string} namespace
  * @param {ioBroker.Object } iobrokerObject
  */
    constructor(iobrokerObject, namespace) {

        this.iobrokerObject = iobrokerObject;
        this.namespace = namespace;
        this.lastGoodValue = 0;
        this.FirstWrongValue = Number.NaN;
        this.lastWrongValue = Number.NaN;
        this.counterResetDetetion_CurrentCountAfterReset = 0;
        this.startValues = {};


        this.history_work = Boolean(this.myCustomSettings.history_work)
        this.history_Instanz = String(this.myCustomSettings.history_Instanz)
        this.history_detailed = Boolean(this.myCustomSettings.history_detailed)
        this.history_before = Boolean(this.myCustomSettings.history_before)
        this.history_startvalues = Boolean(this.myCustomSettings.history_startvalues)
        this.historywrite_Instanz = String(this.myCustomSettings.historywrite_Instanz)
    }

    historywrite_Enabled(TimeFrame) {
        return Boolean(this.myCustomSettings["historywrite_Enabled_" + TimeFrame])
    }
    historywrite_MinChange(TimeFrame) {
        return Boolean(this.myCustomSettings["historywrite_MinChange_" + TimeFrame])
    }



    get myCustomSettings() {
        if (this.iobrokerObject.common.custom) {
            return this.iobrokerObject.common.custom[this.namespace];
        }
        return null;
    }

    get alias() {
        let ret = this.myCustomSettings.alias;

        if (ret == null || ret == undefined || ret === "") {
            ret = this.iobrokerObject._id.replace(/[.]/g, "_");
        }
        return String(ret);
    }

    get historyInstanz() { return String(this.myCustomSettings.historyInstanz); }



    get id() { return this.iobrokerObject._id; }

    get counterResetDetetion_CountAfterReset() { return Number(this.myCustomSettings.counterResetDetetion_CountAfterReset); }

    get output_unit() {
        let ret = this.myCustomSettings.output_unit;
        if (ret === null || ret === "" || ret == undefined) {
            ret = this.iobrokerObject.common.unit;
        }
        return ret;

    }
    get output_multiplier() { return Number(this.myCustomSettings.output_multiplier); }

    get counterResetDetection() { return (Boolean)(this.myCustomSettings.counterResetDetection); }



    /**
  * returns the
  * @param {string} TimeFrame
* @returns {boolean}
  */
    detailed(TimeFrame) {
        if (TimeFrame == "Minute" || TimeFrame == "Hour")
            return false;

        let asd = "detailed_" + TimeFrame.toLowerCase() + "s"
        let ret = this.myCustomSettings[asd];
        return ret;

    }
    /**
 * returns the
 * @param {string} TimeFrame
* @returns {boolean}
 */
    detailed_current(TimeFrame) {
        if (TimeFrame == "Minute" || TimeFrame == "Hour")
            return false;

        let asd = "detailed_" + "current_" + TimeFrame.toLowerCase() + "s"
        let ret = this.myCustomSettings[asd];
        return ret;

    }

    /**
  * returns the Count of Current/Previous Datapoints
  * @param {string} TimeFrame
  * @returns {number}
  */
    beforeCount(TimeFrame) {
        return this.myCustomSettings["before_" + TimeFrame.toLowerCase() + "s"];
    }
}
module.exports = ObjectSettings;