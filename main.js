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

const TimeFrames = {
    Minute: "Minute",
    Hour: "Hour",
    Day: "Day",
    Week: "Week",
    Month: "Month",
    Quarter: "Quarter",
    Year: "Year"
};

var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
            await this._timeFrameFinished(TimeFrames.Minute);
        });
        cron.schedule("0 * * * *", async () => {
            await this._timeFrameFinished(TimeFrames.Hour);
        });
        cron.schedule("0 0 * * *", async () => {
            await this._timeFrameFinished(TimeFrames.Day);
        });
        cron.schedule("0 0 * * 1", async () => {
            await this._timeFrameFinished(TimeFrames.Week);
        });
        cron.schedule("0 0 1 * *", async () => {
            await this._timeFrameFinished(TimeFrames.Month);
        });
        cron.schedule("0 0 1 */3 *", async () => {
            await this._timeFrameFinished(TimeFrames.Quarter);
        });
        cron.schedule("0 0 1 1 *", async () => {
            await this._timeFrameFinished(TimeFrames.Year);
        });
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
            if (id in this.dicDatas) {
                await this._publishCurrentValue(this.dicDatas[id], new Date(state.ts), await this._getNumberfromState(state));
            }
            else if (!state.ack && id.startsWith(this.namespace) && id.includes("_startValues.start_")) {
                const TimeFrame = id.substring(id.lastIndexOf("_") + 1);
                const idsplit = id.split(".");
                for (const oneoSID in this.dicDatas) {
                    /**@type {ObjectSettings} */
                    const oS = this.dicDatas[oneoSID];
                    if (oS.alias == idsplit[2]) {
                        this.log.warn(id + " changed, recalc Timeframe, old-Value: " + this._getStartValue(oS, TimeFrame) + " new-value: " + await this._getNumberfromState(state));
                        await this._calcCurrentTimeFrameValue(oS, new Date(), TimeFrame);
                        //mark ack
                        await this.setStateAsync(id, await this._getNumberfromState(state), true);
                    }
                }

            }
        }

    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
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
            await this._pushNewPreviousSates(oS, TimeFrame,  (oS.lastGoodValue - await this._getStartValue(oS, TimeFrame)), await this._getDateTimeInfoForPrevious(TimeFrame, date, 1));
            this.log.debug(oS.alias + " set startValue from TimeFrame " + TimeFrame + " to " + oS.lastGoodValue);
            await this._setStartValue(oS, TimeFrame, oS.lastGoodValue);
            await this._calcCurrentTimeFrameValue(oS, date, TimeFrame);
        }
    }



    /**
     * Get the Number from Iobroker State
     * @param {ioBroker.State | null | undefined} State
     * @returns {Promise<number>}
     */
    async _getNumberfromState(State) {
        if (State && State.val && Number(State.val) != Number.NaN) {
            return Number(State.val);
        }
        return 0;
    }

    /**
     * Read all Objects in iobroker and try to initial every Datapoint (only wenn custom set)
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
     * Try to Initial an Datapoint (if Custom Setting exists, otherwise it is uninitial)
     * @param {ioBroker.Object | null | undefined} iobrokerObject
     * */
    async _initialObject(iobrokerObject) {
        if (iobrokerObject && iobrokerObject != undefined) {
            // uninitialize ID
            if (iobrokerObject._id in this.dicDatas) {
                this.log.info("disable : " + iobrokerObject._id);
                await this._setExtendChannel(this.dicDatas[iobrokerObject._id], "", "disabled", true);
                await this.unsubscribeForeignStatesAsync(iobrokerObject._id);
                delete this.dicDatas[iobrokerObject._id];
            }

            // only do something when enabled
            if (iobrokerObject && iobrokerObject.common.custom && iobrokerObject.common.custom[this.namespace] && iobrokerObject.common.custom[this.namespace].enabled) {
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
                this.subscribeStates(oS.alias + "._startValues.*");
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
                if (oS.historyload_Detailed) {
                    iobrokerObject.common.custom[this.namespace].historyload_Detailed = false;
                    await this.setForeignObjectAsync(oS.id, iobrokerObject);
                    await this._readDetailedFromHistory_SQL(oS, oS.historyInstanz);
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
    async _pushNewPreviousSates(oS, TimeFrame,  TimeFrameValue, DateTimeInfo) {
        //Days before befüllen
        let iBeforeCount;
        //Die PreviousValues jeweils ein nach hinten schieben (von hinten anfangen um keine Daten zu verlieren)
        for (iBeforeCount = oS.beforeCount(TimeFrame); iBeforeCount > 1; iBeforeCount--) {
            const theValBefore = await this.getStateAsync(oS.alias + await this._GetObjectIdPrevious(oS, TimeFrame, iBeforeCount - 1));
            const theObjectBefore = await this.getObjectAsync(oS.alias + await this._GetObjectIdPrevious(oS, TimeFrame, iBeforeCount - 1));
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
        if (outputMultiplie) {
            value *= oS.output_multiplier;
        }
        if (value)
            value = Number((value).toFixed(10));
        else
            value = 0;
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
                const oldObject = await this.getObjectAsync(oS.alias + thePreviousID);
                let touseName = "no data yet";
                if (oldObject) {
                    touseName = oldObject.common.name.toString();
                }
                await this._setExtendObject(oS, await this._GetObjectIdPrevious(oS, TimeFrame, iBefore), touseName, "value.history." + TimeFrame, true, false, oS.output_unit, "number");
            }
            //Before Objecte die existieren aber nicht mehr aktiv sind auf diabled stellen
            let theObject = await this.getObjectAsync(oS.alias + await this._GetObjectIdPrevious(oS, TimeFrame, iBefore));
            while (theObject != null) {
                await this._setExtendObject(oS, await this._GetObjectIdPrevious(oS, TimeFrame, iBefore), theObject.common.name.toString(), "value.history.disabled", false, false, oS.output_unit, "number");
                iBefore++;
                theObject = await this.getObjectAsync(oS.alias + await this._GetObjectIdPrevious(oS, TimeFrame, iBefore));
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
     * Change or Create a iobroker Channel if necessary
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

        const newdate = new Date(theDate);
        if (TimeFrame == TimeFrames.Minute) {
            newdate.setMinutes(newdate.getMinutes() - beforeZähler);
        } else if (TimeFrame == TimeFrames.Hour) {
            newdate.setHours(newdate.getHours() - beforeZähler);
        } else if (TimeFrame == TimeFrames.Day) {
            newdate.setDate(newdate.getDate() - beforeZähler);
        } else if (TimeFrame == TimeFrames.Week) {
            newdate.setDate(newdate.getDate() - 7 * beforeZähler);
        } else if (TimeFrame == TimeFrames.Month) {
            newdate.setMonth(newdate.getMonth() - beforeZähler);
        } else if (TimeFrame == TimeFrames.Quarter) {
            newdate.setMonth(newdate.getMonth() - (beforeZähler * 3));
        } else if (TimeFrame == TimeFrames.Year) {
            newdate.setFullYear(newdate.getFullYear() - beforeZähler);
        }
        return "Data from " + await this._getTimeFrameInfo(TimeFrame, newdate);
    }


    /**
     * Build a string for DatapointName
     * @param {string} TimeFrame
     * @param {Date} theDate
     */
    async _getTimeFrameInfo(TimeFrame, theDate) {

        if (TimeFrame == TimeFrames.Minute) {
            return "minute " + theDate.toLocaleTimeString();
        } else if (TimeFrame == TimeFrames.Hour) {
            return "hour " + theDate.toLocaleTimeString();
        } else if (TimeFrame == TimeFrames.Day) {
            const MonthString = theDate.toLocaleString("en-us", { month: "long" });
            const DateNumber = theDate.getDate().toString().padStart(2, "0");
            return DateNumber + ". " + MonthString;
        } else if (TimeFrame == TimeFrames.Week) {
            const theKW = new KWInfo(theDate);
            return theKW.InfoString;
        }
        else if (TimeFrame == TimeFrames.Month) {
            const MonthString = theDate.toLocaleString("en-us", { month: "long" });
            return (theDate.getMonth() + 1).toString().padStart(2, "0") + "_" + MonthString;
        }
        else if (TimeFrame == TimeFrames.Quarter) {
            return "quarter " + await this._getQuarter(theDate);
        }
        else if (TimeFrame == TimeFrames.Year) {
            return "year " + theDate.getFullYear().toString();
        }
        return "";
    }

    /**
     * Build a substring for ObjectID
     * @param {string} TimeFrame
     * @param {Date} theDate
     */
    async _getTimeFrameObjectID(TimeFrame, theDate) {

        if (TimeFrame == TimeFrames.Minute) {
            return "minute_" + theDate.toLocaleTimeString();
        } else if (TimeFrame == TimeFrames.Hour) {
            return "hour_" + theDate.toLocaleTimeString();
        } else if (TimeFrame == TimeFrames.Day) {
            const DateNumber = theDate.getDate().toString().padStart(2, "0");
            return DateNumber;
        } else if (TimeFrame == TimeFrames.Week) {
            const theKW = new KWInfo(theDate);
            return "KW" + theKW.weekNumber.toString().padStart(2, "0");
        }
        else if (TimeFrame == TimeFrames.Month) {
            const MonthNumber = (theDate.getMonth() + 1).toString().padStart(2, "0");
            const MonthString = theDate.toLocaleString("en-us", { month: "long" });
            return MonthNumber + "_" + MonthString;
        }
        else if (TimeFrame == TimeFrames.Quarter) {
            return "quater_ " + this._getQuarter(theDate);
        }
        else if (TimeFrame == TimeFrames.Year) {
            return TimeFramesNumber.Year + "_Year_" + theDate.getFullYear();
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
            if (TimeFrame == TimeFrames.Year) {
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
    * @param {ObjectSettings} oS
    * @param {string} TimeFrame
    * @param {Date} date
    * */
    async _CreateAndGetObjectIdDetailedCurrent(oS, TimeFrame, date) {
        if (oS.detailed_current(TimeFrame)) {
            let mydetailedObjectId = "";
            let Checkdate = new Date()
            Checkdate.setHours(24)
            Checkdate.setMinutes(0)

            if (TimeFrame == TimeFrames.Year) {

            }
            else {
                mydetailedObjectId = mydetailedObjectId + "." + TimeFramesNumber[TimeFrame] + "_" + TimeFrame + "s";
                await this._setExtendChannel(oS, mydetailedObjectId, TimeFrame + "s", true);
                if (TimeFrame == TimeFrames.Day) {
                    Checkdate.setDate(Checkdate.getDate() - 7)
                    if (date >= Checkdate) {
                        let myDayNumber = date.getDay()
                        if (myDayNumber == 0)
                            myDayNumber = 7;
                        mydetailedObjectId = mydetailedObjectId + "." + myDayNumber + "_" + days[date.getDay()];
                        await this._setExtendObject(oS, mydetailedObjectId, await this._getTimeFrameInfo(TimeFrames.Day, date), "value.currenthistory." + TimeFrame, true, false, oS.output_unit, "number");
                        return mydetailedObjectId;
                    }
                }
                if (TimeFrame == TimeFrames.Week) {
                    Checkdate.setFullYear(Checkdate.getFullYear() - 1)

                    if (date >= Checkdate) {
                        {
                            const theKWInfo = new KWInfo(date);
                            mydetailedObjectId = mydetailedObjectId + "." + await this._getTimeFrameObjectID(TimeFrames.Week, date);
                            await this._setExtendObject(oS, mydetailedObjectId, await this._getTimeFrameInfo(TimeFrames.Week, date), "value.currenthistory." + TimeFrame, true, false, oS.output_unit, "number");
                            return mydetailedObjectId;

                        }
                    }
                }
                if (TimeFrame == TimeFrames.Month) {
                    Checkdate.setMonth(Checkdate.getMonth() + 1)
                    Checkdate.setDate(1)
                    Checkdate.setFullYear(Checkdate.getFullYear() - 1)
                    if (date >= Checkdate) {

                        mydetailedObjectId = mydetailedObjectId + "." + await this._getTimeFrameObjectID(TimeFrames.Month, date);
                        await this._setExtendObject(oS, mydetailedObjectId, await this._getTimeFrameInfo(TimeFrames.Month, date), "value.currenthistory." + TimeFrame, true, false, oS.output_unit, "number");
                        return mydetailedObjectId;
                    }
                }

                if (TimeFrame == TimeFrames.Quarter) {
                    Checkdate.setMonth(Checkdate.getMonth() + 3 - (Checkdate.getMonth() % 3))
                    Checkdate.setDate(1)
                    Checkdate.setFullYear(Checkdate.getFullYear() - 1)
                    if (date >= Checkdate) {

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
        await this._setStateRoundedAsync(oS, await this._getStartID(TimeFrame), value, false);
    }
    /**
     * Returns the startid
     * @param {string} TimeFrame
     */
    async _getStartID(TimeFrame) {
        return "._startValues.start_" + TimeFramesNumber[TimeFrame] + "_" + TimeFrame;
    }
    /**
     *
     * @param {ObjectSettings} oS
     * @param {string} TimeFrame
     * @returns {Promise<number>}
     */
    async _getStartValue(oS, TimeFrame) {
        //Create the DP if not exists
        const startID = await this._getStartID(TimeFrame);

        await this._setExtendObject(oS, startID, "start_" + TimeFrame, "", true, true, oS.iobrokerObject.common.unit, "number");
        //set startData if not set
        const state = await this.getStateAsync(oS.alias + startID);
        if (!state || state.val == null || state.val == undefined) {
            const currentValue = await this._getNumberfromState(await this.getForeignStateAsync(oS.id));
            await this._setStateRoundedAsync(oS, startID, currentValue, false);
            return currentValue;
        }
        else {
            return Number(state.val);
        }
    }

    /**
     * read DetailedData from History Instanz and save it in the Datastructure
     * @param {ObjectSettings} oS
     * @param {string} historyInstanz
     */
    async _readDetailedFromHistory_SQL(oS, historyInstanz) {
        this.log.info("HistoryAnalyseDetailed " + oS.id + ": Frage von " + historyInstanz + " die Daten der letzten 10 jahre ab (Wenn keine weiteren Logs, dann exisiter vielleicht die Instanz nicht oder ist deaktiviert)");
        const end = Date.now();
        const start = end - 10 * 365 * 24 * 3600000;

        const gethistory = await this.sendToAsync(historyInstanz, "getHistory", {
            id: oS.id,
            options: {
                end: end,
                start: start,
                count: 100000000,
                aggregate: "none"
            }
        });

        if (gethistory) {
            if (gethistory["error"]) {
                this.log.error("HistoryAnalyseDetailed " + oS.id + ": Fehler bei Datenlesen: " + gethistory["error"]);
            }
            else if (gethistory["result"]) {
                this.log.info("HistoryAnalyseDetailed " + oS.id + ": wandle SQL Datensätze um: " + gethistory["result"].length);
                const allData = [];
                for (const one in gethistory["result"]) {
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
     * Use the Data to Fill the Datastructure Detailed
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

        let TimeFrameValueData = {};
        for (let TimeFrame in TimeFrames) {
            TimeFrameValueData[TimeFrame] = []
        }

        let LastHis;
        for (const zahler in HistoryDataList) {
            const myHis = HistoryDataList[zahler];
            if (!LastHis) {

                lastGoodValue = myHis.hisval;
                for (const TimeFrame in TimeFrames) {
                    startvalues[TimeFrame] = myHis.hisval;


                }
            }
            else {
                //TimeframeChange erkennen
                let testDate = new Date(myHis.hisdate);
                while (testDate.getDate() > LastHis.hisdate.getDate() || testDate.getMonth() > LastHis.hisdate.getMonth() || testDate.getFullYear() > LastHis.hisdate.getFullYear()) {
                    testDate.setDate(testDate.getDate() - 1);
                    await this._CreateAndSetObjectIdDetailed(oS, TimeFrames.Day, testDate, (lastGoodValue - startvalues[TimeFrames.Day]));
                    TimeFrameValueData[TimeFrames.Day].push({ date: testDate, value: (lastGoodValue - startvalues[TimeFrames.Day]) })

                    startvalues[TimeFrames.Day] = lastGoodValue;
                    DPfilled++;
                }

                testDate = new Date(myHis.hisdate);

                let testDateKWInfo = new KWInfo(testDate);
                const LastHisKWInfo = new KWInfo(LastHis.hisdate);

                while (testDateKWInfo.weekNumber > LastHisKWInfo.weekNumber || testDateKWInfo.yearOfThursday > LastHisKWInfo.yearOfThursday) {
                    testDate.setDate(testDate.getDate() - 7);
                    testDateKWInfo = new KWInfo(testDate);
                    await this._CreateAndSetObjectIdDetailed(oS, TimeFrames.Week, testDate, (lastGoodValue - startvalues[TimeFrames.Week]));
                    TimeFrameValueData[TimeFrames.Week].push({ date: testDate, value: (lastGoodValue - startvalues[TimeFrames.Week]) })

                    startvalues[TimeFrames.Week] = lastGoodValue;
                    DPfilled++;
                }

                testDate = new Date(myHis.hisdate);
                while (testDate.getMonth() > LastHis.hisdate.getMonth() || testDate.getFullYear() > LastHis.hisdate.getFullYear()) {
                    testDate.setMonth(testDate.getMonth() - 1);
                    await this._CreateAndSetObjectIdDetailed(oS, TimeFrames.Month, testDate, (lastGoodValue - startvalues[TimeFrames.Month]));
                    TimeFrameValueData[TimeFrames.Month].push({ date: testDate, value: (lastGoodValue - startvalues[TimeFrames.Month]) })

                    startvalues[TimeFrames.Month] = lastGoodValue;

                    DPfilled++;
                }

                testDate = new Date(myHis.hisdate);
                while (Math.floor(testDate.getMonth() / 3) > Math.floor(LastHis.hisdate.getMonth() / 3) || testDate.getFullYear() > LastHis.hisdate.getFullYear()) {
                    testDate.setMonth(testDate.getMonth() - 3);
                    await this._CreateAndSetObjectIdDetailed(oS, TimeFrames.Quarter, testDate, (lastGoodValue - startvalues[TimeFrames.Quarter]));
                    TimeFrameValueData[TimeFrames.Quarter].push({ date: testDate, value: (lastGoodValue - startvalues[TimeFrames.Quarter]) })

                    startvalues[TimeFrames.Quarter] = lastGoodValue;
                    DPfilled++;
                }

                testDate = new Date(myHis.hisdate);
                while (testDate.getFullYear() > LastHis.hisdate.getFullYear()) {
                    testDate.setFullYear(testDate.getFullYear() - 1);
                    await this._CreateAndSetObjectIdDetailed(oS, TimeFrames.Year, testDate, (lastGoodValue - startvalues[TimeFrames.Year]));
                    TimeFrameValueData[TimeFrames.Year].push({ date: testDate, value: (lastGoodValue - startvalues[TimeFrames.Year]) })

                    startvalues[TimeFrames.Year] = lastGoodValue;
                    DPfilled++;
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
                    else {
                        const theAnpassung = lastGoodValue - FirstWrongValue;


                        this.log.warn("HistoryAnalyseDetailed " + oS.id + ": Counter wurde scheinbar resetet! Reset von " + lastGoodValue + " nach " + FirstWrongValue + " passe alle Startwerte an");
                        lastGoodValue = myHis.hisval;
                        FirstWrongValue = NaN;
                        resetsDetected++;
                        for (const TimeFrame in TimeFrames) {
                            startvalues[TimeFrame] = startvalues[TimeFrame] - theAnpassung;
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

        for (let TimeFrame in TimeFrames) {
            /** @type {Array<{date:Date, value:Number}>} */
            let MyTimeFrameData = TimeFrameValueData[TimeFrame]
            for (let zahler = oS.beforeCount(TimeFrame); zahler >= 1; zahler--) {
                if (MyTimeFrameData.length > zahler ) {
                    await this._pushNewPreviousSates(oS, TimeFrame,  MyTimeFrameData[MyTimeFrameData.length - zahler].value, await this._getDateTimeInfoForPrevious(TimeFrame, MyTimeFrameData[MyTimeFrameData.length - zahler].date, 0))
                }
            }

        }



        this.log.info("HistoryAnalyseDetailed " + oS.id + ": Finished HistoryAnalyse. Created DetailedDatapoints: " + DPfilled + " Resets detected: " + resetsDetected);
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
