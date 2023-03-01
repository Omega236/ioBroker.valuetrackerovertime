"use strict";

/*
* Created with @iobroker/create-adapter v1.27.0
*/

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

const cron = require("node-cron"); // Cron Schedulervar

const ObjectSettings = require("./ObjectSettings.js");
const historyData = require("./historyData.js");
const KWInfo = require("./KWInfo.js");
const DateHelper = require("./dateHelper.js");

const TimeFrames = {
  Minute: "Minute",
  Hour: "Hour",
  Day: "Day",
  Week: "Week",
  Month: "Month",
  Quarter: "Quarter",
  Year: "Year",
  Infinite: "Infinite"
};

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const TimeFramesNumber = {
  Minute: "001",
  Hour: "002",
  Day: "01",
  Week: "02",
  Month: "03",
  Quarter: "04",
  Year: "05",
  Infinite: "06"
};

// Load your modules here, e.g.:
// const fs = require("fs");

class valuetrackerovertime extends utils.Adapter {

  /**
   * @param {Partial<utils.AdapterOptions>} [options={}]
   */
  constructor(options) {
    super({
      ...options,
      name: "valuetrackerovertime",
    });
    this.dicDatas = {};
    this.myObjects = {};
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("objectChange", this.onObjectChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
    this.writeTrimeFrameInfo = true;
    this.historyWrite = 0;
    this.crons = [];

  }





  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {

    await this.subscribeForeignObjectsAsync("*");
    await this.initialObjects();
    this.crons.push(cron.schedule("* * * * *", async () => {
      await this._timeFrameFinished(TimeFrames.Minute);
    }));
    this.crons.push(cron.schedule("0 * * * *", async () => {
      await this._timeFrameFinished(TimeFrames.Hour);
    }));
    this.crons.push(cron.schedule("0 0 * * *", async () => {
      await this._timeFrameFinished(TimeFrames.Day);
    }));
    this.crons.push(cron.schedule("0 0 * * 1", async () => {
      await this._timeFrameFinished(TimeFrames.Week);
    }));
    this.crons.push(cron.schedule("0 0 1 * *", async () => {
      await this._timeFrameFinished(TimeFrames.Month);
    }));
    this.crons.push(cron.schedule("0 0 1 */3 *", async () => {
      await this._timeFrameFinished(TimeFrames.Quarter);
    }));
    this.crons.push(cron.schedule("0 0 1 1 *", async () => {
      await this._timeFrameFinished(TimeFrames.Year);
    }));
    this.crons.push(cron.schedule("0 0 1 1 *", async () => {
      //await this._timeFrameFinished(TimeFrames.Infinite);
    }));

  }

  /**
   * Is called if a subscribed object changes
   * @param {string} id
   * @param {ioBroker.Object | null | undefined} obj
   */
  async onObjectChange(id, obj) {
    await this._initialObject(obj);
  }

  /**
   * Is called if a subscribed state changes
   * @param {string} id
   * @param {ioBroker.State | null | undefined} state
   */
  async onStateChange(id, state) {
    if (state) {
      if (id in this.dicDatas) {
        await this._publishCurrentValue(this.dicDatas[id], new Date(state.ts), await this._getNumberfromState(state));
      }
      else if (id.startsWith(this.namespace) && id.includes("_startValues.start_")) {
        const TimeFrame = id.substring(id.lastIndexOf("_") + 1);
        const idsplit = id.split(".");
        for (const oneoSID in this.dicDatas) {
          /**@type {ObjectSettings} */
          const oS = this.dicDatas[oneoSID];
          if (oS.alias == idsplit[2]) {

            if (state.ack) {
              oS.startValues[TimeFrame] = await this._getNumberfromState(state);
            }
            else {
              this.log.warn(id + " changed, recalc Timeframe, old-Value: " + await this._getStartValue(oS, TimeFrame) + " new-value: " + await this._getNumberfromState(state));
              await this._setStartValue(oS, TimeFrame, await this._getNumberfromState(state));
            }
          }
        }

      }
    }

  }

  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   * @param {() => void} callback
   */
  async onUnload(callback) {
    try {
      await this.unsubscribeForeignStatesAsync("*");
      await this.unsubscribeForeignObjectsAsync("*");
      for (const cron_i in this.crons) {
        const onecron = this.crons[cron_i];
        onecron.destroy();
      }
      callback();
    } catch (e) {
      callback();
    }
  }

  /**
   * Is called if a subscribed object changes
   * @param {string} TimeFrame
   */
  async _timeFrameFinished(TimeFrame) {
    const date = new Date();
    for (const oneOD in this.dicDatas) {
      /** @type {ObjectSettings} */
      const oS = this.dicDatas[oneOD];
      this.log.debug(oS.alias + " TimeFrame " + TimeFrame + " end, insert now previous values ");
      await this._pushNewPreviousSates(oS, TimeFrame, (oS.lastGoodValue - await this._getStartValue(oS, TimeFrame)), await this._getDateTimeInfoForPrevious(TimeFrame, date, 1));
      this.log.debug(oS.alias + " set startValue from TimeFrame " + TimeFrame + " to " + oS.lastGoodValue);
      await this._setStartValue(oS, TimeFrame, oS.lastGoodValue);
    }
  }



  /**
   * Get the Number from Iobroker State
   * @param {ioBroker.State | null | undefined} State
   * @returns {Promise<number>}
   */
  async _getNumberfromState(State) {
    if (State && State.val && !isNaN(Number(State.val))) {
      return Number(State.val);
    }
    return 0;
  }

  /**
   * Read all Objects in iobroker and try to initial every Datapoint (only wenn custom set)
   */
  async initialObjects() {
    this.log.info("inital all Objects");


    const objectschannels = await this.getForeignObjectsAsync(this.namespace + "*", "channel");

    for (const id in objectschannels) {
      await this._setMyObject(id, objectschannels[id]);
    }

    const objectView = await this.getObjectViewAsync("system", "custom", null);
    if (objectView && objectView.rows) {
      for (const counterObjectView in objectView.rows) {
        const oneObjectview = objectView.rows[counterObjectView];
        if (oneObjectview && oneObjectview.value && this.namespace in oneObjectview.value) {
          await this._initialObject(await this.getForeignObjectAsync(oneObjectview.id));
        }
      }
    }
    this.log.info("initial completed");
  }

  async _getObjectAsync(ObjectID) {

    if (!(ObjectID in this.myObjects)) {
      this.myObjects[ObjectID] = await this.getObjectAsync(ObjectID);
    }
    return this.myObjects[ObjectID];
  }

  _setMyObject(id, obj) {
    if (id.startsWith(this.namespace)) {
      this.myObjects[id.substring(this.namespace.length + 1)] = obj;
    }
  }


  /**
   * Try to Initial an Datapoint (if Custom Setting exists, otherwise it is uninitial)
   * @param {ioBroker.Object | null | undefined} iobrokerObject
   * */
  async _initialObject(iobrokerObject) {
    if (iobrokerObject && iobrokerObject != undefined) {
      await this._setMyObject(iobrokerObject._id, iobrokerObject);

      // uninitialize ID
      if (iobrokerObject._id in this.dicDatas) {
        this.log.info("disable : " + iobrokerObject._id);
        await this._setExtendChannel(this.dicDatas[iobrokerObject._id], "", "disabled", true);
        await this.unsubscribeForeignStatesAsync(iobrokerObject._id);
        delete this.dicDatas[iobrokerObject._id];
      }

      // only do something when enabled
      if (iobrokerObject && iobrokerObject.common && iobrokerObject.common.custom && iobrokerObject.common.custom[this.namespace] && iobrokerObject.common.custom[this.namespace].enabled) {
        this.log.info("initial (enabled): " + iobrokerObject._id);
        const oS = new ObjectSettings(iobrokerObject, this.namespace);


        //Check for duplicate Alias
        for (const oneoSIdtoCheck in this.dicDatas) {
          /**@type {ObjectSettings} */
          const oStoCheck = this.dicDatas[oneoSIdtoCheck];
          if (oStoCheck.alias.toLowerCase() == oS.alias.toLowerCase()) {
            this.log.error("The Datapoint " + oS.id + " have the same Alias (" + oS.alias + ") as the Datapoint " + oStoCheck.id + ", " + oS.id + " is now disabled");
            return;
          }
        }

        //Do Subcribe and Create Objects
        await this._generateTreeStructure(oS);
        this.log.debug("subscribeForeignStates " + oS.id);
        await this.subscribeStatesAsync(oS.alias + "._startValues.*");
        await this.subscribeForeignStatesAsync(oS.id);


        //Read out last good value
        const currentval = await this._getNumberfromState(await this.getForeignStateAsync(oS.id));
        const startDay = await this._getStartValue(oS, TimeFrames.Day);
        if (currentval < startDay) {
          oS.lastGoodValue = startDay;
        }
        else {
          oS.lastGoodValue = currentval;
        }


        //HistoryLoad
        if (oS.history_work) {
          iobrokerObject.common.custom[this.namespace].history_work = false;
          await this.setForeignObjectAsync(oS.id, iobrokerObject);

          await this._history_readDataFromHistory(oS);
          return;
        }
        await this._publishCurrentValue(oS, new Date(), currentval);
        this.dicDatas[oS.id] = oS;
        this.log.debug("initial done " + iobrokerObject._id + " -> " + this.namespace + "." + oS.alias);
      }
    }
  }


  /**
   * Pull the before Values one level back and write set the latest with current TimeFrameValue
   * @param {ObjectSettings} oS
   * @param {string} TimeFrame
   * @param {Number} TimeFrameValue
   * @param {string} DateTimeInfo
   */
  async _pushNewPreviousSates(oS, TimeFrame, TimeFrameValue, DateTimeInfo) {
    //Days before befüllen
    let iBeforeCount;
    //Die PreviousValues jeweils ein nach hinten schieben (von hinten anfangen um keine Daten zu verlieren)
    for (iBeforeCount = oS.beforeCount(TimeFrame); iBeforeCount > 1; iBeforeCount--) {
      const theValBefore = await this.getStateAsync(oS.alias + await this._GetObjectIdPrevious(oS, TimeFrame, iBeforeCount - 1));
      const theObjectBefore = await this._getObjectAsync(oS.alias + await this._GetObjectIdPrevious(oS, TimeFrame, iBeforeCount - 1));
      if (theValBefore && theObjectBefore && typeof theValBefore.val === "number") {
        await this._setStateRoundedAsync(oS, await this._GetObjectIdPrevious(oS, TimeFrame, iBeforeCount), theValBefore.val, false);
        await this._setExtendObject(oS, await this._GetObjectIdPrevious(oS, TimeFrame, iBeforeCount), theObjectBefore.common.name.toString(), "value.history." + TimeFrame, true, false, oS.output_unit, "number");
      }
    }
    //den jetzigen previous Wert speichern
    if (oS.beforeCount(TimeFrame) >= 1) {

      await this._setStateRoundedAsync(oS, await this._GetObjectIdPrevious(oS, TimeFrame, iBeforeCount), TimeFrameValue, true);
      await this._setExtendObject(oS, await this._GetObjectIdPrevious(oS, TimeFrame, iBeforeCount), DateTimeInfo, "value.history." + TimeFrame, true, false, oS.output_unit, "number");

    }
  }



  /**
   * Analyse for CounterReset and recalc current TimeFrames
   * @param {ObjectSettings} oS
   * @param {Date} date
   * @param {number} current_value
   */
  async _publishCurrentValue(oS, date, current_value) {

    if (oS.counterResetDetection && current_value < oS.lastGoodValue) {
      //Verringerung erkannt -> neuanpassung der startWerte
      if (Number.isNaN(oS.FirstWrongValue)) {
        oS.FirstWrongValue = current_value;
        oS.counterResetDetetion_CurrentCountAfterReset = 0;
        oS.lastWrongValue = NaN;
      }
      //nur veränderte werte werden gezählt
      if (oS.lastWrongValue != current_value) {
        oS.counterResetDetetion_CurrentCountAfterReset += 1;
        oS.lastWrongValue = current_value;
      }
      // Wenn der counterResetDetetion_CountAfterReset noch nicht erreicht ist, diesen Wert einfach ignorieren
      if (oS.counterResetDetetion_CurrentCountAfterReset <= oS.counterResetDetetion_CountAfterReset) {
        return;
      }

      //Ein Counter-Reset wurde erkannt, passe Startwerte an
      this.log.warn(oS.id + " wurde scheinbar resetet! Reset von " + oS.lastGoodValue + " nach " + current_value + " passe alle Startwerte an");
      const theAnpassung = oS.lastGoodValue - oS.FirstWrongValue;
      oS.lastGoodValue = current_value;

      for (const TimeFrame in TimeFrames) {
        await this._setStartValue(oS, TimeFrame, (await this._getStartValue(oS, TimeFrame) - theAnpassung));
      }
    }
    oS.lastGoodValue = current_value;
    oS.FirstWrongValue = NaN;

    for (const TimeFrame in TimeFrames) {
      await this._calcCurrentTimeFrameValue(oS, date, TimeFrame);
    }


  }

  /**
   * Recalculate the Current and Detailed Values
   * @param {ObjectSettings} oS
   * @param {Date} date
   * @param {string} TimeFrame
   */
  async _calcCurrentTimeFrameValue(oS, date, TimeFrame) {
    const TimeFrame_value = (oS.lastGoodValue - await this._getStartValue(oS, TimeFrame));
    //Set Current_TimeframeValue
    if (oS.beforeCount(TimeFrame) >= 0) {
      await this._setStateRoundedAsync(oS, await this._getObjectIDCurrent(TimeFrame), TimeFrame_value, true);
    }
    //Set Detailed
    await this._CreateAndSetObjectIdDetailed(oS, TimeFrame, date, TimeFrame_value);
  }


  /**
   * round and set the State in iobroker
   * @param {ObjectSettings} oS
   * @param {string} id
   * @param {number} value
   * @param {boolean} outputMultiplie
   */
  async _setStateRoundedAsync(oS, id, value, outputMultiplie) {
    if (value) {

      if (outputMultiplie) {
        value *= oS.output_multiplier;
      }
      value = Number((value).toFixed(10));

    }
    await this.setStateAsync(oS.alias + id, value, true);

  }

  /**
   * returns the quarter of the date
   * @param {Date} date
   */
  _getQuarter(date) {
    return Math.ceil((date.getMonth() + 1) / 3);

  }


  /**
   * create for every enabled object the needed current, history and before Datapoints
   * @param {ObjectSettings} oS
   */
  async _generateTreeStructure(oS) {
    await this._setExtendChannel(oS, "", "CounterData for " + oS.id, true);
    await this._setExtendObject(oS, "._counterID", "ObjectID", "", true, false, null, "string");
    await this.setStateAsync(oS.alias + "._counterID", oS.id, true);
    await this._setExtendChannel(oS, "._startValues", "startValues for TimeFrames", true);


    for (const TimeFrame in TimeFrames) {
      //Current_DP erzeugen/anpassen
      if (oS.beforeCount(TimeFrame) >= 0) {
        await this._setExtendObject(oS, await this._getObjectIDCurrent(TimeFrame), "Current " + TimeFrame, "value.Current." + TimeFrame, true, false, oS.output_unit, "number");
      }
      else {
        await this._setExtendObject(oS, await this._getObjectIDCurrent(TimeFrame), "Disabled", "value.Current.disabled", false, false, oS.output_unit, "number");
      }
      //Before erzeugen bzw leeren
      let iBefore = 1;
      for (iBefore = 1; iBefore <= oS.beforeCount(TimeFrame); iBefore++) {
        const thePreviousID = await this._GetObjectIdPrevious(oS, TimeFrame, iBefore);
        const oldObject = await this._getObjectAsync(oS.alias + thePreviousID);
        let touseName = "no data yet";
        if (oldObject) {
          touseName = oldObject.common.name.toString();
        }
        await this._setExtendObject(oS, await this._GetObjectIdPrevious(oS, TimeFrame, iBefore), touseName, "value.history." + TimeFrame, true, false, oS.output_unit, "number");
      }
      //Before Objecte die existieren aber nicht mehr aktiv sind auf diabled stellen
      let theObject = await this._getObjectAsync(oS.alias + await this._GetObjectIdPrevious(oS, TimeFrame, iBefore));
      while (theObject != null) {
        await this._setExtendObject(oS, await this._GetObjectIdPrevious(oS, TimeFrame, iBefore), theObject.common.name.toString(), "value.history.disabled", false, false, oS.output_unit, "number");
        iBefore++;
        theObject = await this._getObjectAsync(oS.alias + await this._GetObjectIdPrevious(oS, TimeFrame, iBefore));
      }
      //CurrentYear Detailed erzeugen
      const oneDateThisYear = new Date();
      if (oS.detailed_current(TimeFrame)) {
        for (let i = 0; i < 366; i++) {
          oneDateThisYear.setDate(oneDateThisYear.getDate() - 1);
          await this._CreateAndGetObjectIdDetailedCurrent(oS, TimeFrame, oneDateThisYear);
        }
      }
    }
  }

  /**
   * Change or Create a iobroker Object if it is necessary
   * @param {ObjectSettings} oS
   * @param {string} id
   * @param {string} name
   * @param {string} role
   * @param {boolean} createIfnotExists
   * @param {boolean} writeable
   * @param {string | null} writeable
   * @param {'number' | 'string' | 'boolean' | 'array' | 'object' | 'mixed' | 'file'} type
   */
  async _setExtendObject(oS, id, name, role, createIfnotExists, writeable, unit, type) {
    name = await this._replaceTimeFrameInfo(name, id);
    if (!name.includes(" (" + oS.alias + ")")) {
      name += " (" + oS.alias + ")";
    }
    let theObject = await this._getObjectAsync(oS.alias + id);
    if (theObject == null || theObject.common.name != name || theObject.common.role != role || theObject.common.unit != unit || theObject.common.write != writeable || theObject.common.type != type) {
      if (createIfnotExists || theObject != null) {
        if (theObject == null || theObject == undefined) {
          theObject = {
            type: "state",
            common: {
              desc: `Created by ${this.namespace}`
            },
            native: {}
          };
        }
        theObject.type = "state";
        theObject.common.name = name;
        theObject.common.role = role;
        theObject.common.type = type;
        theObject.common.unit = unit;
        theObject.common.write = writeable;
        theObject.common.read = true;

        await this.setObjectAsync(oS.alias + id, theObject);
        this.myObjects[oS.alias + id] = await this._getObjectAsync(oS.alias + id);

      }
    }

  }

  /**
   * Replace the Timeframe info on Datapoints with variable data (previous and Current History) with static Text (reduce ObjectChanges)
   * @param {string} name
   * @param {string} id
   */
  async _replaceTimeFrameInfo(name, id) {
    if (this.writeTrimeFrameInfo == false) {
      if (name.startsWith("Timeframe ") && !id.startsWith("20")) {
        name = id.split(".").join(" ");
      }
    }
    return name;
  }
  /**
   * Change or Create a iobroker Channel if necessary
   * @param {ObjectSettings} oS
   * @param {string} id
   * @param {string} name
   * @param {boolean} createIfnotExists
   */
  async _setExtendChannel(oS, id, name, createIfnotExists) {
    name = await this._replaceTimeFrameInfo(name, id);
    if (!name.includes(" (" + oS.alias + ")")) {
      name += " (" + oS.alias + ")";
    }
    let theObject = await this._getObjectAsync(oS.alias + id);
    if (theObject == null || theObject == undefined || theObject.common.name != name || theObject.type != "channel") {
      if (createIfnotExists || theObject != null) {
        if (theObject == null || theObject == undefined) {
          theObject = {
            common: {
              desc: `Created by ${this.namespace}`
            },
            native: {}
          };
        }
        theObject.common.name = name;
        theObject.type = "channel";

        await this.setObjectAsync(oS.alias + id, theObject);

        this.myObjects[oS.alias + id] = await this._getObjectAsync(oS.alias + id);

      }


    }


  }

  /**
   * Build the ObjectID String for Previous Datapoints
   * @param {ObjectSettings} oS
   * @param {string} TimeFrame
   * @param {number} beforeCounter
   */
  async _GetObjectIdPrevious(oS, TimeFrame, beforeCounter) {
    if (oS.beforeCount(TimeFrame) > 0)
      await this._setExtendChannel(oS, "." + TimeFramesNumber[TimeFrame] + "_previous" + TimeFrame + "s", TimeFrame + "s Before", true);
    else {
      //Channel Auf disabled setzen wenn es bereits gibt
      await this._setExtendChannel(oS, "." + TimeFramesNumber[TimeFrame] + "_previous" + TimeFrame + "s", "disabled", false);
    }

    const theID = "." + TimeFramesNumber[TimeFrame] + "_previous" + TimeFrame + "s.Before_" + beforeCounter.toString().padStart(2, "0") + "_" + TimeFrame;
    return theID;

  }

  /**
   * Build a string for DatapointName for a Previous DP
   * @param {string} TimeFrame
   * @param {Date} theDate
   */
  async _getDateTimeInfoForPrevious(TimeFrame, theDate, beforeZähler) {

    const newdate = await this._dateChangeTimeFrame(TimeFrame, theDate, beforeZähler * -1);
    return await this._getTimeFrameInfo(TimeFrame, newdate);
  }


  /**
   * Build a string for DatapointName
   * @param {string} TimeFrame
   * @param {Date} theDate
   */
  async _getTimeFrameInfo(TimeFrame, theDate) {
    let ret = "";

    if (TimeFrame == TimeFrames.Minute) {
      ret = "minute " + DateHelper.GetTime(theDate);
    } else if (TimeFrame == TimeFrames.Hour) {
      ret = "hour " + DateHelper.GetTime(theDate);
    } else if (TimeFrame == TimeFrames.Day) {
      ret = `${DateHelper.GetDateNumber(theDate)} ${DateHelper.GetMonthName(theDate)} ${theDate.getFullYear()}`;
    } else if (TimeFrame == TimeFrames.Week) {
      const theKW = new KWInfo(theDate);
      ret = theKW.InfoString;
    }
    else if (TimeFrame == TimeFrames.Month) {
      ret = `${DateHelper.GetMonthName(theDate)} ${theDate.getFullYear()}`;
    }
    else if (TimeFrame == TimeFrames.Quarter) {
      const myquarter = await this._getQuarter(theDate);
      ret = "quarter " + myquarter + " ";
      ret += DateHelper.GetMonthNamefromNumber((myquarter - 1) * 3 + 0) + ",";
      ret += DateHelper.GetMonthNamefromNumber((myquarter - 1) * 3 + 1) + ",";
      ret += DateHelper.GetMonthNamefromNumber((myquarter - 1) * 3 + 2) + " ";
      ret += " " + theDate.getFullYear();
    }
    else if (TimeFrame == TimeFrames.Year) {
      ret = "year " + theDate.getFullYear().toString();
    }
    else if (TimeFrame == TimeFrames.Infinite) {
      ret = "Infinite";
    }
    return "Timeframe " + ret;
  }

  /**
   * Build a substring for ObjectID
   * @param {string} TimeFrame
   * @param {Date} theDate
   */
  async _getTimeFrameObjectID(TimeFrame, theDate) {

    if (TimeFrame == TimeFrames.Minute) {
      return "not valid";
    } else if (TimeFrame == TimeFrames.Hour) {
      return "not valid";
    } else if (TimeFrame == TimeFrames.Day) {
      return DateHelper.GetDateNumber(theDate);
    } else if (TimeFrame == TimeFrames.Week) {
      const theKW = new KWInfo(theDate);
      return "KW" + theKW.weekNumberString;
    }
    else if (TimeFrame == TimeFrames.Month) {
      return DateHelper.GetMonthNumber(theDate) + "_" + DateHelper.GetMonthName(theDate);
    }
    else if (TimeFrame == TimeFrames.Quarter) {
      return "quater_" + await this._getQuarter(theDate);
    }
    else if (TimeFrame == TimeFrames.Year) {
      return TimeFramesNumber.Year + "_Year_" + theDate.getFullYear();
    }
    else if (TimeFrame == TimeFrames.Infinite) {
      return TimeFramesNumber.Year + "_Infinite";
    }
    return "";
  }


  /**
   * Create and Fill Detailed Datapoints (Current year and Detailed)
   * @param {ObjectSettings} oS
   * @param {string} TimeFrame
   * @param {Date} date
   * @param {number} TimeFrame_value
   */
  async _CreateAndSetObjectIdDetailed(oS, TimeFrame, date, TimeFrame_value) {
    const a = await this._CreateAndGetObjectIdDetailed(oS, TimeFrame, date);
    if (a)
      await this._setStateRoundedAsync(oS, a, TimeFrame_value, true);
    const b = await this._CreateAndGetObjectIdDetailedCurrent(oS, TimeFrame, date);
    if (b)
      await this._setStateRoundedAsync(oS, b, TimeFrame_value, true);
  }

  /**
  * Creates the needed TreeStructure and returns the Id after alias-name
  * @param {ObjectSettings} oS
  * @param {string} TimeFrame
  * @param {Date} date
  * */
  async _CreateAndGetObjectIdDetailed(oS, TimeFrame, date) {
    if (oS.detailed(TimeFrame)) {
      let mydetailedObjectId = "";

      mydetailedObjectId = "." + date.getFullYear();
      await this._setExtendChannel(oS, mydetailedObjectId, String(date.getFullYear()), true);
      if (TimeFrame == TimeFrames.Infinite) {
        //nothing to do
      }
      else if (TimeFrame == TimeFrames.Year) {
        mydetailedObjectId = mydetailedObjectId + "." + await this._getTimeFrameObjectID(TimeFrames.Year, date);
        await this._setExtendObject(oS, mydetailedObjectId, await this._getTimeFrameInfo(TimeFrames.Year, date), "value.history." + TimeFrame, true, false, oS.output_unit, "number");
      }
      else {
        mydetailedObjectId = mydetailedObjectId + "." + TimeFramesNumber[TimeFrame] + "_" + TimeFrame + "s";
        await this._setExtendChannel(oS, mydetailedObjectId, TimeFrame + "s", true);
        if (TimeFrame == TimeFrames.Day) {
          mydetailedObjectId = mydetailedObjectId + "." + await this._getTimeFrameObjectID(TimeFrames.Month, date);
          await this._setExtendChannel(oS, mydetailedObjectId, await this._getTimeFrameInfo(TimeFrames.Month, date), true);
          mydetailedObjectId = mydetailedObjectId + "." + await this._getTimeFrameObjectID(TimeFrames.Day, date);
          await this._setExtendObject(oS, mydetailedObjectId, await this._getTimeFrameInfo(TimeFrames.Day, date), "value.history." + TimeFrame, true, false, oS.output_unit, "number");
        }
        if (TimeFrame == TimeFrames.Week) {
          const theKWInfo = new KWInfo(date);
          if (date.getFullYear() != theKWInfo.yearOfThursday) {
            mydetailedObjectId.replace(date.getFullYear().toString(), theKWInfo.yearOfThursday.toString());
          }
          mydetailedObjectId = mydetailedObjectId + "." + await this._getTimeFrameObjectID(TimeFrames.Week, date);
          await this._setExtendObject(oS, mydetailedObjectId, await this._getTimeFrameInfo(TimeFrames.Week, date), "value.history." + TimeFrame, true, false, oS.output_unit, "number");
        }
        if (TimeFrame == TimeFrames.Month) {
          mydetailedObjectId = mydetailedObjectId + "." + await this._getTimeFrameObjectID(TimeFrames.Month, date);
          await this._setExtendObject(oS, mydetailedObjectId, await this._getTimeFrameInfo(TimeFrames.Month, date), "value.history." + TimeFrame, true, false, oS.output_unit, "number");
        }
        if (TimeFrame == TimeFrames.Quarter) {
          mydetailedObjectId = mydetailedObjectId + "." + await this._getTimeFrameObjectID(TimeFrames.Quarter, date);
          await this._setExtendObject(oS, mydetailedObjectId, await this._getTimeFrameInfo(TimeFrames.Quarter, date), "value.history." + TimeFrame, true, false, oS.output_unit, "number");
        }
      }

      return mydetailedObjectId;
    }
    return null;
  }

  /**
* Creates the needed TreeStructure and returns the Id after alias-name
* @param {string} TimeFrame
* @param {Date} date
*/
  async _getTimeFrameBeginn(TimeFrame, date) {
    const Checkdate = new Date(date);
    Checkdate.setMilliseconds(0);
    Checkdate.setSeconds(0);

    if (TimeFrame == TimeFrames.Minute) {
      return Checkdate;
    }
    Checkdate.setMinutes(0);
    if (TimeFrame == TimeFrames.Hour) {
      return Checkdate;
    }
    Checkdate.setHours(0);
    if (TimeFrame == TimeFrames.Day) {
      return Checkdate;
    }
    if (TimeFrame == TimeFrames.Week) {
      Checkdate.setDate(Checkdate.getDate() - (Checkdate.getDay() == 0 ? 6 : Checkdate.getDay() - 1));
      return Checkdate;
    }
    Checkdate.setDate(1);

    if (TimeFrame == TimeFrames.Month) {
      return Checkdate;
    }

    if (TimeFrame == TimeFrames.Quarter) {

      Checkdate.setMonth(Checkdate.getMonth() - (Checkdate.getMonth() % 3));
      return Checkdate;
    }
    Checkdate.setMonth(0);

    if (TimeFrame == TimeFrames.Year) {
      return Checkdate;
    }
    Checkdate.setFullYear(1990);

    if (TimeFrame == TimeFrames.Infinite) {
      return Checkdate;
    }
    return Checkdate;



  }

  /**
  * Creates the needed TreeStructure and returns the Id after alias-name, returns null if date not should write in current
  * @param {ObjectSettings} oS
  * @param {string} TimeFrame
  * @param {Date} date
  * */
  async _CreateAndGetObjectIdDetailedCurrent(oS, TimeFrame, date) {
    if (oS.detailed_current(TimeFrame)) {
      let mydetailedObjectId = "";
      let endOfTimeFrame = await this._getTimeFrameBeginn(TimeFrame, new Date());
      endOfTimeFrame = await this._dateChangeTimeFrame(TimeFrame, endOfTimeFrame, 1);
      endOfTimeFrame.setMilliseconds(-1);

      const currentDataRelevantBegin = new Date(endOfTimeFrame);
      if (TimeFrame != TimeFrames.Year) {
        mydetailedObjectId = mydetailedObjectId + "." + TimeFramesNumber[TimeFrame] + "_" + TimeFrame + "s";
        await this._setExtendChannel(oS, mydetailedObjectId, TimeFrame + "s", true);
        if (TimeFrame == TimeFrames.Day) {
          if (date >= await this._dateChangeTimeFrame(TimeFrames.Day, endOfTimeFrame, -7)) {
            let myDayNumber = date.getDay();
            if (myDayNumber == 0)
              myDayNumber = 7;
            mydetailedObjectId = mydetailedObjectId + "." + myDayNumber + "_" + days[date.getDay()];
            await this._setExtendObject(oS, mydetailedObjectId, await this._getTimeFrameInfo(TimeFrames.Day, date), "value.currenthistory." + TimeFrame, true, false, oS.output_unit, "number");
            return mydetailedObjectId;
          }
        }
        if (TimeFrame == TimeFrames.Week) {
          currentDataRelevantBegin.setFullYear(currentDataRelevantBegin.getFullYear() - 1);
          if (date >= currentDataRelevantBegin) {
            {
              mydetailedObjectId = mydetailedObjectId + "." + await this._getTimeFrameObjectID(TimeFrames.Week, date);
              await this._setExtendObject(oS, mydetailedObjectId, await this._getTimeFrameInfo(TimeFrames.Week, date), "value.currenthistory." + TimeFrame, true, false, oS.output_unit, "number");
              return mydetailedObjectId;

            }
          }
        }
        if (TimeFrame == TimeFrames.Month) {
          currentDataRelevantBegin.setFullYear(currentDataRelevantBegin.getFullYear() - 1);
          if (date >= currentDataRelevantBegin) {

            mydetailedObjectId = mydetailedObjectId + "." + await this._getTimeFrameObjectID(TimeFrames.Month, date);
            await this._setExtendObject(oS, mydetailedObjectId, await this._getTimeFrameInfo(TimeFrames.Month, date), "value.currenthistory." + TimeFrame, true, false, oS.output_unit, "number");
            return mydetailedObjectId;
          }
        }

        if (TimeFrame == TimeFrames.Quarter) {
          currentDataRelevantBegin.setFullYear(currentDataRelevantBegin.getFullYear() - 1);
          if (date >= currentDataRelevantBegin) {

            mydetailedObjectId = mydetailedObjectId + "." + await this._getTimeFrameObjectID(TimeFrames.Quarter, date);
            await this._setExtendObject(oS, mydetailedObjectId, await this._getTimeFrameInfo(TimeFrames.Quarter, date), "value.currenthistory." + TimeFrame, true, false, oS.output_unit, "number");
            return mydetailedObjectId;
          }
        }


      }
    }
    return null;
  }



  /**
   * returns the ObjectID for Current Timeframe
   * @param {string} TimeFrame
   */
  async _getObjectIDCurrent(TimeFrame) {
    return "." + TimeFramesNumber[TimeFrame] + "_current" + TimeFrame;
  }

  /**
   * save the start-value
   * @param {ObjectSettings} oS
   * @param {string} TimeFrame
   * @param {number} value
   */
  async _setStartValue(oS, TimeFrame, value) {
    oS.startValues[TimeFrame] = value;
    await this._setStateRoundedAsync(oS, await this._getStartID(TimeFrame), value, false);
    await this._calcCurrentTimeFrameValue(oS, new Date(), TimeFrame);

  }
  /**
   * Returns the startid
   * @param {string} TimeFrame
   */
  async _getStartID(TimeFrame) {
    return "._startValues.start_" + TimeFramesNumber[TimeFrame] + "_" + TimeFrame;
  }


  /**
   * Returns the StartVaalue of the current Timeframe
   * @param {ObjectSettings} oS
   * @param {string} TimeFrame
   */
  async _getStartValue(oS, TimeFrame) {
    //Create the DP if not exists
    if ((TimeFrame in oS.startValues)) {
      return oS.startValues[TimeFrame];
    } else {
      const startID = await this._getStartID(TimeFrame);

      await this._setExtendObject(oS, startID, "start_" + TimeFrame, "", true, true, oS.iobrokerObject.common.unit, "number");
      //set startData if not set
      const state = await this.getStateAsync(oS.alias + startID);
      if (state && state.val != null && !isNaN(Number(state.val))) {
        oS.startValues[TimeFrame] = Number(state.val);
      }
      else {
        const currentValue = await this._getNumberfromState(await this.getForeignStateAsync(oS.id));
        await this._setStateRoundedAsync(oS, startID, currentValue, false);
        oS.startValues[TimeFrame] = currentValue;
      }

    }
    return oS.startValues[TimeFrame];

  }



  /**
   * Check and store Data to the history-Instance of the Current_DP
   * @param {ObjectSettings} oS
   * @param {Number} ts
   * @param {String} TimeFrame
   * @param {boolean} isTimeFrameChange
   */
  async _history_fill_history(oS, ts, TimeFrame, isTimeFrameChange) {
    if (oS.history_fill_history_enabled[TimeFrame] && oS.historyReadoutData.lastGoodhis) {

      const val = (oS.historyReadoutData.lastGoodhis.val - oS.historyReadoutData.hisstartvalues[TimeFrame]) * oS.output_multiplier;
      if (isTimeFrameChange || Math.abs(val - oS.historyReadoutData.lastwriteValues[TimeFrame]) >= oS.history_fill_history_MinChange[TimeFrame]) {


        if (this.historyWrite % oS.history_fill_history_parallelstore == 0) {
          await this.sendToAsync(oS.history_fill_history_Instanz, "query", "");
        }
        const state = [{ val: val, ts: ts }];
        if (isTimeFrameChange) {
          state.push({ val: 0, ts: ts + 1 });
        }
        await this.sendToAsync(oS.history_fill_history_Instanz, "storeState",
          {
            id: oS.history_fill_history_DPs[TimeFrame],
            state: state
          });
        this.historyWrite += 1;
        oS.historyReadoutData.lastwriteValues[TimeFrame] = val;
        oS.historyReadoutData.workcounts.historyWrite += state.length;

      }
    }
  }

  /**
   * read DetailedData from History Instanz and analyse it
   * @param {ObjectSettings} oS
   */
  async _history_readDataFromHistory(oS) {
    //Read the history-Instances if empty

    if (!oS.history_Instanz || oS.history_Instanz == "") {
      const system_config = await this.getForeignObjectAsync("system.config");
      if (system_config) {
        oS.history_Instanz = system_config.common.defaultHistory;
      }
    }
    if (!oS.history_fill_history_Instanz || oS.history_fill_history_Instanz == "") {
      oS.history_fill_history_Instanz = oS.history_Instanz;
    }
    this.log.info("HistoryAnalyse " + oS.id + ": Query from Storage Instance  '" + oS.history_Instanz + "' all Data (if not working after this please check the instance is active) ");

    const end = Date.now();
    const start = end - 100 * 365 * 24 * 3600000;

    const gethistory = await this.sendToAsync(oS.history_Instanz, "getHistory", {
      id: oS.id,
      options: {
        end: end,
        start: start,
        count: 1000000000,
        aggregate: "none"
      }
    });

    if (gethistory) {
      if (gethistory["error"]) {
        this.log.error("HistoryAnalyse " + oS.id + ": Fehler bei Datenlesen: " + gethistory["error"]);
      }
      else if (gethistory["result"]) {
        this.log.info("HistoryAnalyse " + oS.id + ": wandle SQL Datensätze um: " + gethistory["result"].length);
        const allData = [];
        for (const one in gethistory["result"]) {
          allData.push(new historyData(gethistory["result"][one].ts, gethistory["result"][one].val));
        }
        allData.push(new historyData(new Date(), oS.lastGoodValue));
        await this._history_DoAnalyseHistoryData(oS, allData);

      }
    }
    else {
      this.log.warn("no Response from Instance (active and exists?)");
    }


  }



  /**
   * Checks if a TimeFrame-Jump happend with the MyHisDate, if happend it write the detailed, before and history
   * @param {ObjectSettings} oS
   * @param {string} TimeFrame
   * @param {Date} MyHisDate
   * */
  async _history_TimeFrameDetection(oS, TimeFrame, MyHisDate) {
    if (oS.historyReadoutData.lastGoodhis && oS.historyReadoutData.lastHis) {
      if (MyHisDate.getDate() == oS.historyReadoutData.lastHis.date.getDate() && MyHisDate.getFullYear() == oS.historyReadoutData.lastHis.date.getFullYear() && MyHisDate.getMonth() == oS.historyReadoutData.lastHis.date.getMonth()) {
        // wenn gleicher Tag wie vorheriges datum, dann kann kein TimeFrameWechsel sein
        return;
      }
      const startForMyHisDate = await this._getTimeFrameBeginn(TimeFrame, MyHisDate);
      let startForOldTimeframe = await this._getTimeFrameBeginn(TimeFrame, oS.historyReadoutData.lastHis.date);

      while (startForOldTimeframe < startForMyHisDate) {
        const TimeFrameValue = (oS.historyReadoutData.lastGoodhis.val - oS.historyReadoutData.hisstartvalues[TimeFrame]);
        if (oS.history_fill_detailed) {
          //Detailed setzen
          await this._CreateAndSetObjectIdDetailed(oS, TimeFrame, startForOldTimeframe, TimeFrameValue);
          oS.historyReadoutData.workcounts.detailed += 1;
        }
        if (oS.history_fill_before) {
          //liste füllen (für before-Data)
          oS.historyReadoutData.timeFrameValueData[TimeFrame].push({ date: new Date(startForOldTimeframe), value: TimeFrameValue });
        }

        startForOldTimeframe = await this._dateChangeTimeFrame(TimeFrame, startForOldTimeframe, 1);
        await this._history_fill_history(oS, startForOldTimeframe.getTime() - 1, TimeFrame, true);
        oS.historyReadoutData.hisstartvalues[TimeFrame] = oS.historyReadoutData.lastGoodhis.val;
      }

    }



  }


  /**
   *  Adds or Remove Timeframes from Date
   * @param {String} TimeFrame
   * @param {Date} theDate
   * @param {number} numberofChange
   */
  async _dateChangeTimeFrame(TimeFrame, theDate, numberofChange) {
    const newdate = new Date(theDate);
    if (TimeFrame == TimeFrames.Minute) {
      newdate.setMinutes(newdate.getMinutes() + numberofChange);
    } else if (TimeFrame == TimeFrames.Hour) {
      newdate.setHours(newdate.getHours() + numberofChange);
    } else if (TimeFrame == TimeFrames.Day) {
      newdate.setDate(newdate.getDate() + numberofChange);
    } else if (TimeFrame == TimeFrames.Week) {
      newdate.setDate(newdate.getDate() + (7 * numberofChange));
    } else if (TimeFrame == TimeFrames.Month) {
      newdate.setMonth(newdate.getMonth() + numberofChange);
    } else if (TimeFrame == TimeFrames.Quarter) {
      newdate.setMonth(newdate.getMonth() + (numberofChange * 3));
    } else if (TimeFrame == TimeFrames.Year) {
      newdate.setFullYear(newdate.getFullYear() + numberofChange);
    } else if (TimeFrame == TimeFrames.Infinite) {
      newdate.setFullYear(newdate.getFullYear() + numberofChange * 1000);
    }
    return newdate;
  }

  /**
   * Use the Data to Fill the Datastructure Detailed
   * @param {ObjectSettings} oS
   * @param {Array<historyData>} historyDataList
   */
  async _history_DoAnalyseHistoryData(oS, historyDataList) {
    this.log.info("HistoryAnalyse " + oS.id + ": Verarbeite " + historyDataList.length + " History Datensätze ");

    // Needed for Logging
    const logEveryMS = 10000;
    let lastlog = Date.now();
    let writenextLog = Date.now() + 1000;
    const startWorking = Date.now();


    // set the first History-data for the lastGoodhis and lasHis
    oS.historyReadoutData.lastGoodhis = historyDataList[0];
    oS.historyReadoutData.lastHis = historyDataList[0];


    // The first history-value is the Start-Value for every Timeframe
    for (const TimeFrame in TimeFrames) {
      oS.historyReadoutData.hisstartvalues[TimeFrame] = historyDataList[0].val;
    }

    //Check the history_fill_history Settings
    for (const TimeFrame in TimeFrames) {

      // The ID of the current-DP
      oS.history_fill_history_DPs[TimeFrame] = this.namespace + "." + oS.alias + await this._getObjectIDCurrent(TimeFrame);

      //Check instance is enabled
      if (oS.history_fill_history_enabled[TimeFrame]) {
        const curobj = await this.getForeignObjectAsync(oS.history_fill_history_DPs[TimeFrame]);
        if (!(curobj && curobj.common.custom && curobj.common.custom[oS.history_fill_history_Instanz] && curobj.common.custom[oS.history_fill_history_Instanz].enabled)) {
          this.log.warn(`history_fill: ${oS.history_fill_history_DPs[TimeFrame]} history should be filled, but Instance ${oS.history_fill_history_Instanz} is not enabled`);
          oS.history_fill_history_enabled[TimeFrame] = false;
        }
      }
      //Read MinChange from DP
      if (oS.history_fill_history_enabled[TimeFrame] && oS.history_fill_history_MinChange[TimeFrame] == 0) {
        const curobj = await this.getForeignObjectAsync(oS.history_fill_history_DPs[TimeFrame]);
        if (curobj && curobj.common.custom && curobj.common.custom[oS.history_fill_history_Instanz] && curobj.common.custom[oS.history_fill_history_Instanz].changesMinDelta) {
          oS.history_fill_history_MinChange[TimeFrame] = curobj.common.custom[oS.history_fill_history_Instanz].changesMinDelta;
          this.log.info(`readout Minchange ${oS.history_fill_history_MinChange[TimeFrame]} from dp ${oS.history_fill_history_DPs[TimeFrame]}`);
        }
      }
      //Delete old Data from History
      oS.historyReadoutData.lastwriteValues[TimeFrame] = -1000;
      await this.sendToAsync(oS.history_Instanz, "deleteRange", [
        { id: oS.history_fill_history_DPs[TimeFrame], start: historyDataList[0].date.getTime(), end: (new Date().getTime()) }
      ]);

    }

    for (const zahler in historyDataList) {
      const myHis = historyDataList[zahler];

      await this._history_TimeFrameDetection(oS, TimeFrames.Day, myHis.date);
      await this._history_TimeFrameDetection(oS, TimeFrames.Week, myHis.date);
      await this._history_TimeFrameDetection(oS, TimeFrames.Month, myHis.date);
      await this._history_TimeFrameDetection(oS, TimeFrames.Quarter, myHis.date);
      await this._history_TimeFrameDetection(oS, TimeFrames.Year, myHis.date);
      await this._history_TimeFrameDetection(oS, TimeFrames.Infinite, myHis.date);



      //Reset detection
      if (oS.counterResetDetection && myHis.val < oS.historyReadoutData.lastGoodhis.val) {
        //Verringerung erkannt -> neuanpassung der startWerte
        if (oS.historyReadoutData.firstWronghis == null) {
          oS.historyReadoutData.firstWronghis = myHis;
          oS.historyReadoutData.counterResetDetetion_CurrentCountAfterReset = 0;
          oS.historyReadoutData.lastWronghis = null;
        }
        if (oS.historyReadoutData.lastWronghis == null || oS.historyReadoutData.lastWronghis.val != myHis.val) {
          oS.historyReadoutData.counterResetDetetion_CurrentCountAfterReset += 1;
          oS.historyReadoutData.lastWronghis = myHis;
        }
        if (oS.historyReadoutData.counterResetDetetion_CurrentCountAfterReset <= oS.counterResetDetetion_CountAfterReset) {
          //return;
        }
        else {
          const theAnpassung = oS.historyReadoutData.lastGoodhis.val - oS.historyReadoutData.firstWronghis.val;


          this.log.info("HistoryAnalyse " + oS.id + ": Counter reset! Reset from " + oS.historyReadoutData.lastGoodhis.val + " to " + oS.historyReadoutData.firstWronghis.val + " (" + oS.historyReadoutData.firstWronghis.date.toJSON() + "), recalculate start values");
          oS.historyReadoutData.lastGoodhis = myHis;
          oS.historyReadoutData.firstWronghis = null;
          oS.historyReadoutData.resetsDetected++;
          for (const TimeFrame in TimeFrames) {
            oS.historyReadoutData.hisstartvalues[TimeFrame] = oS.historyReadoutData.hisstartvalues[TimeFrame] - theAnpassung;
          }

        }

      }
      else {
        oS.historyReadoutData.firstWronghis = null;
        oS.historyReadoutData.lastGoodhis = myHis;

      }


      if (oS.historyReadoutData.lastGoodhis === myHis) {
        // Data is Valid so fill it to history
        await this._history_fill_history(oS, myHis.date.getTime(), TimeFrames.Day, false);
        await this._history_fill_history(oS, myHis.date.getTime(), TimeFrames.Week, false);
        await this._history_fill_history(oS, myHis.date.getTime(), TimeFrames.Month, false);
        await this._history_fill_history(oS, myHis.date.getTime(), TimeFrames.Quarter, false);
        await this._history_fill_history(oS, myHis.date.getTime(), TimeFrames.Year, false);
        await this._history_fill_history(oS, myHis.date.getTime(), TimeFrames.Infinite, false);
      }




      oS.historyReadoutData.lastHis = myHis;
      oS.historyReadoutData.workcounts.analysed++;

      //Do logging
      if (writenextLog < Date.now()) {

        const zeitSeitlastlogS = (Date.now() - lastlog) / 1000;
        this.log.info("HistoryAnalyse " + oS.id + " working state " + Math.round((oS.historyReadoutData.workcounts.analysed / historyDataList.length) * 100) + "% " +
          "; Resets detected: " + oS.historyReadoutData.resetsDetected +
          "; History Entrys Analysed: " + oS.historyReadoutData.workcounts.analysed + " (" + Math.round((oS.historyReadoutData.workcounts.analysed - oS.historyReadoutData.workcounts.analysed_last) / zeitSeitlastlogS) + " pro s)" +
          "; detailed write: " + oS.historyReadoutData.workcounts.detailed + " (" + Math.round((oS.historyReadoutData.workcounts.detailed - oS.historyReadoutData.workcounts.detailed_last) / zeitSeitlastlogS) + " pro s)" +
          "; HistoryWrite: " + oS.historyReadoutData.workcounts.historyWrite + " (" + Math.round((oS.historyReadoutData.workcounts.historyWrite - oS.historyReadoutData.workcounts.historyWrite_last) / zeitSeitlastlogS) + " pro s)" +
          "; current history Date: " + myHis.date.toDateString());
        oS.historyReadoutData.workcounts.historyWrite_last = oS.historyReadoutData.workcounts.historyWrite;
        oS.historyReadoutData.workcounts.detailed_last = oS.historyReadoutData.workcounts.detailed;
        oS.historyReadoutData.workcounts.analysed_last = oS.historyReadoutData.workcounts.analysed;
        writenextLog = Date.now() + logEveryMS;
        lastlog = Date.now();
      }
    }
    //before befüllen
    if (oS.history_fill_before) {
      for (const TimeFrame in TimeFrames) {
        if (!(TimeFrame == TimeFrames.Minute || TimeFrame == TimeFrames.Hour)) {
          /** @type {Array<{date:Date, value:Number}>} */
          const MyTimeFrameData = oS.historyReadoutData.timeFrameValueData[TimeFrame];
          for (let zahler = oS.beforeCount(TimeFrame); zahler >= 1; zahler--) {
            if (MyTimeFrameData.length >= zahler) {
              await this._pushNewPreviousSates(oS, TimeFrame, MyTimeFrameData[MyTimeFrameData.length - zahler].value, await this._getDateTimeInfoForPrevious(TimeFrame, MyTimeFrameData[MyTimeFrameData.length - zahler].date, 0));
            }
            else {
              //set no data yet
              await this._pushNewPreviousSates(oS, TimeFrame, 0, "no data");
            }
          }
        }
      }
    }
    //startvalues befüllen
    if (oS.history_fill_startvalues) {
      for (const TimeFrame in TimeFrames) {
        await this._setStartValue(oS, TimeFrame, oS.historyReadoutData.hisstartvalues[TimeFrame]);
      }

    }
    const ZeitGesamtS = (Date.now() - startWorking) / 1000;
    this.log.info("HistoryAnalyse " + oS.id + " FINISHED !! " +
      " Resets detected: " + oS.historyReadoutData.resetsDetected +
      " History Entrys Analysed: " + oS.historyReadoutData.workcounts.analysed + " (" + Math.round(oS.historyReadoutData.workcounts.analysed / ZeitGesamtS) + " pro s)" +
      " detailed write: " + oS.historyReadoutData.workcounts.detailed + " (" + Math.round(oS.historyReadoutData.workcounts.detailed / ZeitGesamtS) + " pro s)" +
      " HistoryWrite: " + oS.historyReadoutData.workcounts.historyWrite + " (" + Math.round(oS.historyReadoutData.workcounts.historyWrite / ZeitGesamtS) + " pro s)");
  }

}


// @ts-ignore parent is a valid property on module
if (module.parent) {
  // Export the constructor in compact mode
  /**
   * @param {Partial<utils.AdapterOptions>} [options={}]
   */
  module.exports = (options) => new valuetrackerovertime(options);
} else {
  // otherwise start the instance directly
  new valuetrackerovertime();
}
