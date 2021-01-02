"use strict";

/*
* Created with @iobroker/create-adapter v1.27.0
*/

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

const cron = require("node-cron"); // Cron Schedulervar

const ObjectSettings = require("./ObjectSettings.js");

const TimeFrames = {
    Minute: "Minute",
    Hour: "Hour",
    Day: "Day",
    Week: "Week",
    Month: "Month",
    Quarter: "Quarter",
    Year: "Year"
};


const TimeFramesNumber = {
    Minute: "001",
    Hour: "002",
    Day: "01",
    Week: "02",
    Month: "03",
    Quarter: "04",
    Year: "05"
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
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("objectChange", this.onObjectChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }



    /**
  * Is called when databases are connected and adapter received configuration.
  */
    async onReady() {
        this.subscribeForeignObjects("*");
        await this.initialObjects();
        cron.schedule("* * * * *", async () => {
            const date = new Date();
            for (const oneOD in this.dicDatas) {
                const oS = this.dicDatas[oneOD];

                await this._timeFrameFinished(oS, TimeFrames.Minute, date);
                if (date.getMinutes() == 0) {
                    await this._timeFrameFinished(oS, TimeFrames.Hour, date);
                    if (date.getHours() == 0) {
                        await this._timeFrameFinished(oS, TimeFrames.Day, date);
                        if (date.getDay() == 1) { //0 = Sunday
                            await this._timeFrameFinished(oS, TimeFrames.Week, date);
                        }
                        if (date.getDate() == 1) {
                            await this._timeFrameFinished(oS, TimeFrames.Month, date);
                            if ((date.getMonth() % 3) == 0) {
                                await this._timeFrameFinished(oS, TimeFrames.Quarter, date);
                            }
                            if (date.getMonth() == 0) {
                                await this._timeFrameFinished(oS, TimeFrames.Year, date);
                            }
                        }
                    }
                }
            }

        });
    }


    /**
  * Read CurrentValue as number
  * @param {ObjectSettings} oS
  * @returns {Promise<number>}
  */
    async _getCurrentValue(oS) {
        const currentState = await this.getForeignStateAsync(oS.id);
        if (currentState && currentState.val && Number(currentState.val) != Number.NaN) {
            return Number(currentState.val);
        }
        return 0;
    }

    /**
  * create for every enabled object the needed stats and set it to initial it
  */
    async initialObjects() {
        this.log.info("inital all Objects");

        // read out all Objects
        const objects = await this.getForeignObjectsAsync("", "state", null);
        for (const idobject in objects) {
            await this._initialObject(objects[idobject]);
        }
        this.log.info("initial completed");
    }
    /**
  * @param {ioBroker.Object | null | undefined} iobrokerObject
  * */
    async _initialObject(iobrokerObject) {

        if (iobrokerObject && iobrokerObject != undefined) {
            // only do something when enabled
            if (iobrokerObject && iobrokerObject.common.custom && iobrokerObject.common.custom[this.namespace] && iobrokerObject.common.custom[this.namespace].enabled) {
                this.log.info("initial (enabled): " + iobrokerObject._id);
                /**@type {ObjectSettings} */
                let oS;
                if (iobrokerObject._id in this.dicDatas) {
                    oS = this.dicDatas[iobrokerObject._id];
                    oS.updateSettings(iobrokerObject);

                } else {
                    oS = new ObjectSettings(iobrokerObject, this.namespace);
                    this.dicDatas[oS.id] = oS;
                }

                //Check for duplicate Alias
                for (const oneoSIdtoCheck in this.dicDatas) {
                    /**@type {ObjectSettings} */
                    const oStoCheck = this.dicDatas[oneoSIdtoCheck];
                    if (oStoCheck.alias.toLowerCase() == oS.alias.toLowerCase() && oStoCheck.id != oS.id) {
                        delete this.dicDatas[oS.id];
                        this.log.error("The Datapoint " + oS.id + " have the same Alias (" + oS.alias + ") as the Datapoint " + oStoCheck.id + ", " + oS.id + " is now disabled");
                        return;
                    }

                }


                await this._generateTreeStructure(oS);
                this.subscribeStates(oS.alias + "._startValues.*");
                const currentval = await this._getCurrentValue(oS);
                const startDay = await this._getStartValue(oS, TimeFrames.Day, currentval);
                if (oS.lastGoodValue == 0) {
                    if (currentval < startDay) {
                        oS.lastGoodValue = startDay;
                    }
                    else {
                        oS.lastGoodValue = currentval;
                    }
                }


                this.log.debug("subscribeForeignStates " + oS.id);
                await this.subscribeForeignStatesAsync(oS.id);
                oS.initialFinished = true;
                await this._publishCurrentValue(oS, new Date(), currentval);


                if (oS.historyload_Detailed){
                    iobrokerObject.common.custom[this.namespace].historyload_Detailed = false;
                    await this.setForeignObjectAsync(oS.id, iobrokerObject);
                    await this._readDetailedFromHistory_SQL(oS, oS.historyInstanz);
                }


                this.log.debug("initial done " + iobrokerObject._id + " -> " + this.namespace + "." + oS.alias);
            } else {
                if (iobrokerObject._id in this.dicDatas) {
                    this.log.info("disable : " + iobrokerObject._id);
                    await this._setExtendChannel(this.dicDatas[iobrokerObject._id], "", "disabled", true);

                    delete this.dicDatas[iobrokerObject._id];
                    await this.unsubscribeForeignStatesAsync(iobrokerObject._id);

                }
            }
        }
    }


    /**
  * Is called if a subscribed object changes
  * @param {ObjectSettings} oS
  * @param {string} TimeFrame
  * @param {Date} date
  */
    async _timeFrameFinished(oS, TimeFrame, date) {
        if (oS.initialFinished) {
            this.log.debug(oS.alias + " TimeFrame " + TimeFrame + " end, insert now previous values ");
            await this._pushPreviousSates(oS, TimeFrame, date);
            this.log.debug(oS.alias + " set startValue from TimeFrame " + TimeFrame + " to " + oS.lastGoodValue);
            await this._setStartValue(oS, TimeFrame, oS.lastGoodValue);
            await this._calcCurrentTimeFrameValue(oS, date, oS.lastGoodValue, TimeFrame);
        }
    }

    /**
  * Is called if a subscribed object changes
  * @param {string} id
  * @param {ioBroker.Object | null | undefined} obj
  */
    async onObjectChange(id, obj) {
        this._initialObject(obj);
    }

    /**
  * Is called if a subscribed state changes
  * @param {string} id
  * @param {ioBroker.State | null | undefined} state
  */
    async onStateChange(id, state) {
        if (state) {
            if (!state.ack && id.startsWith(this.namespace) && id.includes("_startValues.start_")) {
                const TimeFrame = id.substring(id.lastIndexOf("_") + 1);
                const idsplit = id.split(".");
                for (const oneoSID in this.dicDatas) {
                    /**@type {ObjectSettings} */
                    const oS = this.dicDatas[oneoSID];
                    if (oS.alias == idsplit[2]) {
                        this.log.warn(id + " changed, recalc Timeframe, old-Value: " + this._getStartValue(oS, TimeFrame, 0) + " new-value: " + state.val);
                        await this._calcCurrentTimeFrameValue(oS, new Date(), oS.lastGoodValue, TimeFrame);
                        await this.setStateAsync(id, Number(state.val), true);
                    }
                }

            }
            else {
                if (id in this.dicDatas) {
                    await this._publishCurrentValue(this.dicDatas[id], new Date(state.ts), Number(state.val));
                }
                //this.log.debug(id + " state changed")
            }
        }

    }

    /**
  * Is called when adapter shuts down - callback has to be called under any circumstances!
  * @param {() => void} callback
  */
    onUnload(callback) {
        try {

            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);

            callback();
        } catch (e) {
            callback();
        }
    }
    /**
  * Pull the before Values one level back
  * @param {ObjectSettings} oS
  * @param {string} TimeFrame
  * @param {Date} date
  */
    async _pushPreviousSates(oS, TimeFrame, date) {
    //Days before befüllen
        let iBeforeCount;
        for (iBeforeCount = oS.beforeCount(TimeFrame); iBeforeCount > 1; iBeforeCount--) {
            const theValBefore = await this.getStateAsync(oS.alias + await this._getObjectIdPrevious(oS, TimeFrame, iBeforeCount - 1));
            const theObjectBefore = await this.getObjectAsync(oS.alias + await this._getObjectIdPrevious(oS, TimeFrame, iBeforeCount - 1));
            if (theValBefore && theObjectBefore &&  typeof theValBefore.val === "number" ) {
                await this._setStateRoundedAsync(oS, await this._getObjectIdPrevious(oS, TimeFrame, iBeforeCount), theValBefore.val, true);
                await this._setExtendObject(oS, await this._getObjectIdPrevious(oS, TimeFrame, iBeforeCount), theObjectBefore.common.name.toString(), "value.history." + TimeFrame, true, false, oS.output_unit, "number");
            }
        }
        if (iBeforeCount == 1) {
            const TimeFrameValue = (oS.lastGoodValue - await this._getStartValue(oS, TimeFrame, oS.lastGoodValue)) * oS.output_multiplier;

            await this._setStateRoundedAsync(oS, await this._getObjectIdPrevious(oS, TimeFrame, iBeforeCount), TimeFrameValue, true);
            await this._setExtendObject(oS, await this._getObjectIdPrevious(oS, TimeFrame, iBeforeCount), await this._getDateTimeInfoForPrevious(oS, TimeFrame, date, 1), "value.history." + TimeFrame, true, false, oS.output_unit, "number");

        }
    }




    /**
  * round to 10
  * @param {Number} theNumber
  * @returns {Number}
  */
    _roundto(theNumber) {
        if (theNumber)
            return Number((theNumber).toFixed(10));
        else
            return 0;
    }

    /**
  * Analyse for CounterReset and recalc current TimeFrames
  * @param {ObjectSettings} oS
  * @param {Date} date
  * @param {number} current_value
  */
    async _publishCurrentValue(oS, date, current_value) {
        if (oS.initialFinished) {

            if (oS.counterResetDetection && current_value < oS.lastGoodValue) {
                //Verringerung erkannt -> neuanpassung der startWerte
                if (Number.isNaN(oS.FirstWrongValue)) {
                    oS.FirstWrongValue = current_value;
                    oS.counterResetDetetion_CurrentCountAfterReset = 0;
                }
                if (oS.lastWrongValue != current_value) {
                    oS.counterResetDetetion_CurrentCountAfterReset += 1;
                    oS.lastWrongValue = current_value;
                }
                if (oS.counterResetDetetion_CurrentCountAfterReset <= oS.counterResetDetetion_CountAfterReset) {
                    return;
                }

                const theAnpassung = oS.lastGoodValue - oS.FirstWrongValue;


                this.log.warn(oS.id + " wurde scheinbar resetet! Reset von " + oS.lastGoodValue + " nach " + current_value + " passe alle Startwerte an");
                oS.lastGoodValue = current_value;
                oS.lastWrongValue = NaN;
                oS.FirstWrongValue = NaN;
                oS.counterResetDetetion_CurrentCountAfterReset = 0;

                for (const TimeFrame in TimeFrames) {
                    await this._setStartValue(oS, TimeFrame, (await this._getStartValue(oS, TimeFrame, current_value) - theAnpassung));
                }


            }
            oS.lastWrongValue = NaN;
            oS.FirstWrongValue = NaN;

            oS.lastGoodValue = current_value;
            for (const TimeFrame in TimeFrames) {
                await this._calcCurrentTimeFrameValue(oS, date, current_value, TimeFrame);
            }
        }


    }

    /**
  * Recalculate the Current and Detailed Values
  * @param {ObjectSettings} oS
  * @param {Date} date
  * @param {number} current_value
  * @param {string} TimeFrame
  */
    async _calcCurrentTimeFrameValue(oS, date, current_value, TimeFrame) {
        const TimeFrame_value = (current_value - await this._getStartValue(oS, TimeFrame, current_value)) * oS.output_multiplier;
        await this._saveCurrentTimeFrameValue(oS, TimeFrame_value, TimeFrame);
        await this._saveDetailedTimeFrameValue(oS, date, TimeFrame_value, TimeFrame);

    }

    /**
* Recalculate the Current and Detailed Values
* @param {ObjectSettings} oS
* @param {number} TimeFrame_value
* @param {string} TimeFrame
*/
    async _saveCurrentTimeFrameValue(oS, TimeFrame_value, TimeFrame) {
        if (oS.beforeCount(TimeFrame) >= 0) {
            await this._setStateRoundedAsync(oS, await this._getObjectIDCurrent(TimeFrame), TimeFrame_value, true);
        }

    }
    /**
* Recalculate the Current and Detailed Values
* @param {ObjectSettings} oS
* @param {Date} date
* @param {number} TimeFrame_value
* @param {string} TimeFrame
*/
    async _saveDetailedTimeFrameValue(oS, date, TimeFrame_value, TimeFrame) {

        await this._CreateAndSetObjectIdDetailed(oS, TimeFrame, date, TimeFrame_value);

    }



    /**
* round and set the value
* @param {ObjectSettings} oS
* @param {string} id
* @param {number} value
* @param {boolean} ack
*/
    async _setStateRoundedAsync(oS, id, value, ack) {
        await this.setStateAsync(oS.alias + id, this._roundto( value), ack);

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
            if (oS.beforeCount(TimeFrame) >= 0) {
                await this._setExtendObject(oS, await this._getObjectIDCurrent(TimeFrame), "Current " + TimeFrame, "value.Current." + TimeFrame, true, false, oS.output_unit, "number");
            }
            else {
                await this._setExtendObject(oS, await this._getObjectIDCurrent(TimeFrame), "Disabled", "value.Current.disabled", false, false, oS.output_unit, "number");
            }
            //Before erzeugen bzw leeren
            let iBefore = 1;
            for (iBefore = 1; iBefore <= oS.beforeCount(TimeFrame); iBefore++) {
                const thePreviousID = await this._getObjectIdPrevious(oS, TimeFrame, iBefore);
                const oldObject = await this.getObjectAsync(oS.alias + thePreviousID);
                let touseName = "no data yet";
                if (oldObject) {
                    touseName = oldObject.common.name.toString();
                }
                await this._setExtendObject(oS, await this._getObjectIdPrevious(oS, TimeFrame, iBefore), touseName, "value.history." + TimeFrame, true, false, oS.output_unit, "number");
            }
            let theObject = await this.getObjectAsync(oS.alias + await this._getObjectIdPrevious(oS, TimeFrame, iBefore));
            while (theObject != null) {
                await this._setExtendObject(oS, await this._getObjectIdPrevious(oS, TimeFrame, iBefore), theObject.common.name.toString(), "value.history.disabled", false, false, oS.output_unit, "number");
                iBefore++;
                theObject = await this.getObjectAsync(oS.alias + await this._getObjectIdPrevious(oS, TimeFrame, iBefore));
            }

        }
    }

    /**
* Adds 0 to numbers
* @param {number} num
* @param {number} size
*/
    static pad(num, size) {
        let s = num + "";
        while (s.length < size) s = "0" + s;
        return s;
    }



    /**
  * Extends an existing object or create it
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
        if (!name.includes(" (" + oS.alias + ")")) {
            name += " (" + oS.alias + ")";
        }
        const theObject = await this.getObjectAsync(oS.alias + id);
        if (theObject == null || theObject.common.name != name || theObject.common.role != role || theObject.common.unit != unit || theObject.common.write != writeable || theObject.common.type != type) {
            if (createIfnotExists || theObject != null)
                await this.extendObjectAsync(oS.alias + id, {
                    type: "state",
                    common: {
                        name: name,
                        role: role,
                        type: type,
                        desc: `Created by ${this.namespace}`,
                        unit: unit,
                        read: true,
                        write: writeable,
                    },
                    native: {}
                });
        }

    }
    /**
  * Is called if a subscribed object changes
  * @param {ObjectSettings} oS
  * @param {string} id
  * @param {string} name
  * @param {boolean} createIfnotExists
  */
    async _setExtendChannel(oS, id, name, createIfnotExists) {
        if (!name.includes(" (" + oS.alias + ")")) {
            name += " (" + oS.alias + ")";
        }

        const theObject = await this.getObjectAsync(oS.alias + id);
        if (theObject == null || theObject == undefined || theObject.common.name != name || theObject.type != "channel") {
            if (createIfnotExists || theObject != null) {

                await this.extendObjectAsync(oS.alias + id, {
                    type: "channel",
                    common: {
                        name: name,
                        desc: `Created by ${this.namespace}`,
                    },
                    native: {}
                });
            }
        }

    }

    /**
  * extends the Object with customData in the correct namespace
  * @param {ObjectSettings} oS
  * @param {string} TimeFrame
  * @param {number} beforeCounter
  */
    async _getObjectIdPrevious(oS, TimeFrame, beforeCounter) {
        if (oS.beforeCount(TimeFrame) > 0)
            await this._setExtendChannel(oS, "." + TimeFramesNumber[TimeFrame] + "_previous" + TimeFrame + "s", TimeFrame + "s Before", true);
        else {
            await this._setExtendChannel(oS, "." + TimeFramesNumber[TimeFrame] + "_previous" + TimeFrame + "s", "disabled", false);
        }



        const theID = "." + TimeFramesNumber[TimeFrame] + "_previous" + TimeFrame + "s.Before_" + valuetrackerovertime.pad(beforeCounter, 2) + "_" + TimeFrame;
        return theID;

    }

    /**
  * extends the Object with customData in the correct namespace
  * @param {ObjectSettings} oS
  * @param {string} TimeFrame
  * @param {Date} theDate
  */
    async _getDateTimeInfoForPrevious(oS, TimeFrame, theDate, beforeZähler) {
        const Newdate = new Date(theDate);
        let theDateInfo = "";
        if (TimeFrame == TimeFrames.Minute) {
            Newdate.setMinutes(Newdate.getMinutes() - beforeZähler);
            theDateInfo = "minute " + Newdate.toLocaleTimeString();
        } else if (TimeFrame == TimeFrames.Hour) {
            Newdate.setHours(Newdate.getHours() - beforeZähler);
            theDateInfo = "hour " + Newdate.toLocaleTimeString();

        } else if (TimeFrame == TimeFrames.Day) {
            Newdate.setDate(Newdate.getDate() - beforeZähler);
            theDateInfo = Newdate.toLocaleDateString();
        } else if (TimeFrame == TimeFrames.Week) {
            Newdate.setDate(Newdate.getDate() - 7 * beforeZähler);
            const theKW = new KWInfo(Newdate);
            theDateInfo = theKW.InfoString;
        }
        else if (TimeFrame == TimeFrames.Month) {
            Newdate.setMonth(Newdate.getMonth() - beforeZähler);
            const MonthString = Newdate.toLocaleString("en-us", { month: "long" });
            theDateInfo = valuetrackerovertime.pad(Newdate.getMonth() + 1, 2) + "_" + MonthString;
        }
        else if (TimeFrame == TimeFrames.Quarter) {
            Newdate.setMonth(Newdate.getMonth() - (beforeZähler * 3));

            theDateInfo = "quarter " + this._getQuarter(Newdate);
        }

        else if (TimeFrame == TimeFrames.Year) {
            Newdate.setFullYear(Newdate.getFullYear() - beforeZähler);

            theDateInfo = Newdate.getFullYear().toString();
        }
        return "Data from " + theDateInfo;
    }




    /**
* Creates the needed TreeStructure and returns the Id after alias-name
* @param {ObjectSettings} oS
* @param {string} TimeFrame
* @param {Date} date
* @param {number} TimeFrame_value
*/
    async _CreateAndSetObjectIdDetailed(oS, TimeFrame, date, TimeFrame_value) {
        if (oS.detailed(TimeFrame)){

            let mydetailedObjectId = "." + date.getFullYear();
            await this._setExtendChannel(oS, mydetailedObjectId, String(date.getFullYear()), true);

            if (TimeFrame == TimeFrames.Year) {
                mydetailedObjectId = mydetailedObjectId + "." + TimeFramesNumber.Year + "_Year_" + date.getFullYear();
                await this._setExtendObject(oS, mydetailedObjectId, date.getFullYear() + " Value", "value.history." + TimeFrame, true, false, oS.output_unit, "number");

            }
            else {

                mydetailedObjectId = mydetailedObjectId + "." + TimeFramesNumber[TimeFrame] + "_" + TimeFrame + "s";
                await this._setExtendChannel(oS, mydetailedObjectId, TimeFrame + "s", true);

                if (TimeFrame == TimeFrames.Day) {
                    const MonthString = date.toLocaleString("en-us", { month: "long" });
                    mydetailedObjectId = mydetailedObjectId + "." + valuetrackerovertime.pad(date.getMonth() + 1, 2) + "_" + MonthString;
                    await this._setExtendChannel(oS, mydetailedObjectId, valuetrackerovertime.pad(date.getMonth() + 1, 2) + "_" + MonthString, true);
                    mydetailedObjectId = mydetailedObjectId + "." + valuetrackerovertime.pad(date.getDate(), 2);
                    await this._setExtendObject(oS, mydetailedObjectId, valuetrackerovertime.pad(date.getDate(), 2) + ". " + MonthString, "value.history." + TimeFrame, true, false, oS.output_unit, "number");
                }
                if (TimeFrame == TimeFrames.Month) {
                    const MonthString = date.toLocaleString("en-us", { month: "long" });
                    mydetailedObjectId = mydetailedObjectId + "." + valuetrackerovertime.pad(date.getMonth() + 1, 2) + "_" + MonthString;
                    await this._setExtendObject(oS, mydetailedObjectId, valuetrackerovertime.pad(date.getMonth() + 1, 2) + "_" + MonthString, "value.history." + TimeFrame, true, false, oS.output_unit, "number");
                }
                if (TimeFrame == TimeFrames.Week) {
                    const theKWInfo = new KWInfo(date);
                    mydetailedObjectId = "." + theKWInfo.yearOfThursday + "." + TimeFramesNumber[TimeFrame] + "_" + TimeFrame + "s";

                    mydetailedObjectId = mydetailedObjectId + ".KW" + valuetrackerovertime.pad(theKWInfo.weekNumber, 2);
                    await this._setExtendObject(oS, mydetailedObjectId, theKWInfo.InfoString, "value.history." + TimeFrame, true, false, oS.output_unit, "number");
                }
                if (TimeFrame == TimeFrames.Quarter) {
                    mydetailedObjectId = mydetailedObjectId + ".quater_" + this._getQuarter(date);
                    await this._setExtendObject(oS, mydetailedObjectId, "quater_" + this._getQuarter(date), "value.history." + TimeFrame, true, false, oS.output_unit, "number");
                }
            }
            await this._setStateRoundedAsync(oS, mydetailedObjectId, TimeFrame_value, true);
            return mydetailedObjectId;
        }

    }

    /**
  * returns the current DP
  * @param {string} TimeFrame
  */
    async _getObjectIDCurrent(TimeFrame) {
        return "." + TimeFramesNumber[TimeFrame] + "_current" + TimeFrame;

    }




    /**
* extends the Object with customData in the correct namespace
* @param {ObjectSettings} oS
* @param {string} TimeFrame
* @param {number} value
*/
    async _setStartValue(oS, TimeFrame, value) {
        await this._setStateRoundedAsync(oS, await this._getStartID(TimeFrame), value, true);
    }
    /**
  * Returns the startid
  * @param {string} TimeFrame
  */
    async _getStartID(TimeFrame) {
        return "._startValues.start_" + TimeFramesNumber[TimeFrame] + "_" + TimeFrame;
    }
    /**
  * extends the Object with customData in the correct namespace
  * @param {ObjectSettings} oS
  * @param {string} TimeFrame
  * @param {number} currentValue
  * @returns {Promise<number>}
  */
    async _getStartValue(oS, TimeFrame, currentValue) {
    //Create the DP if not exists
        const startID = await this._getStartID(TimeFrame);

        await this._setExtendObject(oS, startID, "start_" + TimeFrame, "", true, true, oS.iobrokerObject.common.unit, "number");
        //set startData if not set
        const state = await this.getStateAsync(oS.alias + startID);
        if (!state || state.val == null || state.val == undefined) {
            await this._setStateRoundedAsync(oS, startID, currentValue, true);
            return currentValue;
        }
        else {
            return Number(state.val);
        }
    }







    /**
    * extends the Object with customData in the correct namespace
    * @param {ObjectSettings} oS
    * @param {string} historyInstanz
    */
    async _readDetailedFromHistory_SQL(oS, historyInstanz) {
        //First get all Data in Ascending ts
        this.log.info("HistoryAnalyseDetailed " + oS.id + ": Frage von " + historyInstanz + " die Daten der letzten 10 jahre ab (Wenn keine weiteren Logs, dann exisiter vielleicht die Instanz nicht oder ist deaktiviert)");

        const end = Date.now();
        const start = end - 10*365*24* 3600000 ;



        const gethistory = await this.sendToAsync(historyInstanz, "getHistory", {
            id: oS.id,
            options: {
                end: end,
                start:      start,
                count: 100000000,
                aggregate: "none" // or 'none' to get raw values
            }
        });

        if (gethistory) {
            if  (gethistory["error"]) {
                this.log.error("HistoryAnalyseDetailed " + oS.id + ": Fehler bei Datenlesen: " + gethistory["error"]);
            }
            else if ( gethistory["result"]){
                this.log.info("HistoryAnalyseDetailed " + oS.id + ": wandle SQL Datensätze um: " + gethistory["result"].length);
                const allData = [];
                for (const one in gethistory["result"])
                {
                    allData.push(new historyData(gethistory["result"][one].ts, gethistory["result"][one].val));
                }
                await this._readDetailedFromHisory(oS, allData);

            }
        }
        else {
            this.log.warn("no Response from Instance (active and exists?)");
        }



    }
    /**
    * @param {ObjectSettings} oS
    * @param {Array<historyData>} HistoryDataList
    */
    async _readDetailedFromHisory(oS, HistoryDataList) {
        this.log.info("HistoryAnalyseDetailed " + oS.id + ": Verarbeite " + HistoryDataList.length + " History Datensätze ");

        let DPfilled = 0;
        let resetsDetected = 0;
        const startvalues = {};
        let lastGoodValue = 0;
        let FirstWrongValue = NaN;
        let counterResetDetetion_CurrentCountAfterReset = 0;
        let lastWrongValue = NaN;


        let LastHis;
        for (const zahler in HistoryDataList)
        {
            const myHis = HistoryDataList[zahler];
            if (!LastHis){

                lastGoodValue= myHis.hisval;
                for (const TimeFrame in TimeFrames){
                    startvalues[TimeFrame] = myHis.hisval;


                }
            }
            else{
                //TimeframeChange erkennen
                let testDate = new Date( myHis.hisdate);
                while (testDate.getDate() > LastHis.hisdate.getDate() || testDate.getMonth() > LastHis.hisdate.getMonth() || testDate.getFullYear() > LastHis.hisdate.getFullYear())
                {
                    testDate.setDate(testDate.getDate() - 1);
                    await this._CreateAndSetObjectIdDetailed(oS, TimeFrames.Day, testDate, (lastGoodValue - startvalues[TimeFrames.Day]) * oS.output_multiplier);
                    startvalues[TimeFrames.Day] = lastGoodValue;
                    DPfilled ++;
                }



                testDate = new Date( myHis.hisdate);

                let testDateKWInfo = new KWInfo(testDate);
                const LastHisKWInfo = new KWInfo(LastHis.hisdate);

                while ( testDateKWInfo.weekNumber > LastHisKWInfo.weekNumber || testDateKWInfo.yearOfThursday > LastHisKWInfo.yearOfThursday)
                {
                    testDate.setDate(testDate.getDate()-7);
                    testDateKWInfo = new KWInfo(testDate);
                    await  this._CreateAndSetObjectIdDetailed(oS, TimeFrames.Week, testDate, (lastGoodValue - startvalues[TimeFrames.Week]) * oS.output_multiplier);
                    startvalues[TimeFrames.Week] = lastGoodValue;
                    DPfilled ++;
                }

                testDate = new Date( myHis.hisdate);
                while (testDate.getMonth() >  LastHis.hisdate.getMonth() ||  testDate.getFullYear()  >  LastHis.hisdate.getFullYear()  )
                {
                    testDate.setMonth(testDate.getMonth() -1);
                    await this._CreateAndSetObjectIdDetailed(oS, TimeFrames.Month, testDate, (lastGoodValue - startvalues[TimeFrames.Month]) *  oS.output_multiplier);
                    startvalues[TimeFrames.Month] = lastGoodValue;
                    DPfilled ++;
                }

                testDate = new Date( myHis.hisdate);
                while (Math.floor(testDate.getMonth() / 3) > Math.floor( LastHis.hisdate.getMonth() / 3)  || testDate.getFullYear() > LastHis.hisdate.getFullYear() )
                {
                    testDate.setMonth(testDate.getMonth() -3);
                    await this._CreateAndSetObjectIdDetailed(oS, TimeFrames.Quarter, testDate, (lastGoodValue - startvalues[TimeFrames.Quarter]) * oS.output_multiplier );
                    startvalues[TimeFrames.Quarter] = lastGoodValue;
                    DPfilled ++;
                }

                testDate = new Date( myHis.hisdate);
                while (testDate.getFullYear() > LastHis.hisdate.getFullYear() )
                {
                    testDate.setFullYear(testDate.getFullYear() -1);
                    await this._CreateAndSetObjectIdDetailed(oS, TimeFrames.Year, testDate, (lastGoodValue - startvalues[TimeFrames.Year]) * oS.output_multiplier);
                    startvalues[TimeFrames.Year] = lastGoodValue;
                    DPfilled ++;
                }


                //Reset detection
                if (oS.counterResetDetection && myHis.hisval < lastGoodValue) {
                    //Verringerung erkannt -> neuanpassung der startWerte
                    if (Number.isNaN(FirstWrongValue)) {
                        FirstWrongValue = myHis.hisval;
                        counterResetDetetion_CurrentCountAfterReset = 0;
                        lastWrongValue = NaN;
                    }
                    if (lastWrongValue != myHis.hisval) {
                        counterResetDetetion_CurrentCountAfterReset += 1;
                        lastWrongValue = myHis.hisval;
                    }
                    if (counterResetDetetion_CurrentCountAfterReset <= oS.counterResetDetetion_CountAfterReset) {
                        //return;
                    }
                    else{
                        const theAnpassung = lastGoodValue - FirstWrongValue;


                        this.log.warn("HistoryAnalyseDetailed " + oS.id + ": Counter wurde scheinbar resetet! Reset von " + lastGoodValue + " nach " + myHis.hisval + " passe alle Startwerte an");
                        lastGoodValue = myHis.hisval;
                        FirstWrongValue = NaN;
                        resetsDetected ++;
                        for (const TimeFrame in TimeFrames) {
                            startvalues[TimeFrame] =  startvalues[TimeFrame] - theAnpassung;
                        }

                    }



                }
                else {
                    FirstWrongValue = NaN;
                    lastGoodValue = myHis.hisval;

                }

            }

            LastHis = myHis;

        }
        this.log.info("HistoryAnalyseDetailed " + oS.id + ": Finished HistoryAnalyse. Created DetailedDatapoints: " + DPfilled + " Resets detected: " + resetsDetected);
    }

}
class historyData {

