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


    this.history_work = Boolean(this.myCustomSettings.history_work);
    this.history_Instanz = String(this.myCustomSettings.history_Instanz);

    this.history_fill_detailed = Boolean(this.myCustomSettings.history_fill_detailed);
    this.history_fill_before = Boolean(this.myCustomSettings.history_fill_before);
    this.history_fill_startvalues = Boolean(this.myCustomSettings.history_fill_startvalues);


    this.history_fill_history_Instanz = String(this.myCustomSettings.history_fill_history_Instanz);
    this.history_writehistory = true;

    this.history_fill_history_enabled = {
      Day: Boolean(this.myCustomSettings[`history_fill_history_Day_enabled`]),
      Week: Boolean(this.myCustomSettings[`history_fill_history_Week_enabled`]),
      Month: Boolean(this.myCustomSettings[`history_fill_history_Month_enabled`]),
      Quarter: Boolean(this.myCustomSettings[`history_fill_history_Quarter_enabled`]),
      Year: Boolean(this.myCustomSettings[`history_fill_history_Year_enabled`]),
      Infinite: Boolean(this.myCustomSettings[`history_fill_history_Infinite_enabled`])

    };
    this.history_fill_history_DPs = {};
    this.history_fill_history_MinChange = {
      Day: Number(this.myCustomSettings[`history_fill_history_Day_MinChange`]),
      Week: Number(this.myCustomSettings[`history_fill_history_Week_MinChange`]),
      Month: Number(this.myCustomSettings[`history_fill_history_Month_MinChange`]),
      Quarter: Number(this.myCustomSettings[`history_fill_history_Quarter_MinChange`]),
      Year: Number(this.myCustomSettings[`history_fill_history_Year_MinChange`]),
      Infinite: Number(this.myCustomSettings[`history_fill_history_Infinite_MinChange`])
    };
    this.history_fill_history_parallelstore = 10;

    this.historyReadoutData = {
      resetsDetected: 0,
      workcounts: {
        analysed: 0,
        analysed_last: 0,
        detailed: 0,
        detailed_last: 0,
        before: 0,
        before_last: 0,
        historyWrite: 0,
        historyWrite_last: 0

      },
      hisstartvalues: {},
      /**
       * @type {historyData | null}
       */
      lastGoodhis: null,
      /**
       * @type {historyData | null}
       */
      firstWronghis: null,
      counterResetDetetion_CurrentCountAfterReset: 0,
      /**
       * @type {historyData | null}
       */
      lastWronghis: null,
      /**
       * @type {historyData | null}
       */
      lastHis: null,
      lastwriteValues: {},
      timeFrameValueData: {
        Day: [],
        Week: [],
        Month: [],
        Quarter: [],
        Year: [],
        Infinite: []
      }

    };
  }



  historywrite_Enabled(TimeFrame) {
    return Boolean(this.myCustomSettings["historywrite_Enabled_" + TimeFrame]);
  }
  historywrite_MinChange(TimeFrame) {
    return Boolean(this.myCustomSettings["historywrite_MinChange_" + TimeFrame]);
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

    const asd = "detailed_" + TimeFrame.toLowerCase() + "s";
    const ret = this.myCustomSettings[asd];
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

    const asd = "detailed_" + "current_" + TimeFrame.toLowerCase() + "s";
    const ret = this.myCustomSettings[asd];
    return ret;

  }

  /**
* returns the Count of Current/Previous Datapoints
* @param {string} TimeFrame
* @returns {number}
*/
  beforeCount(TimeFrame) {
    if (TimeFrame == "Infinite")
      return 0;
    return this.myCustomSettings["before_" + TimeFrame.toLowerCase() + "s"];
  }
}
module.exports = ObjectSettings;