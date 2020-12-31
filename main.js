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
        this.on("message", this.onMessage.bind(this));
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
            return this._roundto(Number(currentState.val));
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
        if (state && !state.ack) {
            if (id.startsWith(this.namespace) && id.includes("_startValues.start_")) {
                const TimeFrame = id.substring(id.lastIndexOf("_") + 1);
                const idsplit = id.split(".");
                for (const oneoSID in this.dicDatas) {
                    /**@type {ObjectSettings} */
                    const oS = this.dicDatas[oneoSID];
                    if (oS.alias == idsplit[2]) {
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
            if (theValBefore && theObjectBefore) {
                await this._setStateAsync(oS.alias + await this._getObjectIdPrevious(oS, TimeFrame, iBeforeCount), Number(theValBefore.val), true);
                await this._setExtendObject(oS, await this._getObjectIdPrevious(oS, TimeFrame, iBeforeCount), theObjectBefore.common.name.toString(), "value.history." + TimeFrame, true, false, oS.output_unit, "number");
            }
        }
        if (iBeforeCount == 1) {
            const current_timeper = this._roundto(this._roundto(oS.lastGoodValue - await this._getStartValue(oS, TimeFrame, oS.lastGoodValue)) * oS.output_multiplier);

            await this._setStateAsync(oS.alias + await this._getObjectIdPrevious(oS, TimeFrame, iBeforeCount), current_timeper, true);
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

            current_value = this._roundto(current_value);

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
                if (oS.counterResetDetetion_CurrentCountAfterReset < oS.counterResetDetetion_CountAfterReset) {
                    return;
                }

                const theAnpassung = this._roundto(oS.lastGoodValue - oS.FirstWrongValue);


                this.log.warn(oS.id + " wurde scheinbar resetet! Reset von " + oS.lastGoodValue + " nach " + current_value + " passe alle Startwerte an");
                oS.lastGoodValue = current_value;
                oS.lastWrongValue = NaN;
                oS.FirstWrongValue = NaN;
                oS.counterResetDetetion_CurrentCountAfterReset = 0;

                for (const TimeFrame in TimeFrames) {
                    await this._setStartValue(oS, TimeFrame, (await this._getStartValue(oS, TimeFrame, current_value) - theAnpassung));
                }


            }
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
        const current_TimeFrame = this._roundto(this._roundto(current_value - await this._getStartValue(oS, TimeFrame, current_value)) * oS.output_multiplier);
        if (oS.beforeCount(TimeFrame) >= 0) {
            await this._setStateAsync(oS.alias + await this._getObjectIDCurrent(TimeFrame), current_TimeFrame, true);
        }

        if (oS.detailed(TimeFrame) === true) {
            const id = oS.alias + await this._getAndCreateObjectIdDetailed(oS, TimeFrame, date);
            const val = current_TimeFrame;
            await this._setStateAsync(id, val, true);
        }

    }


    async _setStateAsync(id, state, ack) {
        await this.setStateAsync(id, state, ack);

    }




    /**
  * returns the KW of the date
  * @param {Date} date
  */
    _getKW(date) {
    // Copy date so don"t modify original
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        d.setHours(0, 0, 0, 0);
        // Thursday in current week decides the year.
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
        // January 4 is always in week 1.
        const week1 = new Date(d.getFullYear(), 0, 4);
        // Adjust to Thursday in week 1 and count number of weeks from date to week1.
        return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000
      - 3 + (week1.getDay() + 6) % 7) / 7);

    }

    /**
  * returns the KW of the date
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
        await this._setStateAsync(oS.alias + "._counterID", oS.id, true);
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
    pad(num, size) {
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



        const theID = "." + TimeFramesNumber[TimeFrame] + "_previous" + TimeFrame + "s.Before_" + this.pad(beforeCounter, 2) + "_" + TimeFrame;
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
            theDateInfo = "KW_" + this._getKW(Newdate);
        }
        else if (TimeFrame == TimeFrames.Month) {
            Newdate.setMonth(Newdate.getMonth() - beforeZähler);
            const MonthString = Newdate.toLocaleString("en-us", { month: "long" });
            theDateInfo = this.pad(Newdate.getMonth() + 1, 2) + "_" + MonthString;
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
  */
    async _getAndCreateObjectIdDetailed(oS, TimeFrame, date) {

        let IZusatz = "." + date.getFullYear();
        await this._setExtendChannel(oS, IZusatz, String(date.getFullYear()), true);

        if (TimeFrame == TimeFrames.Year) {
            IZusatz = IZusatz + "." + TimeFramesNumber.Year + "_Year_" + date.getFullYear();
            await this._setExtendObject(oS, IZusatz, date.getFullYear() + " Value", "value.history." + TimeFrame, true, false, oS.output_unit, "number");
            return IZusatz;
        }

        IZusatz = IZusatz + "." + TimeFramesNumber[TimeFrame] + "_" + TimeFrame + "s";
        await this._setExtendChannel(oS, IZusatz, TimeFrame + "s", true);

        if (TimeFrame == TimeFrames.Day) {
            const MonthString = date.toLocaleString("en-us", { month: "long" });
            IZusatz = IZusatz + "." + this.pad(date.getMonth() + 1, 2) + "_" + MonthString;
            await this._setExtendChannel(oS, IZusatz, this.pad(date.getMonth() + 1, 2) + "_" + MonthString, true);
            IZusatz = IZusatz + "." + this.pad(date.getDate(), 2);
            await this._setExtendObject(oS, IZusatz, this.pad(date.getDate(), 2) + ". " + MonthString, "value.history." + TimeFrame, true, false, oS.output_unit, "number");
        }
        if (TimeFrame == TimeFrames.Month) {
            const MonthString = date.toLocaleString("en-us", { month: "long" });
            IZusatz = IZusatz + "." + this.pad(date.getMonth() + 1, 2) + "_" + MonthString;
            await this._setExtendObject(oS, IZusatz, this.pad(date.getMonth() + 1, 2) + "_" + MonthString, "value.history." + TimeFrame, true, false, oS.output_unit, "number");
        }
        if (TimeFrame == TimeFrames.Week) {
            IZusatz = IZusatz + ".KW" + this.pad(this._getKW(date), 2);
            await this._setExtendObject(oS, IZusatz, "KW" + this.pad(this._getKW(date), 2), "value.history." + TimeFrame, true, false, oS.output_unit, "number");
        }
        if (TimeFrame == TimeFrames.Quarter) {
            IZusatz = IZusatz + ".quater_" + this._getQuarter(date);
            await this._setExtendObject(oS, IZusatz, "quater_" + this._getQuarter(date), "value.history." + TimeFrame, true, false, oS.output_unit, "number");
        }
        return IZusatz;

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
  * @param {object} value
  */
    async _setStartValue(oS, TimeFrame, value) {
        await this._setStateAsync(oS.alias + await this._getStartID(TimeFrame), this._roundto(value), true);
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
            await this._setStateAsync(oS.alias + startID, currentValue, true);
            return currentValue;
        }
        else {
            return Number(state.val);
        }
    }


    /**
  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
  * Using this method requires "common.message" property to be set to true in io-package.json
  * @param {ioBroker.Message} obj
  */
    onMessage(obj) {
        if (typeof obj === "object" && obj.message) {
            if (obj.command === "send") {
                // e.g. send email or pushover or whatever
                this.log.info("send command");

                // Send response in callback if required
                if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
            }
        }
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