    /**
  * Generate new ObjectSettingsClass
  * @param {Date} hisdate
  * @param {number } hisval
  */
    constructor(hisdate, hisval) {
        if (typeof hisdate === "number")
        {
            if (Number(hisdate) > 10000){
                hisdate = new Date(hisdate);
            }
        }
        this.hisval = hisval;
        this.hisdate = hisdate;
    }

}

class KWInfo {

    /**
* Generate new ObjectSettingsClass
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
        const currentThursday = new Date(date.getTime() +(3-((date.getDay()+6) % 7)) * 86400000);
        this.weekstart = new Date(currentThursday);
        this.weekstart.setDate(currentThursday.getDate()-3);

        this.weekends = new Date(currentThursday);
        this.weekends.setDate(currentThursday.getDate()+3);

        // At the beginnig or end of a year the thursday could be in another year.
        this.yearOfThursday = currentThursday.getFullYear();

        // Get first Thursday of the year
        const firstThursday = new Date(new Date(this.yearOfThursday,0,4).getTime() +(3-((new Date(this.yearOfThursday,0,4).getDay()+6) % 7)) * 86400000);

        // +1 we start with week number 1
        // +0.5 an easy and dirty way to round result (in combinationen with Math.floor)
        this.weekNumber = Math.floor(1 + 0.5 + (currentThursday.getTime() - firstThursday.getTime()) / 86400000/7);
        this.InfoString = "KW_" + this.weekNumber + " (" + valuetrackerovertime.pad(this.weekstart.getDate(), 2) + "." + valuetrackerovertime.pad(this.weekstart.getMonth() + 1, 2) + "." + this.weekstart.getFullYear() + " - " + valuetrackerovertime.pad(this.weekends.getDate(), 2) + "." + valuetrackerovertime.pad(this.weekends.getMonth() + 1, 2) + "." + this.weekends.getFullYear() + ")"  ;


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
