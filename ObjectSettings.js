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
        this. initialFinished = false;

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

    get historyload_Detailed() {  return Boolean(this.myCustomSettings.historyload_Detailed); }
    get historyInstanz() { return String( this.myCustomSettings.historyInstanz);}



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
  * Update the iobroker Object
  * @param {ioBroker.Object } iobrokerObject
  */
    updateSettings(iobrokerObject) {
        const OldAlias = this.alias;
        this.iobrokerObject = iobrokerObject;
        if (OldAlias != this.alias)
        {
            this.lastGoodValue = 0;
            this.FirstWrongValue = Number.NaN;
            this.lastWrongValue = Number.NaN;
            this.counterResetDetetion_CurrentCountAfterReset = 0;
            this.initialFinished = false;

        }
        this.initialFinished = false;
    }

    /**
  * returns the
  * @param {string} TimeFrame
  * @returns {boolean}
  */
    detailed(TimeFrame) {
        if (TimeFrame == "Minute" || TimeFrame == "Hour")
            return false;
        return this.myCustomSettings["detailed_" + TimeFrame.toLowerCase() + "s"];

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